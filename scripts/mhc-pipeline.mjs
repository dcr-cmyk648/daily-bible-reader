#!/usr/bin/env node

import {spawn, spawnSync} from "node:child_process";
import {access, appendFile, mkdir, readFile, readdir, rename, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  AUTONOMOUS_GENERATION_MODE,
  FACT_PROMPT_VERSION,
  LEGACY_PROMPT_VERSION,
  MHC_SOURCE,
  PROMPT_VERSION,
  buildFactBriefJobSpec,
  buildBookIntroJobSpec,
  buildChapterJobSpec,
  exportBookIntroRuntime,
  exportChapterRuntime,
  findSourceReportingPhrase,
  hydrateFactBriefEvidence,
  jobFingerprint,
  normalizeBookChapter,
  normalizedBatchHash,
  readSwordModule,
  renderAutonomousWriterPrompt,
  renderFactExtractionPrompt,
  renderWorkerPrompt,
  resolveScheduledBatch,
  resolveScheduledReading,
  resolveScheduledWindow,
  requireFullCorpusConfirmation,
  requireAutonomousAdmission,
  sha256,
  shouldSkipCompletedJob,
  validateBookIntroOutput,
  validateChapterOutput,
  validateFactBoundChapterOutput,
  validateFactBrief
} from "./lib/mhc-pipeline.mjs";
import {validateAgainstSchema} from "./lib/schema-validator.mjs";

const ROOT = process.cwd();
const PRIVATE_ROOT = path.join(ROOT, "private-commentary", "mhc");
const RAW_ROOT = path.join(ROOT, "research", "raw", "matthew-henry", "crosswire");
const ARCHIVE_PATH = path.join(RAW_ROOT, "MHC-2.2.zip");
const EXTRACT_ROOT = path.join(RAW_ROOT, "MHC-2.2");
const MODULE_ROOT = path.join(EXTRACT_ROOT, "modules", "comments", "zcom4", "mhc");
const SOURCE_MANIFEST_PATH = path.join(PRIVATE_ROOT, "source-manifest.json");
const PIPELINE_MANIFEST_PATH = path.join(PRIVATE_ROOT, "pipeline-manifest.json");
const REVIEW_QUEUE_PATH = path.join(PRIVATE_ROOT, "review-queue.jsonl");
const ACTIVE_PLAN_PATH = path.join(ROOT, "fixtures", "pilot-content", "plan.json");
const ACTIVE_CONFIG_PATH = path.join(ROOT, "fixtures", "pilot-content", "app-config.json");
const BOUNDARIES_PATH = path.join(ROOT, "config", "mhc-source-boundaries.json");
const PROMPT_PATH = path.join(ROOT, "prompts", "mhc-autonomous-writer-v2.md");
const FACT_PROMPT_PATH = path.join(ROOT, "prompts", "mhc-fact-extractor-v5.md");
const LEGACY_PROMPT_PATH = path.join(ROOT, "prompts", "mhc-worker-v11.md");
const CHAPTER_SCHEMA_PATH = path.join(ROOT, "schemas", "mhc-commentary-output.schema.json");
const FACT_BRIEF_SCHEMA_PATH = path.join(ROOT, "schemas", "mhc-fact-brief.schema.json");
const LEGACY_CHAPTER_SCHEMA_PATH = path.join(ROOT, "schemas", "mhc-commentary-output-v1.schema.json");
const BOOK_INTRO_SCHEMA_PATH = path.join(ROOT, "schemas", "mhc-book-intro-output.schema.json");
const NORMALIZED_SCHEMA_PATH = path.join(ROOT, "schemas", "mhc-normalized-source.schema.json");
const RUNTIME_SCHEMA_PATH = path.join(ROOT, "schemas", "mhc-runtime.schema.json");
const WINDOW_STORE_SCHEMA_PATH = path.join(ROOT, "schemas", "mhc-window-store.schema.json");
const ACTIVATION_SCHEMA_PATH = path.join(ROOT, "schemas", "mhc-activation.schema.json");
const ENSURE_SCHEMA_PATH = path.join(ROOT, "schemas", "mhc-ensure.schema.json");
const WINDOW_STORE_ROOT = path.join(PRIVATE_ROOT, "stores", "current-window");
const LIBRARY_STORE_ROOT = path.join(PRIVATE_ROOT, "stores", "library");
const ACTIVATION_STORE_ROOT = path.join(PRIVATE_ROOT, "stores", "activations");
const ENSURE_STORE_ROOT = path.join(PRIVATE_ROOT, "stores", "ensure-requests");
const PILOT_MODELS = ["gpt-5.3-codex-spark", "gpt-5.6-luna"];
const SPARK_MODEL = "gpt-5.3-codex-spark";
// Keep validated fact-ledger caches independent of downstream writer-admission revisions.
const FACT_GENERATION_MODE = "spark-autonomous-chunked-two-stage/v2";

function usage() {
  return `Matthew Henry preprocessing pipeline

Usage:
  node scripts/mhc-pipeline.mjs acquire [--retrieved-at YYYY-MM-DD]
  node scripts/mhc-pipeline.mjs normalize --book GEN --chapter 1
  node scripts/mhc-pipeline.mjs preflight
  node scripts/mhc-pipeline.mjs generate --book GEN --chapter 1 --model MODEL [--dry-run]
  node scripts/mhc-pipeline.mjs generate --book GEN --book-intro --model MODEL [--dry-run]
  node scripts/mhc-pipeline.mjs pilot --book GEN --chapter 1 [--dry-run]
  node scripts/mhc-pipeline.mjs validate --book GEN --chapter 1 --model MODEL
  node scripts/mhc-pipeline.mjs compare --book GEN --chapter 1
  node scripts/mhc-pipeline.mjs export --book GEN --chapter 1 --model MODEL
  node scripts/mhc-pipeline.mjs export --book GEN --book-intro --model MODEL
  node scripts/mhc-pipeline.mjs schedule-next [--today YYYY-MM-DD] [--days-ahead 0|1] [--dry-run]
  node scripts/mhc-pipeline.mjs schedule-window [--today YYYY-MM-DD] [--days-ahead 0|1|2] [--reading-count 1..14] [--dry-run]
  node scripts/mhc-pipeline.mjs activate --request PATH [--dry-run]
  node scripts/mhc-pipeline.mjs ensure --request PATH [--dry-run]

Future full-corpus mode is locked unless both flags are present:
  node scripts/mhc-pipeline.mjs generate --all --confirm-full-corpus --model MODEL
`;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {command, all: false, confirmFullCorpus: false, dryRun: false, bookIntro: false};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--all") options.all = true;
    else if (arg === "--confirm-full-corpus") options.confirmFullCorpus = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--book-intro") options.bookIntro = true;
    else if (["--book", "--chapter", "--model", "--retrieved-at", "--max-retries", "--today", "--days-ahead", "--reading-count", "--request"].includes(arg)) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (rest[index + 1] === undefined) throw new Error(`${arg} requires a value.`);
      options[key] = rest[++index];
    } else throw new Error(`Unknown argument ${arg}.`);
  }
  if (options.book) options.book = String(options.book).toUpperCase();
  if (options.chapter !== undefined) options.chapter = Number(options.chapter);
  if (options.maxRetries !== undefined) options.maxRetries = Number(options.maxRetries);
  if (options.daysAhead !== undefined) options.daysAhead = Number(options.daysAhead);
  if (options.readingCount !== undefined) options.readingCount = Number(options.readingCount);
  return options;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), {recursive: true});
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
}

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeBytesAtomic(filePath, bytes) {
  await mkdir(path.dirname(filePath), {recursive: true});
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );
  await writeFile(temporaryPath, bytes, {encoding: "utf8", mode: 0o600});
  await rename(temporaryPath, filePath);
}

async function writeJsonAtomic(filePath, value) {
  const bytes = jsonBytes(value);
  await writeBytesAtomic(filePath, bytes);
  return {bytes, sha256: sha256(bytes)};
}

async function writeContentAddressed(filePath, bytes, expectedSha256) {
  if (await exists(filePath)) {
    const prior = await readFile(filePath, "utf8");
    if (sha256(prior) !== expectedSha256 || prior !== bytes) {
      throw new Error(`Existing content-addressed file failed integrity verification: ${path.relative(ROOT, filePath)}`);
    }
    return;
  }
  await writeBytesAtomic(filePath, bytes);
}

function storePlanKey(planVersion) {
  const slug = String(planVersion || "plan").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "plan";
  return `${slug}-${sha256(String(planVersion || "")).slice(0, 12)}`;
}

async function fileHash(filePath) {
  return sha256(await readFile(filePath));
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {cwd: ROOT, encoding: "utf8", ...options});
  if (result.error || result.status !== 0) {
    const detail = [result.error && result.error.message, result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : "."}`);
  }
  return result;
}

function isoDate(value) {
  const date = String(value || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error("Retrieval date must use YYYY-MM-DD.");
  }
  return date;
}

async function acquire(options) {
  await mkdir(RAW_ROOT, {recursive: true});
  if (!(await exists(ARCHIVE_PATH))) {
    runChecked("curl", ["-L", "--fail", "--silent", "--show-error", MHC_SOURCE.downloadUrl, "-o", ARCHIVE_PATH]);
  }
  const archiveSha256 = await fileHash(ARCHIVE_PATH);
  const boundaries = await readJson(BOUNDARIES_PATH);
  if (archiveSha256 !== boundaries.archiveSha256) {
    throw new Error(`Downloaded archive hash ${archiveSha256} does not match the reviewed boundary map ${boundaries.archiveSha256}.`);
  }
  if (!(await exists(path.join(MODULE_ROOT, "ot.bzz")))) {
    await mkdir(EXTRACT_ROOT, {recursive: true});
    runChecked("unzip", ["-q", ARCHIVE_PATH, "-d", EXTRACT_ROOT]);
  }
  const decoded = await readSwordModule(MODULE_ROOT);
  const prior = await exists(SOURCE_MANIFEST_PATH) ? await readJson(SOURCE_MANIFEST_PATH) : null;
  const moduleFiles = ["ot.bzs", "ot.bzv", "ot.bzz", "nt.bzs", "nt.bzv", "nt.bzz"];
  const fileHashes = {};
  for (const filename of moduleFiles) fileHashes[filename] = await fileHash(path.join(MODULE_ROOT, filename));
  fileHashes["mhc.conf"] = await fileHash(path.join(EXTRACT_ROOT, "mods.d", "mhc.conf"));
  const manifest = {
    schema_version: "mhc-source-manifest/v1",
    source_id: MHC_SOURCE.sourceId,
    work_title: MHC_SOURCE.workTitle,
    source_url: MHC_SOURCE.sourceUrl,
    download_url: MHC_SOURCE.downloadUrl,
    module_name: MHC_SOURCE.moduleName,
    module_version: decoded.config.Version,
    source_version_date: decoded.config.SwordVersionDate,
    retrieved_at: prior && prior.retrieved_at || isoDate(options.retrievedAt),
    license: MHC_SOURCE.license,
    archive_path: path.relative(ROOT, ARCHIVE_PATH),
    archive_sha256: archiveSha256,
    archive_bytes: (await stat(ARCHIVE_PATH)).size,
    source_format: MHC_SOURCE.sourceFormat,
    versification: decoded.config.Versification,
    decoded_book_count: decoded.books.size,
    module_file_sha256: fileHashes,
    selection_note: "Selected over CCEL XML because the repository already designates exact CrossWire MHC 2.2 as preferred, CrossWire states a public-domain distribution license, and the SWORD index preserves shared verse-range granularity. CCEL ThML was evaluated as an explicit-structure fallback but its container policy is more qualified.",
    ccel_evaluation: {
      work_url: "https://ccel.org/ccel/henry/mhc",
      volume_i_xml_url: "https://ccel.org/ccel/h/henry/mhc1.xml",
      format: "ThML/XML with explicit Genesis introduction and chapter divisions",
      decision: "Not selected; retained only as a structure and lineage comparison, not as pipeline input."
    }
  };
  await writeJson(SOURCE_MANIFEST_PATH, manifest);
  process.stdout.write(`Verified ${manifest.work_title}, CrossWire ${manifest.module_version}, SHA-256 ${archiveSha256}.\n`);
  return manifest;
}

function normalizedPaths(bookId, chapter) {
  const stem = String(chapter).padStart(3, "0");
  return {
    units: path.join(PRIVATE_ROOT, "normalized", bookId, `${stem}.jsonl`),
    exceptions: path.join(PRIVATE_ROOT, "exceptions", bookId, `${stem}.jsonl`),
    manifest: path.join(PRIVATE_ROOT, "normalized", bookId, `${stem}.manifest.json`)
  };
}

async function loadNormalized(bookId, chapter) {
  const paths = normalizedPaths(bookId, chapter);
  const units = (await readFile(paths.units, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
  const manifest = await readJson(paths.manifest);
  return {paths, units, manifest};
}

async function normalize(options) {
  const bookId = options.book || "GEN";
  const chapter = options.chapter || 1;
  if (!Number.isInteger(chapter) || chapter < 1) throw new Error("--chapter must be a positive integer.");
  const sourceManifest = await exists(SOURCE_MANIFEST_PATH) ? await readJson(SOURCE_MANIFEST_PATH) : await acquire(options);
  if (await fileHash(ARCHIVE_PATH) !== sourceManifest.archive_sha256) throw new Error("The preserved source archive no longer matches its source manifest.");
  const [decodedModule, boundaries, schema] = await Promise.all([
    readSwordModule(MODULE_ROOT), readJson(BOUNDARIES_PATH), readJson(NORMALIZED_SCHEMA_PATH)
  ]);
  const result = normalizeBookChapter({decodedModule, sourceManifest, boundaries, bookId, chapter, includeBookIntro: chapter === 1});
  result.units.forEach((unit, index) => {
    const errors = validateAgainstSchema(unit, schema, {instancePath: `$[${index}]`});
    if (errors.length) throw new Error(`Normalized source unit failed schema validation:\n- ${errors.join("\n- ")}`);
  });
  const paths = normalizedPaths(bookId, chapter);
  await mkdir(path.dirname(paths.units), {recursive: true});
  await mkdir(path.dirname(paths.exceptions), {recursive: true});
  await writeFile(paths.units, `${result.units.map((unit) => JSON.stringify(unit)).join("\n")}\n`, {encoding: "utf8", mode: 0o600});
  await writeFile(paths.exceptions, result.exceptions.length
    ? `${result.exceptions.map((exception) => JSON.stringify(exception)).join("\n")}\n`
    : "", {encoding: "utf8", mode: 0o600});
  const manifest = {
    schema_version: "mhc-normalization-manifest/v1",
    source_id: sourceManifest.source_id,
    source_archive_sha256: sourceManifest.archive_sha256,
    normalized_schema_version: result.units[0] && result.units[0].schema_version,
    book_id: bookId,
    chapter,
    indexed_verse_count: result.chapterIndex.verseEntries.length,
    unit_count: result.units.length,
    source_unit_ids: result.units.map((unit) => unit.source_unit_id),
    normalized_batch_sha256: normalizedBatchHash(result.units),
    exception_count: result.exceptions.length,
    exceptions_path: path.relative(PRIVATE_ROOT, paths.exceptions)
  };
  await writeJson(paths.manifest, manifest);
  process.stdout.write(`Normalized ${bookId} ${chapter}: ${manifest.indexed_verse_count} verses, ${manifest.unit_count} source units, ${manifest.exception_count} review exception(s).\n`);
  return {sourceManifest, ...result, paths, manifest};
}

function parseModelCatalog(stdout) {
  const parsed = JSON.parse(stdout);
  return new Map((parsed.models || []).map((model) => [model.slug, model]));
}

function codexPreflight() {
  const login = runChecked("codex", ["login", "status"]);
  const loginText = `${login.stdout}\n${login.stderr}`;
  if (!/Logged in using ChatGPT/i.test(loginText) || /API key/i.test(loginText)) {
    throw new Error("Codex CLI authentication is not confirmed as ChatGPT login. Refusing generation; no API-key fallback is permitted.");
  }
  const catalogResult = runChecked("codex", ["debug", "models"]);
  const catalog = parseModelCatalog(catalogResult.stdout);
  return {
    authentication: "ChatGPT",
    cliVersion: runChecked("codex", ["--version"]).stdout.trim(),
    models: PILOT_MODELS.map((slug) => ({
      slug,
      available: catalog.has(slug) || slug === SPARK_MODEL,
      resolution: catalog.has(slug) ? "catalog" : slug === SPARK_MODEL ? "exact_slug" : "unavailable",
      catalog: catalog.get(slug) || null
    })),
    catalog
  };
}

function assertRequestedModelAvailable(auth, model) {
  if (auth.catalog.has(model) || model === SPARK_MODEL) return;
  throw new Error(`Requested model ${model} is unavailable in the installed Codex CLI catalog.`);
}

async function preflight() {
  const result = codexPreflight();
  process.stdout.write(`${result.cliVersion}; authenticated with ${result.authentication}.\n`);
  result.models.forEach((model) => process.stdout.write(`${model.slug}: ${model.available ? `available via ${model.resolution}` : "unavailable"}; standard speed enforced by disabling fast_mode.\n`));
  return result;
}

async function loadPipelineManifest() {
  if (await exists(PIPELINE_MANIFEST_PATH)) return readJson(PIPELINE_MANIFEST_PATH);
  return {schema_version: "mhc-pipeline-manifest/v1", prompt_version: PROMPT_VERSION, jobs: []};
}

async function savePipelineJob(jobRecord) {
  const manifest = await loadPipelineManifest();
  manifest.jobs.forEach((job) => {
    if (job.job_id === jobRecord.job_id && job.worker_model === jobRecord.worker_model &&
        job.fingerprint !== jobRecord.fingerprint && job.status === "completed") {
      job.status = "superseded";
      job.replaced_by_fingerprint = jobRecord.fingerprint;
    }
  });
  const index = manifest.jobs.findIndex((job) => job.job_id === jobRecord.job_id &&
    job.worker_model === jobRecord.worker_model && job.fingerprint === jobRecord.fingerprint);
  if (index >= 0) manifest.jobs[index] = {...manifest.jobs[index], ...jobRecord};
  else manifest.jobs.push(jobRecord);
  manifest.updated_at = new Date().toISOString();
  await writeJson(PIPELINE_MANIFEST_PATH, manifest);
  return manifest;
}

async function queueReview(record) {
  await mkdir(path.dirname(REVIEW_QUEUE_PATH), {recursive: true});
  await appendFile(REVIEW_QUEUE_PATH, `${JSON.stringify({...record, queued_at: new Date().toISOString()})}\n`, {encoding: "utf8", mode: 0o600});
}

function transientFailure(text) {
  return /(?:timed? out|timeout|temporar|connection|network|rate.?limit|429|502|503|504|service unavailable|try again)/i.test(String(text || ""));
}

function codexExecArgs({model, schemaPath, outputPath, cwd}) {
  return [
    "--ask-for-approval", "never", "exec", "--ephemeral", "--ignore-user-config", "--disable", "fast_mode",
    "--disable", "multi_agent", "--disable", "multi_agent_v2",
    "--skip-git-repo-check", "--sandbox", "read-only",
    "--cd", cwd, "--model", model, "--output-schema", schemaPath,
    "--output-last-message", outputPath, "-"
  ];
}

function runCodex({model, schemaPath, outputPath, prompt, cwd}) {
  const args = codexExecArgs({model, schemaPath, outputPath, cwd});
  return new Promise((resolve) => {
    const child = spawn("codex", args, {cwd, stdio: ["pipe", "pipe", "pipe"]});
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") stderr += `\nstdin error: ${error.message}`;
    });
    child.on("error", (error) => resolve({status: null, stdout, stderr, error}));
    child.on("close", (status) => resolve({status, stdout, stderr, error: null}));
    child.stdin.end(prompt);
  });
}

async function validateOutputFile({kind, outputPath, schema, units, bookId, chapter, verseCount, metadata}) {
  try {
    const output = await readJson(outputPath);
    const validation = kind === "book_intro"
      ? validateBookIntroOutput(output, {schema, units, bookId, expectedMetadata: metadata})
      : validateChapterOutput(output, {schema, units, bookId, chapter, verseCount, expectedMetadata: metadata});
    return {output, validation};
  } catch (error) {
    return {output: null, validation: {valid: false, errors: [error.message], warnings: []}};
  }
}

function renderValidationRepairPrompt({prompt, output, validation}) {
  return `${prompt}\n\n## Deterministic validation repair\n\nThe prior JSON failed the controller checks below. Return the entire corrected JSON object, not a patch or explanation. Make the smallest possible correction for the listed errors. Preserve every exact job-metadata value, verse record, citation boundary, required identity/relationship, and all wording that already satisfies the contract. Do not remove a required term while fixing another defect. Re-read the complete result for the same defect elsewhere.\n\nValidation errors:\n${JSON.stringify(validation.errors || [], null, 2)}\n\nPrior JSON:\n${JSON.stringify(output, null, 2)}\n`;
}

function applyReviewCorrections({output, review, expectedReadingId, jobSpec, fingerprint, baseOutputSha256}) {
  if (!review || review.schema_version !== "mhc-human-review-overrides/v1") {
    throw new Error("Matthew Henry review overrides must use mhc-human-review-overrides/v1.");
  }
  if (review.reading_id !== expectedReadingId || review.job_id !== jobSpec.metadata.job_id ||
      review.fingerprint !== fingerprint || review.prompt_version !== jobSpec.metadata.prompt_version ||
      review.base_output_sha256 !== baseOutputSha256) {
    throw new Error("Matthew Henry review overrides do not match the exact reading, job, prompt, fingerprint, and base output.");
  }
  if (!/^20\d{2}-\d{2}-\d{2}T/.test(String(review.reviewed_at || "")) || !review.reviewer ||
      !["in_review", "changes_requested", "approved"].includes(review.status) ||
      !Array.isArray(review.corrections) || !review.corrections.length) {
    throw new Error("Matthew Henry review override metadata is incomplete.");
  }
  const reviewed = structuredClone(output);
  const records = new Map((reviewed.records || []).map((record) => [record.verse_id, record]));
  const seen = new Set();
  for (const correction of review.corrections) {
    if (!correction || Object.keys(correction).some((key) => !["verse_id", "blurb", "reason"].includes(key)) ||
        !records.has(correction.verse_id) || seen.has(correction.verse_id) ||
        typeof correction.blurb !== "string" || !correction.blurb.trim() ||
        typeof correction.reason !== "string" || !correction.reason.trim()) {
      throw new Error("Matthew Henry review corrections must uniquely replace only an existing verse blurb with a recorded reason.");
    }
    records.get(correction.verse_id).blurb = correction.blurb.trim();
    seen.add(correction.verse_id);
  }
  return {
    output: reviewed,
    humanReview: {
      status: review.status,
      reviewed_at: review.reviewed_at,
      reviewer: review.reviewer,
      corrected_verse_ids: [...seen],
      findings: review.corrections.map((correction) => `${correction.verse_id}: ${correction.reason}`),
      approval: review.status === "approved" ? "approved" : null
    }
  };
}

async function applyReviewOverrideFile({overridePath, outputPath, output, jobDir, jobSpec, fingerprint,
  expectedReadingId, kind, schema, units, bookId, chapter, verseCount}) {
  if (!overridePath || !(await exists(overridePath))) return null;
  const resolvedOverridePath = path.resolve(overridePath);
  if (!resolvedOverridePath.startsWith(`${PRIVATE_ROOT}${path.sep}`)) {
    throw new Error("Matthew Henry review overrides must remain in private commentary storage.");
  }
  const [review, baseBytes] = await Promise.all([readJson(resolvedOverridePath), readFile(outputPath, "utf8")]);
  const applied = applyReviewCorrections({
    output,
    review,
    expectedReadingId,
    jobSpec,
    fingerprint,
    baseOutputSha256: sha256(baseBytes)
  });
  const reviewedOutputPath = path.join(jobDir, "reviewed-output.json");
  await writeJson(reviewedOutputPath, applied.output);
  const checked = await validateOutputFile({
    kind,
    outputPath: reviewedOutputPath,
    schema,
    units,
    bookId,
    chapter,
    verseCount,
    metadata: jobSpec.metadata
  });
  await writeJson(path.join(jobDir, "review-validation.json"), checked.validation);
  await writeJson(path.join(jobDir, "review-applied.json"), {
    ...review,
    reviewed_output_sha256: sha256(await readFile(reviewedOutputPath, "utf8")),
    validation_status: checked.validation.valid ? "valid" : "invalid"
  });
  return {...checked, outputPath: reviewedOutputPath, humanReview: applied.humanReview};
}

async function generateLegacyOne(options) {
  const bookId = options.book || "GEN";
  const chapter = options.chapter || 1;
  const kind = options.bookIntro ? "book_intro" : "chapter";
  const model = options.model;
  if (!model) throw new Error("--model is required.");
  const auth = codexPreflight();
  assertRequestedModelAvailable(auth, model);
  const sourceManifest = await readJson(SOURCE_MANIFEST_PATH);
  const normalized = await loadNormalized(bookId, chapter);
  let generatedAt = new Date().toISOString();
  let jobSpec = kind === "book_intro"
    ? buildBookIntroJobSpec({units: normalized.units, sourceManifest, model, bookId, generatedAt})
    : buildChapterJobSpec({
      units: normalized.units,
      sourceManifest,
      model,
      bookId,
      chapter,
      verseCount: normalized.manifest.indexed_verse_count,
      generatedAt,
      promptVersion: LEGACY_PROMPT_VERSION
    });
  const fingerprint = jobFingerprint(jobSpec.metadata);
  const jobDir = path.join(PRIVATE_ROOT, "jobs", jobSpec.metadata.job_id, model, fingerprint.slice(0, 16));
  const priorRequestPath = path.join(jobDir, "request.json");
  if (await exists(priorRequestPath)) {
    const priorRequest = await readJson(priorRequestPath);
    if (priorRequest.fingerprint === fingerprint && priorRequest.metadata && priorRequest.metadata.generation_timestamp) {
      generatedAt = priorRequest.metadata.generation_timestamp;
      jobSpec = kind === "book_intro"
        ? buildBookIntroJobSpec({units: normalized.units, sourceManifest, model, bookId, generatedAt})
        : buildChapterJobSpec({units: normalized.units, sourceManifest, model, bookId, chapter,
          verseCount: normalized.manifest.indexed_verse_count, generatedAt,
          promptVersion: LEGACY_PROMPT_VERSION});
    }
  }
  const schemaPath = kind === "book_intro" ? BOOK_INTRO_SCHEMA_PATH : CHAPTER_SCHEMA_PATH;
  const [template, schema] = await Promise.all([readFile(LEGACY_PROMPT_PATH, "utf8"), readJson(schemaPath)]);
  const prompt = renderWorkerPrompt(template, jobSpec, kind);
  const outputPath = path.join(jobDir, "raw-output.json");
  await mkdir(jobDir, {recursive: true});
  await writeFile(path.join(jobDir, "prompt.txt"), prompt, {encoding: "utf8", mode: 0o600});
  await writeJson(path.join(jobDir, "request.json"), {kind, fingerprint, metadata: jobSpec.metadata});

  const priorManifest = await loadPipelineManifest();
  const existing = await exists(outputPath)
    ? await validateOutputFile({kind, outputPath, schema, units: normalized.units, bookId, chapter,
      verseCount: normalized.manifest.indexed_verse_count, metadata: jobSpec.metadata})
    : null;
  if (shouldSkipCompletedJob(priorManifest, jobSpec.metadata, existing && existing.validation)) {
    process.stdout.write(`Skipped completed source-matching job ${jobSpec.metadata.job_id} with ${model}.\n`);
    return {...existing, jobSpec, fingerprint, jobDir, skipped: true};
  }
  if (options.dryRun) {
    process.stdout.write(`Dry run prepared ${path.relative(ROOT, jobDir)}; Codex was not invoked.\n`);
    return {jobSpec, fingerprint, jobDir, dryRun: true};
  }

  const maxRetries = Number.isInteger(options.maxRetries) ? Math.max(0, Math.min(4, options.maxRetries)) : 2;
  let checked = null;
  let validatedOutputPath = outputPath;
  let humanReview = null;
  if (existing && existing.output && options.reviewOverridePath) {
    const reviewed = await applyReviewOverrideFile({
      overridePath: options.reviewOverridePath,
      outputPath,
      output: existing.output,
      jobDir,
      jobSpec,
      fingerprint,
      expectedReadingId: options.expectedReadingId,
      kind,
      schema,
      units: normalized.units,
      bookId,
      chapter,
      verseCount: normalized.manifest.indexed_verse_count
    });
    if (reviewed) {
      checked = reviewed;
      validatedOutputPath = reviewed.outputPath;
      humanReview = reviewed.humanReview;
      process.stdout.write(`Applied hash-bound human review overrides for ${jobSpec.metadata.job_id}; the raw worker output was preserved.\n`);
    }
  }

  if (!checked) {
    let processResult = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      processResult = await runCodex({model, schemaPath, outputPath, prompt, cwd: jobDir});
      await writeFile(path.join(jobDir, `process-attempt-${attempt + 1}.log`),
        `status=${processResult.status}\nstdout:\n${processResult.stdout}\nstderr:\n${processResult.stderr}\n`,
        {encoding: "utf8", mode: 0o600});
      if (!processResult.error && processResult.status === 0 && await exists(outputPath)) break;
      const failureText = `${processResult.error && processResult.error.message || ""}\n${processResult.stderr}\n${processResult.stdout}`;
      if (attempt >= maxRetries || !transientFailure(failureText)) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 2000 * (2 ** attempt))));
    }

    if (processResult.error || processResult.status !== 0 || !(await exists(outputPath))) {
      const failure = {
        job_id: jobSpec.metadata.job_id,
        worker_model: model,
        fingerprint,
        status: "failed",
        output_path: path.relative(PRIVATE_ROOT, outputPath),
        error: (processResult.error && processResult.error.message || processResult.stderr || "Codex exited without a result").slice(0, 2000)
      };
      await savePipelineJob(failure);
      await queueReview({...failure, reason: "worker_failure"});
      throw new Error(`${model} generation failed. See ${path.relative(ROOT, jobDir)}.`);
    }

    checked = await validateOutputFile({kind, outputPath, schema, units: normalized.units, bookId, chapter,
      verseCount: normalized.manifest.indexed_verse_count, metadata: jobSpec.metadata});
    const repairRunId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 17);
    for (let repairAttempt = 1; !checked.validation.valid && repairAttempt <= maxRetries; repairAttempt += 1) {
      await writeJson(path.join(jobDir, `invalid-output-${repairRunId}-${repairAttempt}.json`), checked.output);
      await writeJson(path.join(jobDir, `invalid-validation-${repairRunId}-${repairAttempt}.json`), checked.validation);
      const repairPrompt = renderValidationRepairPrompt({prompt, output: checked.output, validation: checked.validation});
      const repairResult = await runCodex({model, schemaPath, outputPath, prompt: repairPrompt, cwd: jobDir});
      await writeFile(path.join(jobDir, `validation-repair-${repairRunId}-${repairAttempt}.log`),
        `status=${repairResult.status}\nstdout:\n${repairResult.stdout}\nstderr:\n${repairResult.stderr}\n`,
        {encoding: "utf8", mode: 0o600});
      if (repairResult.error || repairResult.status !== 0 || !(await exists(outputPath))) break;
      checked = await validateOutputFile({kind, outputPath, schema, units: normalized.units, bookId, chapter,
        verseCount: normalized.manifest.indexed_verse_count, metadata: jobSpec.metadata});
    }
  }
  await writeJson(path.join(jobDir, "validation.json"), checked.validation);
  const record = {
    job_id: jobSpec.metadata.job_id,
    kind,
    worker_model: model,
    source_hash: jobSpec.metadata.source_hash,
    prompt_version: jobSpec.metadata.prompt_version,
    schema_version: jobSpec.metadata.schema_version,
    fingerprint,
    status: checked.validation.valid ? "completed" : "review_required",
    output_path: path.relative(PRIVATE_ROOT, validatedOutputPath),
    validation_path: path.relative(PRIVATE_ROOT, path.join(jobDir, "validation.json")),
    completed_at: new Date().toISOString(),
    warnings: checked.validation.warnings,
    review_applied: Boolean(humanReview),
    human_review: humanReview
  };
  await savePipelineJob(record);
  if (!checked.validation.valid || checked.validation.warnings.length) {
    await queueReview({...record, reason: checked.validation.valid ? "validation_warning" : "validation_failure",
      errors: checked.validation.errors});
  }
  if (!checked.validation.valid) throw new Error(`${model} output failed validation. See ${path.relative(ROOT, jobDir)}.`);
  process.stdout.write(`Completed ${jobSpec.metadata.job_id} with ${model}; ${checked.validation.warnings.length} warning(s).\n`);
  return {...checked, jobSpec, fingerprint, jobDir, outputPath: validatedOutputPath,
    reviewApplied: Boolean(humanReview), humanReview};
}

async function validateFactBriefFile({outputPath, schema, chapterJobSpec}) {
  try {
    const rawOutput = await readJson(outputPath);
    const output = hydrateFactBriefEvidence(rawOutput, {chapterJobSpec});
    if (JSON.stringify(output) !== JSON.stringify(rawOutput)) await writeJson(outputPath, output);
    return {output, validation: validateFactBrief(output, {schema, chapterJobSpec})};
  } catch (error) {
    return {output: null, validation: {valid: false, errors: [error.message], warnings: []}};
  }
}

async function validateAutonomousOutputFile({
  outputPath,
  schema,
  normalized,
  chapterJobSpec,
  factBrief,
  expectedVerseIdsOverride = null
}) {
  try {
    const output = await readJson(outputPath);
    const baseValidation = validateChapterOutput(output, {
      schema,
      units: normalized.units,
      bookId: chapterJobSpec.metadata.book_id,
      chapter: chapterJobSpec.metadata.chapter,
      verseCount: normalized.manifest.indexed_verse_count,
      expectedMetadata: chapterJobSpec.metadata,
      expectedVerseIdsOverride
    });
    const factBoundValidation = validateFactBoundChapterOutput(output, {factBrief, baseValidation});
    const validation = requireAutonomousAdmission(factBoundValidation);
    return {output, validation, baseValidation, factBoundValidation};
  } catch (error) {
    const validation = {valid: false, errors: [error.message], warnings: []};
    return {output: null, validation, baseValidation: validation, factBoundValidation: validation};
  }
}

async function invokeCodexStage({model, schemaPath, outputPath, prompt, cwd, logPrefix, maxRetries}) {
  let processResult = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    processResult = await runCodex({model, schemaPath, outputPath, prompt, cwd});
    await writeFile(path.join(cwd, `${logPrefix}-attempt-${attempt + 1}.log`),
      `status=${processResult.status}\nstdout:\n${processResult.stdout}\nstderr:\n${processResult.stderr}\n`,
      {encoding: "utf8", mode: 0o600});
    if (!processResult.error && processResult.status === 0 && await exists(outputPath)) break;
    const failureText = `${processResult.error && processResult.error.message || ""}\n${processResult.stderr}\n${processResult.stdout}`;
    if (attempt >= maxRetries || !transientFailure(failureText)) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 2000 * (2 ** attempt))));
  }
  return processResult;
}

function codexStageFailed(result, outputPathExists) {
  return !result || result.error || result.status !== 0 || !outputPathExists;
}

function renderFactRepairPrompt({prompt, output, validation}) {
  return `${prompt}\n\n## Deterministic fact-brief repair\n\nThe prior fact brief failed the controller checks below. Return the entire corrected fact-brief JSON object, not a patch or explanation. Preserve every exact metadata value and requested verse. Correct the evidence, fact importance, identities, relations, qualifications, and required terms implicated by the errors, then re-check every verse against the supplied atoms.\n\nValidation errors:\n${JSON.stringify(validation.errors || [], null, 2)}\n\nPrior JSON:\n${JSON.stringify(output, null, 2)}\n`;
}

function buildFactChunkChapterSpec(chapterJobSpec, requestedRecords) {
  const permittedUnitIds = new Set(requestedRecords.flatMap((record) => record.allowed_source_unit_ids));
  return {
    metadata: chapterJobSpec.metadata,
    requestedRecords,
    sourceUnits: chapterJobSpec.sourceUnits.filter((unit) => permittedUnitIds.has(unit.source_unit_id))
  };
}

function buildFactChunks(chapterJobSpec, size = 4) {
  const chunks = [];
  for (let index = 0; index < chapterJobSpec.requestedRecords.length; index += size) {
    const requestedRecords = chapterJobSpec.requestedRecords.slice(index, index + size);
    chunks.push({
      chunkId: `${String(index + 1).padStart(3, "0")}-${String(index + requestedRecords.length).padStart(3, "0")}`,
      chapterJobSpec: buildFactChunkChapterSpec(chapterJobSpec, requestedRecords)
    });
  }
  return chunks;
}

async function generateValidatedFactChunk({
  chunk,
  factDir,
  factTemplate,
  factSchema,
  generatedAt,
  model,
  maxRetries,
  dryRun,
  allowFallback = true
}) {
  const chunkDir = path.join(factDir, "chunks", chunk.chunkId);
  const chunkJobSpec = buildFactBriefJobSpec({chapterJobSpec: chunk.chapterJobSpec, generatedAt});
  const prompt = renderFactExtractionPrompt(factTemplate, chunkJobSpec);
  const outputPath = path.join(chunkDir, "fact-brief.json");
  await mkdir(chunkDir, {recursive: true});
  await writeFile(path.join(chunkDir, "prompt.txt"), prompt, {encoding: "utf8", mode: 0o600});
  await writeJson(path.join(chunkDir, "request.json"), {
    kind: "fact_brief_chunk",
    generation_mode: AUTONOMOUS_GENERATION_MODE,
    chunk_id: chunk.chunkId,
    verse_ids: chunk.chapterJobSpec.requestedRecords.map((record) => record.verse_id),
    metadata: chunkJobSpec.metadata
  });
  let checked = await exists(outputPath)
    ? await validateFactBriefFile({outputPath, schema: factSchema, chapterJobSpec: chunk.chapterJobSpec})
    : null;
  if (checked && checked.validation.valid) return {...checked, outputPath, chunkDir, skipped: true};
  if (dryRun) return {output: null, validation: null, outputPath, chunkDir, dryRun: true};

  const tryVerseFallback = async () => {
    if (!allowFallback || chunk.chapterJobSpec.requestedRecords.length <= 1) return null;
    const verseResults = [];
    for (const record of chunk.chapterJobSpec.requestedRecords) {
      const verseNumber = Number(record.verse_id.split(".").at(-1));
      const verseChunk = {
        chunkId: `${chunk.chunkId}/fallback/${String(verseNumber).padStart(3, "0")}`,
        chapterJobSpec: buildFactChunkChapterSpec(chunk.chapterJobSpec, [record])
      };
      verseResults.push(await generateValidatedFactChunk({
        chunk: verseChunk,
        factDir,
        factTemplate,
        factSchema,
        generatedAt,
        model,
        maxRetries,
        dryRun: false,
        allowFallback: false
      }));
    }
    const merged = {
      ...chunkJobSpec.metadata,
      verse_briefs: verseResults.flatMap((result) => result.output.verse_briefs)
    };
    await writeJson(outputPath, merged);
    const mergedChecked = await validateFactBriefFile({
      outputPath,
      schema: factSchema,
      chapterJobSpec: chunk.chapterJobSpec
    });
    await writeJson(path.join(chunkDir, "validation.json"), mergedChecked.validation);
    if (!mergedChecked.validation.valid) return null;
    await writeJson(path.join(chunkDir, "fallback.json"), {
      schema_version: "mhc-fact-chunk-fallback/v1",
      chunk_id: chunk.chunkId,
      strategy: "single_verse_after_bounded_chunk_repair",
      verse_chunks: verseResults.map((result) => path.relative(chunkDir, result.chunkDir)),
      completed_at: new Date().toISOString()
    });
    return {...mergedChecked, outputPath, chunkDir, skipped: false, fallbackApplied: true};
  };

  if (checked && await exists(path.join(chunkDir, "validation.json"))) {
    const fallback = await tryVerseFallback();
    if (fallback) return fallback;
    throw new Error(`Spark fact chunk ${chunk.chunkId} remained invalid after its cached bounded repair.`);
  }

  const resumedInvalid = Boolean(checked && checked.output);
  const initialPrompt = resumedInvalid
    ? renderFactRepairPrompt({prompt, output: checked.output, validation: checked.validation})
    : prompt;
  const processResult = await invokeCodexStage({
    model,
    schemaPath: FACT_BRIEF_SCHEMA_PATH,
    outputPath,
    prompt: initialPrompt,
    cwd: chunkDir,
    logPrefix: resumedInvalid ? "fact-resume-repair" : "fact-process",
    maxRetries
  });
  if (codexStageFailed(processResult, await exists(outputPath))) {
    throw new Error(`Spark fact chunk ${chunk.chunkId} failed to produce output.`);
  }
  checked = await validateFactBriefFile({outputPath, schema: factSchema, chapterJobSpec: chunk.chapterJobSpec});
  const repairRunId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 17);
  for (let repairAttempt = 1; !checked.validation.valid && repairAttempt <= maxRetries; repairAttempt += 1) {
    await writeJson(path.join(chunkDir, `invalid-fact-brief-${repairRunId}-${repairAttempt}.json`), checked.output);
    await writeJson(path.join(chunkDir, `invalid-fact-validation-${repairRunId}-${repairAttempt}.json`), checked.validation);
    const repairPrompt = renderFactRepairPrompt({prompt, output: checked.output, validation: checked.validation});
    const repairResult = await invokeCodexStage({
      model,
      schemaPath: FACT_BRIEF_SCHEMA_PATH,
      outputPath,
      prompt: repairPrompt,
      cwd: chunkDir,
      logPrefix: `fact-validation-repair-${repairRunId}-${repairAttempt}`,
      maxRetries: 0
    });
    if (codexStageFailed(repairResult, await exists(outputPath))) break;
    checked = await validateFactBriefFile({outputPath, schema: factSchema, chapterJobSpec: chunk.chapterJobSpec});
  }
  await writeJson(path.join(chunkDir, "validation.json"), checked.validation);
  if (!checked.validation.valid) {
    const fallback = await tryVerseFallback();
    if (fallback) return fallback;
    throw new Error(`Spark fact chunk ${chunk.chunkId} failed deterministic validation after bounded self-repair.`);
  }
  return {...checked, outputPath, chunkDir, skipped: false};
}

function subsetFactBrief(factBrief, verseIds) {
  const allowed = new Set(verseIds);
  return {
    ...Object.fromEntries(Object.entries(factBrief).filter(([key]) => key !== "verse_briefs")),
    verse_briefs: factBrief.verse_briefs.filter((brief) => allowed.has(brief.verse_id))
  };
}

function buildWriterChunks(chapterJobSpec, factBrief, size = 4) {
  const chunks = [];
  for (let index = 0; index < chapterJobSpec.requestedRecords.length; index += size) {
    const requestedRecords = chapterJobSpec.requestedRecords.slice(index, index + size);
    const verseIds = requestedRecords.map((record) => record.verse_id);
    chunks.push({
      chunkId: `${String(index + 1).padStart(3, "0")}-${String(index + requestedRecords.length).padStart(3, "0")}`,
      requestedRecords,
      factBrief: subsetFactBrief(factBrief, verseIds)
    });
  }
  return chunks;
}

async function generateValidatedWriterChunk({
  chunk,
  jobDir,
  writerTemplate,
  chapterSchema,
  normalized,
  chapterJobSpec,
  model,
  maxRetries,
  dryRun,
  allowFallback = true
}) {
  const chunkDir = path.join(jobDir, "chunks", chunk.chunkId);
  const chunkChapterJobSpec = {...chapterJobSpec, requestedRecords: chunk.requestedRecords};
  const verseIds = chunk.requestedRecords.map((record) => record.verse_id);
  const prompt = renderAutonomousWriterPrompt(writerTemplate, chunkChapterJobSpec, chunk.factBrief);
  const draftOutputPath = path.join(chunkDir, "draft-output.json");
  const outputPath = path.join(chunkDir, "raw-output.json");
  const admissionPath = path.join(chunkDir, "admission.json");
  await mkdir(chunkDir, {recursive: true});
  await writeFile(path.join(chunkDir, "prompt.txt"), prompt, {encoding: "utf8", mode: 0o600});
  await writeJson(path.join(chunkDir, "request.json"), {
    kind: "chapter_chunk",
    generation_mode: AUTONOMOUS_GENERATION_MODE,
    chunk_id: chunk.chunkId,
    verse_ids: verseIds,
    metadata: chapterJobSpec.metadata
  });

  const validatePath = (candidatePath) => validateAutonomousOutputFile({
    outputPath: candidatePath,
    schema: chapterSchema,
    normalized,
    chapterJobSpec,
    factBrief: chunk.factBrief,
    expectedVerseIdsOverride: verseIds
  });
  let checked = await exists(outputPath) ? await validatePath(outputPath) : null;
  if (checked && checked.validation.valid && await exists(admissionPath)) {
    const marker = await readJson(admissionPath);
    if (marker.final_output_sha256 === await fileHash(outputPath) && marker.worker_model === model &&
        marker.prompt_version === PROMPT_VERSION && marker.generation_mode === AUTONOMOUS_GENERATION_MODE) {
      const draftChecked = await exists(draftOutputPath) ? await validatePath(draftOutputPath) : checked;
      return {...checked, draftChecked, outputPath, draftOutputPath, chunkDir, skipped: true};
    }
  }
  if (dryRun) return {output: null, validation: null, outputPath, draftOutputPath, chunkDir, dryRun: true};

  const tryVerseFallback = async () => {
    if (!allowFallback || chunk.requestedRecords.length <= 1) return null;
    const verseResults = [];
    for (const record of chunk.requestedRecords) {
      const verseNumber = Number(record.verse_id.split(".").at(-1));
      const verseIdsForChunk = [record.verse_id];
      verseResults.push(await generateValidatedWriterChunk({
        chunk: {
          chunkId: `${chunk.chunkId}/fallback/${String(verseNumber).padStart(3, "0")}`,
          requestedRecords: [record],
          factBrief: subsetFactBrief(chunk.factBrief, verseIdsForChunk)
        },
        jobDir,
        writerTemplate,
        chapterSchema,
        normalized,
        chapterJobSpec,
        model,
        maxRetries,
        dryRun: false,
        allowFallback: false
      }));
    }
    const mergedDraft = {
      ...chapterJobSpec.metadata,
      records: verseResults.flatMap((result) => (result.draftChecked.output || result.output).records)
    };
    const mergedOutput = {
      ...chapterJobSpec.metadata,
      records: verseResults.flatMap((result) => result.output.records)
    };
    await writeJson(draftOutputPath, mergedDraft);
    await writeJson(outputPath, mergedOutput);
    const [draftChecked, mergedChecked] = await Promise.all([validatePath(draftOutputPath), validatePath(outputPath)]);
    if (!draftChecked.validation.valid || !mergedChecked.validation.valid) return null;
    await writeJson(path.join(chunkDir, "draft-validation.json"), draftChecked.validation);
    await writeJson(path.join(chunkDir, "validation.json"), mergedChecked.validation);
    await writeJson(path.join(chunkDir, "fallback.json"), {
      schema_version: "mhc-writer-chunk-fallback/v1",
      chunk_id: chunk.chunkId,
      strategy: "single_verse_after_bounded_chunk_repair",
      verse_chunks: verseResults.map((result) => path.relative(chunkDir, result.chunkDir)),
      completed_at: new Date().toISOString()
    });
    await writeJson(admissionPath, {
      schema_version: "mhc-spark-deterministic-admission/v1",
      generation_mode: AUTONOMOUS_GENERATION_MODE,
      worker_model: model,
      prompt_version: PROMPT_VERSION,
      final_output_sha256: await fileHash(outputPath),
      completed_at: new Date().toISOString(),
      composition: "validated_single_verse_drafts"
    });
    return {...mergedChecked, draftChecked, outputPath, draftOutputPath, chunkDir, skipped: false, fallbackApplied: true};
  };

  if (checked && await exists(path.join(chunkDir, "validation.json"))) {
    const fallback = await tryVerseFallback();
    if (fallback) return fallback;
  }

  let draftChecked = await exists(draftOutputPath) ? await validatePath(draftOutputPath) : null;
  if (!draftChecked) {
    const draftProcess = await invokeCodexStage({
      model,
      schemaPath: CHAPTER_SCHEMA_PATH,
      outputPath: draftOutputPath,
      prompt,
      cwd: chunkDir,
      logPrefix: "writer-process",
      maxRetries
    });
    if (codexStageFailed(draftProcess, await exists(draftOutputPath))) {
      throw new Error(`Spark writer chunk ${chunk.chunkId} failed to produce a draft.`);
    }
    draftChecked = await validatePath(draftOutputPath);
  }
  const draftRepairRunId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 17);
  for (let repairAttempt = 1; !draftChecked.validation.valid && repairAttempt <= maxRetries; repairAttempt += 1) {
    await writeJson(path.join(chunkDir, `invalid-draft-${draftRepairRunId}-${repairAttempt}.json`), draftChecked.output);
    await writeJson(path.join(chunkDir, `invalid-draft-validation-${draftRepairRunId}-${repairAttempt}.json`), draftChecked.validation);
    const repairPrompt = renderValidationRepairPrompt({prompt, output: draftChecked.output, validation: draftChecked.validation});
    const repairResult = await invokeCodexStage({
      model,
      schemaPath: CHAPTER_SCHEMA_PATH,
      outputPath: draftOutputPath,
      prompt: repairPrompt,
      cwd: chunkDir,
      logPrefix: `writer-validation-repair-${draftRepairRunId}-${repairAttempt}`,
      maxRetries: 0
    });
    if (codexStageFailed(repairResult, await exists(draftOutputPath))) break;
    draftChecked = await validatePath(draftOutputPath);
  }
  await writeJson(path.join(chunkDir, "draft-validation.json"), draftChecked.validation);
  if (!draftChecked.validation.valid) {
    const fallback = await tryVerseFallback();
    if (fallback) return fallback;
    throw new Error(`Spark writer chunk ${chunk.chunkId} failed draft validation after bounded self-repair.`);
  }

  await writeJson(outputPath, draftChecked.output);
  checked = await validatePath(outputPath);
  await writeJson(path.join(chunkDir, "validation.json"), checked.validation);
  if (!checked.validation.valid) {
    const fallback = await tryVerseFallback();
    if (fallback) return fallback;
    throw new Error(`Spark writer chunk ${chunk.chunkId} failed deterministic admission after bounded repair.`);
  }
  await writeJson(admissionPath, {
    schema_version: "mhc-spark-deterministic-admission/v1",
    generation_mode: AUTONOMOUS_GENERATION_MODE,
    worker_model: model,
    prompt_version: PROMPT_VERSION,
    final_output_sha256: await fileHash(outputPath),
    completed_at: new Date().toISOString(),
    composition: "validated_spark_draft"
  });
  return {...checked, draftChecked, outputPath, draftOutputPath, chunkDir, skipped: false};
}

async function generateAutonomousChapter(options) {
  const bookId = options.book || "GEN";
  const chapter = options.chapter || 1;
  const model = options.model;
  if (model !== SPARK_MODEL) throw new Error(`Autonomous chapter generation requires ${SPARK_MODEL}.`);
  if (options.reviewOverridePath) {
    throw new Error("Spark-autonomous generation does not accept human review overrides; recalibrate its prompts and rerun instead.");
  }
  const auth = codexPreflight();
  assertRequestedModelAvailable(auth, model);
  const [sourceManifest, normalized, factTemplate, writerTemplate, factSchema, chapterSchema] = await Promise.all([
    readJson(SOURCE_MANIFEST_PATH),
    loadNormalized(bookId, chapter),
    readFile(FACT_PROMPT_PATH, "utf8"),
    readFile(PROMPT_PATH, "utf8"),
    readJson(FACT_BRIEF_SCHEMA_PATH),
    readJson(CHAPTER_SCHEMA_PATH)
  ]);
  const verseCount = normalized.manifest.indexed_verse_count;
  const initialGeneratedAt = new Date().toISOString();
  let chapterJobSpec = buildChapterJobSpec({
    units: normalized.units,
    sourceManifest,
    model,
    bookId,
    chapter,
    verseCount,
    generatedAt: initialGeneratedAt,
    promptVersion: PROMPT_VERSION
  });

  let factJobSpec = buildFactBriefJobSpec({chapterJobSpec, generatedAt: initialGeneratedAt});
  const factFingerprint = jobFingerprint({...factJobSpec.metadata, generation_mode: FACT_GENERATION_MODE});
  const factDir = path.join(PRIVATE_ROOT, "fact-briefs", factJobSpec.metadata.job_id, model, factFingerprint.slice(0, 16));
  const factRequestPath = path.join(factDir, "request.json");
  if (await exists(factRequestPath)) {
    const priorRequest = await readJson(factRequestPath);
    if (priorRequest.fingerprint === factFingerprint && priorRequest.metadata && priorRequest.metadata.generation_timestamp) {
      factJobSpec = buildFactBriefJobSpec({chapterJobSpec, generatedAt: priorRequest.metadata.generation_timestamp});
    }
  }
  const factOutputPath = path.join(factDir, "fact-brief.json");
  const factChunks = buildFactChunks(chapterJobSpec);
  await mkdir(factDir, {recursive: true});
  await writeFile(path.join(factDir, "prompt.txt"),
    `${factTemplate.trim()}\n\nThe controller applies this contract independently to ${factChunks.length} bounded verse chunks and merges only validated chunks.\n`,
    {encoding: "utf8", mode: 0o600});
  await writeJson(factRequestPath, {
    kind: "fact_brief",
    generation_mode: FACT_GENERATION_MODE,
    fingerprint: factFingerprint,
    metadata: factJobSpec.metadata,
    chunk_size: 4,
    chunks: factChunks.map((chunk) => ({
      chunk_id: chunk.chunkId,
      verse_ids: chunk.chapterJobSpec.requestedRecords.map((record) => record.verse_id)
    }))
  });

  let factChecked = await exists(factOutputPath)
    ? await validateFactBriefFile({outputPath: factOutputPath, schema: factSchema, chapterJobSpec})
    : null;
  const maxRetries = Number.isInteger(options.maxRetries) ? Math.max(0, Math.min(4, options.maxRetries)) : 3;
  if (!factChecked || !factChecked.validation.valid) {
    if (options.dryRun) {
      for (const chunk of factChunks) {
        await generateValidatedFactChunk({
          chunk,
          factDir,
          factTemplate,
          factSchema,
          generatedAt: factJobSpec.metadata.generation_timestamp,
          model,
          maxRetries,
          dryRun: true
        });
      }
      process.stdout.write(`Dry run prepared ${factChunks.length} autonomous fact chunks at ${path.relative(ROOT, factDir)}; Spark was not invoked.\n`);
      return {
        jobSpec: chapterJobSpec,
        fingerprint: factFingerprint,
        jobDir: factDir,
        dryRun: true,
        reviewApplied: false,
        humanReview: null,
        autonomy: {generation_mode: AUTONOMOUS_GENERATION_MODE, fact_brief_status: "prepared"}
      };
    }
    const chunkResults = [];
    try {
      for (const chunk of factChunks) {
        chunkResults.push(await generateValidatedFactChunk({
          chunk,
          factDir,
          factTemplate,
          factSchema,
          generatedAt: factJobSpec.metadata.generation_timestamp,
          model,
          maxRetries,
          dryRun: false
        }));
      }
    } catch (error) {
      const failure = {
        job_id: chapterJobSpec.metadata.job_id,
        kind: "chapter",
        worker_model: model,
        generation_mode: AUTONOMOUS_GENERATION_MODE,
        fingerprint: factFingerprint,
        status: "failed",
        stage: "fact_chunk_validation",
        output_path: path.relative(PRIVATE_ROOT, factOutputPath),
        error: error.message.slice(0, 2000)
      };
      await savePipelineJob(failure);
      await queueReview({...failure, reason: "autonomous_fact_chunk_failure"});
      throw new Error(`${model} chunked fact extraction failed. See ${path.relative(ROOT, factDir)}.`);
    }
    const mergedFactBrief = {
      ...factJobSpec.metadata,
      verse_briefs: chunkResults.flatMap((result) => result.output.verse_briefs)
    };
    await writeJson(factOutputPath, mergedFactBrief);
    factChecked = await validateFactBriefFile({outputPath: factOutputPath, schema: factSchema, chapterJobSpec});
  }
  await writeJson(path.join(factDir, "validation.json"), factChecked.validation);
  if (!factChecked.validation.valid) {
    const failure = {
      job_id: chapterJobSpec.metadata.job_id,
      kind: "chapter",
      worker_model: model,
      source_hash: chapterJobSpec.metadata.source_hash,
      prompt_version: PROMPT_VERSION,
      schema_version: chapterJobSpec.metadata.schema_version,
      generation_mode: AUTONOMOUS_GENERATION_MODE,
      fingerprint: factFingerprint,
      status: "review_required",
      stage: "fact_validation",
      output_path: path.relative(PRIVATE_ROOT, factOutputPath),
      validation_path: path.relative(PRIVATE_ROOT, path.join(factDir, "validation.json")),
      completed_at: new Date().toISOString(),
      warnings: [],
      errors: factChecked.validation.errors,
      review_applied: false,
      human_review: null
    };
    await savePipelineJob(failure);
    await queueReview({...failure, reason: "autonomous_fact_validation_failure"});
    throw new Error(`${model} fact brief failed deterministic validation. See ${path.relative(ROOT, factDir)}.`);
  }

  const factBriefHash = await fileHash(factOutputPath);
  let writerGeneratedAt = new Date().toISOString();
  let fingerprintMetadata = {
    ...chapterJobSpec.metadata,
    generation_mode: AUTONOMOUS_GENERATION_MODE,
    fact_brief_hash: factBriefHash,
    fact_prompt_version: FACT_PROMPT_VERSION
  };
  let fingerprint = jobFingerprint(fingerprintMetadata);
  let jobDir = path.join(PRIVATE_ROOT, "jobs", chapterJobSpec.metadata.job_id, model, fingerprint.slice(0, 16));
  const priorWriterRequestPath = path.join(jobDir, "request.json");
  if (await exists(priorWriterRequestPath)) {
    const priorRequest = await readJson(priorWriterRequestPath);
    if (priorRequest.fingerprint === fingerprint && priorRequest.metadata && priorRequest.metadata.generation_timestamp) {
      writerGeneratedAt = priorRequest.metadata.generation_timestamp;
      chapterJobSpec = buildChapterJobSpec({
        units: normalized.units,
        sourceManifest,
        model,
        bookId,
        chapter,
        verseCount,
        generatedAt: writerGeneratedAt,
        promptVersion: PROMPT_VERSION
      });
      fingerprintMetadata = {
        ...chapterJobSpec.metadata,
        generation_mode: AUTONOMOUS_GENERATION_MODE,
        fact_brief_hash: factBriefHash,
        fact_prompt_version: FACT_PROMPT_VERSION
      };
      fingerprint = jobFingerprint(fingerprintMetadata);
      jobDir = path.join(PRIVATE_ROOT, "jobs", chapterJobSpec.metadata.job_id, model, fingerprint.slice(0, 16));
    }
  }
  const writerPrompt = renderAutonomousWriterPrompt(writerTemplate, chapterJobSpec, factChecked.output);
  const writerChunks = buildWriterChunks(chapterJobSpec, factChecked.output);
  const draftOutputPath = path.join(jobDir, "draft-output.json");
  const outputPath = path.join(jobDir, "raw-output.json");
  await mkdir(jobDir, {recursive: true});
  await writeFile(path.join(jobDir, "prompt.txt"), writerPrompt, {encoding: "utf8", mode: 0o600});
  await writeJson(path.join(jobDir, "request.json"), {
    kind: "chapter",
    generation_mode: AUTONOMOUS_GENERATION_MODE,
    fingerprint,
    metadata: chapterJobSpec.metadata,
    fact_brief_path: path.relative(PRIVATE_ROOT, factOutputPath),
    fact_brief_sha256: factBriefHash,
    fact_prompt_version: FACT_PROMPT_VERSION,
    chunk_size: 4,
    chunks: writerChunks.map((chunk) => ({
      chunk_id: chunk.chunkId,
      verse_ids: chunk.requestedRecords.map((record) => record.verse_id)
    }))
  });

  const priorManifest = await loadPipelineManifest();
  const existing = await exists(outputPath)
    ? await validateAutonomousOutputFile({
      outputPath,
      schema: chapterSchema,
      normalized,
      chapterJobSpec,
      factBrief: factChecked.output
    })
    : null;
  if (shouldSkipCompletedJob(priorManifest, fingerprintMetadata, existing && existing.validation)) {
    process.stdout.write(`Skipped completed autonomous source-matching job ${chapterJobSpec.metadata.job_id} with ${model}.\n`);
    return {
      ...existing,
      jobSpec: chapterJobSpec,
      fingerprint,
      jobDir,
      outputPath,
      skipped: true,
      reviewApplied: false,
      humanReview: null,
      autonomy: {
        generation_mode: AUTONOMOUS_GENERATION_MODE,
        fact_brief_path: path.relative(PRIVATE_ROOT, factOutputPath),
        fact_brief_sha256: factBriefHash,
        human_override_applied: false
      }
    };
  }
  if (options.dryRun) {
    for (const chunk of writerChunks) {
      await generateValidatedWriterChunk({
        chunk,
        jobDir,
        writerTemplate,
        chapterSchema,
        normalized,
        chapterJobSpec,
        model,
        maxRetries,
        dryRun: true
      });
    }
    process.stdout.write(`Dry run prepared ${writerChunks.length} autonomous writer chunks at ${path.relative(ROOT, jobDir)}; Spark was not invoked.\n`);
    return {
      jobSpec: chapterJobSpec,
      fingerprint,
      jobDir,
      dryRun: true,
      reviewApplied: false,
      humanReview: null,
      autonomy: {
        generation_mode: AUTONOMOUS_GENERATION_MODE,
        fact_brief_path: path.relative(PRIVATE_ROOT, factOutputPath),
        fact_brief_sha256: factBriefHash,
        human_override_applied: false
      }
    };
  }

  const writerChunkResults = [];
  try {
    for (const chunk of writerChunks) {
      writerChunkResults.push(await generateValidatedWriterChunk({
        chunk,
        jobDir,
        writerTemplate,
        chapterSchema,
        normalized,
        chapterJobSpec,
        model,
        maxRetries,
        dryRun: false
      }));
    }
  } catch (error) {
    const failure = {
      job_id: chapterJobSpec.metadata.job_id,
      kind: "chapter",
      worker_model: model,
      generation_mode: AUTONOMOUS_GENERATION_MODE,
      fingerprint,
      status: "failed",
      stage: "writer_chunk_validation",
      output_path: path.relative(PRIVATE_ROOT, draftOutputPath),
      error: error.message.slice(0, 2000)
    };
    await savePipelineJob(failure);
    await queueReview({...failure, reason: "autonomous_writer_chunk_failure"});
    throw new Error(`${model} chunked autonomous writer failed. See ${path.relative(ROOT, jobDir)}.`);
  }

  const mergedDraft = {
    ...chapterJobSpec.metadata,
    records: writerChunkResults.flatMap((result) => (result.draftChecked.output || result.output).records)
  };
  const mergedOutput = {
    ...chapterJobSpec.metadata,
    records: writerChunkResults.flatMap((result) => result.output.records)
  };
  await writeJson(draftOutputPath, mergedDraft);
  await writeJson(outputPath, mergedOutput);
  const draftChecked = await validateAutonomousOutputFile({
    outputPath: draftOutputPath,
    schema: chapterSchema,
    normalized,
    chapterJobSpec,
    factBrief: factChecked.output
  });
  const checked = await validateAutonomousOutputFile({
    outputPath,
    schema: chapterSchema,
    normalized,
    chapterJobSpec,
    factBrief: factChecked.output
  });
  await writeJson(path.join(jobDir, "draft-validation.json"), draftChecked.validation);
  await writeJson(path.join(jobDir, "validation.json"), checked.validation);
  const autonomy = {
    schema_version: "mhc-autonomy-run/v1",
    generation_mode: AUTONOMOUS_GENERATION_MODE,
    worker_model: model,
    fact_prompt_version: FACT_PROMPT_VERSION,
    writer_prompt_version: PROMPT_VERSION,
    fact_chunk_count: factChunks.length,
    writer_chunk_count: writerChunks.length,
    writer_fallback_count: writerChunkResults.filter((result) => result.fallbackApplied).length,
    fact_brief_path: path.relative(PRIVATE_ROOT, factOutputPath),
    fact_brief_sha256: factBriefHash,
    draft_output_path: path.relative(PRIVATE_ROOT, draftOutputPath),
    final_output_path: path.relative(PRIVATE_ROOT, outputPath),
    fact_validation: factChecked.validation,
    draft_validation: draftChecked.validation,
    final_validation: checked.validation,
    human_override_applied: false,
    completed_at: new Date().toISOString()
  };
  await writeJson(path.join(jobDir, "autonomy.json"), autonomy);
  const record = {
    job_id: chapterJobSpec.metadata.job_id,
    kind: "chapter",
    worker_model: model,
    source_hash: chapterJobSpec.metadata.source_hash,
    prompt_version: chapterJobSpec.metadata.prompt_version,
    schema_version: chapterJobSpec.metadata.schema_version,
    generation_mode: AUTONOMOUS_GENERATION_MODE,
    fact_prompt_version: FACT_PROMPT_VERSION,
    fact_brief_path: path.relative(PRIVATE_ROOT, factOutputPath),
    fact_brief_sha256: factBriefHash,
    fingerprint,
    status: checked.validation.valid ? "completed" : "review_required",
    stage: checked.validation.valid ? "admitted" : "draft_validation",
    output_path: path.relative(PRIVATE_ROOT, outputPath),
    validation_path: path.relative(PRIVATE_ROOT, path.join(jobDir, "validation.json")),
    autonomy_path: path.relative(PRIVATE_ROOT, path.join(jobDir, "autonomy.json")),
    completed_at: new Date().toISOString(),
    warnings: checked.validation.warnings,
    errors: checked.validation.errors,
    review_applied: false,
    human_review: null
  };
  await savePipelineJob(record);
  if (!checked.validation.valid) {
    await queueReview({...record, reason: "autonomous_admission_failure"});
    throw new Error(`${model} autonomous output failed admission. See ${path.relative(ROOT, jobDir)}.`);
  }
  process.stdout.write(`Completed ${chapterJobSpec.metadata.job_id} with autonomous Spark fact extraction and writing; zero admission warnings.\n`);
  return {
    ...checked,
    jobSpec: chapterJobSpec,
    fingerprint,
    jobDir,
    outputPath,
    reviewApplied: false,
    humanReview: null,
    autonomy
  };
}

async function generateOne(options) {
  if (!options.bookIntro && options.model === SPARK_MODEL) return generateAutonomousChapter(options);
  return generateLegacyOne(options);
}

async function generate(options) {
  requireFullCorpusConfirmation(options);
  if (options.all) {
    const normalizedRoot = path.join(PRIVATE_ROOT, "normalized");
    if (!(await exists(normalizedRoot))) throw new Error("No normalized source jobs exist. Normalize reviewed batches before a full-corpus run.");
    const books = await readdir(normalizedRoot, {withFileTypes: true});
    const jobs = [];
    for (const book of books.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const files = (await readdir(path.join(normalizedRoot, book.name))).filter((name) => /^\d{3}\.manifest\.json$/.test(name)).sort();
      for (const filename of files) {
        jobs.push(await generateOne({...options, all: false, book: book.name, chapter: Number(filename.slice(0, 3)), bookIntro: false}));
      }
    }
    return jobs;
  }
  if (options.book && options.chapter === undefined && !options.bookIntro) {
    const bookRoot = path.join(PRIVATE_ROOT, "normalized", options.book);
    if (!(await exists(bookRoot))) throw new Error(`No normalized source batches exist for ${options.book}.`);
    const files = (await readdir(bookRoot)).filter((name) => /^\d{3}\.manifest\.json$/.test(name)).sort();
    if (!files.length) throw new Error(`No normalized chapter manifests exist for ${options.book}.`);
    const jobs = [];
    for (const filename of files) {
      jobs.push(await generateOne({...options, chapter: Number(filename.slice(0, 3)), bookIntro: false}));
    }
    return jobs;
  }
  return generateOne(options);
}

async function pilot(options) {
  requireFullCorpusConfirmation(options);
  const availability = codexPreflight();
  const results = [];
  let workerFailed = false;
  for (const model of PILOT_MODELS) {
    if (!availability.catalog.has(model) && model !== SPARK_MODEL) {
      const unavailable = {model, status: "unavailable", checked_at: new Date().toISOString()};
      results.push(unavailable);
      await queueReview({job_id: `${options.book || "GEN"}-${String(options.chapter || 1).padStart(3, "0")}`,
        worker_model: model, reason: "model_unavailable"});
      process.stdout.write(`${model} is unavailable; continuing the controlled pilot with remaining requested models.\n`);
      continue;
    }
    try {
      results.push(await generateOne({...options, model, bookIntro: false}));
    } catch (error) {
      workerFailed = true;
      results.push({model, status: "failed", error: error.message});
      process.stderr.write(`${model} failed; continuing the controlled pilot with remaining requested models.\n`);
    }
  }
  if (!options.dryRun) await compare(options);
  if (workerFailed) process.exitCode = 1;
  return results;
}

function resultMetrics(output, validation) {
  const counts = (output.records || []).map((record) => record.blurb.trim().split(/\s+/).filter(Boolean).length);
  const identical = new Map();
  (output.records || []).forEach((record) => {
    const key = record.blurb.trim().toLowerCase();
    if (!identical.has(key)) identical.set(key, []);
    identical.get(key).push(record.verse_id);
  });
  return {
    schema_and_grounding_valid: validation.valid,
    validation_errors: validation.errors,
    validation_warnings: validation.warnings,
    record_count: output.records.length,
    average_blurb_words: counts.length ? Number((counts.reduce((sum, count) => sum + count, 0) / counts.length).toFixed(1)) : 0,
    minimum_blurb_words: counts.length ? Math.min(...counts) : 0,
    maximum_blurb_words: counts.length ? Math.max(...counts) : 0,
    exact_duplicate_groups: [...identical.values()].filter((verses) => verses.length > 1),
    coverage_counts: (output.records || []).reduce((countsByType, record) => {
      countsByType[record.coverage_type] = (countsByType[record.coverage_type] || 0) + 1;
      return countsByType;
    }, {})
  };
}

async function latestCompletedJob(jobId, model, kind = "chapter") {
  const manifest = await loadPipelineManifest();
  const candidates = manifest.jobs.filter((job) => job.job_id === jobId && job.worker_model === model &&
    job.kind === kind && job.status === "completed").sort((left, right) => String(right.completed_at).localeCompare(String(left.completed_at)));
  if (!candidates.length) return null;
  return candidates[0];
}

async function validateSaved(options) {
  const bookId = options.book || "GEN";
  const chapter = options.chapter || 1;
  const model = options.model;
  if (!model) throw new Error("--model is required.");
  const kind = options.bookIntro ? "book_intro" : "chapter";
  const jobId = kind === "book_intro" ? `intro-${bookId}` : `${bookId}-${String(chapter).padStart(3, "0")}`;
  const job = await latestCompletedJob(jobId, model, kind);
  if (!job) throw new Error(`No completed ${jobId} result exists for ${model}.`);
  const outputPath = path.join(PRIVATE_ROOT, job.output_path);
  const normalized = await loadNormalized(bookId, chapter);
  const chapterSchemaPath = job.schema_version === "mhc-commentary/v1"
    ? LEGACY_CHAPTER_SCHEMA_PATH
    : CHAPTER_SCHEMA_PATH;
  const schema = await readJson(kind === "book_intro" ? BOOK_INTRO_SCHEMA_PATH : chapterSchemaPath);
  const expectedMetadata = {
    schema_version: job.schema_version,
    job_id: job.job_id,
    source_hash: job.source_hash,
    worker_model: job.worker_model,
    prompt_version: job.prompt_version
  };
  let checked = await validateOutputFile({kind, outputPath, schema, units: normalized.units, bookId, chapter,
    verseCount: normalized.manifest.indexed_verse_count, metadata: expectedMetadata});
  if (kind === "chapter" && job.generation_mode === AUTONOMOUS_GENERATION_MODE) {
    const factRelativePath = String(job.fact_brief_path || "");
    const factPath = path.resolve(PRIVATE_ROOT, factRelativePath);
    if (!factRelativePath || !factPath.startsWith(`${PRIVATE_ROOT}${path.sep}`)) {
      checked.validation = {valid: false, errors: ["Autonomous job has an invalid private fact-brief path."], warnings: []};
      return {job, outputPath, normalized, ...checked};
    }
    if (!(await exists(factPath))) {
      checked.validation = {valid: false, errors: ["Autonomous job fact brief is missing."], warnings: []};
      return {job, outputPath, normalized, ...checked};
    }
    const [sourceManifest, factSchema, factBrief] = await Promise.all([
      readJson(SOURCE_MANIFEST_PATH),
      readJson(FACT_BRIEF_SCHEMA_PATH),
      readJson(factPath)
    ]);
    const chapterJobSpec = buildChapterJobSpec({
      units: normalized.units,
      sourceManifest,
      model,
      bookId,
      chapter,
      verseCount: normalized.manifest.indexed_verse_count,
      generatedAt: checked.output && checked.output.generation_timestamp,
      promptVersion: job.prompt_version,
      schemaVersion: job.schema_version
    });
    const factValidation = validateFactBrief(factBrief, {schema: factSchema, chapterJobSpec});
    if (job.fact_brief_sha256 !== await fileHash(factPath)) {
      factValidation.errors.push("Autonomous job fact-brief checksum no longer matches its admitted manifest record.");
      factValidation.valid = false;
    }
    const baseValidation = validateChapterOutput(checked.output, {
      schema,
      units: normalized.units,
      bookId,
      chapter,
      verseCount: normalized.manifest.indexed_verse_count,
      expectedMetadata: chapterJobSpec.metadata
    });
    const factBoundValidation = validateFactBoundChapterOutput(checked.output, {factBrief, baseValidation});
    checked = {
      ...checked,
      validation: requireAutonomousAdmission({
        valid: factValidation.valid && factBoundValidation.valid,
        errors: [...factValidation.errors, ...factBoundValidation.errors],
        warnings: [...factValidation.warnings, ...factBoundValidation.warnings]
      }),
      factBrief,
      factValidation,
      factPath
    };
  }
  return {job, outputPath, normalized, ...checked};
}

async function compare(options) {
  const bookId = options.book || "GEN";
  const chapter = options.chapter || 1;
  const jobId = `${bookId}-${String(chapter).padStart(3, "0")}`;
  const results = {};
  for (const model of PILOT_MODELS) {
    try {
      const checked = await validateSaved({book: bookId, chapter, model});
      results[model] = {
        status: "completed",
        output_path: path.relative(PRIVATE_ROOT, checked.outputPath),
        metrics: resultMetrics(checked.output, checked.validation)
      };
    } catch (error) {
      results[model] = {status: "unavailable_or_incomplete", error: error.message};
    }
  }
  const jsonPath = path.join(PRIVATE_ROOT, "reports", `${jobId}-spark-vs-luna.json`);
  const mdPath = path.join(PRIVATE_ROOT, "reports", `${jobId}-spark-vs-luna.md`);
  const priorReport = await exists(jsonPath) ? await readJson(jsonPath) : null;
  const humanSourceReview = priorReport && priorReport.human_source_review || {
    status: "required",
    criteria: ["grounding", "verse/range association", "preservation of Henry's meaning", "absence of invention", "range transparency", "clarity", "concision", "schema compliance", "chapter consistency"],
    recommendation: null,
    concrete_findings: []
  };
  const report = {
    schema_version: "mhc-pilot-comparison/v1",
    job_id: jobId,
    compared_at: new Date().toISOString(),
    identical_inputs: ["normalized source units", "mhc-worker/v1 prompt", "mhc-commentary/v1 schema", "standard speed", "sequential execution"],
    results,
    human_source_review: humanSourceReview
  };
  await writeJson(jsonPath, report);
  const lines = [
    `# ${jobId} Spark-versus-Luna pilot`, "",
    "The controller is configured to give both requested workers the same normalized source units, worker prompt, output schema, and standard-speed sequential settings.", ""
  ];
  Object.entries(results).forEach(([model, result]) => {
    lines.push(`## ${model}`, "", `Status: ${result.status}.`);
    if (result.metrics) {
      lines.push(`Records: ${result.metrics.record_count}; average ${result.metrics.average_blurb_words} words; range ${result.metrics.minimum_blurb_words}–${result.metrics.maximum_blurb_words}.`,
        `Validation warnings: ${result.metrics.validation_warnings.length}.`, "");
    } else lines.push(`${result.error}`, "");
  });
  lines.push("## Human source review", "", `Status: ${humanSourceReview.status}.`);
  (humanSourceReview.concrete_findings || []).forEach((finding) => lines.push(`- ${finding}`));
  if (humanSourceReview.recommendation) lines.push("", `Recommendation: ${humanSourceReview.recommendation}`);
  else lines.push("", "Pending direct comparison against the preserved normalized source units.");
  lines.push("");
  await mkdir(path.dirname(mdPath), {recursive: true});
  await writeFile(mdPath, `${lines.join("\n")}\n`, {encoding: "utf8", mode: 0o600});
  process.stdout.write(`Wrote deterministic pilot comparison to ${path.relative(ROOT, jsonPath)}.\n`);
  return report;
}

async function exportResult(options) {
  const bookId = options.book || "GEN";
  const chapter = options.chapter || 1;
  const model = options.model;
  if (!model) throw new Error("--model is required.");
  const checked = await validateSaved({...options, book: bookId, chapter, model});
  if (!checked.validation.valid) throw new Error("Saved result failed validation and cannot be exported.");
  const sourceManifest = await readJson(SOURCE_MANIFEST_PATH);
  const runtime = options.bookIntro
    ? exportBookIntroRuntime(checked.output, sourceManifest, checked.validation)
    : exportChapterRuntime(checked.output, sourceManifest, checked.validation, checked.normalized.units);
  if (options.runtimeReviewStatus) runtime.review_status = options.runtimeReviewStatus;
  const runtimeSchema = await readJson(RUNTIME_SCHEMA_PATH);
  const runtimeValidationSchema = options.bookIntro
    ? {...runtimeSchema, $ref: "#/$defs/bookIntroShard"}
    : runtimeSchema;
  const runtimeErrors = validateAgainstSchema(runtime, runtimeValidationSchema);
  if (runtimeErrors.length) {
    throw new Error(`Compact runtime export failed schema validation:\n- ${runtimeErrors.join("\n- ")}`);
  }
  const outputPath = options.bookIntro
    ? path.join(PRIVATE_ROOT, "runtime", bookId, "introduction.json")
    : path.join(PRIVATE_ROOT, "runtime", bookId, `${String(chapter).padStart(3, "0")}.json`);
  await writeJson(outputPath, runtime);
  process.stdout.write(`Exported compact private runtime data to ${path.relative(ROOT, outputPath)}.\n`);
  return {runtime, outputPath};
}

function scheduleAuditPaths(readingId) {
  const root = path.join(PRIVATE_ROOT, "schedule", readingId);
  return {root, manifest: path.join(root, "audit.json"), report: path.join(root, "audit.md")};
}

function quotedMarkdown(value) {
  return String(value || "").replace(/\r\n?/g, "\n").split("\n").map((line) => `> ${line}`).join("\n");
}

async function writeScheduleAuditReport(audit, passageResults, reportPath) {
  const lines = [
    `# ${audit.reading_id} Matthew Henry Spark audit`, "",
    `**UNREVIEWED — NOT PUBLISHED.** Prepared for ${audit.schedule_date} with ${audit.worker_model}.`, "",
    "The schedule's main commentary was not changed. Spark independently extracted a deterministically validated fact ledger, wrote each condensation from that ledger, and performed its own second-pass review. This report contains the admitted condensations and exact public-domain Henry commentary atoms cited for them; embedded Scripture transcription was removed before generation.", ""
  ];
  for (const result of passageResults) {
    if (!result.runtime) continue;
    lines.push(`## ${result.book_id} ${result.chapter}`, "");
    for (const [verseId, record] of Object.entries(result.runtime.records)) {
      lines.push(`### ${verseId}`, "", record.blurb, "", `Source range: ${record.source_reference_label}.`, "");
      for (const atomId of record.source_atom_ids || []) {
        const atom = result.runtime.source_atoms && result.runtime.source_atoms[atomId];
        if (!atom) continue;
        lines.push(`Exact Henry atom \`${atomId}\`:`, "", quotedMarkdown(atom.text), "");
      }
    }
  }
  lines.push("## Human review", "", `Status: ${audit.human_review.status}.`, "");
  if (audit.human_review.findings.length) {
    audit.human_review.findings.forEach((finding) => lines.push(`- ${finding}`));
    lines.push("");
  } else {
    lines.push("Direct comparison against the cited atoms is still required.", "");
  }
  lines.push(`Approval: ${audit.human_review.approval || "not granted"}.`, "");
  await mkdir(path.dirname(reportPath), {recursive: true});
  await writeFile(reportPath, `${lines.join("\n")}\n`, {encoding: "utf8", mode: 0o600});
}

function assertScheduleLaneOptions(options, command) {
  if (options.all || options.book || options.chapter || options.bookIntro) {
    throw new Error(`${command} resolves bounded readings from the active schedule; book, chapter, intro, and corpus selectors are not accepted.`);
  }
  if (options.request) throw new Error(`${command} does not accept an activation request file; use the activate command.`);
  if (options.model && options.model !== SPARK_MODEL) {
    throw new Error(`${command} is a Spark audit lane and requires ${SPARK_MODEL}.`);
  }
  if (command === "schedule-next" && options.readingCount !== undefined) {
    throw new Error("schedule-next accepts one reading only; use schedule-window or activate for a caller-selected count.");
  }
  if (command === "schedule-window" && options.daysAhead !== undefined && options.readingCount !== undefined) {
    throw new Error("Choose either --days-ahead or --reading-count, not both.");
  }
}

async function scheduleReading(options, {plan, target}) {
  const entry = target.entry;
  if (entry.kind !== "chapter" || !Array.isArray(entry.passages) || !entry.passages.length) {
    throw new Error(`${entry.readingId} is not a chapter reading and cannot enter the verse-commentary lane.`);
  }
  const auditPaths = scheduleAuditPaths(entry.readingId);
  const priorAudit = await exists(auditPaths.manifest) ? await readJson(auditPaths.manifest) : null;
  const humanReview = priorAudit && priorAudit.prompt_version === PROMPT_VERSION && priorAudit.human_review || {
    status: "required",
    reviewed_at: null,
    findings: [],
    approval: null
  };
  const audit = {
    schema_version: "mhc-schedule-audit/v1",
    reading_id: entry.readingId,
    plan_version: plan.planVersion,
    source_plan_day: entry.sourcePlanDay,
    prepared_on: target.preparedOn,
    schedule_date: target.scheduleDate,
    days_ahead: target.daysAhead,
    timezone: target.timezone,
    worker_model: SPARK_MODEL,
    prompt_version: PROMPT_VERSION,
    generation_mode: AUTONOMOUS_GENERATION_MODE,
    audit_status: options.dryRun ? "preparing" : "generating",
    review_status: "unreviewed",
    publication_status: "not_published",
    main_commentary_unchanged: true,
    source_layer: "exact_cited_commentary_atoms_without_embedded_scripture_transcription",
    passages: [],
    human_review: humanReview,
    review_checklist: [
      "Compare every condensation with each cited Henry atom.",
      "Check that no idea crossed from a different indexed source range.",
      "Accept natural overlap within one Henry range when the prose remains reasonable for the verse.",
      "Flag outside material, invented distinctions, copied wording, or repeated source-reporting language.",
      "Approve explicitly before attaching this data to published private reading content."
    ]
  };
  await writeJson(auditPaths.manifest, audit);
  const passageResults = [];
  try {
    for (const passage of entry.passages) {
      if (!/^[A-Z0-9]{2,8}$/.test(String(passage.bookId || "")) || !Number.isInteger(passage.chapter) ||
          !Number.isInteger(passage.verseCount) || passage.verseCount < 1) {
        throw new Error(`${entry.readingId} contains an invalid chapter passage.`);
      }
      const normalized = await normalize({book: passage.bookId, chapter: passage.chapter});
      if (normalized.manifest.indexed_verse_count !== passage.verseCount) {
        throw new Error(`${passage.bookId} ${passage.chapter} has ${normalized.manifest.indexed_verse_count} indexed Henry verses but the active plan requires ${passage.verseCount}.`);
      }
      const generated = await generateOne({
        book: passage.bookId,
        chapter: passage.chapter,
        model: SPARK_MODEL,
        dryRun: options.dryRun,
        maxRetries: options.maxRetries,
        expectedReadingId: entry.readingId
      });
      if (generated.reviewApplied) {
        audit.review_status = generated.humanReview.status;
        audit.human_review = {
          status: generated.humanReview.status,
          reviewed_at: generated.humanReview.reviewed_at,
          reviewer: generated.humanReview.reviewer,
          findings: generated.humanReview.findings,
          corrected_verse_ids: generated.humanReview.corrected_verse_ids,
          approval: generated.humanReview.approval
        };
      }
      const exported = options.dryRun ? null : await exportResult({
        book: passage.bookId,
        chapter: passage.chapter,
        model: SPARK_MODEL,
        runtimeReviewStatus: generated.reviewApplied ? generated.humanReview.status : null
      });
      const passageResult = {
        book_id: passage.bookId,
        chapter: passage.chapter,
        verse_count: passage.verseCount,
        normalization_schema_version: normalized.manifest.normalized_schema_version,
        normalized_path: path.relative(PRIVATE_ROOT, normalized.paths.units),
        normalized_batch_sha256: normalized.manifest.normalized_batch_sha256,
        source_unit_ids: normalized.manifest.source_unit_ids,
        exception_count: normalized.manifest.exception_count,
        job_id: generated.jobSpec.metadata.job_id,
        fingerprint: generated.fingerprint,
        job_path: path.relative(PRIVATE_ROOT, generated.jobDir),
        generation_mode: generated.autonomy && generated.autonomy.generation_mode || AUTONOMOUS_GENERATION_MODE,
        fact_brief_path: generated.autonomy && generated.autonomy.fact_brief_path || null,
        fact_brief_sha256: generated.autonomy && generated.autonomy.fact_brief_sha256 || null,
        human_override_applied: false,
        generation_status: options.dryRun ? "prepared" : generated.skipped ? "reused_valid_result" : "completed",
        validation_warnings: generated.validation ? generated.validation.warnings : [],
        review_applied: generated.reviewApplied || false,
        corrected_verse_ids: generated.humanReview && generated.humanReview.corrected_verse_ids || [],
        runtime_path: exported ? path.relative(PRIVATE_ROOT, exported.outputPath) : null,
        record_count: exported ? Object.keys(exported.runtime.records).length : 0,
        source_atom_count: exported && exported.runtime.source_atoms ? Object.keys(exported.runtime.source_atoms).length : 0,
        runtime: exported && exported.runtime
      };
      passageResults.push(passageResult);
      audit.passages.push(Object.fromEntries(Object.entries(passageResult).filter(([key]) => key !== "runtime")));
    }
    audit.audit_status = options.dryRun ? "prepared" : audit.human_review.status === "required" ? "unreviewed" : "in_review";
    audit.completed_at = new Date().toISOString();
    await writeJson(auditPaths.manifest, audit);
    await writeScheduleAuditReport(audit, passageResults, auditPaths.report);
  } catch (error) {
    audit.audit_status = "generation_failed";
    audit.failed_at = new Date().toISOString();
    audit.failure = error.message;
    await writeJson(auditPaths.manifest, audit);
    throw error;
  }
  process.stdout.write(`${options.dryRun ? "Prepared" : "Generated"} private ${SPARK_MODEL} audit for ${entry.readingId} (${target.scheduleDate}); nothing was published.\n`);
  process.stdout.write(`Audit report: ${path.relative(ROOT, auditPaths.report)}\n`);
  return {target, audit, auditPaths, passageResults};
}

function buildPortableWindowReading({plan, scheduledResult}) {
  const {target, audit, passageResults} = scheduledResult;
  const chapters = passageResults.map((result) => {
    if (!result.runtime) throw new Error(`${audit.reading_id} has no validated runtime data for the portable store.`);
    if (result.runtime.prompt_version === PROMPT_VERSION) {
      Object.entries(result.runtime.records || {}).forEach(([verseId, record]) => {
        const sourceReportingPhrase = findSourceReportingPhrase(record && record.blurb);
        if (sourceReportingPhrase) {
          throw new Error(`${verseId} contains forbidden source-reporting phrase ${JSON.stringify(sourceReportingPhrase)}.`);
        }
      });
    }
    return {
      book_id: result.book_id,
      chapter: result.chapter,
      verse_count: result.verse_count,
      runtime: result.runtime
    };
  });
  return {
    schema_version: "mhc-portable-reading/v1",
    plan_version: plan.planVersion,
    reading_id: audit.reading_id,
    schedule_date: target.scheduleDate,
    day_index: target.dayIndex,
    source_plan_day: audit.source_plan_day,
    timezone: target.timezone,
    worker_model: audit.worker_model,
    prompt_version: audit.prompt_version,
    review_status: audit.review_status,
    human_review_status: audit.human_review.status,
    publication_status: "not_published",
    contains_scripture: false,
    chapters
  };
}

function buildWindowStoreManifest({plan, window, generatedAt, readings}) {
  const readingCount = window.readingCount || readings.length;
  return {
    schema_version: "mhc-window-store/v1",
    store_id: `${plan.planVersion}:${window.preparedOn}:${window.windowEndDate}`,
    plan_version: plan.planVersion,
    generated_at: generatedAt,
    prepared_on: window.preparedOn,
    timezone: window.timezone,
    reading_count: readingCount,
    days_ahead: Math.max(0, readingCount - 1),
    window_start_date: window.windowStartDate,
    window_end_date: window.windowEndDate,
    worker_model: SPARK_MODEL,
    prompt_version: PROMPT_VERSION,
    publication_status: "not_published",
    contains_scripture: false,
    readings
  };
}

function buildLibraryCatalog({plan, priorCatalog, storedAt, readings}) {
  if (priorCatalog && priorCatalog.plan_version !== plan.planVersion) {
    throw new Error(`The durable Henry catalog belongs to ${priorCatalog.plan_version}, not ${plan.planVersion}.`);
  }
  const priorById = new Map((priorCatalog && priorCatalog.readings || []).map((reading) => [reading.reading_id, reading]));
  for (const reading of readings) {
    const prior = priorById.get(reading.reading_id);
    priorById.set(reading.reading_id, {
      ...reading,
      first_stored_at: prior && prior.first_stored_at || storedAt,
      last_stored_at: storedAt
    });
  }
  return {
    schema_version: "mhc-library-catalog/v1",
    catalog_id: `${plan.planVersion}:mhc-library`,
    plan_version: plan.planVersion,
    updated_at: storedAt,
    worker_model: SPARK_MODEL,
    prompt_version: PROMPT_VERSION,
    publication_status: "not_published",
    contains_scripture: false,
    readings: [...priorById.values()].sort((left, right) => left.day_index - right.day_index || left.reading_id.localeCompare(right.reading_id))
  };
}

function buildLibraryPointer({plan, catalogFile, catalogSha256, updatedAt}) {
  return {
    schema_version: "mhc-library-pointer/v1",
    plan_version: plan.planVersion,
    catalog_file: catalogFile,
    catalog_sha256: catalogSha256,
    updated_at: updatedAt
  };
}

function buildActivationResult({request, completedAt, scheduledResults, store}) {
  return {
    schema_version: "mhc-activation-result/v1",
    request_id: request.request_id,
    plan_version: request.plan_version,
    requested_by: request.requested_by,
    start_reading_id: request.start_reading_id,
    requested_reading_count: request.reading_count,
    completed_at: completedAt,
    status: "completed",
    worker_model: SPARK_MODEL,
    prompt_version: PROMPT_VERSION,
    publication_status: "not_published",
    contains_scripture: false,
    reading_ids: scheduledResults.map((result) => result.audit.reading_id),
    current_window_manifest: {
      file: path.relative(PRIVATE_ROOT, store.manifestPath).split(path.sep).join("/"),
      sha256: store.manifestSha256
    },
    library_catalog: {
      file: path.relative(PRIVATE_ROOT, store.catalogPath).split(path.sep).join("/"),
      sha256: store.catalogSha256
    }
  };
}

async function writePortableStores({plan, window, scheduledResults, writeWindow = true}) {
  const [storeSchema, runtimeSchema, activationSchema] = await Promise.all([
    readJson(WINDOW_STORE_SCHEMA_PATH),
    readJson(RUNTIME_SCHEMA_PATH),
    readJson(ACTIVATION_SCHEMA_PATH)
  ]);
  const externalSchemas = {"mhc-runtime.schema.json": runtimeSchema};
  const descriptors = [];
  const readingPaths = [];
  const libraryDescriptors = [];
  const planKey = storePlanKey(plan.planVersion);
  const storedAt = new Date().toISOString();
  for (const scheduledResult of scheduledResults) {
    const reading = buildPortableWindowReading({plan, scheduledResult});
    const validationErrors = validateAgainstSchema(
      reading,
      {...storeSchema, $ref: "#/$defs/reading"},
      {externalSchemas}
    );
    if (validationErrors.length) {
      throw new Error(`Portable reading ${reading.reading_id} failed schema validation:\n- ${validationErrors.join("\n- ")}`);
    }
    const bytes = jsonBytes(reading);
    const checksum = sha256(bytes);
    const relativePath = path.join("readings", `${reading.reading_id}.${checksum.slice(0, 16)}.json`);
    const outputPath = path.join(WINDOW_STORE_ROOT, relativePath);
    const libraryRelativePath = path.join("plans", planKey, "readings", `${reading.reading_id}.${checksum.slice(0, 16)}.json`);
    const libraryOutputPath = path.join(LIBRARY_STORE_ROOT, libraryRelativePath);
    if (writeWindow) await writeContentAddressed(outputPath, bytes, checksum);
    await writeContentAddressed(libraryOutputPath, bytes, checksum);
    const descriptor = {
      reading_id: reading.reading_id,
      schedule_date: reading.schedule_date,
      day_index: reading.day_index,
      source_plan_day: reading.source_plan_day,
      file: relativePath.split(path.sep).join("/"),
      sha256: checksum,
      passage_count: reading.chapters.length,
      review_status: reading.review_status,
      human_review_status: reading.human_review_status
    };
    descriptors.push(descriptor);
    libraryDescriptors.push({
      ...descriptor,
      file: libraryRelativePath.split(path.sep).join("/"),
      worker_model: reading.worker_model,
      prompt_version: reading.prompt_version
    });
    if (writeWindow) readingPaths.push(outputPath);
  }
  const catalogRelativePath = path.join("plans", planKey, "catalog.json");
  const catalogPath = path.join(LIBRARY_STORE_ROOT, catalogRelativePath);
  const priorCatalog = await exists(catalogPath) ? await readJson(catalogPath) : null;
  if (priorCatalog) {
    const priorErrors = validateAgainstSchema(priorCatalog, {...activationSchema, $ref: "#/$defs/catalog"});
    if (priorErrors.length) throw new Error(`Existing durable Henry catalog is invalid:\n- ${priorErrors.join("\n- ")}`);
  }
  const catalog = buildLibraryCatalog({plan, priorCatalog, storedAt, readings: libraryDescriptors});
  const catalogErrors = validateAgainstSchema(catalog, {...activationSchema, $ref: "#/$defs/catalog"});
  if (catalogErrors.length) throw new Error(`Durable Henry catalog failed schema validation:\n- ${catalogErrors.join("\n- ")}`);
  const catalogWrite = await writeJsonAtomic(catalogPath, catalog);
  const pointer = buildLibraryPointer({
    plan,
    catalogFile: catalogRelativePath.split(path.sep).join("/"),
    catalogSha256: catalogWrite.sha256,
    updatedAt: storedAt
  });
  const pointerErrors = validateAgainstSchema(pointer, {...activationSchema, $ref: "#/$defs/pointer"});
  if (pointerErrors.length) throw new Error(`Durable Henry catalog pointer failed schema validation:\n- ${pointerErrors.join("\n- ")}`);
  const pointerPath = path.join(LIBRARY_STORE_ROOT, "current.json");
  await writeJsonAtomic(pointerPath, pointer);
  let manifest = null;
  let manifestPath = null;
  let manifestSha256 = null;
  if (writeWindow) {
    manifest = buildWindowStoreManifest({
      plan,
      window,
      generatedAt: storedAt,
      readings: descriptors
    });
    const manifestErrors = validateAgainstSchema(manifest, storeSchema, {externalSchemas});
    if (manifestErrors.length) {
      throw new Error(`Portable window manifest failed schema validation:\n- ${manifestErrors.join("\n- ")}`);
    }
    manifestPath = path.join(WINDOW_STORE_ROOT, "manifest.json");
    const manifestWrite = await writeJsonAtomic(manifestPath, manifest);
    manifestSha256 = manifestWrite.sha256;
  }
  return {
    manifest,
    manifestPath,
    manifestSha256,
    readingPaths,
    catalog,
    catalogPath,
    catalogSha256: catalogWrite.sha256,
    pointer,
    pointerPath
  };
}

async function scheduleNext(options) {
  assertScheduleLaneOptions(options, "schedule-next");
  const [plan, appConfig] = await Promise.all([readJson(ACTIVE_PLAN_PATH), readJson(ACTIVE_CONFIG_PATH)]);
  const target = resolveScheduledReading({
    plan,
    appConfig,
    today: options.today,
    daysAhead: options.daysAhead === undefined ? 1 : options.daysAhead
  });
  return scheduleReading(options, {plan, target});
}

async function scheduleWindow(options) {
  assertScheduleLaneOptions(options, "schedule-window");
  const [plan, appConfig] = await Promise.all([readJson(ACTIVE_PLAN_PATH), readJson(ACTIVE_CONFIG_PATH)]);
  const window = resolveScheduledWindow({
    plan,
    appConfig,
    today: options.today,
    daysAhead: options.daysAhead === undefined ? 2 : options.daysAhead,
    readingCount: options.readingCount
  });
  if (options.dryRun) {
    process.stdout.write(`Rolling Spark window ${window.windowStartDate} through ${window.windowEndDate}:\n`);
    window.targets.forEach((target) => {
      process.stdout.write(`- ${target.scheduleDate}: ${target.entry.readingId}\n`);
    });
    process.stdout.write("Dry run only; no source normalization, model invocation, audit, or store write occurred.\n");
    return {window, scheduledResults: [], store: null};
  }
  const scheduledResults = [];
  for (const target of window.targets) {
    scheduledResults.push(await scheduleReading(options, {plan, target}));
  }
  const store = await writePortableStores({plan, window, scheduledResults});
  process.stdout.write(`Portable private window store: ${path.relative(ROOT, store.manifestPath)}\n`);
  process.stdout.write(`Durable private library catalog: ${path.relative(ROOT, store.catalogPath)}\n`);
  process.stdout.write("The store is unreviewed, contains no Scripture, and was not published.\n");
  return {window, scheduledResults, store};
}

function assertActivationOptions(options) {
  if (!options.request) throw new Error("activate requires --request PATH.");
  if (options.all || options.book || options.chapter || options.bookIntro || options.model || options.today ||
      options.daysAhead !== undefined || options.readingCount !== undefined) {
    throw new Error("activate accepts only --request, --dry-run, and optional --max-retries; the request owns the bounded schedule selection.");
  }
}

async function readActivationRequest(requestPath) {
  const [request, schema] = await Promise.all([
    readJson(path.resolve(ROOT, requestPath)),
    readJson(ACTIVATION_SCHEMA_PATH)
  ]);
  const errors = validateAgainstSchema(request, {...schema, $ref: "#/$defs/request"});
  if (errors.length) throw new Error(`Matthew Henry activation request is invalid:\n- ${errors.join("\n- ")}`);
  return {request, schema};
}

async function activateSchedule(options) {
  assertActivationOptions(options);
  const [{request, schema}, plan, appConfig] = await Promise.all([
    readActivationRequest(options.request),
    readJson(ACTIVE_PLAN_PATH),
    readJson(ACTIVE_CONFIG_PATH)
  ]);
  if (request.plan_version !== plan.planVersion) {
    throw new Error(`Activation request plan ${request.plan_version} does not match active plan ${plan.planVersion}.`);
  }
  const window = resolveScheduledBatch({
    plan,
    appConfig,
    startReadingId: request.start_reading_id,
    readingCount: request.reading_count
  });
  if (options.dryRun) {
    process.stdout.write(`Activation ${request.request_id} requests ${request.reading_count} reading(s):\n`);
    window.targets.forEach((target) => process.stdout.write(`- ${target.scheduleDate}: ${target.entry.readingId}\n`));
    process.stdout.write("Dry run only; no source normalization, model invocation, audit, library, or manifest write occurred.\n");
    return {request, window, scheduledResults: [], store: null, result: null};
  }
  const scheduledResults = [];
  for (const target of window.targets) {
    scheduledResults.push(await scheduleReading(options, {plan, target}));
  }
  const store = await writePortableStores({plan, window, scheduledResults});
  const completedAt = new Date().toISOString();
  const result = buildActivationResult({request, completedAt, scheduledResults, store});
  const resultErrors = validateAgainstSchema(result, {...schema, $ref: "#/$defs/result"});
  if (resultErrors.length) throw new Error(`Matthew Henry activation result is invalid:\n- ${resultErrors.join("\n- ")}`);
  const activationRoot = path.join(ACTIVATION_STORE_ROOT, storePlanKey(request.request_id));
  await writeJsonAtomic(path.join(activationRoot, "request.json"), request);
  const resultPath = path.join(activationRoot, "result.json");
  await writeJsonAtomic(resultPath, result);
  process.stdout.write(`Activation result: ${path.relative(ROOT, resultPath)}\n`);
  process.stdout.write(`Durable private library catalog: ${path.relative(ROOT, store.catalogPath)}\n`);
  process.stdout.write("No publication occurred; existing catalog entries remain available if a later worker run fails.\n");
  return {request, window, scheduledResults, store, result, resultPath};
}

function assertEnsureOptions(options) {
  if (!options.request) throw new Error("ensure requires --request PATH.");
  if (options.all || options.book || options.chapter || options.bookIntro || options.model || options.today ||
      options.daysAhead !== undefined || options.readingCount !== undefined) {
    throw new Error("ensure accepts only --request, --dry-run, and optional --max-retries; the request owns the bounded missing-content selection.");
  }
}

async function readEnsureRequest(requestPath) {
  const [request, schema] = await Promise.all([
    readJson(path.resolve(ROOT, requestPath)),
    readJson(ENSURE_SCHEMA_PATH)
  ]);
  const errors = validateAgainstSchema(request, {...schema, $ref: "#/$defs/request"});
  if (errors.length) throw new Error(`Matthew Henry ensure request is invalid:\n- ${errors.join("\n- ")}`);
  return {request, schema};
}

function partitionTargetsByAvailability({targets, availableReadingIds}) {
  const available = new Set(availableReadingIds || []);
  return targets.reduce((partition, target) => {
    (available.has(target.entry.readingId) ? partition.reused : partition.missing).push(target);
    return partition;
  }, {reused: [], missing: []});
}

async function loadVerifiedLibraryCatalog({plan, activationSchema}) {
  const pointerPath = path.join(LIBRARY_STORE_ROOT, "current.json");
  if (!(await exists(pointerPath))) return {catalog: null, pointer: null, pointerPath, catalogPath: null, catalogSha256: null};
  const pointer = await readJson(pointerPath);
  const pointerErrors = validateAgainstSchema(pointer, {...activationSchema, $ref: "#/$defs/pointer"});
  if (pointerErrors.length) throw new Error(`Durable Henry library pointer is invalid:\n- ${pointerErrors.join("\n- ")}`);
  if (pointer.plan_version !== plan.planVersion) {
    throw new Error(`Durable Henry library pointer belongs to ${pointer.plan_version}, not ${plan.planVersion}.`);
  }
  const catalogPath = path.resolve(LIBRARY_STORE_ROOT, pointer.catalog_file);
  if (!catalogPath.startsWith(`${LIBRARY_STORE_ROOT}${path.sep}`) || !(await exists(catalogPath))) {
    throw new Error("Durable Henry library pointer does not resolve to an existing private catalog.");
  }
  const catalogBytes = await readFile(catalogPath);
  const catalogSha256 = sha256(catalogBytes);
  if (catalogSha256 !== pointer.catalog_sha256) {
    throw new Error("Durable Henry library catalog checksum does not match its pointer.");
  }
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  const catalogErrors = validateAgainstSchema(catalog, {...activationSchema, $ref: "#/$defs/catalog"});
  if (catalogErrors.length) throw new Error(`Durable Henry library catalog is invalid:\n- ${catalogErrors.join("\n- ")}`);
  if (catalog.plan_version !== plan.planVersion) {
    throw new Error(`Durable Henry library catalog belongs to ${catalog.plan_version}, not ${plan.planVersion}.`);
  }
  return {catalog, pointer, pointerPath, catalogPath, catalogSha256};
}

async function verifiedCatalogReadingIds({plan, targets, catalog, storeSchema, runtimeSchema}) {
  if (!catalog) return [];
  const descriptors = new Map((catalog.readings || []).map((reading) => [reading.reading_id, reading]));
  const available = [];
  for (const target of targets) {
    const descriptor = descriptors.get(target.entry.readingId);
    if (!descriptor) continue;
    try {
      const readingPath = path.resolve(LIBRARY_STORE_ROOT, descriptor.file);
      if (!readingPath.startsWith(`${LIBRARY_STORE_ROOT}${path.sep}`) || !(await exists(readingPath))) continue;
      const bytes = await readFile(readingPath);
      if (sha256(bytes) !== descriptor.sha256) continue;
      const reading = JSON.parse(bytes.toString("utf8"));
      const errors = validateAgainstSchema(
        reading,
        {...storeSchema, $ref: "#/$defs/reading"},
        {externalSchemas: {"mhc-runtime.schema.json": runtimeSchema}}
      );
      if (errors.length || reading.plan_version !== plan.planVersion || reading.reading_id !== descriptor.reading_id ||
          reading.schedule_date !== descriptor.schedule_date || reading.day_index !== descriptor.day_index ||
          reading.source_plan_day !== descriptor.source_plan_day || reading.chapters.length !== descriptor.passage_count) continue;
      available.push(descriptor.reading_id);
    } catch {
      // A malformed or unreadable artifact is missing for ensure purposes and will be regenerated.
    }
  }
  return available;
}

function buildEnsureResult({request, completedAt, window, generatedReadingIds, reusedReadingIds, catalogPath, catalogSha256}) {
  return {
    schema_version: "mhc-ensure-result/v1",
    request_id: request.request_id,
    plan_version: request.plan_version,
    requested_by: request.requested_by,
    start_reading_id: request.start_reading_id,
    requested_reading_count: request.reading_count,
    completed_at: completedAt,
    status: "ready",
    worker_model: SPARK_MODEL,
    prompt_version: PROMPT_VERSION,
    generation_mode: AUTONOMOUS_GENERATION_MODE,
    publication_status: "not_published",
    contains_scripture: false,
    requested_reading_ids: window.targets.map((target) => target.entry.readingId),
    generated_reading_ids: generatedReadingIds,
    reused_reading_ids: reusedReadingIds,
    library_catalog: {
      file: path.relative(PRIVATE_ROOT, catalogPath).split(path.sep).join("/"),
      sha256: catalogSha256
    }
  };
}

async function ensureSchedule(options) {
  assertEnsureOptions(options);
  const [{request, schema}, plan, appConfig, activationSchema, storeSchema, runtimeSchema] = await Promise.all([
    readEnsureRequest(options.request),
    readJson(ACTIVE_PLAN_PATH),
    readJson(ACTIVE_CONFIG_PATH),
    readJson(ACTIVATION_SCHEMA_PATH),
    readJson(WINDOW_STORE_SCHEMA_PATH),
    readJson(RUNTIME_SCHEMA_PATH)
  ]);
  if (request.plan_version !== plan.planVersion) {
    throw new Error(`Ensure request plan ${request.plan_version} does not match active plan ${plan.planVersion}.`);
  }
  const window = resolveScheduledBatch({
    plan,
    appConfig,
    startReadingId: request.start_reading_id,
    readingCount: request.reading_count
  });
  const library = await loadVerifiedLibraryCatalog({plan, activationSchema});
  const availableReadingIds = await verifiedCatalogReadingIds({
    plan,
    targets: window.targets,
    catalog: library.catalog,
    storeSchema,
    runtimeSchema
  });
  const partition = partitionTargetsByAvailability({targets: window.targets, availableReadingIds});
  process.stdout.write(`Ensure ${request.request_id}: ${partition.reused.length} stored reading(s) ready; ${partition.missing.length} missing.\n`);
  partition.reused.forEach((target) => process.stdout.write(`- reuse ${target.entry.readingId}\n`));
  partition.missing.forEach((target) => process.stdout.write(`- generate ${target.entry.readingId}\n`));
  if (options.dryRun) {
    process.stdout.write("Dry run only; no Spark invocation, audit, catalog, pointer, or ensure-result write occurred.\n");
    return {request, window, partition, scheduledResults: [], store: null, result: null};
  }

  const scheduledResults = [];
  for (const target of partition.missing) {
    scheduledResults.push(await scheduleReading(options, {plan, target}));
  }
  const store = scheduledResults.length
    ? await writePortableStores({plan, window, scheduledResults, writeWindow: false})
    : {
      catalog: library.catalog,
      catalogPath: library.catalogPath,
      catalogSha256: library.catalogSha256,
      pointer: library.pointer,
      pointerPath: library.pointerPath,
      manifest: null,
      manifestPath: null,
      manifestSha256: null,
      readingPaths: []
    };
  if (!store.catalog || !store.catalogPath || !store.catalogSha256) {
    throw new Error("Ensure could not produce or reuse a durable Henry library catalog.");
  }
  const finalAvailableIds = await verifiedCatalogReadingIds({
    plan,
    targets: window.targets,
    catalog: store.catalog,
    storeSchema,
    runtimeSchema
  });
  if (finalAvailableIds.length !== window.targets.length) {
    const unavailable = window.targets.map((target) => target.entry.readingId)
      .filter((readingId) => !finalAvailableIds.includes(readingId));
    throw new Error(`Ensure finished generation but these requested reading artifacts are still unavailable: ${unavailable.join(", ")}.`);
  }
  const completedAt = new Date().toISOString();
  const result = buildEnsureResult({
    request,
    completedAt,
    window,
    generatedReadingIds: partition.missing.map((target) => target.entry.readingId),
    reusedReadingIds: partition.reused.map((target) => target.entry.readingId),
    catalogPath: store.catalogPath,
    catalogSha256: store.catalogSha256
  });
  const resultErrors = validateAgainstSchema(result, {...schema, $ref: "#/$defs/result"});
  if (resultErrors.length) throw new Error(`Matthew Henry ensure result is invalid:\n- ${resultErrors.join("\n- ")}`);
  const ensureRoot = path.join(ENSURE_STORE_ROOT, storePlanKey(request.request_id));
  await writeJsonAtomic(path.join(ensureRoot, "request.json"), request);
  const resultPath = path.join(ensureRoot, "result.json");
  await writeJsonAtomic(resultPath, result);
  process.stdout.write(`Ensure result: ${path.relative(ROOT, resultPath)}\n`);
  process.stdout.write("All requested readings are available from durable private storage; no publication occurred.\n");
  return {request, window, partition, scheduledResults, store, result, resultPath};
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.command || ["help", "--help", "-h"].includes(options.command)) {
    process.stdout.write(usage());
    return;
  }
  if (options.command === "acquire") await acquire(options);
  else if (options.command === "normalize") await normalize(options);
  else if (options.command === "preflight") await preflight();
  else if (options.command === "generate") await generate(options);
  else if (options.command === "pilot") await pilot(options);
  else if (options.command === "validate") {
    const checked = await validateSaved(options);
    process.stdout.write(`${checked.job.job_id} ${checked.job.worker_model}: ${checked.validation.valid ? "valid" : "invalid"}; ${checked.validation.warnings.length} warning(s).\n`);
    if (!checked.validation.valid) process.exitCode = 1;
  } else if (options.command === "compare") await compare(options);
  else if (options.command === "export") await exportResult(options);
  else if (options.command === "schedule-next") await scheduleNext(options);
  else if (options.command === "schedule-window") await scheduleWindow(options);
  else if (options.command === "activate") await activateSchedule(options);
  else if (options.command === "ensure") await ensureSchedule(options);
  else throw new Error(`Unknown command ${options.command}.\n\n${usage()}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`Matthew Henry pipeline failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  acquire,
  activateSchedule,
  applyReviewCorrections,
  buildActivationResult,
  buildEnsureResult,
  buildFactChunks,
  buildWriterChunks,
  buildLibraryCatalog,
  buildLibraryPointer,
  codexExecArgs,
  codexPreflight,
  compare,
  buildPortableWindowReading,
  buildWindowStoreManifest,
  exportResult,
  generate,
  generateOne,
  ensureSchedule,
  loadPipelineManifest,
  normalize,
  parseArgs,
  partitionTargetsByAvailability,
  renderValidationRepairPrompt,
  preflight,
  resultMetrics,
  scheduleNext,
  scheduleWindow,
  validateSaved
};
