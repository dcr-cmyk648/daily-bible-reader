#!/usr/bin/env node

import {spawn, spawnSync} from "node:child_process";
import {access, appendFile, mkdir, readFile, readdir, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  MHC_SOURCE,
  PROMPT_VERSION,
  buildBookIntroJobSpec,
  buildChapterJobSpec,
  exportBookIntroRuntime,
  exportChapterRuntime,
  jobFingerprint,
  normalizeBookChapter,
  normalizedBatchHash,
  readSwordModule,
  renderWorkerPrompt,
  resolveScheduledReading,
  resolveScheduledWindow,
  requireFullCorpusConfirmation,
  sha256,
  shouldSkipCompletedJob,
  validateBookIntroOutput,
  validateChapterOutput
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
const PROMPT_PATH = path.join(ROOT, "prompts", "mhc-worker-v4.md");
const CHAPTER_SCHEMA_PATH = path.join(ROOT, "schemas", "mhc-commentary-output.schema.json");
const LEGACY_CHAPTER_SCHEMA_PATH = path.join(ROOT, "schemas", "mhc-commentary-output-v1.schema.json");
const BOOK_INTRO_SCHEMA_PATH = path.join(ROOT, "schemas", "mhc-book-intro-output.schema.json");
const NORMALIZED_SCHEMA_PATH = path.join(ROOT, "schemas", "mhc-normalized-source.schema.json");
const RUNTIME_SCHEMA_PATH = path.join(ROOT, "schemas", "mhc-runtime.schema.json");
const WINDOW_STORE_SCHEMA_PATH = path.join(ROOT, "schemas", "mhc-window-store.schema.json");
const WINDOW_STORE_ROOT = path.join(PRIVATE_ROOT, "stores", "current-window");
const PILOT_MODELS = ["gpt-5.3-codex-spark", "gpt-5.6-luna"];
const SPARK_MODEL = "gpt-5.3-codex-spark";

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
  node scripts/mhc-pipeline.mjs schedule-window [--today YYYY-MM-DD] [--days-ahead 0..7] [--dry-run]

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
    else if (["--book", "--chapter", "--model", "--retrieved-at", "--max-retries", "--today", "--days-ahead"].includes(arg)) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (rest[index + 1] === undefined) throw new Error(`${arg} requires a value.`);
      options[key] = rest[++index];
    } else throw new Error(`Unknown argument ${arg}.`);
  }
  if (options.book) options.book = String(options.book).toUpperCase();
  if (options.chapter !== undefined) options.chapter = Number(options.chapter);
  if (options.maxRetries !== undefined) options.maxRetries = Number(options.maxRetries);
  if (options.daysAhead !== undefined) options.daysAhead = Number(options.daysAhead);
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
    models: PILOT_MODELS.map((slug) => ({slug, available: catalog.has(slug), catalog: catalog.get(slug) || null})),
    catalog
  };
}

async function preflight() {
  const result = codexPreflight();
  process.stdout.write(`${result.cliVersion}; authenticated with ${result.authentication}.\n`);
  result.models.forEach((model) => process.stdout.write(`${model.slug}: ${model.available ? "available" : "unavailable"}; standard speed enforced by disabling fast_mode.\n`));
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

async function generateOne(options) {
  const bookId = options.book || "GEN";
  const chapter = options.chapter || 1;
  const kind = options.bookIntro ? "book_intro" : "chapter";
  const model = options.model;
  if (!model) throw new Error("--model is required.");
  const auth = codexPreflight();
  if (!auth.catalog.has(model)) throw new Error(`Requested model ${model} is unavailable in the installed Codex CLI catalog.`);
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
      generatedAt
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
          verseCount: normalized.manifest.indexed_verse_count, generatedAt});
    }
  }
  const schemaPath = kind === "book_intro" ? BOOK_INTRO_SCHEMA_PATH : CHAPTER_SCHEMA_PATH;
  const [template, schema] = await Promise.all([readFile(PROMPT_PATH, "utf8"), readJson(schemaPath)]);
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

  const checked = await validateOutputFile({kind, outputPath, schema, units: normalized.units, bookId, chapter,
    verseCount: normalized.manifest.indexed_verse_count, metadata: jobSpec.metadata});
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
    output_path: path.relative(PRIVATE_ROOT, outputPath),
    validation_path: path.relative(PRIVATE_ROOT, path.join(jobDir, "validation.json")),
    completed_at: new Date().toISOString(),
    warnings: checked.validation.warnings
  };
  await savePipelineJob(record);
  if (!checked.validation.valid || checked.validation.warnings.length) {
    await queueReview({...record, reason: checked.validation.valid ? "validation_warning" : "validation_failure",
      errors: checked.validation.errors});
  }
  if (!checked.validation.valid) throw new Error(`${model} output failed validation. See ${path.relative(ROOT, jobDir)}.`);
  process.stdout.write(`Completed ${jobSpec.metadata.job_id} with ${model}; ${checked.validation.warnings.length} warning(s).\n`);
  return {...checked, jobSpec, fingerprint, jobDir};
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
  const availability = codexPreflight().catalog;
  const results = [];
  let workerFailed = false;
  for (const model of PILOT_MODELS) {
    if (!availability.has(model)) {
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
  const checked = await validateOutputFile({kind, outputPath, schema, units: normalized.units, bookId, chapter,
    verseCount: normalized.manifest.indexed_verse_count, metadata: expectedMetadata});
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
    "The schedule's main commentary was not changed. This report contains only offline verse condensations and the exact public-domain Henry commentary atoms cited for them; embedded Scripture transcription was removed before generation.", ""
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
  if (options.model && options.model !== SPARK_MODEL) {
    throw new Error(`${command} is a Spark audit lane and requires ${SPARK_MODEL}.`);
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
        maxRetries: options.maxRetries
      });
      const exported = options.dryRun ? null : await exportResult({
        book: passage.bookId,
        chapter: passage.chapter,
        model: SPARK_MODEL
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
        generation_status: options.dryRun ? "prepared" : generated.skipped ? "reused_valid_result" : "completed",
        validation_warnings: generated.validation ? generated.validation.warnings : [],
        runtime_path: exported ? path.relative(PRIVATE_ROOT, exported.outputPath) : null,
        record_count: exported ? Object.keys(exported.runtime.records).length : 0,
        source_atom_count: exported && exported.runtime.source_atoms ? Object.keys(exported.runtime.source_atoms).length : 0,
        runtime: exported && exported.runtime
      };
      passageResults.push(passageResult);
      audit.passages.push(Object.fromEntries(Object.entries(passageResult).filter(([key]) => key !== "runtime")));
    }
    audit.audit_status = options.dryRun ? "prepared" : "unreviewed";
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
  return {
    schema_version: "mhc-window-store/v1",
    store_id: `${plan.planVersion}:${window.preparedOn}:${window.windowEndDate}`,
    plan_version: plan.planVersion,
    generated_at: generatedAt,
    prepared_on: window.preparedOn,
    timezone: window.timezone,
    days_ahead: window.daysAhead,
    window_start_date: window.windowStartDate,
    window_end_date: window.windowEndDate,
    worker_model: SPARK_MODEL,
    prompt_version: PROMPT_VERSION,
    publication_status: "not_published",
    contains_scripture: false,
    readings
  };
}

async function writeWindowStore({plan, window, scheduledResults}) {
  const [storeSchema, runtimeSchema] = await Promise.all([
    readJson(WINDOW_STORE_SCHEMA_PATH),
    readJson(RUNTIME_SCHEMA_PATH)
  ]);
  const externalSchemas = {"mhc-runtime.schema.json": runtimeSchema};
  const descriptors = [];
  const readingPaths = [];
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
    const bytes = `${JSON.stringify(reading, null, 2)}\n`;
    const checksum = sha256(bytes);
    const relativePath = path.join("readings", `${reading.reading_id}.${checksum.slice(0, 16)}.json`);
    const outputPath = path.join(WINDOW_STORE_ROOT, relativePath);
    await mkdir(path.dirname(outputPath), {recursive: true});
    await writeFile(outputPath, bytes, {encoding: "utf8", mode: 0o600});
    descriptors.push({
      reading_id: reading.reading_id,
      schedule_date: reading.schedule_date,
      day_index: reading.day_index,
      source_plan_day: reading.source_plan_day,
      file: relativePath.split(path.sep).join("/"),
      sha256: checksum,
      passage_count: reading.chapters.length,
      review_status: reading.review_status,
      human_review_status: reading.human_review_status
    });
    readingPaths.push(outputPath);
  }
  const manifest = buildWindowStoreManifest({
    plan,
    window,
    generatedAt: new Date().toISOString(),
    readings: descriptors
  });
  const manifestErrors = validateAgainstSchema(manifest, storeSchema, {externalSchemas});
  if (manifestErrors.length) {
    throw new Error(`Portable window manifest failed schema validation:\n- ${manifestErrors.join("\n- ")}`);
  }
  const manifestPath = path.join(WINDOW_STORE_ROOT, "manifest.json");
  await writeJson(manifestPath, manifest);
  return {manifest, manifestPath, readingPaths};
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
    daysAhead: options.daysAhead === undefined ? 7 : options.daysAhead
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
  const store = await writeWindowStore({plan, window, scheduledResults});
  process.stdout.write(`Portable private window store: ${path.relative(ROOT, store.manifestPath)}\n`);
  process.stdout.write("The store is unreviewed, contains no Scripture, and was not published.\n");
  return {window, scheduledResults, store};
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
  codexExecArgs,
  codexPreflight,
  compare,
  buildPortableWindowReading,
  buildWindowStoreManifest,
  exportResult,
  generate,
  generateOne,
  loadPipelineManifest,
  normalize,
  parseArgs,
  preflight,
  resultMetrics,
  scheduleNext,
  scheduleWindow,
  validateSaved
};
