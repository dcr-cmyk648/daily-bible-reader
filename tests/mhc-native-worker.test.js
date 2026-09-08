import assert from "node:assert/strict";
import test from "node:test";
import {mkdir, mkdtemp, rm, utimes, writeFile} from "node:fs/promises";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertNativeHandoffBinding, buildNativeWorkerView, buildNativeWorkItem, hasValidNativeWorkerView, isCompatibleLegacyNativeWorkItem, nativeCandidateValidationDiagnostics, nativeControllerTransitionIdentityCandidates, nativeWorkItemId, nativeWorkItemLeaseId, nativeWorkItemPath, normalizeHydratedFactAnchors, normalizeNativeCandidate, safeNativeReport, scheduleDateForEntry, validateNativeCandidate, validateNativeCandidateWorkerExposure, workItemDigest, MAX_WORKER_VIEW_SNIPPETS, MAX_WORKER_VIEW_VERSE_BYTES, SPARK, LUNA} from "../scripts/lib/mhc-native-worker.mjs";
import {buildFactBriefJobSpec} from "../scripts/lib/mhc-pipeline.mjs";
import {applyNativeTransaction} from "../scripts/lib/mhc-native-transaction.mjs";
import {activeNativeLeaseWorkItem, assertCurrentLease, authenticatesControllerTransition, incompleteAssemblyReport, isCurrentTerminalFailureWorkItem, nativePairMatchesDefinitions, nativePairSourceState, requiresInitialControllerTransfer, terminalNativeFailureEvent} from "../scripts/mhc-native-worker.mjs";
import {classifyNativeReviewState, nativeReviewWorkOrder} from "../scripts/lib/mhc-native-review-work-order.mjs";

const workSchema = JSON.parse(readFileSync(new URL("../schemas/mhc-native-work-item.schema.json", import.meta.url), "utf8"));
const candidateSchema = JSON.parse(readFileSync(new URL("../schemas/mhc-native-candidate.schema.json", import.meta.url), "utf8"));
const factSchema = JSON.parse(readFileSync(new URL("../schemas/mhc-fact-brief.schema.json", import.meta.url), "utf8"));
const chapterSchema = JSON.parse(readFileSync(new URL("../schemas/mhc-commentary-output.schema.json", import.meta.url), "utf8"));
const ledgerSchema = JSON.parse(readFileSync(new URL("../schemas/mhc-native-ledger.schema.json", import.meta.url), "utf8"));
const transactionSchema = JSON.parse(readFileSync(new URL("../schemas/mhc-native-review-transaction.schema.json", import.meta.url), "utf8"));
const progressSchema = JSON.parse(readFileSync(new URL("../schemas/mhc-native-review-progress.schema.json", import.meta.url), "utf8"));
const pairSchema = JSON.parse(readFileSync(new URL("../schemas/mhc-native-pair.schema.json", import.meta.url), "utf8"));
const state = await import("../scripts/lib/mhc-native-state.mjs");
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const record = {verse_id: "TST.1.1", required_coverage_type: "direct", allowed_source_unit_ids: ["fab.unit"], allowed_source_atom_ids: ["fab.atom"], target_marked_source_atom_ids: ["fab.atom"], required_explicit_identity_terms: [], required_explicit_relations: [], verse_anchor_terms: [], source_reference_labels: ["Fabricated 1:1"]};
const unit = {source_unit_id: "fab.unit", reference_label: "Fabricated 1:1", source_atoms: [{source_atom_id: "fab.atom", text: "FABRICATED test material only.", text_sha256: "a".repeat(64)}]};
const item = buildNativeWorkItem({reading: {readingId: "FAB-001", verseCount: 1}, planVersion: "fabricated", scheduleDate: "2026-09-07", chunk: {chunkId: "001-001", chapterJobSpec: {metadata: {book_id: "TST", chapter: 1, source_hash: "b".repeat(64)}, requestedRecords: [record], sourceUnits: [unit]}}, normalizedUnits: [unit], sourceManifest: {}, automationId: "fabricated-spark", createdAt: "2026-09-07T00:00:00.000Z"});

function fabricatedNativeCandidate(workItem,{atomId,snippetId,evidenceQuote}={}) {
  const verse=workItem.worker_view.requested_verses[0],visibleUnit=verse.source_units[0],visibleAtom=visibleUnit.source_atoms[0],visibleSnippet=visibleAtom.evidence_snippets[0];
  const sourceAtomId=atomId||visibleAtom.source_atom_id,sourceSnippetId=snippetId||visibleSnippet.source_snippet_id,evidence=evidenceQuote||visibleSnippet.text;
  return {schema_version:"mhc-native-candidate/v1",work_item_id:workItem.work_item_id,fact_brief:{verse_briefs:[{verse_id:verse.verse_id,coverage_type:verse.required_coverage_type,source_unit_ids:[visibleUnit.source_unit_id],source_reference_label:visibleUnit.reference_label,facts:[{fact_id:`${verse.verse_id}:f01`,importance:"required",category:"action_or_event",statement:"FABRICATED material remains bounded for the test.",source_atom_id:sourceAtomId,source_snippet_id:sourceSnippetId,evidence_quote:evidence,must_include_terms:["FABRICATED"],qualification:"none",verse_relevance:"target_marker"}]}]},verse_drafts:[{verse_id:verse.verse_id,blurb:"This FABRICATED material remains bounded for validation.",coverage_type:verse.required_coverage_type,scope_note:"Fabricated direct test coverage.",source_unit_ids:[visibleUnit.source_unit_id],source_atom_ids:[sourceAtomId],source_reference_label:visibleUnit.reference_label}]};
}

test("native worker CLI resolves every module export before command dispatch", () => {
  const result = spawnSync(process.execPath, ["scripts/mhc-native-worker.mjs"], {cwd: repositoryRoot, encoding: "utf8"});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: node scripts\/mhc-native-worker\.mjs/);
  assert.doesNotMatch(result.stderr, /does not provide an export/);
});

test("native review apply finalizes the durable library only after its canonical transaction", () => {
  const source = readFileSync(new URL("../scripts/mhc-native-worker.mjs", import.meta.url), "utf8");
  const apply = source.slice(source.indexOf("async function reviewApplyV2"), source.indexOf("export function incompleteAssemblyReport"));
  assert.match(apply, /await applyNativeTransaction\(/);
  assert.match(apply, /await finalizeLibrary\(item\.reading_id\)/);
  assert.ok(apply.indexOf("await applyNativeTransaction(") < apply.indexOf("await finalizeLibrary(item.reading_id)"));
  assert.match(apply, /state:"reviewed_library"/);
});

test("native review work orders classify retained handoffs from trusted completion state", () => {
  const handoff = {valid:true, approvalState:"absent"};
  const common = {handoff, library:{current:true}, attached:{current:true}, manifestBacked:true};
  assert.deepEqual(classifyNativeReviewState({...common, canonical:{state:"committed"}}), {action:"none",state:"completed",stage:"completion",code:null,priorManifestState:"manifest_backed"});
  assert.deepEqual(classifyNativeReviewState({handoff,canonical:{state:"absent"},library:{current:false},attached:{current:false},manifestBacked:false}), {action:"review",state:"pending_review",stage:"review",code:null,priorManifestState:"manifest_unpublished"});
  assert.deepEqual(classifyNativeReviewState({handoff:{valid:true,approvalState:"valid"},canonical:{state:"absent"},library:{current:false},attached:{current:false},manifestBacked:false}), {action:"resume_apply",state:"approved_uncommitted",stage:"admission",code:null,priorManifestState:"manifest_unpublished"});
  assert.deepEqual(classifyNativeReviewState({...common, canonical:{state:"committed"},library:{current:false}}), {action:"recover_finalize",state:"committed_library_debt",stage:"finalization",code:null,priorManifestState:"manifest_backed"});
  assert.deepEqual(classifyNativeReviewState({...common, canonical:{state:"committed"},attached:{current:false}}), {action:"recover_attach",state:"committed_attachment_debt",stage:"attachment",code:null,priorManifestState:"manifest_backed"});
  assert.deepEqual(classifyNativeReviewState({...common, canonical:{state:"committed"},manifestBacked:false}), {action:"recover_publish",state:"committed_publication_debt",stage:"publication",code:null,priorManifestState:"manifest_unpublished"});
  assert.deepEqual(classifyNativeReviewState({...common, canonical:{state:"committed"},library:{current:false,invalid:true}}), {action:"none",state:"blocked",stage:"classification",code:"REVIEW_LIBRARY_INVALID",priorManifestState:"manifest_backed"});
  assert.deepEqual(classifyNativeReviewState({handoff:{valid:false,code:"REVIEW_HANDOFF_INVALID"},canonical:{state:"absent"},library:{current:false},attached:{current:false},manifestBacked:false}), {action:"none",state:"blocked",stage:"classification",code:"REVIEW_HANDOFF_INVALID",priorManifestState:"manifest_unpublished"});
  assert.deepEqual(classifyNativeReviewState({...common, canonical:{state:"invalid",code:"REVIEW_TRANSACTION_AMBIGUOUS"}}), {action:"none",state:"blocked",stage:"classification",code:"REVIEW_TRANSACTION_AMBIGUOUS",priorManifestState:"manifest_backed"});
});

test("native review work orders treat both absent and empty staging as safe no-ops", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhc-native-review-order-"));
  try {
    const input = {root,workRoot:path.join(root,"work"),privateRoot:path.join(root,"private"),canonicalRoot:path.join(root,"canonical"),libraryRoot:path.join(root,"library"),transactionRoot:path.join(root,"transactions"),plan:{planVersion:"fabricated",entries:[]},appConfig:{sharedStartDate:"2026-08-08"},handoffSchema:{},transactionSchema:{},runtimeSchemaPath:path.join(root,"runtime.json")};
    const expected = {lane:"henry_backfill",readingId:null,scheduleDate:null,action:"none",state:"no_review_handoffs",stage:"classification",priorManifestState:"manifest_unchanged"};
    assert.deepEqual(await nativeReviewWorkOrder(input), expected);
    await mkdir(path.join(input.workRoot,"review-staging"),{recursive:true});
    assert.deepEqual(await nativeReviewWorkOrder(input), expected);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("native work order routes a committed reading absent from a valid catalog to finalization recovery", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhc-native-review-library-gap-"));
  try {
    const readingId = "FAB-001", plan = {planVersion:"fabricated",entries:[{readingId,dayIndex:2,passages:[{bookId:"TST",chapter:1,verseCount:1}]}]}, workRoot = path.join(root,"work"), privateRoot = path.join(root,"private"), canonicalRoot = path.join(root,"canonical"), libraryRoot = path.join(root,"library"), transactionRoot = path.join(root,"transactions");
    const writeJson = async (file, value) => { await mkdir(path.dirname(file),{recursive:true}); await writeFile(file,`${JSON.stringify(value,null,2)}\n`); };
    await writeJson(path.join(workRoot,"review-staging",readingId,"review-handoff.json"),{reading_id:readingId,plan_version:"fabricated",status:"unreviewed",publication_status:"not_published",chapters:[{}]});
    const audit = {schema_version:"mhc-schedule-audit/v1",reading_id:readingId,plan_version:"fabricated",audit_status:"approved",review_status:"approved",human_review:{status:"approved",approval:"approved"},passages:[{book_id:"TST",chapter:1,verse_count:1,runtime_path:"runtime/TST/001.json"}]};
    const runtime = {fabricated:true};
    await writeJson(path.join(canonicalRoot,"schedule",readingId,"audit.json"),audit);
    await writeJson(path.join(canonicalRoot,"runtime/TST/001.json"),runtime);
    const bytes = file => readFileSync(file);
    const destinations = [
      {destination:`schedule/${readingId}/audit.json`,staged_file:"staged/0.json",sha256:(await import("../scripts/lib/mhc-pipeline.mjs")).sha256(bytes(path.join(canonicalRoot,"schedule",readingId,"audit.json")))},
      {destination:"runtime/TST/001.json",staged_file:"staged/1.json",sha256:(await import("../scripts/lib/mhc-pipeline.mjs")).sha256(bytes(path.join(canonicalRoot,"runtime/TST/001.json")))}
    ];
    const tx = {schema_version:"mhc-native-review-transaction/v1",reading_id:readingId,plan_version:"fabricated",review_sha256:"a".repeat(64),state:"staged",destinations};
    await writeJson(path.join(transactionRoot, `${readingId}-fab`, "manifest.json"), tx);
    await writeJson(path.join(transactionRoot, `${readingId}-fab`, "committed.json"), {...tx,state:"committed"});
    await mkdir(path.join(transactionRoot, `${readingId}-fab`, "staged"), {recursive:true});
    await writeFile(path.join(transactionRoot, `${readingId}-fab`, "staged/0.json"), bytes(path.join(canonicalRoot,"schedule",readingId,"audit.json")));
    await writeFile(path.join(transactionRoot, `${readingId}-fab`, "staged/1.json"), bytes(path.join(canonicalRoot,"runtime/TST/001.json")));
    const catalog = {schema_version:"mhc-library-catalog/v1",plan_version:"fabricated",readings:[]};
    const catalogBytes = Buffer.from(`${JSON.stringify(catalog,null,2)}\n`);
    const {sha256} = await import("../scripts/lib/mhc-pipeline.mjs");
    await writeFile(path.join(libraryRoot,"plans/fabricated/catalog.json"),catalogBytes,{flag:"w"}).catch(async () => { await mkdir(path.join(libraryRoot,"plans/fabricated"),{recursive:true}); await writeFile(path.join(libraryRoot,"plans/fabricated/catalog.json"),catalogBytes); });
    await writeJson(path.join(libraryRoot,"current.json"),{schema_version:"mhc-library-pointer/v1",plan_version:"fabricated",catalog_file:"plans/fabricated/catalog.json",catalog_sha256:sha256(catalogBytes)});
    await writeJson(path.join(privateRoot,"private-manifest.json"),{readings:{[readingId]:{}}});
    const report = await nativeReviewWorkOrder({root,workRoot,privateRoot,canonicalRoot,libraryRoot,transactionRoot,plan,appConfig:{sharedStartDate:"2026-08-08"},handoffSchema:{},transactionSchema:{},runtimeSchemaPath:path.join(root,"runtime.json")});
    assert.deepEqual(report,{lane:"henry_backfill",readingId,scheduleDate:"2026-08-09",action:"recover_finalize",state:"committed_library_debt",stage:"finalization",priorManifestState:"manifest_backed"});
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("native work order validates an exact approved uncommitted binding for apply resumption", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhc-native-review-resume-"));
  try {
    const readingId = "FAB-001", workRoot = path.join(root,"work"), base = path.join(workRoot,"review-staging",readingId), writeJson = async (file,value) => { await mkdir(path.dirname(file),{recursive:true}); await writeFile(file,`${JSON.stringify(value,null,2)}\n`); };
    const {sha256,stableJson} = await import("../scripts/lib/mhc-pipeline.mjs");
    const handoff = {reading_id:readingId,plan_version:"fabricated",status:"unreviewed",publication_status:"not_published",chapters:[{}]};
    const candidate = {reading_id:readingId,plan_version:"fabricated",handoff_sha256:sha256(stableJson(handoff))};
    const review = {reading_id:readingId,plan_version:"fabricated",status:"approved",assertions:{fabricated:true}};
    const approval = {reading_id:readingId,plan_version:"fabricated",handoff_sha256:sha256(stableJson(handoff)),review_candidate_sha256:sha256(stableJson(candidate)),schedule_review_sha256:sha256(stableJson(review))};
    await Promise.all([writeJson(path.join(base,"review-handoff.json"),handoff),writeJson(path.join(base,"review-candidate.json"),candidate),writeJson(path.join(base,"review-approved.json"),review),writeJson(path.join(base,"review-approval.json"),approval)]);
    const pendingId = "FAB-002";
    await writeJson(path.join(workRoot,"review-staging",pendingId,"review-handoff.json"),{reading_id:pendingId,plan_version:"fabricated",status:"unreviewed",publication_status:"not_published",chapters:[{}]});
    const report = await nativeReviewWorkOrder({root,workRoot,privateRoot:path.join(root,"private"),canonicalRoot:path.join(root,"canonical"),libraryRoot:path.join(root,"library"),transactionRoot:path.join(root,"transactions"),plan:{planVersion:"fabricated",entries:[{readingId,dayIndex:2,passages:[{bookId:"TST",chapter:1,verseCount:1}]},{readingId:pendingId,dayIndex:1,passages:[{bookId:"TST",chapter:1,verseCount:1}]}]},appConfig:{sharedStartDate:"2026-08-08"},handoffSchema:{},transactionSchema:{},approvalSchema:{},candidateSchema:{},reviewSchema:{},runtimeSchemaPath:path.join(root,"runtime.json")});
    assert.deepEqual(report,{lane:"henry_backfill",readingId,scheduleDate:"2026-08-09",action:"resume_apply",state:"approved_uncommitted",stage:"admission",priorManifestState:"manifest_unpublished"});
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("native work order fails closed when an orphaned transaction exists without its canonical audit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhc-native-review-orphan-"));
  try {
    const readingId = "FAB-001", workRoot = path.join(root,"work"), transactionRoot = path.join(root,"transactions"), writeJson = async (file,value) => { await mkdir(path.dirname(file),{recursive:true}); await writeFile(file,`${JSON.stringify(value)}\n`); };
    await writeJson(path.join(workRoot,"review-staging",readingId,"review-handoff.json"),{reading_id:readingId,plan_version:"fabricated",status:"unreviewed",publication_status:"not_published",chapters:[{}]});
    await mkdir(path.join(transactionRoot,`${readingId}-orphan`),{recursive:true});
    const report = await nativeReviewWorkOrder({root,workRoot,privateRoot:path.join(root,"private"),canonicalRoot:path.join(root,"canonical"),libraryRoot:path.join(root,"library"),transactionRoot,plan:{planVersion:"fabricated",entries:[{readingId,dayIndex:1,passages:[{bookId:"TST",chapter:1,verseCount:1}]}]},appConfig:{sharedStartDate:"2026-08-08"},handoffSchema:{},transactionSchema:{},runtimeSchemaPath:path.join(root,"runtime.json")});
    assert.deepEqual(report,{lane:"henry_backfill",readingId,scheduleDate:"2026-08-08",action:"none",state:"blocked",stage:"classification",code:"REVIEW_TRANSACTION_ORPHANED",priorManifestState:"manifest_unpublished"});
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("Luna transfer records the bound Spark work item rather than its controller wrapper", () => {
  const source = readFileSync(new URL("../scripts/mhc-native-worker.mjs", import.meta.url), "utf8");
  assert.match(source, /await event\(primary\.item,/);
  assert.doesNotMatch(source, /await event\(primary,/);
});

test("native work-item dates come from app configuration rather than the plan document", () => {
  assert.equal(scheduleDateForEntry({sharedStartDate: "2026-08-08"}, {dayIndex: 28}), "2026-09-04");
  assert.throws(() => scheduleDateForEntry({}, {dayIndex: 28}), /fixed shared start date/);
});

test("native work items hash the bound selection and source view", () => {
  assert.equal(item.schema_version, "mhc-native-work-item/v1");
  assert.match(item.work_item_id, /^MHNWI-[a-f0-9]{32}$/);
  assert.equal(item.required_model, SPARK);
  assert.equal(item.plan_version, "fabricated");
  assert.equal(item.source_view.requested_records[0].verse_id, "TST.1.1");
  assert.equal(workSchema.properties.schema_version.const, item.schema_version);
  const changed = structuredClone(item); changed.source_hash = "c".repeat(64);
  const candidate = {schema_version: "mhc-native-candidate/v1", work_item_id: item.work_item_id, fact_brief: {verse_briefs: []}, verse_drafts: []};
  const result = validateNativeCandidate({candidate, item: changed, candidateSchema, factSchema, chapterSchema});
  assert.ok(result.errors.includes("work item hash is invalid"));
});

test("native work items expose and bind the exact canonical fact-brief snippets", () => {
  const spec = {metadata: item.source_view.metadata, requestedRecords: item.source_view.requested_records, sourceUnits: [{...unit}]};
  const expected = buildFactBriefJobSpec({chapterJobSpec: spec, generatedAt: item.created_at});
  assert.deepEqual(item.source_view.source_units, expected.sourceUnits);
  const snippet = item.source_view.source_units[0].source_atoms[0].evidence_snippets[0];
  assert.match(snippet.source_snippet_id, /^fab\.atom:/);
  assert.equal(snippet.text, "FABRICATED test material only.");
  const tampered = structuredClone(item);
  tampered.source_view.source_units[0].source_atoms[0].evidence_snippets[0].text = "FABRICATED altered source.";
  assert.notEqual(workItemDigest(tampered), item.work_item_sha256);
  const candidate = {schema_version: "mhc-native-candidate/v1", work_item_id: item.work_item_id, fact_brief: {verse_briefs: []}, verse_drafts: []};
  assert.ok(validateNativeCandidate({candidate, item: tampered, candidateSchema, factSchema, chapterSchema}).errors.includes("work item hash is invalid"));
});

test("native worker views compact large shared ranges while preserving required evidence deterministically", async () => {
  const worker = item.worker_view;
  assert.ok(Buffer.byteLength(JSON.stringify(worker)) < Buffer.byteLength(JSON.stringify(item.source_view)));
  assert.deepEqual(worker.requested_verses[0].target_marked_source_atom_ids, ["fab.atom"]);
  const atom = worker.requested_verses[0].source_units[0].source_atoms[0];
  assert.equal(atom.source_atom_id, "fab.atom");
  assert.equal(Object.hasOwn(atom, "text"), false);
  assert.deepEqual(atom.evidence_snippets, item.source_view.source_units[0].source_atoms[0].evidence_snippets);
  assert.equal(hasValidNativeWorkerView(item), true);
  const tampered = structuredClone(item); tampered.worker_view.requested_verses[0].source_units[0].source_atoms[0].evidence_snippets = [];
  assert.equal(hasValidNativeWorkerView(tampered), false);
  const fallback = structuredClone(item.source_view); fallback.requested_records[0].target_marked_source_atom_ids = [];
  assert.equal(buildNativeWorkerView(fallback).workerView.requested_verses[0].source_units[0].source_atoms[0].source_atom_id, "fab.atom");
  const oversized = structuredClone(item.source_view);
  oversized.source_units[0].source_atoms[0].text = [
    ...Array.from({length: MAX_WORKER_VIEW_SNIPPETS + 1}, (_, index) => `FABRICATED shared range evidence sentence number ${index} has enough words for a bounded snippet.`),
    "RequiredName is the FabricatedRole for this test relationship.",
    "The AnchorPhrase is retained for this fabricated verse."
  ].join(" ");
  oversized.source_units[0].source_atoms[0].evidence_snippets = (await import("../scripts/lib/mhc-pipeline.mjs")).evidenceSnippetsForAtom(oversized.source_units[0].source_atoms[0]);
  oversized.requested_records[0].required_explicit_identity_terms = ["RequiredName"];
  oversized.requested_records[0].required_explicit_relations = [{term:"RequiredName",relation:"FabricatedRole"}];
  oversized.requested_records[0].verse_anchor_terms = ["AnchorPhrase"];
  const compacted = buildNativeWorkerView(oversized);
  const compactedAgain = buildNativeWorkerView(structuredClone(oversized));
  assert.equal(compacted.workerViewSha256, compactedAgain.workerViewSha256);
  assert.ok(compacted.snippetCount < oversized.source_units[0].source_atoms[0].evidence_snippets.length);
  assert.ok(compacted.snippetCount <= MAX_WORKER_VIEW_SNIPPETS);
  assert.ok(compacted.bytes <= MAX_WORKER_VIEW_VERSE_BYTES);
  const evidence = compacted.workerView.requested_verses[0].source_units.flatMap((sourceUnit) => sourceUnit.source_atoms).flatMap((atomValue) => atomValue.evidence_snippets).map((snippetValue) => snippetValue.text).join(" ");
  assert.match(evidence, /RequiredName/);
  assert.match(evidence, /FabricatedRole/);
  assert.match(evidence, /AnchorPhrase/);

  const uncovered = structuredClone(oversized);
  uncovered.requested_records[0].required_explicit_identity_terms = ["AbsentRequiredTerm"];
  assert.throws(() => buildNativeWorkerView(uncovered), (error) => error.code === "NATIVE_WORKER_VIEW_REQUIRED_COVERAGE");
  const cannotFit = structuredClone(item.source_view);
  cannotFit.requested_records[0].source_reference_labels = ["F".repeat(MAX_WORKER_VIEW_VERSE_BYTES + 1)];
  assert.throws(() => buildNativeWorkerView(cannotFit), (error) => error.code === "NATIVE_WORKER_VIEW_VERSE_CEILING");
  const chunkCannotFit = structuredClone(item.source_view);
  chunkCannotFit.requested_records = Array.from({length:6},(_,index)=>({...structuredClone(record),verse_id:`TST.1.${index+1}`,source_reference_labels:["F".repeat(18*1024)]}));
  assert.throws(() => buildNativeWorkerView(chunkCannotFit), (error) => error.code === "NATIVE_WORKER_VIEW_CHUNK_CEILING");
  const snippetTamper = structuredClone(oversized);
  snippetTamper.source_units[0].source_atoms[0].evidence_snippets[0].text += " altered";
  assert.throws(() => buildNativeWorkerView(snippetTamper), (error) => error.code === "NATIVE_WORKER_VIEW_EVIDENCE_TAMPERED");
});

test("candidate validation admits only atoms and exact snippets exposed for that compact verse view", async () => {
  const visibleCandidate=fabricatedNativeCandidate(item);
  assert.deepEqual(validateNativeCandidateWorkerExposure({candidate:visibleCandidate,item}),[]);

  const sourceUnit={...unit,source_atoms:[
    {source_atom_id:"fab.visible",text:"FABRICATED visible evidence remains bounded for this test only.",text_sha256:"b".repeat(64)},
    {source_atom_id:"fab.hidden",text:"FABRICATED hidden evidence must not be admitted by validation.",text_sha256:"c".repeat(64)}
  ]};
  const twoAtomRecord={...record,allowed_source_atom_ids:["fab.visible","fab.hidden"],target_marked_source_atom_ids:["fab.visible"]};
  const twoAtomItem=buildNativeWorkItem({reading:{readingId:"FAB-001",verseCount:1},planVersion:"fabricated",scheduleDate:"2026-09-07",chunk:{chunkId:"001-001",chapterJobSpec:{metadata:{book_id:"TST",chapter:1,source_hash:"d".repeat(64)},requestedRecords:[twoAtomRecord],sourceUnits:[sourceUnit]}},normalizedUnits:[sourceUnit],sourceManifest:{},automationId:"fabricated-spark",createdAt:"2026-09-07T00:00:00.000Z"});
  const hiddenAtom=twoAtomItem.source_view.source_units[0].source_atoms.find((atomValue)=>atomValue.source_atom_id==="fab.hidden"),hiddenAtomSnippet=hiddenAtom.evidence_snippets[0];
  const hiddenAtomCandidate=fabricatedNativeCandidate(twoAtomItem,{atomId:hiddenAtom.source_atom_id,snippetId:hiddenAtomSnippet.source_snippet_id,evidenceQuote:hiddenAtomSnippet.text});
  const hiddenAtomResult=validateNativeCandidate({candidate:hiddenAtomCandidate,item:twoAtomItem,candidateSchema,factSchema,chapterSchema});
  assert.equal(hiddenAtomResult.valid,false);
  assert.ok(hiddenAtomResult.errors.some((error)=>/atom hidden/.test(error)));

  const multiSnippetUnit={...unit,source_atoms:[{source_atom_id:"fab.multi",text:"FABRICATED visible evidence sentence has enough words for one bounded snippet. FABRICATED hidden evidence sentence has enough words for another bounded snippet.",text_sha256:"e".repeat(64)}]};
  const multiSnippetRecord={...record,allowed_source_atom_ids:["fab.multi"],target_marked_source_atom_ids:["fab.multi"]};
  const multiSnippetItem=buildNativeWorkItem({reading:{readingId:"FAB-001",verseCount:1},planVersion:"fabricated",scheduleDate:"2026-09-07",chunk:{chunkId:"001-001",chapterJobSpec:{metadata:{book_id:"TST",chapter:1,source_hash:"f".repeat(64)},requestedRecords:[multiSnippetRecord],sourceUnits:[multiSnippetUnit]}},normalizedUnits:[multiSnippetUnit],sourceManifest:{},automationId:"fabricated-spark",createdAt:"2026-09-07T00:00:00.000Z"});
  const visibleSnippetId=multiSnippetItem.worker_view.requested_verses[0].source_units[0].source_atoms[0].evidence_snippets[0].source_snippet_id;
  const hiddenSnippet=multiSnippetItem.source_view.source_units[0].source_atoms[0].evidence_snippets.find((snippet)=>snippet.source_snippet_id!==visibleSnippetId);
  assert.ok(hiddenSnippet);
  const hiddenSnippetCandidate=fabricatedNativeCandidate(multiSnippetItem,{atomId:"fab.multi",snippetId:hiddenSnippet.source_snippet_id,evidenceQuote:hiddenSnippet.text});
  const hiddenSnippetResult=validateNativeCandidate({candidate:hiddenSnippetCandidate,item:multiSnippetItem,candidateSchema,factSchema,chapterSchema});
  assert.equal(hiddenSnippetResult.valid,false);
  assert.ok(hiddenSnippetResult.errors.some((error)=>/snippet hidden/.test(error)));
});

test("only a complete authenticated raw legacy item remains ledger-compatible after snippet binding", () => {
  const legacy = structuredClone(item);
  for (const atom of legacy.source_view.source_units[0].source_atoms) delete atom.evidence_snippets;
  legacy.work_item_id = nativeWorkItemId(legacy);
  legacy.lease_id = nativeWorkItemLeaseId(legacy);
  legacy.work_item_sha256 = workItemDigest(legacy);
  assert.equal(isCompatibleLegacyNativeWorkItem({item: legacy, expected: item}), true);
  const sourceViewTampered = structuredClone(legacy);
  sourceViewTampered.source_view.source_units[0].source_atoms[0].text = "FABRICATED altered source.";
  sourceViewTampered.work_item_id = nativeWorkItemId(sourceViewTampered);
  sourceViewTampered.lease_id = nativeWorkItemLeaseId(sourceViewTampered);
  sourceViewTampered.work_item_sha256 = workItemDigest(sourceViewTampered);
  assert.equal(isCompatibleLegacyNativeWorkItem({item: sourceViewTampered, expected: item}), false);
  legacy.source_hash = "d".repeat(64);
  legacy.work_item_sha256 = workItemDigest(legacy);
  assert.equal(isCompatibleLegacyNativeWorkItem({item: legacy, expected: item}), false);
  assert.equal(isCompatibleLegacyNativeWorkItem({item: item, expected: item}), false);
});

test("native candidates reject model provenance and reports return only the deterministic relative work-item path", () => {
  const invalid = {schema_version: "mhc-native-candidate/v1", work_item_id: item.work_item_id, fact_brief: {verse_briefs: []}, verse_drafts: [], worker_model: SPARK};
  const result = validateNativeCandidate({candidate: invalid, item, candidateSchema, factSchema, chapterSchema});
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("additional property")));
  const workItemPath = `private-content/automation/mhc-native-work-items/${item.work_item_id}/work-item.json`;
  assert.equal(nativeWorkItemPath(item), workItemPath);
  assert.deepEqual(safeNativeReport({item, action: "prepared", state: "leased"}), {lane: "henry_backfill", readingId: "FAB-001", scheduleDate: "2026-09-07", chunkOrdinal: "001-001", workItemPath, action: "prepared", state: "leased"});
  assert.deepEqual(safeNativeReport({action: "none", state: "no_eligible_reading"}), {lane: "henry_backfill", readingId: null, scheduleDate: null, chunkOrdinal: null, workItemPath: null, action: "none", state: "no_eligible_reading"});
});

test("retryable candidate diagnostics are bounded and do not become a terminal model failure", () => {
  const diagnostics = nativeCandidateValidationDiagnostics({
    code: "NATIVE_CANDIDATE_INVALID",
    errors: ["first\nerror", "first\nerror", "x".repeat(500), ...Array.from({length: 30}, (_, index) => `error-${index}`)]
  });
  assert.equal(diagnostics.valid, false);
  assert.equal(diagnostics.code, "NATIVE_CANDIDATE_INVALID");
  assert.equal(diagnostics.errors[0], "first error");
  assert.equal(diagnostics.errors.length, 24);
  assert.ok(diagnostics.errors.every((error) => error.length <= 320));
  assert.equal(Object.hasOwn(diagnostics, "outcome"), false);
});

test("incomplete authenticated assembly is a safe normal-progress no-op", () => {
  assert.deepEqual(incompleteAssemblyReport(item, {complete: false}), safeNativeReport({item, action: "none", state: "reading_incomplete"}));
  assert.equal(incompleteAssemblyReport(item, {complete: true}), null);
  assert.equal(incompleteAssemblyReport(item, {complete: false, blocked: true}), null);
});

test("controller-only Spark transitions require the exact reconstructed work-item identity", () => {
  const transition = event({outcome: "missed_primary", automation_id: item.automation_id, work_item_id: item.work_item_id});
  const binding = {event: transition, expectedItem: item, sourceHash: item.source_hash, normalizedHash: item.normalized_hash, verseIds: item.verse_ids};
  assert.equal(authenticatesControllerTransition(binding), true);
  const identities = nativeControllerTransitionIdentityCandidates(item);
  assert.equal(identities.length, 3);
  for (const identity of identities) assert.equal(authenticatesControllerTransition({...binding, event: {...transition, work_item_id: identity.work_item_id}}), true);
  assert.equal(authenticatesControllerTransition({...binding, event: {...transition, work_item_id: "MHNWI-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}), false);
  assert.equal(authenticatesControllerTransition({...binding, event: {...transition, model: LUNA}}), false);
  const altered = structuredClone(item); altered.source_view.source_units[0].source_atoms[0].text = "FABRICATED altered source."; altered.work_item_sha256 = workItemDigest(altered);
  assert.equal(authenticatesControllerTransition({...binding, expectedItem: altered}), false);
  const partial = state.deriveChapterDecision({events: [transition, event({event_id: "MHNLE-luna-validated", model: LUNA, outcome: "validated", work_item_id: "MHNWI-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", automation_id: "fabricated-luna"})], orderedChunkIds: ["001-001", "002-002"], now: "2026-11-01T05:12:00.000Z"});
  assert.equal(partial.owner, LUNA);
  assert.notEqual(partial.complete, true);
  assert.deepEqual(incompleteAssemblyReport(item, partial), safeNativeReport({item, action: "none", state: "reading_incomplete"}));
});

test("a partially complete Luna chapter leases its next chunk without repeating the Spark transition", () => {
  assert.equal(requiresInitialControllerTransfer(LUNA, {reason: "missed_primary", transferChunkId: "001-004"}), true);
  const existingTransfer = state.deriveChapterDecision({events: [event({outcome: "missed_primary", chunk_id: "001-004"}), event({event_id: "MHNLE-luna-first", model: LUNA, outcome: "validated", chunk_id: "001-004", work_item_id: "MHNWI-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", automation_id: "fabricated-luna"})], orderedChunkIds: ["001-004", "005-008"], now: "2026-11-01T05:12:00.000Z"});
  assert.equal(existingTransfer.owner, LUNA);
  assert.equal(existingTransfer.nextChunkId, "005-008");
  assert.equal(requiresInitialControllerTransfer(LUNA, existingTransfer), false);
});

test("native candidate normalization repairs only uniquely bound labels and exact shared anchors", () => {
  const candidate = {schema_version: "mhc-native-candidate/v1", work_item_id: item.work_item_id, fact_brief: {verse_briefs: [{verse_id: "TST.1.1", source_unit_ids: ["fab.unit"], source_reference_label: "wrong", facts: [{statement: "FABRICATED test material only.", evidence_quote: "FABRICATED test material only.", must_include_terms: []}]}]}, verse_drafts: [{verse_id: "TST.1.1", source_unit_ids: ["fab.unit"], source_reference_label: "wrong", blurb: "FABRICATED prose remains unchanged."}]};
  const normalized = normalizeNativeCandidate({candidate, item});
  assert.equal(normalized.fact_brief.verse_briefs[0].source_reference_label, "Fabricated 1:1");
  assert.equal(normalized.verse_drafts[0].source_reference_label, "Fabricated 1:1");
  assert.deepEqual(normalized.fact_brief.verse_briefs[0].facts[0].must_include_terms, ["FABRICATED test material"]);
  assert.equal(normalized.fact_brief.verse_briefs[0].facts[0].statement, candidate.fact_brief.verse_briefs[0].facts[0].statement);
  assert.equal(normalized.fact_brief.verse_briefs[0].facts[0].evidence_quote, candidate.fact_brief.verse_briefs[0].facts[0].evidence_quote);
  assert.equal(normalized.verse_drafts[0].blurb, candidate.verse_drafts[0].blurb);
});

test("native candidate normalization leaves non-derivable labels and anchors invalid", () => {
  const candidate = {schema_version: "mhc-native-candidate/v1", work_item_id: item.work_item_id, fact_brief: {verse_briefs: [{verse_id: "TST.1.1", source_unit_ids: ["unknown.unit"], source_reference_label: "wrong", facts: [{statement: "statement-only", evidence_quote: "evidence-only", must_include_terms: []}]}]}, verse_drafts: [{verse_id: "TST.1.1", source_unit_ids: ["unknown.unit"], source_reference_label: "wrong"}]};
  const normalized = normalizeNativeCandidate({candidate, item});
  assert.equal(normalized.fact_brief.verse_briefs[0].source_reference_label, "wrong");
  assert.deepEqual(normalized.fact_brief.verse_briefs[0].facts[0].must_include_terms, []);
  assert.equal(normalized.verse_drafts[0].source_reference_label, "wrong");
  const checked = validateNativeCandidate({candidate, item, candidateSchema, factSchema, chapterSchema});
  assert.equal(checked.valid, false);
  assert.equal(checked.candidate.fact_brief.verse_briefs[0].source_reference_label, "wrong");
});

test("native candidate normalization may derive an evidence anchor already retained by the final blurb", () => {
  const candidate = {schema_version: "mhc-native-candidate/v1", work_item_id: item.work_item_id, fact_brief: {verse_briefs: [{verse_id: "TST.1.1", source_unit_ids: ["fab.unit"], source_reference_label: "Fabricated 1:1", facts: [{statement: "A wholly paraphrased fact.", evidence_quote: "FABRICATED test material only.", must_include_terms: []}]}]}, verse_drafts: [{verse_id: "TST.1.1", source_unit_ids: ["fab.unit"], source_reference_label: "Fabricated 1:1", blurb: "The FABRICATED test material remains explicit."}]};
  const normalized = normalizeNativeCandidate({candidate, item});
  assert.deepEqual(normalized.fact_brief.verse_briefs[0].facts[0].must_include_terms, ["FABRICATED test material"]);
  assert.equal(normalized.fact_brief.verse_briefs[0].facts[0].statement, candidate.fact_brief.verse_briefs[0].facts[0].statement);
  assert.equal(normalized.verse_drafts[0].blurb, candidate.verse_drafts[0].blurb);
});

test("post-hydration normalization recovers only exact trusted-evidence anchors retained by the final blurb", () => {
  const factBrief = {verse_briefs: [{verse_id: "TST.1.1", facts: [{evidence_quote: "FABRICATED trusted evidence phrase.", must_include_terms: []}]}, {verse_id: "TST.1.2", facts: [{evidence_quote: "FABRICATED trusted evidence phrase.", must_include_terms: []}]}]};
  const output = {records: [{verse_id: "TST.1.1", blurb: "A FABRICATED trusted evidence phrase remains."}, {verse_id: "TST.1.2", blurb: "No overlapping anchor appears here."}]};
  normalizeHydratedFactAnchors({factBrief, output});
  assert.deepEqual(factBrief.verse_briefs[0].facts[0].must_include_terms, ["FABRICATED trusted evidence"]);
  assert.deepEqual(factBrief.verse_briefs[1].facts[0].must_include_terms, []);
});

test("handoff bindings reject tampered staged/event fields", async () => {
  const staged={work_item_id:item.work_item_id,work_item_sha256:item.work_item_sha256,lease_id:item.lease_id,output:{job_id:"FAB-JOB",records:[]}};
  const validated=event({event_id:"MHNLE-validated",outcome:"validated",automation_id:item.automation_id});
  const binding={work_item_id:item.work_item_id,work_item_sha256:item.work_item_sha256,lease_id:item.lease_id,model:SPARK,automation_id:item.automation_id,source_hash:item.source_hash,normalized_hash:item.normalized_hash,job_id:"FAB-JOB",fingerprint:(await import("../scripts/lib/mhc-pipeline.mjs")).jobFingerprint(staged.output),records:[],ledger_event_id:"MHNLE-validated"};
  assert.equal(assertNativeHandoffBinding({binding,item,staged,event:validated}),true);
  assert.throws(()=>assertNativeHandoffBinding({binding:{...binding,lease_id:"x".repeat(64)},item,staged,event:validated}),/lease_id/);
});

const event = (overrides = {}) => state.makeLedgerEvent({plan_version:"fabricated",reading_id:"FAB-001",chapter:"TST:1",chunk_id:"001-001",work_item_id:item.work_item_id,model:SPARK,automation_id:"fabricated",primary_slot:"2026-11-01T05:00:00.000Z",at:"2026-11-01T05:01:00.000Z",outcome:"leased",code:"FABRICATED",...overrides});

test("Detroit slots survive DST and transfer whole chapters only after eligible primary failure", () => {
  assert.equal(state.latestDetroitSparkSlot("2026-03-08T09:25:00.000Z"), "2026-03-08T09:15:00.000Z");
  assert.equal(state.latestDetroitSparkSlot("2026-11-01T04:20:00.000Z"), "2026-11-01T03:15:00.000Z");
  const events=[event({chunk_id:"001-001",outcome:"validated"}), event({chunk_id:"002-002",outcome:"model_failure",at:"2026-11-01T05:02:00.000Z"})];
  const derived=state.deriveChapterDecision({events,orderedChunkIds:["001-001","002-002"],now:"2026-11-01T05:12:00.000Z"});
  assert.deepEqual(derived.owner,LUNA); assert.equal(derived.restart,true);
});

test("current ledger selection excludes stale plans and changed source work items", () => {
  const current = event({event_id:"MHNLE-current", outcome:"validated"});
  const oldPlan = event({event_id:"MHNLE-old-plan", outcome:"validated", plan_version:"older"});
  const changedSource = event({event_id:"MHNLE-old-source", outcome:"validated", work_item_id:"MHNWI-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"});
  assert.deepEqual(state.currentLedgerEvents({events:[current, oldPlan, changedSource],planVersion:"fabricated",workItemIds:[item.work_item_id]}).map(x=>x.event_id), ["MHNLE-current"]);
});

test("controller detects a missed later slot and restarts Luna from chunk one after partial Spark progress", () => {
  const initial=[event({chunk_id:"001-001",outcome:"validated",primary_slot:"2026-09-07T09:15:00.000Z"})];
  const missed=state.deriveChapterDecision({events:initial,orderedChunkIds:["001-001","002-002"],now:"2026-09-07T15:26:00.000Z"});
  assert.deepEqual(missed,{owner:LUNA,restart:true,blocked:false,reason:"missed_primary",nextChunkId:"001-001",transferChunkId:"002-002",primary_slot:"2026-09-07T15:15:00.000Z"});
  const failed=state.deriveChapterDecision({events:[...initial,event({chunk_id:"002-002",outcome:"model_failure",at:"2026-09-07T15:16:00.000Z",primary_slot:"2026-09-07T15:15:00.000Z"})],orderedChunkIds:["001-001","002-002"],now:"2026-09-07T15:20:00.000Z"});
  assert.equal(failed.owner,LUNA); assert.equal(failed.nextChunkId,"001-001");
  const mixed=[...initial,event({chapter:"TST:2",chunk_id:"001-001",outcome:"model_failure"})];
  assert.equal(state.deriveChapterDecision({events:mixed.filter(x=>x.chapter==="TST:1"),orderedChunkIds:["001-001"],now:"2026-09-07T15:20:00.000Z"}).owner,SPARK);
  assert.equal(state.deriveChapterDecision({events:mixed.filter(x=>x.chapter==="TST:2"),orderedChunkIds:["001-001"],now:"2026-09-07T15:20:00.000Z"}).owner,LUNA);
});

test("controller ledger is append-only/idempotent, rejects concurrent locks, and assembles stable reading IDs", async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),"mhc-native-fabricated-"));
  try {
    const first=event(), a=await state.appendLedgerEvent({root,readingId:"FAB-001",event:first,ledgerSchema});
    assert.equal(a.appended,true);
    assert.equal((await state.appendLedgerEvent({root,readingId:"FAB-001",event:first,ledgerSchema})).appended,false);
    await mkdir(path.join(root,"ledger","FAB-001.lock"),{recursive:true});
    await assert.rejects(state.appendLedgerEvent({root,readingId:"FAB-001",event:event({event_id:"MHNLE-conflict"}),ledgerSchema,lockStaleMs:999999}), /lock is active/);
    await rm(path.join(root,"ledger","FAB-001.lock"),{recursive:true,force:true});
    await assert.rejects(state.appendLedgerEvent({root,readingId:"../../escape",event:first,ledgerSchema}), /Invalid ledger reading ID/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("paired slots durably retain one reading/source selection and deterministic pre-work blocks", async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),"mhc-native-pair-"));
  try {
    const selected=state.makeNativePairSelection({planVersion:"fabricated",readingId:"FAB-001",scheduleDate:"2026-09-07",primaryAutomationId:"fabricated-spark",primarySlot:"2026-09-07T09:15:00.000Z",selectedAt:"2026-09-07T09:15:01.000Z"});
    assert.equal((await state.writeNativePair({root,pair:selected,pairSchema})).written,true);
    assert.equal((await state.writeNativePair({root,pair:selected,pairSchema})).written,false);
    const sourceState=nativePairSourceState([{item}]);
    const ready=state.transitionNativePair(selected,{state:"ready",sourceState});
    assert.equal((await state.writeNativePair({root,pair:ready,pairSchema})).written,true);
    const loaded=await state.readNativePair({root,pairId:selected.pair_id,pairSchema});
    assert.equal(loaded.reading_id,"FAB-001");
    assert.equal(nativePairMatchesDefinitions(loaded,[{item}]),true);
    const lunaItem=buildNativeWorkItem({reading:{readingId:"FAB-001",verseCount:1},planVersion:"fabricated",scheduleDate:"2026-09-07",chunk:{chunkId:"001-001",chapterJobSpec:{metadata:{book_id:"TST",chapter:1,source_hash:"b".repeat(64)},requestedRecords:[record],sourceUnits:[unit]}},normalizedUnits:[unit],sourceManifest:{},model:LUNA,automationId:"fabricated-luna",createdAt:"2026-09-07T00:00:00.000Z"});
    assert.equal(nativePairMatchesDefinitions(loaded,[{item:lunaItem}]),true);
    const drifted=structuredClone(lunaItem); drifted.normalized_hash="d".repeat(64);
    assert.equal(nativePairMatchesDefinitions(loaded,[{item:drifted}]),false);
    await assert.rejects(state.writeNativePair({root,pair:{...loaded,reading_id:"FAB-002"},pairSchema}),/hash|identity/);

    const other=state.makeNativePairSelection({planVersion:"fabricated",readingId:"FAB-002",scheduleDate:"2026-09-08",primaryAutomationId:"fabricated-spark",primarySlot:"2026-09-07T15:15:00.000Z",selectedAt:"2026-09-07T15:15:01.000Z"});
    const blocked=state.transitionNativePair(other,{state:"blocked",code:"NATIVE_WORKER_VIEW_VERSE_CEILING"});
    await state.writeNativePair({root,pair:blocked,pairSchema});
    const retained=await state.readNativePair({root,pairId:other.pair_id,pairSchema});
    assert.equal(retained.reading_id,"FAB-002");
    assert.equal(retained.state,"blocked");
    assert.equal(retained.code,"NATIVE_WORKER_VIEW_VERSE_CEILING");
    await assert.rejects(state.writeNativePair({root,pair:state.transitionNativePair(other,{state:"ready",sourceState}),pairSchema}),/reinterpreted/);

    const recoverable=state.makeNativePairSelection({planVersion:"fabricated",readingId:"FAB-003",scheduleDate:"2026-09-09",primaryAutomationId:"fabricated-spark",primarySlot:"2026-09-07T21:15:00.000Z",selectedAt:"2026-09-07T21:15:01.000Z"});
    const lock=path.join(root,"pairs",`${recoverable.pair_id}.json.lock`);
    await mkdir(lock,{recursive:true});
    await assert.rejects(state.writeNativePair({root,pair:recoverable,pairSchema,lockStaleMs:60_000}),/lock is active/);
    const old=new Date(Date.now()-120_000);
    await utimes(lock,old,old);
    assert.equal((await state.writeNativePair({root,pair:recoverable,pairSchema,lockStaleMs:60_000})).written,true);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("a Luna lease may follow a stale Spark lease but duplicate owner leases fail closed", async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),"mhc-native-fabricated-"));
  try {
    const sparkLease=event({outcome:"leased",primary_slot:"2026-09-07T15:15:00.000Z"});
    await state.appendLedgerEvent({root,readingId:"FAB-001",event:sparkLease,ledgerSchema});
    await assert.rejects(state.appendLedgerEvent({root,readingId:"FAB-001",event:event({event_id:"MHNLE-second",outcome:"leased",primary_slot:"2026-09-07T15:15:00.000Z"}),ledgerSchema}),/already has a lease/);
    const lunaLease=event({event_id:"MHNLE-luna",model:LUNA,outcome:"leased",work_item_id:"MHNWI-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",automation_id:"fabricated-luna",primary_slot:"2026-09-07T15:15:00.000Z"});
    assert.equal((await state.appendLedgerEvent({root,readingId:"FAB-001",event:lunaLease,ledgerSchema})).appended,true);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("terminalized same-slot leases may be replaced while active leases and false paths fail closed", async () => {
  const first = event({automation_id:item.automation_id}), terminal = terminalNativeFailureEvent({item,lease:first,code:"NATIVE_CANDIDATE_UNRESOLVED"});
  const replacement = event({event_id:"MHNLE-replacement",automation_id:item.automation_id,work_item_id:"MHNWI-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",outcome:"leased"});
  const root=await mkdtemp(path.join(os.tmpdir(),"mhc-native-release-"));
  try {
    await state.appendLedgerEvent({root,readingId:"FAB-001",event:first,ledgerSchema});
    await assert.rejects(state.appendLedgerEvent({root,readingId:"FAB-001",event:event({event_id:"MHNLE-active-duplicate",automation_id:item.automation_id,outcome:"leased"}),ledgerSchema}),/already has a lease/);
    await state.appendLedgerEvent({root,readingId:"FAB-001",event:terminal,ledgerSchema});
    assert.equal((await state.appendLedgerEvent({root,readingId:"FAB-001",event:replacement,ledgerSchema})).appended,true);
  } finally { await rm(root,{recursive:true,force:true}); }
  assert.equal(activeNativeLeaseWorkItem({events:[first],items:[{item}],defs:[{item}],planVersion:"fabricated"}).item.work_item_id,item.work_item_id);
  const changed=structuredClone(item); changed.work_item_id="MHNWI-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  assert.equal(activeNativeLeaseWorkItem({events:[replacement],items:[{item}],defs:[{item:changed}],planVersion:"fabricated"}),null);
});

test("terminal native failure authenticates one current lease and leaves a later Luna lease eligible", async () => {
  const lease = event({automation_id: item.automation_id});
  assert.equal(isCurrentTerminalFailureWorkItem({item, defs: [{item}], planVersion: "fabricated"}), true);
  assert.equal(isCurrentTerminalFailureWorkItem({item: null, defs: [{item}], planVersion: "fabricated"}), false);
  const forged = structuredClone(item); forged.source_hash = "d".repeat(64);
  assert.equal(isCurrentTerminalFailureWorkItem({item: forged, defs: [{item}], planVersion: "fabricated"}), false);
  assert.equal(isCurrentTerminalFailureWorkItem({item, defs: [{item}], planVersion: "stale"}), false);
  const terminal = terminalNativeFailureEvent({item, lease, code: "NATIVE_CANDIDATE_UNRESOLVED"});
  assert.equal(terminal.outcome, "model_failure");
  assert.throws(() => terminalNativeFailureEvent({item, lease, code: "ARBITRARY"}), /not permitted/);
  assert.throws(() => assertCurrentLease({item, events: [lease, terminal], planVersion: "fabricated"}), /superseded/);
  const root = await mkdtemp(path.join(os.tmpdir(), "mhc-native-failure-"));
  try {
    assert.equal((await state.appendLedgerEvent({root, readingId: "FAB-001", event: lease, ledgerSchema})).appended, true);
    assert.equal((await state.appendLedgerEvent({root, readingId: "FAB-001", event: terminal, ledgerSchema})).appended, true);
    assert.equal((await state.appendLedgerEvent({root, readingId: "FAB-001", event: terminal, ledgerSchema})).appended, false);
    const lunaLease = event({event_id: "MHNLE-luna-after-terminal", model: LUNA, automation_id: "fabricated-luna", work_item_id: "MHNWI-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", outcome: "leased", at: "2026-11-01T05:03:00.000Z"});
    const decision = state.deriveChapterDecision({events: [lease, terminal, lunaLease], orderedChunkIds: ["001-001"], now: "2026-11-01T05:12:00.000Z"});
    assert.equal(decision.owner, LUNA);
    assert.equal(decision.nextChunkId, "001-001");
  } finally { await rm(root, {recursive: true, force: true}); }
});

test("native transaction resumes exact staged bytes and fails closed after applied tampering", async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),"mhc-native-tx-")), canonical=path.join(root,"canonical"), bytes={x:"FABRICATED ONLY"}, digest=(await import("../scripts/lib/mhc-pipeline.mjs")).sha256(Buffer.from(`${JSON.stringify(bytes,null,2)}\n`));
  const manifest={schema_version:"mhc-native-review-transaction/v1",reading_id:"FAB-001",plan_version:"fabricated",review_sha256:"c".repeat(64),state:"staged",destinations:[{destination:"runtime/TST/001.json",staged_file:"staged/0.json",sha256:digest}]};
  try { await assert.rejects(applyNativeTransaction({root:path.join(root,"tx"),canonicalRoot:canonical,manifest,entries:[{destination:"runtime/TST/001.json",value:bytes}],transactionSchema,progressSchema,failAfter:1}),/failure injection/); await applyNativeTransaction({root:path.join(root,"tx"),canonicalRoot:canonical,manifest,entries:[{destination:"runtime/TST/001.json",value:bytes}],transactionSchema,progressSchema}); const {writeFile}=await import("node:fs/promises"); await writeFile(path.join(canonical,"runtime/TST/001.json"),"tampered"); await assert.rejects(applyNativeTransaction({root:path.join(root,"tx"),canonicalRoot:canonical,manifest,entries:[{destination:"runtime/TST/001.json",value:bytes}],transactionSchema,progressSchema}),/tampered/); } finally {await rm(root,{recursive:true,force:true});}
});

test("tracked native automation prompts preserve exact model, timing, review, and privacy boundaries", () => {
  const readPrompt = (name) => readFileSync(new URL(`../prompts/${name}`, import.meta.url), "utf8");
  const spark = readPrompt("mhc-native-spark-scheduled-task-v1.md");
  const luna = readPrompt("mhc-native-luna-scheduled-task-v1.md");
  const review = readPrompt("mhc-native-review-scheduled-task-v1.md");
  assert.match(spark, /05:15, 11:15, 17:15, and 23:15/); assert.match(spark, /gpt-5\.3-codex-spark/); assert.match(spark, /medium/);
  assert.match(luna, /05:25, 11:25, 17:25, and 23:25/); assert.match(luna, /gpt-5\.6-luna/); assert.match(luna, /--primary-automation-id/);
  for (const text of [spark, luna]) {
    assert.match(text, /workItemPath/);
    assert.match(text, /actually generate `candidate\.json`/);
    assert.match(text, /read only that work item's `validation\.json`/);
    assert.match(text, /at most two repairs/);
  }
  assert.match(spark, /do not record historical cooldown/);
  assert.match(spark, /mhc:native:fail/);
  assert.match(luna, /mhc:backfill:record/); assert.match(luna, /NATIVE_CANDIDATE_UNRESOLVED/);
  assert.match(luna, /mhc:native:fail/);
  for (const text of [spark, luna]) assert.match(text, /reading_incomplete/);
  assert.match(review, /approved all-assertions-true/); assert.match(review, /mhc:sync-latest/); assert.match(review, /Never let generation attach or publish/);
  for (const text of [spark, luna, review]) assert.match(text, /private prose, source atoms, IDs, or secrets|private prose, atoms, IDs, credentials, or secrets|private prose, source atoms, Scripture/);
});

test("assigned Luna-low worker writes directly and cannot launch a nested or substitute worker", () => {
  const scheduled = readFileSync(new URL("../prompts/mhc-native-luna-scheduled-task-v1.md", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../prompts/mhc-native-luna-worker-v1.md", import.meta.url), "utf8");
  const nestedProhibition = /Do not run `codex exec` or any (?:other )?command that launches a nested Codex\/model process\./;
  for (const text of [scheduled, worker]) {
    assert.match(text, /exact `gpt-5\.6-luna` at low reasoning/);
    assert.match(text, /existing repository file-(?:reading and file-editing|editing) capability/);
    assert.match(text, nestedProhibition);
    assert.match(text, /Do not spawn, delegate to, or hand (?:the|this) work item to another child agent/);
    assert.match(text, /Never substitute Terra, Sol, Spark, or any other model/);
    assert.doesNotMatch(text.replace(nestedProhibition, ""), /codex exec|nested Codex\/model process/i);
    assert.match(text, /same lease/);
    assert.match(text, /at most two repairs \(three submit attempts total\)/);
  }
  assert.match(scheduled, /durable pair selected for that primary Spark slot/);
  assert.match(scheduled, /same one work item/);
  assert.match(worker, /write exactly one `mhc-native-candidate\/v1` JSON object directly/);
  assert.match(worker, /The deterministic controller performs validation and creates the separate review handoff/);
});
