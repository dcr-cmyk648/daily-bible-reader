import {FACT_PROMPT_VERSION, PROMPT_VERSION, AUTONOMOUS_GENERATION_MODE, buildFactBriefJobSpec, hydrateFactBriefEvidence, jobFingerprint, sha256, stableJson, validateChapterOutput, validateFactBrief, validateFactBoundChapterOutput, requireAutonomousAdmission} from "./mhc-pipeline.mjs";
import {validateAgainstSchema} from "./schema-validator.mjs";

export const NATIVE_WORK_ITEM_VERSION = "mhc-native-work-item/v1";
export const NATIVE_CANDIDATE_VERSION = "mhc-native-candidate/v1";
export const SPARK = "gpt-5.3-codex-spark";
export const LUNA = "gpt-5.6-luna";

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

export function validateNativeCandidate({candidate, item, candidateSchema, factSchema, chapterSchema}) {
  const errors = validateAgainstSchema(candidate, candidateSchema);
  if (candidate && candidate.work_item_id !== item.work_item_id) errors.push("$.work_item_id: does not bind the selected work item");
  if (workItemDigest(item) !== item.work_item_sha256) errors.push("work item hash is invalid");
  if (errors.length) return {valid: false, errors, warnings: []};
  const chapterJobSpec = {metadata: metadataFor(item), requestedRecords: item.source_view.requested_records, sourceUnits: item.source_view.source_units};
  const factMetadata = buildFactBriefJobSpec({chapterJobSpec, generatedAt: item.created_at}).metadata;
  const factBrief = hydrateFactBriefEvidence({...factMetadata, verse_briefs: candidate.fact_brief.verse_briefs}, {chapterJobSpec});
  const factValidation = validateFactBrief(factBrief, {schema: factSchema, chapterJobSpec});
  const output = {...metadataFor(item), records: candidate.verse_drafts};
  const base = validateChapterOutput(output, {schema: chapterSchema, units: chapterJobSpec.sourceUnits, bookId: output.book_id, chapter: output.chapter, verseCount: item.chapter.verse_count, expectedMetadata: metadataFor(item), expectedVerseIdsOverride: item.verse_ids});
  const bound = validateFactBoundChapterOutput(output, {factBrief, baseValidation: base});
  const admission = requireAutonomousAdmission(bound);
  return {valid: factValidation.valid && admission.valid, errors: [...factValidation.errors, ...admission.errors], warnings: [], factBrief, output, admission};
}

export function safeNativeReport({item = null, action, state, code = null}) {
  return {lane: "henry_backfill", readingId: item && item.reading_id || null, scheduleDate: item && item.schedule_date || null, chunkOrdinal: item && item.chunk_id || null, action, state, ...(code ? {code} : {})};
}

export function assertNativeHandoffBinding({binding, item, staged, event}) {
  const expected={work_item_id:item.work_item_id,work_item_sha256:item.work_item_sha256,lease_id:item.lease_id,model:event.model,automation_id:event.automation_id,source_hash:item.source_hash,normalized_hash:item.normalized_hash,job_id:staged.output?.job_id,fingerprint:jobFingerprint(staged.output),records:staged.output?.records,ledger_event_id:event.event_id};
  for(const [key,value] of Object.entries(expected)) if(JSON.stringify(binding[key])!==JSON.stringify(value)) throw new Error(`Native handoff binding mismatch: ${key}`);
  if(item.required_model!==event.model||item.automation_id!==event.automation_id||staged.work_item_id!==item.work_item_id||staged.work_item_sha256!==item.work_item_sha256||staged.lease_id!==item.lease_id) throw new Error("Native handoff source binding mismatch.");
  return true;
}
