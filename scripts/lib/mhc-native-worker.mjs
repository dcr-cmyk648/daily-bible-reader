import {FACT_PROMPT_VERSION, PROMPT_VERSION, AUTONOMOUS_GENERATION_MODE, buildFactBriefJobSpec, hydrateFactBriefEvidence, jobFingerprint, sha256, stableJson, validateChapterOutput, validateFactBrief, validateFactBoundChapterOutput, requireAutonomousAdmission} from "./mhc-pipeline.mjs";
import {validateAgainstSchema} from "./schema-validator.mjs";

export const NATIVE_WORK_ITEM_VERSION = "mhc-native-work-item/v1";
export const NATIVE_CANDIDATE_VERSION = "mhc-native-candidate/v1";
export const SPARK = "gpt-5.3-codex-spark";
export const LUNA = "gpt-5.6-luna";
const MAX_VALIDATION_ERRORS = 24;
const MAX_VALIDATION_ERROR_LENGTH = 320;

export function nativeWorkItemPath(item) {
  if (!item || !/^MHNWI-[a-f0-9]{32}$/.test(String(item.work_item_id || ""))) return null;
  return `private-content/automation/mhc-native-work-items/${item.work_item_id}/work-item.json`;
}

export function nativeCandidateValidationDiagnostics({code, errors = []}) {
  const normalized = [...new Set(errors.map((error) => String(error).replace(/[\r\n\t]+/g, " ").slice(0, MAX_VALIDATION_ERROR_LENGTH)).filter(Boolean))].slice(0, MAX_VALIDATION_ERRORS);
  return {
    valid: false,
    code,
    errors: normalized.length ? normalized : [code]
  };
}

export function scheduleDateForEntry(appConfig, entry) {
  const startDate = appConfig && appConfig.sharedStartDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || "")) || !Number.isInteger(entry && entry.dayIndex) || entry.dayIndex < 1) {
    throw new Error("Native work items require a fixed shared start date and positive day index.");
  }
  const [year, month, day] = startDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + entry.dayIndex - 1)).toISOString().slice(0, 10);
}

export function workItemDigest(item) {
  const {work_item_id: _id, work_item_sha256: _hash, lease_id: _lease, created_at: _created, ...identity} = item;
  return sha256(stableJson(identity));
}

export function buildNativeWorkItem({reading, planVersion, scheduleDate, chunk, normalizedUnits, sourceManifest, model = SPARK, automationId, createdAt}) {
  if (![SPARK, LUNA].includes(model) || !automationId) throw new Error("Native work items require an exact permitted model and automation ID.");
  const spec = chunk.chapterJobSpec;
  const verseIds = spec.requestedRecords.map((record) => record.verse_id);
  const sourceView = {metadata: spec.metadata, requested_records: spec.requestedRecords, source_units: spec.sourceUnits};
  if (!planVersion) throw new Error("Native work items require the current plan version.");
  const identity = {lane: "henry_backfill", plan_version: planVersion, reading_id: reading.readingId, schedule_date: scheduleDate, chapter: {book_id: spec.metadata.book_id, chapter: spec.metadata.chapter, verse_count: reading.verseCount}, chunk_id: chunk.chunkId, verse_ids: verseIds, source_hash: spec.metadata.source_hash, normalized_hash: sha256(stableJson(normalizedUnits)), prompt_version: PROMPT_VERSION, fact_prompt_version: FACT_PROMPT_VERSION, generation_mode: AUTONOMOUS_GENERATION_MODE, required_model: model, required_effort: model === SPARK ? "medium" : "low", automation_id: automationId, source_view: sourceView};
  const fingerprint = sha256(stableJson(identity));
  const item = {schema_version: NATIVE_WORK_ITEM_VERSION, work_item_id: `MHNWI-${fingerprint.slice(0, 32)}`, work_item_sha256: "", ...identity, lease_id: sha256(`${fingerprint}:lease`), created_at: createdAt};
  item.work_item_sha256 = workItemDigest(item);
  return item;
}

function metadataFor(item) {
  return {...item.source_view.metadata, worker_model: item.required_model, prompt_version: PROMPT_VERSION, generation_timestamp: item.created_at, validation_status: "unvalidated", review_status: "unreviewed"};
}

const WORD_TOKEN = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function exactPhraseAppears(value, phrase) {
  const words = String(phrase).split(" ").filter(Boolean);
  if (!words.length) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${words.map(escapeRegExp).join("\\s+")}(?=$|[^\\p{L}\\p{N}])`, "iu").test(String(value || ""));
}
function derivedAnchor(statement, evidenceQuote) {
  const words = String(evidenceQuote || "").match(WORD_TOKEN) || [];
  for (let length = 3; length >= 1; length -= 1) {
    for (let start = 0; start + length <= words.length; start += 1) {
      const phrase = words.slice(start, start + length).join(" ");
      if (exactPhraseAppears(statement, phrase) && exactPhraseAppears(evidenceQuote, phrase)) return phrase;
    }
  }
  return null;
}
function derivedSourceReferenceLabel(value, request, sourceUnits) {
  if (!value || !request || !Array.isArray(value.source_unit_ids) || !value.source_unit_ids.length) return null;
  const allowed = new Set(request.allowed_source_unit_ids || []);
  if (new Set(value.source_unit_ids).size !== value.source_unit_ids.length || !value.source_unit_ids.every((id) => allowed.has(id))) return null;
  const byId = new Map((sourceUnits || []).map((unit) => [unit.source_unit_id, unit]));
  const labels = [...new Set(value.source_unit_ids.map((id) => byId.get(id)?.reference_label)
    .filter((label) => request.source_reference_labels?.includes(label)))];
  return labels.length === 1 ? labels[0] : null;
}

export function normalizeNativeCandidate({candidate, item}) {
  if (!candidate || typeof candidate !== "object" || !item || typeof item !== "object") return candidate;
  const normalized = structuredClone(candidate);
  const requests = new Map((item.source_view?.requested_records || []).map((record) => [record.verse_id, record]));
  const normalizeRecord = (value, facts = false) => {
    if (!value || typeof value !== "object") return;
    const label = derivedSourceReferenceLabel(value, requests.get(value.verse_id), item.source_view?.source_units);
    if (label) value.source_reference_label = label;
    if (!facts || !Array.isArray(value.facts)) return;
    for (const fact of value.facts) {
      if (!fact || !Array.isArray(fact.must_include_terms) || fact.must_include_terms.length !== 0) continue;
      const anchor = derivedAnchor(fact.statement, fact.evidence_quote);
      if (anchor) fact.must_include_terms = [anchor];
    }
  };
  for (const brief of normalized.fact_brief?.verse_briefs || []) normalizeRecord(brief, true);
  for (const draft of normalized.verse_drafts || []) normalizeRecord(draft);
  return normalized;
}

export function validateNativeCandidate({candidate, item, candidateSchema, factSchema, chapterSchema}) {
  const normalizedCandidate = normalizeNativeCandidate({candidate, item});
  const errors = validateAgainstSchema(normalizedCandidate, candidateSchema);
  if (normalizedCandidate && normalizedCandidate.work_item_id !== item.work_item_id) errors.push("$.work_item_id: does not bind the selected work item");
  if (workItemDigest(item) !== item.work_item_sha256) errors.push("work item hash is invalid");
  if (errors.length) return {valid: false, errors, warnings: [], candidate: normalizedCandidate};
  const chapterJobSpec = {metadata: metadataFor(item), requestedRecords: item.source_view.requested_records, sourceUnits: item.source_view.source_units};
  const factMetadata = buildFactBriefJobSpec({chapterJobSpec, generatedAt: item.created_at}).metadata;
  const factBrief = hydrateFactBriefEvidence({...factMetadata, verse_briefs: normalizedCandidate.fact_brief.verse_briefs}, {chapterJobSpec});
  const factValidation = validateFactBrief(factBrief, {schema: factSchema, chapterJobSpec});
  const output = {...metadataFor(item), records: normalizedCandidate.verse_drafts};
  const base = validateChapterOutput(output, {schema: chapterSchema, units: chapterJobSpec.sourceUnits, bookId: output.book_id, chapter: output.chapter, verseCount: item.chapter.verse_count, expectedMetadata: metadataFor(item), expectedVerseIdsOverride: item.verse_ids});
  const bound = validateFactBoundChapterOutput(output, {factBrief, baseValidation: base});
  const admission = requireAutonomousAdmission(bound);
  return {valid: factValidation.valid && admission.valid, errors: [...factValidation.errors, ...admission.errors], warnings: [], candidate: normalizedCandidate, factBrief, output, admission};
}

export function safeNativeReport({item = null, action, state, code = null}) {
  return {lane: "henry_backfill", readingId: item && item.reading_id || null, scheduleDate: item && item.schedule_date || null, chunkOrdinal: item && item.chunk_id || null, workItemPath: nativeWorkItemPath(item), action, state, ...(code ? {code} : {})};
}

export function assertNativeHandoffBinding({binding, item, staged, event}) {
  const expected={work_item_id:item.work_item_id,work_item_sha256:item.work_item_sha256,lease_id:item.lease_id,model:event.model,automation_id:event.automation_id,source_hash:item.source_hash,normalized_hash:item.normalized_hash,job_id:staged.output?.job_id,fingerprint:jobFingerprint(staged.output),records:staged.output?.records,ledger_event_id:event.event_id};
  for(const [key,value] of Object.entries(expected)) if(JSON.stringify(binding[key])!==JSON.stringify(value)) throw new Error(`Native handoff binding mismatch: ${key}`);
  if(item.required_model!==event.model||item.automation_id!==event.automation_id||staged.work_item_id!==item.work_item_id||staged.work_item_sha256!==item.work_item_sha256||staged.lease_id!==item.lease_id) throw new Error("Native handoff source binding mismatch.");
  return true;
}
