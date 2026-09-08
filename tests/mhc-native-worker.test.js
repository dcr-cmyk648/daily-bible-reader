import assert from "node:assert/strict";
import test from "node:test";
import {mkdir, mkdtemp, rm} from "node:fs/promises";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertNativeHandoffBinding, buildNativeWorkItem, safeNativeReport, validateNativeCandidate, SPARK, LUNA} from "../scripts/lib/mhc-native-worker.mjs";
import {applyNativeTransaction} from "../scripts/lib/mhc-native-transaction.mjs";

const workSchema = JSON.parse(readFileSync(new URL("../schemas/mhc-native-work-item.schema.json", import.meta.url), "utf8"));
const candidateSchema = JSON.parse(readFileSync(new URL("../schemas/mhc-native-candidate.schema.json", import.meta.url), "utf8"));
const factSchema = JSON.parse(readFileSync(new URL("../schemas/mhc-fact-brief.schema.json", import.meta.url), "utf8"));
const chapterSchema = JSON.parse(readFileSync(new URL("../schemas/mhc-commentary-output.schema.json", import.meta.url), "utf8"));
const ledgerSchema = JSON.parse(readFileSync(new URL("../schemas/mhc-native-ledger.schema.json", import.meta.url), "utf8"));
const transactionSchema = JSON.parse(readFileSync(new URL("../schemas/mhc-native-review-transaction.schema.json", import.meta.url), "utf8"));
const progressSchema = JSON.parse(readFileSync(new URL("../schemas/mhc-native-review-progress.schema.json", import.meta.url), "utf8"));
const state = await import("../scripts/lib/mhc-native-state.mjs");
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const record = {verse_id: "TST.1.1", required_coverage_type: "direct", allowed_source_unit_ids: ["fab.unit"], allowed_source_atom_ids: ["fab.atom"], target_marked_source_atom_ids: ["fab.atom"], required_explicit_identity_terms: [], required_explicit_relations: [], verse_anchor_terms: [], source_reference_labels: ["Fabricated 1:1"]};
const unit = {source_unit_id: "fab.unit", source_atoms: [{source_atom_id: "fab.atom", text: "FABRICATED test material only.", text_sha256: "a".repeat(64)}]};
const item = buildNativeWorkItem({reading: {readingId: "FAB-001", verseCount: 1}, planVersion: "fabricated", scheduleDate: "2026-09-07", chunk: {chunkId: "001-001", chapterJobSpec: {metadata: {book_id: "TST", chapter: 1, source_hash: "b".repeat(64)}, requestedRecords: [record], sourceUnits: [unit]}}, normalizedUnits: [unit], sourceManifest: {}, automationId: "fabricated-spark", createdAt: "2026-09-07T00:00:00.000Z"});

test("native worker CLI resolves every module export before command dispatch", () => {
  const result = spawnSync(process.execPath, ["scripts/mhc-native-worker.mjs"], {cwd: repositoryRoot, encoding: "utf8"});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: node scripts\/mhc-native-worker\.mjs/);
  assert.doesNotMatch(result.stderr, /does not provide an export/);
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

test("native candidates reject model provenance and reports remain safe", () => {
  const invalid = {schema_version: "mhc-native-candidate/v1", work_item_id: item.work_item_id, fact_brief: {verse_briefs: []}, verse_drafts: [], worker_model: SPARK};
  const result = validateNativeCandidate({candidate: invalid, item, candidateSchema, factSchema, chapterSchema});
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("additional property")));
  assert.deepEqual(safeNativeReport({item, action: "prepared", state: "leased"}), {lane: "henry_backfill", readingId: "FAB-001", scheduleDate: "2026-09-07", chunkOrdinal: "001-001", action: "prepared", state: "leased"});
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
  assert.match(review, /approved all-assertions-true/); assert.match(review, /mhc:sync-latest/); assert.match(review, /Never let generation attach or publish/);
  for (const text of [spark, luna, review]) assert.match(text, /private prose, source atoms, IDs, or secrets|private prose, atoms, IDs, credentials, or secrets/);
});
