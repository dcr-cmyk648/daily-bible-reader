import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {henryPriorityWindow,loadHenryPlan,HENRY_CALENDAR_PATH,hasHenryPublicationReceipt} from "../scripts/lib/mhc-priority.mjs";
import {selectMhcBackfillCandidate} from "../scripts/lib/mhc-backfill-work-order.mjs";
import {emptyMhcBackfillAttemptState,recordMhcBackfillAttempt} from "../scripts/lib/mhc-backfill-attempt-state.mjs";

const config={sharedStartDate:"2026-09-01",futureLookaheadDays:7};
const plan={planVersion:"fabricated-priority",entries:Array.from({length:25},(_,index)=>({planVersion:"fabricated-priority",dayIndex:index+1,readingId:`FAB-${index+1}`,kind:"chapter",passages:[{bookId:"TST",chapter:index+1,verseCount:1}]}))};
const fallback=id=>({readingId:id,henrySourceLink:{sourceId:"fabricated",title:"FABRICATED",note:"FABRICATED TEST FALLBACK",url:"https://example.invalid/fabricated"}});
const metadata=Object.fromEntries(plan.entries.map(e=>[e.readingId,fallback(e.readingId)]));
const select=overrides=>selectMhcBackfillCandidate({plan,appConfig:config,metadataByReadingId:metadata,manifestReadingIds:Object.keys(metadata),now:"2026-09-12T16:00:00Z",...overrides});

test("forward dates precede older backlog and stop at the configured T+7 boundary",()=>{
  assert.equal(select().candidate.entry.readingId,"FAB-12");
  assert.equal(select({manifestReadingIds:["FAB-1","FAB-19","FAB-20"]}).candidate.entry.readingId,"FAB-19");
  assert.equal(select({manifestReadingIds:["FAB-1","FAB-20"]}).candidate.entry.readingId,"FAB-1");
  assert.equal(select({appConfig:{...config,futureLookaheadDays:0},manifestReadingIds:["FAB-1","FAB-13"]}).candidate.entry.readingId,"FAB-1");
});
test("cooling forward work allows later forward work, then waits instead of starting backlog",()=>{
  let state=emptyMhcBackfillAttemptState(plan.planVersion);
  const mark=id=>state=recordMhcBackfillAttempt(state,{readingId:id,attemptedAt:"2026-09-12T15:00:00Z",outcome:"blocked",stage:"controller",code:"FABRICATED_FAILURE"});
  mark("FAB-12");
  const args={manifestReadingIds:["FAB-1","FAB-12","FAB-13"],attemptState:state};
  assert.equal(select(args).candidate.entry.readingId,"FAB-13");
  mark("FAB-13");const waiting=select({...args,attemptState:state});
  assert.equal(waiting.candidate,null);assert.equal(waiting.queue.priorityTier,"forward");assert.equal(waiting.queue.historicalDebtCount,1);assert.equal(waiting.queue.nextEligibleAt,"2026-09-13T15:00:00.000Z");
});
test("forward order is chronological after cooldown; historical order keeps least-recent fairness",()=>{
  const state=recordMhcBackfillAttempt(emptyMhcBackfillAttemptState(plan.planVersion),{readingId:"FAB-12",attemptedAt:"2026-09-10T15:00:00Z",outcome:"blocked",stage:"controller",code:"FABRICATED_FAILURE"});
  assert.equal(select({attemptState:state}).candidate.entry.readingId,"FAB-12");
  const backlog=recordMhcBackfillAttempt(state,{readingId:"FAB-1",attemptedAt:"2026-09-10T15:00:00Z",outcome:"blocked",stage:"controller",code:"FABRICATED_FAILURE"});
  assert.equal(select({attemptState:backlog,manifestReadingIds:["FAB-1","FAB-2"]}).candidate.entry.readingId,"FAB-2");
});
test("unprepared dates, overviews, and complete layers do not authorize generation",()=>{
  const changed=structuredClone(plan);changed.entries[11].kind="book_intro";
  const values={...metadata,"FAB-13":{readingId:"FAB-13",verseCommentary:{label:"FABRICATED COMPLETE"}}};
  assert.equal(select({plan:changed,metadataByReadingId:values,manifestReadingIds:["FAB-1","FAB-12","FAB-13"]}).candidate.entry.readingId,"FAB-1");
});
test("forward handoffs skip regeneration and keep backlog waiting until publication is proven",()=>{
  const pending=new Set(["FAB-12"]),args={pendingReadingIds:pending,manifestReadingIds:["FAB-1","FAB-12","FAB-13"]};
  assert.equal(select(args).candidate.entry.readingId,"FAB-13");
  pending.add("FAB-13");assert.equal(select(args).candidate,null);
  const values={...metadata,"FAB-12":{readingId:"FAB-12",verseCommentary:{label:"FABRICATED LOCALLY ATTACHED"}}};
  const waiting=select({...args,metadataByReadingId:values});assert.equal(waiting.queue.forwardDebtCount,2);assert.equal(waiting.queue.awaitingReviewCount,2);
  const aged=select({...args,metadataByReadingId:values,now:"2026-09-20T16:00:00Z",manifestReadingIds:["FAB-12"]});
  assert.equal(aged.candidate,null);assert.equal(aged.queue.historicalDebtCount,1);assert.equal(aged.queue.awaitingReviewCount,1);
  assert.equal(select({...args,metadataByReadingId:values,pendingReadingIds:new Set(),manifestReadingIds:["FAB-1","FAB-12"]}).candidate.entry.readingId,"FAB-1");
});
test("forward publication proof binds exact metadata and its pointer, allowing unrelated manifest advances",async()=>{
  const privateRoot=await mkdtemp(path.join(os.tmpdir(),"mhc-priority-receipt-")),readingId="FAB-RECEIPT";
  const put=async(relative,data)=>{const file=path.join(privateRoot,relative);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,data);};
  const metadata=JSON.stringify({readingId,verseCommentary:{label:"FABRICATED APPROVED LAYER"}})+"\n";
  const receipt={schemaVersion:"mhc-manager-publication-result/v1",readingId,status:"published_verified",metadataReadback:"exact_bytes",manifestReadback:"exact_bytes",liveReadingStatus:"ready",henryLayerStatus:"complete",metadataFileId:"FABRICATED_METADATA_POINTER",payloadSha256:createHash("sha256").update(metadata).digest("hex")};
  const manifest={readings:{[readingId]:{metadataFileId:receipt.metadataFileId}}},args={privateRoot,readingId,manifest};
  try{
    await put(`bridge/celebration-y3q4/${readingId}.metadata.json`,metadata);
    assert.equal(await hasHenryPublicationReceipt(args),false);
    await put(`automation/staging/${readingId}/manager-publication-result.json`,JSON.stringify(receipt));
    assert.equal(await hasHenryPublicationReceipt(args),true);
    manifest.readings["FAB-UNRELATED"]={metadataFileId:"FABRICATED_NEW_POINTER"};assert.equal(await hasHenryPublicationReceipt(args),true);
    manifest.readings[readingId].metadataFileId="FABRICATED_WRONG_POINTER";assert.equal(await hasHenryPublicationReceipt(args),false);
    manifest.readings[readingId].metadataFileId=receipt.metadataFileId;
    await put(`bridge/celebration-y3q4/${readingId}.metadata.json`,metadata+" ");assert.equal(await hasHenryPublicationReceipt(args),false);
  }finally{await rm(privateRoot,{recursive:true,force:true});}
});
test("Detroit midnight and DST use civil dates and preserve seven calendar days",()=>{
  assert.equal(henryPriorityWindow(config,"2026-09-13T03:59:59Z").today,"2026-09-12");
  assert.equal(henryPriorityWindow(config,"2026-09-13T04:00:00Z").today,"2026-09-13");
  for(const now of ["2026-11-01T05:30:00Z","2026-11-01T06:30:00Z"]){const w=henryPriorityWindow(config,now);assert.equal(w.today,"2026-11-01");assert.equal(w.horizonDate,"2026-11-08");}
  assert.equal(henryPriorityWindow(config,"2026-03-08T07:30:00Z").horizonDate,"2026-03-15");
  for(const days of [undefined,-1,8,1.5])assert.throws(()=>henryPriorityWindow({...config,futureLookaheadDays:days}),/preparation horizon/);
});
test("immutable factual calendar reveals later published entries while rejecting baseline or checksum drift",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"mhc-priority-plan-"));
  const put=async(file,data)=>{await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),JSON.stringify(data));};
  const active={...plan,calendarRevision:createHash("sha256").update(JSON.stringify(plan.entries)).digest("hex")};
  try{
    await put("fixtures/pilot-content/plan.json",{...plan,entries:plan.entries.slice(0,2)});await put("fixtures/pilot-content/app-config.json",config);await put(HENRY_CALENDAR_PATH,active);
    const loaded=await loadHenryPlan(root);assert.equal(loaded.plan.entries.length,25);
    assert.equal(select({...loaded,manifestReadingIds:["FAB-1","FAB-19"]}).candidate.entry.readingId,"FAB-19");
    const drift=structuredClone(active);drift.entries[0].readingId="FAB-DRIFT";await put(HENRY_CALENDAR_PATH,drift);await assert.rejects(()=>loadHenryPlan(root),/immutable prepared-prefix/);
    drift.calendarRevision=createHash("sha256").update(JSON.stringify(drift.entries)).digest("hex");await put(HENRY_CALENDAR_PATH,drift);await assert.rejects(()=>loadHenryPlan(root),/immutable prepared-prefix/);
  }finally{await rm(root,{recursive:true,force:true});}
});
