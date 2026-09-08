import {FACT_PROMPT_VERSION, PROMPT_VERSION, AUTONOMOUS_GENERATION_MODE, buildFactBriefJobSpec, hydrateFactBriefEvidence, jobFingerprint, sha256, stableJson, validateChapterOutput, validateFactBrief, validateFactBoundChapterOutput, validateSourceCopyRisk, requireAutonomousAdmission} from "./mhc-pipeline.mjs";
import {validateAgainstSchema} from "./schema-validator.mjs";

export const NATIVE_WORK_ITEM_VERSION = "mhc-native-work-item/v1";
export const NATIVE_CANDIDATE_VERSION = "mhc-native-candidate/v1";
export const SPARK = "gpt-5.3-codex-spark";
export const LUNA = "gpt-5.6-luna";
const MAX_VALIDATION_ERRORS = 24;
const MAX_VALIDATION_ERROR_LENGTH = 320;
export const NATIVE_WORKER_VIEW_VERSION = "mhc-native-worker-view/v1";
export const MAX_WORKER_VIEW_BYTES = 96 * 1024;
export const MAX_WORKER_VIEW_SNIPPETS = 256;
export const MAX_WORKER_VIEW_VERSE_BYTES = 20 * 1024;
export const MAX_WORKER_VIEW_VERSE_SNIPPETS = 64;

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

function nativeWorkItemFingerprint(item) {
  const {schema_version: _schema, work_item_id: _id, work_item_sha256: _hash, lease_id: _lease, created_at: _created, ...identity} = item;
  return sha256(stableJson(identity));
}

export function nativeWorkItemId(item) {
  return `MHNWI-${nativeWorkItemFingerprint(item).slice(0, 32)}`;
}

export function nativeWorkItemLeaseId(item) {
  return sha256(`${nativeWorkItemFingerprint(item)}:lease`);
}

function boundedWorkerVerse({request, sourceUnits}) {
  const atoms = new Map(sourceUnits.flatMap((unit) => (unit.source_atoms || []).map((atom) => [atom.source_atom_id, {unit, atom}])));
  const selectedIds = request.target_marked_source_atom_ids?.length ? request.target_marked_source_atom_ids : request.allowed_source_atom_ids?.slice(0, 1);
  if (!selectedIds?.length) throw new Error(`Native worker view cannot select bounded evidence for ${request.verse_id}.`);
  const units = new Map();
  for (const atomId of selectedIds) {
    const selected = atoms.get(atomId);
    if (!selected || !request.allowed_source_atom_ids?.includes(atomId)) throw new Error(`Native worker view has an unbound selected atom for ${request.verse_id}.`);
    const entry = units.get(selected.unit.source_unit_id) || {source_unit_id:selected.unit.source_unit_id,reference_label:selected.unit.reference_label,source_atoms:[]};
    entry.source_atoms.push({source_atom_id:atomId,evidence_snippets:selected.atom.evidence_snippets || []});
    units.set(entry.source_unit_id, entry);
  }
  const view = {verse_id:request.verse_id,required_coverage_type:request.required_coverage_type,allowed_source_unit_ids:request.allowed_source_unit_ids,allowed_source_atom_ids:request.allowed_source_atom_ids,target_marked_source_atom_ids:request.target_marked_source_atom_ids,required_explicit_identity_terms:request.required_explicit_identity_terms,required_explicit_relations:request.required_explicit_relations,verse_anchor_terms:request.verse_anchor_terms,source_reference_labels:request.source_reference_labels,source_units:[...units.values()]};
  const snippetCount = view.source_units.flatMap((unit) => unit.source_atoms).reduce((count, atom) => count + atom.evidence_snippets.length, 0);
  const bytes = Buffer.byteLength(stableJson(view));
  if (snippetCount > MAX_WORKER_VIEW_VERSE_SNIPPETS || bytes > MAX_WORKER_VIEW_VERSE_BYTES) throw new Error(`Native worker view required evidence exceeds its per-verse ceiling for ${request.verse_id}.`);
  return {view,snippetCount,bytes};
}

export function buildNativeWorkerView(sourceView) {
  const verses = (sourceView?.requested_records || []).map((request) => boundedWorkerVerse({request,sourceUnits:sourceView.source_units || []}));
  const workerView = {schema_version:NATIVE_WORKER_VIEW_VERSION,metadata:{job_id:sourceView?.metadata?.job_id,book_id:sourceView?.metadata?.book_id,chapter:sourceView?.metadata?.chapter},requested_verses:verses.map((verse) => verse.view)};
  const snippetCount = verses.reduce((count, verse) => count + verse.snippetCount, 0);
  const bytes = Buffer.byteLength(stableJson(workerView));
  if (snippetCount > MAX_WORKER_VIEW_SNIPPETS || bytes > MAX_WORKER_VIEW_BYTES) throw new Error("Native worker view required evidence exceeds its chunk ceiling.");
  return {workerView,workerViewSha256:sha256(stableJson(workerView)),snippetCount,bytes};
}

export function hasValidNativeWorkerView(item) {
  if (!Object.hasOwn(item || {}, "worker_view_version") && !Object.hasOwn(item || {}, "worker_view_sha256") && !Object.hasOwn(item || {}, "worker_view")) return true;
  try {
    const expected = buildNativeWorkerView(item.source_view);
    return item.worker_view_version === NATIVE_WORKER_VIEW_VERSION && item.worker_view_sha256 === expected.workerViewSha256 && stableJson(item.worker_view) === stableJson(expected.workerView);
  } catch { return false; }
}

export function buildNativeWorkItem({reading, planVersion, scheduleDate, chunk, normalizedUnits, sourceManifest, model = SPARK, automationId, createdAt}) {
  if (![SPARK, LUNA].includes(model) || !automationId) throw new Error("Native work items require an exact permitted model and automation ID.");
  const spec = chunk.chapterJobSpec;
  const verseIds = spec.requestedRecords.map((record) => record.verse_id);
  const factJobSpec = buildFactBriefJobSpec({chapterJobSpec: spec, generatedAt: createdAt});
  const sourceView = {metadata: spec.metadata, requested_records: spec.requestedRecords, source_units: factJobSpec.sourceUnits};
  const worker = buildNativeWorkerView(sourceView);
  if (!planVersion) throw new Error("Native work items require the current plan version.");
  const identity = {lane: "henry_backfill", plan_version: planVersion, reading_id: reading.readingId, schedule_date: scheduleDate, chapter: {book_id: spec.metadata.book_id, chapter: spec.metadata.chapter, verse_count: reading.verseCount}, chunk_id: chunk.chunkId, verse_ids: verseIds, source_hash: spec.metadata.source_hash, normalized_hash: sha256(stableJson(normalizedUnits)), prompt_version: PROMPT_VERSION, fact_prompt_version: FACT_PROMPT_VERSION, generation_mode: AUTONOMOUS_GENERATION_MODE, required_model: model, required_effort: model === SPARK ? "medium" : "low", automation_id: automationId, source_view: sourceView, worker_view_version:NATIVE_WORKER_VIEW_VERSION,worker_view_sha256:worker.workerViewSha256,worker_view:worker.workerView};
  const fingerprint = sha256(stableJson(identity));
  const item = {schema_version: NATIVE_WORK_ITEM_VERSION, work_item_id: `MHNWI-${fingerprint.slice(0, 32)}`, work_item_sha256: "", ...identity, lease_id: sha256(`${fingerprint}:lease`), created_at: createdAt};
  item.work_item_sha256 = workItemDigest(item);
  return item;
}

function hasOnlyLegacyRawSourceAtoms(item) {
  const units = item?.source_view?.source_units;
  return Array.isArray(units) && units.every((unit) => Array.isArray(unit.source_atoms) &&
    unit.source_atoms.every((atom) => !Object.hasOwn(atom, "evidence_snippets")));
}

function rawSourceViewForLegacyComparison(item) {
  if (!item?.source_view || typeof item.source_view !== "object") return null;
  const sourceView = structuredClone(item.source_view);
  if (!Array.isArray(sourceView.source_units)) return null;
  for (const unit of sourceView.source_units) {
    if (!Array.isArray(unit.source_atoms)) return null;
    for (const atom of unit.source_atoms) delete atom.evidence_snippets;
  }
  return sourceView;
}

export function isCompatibleLegacyNativeWorkItem({item, expected}) {
  if (!item || !expected || !hasOnlyLegacyRawSourceAtoms(item) || workItemDigest(item) !== item.work_item_sha256 ||
      item.work_item_id !== nativeWorkItemId(item) || item.lease_id !== nativeWorkItemLeaseId(item) ||
      stableJson(item.source_view) !== stableJson(rawSourceViewForLegacyComparison(expected))) return false;
  return item.plan_version === expected.plan_version && item.reading_id === expected.reading_id &&
    item.schedule_date === expected.schedule_date && item.chunk_id === expected.chunk_id &&
    item.source_hash === expected.source_hash && item.normalized_hash === expected.normalized_hash &&
    item.prompt_version === expected.prompt_version && item.fact_prompt_version === expected.fact_prompt_version &&
    item.generation_mode === expected.generation_mode && item.required_model === expected.required_model &&
    item.required_effort === expected.required_effort && item.automation_id === expected.automation_id &&
    JSON.stringify(item.chapter) === JSON.stringify(expected.chapter) &&
    JSON.stringify(item.verse_ids) === JSON.stringify(expected.verse_ids);
}

function rebuiltNativeIdentity(item) {
  const rebuilt = structuredClone(item);
  rebuilt.work_item_id = nativeWorkItemId(rebuilt);
  rebuilt.lease_id = nativeWorkItemLeaseId(rebuilt);
  rebuilt.work_item_sha256 = workItemDigest(rebuilt);
  return rebuilt;
}

export function nativeControllerTransitionIdentityCandidates(expectedItem) {
  if (!expectedItem || workItemDigest(expectedItem) !== expectedItem.work_item_sha256 || expectedItem.work_item_id !== nativeWorkItemId(expectedItem) || expectedItem.lease_id !== nativeWorkItemLeaseId(expectedItem)) return [];
  const canonical = structuredClone(expectedItem);
  delete canonical.worker_view_version;
  delete canonical.worker_view_sha256;
  delete canonical.worker_view;
  const raw = structuredClone(canonical);
  for (const unit of raw.source_view?.source_units || []) for (const atom of unit.source_atoms || []) delete atom.evidence_snippets;
  return [expectedItem, rebuiltNativeIdentity(canonical), rebuiltNativeIdentity(raw)]
    .filter((candidate, index, values) => values.findIndex((other) => other.work_item_id === candidate.work_item_id) === index);
}

export function authenticatesNativeControllerTransition({event, expectedItem, sourceHash, normalizedHash, verseIds}) {
  return nativeControllerTransitionIdentityCandidates(expectedItem).some((candidate) =>
    ["missed_primary", "stale_primary"].includes(event?.outcome) && event.model === SPARK &&
    event.plan_version === candidate.plan_version && event.reading_id === candidate.reading_id &&
    event.chapter === `${candidate.chapter.book_id}:${candidate.chapter.chapter}` && event.chunk_id === candidate.chunk_id &&
    event.automation_id === candidate.automation_id && event.work_item_id === candidate.work_item_id &&
    candidate.source_hash === sourceHash && candidate.normalized_hash === normalizedHash &&
    JSON.stringify(candidate.verse_ids) === JSON.stringify(verseIds));
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
  const drafts = new Map((normalized.verse_drafts || []).map((draft) => [draft.verse_id, draft]));
  const normalizeRecord = (value, facts = false) => {
    if (!value || typeof value !== "object") return;
    const label = derivedSourceReferenceLabel(value, requests.get(value.verse_id), item.source_view?.source_units);
    if (label) value.source_reference_label = label;
    if (!facts || !Array.isArray(value.facts)) return;
    for (const fact of value.facts) {
      if (!fact || !Array.isArray(fact.must_include_terms) || fact.must_include_terms.length !== 0) continue;
      const anchor = derivedAnchor(fact.statement, fact.evidence_quote) ||
        derivedAnchor(drafts.get(value.verse_id)?.blurb, fact.evidence_quote);
      if (anchor) fact.must_include_terms = [anchor];
    }
  };
  for (const brief of normalized.fact_brief?.verse_briefs || []) normalizeRecord(brief, true);
  for (const draft of normalized.verse_drafts || []) normalizeRecord(draft);
  return normalized;
}

export function normalizeHydratedFactAnchors({factBrief, output}) {
  const drafts = new Map((output?.records || []).map((draft) => [draft.verse_id, draft]));
  for (const brief of factBrief?.verse_briefs || []) {
    const blurb = drafts.get(brief.verse_id)?.blurb;
    for (const fact of brief.facts || []) {
      if (!Array.isArray(fact.must_include_terms) || fact.must_include_terms.length !== 0) continue;
      const anchor = derivedAnchor(blurb, fact.evidence_quote);
      if (anchor) fact.must_include_terms = [anchor];
    }
  }
  return factBrief;
}

export function validateNativeCandidate({candidate, item, candidateSchema, factSchema, chapterSchema}) {
  const normalizedCandidate = normalizeNativeCandidate({candidate, item});
  const errors = validateAgainstSchema(normalizedCandidate, candidateSchema);
  if (normalizedCandidate && normalizedCandidate.work_item_id !== item.work_item_id) errors.push("$.work_item_id: does not bind the selected work item");
  if (workItemDigest(item) !== item.work_item_sha256) errors.push("work item hash is invalid");
  if (!hasValidNativeWorkerView(item)) errors.push("native worker view is invalid");
  if (errors.length) return {valid: false, errors, warnings: [], candidate: normalizedCandidate};
  const chapterJobSpec = {metadata: metadataFor(item), requestedRecords: item.source_view.requested_records, sourceUnits: item.source_view.source_units};
  const factMetadata = buildFactBriefJobSpec({chapterJobSpec, generatedAt: item.created_at}).metadata;
  const factBrief = hydrateFactBriefEvidence({...factMetadata, verse_briefs: normalizedCandidate.fact_brief.verse_briefs}, {chapterJobSpec});
  const output = {...metadataFor(item), records: normalizedCandidate.verse_drafts};
  normalizeHydratedFactAnchors({factBrief, output});
  const factValidation = validateFactBrief(factBrief, {schema: factSchema, chapterJobSpec});
  const base = validateChapterOutput(output, {schema: chapterSchema, units: chapterJobSpec.sourceUnits, bookId: output.book_id, chapter: output.chapter, verseCount: item.chapter.verse_count, expectedMetadata: metadataFor(item), expectedVerseIdsOverride: item.verse_ids});
  const bound = validateFactBoundChapterOutput(output, {factBrief, baseValidation: base});
  const admission = requireAutonomousAdmission(bound);
  const sourceCopy = validateSourceCopyRisk({records: output.records, sourceAtoms: chapterJobSpec.sourceUnits, requireCitedSource: true});
  return {valid: factValidation.valid && admission.valid && sourceCopy.valid, errors: [...factValidation.errors, ...admission.errors, ...sourceCopy.errors], warnings: [], candidate: normalizedCandidate, factBrief, output, admission};
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
