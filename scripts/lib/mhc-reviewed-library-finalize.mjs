import {createHash} from "node:crypto";
import {mkdir, readFile, readdir, rename, writeFile} from "node:fs/promises";
import path from "node:path";
import {assertSchemaValid} from "./schema-validator.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const planKey = (planVersion) => String(planVersion).replace(/[^A-Za-z0-9._-]/g, "_");
const safeReadingId = (readingId) => /^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(String(readingId || ""));

async function readJson(file, label) {
  let bytes;
  try { bytes = await readFile(file); } catch (error) { const wrapped = new Error(`${label} is unavailable.`); wrapped.code = error.code; throw wrapped; }
  try { return {value: JSON.parse(bytes.toString("utf8")), bytes}; } catch { throw new Error(`${label} is not valid JSON.`); }
}
async function atomic(file, bytes) {
  await mkdir(path.dirname(file), {recursive: true, mode: 0o700});
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, bytes, {mode: 0o600});
  await rename(temporary, file);
}
async function contentAddressed(file, bytes, label) {
  try {
    const prior = await readFile(file);
    if (digest(prior) !== digest(bytes)) throw new Error(`${label} already exists with mismatched bytes.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await mkdir(path.dirname(file), {recursive: true, mode: 0o700});
    await writeFile(file, bytes, {mode: 0o600, flag: "wx"});
  }
}
function confined(root, relative, label) {
  if (typeof relative !== "string" || path.isAbsolute(relative)) throw new Error(`${label} is not a safe relative path.`);
  const base = path.resolve(root), resolved = path.resolve(base, relative);
  if (!resolved.startsWith(`${base}${path.sep}`)) throw new Error(`${label} escapes its private root.`);
  return resolved;
}
function scheduleDate(appConfig, entry) {
  const start = appConfig?.sharedStartDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start || "")) || !Number.isInteger(entry?.dayIndex)) throw new Error("The approved plan cannot derive its schedule date.");
  const [year, month, day] = start.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + entry.dayIndex - 1)).toISOString().slice(0, 10);
}
function requireApprovedAudit({audit, plan, entry, readingId, appConfig}) {
  if (audit?.schema_version !== "mhc-schedule-audit/v1" || audit.reading_id !== readingId || audit.plan_version !== plan.planVersion ||
      audit.audit_status !== "approved" || audit.review_status !== "approved" || audit.human_review?.status !== "approved" ||
      audit.human_review?.approval !== "approved" || audit.source_plan_day !== entry.sourcePlanDay ||
      audit.schedule_date !== scheduleDate(appConfig, entry) || audit.timezone !== "America/Detroit" ||
      !Array.isArray(audit.passages) || audit.passages.length !== entry.passages.length) {
    throw new Error("Canonical audit is not an approved binding for the current reading.");
  }
}
function approvedTimestamp(audit) {
  const value = audit.human_review?.reviewed_at;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(value || "")) || !Number.isFinite(Date.parse(value))) throw new Error("Canonical audit has no valid approval timestamp.");
  return value;
}
async function loadPriorCatalog({libraryRoot, planVersion, catalogSchema}) {
  const pointerPath = path.join(libraryRoot, "current.json");
  let pointerResult;
  try { pointerResult = await readJson(pointerPath, "Henry library pointer"); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const pointer = pointerResult.value;
  if (pointer.schema_version !== "mhc-library-pointer/v1" || pointer.plan_version !== planVersion || !/^[a-f0-9]{64}$/.test(String(pointer.catalog_sha256 || ""))) throw new Error("Henry library pointer is stale or unsupported.");
  const catalogPath = confined(libraryRoot, pointer.catalog_file, "Henry library catalog path");
  const catalogResult = await readJson(catalogPath, "Henry library catalog");
  if (digest(catalogResult.bytes) !== pointer.catalog_sha256) throw new Error("Henry library catalog checksum mismatch.");
  assertSchemaValid(catalogResult.value, catalogSchema, {label: "Existing Henry library catalog"});
  if (catalogResult.value.plan_version !== planVersion) throw new Error("Henry library catalog plan binding is stale.");
  return catalogResult.value;
}

async function requireCommittedTransaction({transactionRoot, readingId, planVersion, destinationBytes, transactionSchema}) {
  if (!transactionRoot) throw new Error("Reviewed-library finalization requires a transaction root.");
  let entries;
  try { entries = await readdir(transactionRoot, {withFileTypes: true}); } catch (error) { throw new Error("Native review transaction root is unavailable."); }
  const candidates = entries.filter((entry) => entry.name.startsWith(`${readingId}-`));
  const committed = [];
  for (const candidate of candidates) {
    if (!candidate.isDirectory() || candidate.isSymbolicLink()) throw new Error("Native review transaction candidate is unsafe.");
    const directory = path.join(transactionRoot, candidate.name);
    const [manifestResult, committedResult] = await Promise.all([
      readJson(path.join(directory, "manifest.json"), "Native review transaction manifest"),
      readJson(path.join(directory, "committed.json"), "Native review transaction marker")
    ]);
    const manifest = manifestResult.value, marker = committedResult.value;
    assertSchemaValid(manifest, transactionSchema, {label: "Native review transaction manifest"});
    assertSchemaValid(marker, transactionSchema, {label: "Native review committed marker"});
    if (manifest.reading_id !== readingId || manifest.plan_version !== planVersion || manifest.state !== "staged" ||
        JSON.stringify(marker) !== JSON.stringify({...manifest, state: "committed"})) {
      throw new Error("Native review transaction is not an exact committed binding.");
    }
    for (const destination of manifest.destinations) {
      const staged = await readFile(confined(directory, destination.staged_file, "Native review staged file"));
      if (digest(staged) !== destination.sha256) throw new Error("Native review transaction staged bytes are mismatched.");
    }
    committed.push(manifest);
  }
  if (committed.length !== 1) throw new Error("Reviewed-library finalization requires exactly one committed transaction.");
  const expected = new Map(destinationBytes.map(({destination, bytes}) => [destination, digest(bytes)]));
  const actual = new Map(committed[0].destinations.map((destination) => [destination.destination, destination.sha256]));
  if (actual.size !== expected.size || [...expected].some(([destination, checksum]) => actual.get(destination) !== checksum)) {
    throw new Error("Committed transaction destinations do not exactly bind canonical artifacts.");
  }
}

export async function finalizeReviewedLibrary({canonicalRoot, libraryRoot, transactionRoot, readingId, plan, appConfig, runtimeSchema, readingSchema, catalogSchema, transactionSchema}) {
  if (!safeReadingId(readingId)) throw new Error("A stable reading ID is required for reviewed-library finalization.");
  const entry = plan?.entries?.find((candidate) => candidate.readingId === readingId);
  if (!entry || !plan?.planVersion) throw new Error("The approved plan has no matching reading.");
  const auditPath = path.join(canonicalRoot, "schedule", readingId, "audit.json");
  const auditResult = await readJson(auditPath, "Canonical audit");
  const audit = auditResult.value;
  requireApprovedAudit({audit, plan, entry, readingId, appConfig});
  const approvedAt = approvedTimestamp(audit);
  const chapters = [], transactionDestinations = [{destination:`schedule/${readingId}/audit.json`, bytes:auditResult.bytes}];
  for (let index = 0; index < entry.passages.length; index += 1) {
    const passage = entry.passages[index], auditPassage = audit.passages[index];
    const expectedPath = `runtime/${passage.bookId}/${String(passage.chapter).padStart(3, "0")}.json`;
    if (!auditPassage || auditPassage.book_id !== passage.bookId || auditPassage.chapter !== passage.chapter || auditPassage.verse_count !== passage.verseCount || auditPassage.runtime_path !== expectedPath) throw new Error("Canonical audit passage binding is stale or tampered.");
    const runtimeResult = await readJson(confined(canonicalRoot, expectedPath, "Canonical runtime path"), "Canonical runtime");
    const runtime = runtimeResult.value;
    assertSchemaValid(runtime, runtimeSchema, {label: "Canonical reviewed runtime"});
    if (runtime.book_id !== passage.bookId || runtime.chapter !== passage.chapter || runtime.review_status !== "approved" || runtime.validation_status !== "valid") throw new Error("Canonical runtime is not approved for its audited passage.");
    if (auditPassage.record_count !== undefined && auditPassage.record_count !== Object.keys(runtime.records || {}).length) throw new Error("Canonical audit record count is stale or tampered.");
    if (auditPassage.source_atom_count !== undefined && auditPassage.source_atom_count !== Object.keys(runtime.source_atoms || {}).length) throw new Error("Canonical audit source-atom count is stale or tampered.");
    chapters.push({book_id: passage.bookId, chapter: passage.chapter, verse_count: passage.verseCount, runtime});
    transactionDestinations.push({destination: expectedPath, bytes: runtimeResult.bytes});
  }
  const workerModels = [...new Set(chapters.map((chapter) => chapter.runtime.worker_model))].sort();
  const promptVersions = [...new Set(chapters.map((chapter) => chapter.runtime.prompt_version))];
  if (promptVersions.length !== 1 || promptVersions[0] !== audit.prompt_version || audit.worker_model !== workerModels[0] ||
      JSON.stringify([...(audit.worker_models || [])].sort()) !== JSON.stringify(workerModels)) {
    throw new Error("Canonical audit provenance is stale or tampered.");
  }
  await requireCommittedTransaction({transactionRoot, readingId, planVersion:plan.planVersion, destinationBytes:transactionDestinations, transactionSchema});
  const reading = {schema_version:"mhc-portable-reading/v1",plan_version:plan.planVersion,reading_id:readingId,schedule_date:audit.schedule_date,day_index:entry.dayIndex,source_plan_day:entry.sourcePlanDay,timezone:"America/Detroit",worker_model:workerModels[0],worker_models:workerModels,prompt_version:audit.prompt_version,review_status:"approved",human_review_status:"approved",publication_status:"not_published",contains_scripture:false,chapters};
  assertSchemaValid(reading, {...readingSchema, $ref:"#/$defs/reading"}, {label:"Reviewed portable reading", externalSchemas:{"mhc-runtime.schema.json":runtimeSchema}});
  const bytes = jsonBytes(reading), checksum = digest(bytes), key = planKey(plan.planVersion), relativeReading = `plans/${key}/readings/${readingId}.${checksum.slice(0,16)}.json`;
  const prior = await loadPriorCatalog({libraryRoot, planVersion:plan.planVersion, catalogSchema});
  await contentAddressed(path.join(libraryRoot, relativeReading), bytes, "Reviewed Henry reading");
  const descriptor = {reading_id:readingId,schedule_date:reading.schedule_date,day_index:reading.day_index,source_plan_day:reading.source_plan_day,file:relativeReading,sha256:checksum,passage_count:chapters.length,worker_model:reading.worker_model,worker_models:workerModels,prompt_version:reading.prompt_version,review_status:"approved",human_review_status:"approved"};
  const existing = new Map((prior?.readings || []).map((candidate) => [candidate.reading_id, candidate]));
  const old = existing.get(readingId);
  existing.set(readingId, {...descriptor, first_stored_at:old?.first_stored_at || approvedAt, last_stored_at:old && old.sha256 === checksum ? old.last_stored_at : approvedAt});
  const readings = [...existing.values()].sort((left, right) => left.day_index - right.day_index || left.reading_id.localeCompare(right.reading_id));
  const catalog = {schema_version:"mhc-library-catalog/v1",catalog_id:`${plan.planVersion}:mhc-library`,plan_version:plan.planVersion,updated_at:old && old.sha256 === checksum ? prior.updated_at : approvedAt,worker_model:workerModels[0],worker_models:[...new Set(readings.flatMap((candidate) => candidate.worker_models || [candidate.worker_model]))].sort(),prompt_version:reading.prompt_version,publication_status:"not_published",contains_scripture:false,readings};
  assertSchemaValid(catalog, catalogSchema, {label:"Reviewed Henry library catalog"});
  const catalogBytes = jsonBytes(catalog), catalogRelative = `plans/${key}/catalog.json`, catalogPath = path.join(libraryRoot, catalogRelative);
  if (!prior || digest(jsonBytes(prior)) !== digest(catalogBytes)) await atomic(catalogPath, catalogBytes);
  const pointer = {schema_version:"mhc-library-pointer/v1",plan_version:plan.planVersion,catalog_file:catalogRelative,catalog_sha256:digest(catalogBytes),updated_at:catalog.updated_at};
  const pointerPath = path.join(libraryRoot, "current.json");
  try { const current = await readFile(pointerPath); if (digest(current) !== digest(jsonBytes(pointer))) await atomic(pointerPath, jsonBytes(pointer)); } catch (error) { if (error.code === "ENOENT") await atomic(pointerPath, jsonBytes(pointer)); else throw error; }
  return {readingId, artifactSha256:checksum, catalogSha256:pointer.catalog_sha256, changed:!old || old.sha256 !== checksum};
}
