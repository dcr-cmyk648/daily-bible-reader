import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,cp,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {VERSION,MODELS,REVIEW_ASSERTIONS,passageScope,compileReading,validateCandidate,digestObject} from '../scripts/lib/mhc-v2.mjs';
import {sha256,normalizedBatchHash} from '../scripts/lib/mhc-pipeline.mjs';
import {serviceContext,startV2,selectAuthorWorkV2,selectHistoricalAuthorWorkV2,historicalSelectionBindingVersion,sourceInput,advanceV2,buildReview,reviewWorkOrderV2,applyReviewV2,editorialRepairV2,requestEditorialV2,migrateCurrentV2,reopenReviewV2} from '../scripts/lib/mhc-v2-service.mjs';
import {atomicJson,appendState,loadJob,readJson,bytesFor,createJob} from '../scripts/lib/mhc-v2-store.mjs';
import {writeFileSync,readdirSync} from 'node:fs';
import {runAuthorSession,selectionBindingVersion,transportSchema,authorArguments,successfulModelResult,verifyPublicPacket,publicRepairDiagnostics} from '../scripts/lib/mhc-v2-author-session.mjs';
import {recoverUnstartedTransport} from '../scripts/lib/mhc-v2-transport-recovery.mjs';
import {sparkModelUnavailable} from '../scripts/lib/mhc-v2-model-errors.mjs';
import {recoverClientUpgrade} from '../scripts/lib/mhc-v2-client-upgrade.mjs';
import {authorPreflight} from '../scripts/lib/mhc-v2-author-session.mjs';
import {authorFailure} from '../scripts/lib/mhc-v2-model-errors.mjs';
import {openJournal} from '../scripts/lib/service-supervisor-store.mjs';
import {buildRollingStudyWorkOrder} from '../scripts/lib/rolling-study-work-order.mjs';

const unavailableSparkEvents = () => JSON.stringify({type:'turn.failed',error:{message:JSON.stringify({type:'error',status:400,error:{type:'invalid_request_error',message:"The 'gpt-5.3-codex-spark' model is not supported when using Codex with a ChatGPT account."}})}})+'\n';

for(const [model,message] of [['gpt-5.3-codex-spark',"not supported when using Codex with a ChatGPT account"],['gpt-5.6-luna','requires a newer version of Codex']])test(`October provider refusal ${model} blocks within one wake before claiming`,async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1}),normal=fabricatedModelRun();
  if(model==='gpt-5.3-codex-spark')ctx.config.author_model=model;
  const run=(bin,args,opts)=>opts.input?.startsWith('Availability preflight')&&args.includes(model)?{status:1,stderr:`FABRICATED HTTP 400: The '${model}' model is ${message}.`}:normal.run(bin,args,opts);
  const result=await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath},{run,clock:()=>now});
  assert.equal(result.code,'V2_AUTHOR_MODEL_UNAVAILABLE');assert.equal(result.state,'blocked');assert.equal(result.statusPublished,false);
  assert.deepEqual(await readdir(ctx.jobRoot),[]);assert.equal(normal.calls,0);
  const staged=await readJson(result.statusCandidatePath);assert.equal(staged.preparationStatus.state,'blocked');assert.ok(staged.preparationStatus.summary.includes(model));
  assert.deepEqual(staged.readings,(await readJson(path.join(ctx.privateRoot,'private-manifest.json'))).readings);
});
test('preflight probes each configured model with ephemeral ChatGPT-only exec and isolated tools',async t=>{
  const {ctx,now}=await fixture(t),normal=fabricatedModelRun(),models=[];
  const run=(bin,args,opts)=>{if(opts.input?.startsWith('Availability preflight')){models.push(args[args.indexOf('--model')+1]);assert.equal(opts.env.OPENAI_API_KEY,undefined);assert.equal(opts.env.CODEX_API_KEY,undefined);assert.ok(args.includes('forced_login_method="chatgpt"'));}return normal.run(bin,args,opts);};
  const result=await authorPreflight(ctx,{codexExecutable:process.execPath},{run,clock:()=>now});
  assert.equal(result.state,'available');assert.deepEqual(models,['gpt-6-luna','gpt-5.6-luna']);assert.equal(normal.calls,0);assert.deepEqual(await readdir(ctx.jobRoot),[]);
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(result)),'transport'),false);
  assert.ok(result.receipts.every(receipt=>receipt.code===null&&receipt.reason==='Model availability verified'));
});
test('provider 4xx and configuration errors are deterministic; timeout remains transport',()=>{
  for(const result of [{status:1,stdout:unavailableSparkEvents()},{status:1,stderr:'FABRICATED unexpected status 403'},{status:1,stderr:'FABRICATED requires a newer version of Codex'},{status:null,error:{code:'ENOENT'}}])assert.equal(authorFailure(result).code,'V2_AUTHOR_MODEL_UNAVAILABLE');
  assert.equal(authorFailure({status:null,error:{code:'ETIMEDOUT'}}).code,'V2_TRANSPORT_FAILED');
});
test('a provider refusal after successful preflight blocks the claimed job without fallback',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1}),normal=fabricatedModelRun();
  const run=(bin,args,opts)=>opts.input?.includes('SOURCE PACKET:')?{status:1,stderr:'FABRICATED HTTP 400: model not supported'}:normal.run(bin,args,opts);
  const result=await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath},{run,clock:()=>now});
  assert.equal(result.code,'V2_AUTHOR_MODEL_UNAVAILABLE');const job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));
  assert.equal(job.state.phase,'blocked');assert.equal(job.state.total_submissions,0);assert.equal(job.state.lease.released,true);
});
test('three transport wakes release ownership after two checkpoints and preserve attempts',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1}),normal=fabricatedModelRun(()=>null),options={lane:'spark',codexExecutable:process.execPath},deps={run:normal.run,clock:()=>now};
  const first=await runAuthorSession(ctx,options,deps),second=await runAuthorSession(ctx,options,deps),third=await runAuthorSession(ctx,options,deps);
  assert.equal(first.state,'queued');assert.equal(second.code,'V2_TRANSPORT_RETRY_EXHAUSTED');assert.equal(third.state,'no_eligible_reading');assert.equal(normal.calls,1);
  const job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));assert.equal(job.state.lease.released,true);assert.equal(job.state.lease.transport_checkpoints,2);assert.equal(job.state.total_submissions,0);
});
test('released transport debt advances the next forward reading without resetting the failed job',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:2}),normal=fabricatedModelRun();
  const failing=(bin,args,opts)=>opts.input?.includes('SOURCE PACKET:')?{status:null,error:{code:'ETIMEDOUT'},stderr:'FABRICATED timeout'}:normal.run(bin,args,opts);
  const options={lane:'spark',codexExecutable:process.execPath,maxReadings:1};
  await runAuthorSession(ctx,options,{run:failing,clock:()=>now});
  const before=await loadJob(path.join(ctx.jobRoot,'FAB-1'));
  const blocked=await runAuthorSession(ctx,options,{run:failing,clock:()=>now});assert.equal(blocked.code,'V2_TRANSPORT_RETRY_EXHAUSTED');
  const result=await runAuthorSession(ctx,options,{run:normal.run,clock:()=>now});assert.equal(result.readingId,'FAB-2');assert.equal(result.action,'review_handoff');
  const after=await loadJob(before.directory);assert.equal(after.state.lease.released,true);assert.equal(after.state.phase,'blocked');assert.equal(after.state.total_submissions,before.state.total_submissions);assert.deepEqual(after.state.accepted,before.state.accepted);assert.deepEqual(after.state.sessions,before.state.sessions);
});
for(const stdout of ['FABRICATED malformed events','{"type":"turn.started"}\n','{"type":"item.completed","item":{"type":"command_execution"}}\n{"type":"turn.completed"}\n'])test(`exit-zero invalid author protocol checkpoints safely (${stdout.slice(0,24)})`,async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1}),normal=fabricatedModelRun();
  const run=(bin,args,opts)=>opts.input?.includes('SOURCE PACKET:')?{status:0,stdout}:normal.run(bin,args,opts);
  const options={lane:'spark',codexExecutable:process.execPath};
  const first=await runAuthorSession(ctx,options,{run,clock:()=>now});assert.equal(first.code,'V2_TRANSPORT_PROTOCOL_FAILED');assert.equal(first.state,'queued');
  const second=await runAuthorSession(ctx,options,{run,clock:()=>now});assert.equal(second.code,'V2_TRANSPORT_RETRY_EXHAUSTED');assert.equal(second.state,'blocked');assert.equal(second.statusPublished,false);
  const job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));assert.equal(job.state.total_submissions,0);assert.deepEqual(job.state.accepted,{});assert.equal((await readJson(second.statusCandidatePath)).preparationStatus.state,'blocked');
});
test('lease expires within 24 hours and the next forward reading can advance',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:9});await startV2(ctx,'spark',now);const before=await loadJob(path.join(ctx.jobRoot,'FAB-1'));
  const later=new Date(now.getTime()+24*60*60*1000),health={status:'ready',effectiveDate:'2026-09-14',target:8,
    readingIds:ctx.plan.entries.slice(1).map(e=>e.readingId),missingPreparedReadingIds:[],missingPayloadReadingIds:[],componentFailures:[],
    currentHorizonHenryLayer:{status:'complete',fallbackReadingIds:[],unavailableReadingIds:[]}};
  const result=await startV2(ctx,'spark',later,{}, {health:async()=>health});assert.equal(result.readingId,'FAB-2');
  const after=await loadJob(before.directory);assert.equal(after.state.blocker.code,'V2_AUTHOR_LEASE_EXPIRED');assert.deepEqual(after.state.sessions,before.state.sessions);assert.equal(after.state.lease.released,true);
});
test('other-model ownership escalates within two wakes',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});await startV2(ctx,'spark',now);
  assert.equal((await startV2(ctx,'luna',now)).code,'V2_OTHER_MODEL_OWNS_CHAPTER');assert.equal((await startV2(ctx,'luna',now)).code,'V2_OWNERSHIP_WAKE_EXHAUSTED');
  assert.equal((await loadJob(path.join(ctx.jobRoot,'FAB-1'))).state.phase,'blocked');
});
test('default catch-up drains exactly three forward readings and leaves each for independent review',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:4}),model=fabricatedModelRun();
  const result=await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath},{run:model.run,clock:()=>now});
  assert.deepEqual(result.readings.map(r=>r.readingId),['FAB-1','FAB-2','FAB-3']);assert.equal(model.calls,3);
  for(const id of ['FAB-1','FAB-2','FAB-3']){const job=await loadJob(path.join(ctx.jobRoot,id));assert.equal(job.state.phase,'review_pending');assert.equal(job.state.review,null);assert.equal(job.state.models.spark,'gpt-6-luna');}
  assert.deepEqual((await readdir(ctx.jobRoot)).sort(),['FAB-1','FAB-2','FAB-3']);
});
test('approved configuration rebind preserves never-authored legacy history and all old session budgets',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});ctx.config.author_model='gpt-5.3-codex-spark';await startV2(ctx,'spark',now);
  let job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));const sessions=structuredClone(job.state.sessions);
  const {models:priorModels,...legacyState}=job.state;
  job=await appendState(job,'FABRICATED October 3 checkpoint',{...legacyState,phase:'queued',owners:{'TST.1':'luna'},blocker:{code:'V2_TRANSPORT_FAILED'},history:[{kind:'FABRICATED retained legacy refusal'}]},now);
  ctx.config.author_model='gpt-6-luna';const result=await startV2(ctx,'spark',new Date(now.getTime()+2*60*60*1000));
  assert.equal(result.requiredModel,'gpt-6-luna');const after=await loadJob(job.directory);assert.equal(after.state.history[0].kind,'FABRICATED retained legacy refusal');
  assert.ok(after.state.history.some(e=>e.kind==='author_configuration_rebound'));assert.equal(after.state.total_submissions,0);
  for(const [id,value] of Object.entries(sessions))assert.deepEqual(after.state.sessions[id],value);
});
test('submitted legacy candidates cannot be relabeled as the replacement model',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:12});ctx.config.author_model='gpt-5.3-codex-spark';let order=await startV2(ctx,'spark',now);await writeCandidate(order);await advanceV2(ctx,'FAB-1',sessionId(order),now);
  let job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));const {models:priorModels,...legacyState}=job.state;job=await appendState(job,'FABRICATED legacy checkpoint',{...legacyState,phase:'queued'},now);
  ctx.config.author_model='gpt-6-luna';const order2=await startV2(ctx,'spark',new Date(now.getTime()+2*60*60*1000));assert.equal(order2.requiredModel,'gpt-5.3-codex-spark');
  const after=await loadJob(job.directory);assert.deepEqual(after.state.accepted,job.state.accepted);assert.equal(after.state.total_submissions,job.state.total_submissions);assert.ok(!after.state.history.some(e=>e.kind==='author_configuration_rebound'));
});

test('Spark refusal classifier excludes generic failure, different model, tool execution and completed responses', ()=>{
  const stdout=unavailableSparkEvents();
  assert.equal(sparkModelUnavailable({status:1,stdout}),true);
  for(const result of [{status:0,stdout},{status:1,stdout,error:{code:'ETIMEDOUT'}},
    {status:1,stdout:stdout.replace('gpt-5.3-codex-spark','gpt-5.6-luna')},
    {status:1,stdout:'{"type":"turn.completed"}\n'+stdout},
    {status:1,stdout:'{"type":"item.completed","item":{"type":"command_execution"}}\n'+stdout},
    {status:1,stdout:'',stderr:'FABRICATED authentication error'},
    {status:1,stdout:stdout.replace('invalid_request_error','rate_limit_error')}])
    assert.equal(sparkModelUnavailable(result),false);
});


const repo=fileURLToPath(new URL('..',import.meta.url));
const sourceManifest={source_id:'fabricated-henry',work_title:'FABRICATED TEST COMMENTARY',module_name:'MHC',module_version:'2.2',source_version_date:'2026-01-01',retrieved_at:'2026-01-01',license:'Public domain FABRICATED TEST',archive_sha256:'a'.repeat(64),source_format:'CrossWire SWORD zCom4 OSIS',versification:'KJV',source_url:'https://example.invalid/fabricated',download_url:'https://example.invalid/fabricated.zip'};
function unit(chapter,start,end,{identity=false}={}) {
  const id=`fabricated:TST:${chapter}:${start}-${end}`,text=`vv. ${start}-${end}. FABRICATED TEST COMMENTARY: the caretaker distributes parcels to needy households. Patient kindness benefits the village during its difficult season.${identity?' The caretaker, that is, Maribel, brings help.':''}`;
  const {source_id,work_title,...provenance}=sourceManifest;
  return {schema_version:'mhc-normalized-source/v3',source_id,source_unit_id:id,work_title,book_id:'TST',chapter,verse_start:start,verse_end:end,reference_label:`Fabricated ${chapter}:${start}-${end}`,unit_type:'verse_range',source_text:text,source_text_sha256:sha256(text),source_atoms:[{source_atom_id:`${id}:a1`,sequence:1,atom_type:'commentary',text,text_sha256:sha256(text)}],worker_source_sha256:sha256(text),excluded_scripture_sha256:null,verse_anchors:[],provenance};
}
function input(verseCount=20) {
  const entry={readingId:'FAB-READING',passages:[{bookId:'TST',chapter:1,verseCount}]};
  const units=verseCount===20?[unit(1,1,11),unit(1,12,20)]:[unit(1,1,verseCount)];
  return compileReading({entry,planVersion:'fabricated-plan',scheduleDate:'2026-09-13',sourceManifest,chapters:[{bookId:'TST',chapter:1,units}]});
}
function candidate(packet) {
  return {schema_version:'mhc-evidence-candidate/v2',packet_id:packet.packet_id,records:packet.requests.map(r=>({verse_id:r.verse_id,sentences:[{text:'FABRICATED: a thoughtful village helper hands out supplies, easing the hardship faced by local families.',evidence_ids:[r.evidence_ids[0]]}]}))};
}
async function fixture(t,{verseCount=12,chapterCount=1,readingCount=1}={}) {
  const root=await mkdtemp(path.join(os.tmpdir(),'mhc-v2-fabricated-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const releaseRoot=path.join(root,'release'),projectRoot=path.join(root,'project');
  await mkdir(releaseRoot,{recursive:true});await cp(path.join(repo,'schemas'),path.join(releaseRoot,'schemas'),{recursive:true});await cp(path.join(repo,'prompts'),path.join(releaseRoot,'prompts'),{recursive:true});
  const passages=Array.from({length:chapterCount},(_,i)=>({bookId:'TST',chapter:i+1,verseCount}));
  const plan={planVersion:'fabricated-plan',entries:Array.from({length:readingCount},(_,i)=>({planVersion:'fabricated-plan',readingId:`FAB-${i+1}`,dayIndex:i+1,kind:'chapter',passages}))};
  const config={sharedStartDate:'2026-09-13',futureLookaheadDays:7};
  await atomicJson(releaseRoot,'fixtures/pilot-content/plan.json',plan);await atomicJson(releaseRoot,'fixtures/pilot-content/app-config.json',config);
  for(const dir of ['private-content','private-commentary/mhc','research/raw','research/working'])await mkdir(path.join(projectRoot,dir),{recursive:true});
  const manifest={readings:Object.fromEntries(plan.entries.map(e=>[e.readingId,{}]))};
  await atomicJson(projectRoot,'private-content/private-manifest.json',manifest);
  for(const e of plan.entries)await atomicJson(projectRoot,`private-content/bridge/celebration-y3q4/${e.readingId}.metadata.json`,{readingId:e.readingId,henrySourceLink:{sourceId:'fabricated-henry',title:'FABRICATED Henry',note:'FABRICATED test fallback',url:'https://example.invalid/fabricated'}});
  await atomicJson(projectRoot,'private-commentary/mhc/source-manifest.json',sourceManifest);
  for(const p of passages){const units=[unit(p.chapter,1,Math.min(verseCount,7)),...(verseCount>7?[unit(p.chapter,8,verseCount)]:[])],stem=`private-commentary/mhc/normalized/TST/${String(p.chapter).padStart(3,'0')}`;await mkdir(path.dirname(path.join(projectRoot,stem)),{recursive:true});await writeFile(path.join(projectRoot,`${stem}.jsonl`),units.map(u=>JSON.stringify(u)).join('\n')+'\n');await atomicJson(projectRoot,`${stem}.manifest.json`,{source_archive_sha256:sourceManifest.archive_sha256,book_id:'TST',chapter:p.chapter,indexed_verse_count:verseCount,normalized_batch_sha256:normalizedBatchHash(units)});}
  const ctx=await serviceContext({projectRoot,releaseRoot,launcher:path.join(root,'launcher.mjs'),config:{spark_automation_id:'fabricated-spark',luna_automation_id:'fabricated-luna'},runtimeRoot:path.join(projectRoot,'private-content/automation/mhc-runtime')});
  return {ctx,now:new Date('2026-09-13T15:16:00Z')};
}
async function writeCandidate(report,mutate=x=>x) {const packet=await readJson(report.sourcePath);const value=mutate(candidate(packet));await writeFile(report.candidatePath,bytesFor(value));return value;}

async function heldPairFixture(t) {
  const f=await fixture(t,{verseCount:1,chapterCount:2,readingCount:2});
  for(const [index,id] of ['LTP-0032-GEN-019','LTP-0033-PSA-004'].entries()){
    f.ctx.plan.entries[index].readingId=id;
    await atomicJson(f.ctx.privateRoot,`bridge/celebration-y3q4/${id}.metadata.json`,{readingId:id,
      henrySourceLink:{sourceId:'fabricated-henry',title:'FABRICATED paired-source test',note:'FABRICATED FALLBACK ONLY',url:'https://example.invalid/fabricated'}});
  }
  await atomicJson(f.ctx.privateRoot,'private-manifest.json',{readings:Object.fromEntries(f.ctx.plan.entries.map(e=>[e.readingId,{}]))});
  f.hold=()=>atomicJson(f.ctx.privateRoot,'automation/mhc-author-holds.json',{schema_version:'mhc-author-holds/v1',plan_version:f.ctx.plan.planVersion,
    held_readings:{'LTP-0032-GEN-019':{reason_code:'FABRICATED_SOURCE_HOLD',held_at:f.now.toISOString()}}});
  return f;
}

test('held GEN19 permits the later paired Psalm4 native author without the old requested-reading mismatch',async t=>{
  const f=await heldPairFixture(t),id='LTP-0033-PSA-004';
  const old=await selectAuthorWorkV2(f.ctx,{requestedReadingId:id,lane:'spark'},f.now);
  assert.equal(old.code,'V2_REQUESTED_READING_MISMATCH');assert.equal(old.readingId,'LTP-0032-GEN-019');
  await f.hold();const before=await jobBytes(f.ctx.jobRoot),holdBytes=await readFile(path.join(f.ctx.privateRoot,'automation/mhc-author-holds.json'));
  const selected=await selectAuthorWorkV2(f.ctx,{requestedReadingId:id,lane:'spark'},f.now);
  assert.equal(selected.action,'selected');assert.equal(selected.readingId,id);assert.deepEqual(await jobBytes(f.ctx.jobRoot),before);
  await atomicJson(f.ctx.privateRoot,'automation/mhc-author-holds.json',{schema_version:'mhc-author-holds/v1',plan_version:f.ctx.plan.planVersion,held_readings:{}});
  const restored=await selectAuthorWorkV2(f.ctx,{requestedReadingId:id,lane:'spark'},f.now);
  assert.equal(restored.code,'V2_REQUESTED_READING_MISMATCH');assert.equal(restored.readingId,'LTP-0032-GEN-019');
  assert.deepEqual(await jobBytes(f.ctx.jobRoot),before);await f.hold();
  const model=fabricatedModelRun(),result=await runAuthorSession(f.ctx,{lane:'spark',codexExecutable:process.execPath,maxReadings:1,requestedReadingId:id},{run:model.run,clock:()=>f.now});
  assert.equal(result.action,'review_handoff');assert.equal(result.readingId,id);assert.equal(result.readings.length,1);assert.equal(result.validatedBatches,2);
  assert.equal(model.calls,2);assert.deepEqual(await readdir(f.ctx.jobRoot),[id]);
  assert.deepEqual(await readFile(path.join(f.ctx.privateRoot,'automation/mhc-author-holds.json')),holdBytes);
  const job=await loadJob(path.join(f.ctx.jobRoot,id));assert.equal(job.state.total_submissions,2);
  assert.equal(Date.parse(job.state.session.deadline_at)-Date.parse(job.state.session.started_at),60*60*1000);
});

test('held queued GEN19 history, expired lease and original author budget stay byte-identical',async t=>{
  const f=await heldPairFixture(t),sources=await sourceInput(f.ctx,f.ctx.plan.entries[0]);
  let held=await createJob(f.ctx.jobRoot,sources.input,new Date(f.now.getTime()-25*60*60*1000),{spark:'gpt-5.3-codex-spark',luna:'gpt-5.6-luna'});
  held=await appendState(held,'FABRICATED retained held queue',{...held.state,phase:'queued'},f.now);
  await f.hold();const before=await jobBytes(held.directory);
  const result=await startV2(f.ctx,'spark',f.now,{requestedReadingId:'LTP-0033-PSA-004'});
  assert.equal(result.readingId,'LTP-0033-PSA-004');assert.equal(result.action,'author_candidate');assert.deepEqual(await jobBytes(held.directory),before);
  const denied=await startV2(f.ctx,'spark',f.now,{requestedReadingId:'LTP-0032-GEN-019'});
  assert.equal(denied.code,'V2_AUTHOR_HELD');assert.deepEqual(await jobBytes(held.directory),before);
});

test('an active held native owner still prevents a concurrent author and direct advance',async t=>{
  const f=await heldPairFixture(t),work=await startV2(f.ctx,'spark',f.now,{requestedReadingId:'LTP-0032-GEN-019'});
  await f.hold();const before=await jobBytes(f.ctx.jobRoot);
  for(const result of [await startV2(f.ctx,'spark',f.now,{requestedReadingId:'LTP-0033-PSA-004'}),await startV2(f.ctx,'spark',f.now),await advanceV2(f.ctx,work.readingId,sessionId(work),f.now)])assert.equal(result.code,'V2_AUTHOR_HELD');
  assert.deepEqual(await jobBytes(f.ctx.jobRoot),before);
});

test('a hold added between native admission and final selection cannot hide a genuine active owner',async t=>{
  const f=await heldPairFixture(t);await startV2(f.ctx,'spark',f.now,{requestedReadingId:'LTP-0032-GEN-019'});
  const before=await jobBytes(f.ctx.jobRoot);let changed=false;
  // The admission context copy occurs after observing the original active owner.
  // This fabricated side effect simulates an external atomic hold update there.
  Object.defineProperty(f.ctx,'fabricatedHoldRace',{enumerable:true,get(){
    changed=true;writeFileSync(path.join(f.ctx.privateRoot,'automation/mhc-author-holds.json'),bytesFor({schema_version:'mhc-author-holds/v1',plan_version:f.ctx.plan.planVersion,
      held_readings:{'LTP-0032-GEN-019':{reason_code:'FABRICATED_HOLD_RACE',held_at:f.now.toISOString()}}}));return 'FABRICATED';
  }});
  const result=await startV2(f.ctx,'spark',f.now);
  assert.equal(changed,true);assert.equal(result.code,'V2_AUTHOR_HELD');assert.equal(result.readingId,'LTP-0032-GEN-019');
  assert.deepEqual(await jobBytes(f.ctx.jobRoot),before);assert.deepEqual(await readdir(f.ctx.jobRoot),['LTP-0032-GEN-019']);
});

test('held partial input without event history does not become a generating owner or get rebound',async t=>{
  const f=await heldPairFixture(t),sources=await sourceInput(f.ctx,f.ctx.plan.entries[0]),directory=path.join(f.ctx.jobRoot,'LTP-0032-GEN-019');
  await mkdir(path.join(directory,'events'),{recursive:true});await atomicJson(directory,'input.json',sources.input,{immutable:true});
  await f.hold();const before=await jobBytes(directory);
  const result=await startV2(f.ctx,'spark',f.now,{requestedReadingId:'LTP-0033-PSA-004'});
  assert.equal(result.action,'author_candidate');assert.equal(result.readingId,'LTP-0033-PSA-004');assert.deepEqual(await jobBytes(directory),before);
});

test('malformed or wrong-plan author holds reject before native mutation',async t=>{
  const f=await heldPairFixture(t),before=await jobBytes(f.ctx.jobRoot);
  for(const holds of [{schema_version:'mhc-author-holds/v1',plan_version:'WRONG',held_readings:{}},{schema_version:'mhc-author-holds/v1',plan_version:f.ctx.plan.planVersion,held_readings:{UNKNOWN:{reason_code:'FABRICATED_HOLD',held_at:f.now.toISOString()}}},{not:'a hold'}]){
    await atomicJson(f.ctx.privateRoot,'automation/mhc-author-holds.json',holds);
    await assert.rejects(startV2(f.ctx,'spark',f.now,{requestedReadingId:'LTP-0033-PSA-004'}),/V2_AUTHOR_HOLDS/);
    assert.deepEqual(await jobBytes(f.ctx.jobRoot),before);
  }
});

test('held earlier reading cannot bypass a global ChatGPT login failure',async t=>{
  const f=await heldPairFixture(t);await f.hold();const before=await jobBytes(f.ctx.jobRoot),model=fabricatedModelRun();
  const run=(bin,args,options)=>args[0]==='login'?{status:0,stderr:'FABRICATED Logged in using API key'}:model.run(bin,args,options);
  const result=await runAuthorSession(f.ctx,{lane:'spark',codexExecutable:process.execPath,maxReadings:1,requestedReadingId:'LTP-0033-PSA-004'},{run,clock:()=>f.now});
  assert.equal(result.code,'V2_AUTHOR_MODEL_UNAVAILABLE');assert.equal(model.calls,0);assert.deepEqual(await jobBytes(f.ctx.jobRoot),before);
});
const sessionId=report=>report.advanceArgv.at(-1);
function fabricatedModelRun(transform=x=>x,{model=MODELS.spark}={}){
  let calls=0;
  const run=(_binary,args,options)=>{
    if(args[0]==='exec'){
      assert.deepEqual(args.slice(0,2),['exec','--ephemeral']);
      assert.equal(args.filter(arg=>arg==='--ephemeral').length,1);
    }
    if(args[0]==='--version')return {status:0,stdout:'codex-cli 0.162.1'};
    if(options.input?.startsWith('Availability preflight')){writeFileSync(args[args.indexOf('--output-last-message')+1],bytesFor({ok:true}));return {status:0,stdout:'{"type":"turn.completed"}\n'};}
    if(args[0]==='login')return {status:0,stderr:'Logged in using ChatGPT'};
    if(args.includes('mcp'))return {status:0,stdout:JSON.stringify([{name:'fabricated_mcp',enabled:!args.includes('mcp_servers.fabricated_mcp.enabled=false')}])};
    calls++;
    assert.ok(args.includes(model));assert.ok(args.includes('mcp_servers.fabricated_mcp.enabled=false'));
    assert.ok(!options.input.includes('FABRICATED PRIVATE DEVOTIONAL'));
    const packet=JSON.parse(options.input.split('SOURCE PACKET:\n')[1].split('\n\n')[0]);
    const output=transform(candidate(packet),calls);
    if(output===null)return {status:1,stderr:'FABRICATED transport failure'};
    writeFileSync(args[args.indexOf('--output-last-message')+1],bytesFor(output));
    return {status:0,stdout:'{"type":"thread.started"}\n{"type":"item.completed","item":{"type":"agent_message","text":"FABRICATED JSON output"}}\n{"type":"turn.completed"}\n'};
  };
  return {run,get calls(){return calls;}};
}

async function jobBytes(root) {
  const entries=[];
  async function visit(directory,relative=''){
    for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const name=path.join(relative,entry.name);entries.push([name,entry.isDirectory()?'directory':(await readFile(path.join(root,name))).toString('base64')]);
      if(entry.isDirectory())await visit(path.join(root,name),name);
    }
  }
  await visit(root);return entries;
}
test('requested author run rejects multi-reading caps before any probe or claim',async t=>{
  assert.equal(selectionBindingVersion,'requested-reading/v1');
  const {ctx,now}=await fixture(t),model=fabricatedModelRun();
  for(const maxReadings of [undefined,2,3])await assert.rejects(runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath,requestedReadingId:'FAB-1',maxReadings},{run:()=>assert.fail('No child may run'),clock:()=>now}),/V2_AUTHOR_REQUESTED_READING_CAP_INVALID/);
  assert.equal(model.calls,0);assert.deepEqual(await readdir(ctx.jobRoot),[]);
});
for(const retained of [false,true])test(`unavailable requested preflight changes no job bytes (retained=${retained})`,async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});if(retained)await startV2(ctx,'spark',now);
  const before=await jobBytes(ctx.jobRoot),model=fabricatedModelRun();
  const run=(bin,args,opts)=>opts.input?.startsWith('Availability preflight')?{status:1,stderr:'FABRICATED HTTP 400: model not supported'}:model.run(bin,args,opts);
  const result=await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath,maxReadings:1,requestedReadingId:'FAB-1'},{run,clock:()=>now});
  assert.equal(result.code,'V2_AUTHOR_MODEL_UNAVAILABLE');assert.equal(model.calls,0);assert.deepEqual(await jobBytes(ctx.jobRoot),before);
});
for(const phase of ['generating','queued'])test(`requested mismatch preserves the retained ${phase} job and ownership counters`,async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:2});await startV2(ctx,'spark',now);
  if(phase==='queued'){const job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));await appendState(job,'FABRICATED queued continuation',{...job.state,phase},now);}
  const before=await jobBytes(ctx.jobRoot);
  for(const request of [{requestedReadingId:'FAB-2',lane:'spark'},{requestedReadingId:'FAB-1',lane:'luna'}]){
    const result=await startV2(ctx,request.lane,now,request);assert.equal(result.code,'V2_REQUESTED_READING_MISMATCH');assert.equal(result.action,'none');
    assert.deepEqual(await jobBytes(ctx.jobRoot),before);
  }
  const selected=await selectAuthorWorkV2(ctx,{requestedReadingId:'FAB-1'},now);assert.equal(selected.authorLane,'spark');assert.equal(selected.selectionKind,phase);
  assert.deepEqual(await jobBytes(ctx.jobRoot),before);
});
test('wrong requested reading rejects before configuration rebind or lease expiry writes',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:3});ctx.config.author_model='gpt-5.3-codex-spark';await startV2(ctx,'spark',now);
  let job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));await appendState(job,'FABRICATED retained checkpoint',{...job.state,phase:'queued'},now);
  ctx.config.author_model='gpt-6-luna';let before=await jobBytes(ctx.jobRoot);
  const rebound=await startV2(ctx,'spark',new Date(now.getTime()+2*60*60*1000),{requestedReadingId:'FAB-2'});assert.equal(rebound.code,'V2_REQUESTED_READING_MISMATCH');assert.equal(rebound.readingId,'FAB-1');assert.deepEqual(await jobBytes(ctx.jobRoot),before);
  ctx.config.author_model='gpt-5.3-codex-spark';before=await jobBytes(ctx.jobRoot);
  const expired=await startV2(ctx,'spark',new Date(now.getTime()+24*60*60*1000),{requestedReadingId:'FAB-3'});assert.equal(expired.code,'V2_REQUESTED_READING_MISMATCH');assert.equal(expired.readingId,'FAB-2');assert.deepEqual(await jobBytes(ctx.jobRoot),before);
});
test('requested scope excludes yesterday, outside T+7 and introductions without native mutation',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:9});await startV2(ctx,'spark',now);
  const before=await jobBytes(ctx.jobRoot),tomorrow=new Date(now.getTime()+13*60*60*1000);
  for(const [id,time] of [['FAB-1',tomorrow],['FAB-9',now],['FAB-UNKNOWN',now]]){
    const result=await startV2(ctx,'spark',time,{requestedReadingId:id});assert.equal(result.reason,'outside_forward_window');assert.deepEqual(await jobBytes(ctx.jobRoot),before);
  }
  ctx.plan.entries[1].kind='book_intro';assert.equal((await selectAuthorWorkV2(ctx,{requestedReadingId:'FAB-2'},now)).reason,'outside_forward_window');
  ctx.plan.entries[1].kind='chapter';const blocked=await startV2(ctx,'spark',tomorrow,{requestedReadingId:'FAB-2'});assert.equal(blocked.readingId,'FAB-1');assert.equal(blocked.reason,'native_selection_differs');assert.deepEqual(await jobBytes(ctx.jobRoot),before);
});
test('requested guard reads interrupted input without creating its missing events directory',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:2}),source=await sourceInput(ctx,ctx.plan.entries[0]);
  await atomicJson(ctx.jobRoot,'FAB-1/input.json',source.input,{immutable:true});const before=await jobBytes(ctx.jobRoot);
  assert.equal((await startV2(ctx,'spark',now,{requestedReadingId:'FAB-2'})).code,'V2_REQUESTED_READING_MISMATCH');assert.deepEqual(await jobBytes(ctx.jobRoot),before);
  const selected=await selectAuthorWorkV2(ctx,{requestedReadingId:'FAB-1'},now);assert.equal(selected.authorLane,'spark');assert.deepEqual(await jobBytes(ctx.jobRoot),before);
  assert.equal((await startV2(ctx,'spark',now,{requestedReadingId:'FAB-1'})).action,'author_candidate');
});
test('valid requested work leaves an unrelated expired out-of-window legacy queue byte-identical',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:9}),source=await sourceInput(ctx,ctx.plan.entries[8]);
  let future=await createJob(ctx.jobRoot,source.input,new Date(now.getTime()-48*60*60*1000),{spark:'gpt-5.3-codex-spark',luna:MODELS.luna});
  future=await appendState(future,'FABRICATED out-of-window continuation',{...future.state,phase:'queued'},now);const before=await jobBytes(future.directory);
  assert.equal((await startV2(ctx,'spark',now,{requestedReadingId:'FAB-1'})).action,'author_candidate');assert.deepEqual(await jobBytes(future.directory),before);
});
test('requested selector reports proven exhausted fallback Luna and preserves native budgets',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:2});let work=await startV2(ctx,'spark',now);
  for(let i=0;i<2;i++){await writeCandidate(work,c=>({...c,packet_id:'MHP2-'+String(i).repeat(32)}));work=await advanceV2(ctx,'FAB-1',sessionId(work),now);}
  const before=await jobBytes(ctx.jobRoot),prior=await loadJob(path.join(ctx.jobRoot,'FAB-1'));
  const selected=await selectAuthorWorkV2(ctx,{requestedReadingId:'FAB-1'},now);assert.equal(selected.authorLane,'luna');assert.equal(selected.requiredModel,MODELS.luna);assert.equal(selected.selectionKind,'fallback_pending');assert.deepEqual(await jobBytes(ctx.jobRoot),before);
  assert.equal((await startV2(ctx,'spark',now,{requestedReadingId:'FAB-1'})).code,'V2_REQUESTED_READING_MISMATCH');assert.deepEqual(await jobBytes(ctx.jobRoot),before);
  const model=fabricatedModelRun(x=>x,{model:MODELS.luna}),result=await runAuthorSession(ctx,{lane:selected.authorLane,codexExecutable:process.execPath,maxReadings:1,requestedReadingId:'FAB-1'},{run:model.run,clock:()=>now});
  assert.equal(result.action,'review_handoff');assert.equal(result.totalSubmissions,3);assert.equal(model.calls,1);assert.deepEqual(await readdir(ctx.jobRoot),['FAB-1']);
  const after=await loadJob(prior.directory);assert.deepEqual(after.state.rejected,prior.state.rejected);for(const [id,session] of Object.entries(prior.state.sessions))assert.deepEqual(after.state.sessions[id],session);
});
test('requested fallback rejects an exhaustion label without the two controller rejections',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});const work=await startV2(ctx,'spark',now),job=await loadJob(path.join(ctx.jobRoot,'FAB-1')),packet=await readJson(work.sourcePath);
  await appendState(job,'FABRICATED invalid exhaustion label',{...job.state,phase:'fallback_pending',blocker:{code:'V2_CANDIDATE_EXHAUSTED',lane:'spark',packet_id:packet.packet_id}},now);const before=await jobBytes(ctx.jobRoot);
  await assert.rejects(selectAuthorWorkV2(ctx,{requestedReadingId:'FAB-1'},now),/V2_FALLBACK_NOT_ELIGIBLE/);assert.deepEqual(await jobBytes(ctx.jobRoot),before);
});
for(const guarded of [true,false])test(`earlier exhausted fallback versus later primary queue retains opt-in EDF (guarded=${guarded})`,async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:2});let work=await startV2(ctx,'spark',now);
  for(let i=0;i<2;i++){await writeCandidate(work,c=>({...c,packet_id:'MHP2-'+String(i).repeat(32)}));work=await advanceV2(ctx,'FAB-1',sessionId(work),now);}
  const source=await sourceInput(ctx,ctx.plan.entries[1]);let later=await createJob(ctx.jobRoot,source.input,now);
  later=await appendState(later,'FABRICATED later queued primary',{...later.state,phase:'queued'},now);
  const before=await jobBytes(ctx.jobRoot),laterBytes=await jobBytes(later.directory),fallbackBytes=await jobBytes(path.join(ctx.jobRoot,'FAB-1'));
  const selection=await selectAuthorWorkV2(ctx,{requestedReadingId:'FAB-1'},now);assert.equal(selection.authorLane,'luna');assert.equal(selection.selectionKind,'fallback_pending');assert.deepEqual(await jobBytes(ctx.jobRoot),before);
  const result=await startV2(ctx,'luna',now,guarded?{requestedReadingId:'FAB-1'}:{});
  if(guarded){assert.equal(result.readingId,'FAB-1');assert.equal(result.action,'author_candidate');assert.equal(result.requiredModel,MODELS.luna);assert.equal(result.totalSubmissions,2);assert.deepEqual(await jobBytes(later.directory),laterBytes);}
  else {assert.equal(result.readingId,'FAB-2');assert.equal(result.code,'V2_OTHER_MODEL_OWNS_CHAPTER');assert.deepEqual(await jobBytes(path.join(ctx.jobRoot,'FAB-1')),fallbackBytes);}
});
test('guarded EDF chooses an earlier new reading ahead of a later primary queue without mutating that queue',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:2}),source=await sourceInput(ctx,ctx.plan.entries[1]);
  let later=await createJob(ctx.jobRoot,source.input,now);later=await appendState(later,'FABRICATED later queued primary',{...later.state,phase:'queued'},now);const before=await jobBytes(later.directory);
  const selection=await selectAuthorWorkV2(ctx,{requestedReadingId:'FAB-1'},now);assert.equal(selection.selectionKind,'new');assert.equal(selection.authorLane,'spark');
  assert.equal((await startV2(ctx,'spark',now,{requestedReadingId:'FAB-1'})).readingId,'FAB-1');assert.deepEqual(await jobBytes(later.directory),before);
});
test('requested author preflights before native selection and authors exactly its selected reading',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:2}),model=fabricatedModelRun();let probes=0;
  const run=(bin,args,opts)=>{if(opts.input?.startsWith('Availability preflight')){probes++;assert.deepEqual(readdirSync(ctx.jobRoot),[]);}else if(opts.input?.includes('SOURCE PACKET:'))assert.equal(probes,2);return model.run(bin,args,opts);};
  const result=await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath,maxReadings:1,requestedReadingId:'FAB-1'},{run,clock:()=>now});assert.equal(result.action,'review_handoff');assert.equal(result.readingId,'FAB-1');assert.equal(model.calls,1);assert.deepEqual(await readdir(ctx.jobRoot),['FAB-1']);
});
async function dailyDependencyFixture(ctx,now,{readingId='FAB-1',orderChanges={},jobChanges={},selectionChanges={},executionChanges={}}={}) {
  const protocol=await readJson(path.join(repo,'config/daily-study-protocol.json'));
  const order=buildRollingStudyWorkOrder({plan:ctx.plan,appConfig:ctx.appConfig,protocol,today:'2026-09-13',issuedAt:now.toISOString()});
  order.reading=structuredClone(ctx.plan.entries.find(e=>e.readingId===readingId));Object.assign(order,orderChanges);
  order.workOrderId=`RSWO-${sha256(JSON.stringify({plan:order.planVersion,reading:order.reading.readingId,reasonCode:order.reasonCode,planExtensionRequired:order.planExtensionRequired})).slice(0,24)}`;
  const bytes=bytesFor(order),hash=sha256(bytes),relative=`private-content/automation/staging/${readingId}/supervisor/orders/${hash}.json`;
  await atomicJson(ctx.projectRoot,relative,order,{immutable:true});
  const journal=await openJournal(path.join(ctx.projectRoot,'private-content/automation/service-supervisor/state')),id='a'.repeat(32),executionId='b'.repeat(32),output=bytesFor({label:'FABRICATED admitted synthesis only'});
  await atomicJson(journal.root,`executions/${executionId}/output.json`,JSON.parse(output));
  const execution={id:executionId,readingId,kind:'daily-synthesis',phase:'accepted',threadId:'FABRICATED-daily-author',output:{path:`executions/${executionId}/output.json`,sha256:sha256(output)},...executionChanges};
  const job={schemaVersion:'service-supervisor-daily-state/v1',id,readingId,phase:'waiting_henry',blocker:null,workOrder:{path:relative,sha256:hash},authorSessionId:executionId,authorThreadId:execution.threadId,...jobChanges};
  const scheduleDate=new Date(Date.parse('2026-09-13T00:00:00Z')+(order.reading.dayIndex-1)*86400000).toISOString().slice(0,10);
  await journal.append('observation',{role:'preparation',selection:{effectiveDate:'2026-09-13',next:{readingId,component:'daily',action:'daily_author',scheduleDate},...selectionChanges}},now);
  await journal.append('execution_state',{execution},now);await journal.append('daily_state',{job},now);
  return {reference:{path:relative,sha256:hash,dailyJobId:id},journal,job,order};
}
test('admitted requested daily dependency prepares one unpublished Henry reading without a fallback or remote mutation',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:2});
  await atomicJson(ctx.projectRoot,'private-content/private-manifest.json',{readings:{}});const manifestBytes=await readFile(path.join(ctx.privateRoot,'private-manifest.json'));
  await rm(path.join(ctx.privateRoot,'bridge'),{recursive:true,force:true});const {reference}=await dailyDependencyFixture(ctx,now);
  assert.equal((await startV2(ctx,'spark',now)).state,'no_eligible_reading');assert.deepEqual(await readdir(ctx.jobRoot),[]);
  const before=await jobBytes(ctx.jobRoot),selected=await selectAuthorWorkV2(ctx,{requestedReadingId:'FAB-1',requestedDailyWorkOrder:reference},now);
  assert.equal(selected.authorLane,'spark');assert.equal(selected.selectionKind,'daily_dependency');assert.deepEqual(await jobBytes(ctx.jobRoot),before);
  const model=fabricatedModelRun(),result=await runAuthorSession(ctx,{lane:selected.authorLane,codexExecutable:process.execPath,maxReadings:1,requestedReadingId:'FAB-1',requestedDailyWorkOrder:reference},{run:model.run,clock:()=>now});
  assert.equal(result.action,'review_handoff');assert.equal(model.calls,1);assert.deepEqual(await readdir(ctx.jobRoot),['FAB-1']);
  const job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));assert.equal(job.state.review,null);assert.equal(job.state.total_submissions,1);
  assert.equal(job.state.history.find(e=>e.kind==='daily_dependency_admitted').work_order_sha256,reference.sha256);
  assert.deepEqual(await readFile(path.join(ctx.privateRoot,'private-manifest.json')),manifestBytes);await assert.rejects(readdir(path.join(ctx.privateRoot,'bridge')),/ENOENT/);
});
test('guarded EDF starts an admitted earlier daily dependency ahead of a later queued primary',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:2});await atomicJson(ctx.projectRoot,'private-content/private-manifest.json',{readings:{}});
  const source=await sourceInput(ctx,ctx.plan.entries[1]);let later=await createJob(ctx.jobRoot,source.input,now);
  later=await appendState(later,'FABRICATED later queued primary',{...later.state,phase:'queued'},now);const before=await jobBytes(later.directory),{reference}=await dailyDependencyFixture(ctx,now);
  const request={requestedReadingId:'FAB-1',requestedDailyWorkOrder:reference},selection=await selectAuthorWorkV2(ctx,request,now);
  assert.equal(selection.selectionKind,'daily_dependency');assert.equal(selection.authorLane,'spark');
  const result=await startV2(ctx,selection.authorLane,now,request);assert.equal(result.readingId,'FAB-1');assert.equal(result.action,'author_candidate');assert.deepEqual(await jobBytes(later.directory),before);
  assert.equal((await loadJob(path.join(ctx.jobRoot,'FAB-1'))).state.history[0].kind,'daily_dependency_admitted');
});
for(const changes of [
  {orderChanges:{action:'none'}},{orderChanges:{planVersion:'FABRICATED-other-plan'}},
  {orderChanges:{effectiveDate:'2026-09-12'}},{orderChanges:{targetDate:'2026-09-19'}},
  {orderChanges:{issuedAt:'2026-09-13T16:16:00Z'}},{orderChanges:{issuedAt:'2026-09-12T15:16:00Z'}},
  {orderChanges:{guards:{maxReadings:2}}},{jobChanges:{phase:'queued'}},{jobChanges:{blocker:{code:'FABRICATED_BLOCKED'}}},
  {selectionChanges:{next:{readingId:'FAB-2',component:'daily',action:'daily_author',scheduleDate:'2026-09-14'}}},
  {executionChanges:{phase:'reserved'}},{executionChanges:{readingId:'FAB-2'}}
])test(`requested daily dependency rejects unadmitted/stale binding ${JSON.stringify(changes)}`,async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:2}),{reference}=await dailyDependencyFixture(ctx,now,changes),before=await jobBytes(ctx.jobRoot);
  await assert.rejects(startV2(ctx,'spark',now,{requestedReadingId:'FAB-1',requestedDailyWorkOrder:reference}));assert.deepEqual(await jobBytes(ctx.jobRoot),before);
});
test('requested daily dependency requires exact persisted order and synthesis bytes plus the latest same-journal waiting state',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1}),{reference,journal,job}=await dailyDependencyFixture(ctx,now),before=await jobBytes(ctx.jobRoot);
  for(const forged of [{...reference,sha256:'c'.repeat(64)},{...reference,path:'private-content/private-manifest.json'},{...reference,dailyJobId:'c'.repeat(32)},{...reference,extra:'FABRICATED'}])await assert.rejects(selectAuthorWorkV2(ctx,{requestedReadingId:'FAB-1',requestedDailyWorkOrder:forged},now));
  await writeFile(path.join(journal.root,`executions/${job.authorSessionId}/output.json`),'FABRICATED changed synthesis');await assert.rejects(selectAuthorWorkV2(ctx,{requestedReadingId:'FAB-1',requestedDailyWorkOrder:reference},now));
  await journal.append('daily_state',{job:{...job,phase:'blocked'}},now);await assert.rejects(selectAuthorWorkV2(ctx,{requestedReadingId:'FAB-1',requestedDailyWorkOrder:reference},now));
  assert.deepEqual(await jobBytes(ctx.jobRoot),before);
});
for(const retained of [false,true])test(`requested daily dependency cannot bypass earlier native work (retained=${retained})`,async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:2});if(retained)await startV2(ctx,'spark',now);
  const {reference}=await dailyDependencyFixture(ctx,now,{readingId:'FAB-2'}),before=await jobBytes(ctx.jobRoot);
  const result=await startV2(ctx,'spark',now,{requestedReadingId:'FAB-2',requestedDailyWorkOrder:reference});assert.equal(result.code,'V2_REQUESTED_READING_MISMATCH');assert.equal(result.readingId,'FAB-1');assert.deepEqual(await jobBytes(ctx.jobRoot),before);
});
test('requested daily dependency needs a one-reading request and actual preflight before any native mutation',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1}),{reference}=await dailyDependencyFixture(ctx,now),before=await jobBytes(ctx.jobRoot),model=fabricatedModelRun();
  await assert.rejects(runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath,maxReadings:1,requestedDailyWorkOrder:reference},{run:()=>assert.fail('No child may run')}),/V2_AUTHOR_DAILY_WORK_ORDER_CAP_INVALID/);
  const run=(bin,args,opts)=>opts.input?.startsWith('Availability preflight')?{status:1,stderr:'FABRICATED HTTP 400: model not supported'}:model.run(bin,args,opts);
  const result=await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath,maxReadings:1,requestedReadingId:'FAB-1',requestedDailyWorkOrder:reference},{run,clock:()=>now});assert.equal(result.code,'V2_AUTHOR_MODEL_UNAVAILABLE');assert.deepEqual(await jobBytes(ctx.jobRoot),before);assert.equal(model.calls,0);
});

test('installed author transport drains only one reading through strict controller and leaves review pending',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:12,readingCount:2}),model=fabricatedModelRun();
  const result=await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath,maxReadings:1},{run:model.run,clock:()=>now});
  assert.equal(result.action,'review_handoff');assert.equal(result.readingId,'FAB-1');assert.equal(result.totalSubmissions,model.calls);
  const job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));assert.equal(job.state.phase,'review_pending');assert.equal(job.state.review,null);
  assert.deepEqual((await readdir(ctx.jobRoot)),['FAB-1']);
});
test('author transport preserves controller repair and fallback budgets',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1}),model=fabricatedModelRun((value,calls)=>({...value,records:[],fabricated_invalid_attempt:calls}));
  const result=await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath},{run:model.run,clock:()=>now});
  assert.equal(model.calls,2);assert.equal(result.totalSubmissions,2);assert.equal(result.state,'fallback_pending');
});
test('failed author transport cannot repeat the same dispatch or masquerade as candidate exhaustion',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1}),model=fabricatedModelRun(()=>null),options={lane:'spark',codexExecutable:process.execPath},deps={run:model.run,clock:()=>now};
  const first=await runAuthorSession(ctx,options,deps),second=await runAuthorSession(ctx,options,deps);
  assert.equal(first.code,'V2_TRANSPORT_FAILED');assert.equal(second.code,'V2_TRANSPORT_RETRY_EXHAUSTED');assert.equal(model.calls,1);
  const job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));assert.equal(job.state.total_submissions,0);assert.equal(job.state.phase,'blocked');
});
test('unstarted configuration recovery preserves failed bytes and budgets and resumes only on a new release',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});ctx.config.source_revision='a'.repeat(40);const model=fabricatedModelRun();
  const failing=(bin,args,options)=>options.input?.includes('SOURCE PACKET:')?{status:1,stdout:'',stderr:'FABRICATED transport timeout'}:model.run(bin,args,options);
  await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath},{run:failing,clock:()=>now});
  const fabricatedFailureRoot=path.join(ctx.jobRoot,'FAB-1');const fabricatedKey=(await readdir(path.join(fabricatedFailureRoot,'model-executions')))[0];await writeFile(path.join(fabricatedFailureRoot,'model-executions',fabricatedKey,'stderr.txt'),'Error loading config.toml: invalid transport\nin `mcp_servers.fabricated_mcp`\n');
  const root=path.join(ctx.jobRoot,'FAB-1'),before=await loadJob(root),key=(await readdir(path.join(root,'model-executions')))[0],file=path.join(root,'model-executions',key,'result.json'),bytes=await readFile(file);
  await assert.rejects(recoverUnstartedTransport(ctx.projectRoot,'FAB-1','a'.repeat(40),now),/NEW_RELEASE_REQUIRED/);
  await writeFile(path.join(root,'model-executions',key,'events.jsonl'),'{}');
  await assert.rejects(recoverUnstartedTransport(ctx.projectRoot,'FAB-1','b'.repeat(40),now),/MODEL_MAY_HAVE_STARTED/);
  await writeFile(path.join(root,'model-executions',key,'events.jsonl'),'');
  // Reproduce the older adapter's still-generating checkpoint for the installer.
  await appendState(await loadJob(root),'FABRICATED legacy transport checkpoint',{...before.state,phase:'generating'},now);
  await recoverUnstartedTransport(ctx.projectRoot,'FAB-1','b'.repeat(40),now);
  const recovered=await loadJob(root);assert.equal(recovered.state.phase,'queued');assert.deepEqual(recovered.state.sessions,before.state.sessions);assert.equal(recovered.state.total_submissions,0);assert.deepEqual(await readFile(file),bytes);
  await assert.rejects(recoverUnstartedTransport(ctx.projectRoot,'FAB-1','c'.repeat(40),now),/NOT_UNSTARTED/);
  ctx.config.source_revision='b'.repeat(40);
  const result=await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath},{run:model.run,clock:()=>now});assert.equal(result.readings[0].action,'review_handoff');assert.equal(result.readings[0].totalSubmissions,1);assert.equal(model.calls,1);assert.deepEqual(await readFile(file),bytes);
});
test('identical rejected author output checkpoints instead of consuming repeated model calls',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1}),model=fabricatedModelRun(value=>({...value,records:[]}));
  const result=await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath},{run:model.run,clock:()=>now});
  assert.equal(model.calls,2);assert.equal(result.totalSubmissions,1);assert.equal(result.code,'V2_TRANSPORT_UNCHANGED_CANDIDATE');
});
test('author transport rejects edited source and outside packet paths before model execution',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1}),work=await startV2(ctx,'spark',now);
  await assert.rejects(verifyPublicPacket(ctx,{...work,sourcePath:path.join(ctx.projectRoot,'private-content/private-manifest.json')},'spark'),/PATH_OUTSIDE_ROOT/);
  const packet=await readJson(work.sourcePath);packet.evidence[0].text='FABRICATED PRIVATE DEVOTIONAL';await writeFile(work.sourcePath,bytesFor(packet));
  await assert.rejects(verifyPublicPacket(ctx,work,'spark'),/PUBLIC_SOURCE_MISMATCH/);
});
test('author transport admits only fixed repair hints and hash-verified installed instructions',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1}),work=await startV2(ctx,'spark',now),packet=await readJson(work.sourcePath);
  const privateMarker='FABRICATED PRIVATE DEVOTIONAL';
  const hints=publicRepairDiagnostics({records:[privateMarker],diagnostics:[{code:'V2_SOURCE_COPY',message:privateMarker,verse_id:packet.requests[0].verse_id,path:privateMarker},{code:privateMarker,message:privateMarker,verse_id:privateMarker}]},packet);
  assert.ok(!JSON.stringify(hints).includes(privateMarker));assert.equal(hints[0].verse_id,packet.requests[0].verse_id);assert.equal(hints[1].code,'V2_CANDIDATE_SCHEMA');
  const instructions=await readJson(work.instructionsPath);instructions.instructions=privateMarker;await writeFile(work.instructionsPath,bytesFor(instructions));
  await assert.rejects(verifyPublicPacket(ctx,work,'spark'),/INSTRUCTIONS_INVALID/);
});
test('author transport cannot use API-key auth, alternate models or successful tool activity',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});
  assert.equal((await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath},{run:()=>({status:0,stdout:'Logged in using API key'}),clock:()=>now})).state,'blocked');
  assert.throws(()=>authorArguments({model:'fabricated-other-model',reasoning:'low'}),/MODEL_INVALID/);
  assert.equal(successfulModelResult({status:0,stdout:'{"type":"item.completed","item":{"type":"command_execution"}}\n{"type":"turn.completed"}'}),false);
  assert.equal(successfulModelResult({status:0,stdout:'{"type":"turn.failed"}'}),false);
  const original={const:'FABRICATED',uniqueItems:true},adapted=transportSchema(original);assert.deepEqual(original,{const:'FABRICATED',uniqueItems:true});assert.deepEqual(adapted,{const:'FABRICATED',type:'string'});
});
async function drain(ctx,now,{lane='spark'}={}) {let report=await startV2(ctx,lane,now),count=0;while(['author_candidate','repair_candidate'].includes(report.action)){await writeCandidate(report);report=await advanceV2(ctx,report.readingId,sessionId(report),now);assert.ok(++count<40);}return {report,count};}
async function approve(ctx,id,now) {const order=await reviewWorkOrderV2(ctx,now),bundle=await readJson(order.bundlePath);assert.equal(order.readingId,id);await writeFile(order.reviewPath,bytesFor({schema_version:'mhc-evidence-approval/v2',reading_id:id,review_basis_sha256:bundle.review_basis_sha256,status:'approved',reviewer:'FABRICATED independent reviewer',reviewed_at:now.toISOString(),findings:['FABRICATED comparison of every sentence and source only; no real commentary.'],assertions:Object.fromEntries(REVIEW_ASSERTIONS.map(k=>[k,true])),corrections:[]}));return applyReviewV2(ctx,id,now);}

test('v2 respects natural treatment boundaries, bounds batches, and excludes normalized Scripture accounting text',()=>{
  const compiled=input();assert.deepEqual(compiled.chapters[0].batches.map(p=>p.requests.length),[8,3,8,1]);
  for(const packet of compiled.chapters[0].batches){assert.equal(new Set(packet.requests.map(r=>r.source_reference_label)).size,1);assert.ok(!JSON.stringify(packet).includes('source_text'));}
  assert.equal(compiled.input_sha256,input().input_sha256);
});
test('v2 accepts a faithful synonym without a generated vocabulary scaffold',()=>{const p=input(1).chapters[0].batches[0];assert.equal(validateCandidate(candidate(p),p).valid,true);});
test('reopened approval requires fresh review and isolated transactions without erasing prior work',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});await drain(ctx,now);await approve(ctx,'FAB-1',now);
  const directory=path.join(ctx.jobRoot,'FAB-1'),before=await loadJob(directory),oldHash=before.state.review.approved_sha256;
  const oldBytes=await readFile(path.join(directory,`approved/${oldHash}.json`)),oldReview=await readFile(path.join(directory,'review.json'));
  const reason='FABRICATED reviewer found a material missing qualification';
  await assert.rejects(reopenReviewV2(ctx,'FAB-1','0'.repeat(64),'FABRICATED reviewer',reason,now),/APPROVAL_BINDING/);
  await reopenReviewV2(ctx,'FAB-1',oldHash,'FABRICATED reviewer',reason,now);
  const reopened=await loadJob(directory);assert.equal(reopened.state.phase,'review_pending');assert.equal(reopened.state.review,null);assert.deepEqual(reopened.state.accepted,before.state.accepted);assert.deepEqual(reopened.state.sessions,before.state.sessions);assert.equal(reopened.state.total_submissions,before.state.total_submissions);
  await reopenReviewV2(ctx,'FAB-1',oldHash,'FABRICATED reviewer',reason,now);assert.equal((await loadJob(directory)).sequence,reopened.sequence);
  await assert.rejects(applyReviewV2(ctx,'FAB-1',now),/APPROVAL_INVALID/);
  const order=await reviewWorkOrderV2(ctx,now),bundle=await readJson(order.bundlePath);assert.equal(bundle.previous_approvals[0].approved_sha256,oldHash);assert.notEqual(bundle.review_basis_sha256,JSON.parse(oldReview).review_basis_sha256);
  const review={...JSON.parse(oldReview),review_basis_sha256:bundle.review_basis_sha256,reviewed_at:new Date(now.getTime()+1000).toISOString(),corrections:[{verse_id:'TST.1.1',blurb:'FABRICATED: the village caretaker patiently supplies households facing hardship, helping neighbors through a difficult period.',reason:'FABRICATED source-compared revision.'}]};await writeFile(order.reviewPath,bytesFor(review));
  await applyReviewV2(ctx,'FAB-1',now);await applyReviewV2(ctx,'FAB-1',now);
  const after=await loadJob(directory);assert.notEqual(after.state.review.approved_sha256,oldHash);assert.deepEqual(await readFile(path.join(directory,`approved/${oldHash}.json`)),oldBytes);
  assert.ok((await readdir(path.join(directory,'transactions'))).some(n=>n.startsWith('FAB-1-')));assert.ok((await readdir(path.join(directory,'transactions/revisions'))).includes(after.state.review.approved_sha256));
  await assert.rejects(reopenReviewV2(ctx,'FAB-1',oldHash,'FABRICATED reviewer',reason,now),/APPROVAL_BINDING/);
});
test('reopening a published reading removes completion proof but leaves live metadata and receipt intact',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});await drain(ctx,now);await approve(ctx,'FAB-1',now);
  const directory=path.join(ctx.jobRoot,'FAB-1');let job=await loadJob(directory);
  const approved=await readJson(path.join(directory,`approved/${job.state.review.approved_sha256}.json`));
  const metadataFile=await atomicJson(ctx.privateRoot,'bridge/celebration-y3q4/FAB-1.metadata.json',{readingId:'FAB-1',verseCommentary:approved.results[0].runtime});
  const manifestFile=await atomicJson(ctx.privateRoot,'private-manifest.json',{readings:{'FAB-1':{metadataFileId:'FABRICATED_POINTER'}}});
  const receiptFile=await atomicJson(ctx.privateRoot,'automation/staging/FAB-1/manager-publication-result.json',{schemaVersion:'mhc-manager-publication-result/v1',readingId:'FAB-1',status:'published_verified',metadataReadback:'exact_bytes',manifestReadback:'exact_bytes',liveReadingStatus:'ready',henryLayerStatus:'complete',metadataFileId:'FABRICATED_POINTER',payloadSha256:sha256(await readFile(metadataFile))});
  await reviewWorkOrderV2(ctx,now);job=await loadJob(directory);assert.equal(job.state.phase,'published');
  const files=[metadataFile,manifestFile,receiptFile],before=await Promise.all(files.map(f=>readFile(f)));
  await reopenReviewV2(ctx,'FAB-1',job.state.review.approved_sha256,'FABRICATED reviewer','FABRICATED newly discovered source omission',now);
  const after=await loadJob(directory);assert.equal(after.state.publication,null);assert.equal(after.state.phase,'review_pending');assert.deepEqual(await Promise.all(files.map(f=>readFile(f))),before);assert.deepEqual(after.state.history.at(-1).prior_publication,job.state.publication);
});
test('explicit current-day v1 migration preserves cooldown bytes and cannot reset an existing v2 job',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:2});
  const file=await atomicJson(ctx.privateRoot,'automation/mhc-backfill-attempt-state.json',{schemaVersion:'mhc-backfill-attempt-state/v1',planVersion:ctx.plan.planVersion,attempts:{'FAB-1':{attemptedAt:now.toISOString(),outcome:'model_failure',stage:'validation',code:'NATIVE_CANDIDATE_UNRESOLVED'}}});
  const bytes=await readFile(file),hash=sha256(bytes),reason='FABRICATED explicit user approval for current reading migration';
  await assert.rejects(migrateCurrentV2(ctx,'FAB-2',hash,reason,now),/CURRENT_PUBLISHED_ONLY/);
  await assert.rejects(migrateCurrentV2(ctx,'FAB-1','0'.repeat(64),reason,now),/ATTEMPT_CHANGED/);
  assert.equal((await migrateCurrentV2(ctx,'FAB-1',hash,reason,now)).action,'migration_queued');
  assert.deepEqual(await readFile(file),bytes);
  const r=await startV2(ctx,'spark',now);await writeCandidate(r,c=>({...c,packet_id:'MHP2-'+'0'.repeat(32)}));await advanceV2(ctx,'FAB-1',sessionId(r),now);
  assert.equal((await migrateCurrentV2(ctx,'FAB-1',hash,reason,now)).action,'migration_already_exists');
  const job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));assert.equal(job.state.total_submissions,1);assert.equal(job.state.history[0].legacy_attempt_sha256,hash);assert.deepEqual(await readFile(file),bytes);
});
test('migration refuses a controller/permission failure and another active author',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:2});
  const make=code=>atomicJson(ctx.privateRoot,'automation/mhc-backfill-attempt-state.json',{schemaVersion:'mhc-backfill-attempt-state/v1',planVersion:ctx.plan.planVersion,attempts:{'FAB-1':{attemptedAt:now.toISOString(),outcome:'model_failure',stage:'validation',code}}});
  const reason='FABRICATED explicit authorization for migration only';
  let file=await make('PERMISSION_DENIED');await assert.rejects(migrateCurrentV2(ctx,'FAB-1',sha256(await readFile(file)),reason,now),/LEGACY_FAILURE_REQUIRED/);
  file=await make('NATIVE_CANDIDATE_UNRESOLVED');assert.equal((await startV2(ctx,'spark',now)).readingId,'FAB-2');await assert.rejects(migrateCurrentV2(ctx,'FAB-1',sha256(await readFile(file)),reason,now),/AUTHOR_ACTIVE/);
});
test('v2 rejects hidden evidence and duplicate/missing verse records',()=>{const p=input(3).chapters[0].batches[0],c=candidate(p);c.records[0].sentences[0].evidence_ids=['fabricated:hidden'];assert.equal(validateCandidate(c,p).valid,false);const d=candidate(p);d.records[1]=d.records[0];assert.ok(validateCandidate(d,p).diagnostics.some(d=>d.code==='V2_VERSE_COVERAGE'));});
test('v2 required-evidence diagnostic identifies support rather than prescribing word insertion',()=>{const p=input(1).chapters[0].batches[0];p.evidence.push({...p.evidence[0],evidence_id:'fabricated:identity',text:'FABRICATED: Maribel is the caretaker.',text_sha256:sha256('FABRICATED: Maribel is the caretaker.')});p.requests[0].evidence_ids.push('fabricated:identity');p.requests[0].requirements=[{kind:'identity',terms:['Maribel'],evidence_ids:['fabricated:identity']}];const c=candidate(p);c.records[0].sentences[0].text='FABRICATED: Maribel carries helpful supplies for struggling families.';const result=validateCandidate(c,p);assert.equal(result.valid,false);assert.deepEqual(result.diagnostics.find(d=>d.code==='V2_REQUIRED_EVIDENCE').evidence_ids,['fabricated:identity']);});
test('v2 detects changed atom bytes before authoring',()=>{const u=unit(1,1,1);u.source_atoms[0].text+=' changed';assert.throws(()=>compileReading({entry:{readingId:'FAB-001',passages:[{bookId:'TST',chapter:1,verseCount:1}]},planVersion:'fab',scheduleDate:'2026-09-13',sourceManifest,chapters:[{bookId:'TST',chapter:1,units:[u]}]}),/V2_SOURCE_INTEGRITY/);});
test('v2 refuses oversized evidence rather than silently dropping context',()=>{const u=unit(1,1,1),text='FABRICATED long evidence. '.repeat(4200);u.source_atoms[0].text=text;u.source_atoms[0].text_sha256=sha256(text);assert.throws(()=>compileReading({entry:{readingId:'FAB-001',passages:[{bookId:'TST',chapter:1,verseCount:1}]},planVersion:'fab',scheduleDate:'2026-09-13',sourceManifest,chapters:[{bookId:'TST',chapter:1,units:[u]}]}),/V2_SOURCE_PACKET_TOO_LARGE/);});

test('real v2 modules drain multiple chapters, approve, finalize and require exact matching publication',async t=>{
  const {ctx,now}=await fixture(t,{chapterCount:3});const {report,count}=await drain(ctx,now);assert.equal(count,6);assert.equal(report.action,'review_handoff');assert.equal(report.published,false);
  const {bundle}=await buildReview(ctx,'FAB-1');assert.equal(bundle.results.length,3);assert.equal(bundle.sentences.length,36);
  const applied=await approve(ctx,'FAB-1',now);assert.equal(applied.state,'publishing');assert.equal(applied.published,false);
  const repeated=await applyReviewV2(ctx,'FAB-1',now);assert.equal(repeated.state,'publishing');
  const publicationOrder=await reviewWorkOrderV2(ctx,now);assert.equal(publicationOrder.action,'recover_publish');
  const metadataFile=path.join(ctx.privateRoot,'bridge/celebration-y3q4/FAB-1.metadata.json'),manifestFile=path.join(ctx.privateRoot,'private-manifest.json');
  const metadata=await readJson(metadataFile);metadata.verseCommentaries=bundle.results.map(r=>({...r.runtime,review_status:'approved'}));delete metadata.henrySourceLink;await writeFile(metadataFile,bytesFor(metadata));
  assert.equal((await reviewWorkOrderV2(ctx,now)).action,'recover_publish');
  const manifest=await readJson(manifestFile);manifest.readings['FAB-1'].metadataFileId='FABRICATED_METADATA_POINTER';await writeFile(manifestFile,bytesFor(manifest));
  const receipt={schemaVersion:'mhc-manager-publication-result/v1',readingId:'FAB-1',status:'published_verified',metadataReadback:'exact_bytes',manifestReadback:'exact_bytes',liveReadingStatus:'ready',henryLayerStatus:'complete',metadataFileId:'FABRICATED_METADATA_POINTER',payloadSha256:sha256(await readFile(metadataFile))};
  await atomicJson(ctx.privateRoot,'automation/staging/FAB-1/manager-publication-result.json',receipt);
  assert.equal((await reviewWorkOrderV2(ctx,now)).state,'no_review_work');assert.equal((await loadJob(path.join(ctx.jobRoot,'FAB-1'))).state.phase,'published');
});
test('same-wake restart keeps budget, preserves rejects, clears stale failure on success',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});let r=await startV2(ctx,'spark',now);const id=sessionId(r);await writeCandidate(r,c=>({...c,packet_id:'MHP2-'+'0'.repeat(32)}));r=await advanceV2(ctx,'FAB-1',id,now);assert.equal(r.action,'repair_candidate');let job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));assert.equal(job.state.total_submissions,1);
  r=await startV2(ctx,'spark',now);assert.equal(sessionId(r),id);r=await advanceV2(ctx,'FAB-1',id,now);assert.equal(r.action,'repair_candidate');job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));assert.equal(job.state.total_submissions,1);
  const diagnostics=r.validationPath;await writeCandidate(r);r=await advanceV2(ctx,'FAB-1',id,now);assert.equal(r.action,'review_handoff');assert.equal((await readJson(diagnostics)).valid,true);assert.equal((await readdir(path.join(job.directory,'attempts'))).length,2);
});
test('crash after durable reservation resumes exact saved bytes without another submission charge',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});const r=await startV2(ctx,'spark',now),p=await readJson(r.sourcePath),c=candidate(p),bytes=bytesFor(c),hash=sha256(bytes);let job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));await atomicJson(job.directory,`attempts/${hash}.json`,{bytes,value:c},{immutable:true});const state=structuredClone(job.state);state.pending_attempt={key:`${p.packet_id}:spark`,hash,packet_id:p.packet_id,lane:'spark'};state.total_submissions=1;state.session.submissions=1;state.sessions[state.session.id]=state.session;job=await appendState(job,'submission_reserved',state,now);
  await writeFile(r.candidatePath,'{}');const result=await startV2(ctx,'spark',now);assert.equal(result.action,'review_handoff');assert.equal((await loadJob(job.directory)).state.total_submissions,1);
});
test('two distinct rejections trigger recorded Luna fallback; Luna never invents missed-primary eligibility',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});assert.equal((await startV2(ctx,'luna',now)).state,'awaiting_primary');let r=await startV2(ctx,'spark',now);for(let n=0;n<2;n++){await writeCandidate(r,c=>({...c,packet_id:'MHP2-'+String(n).repeat(32)}));r=await advanceV2(ctx,'FAB-1',sessionId(r),now);}assert.equal(r.state,'fallback_pending');const result=await drain(ctx,new Date('2026-09-13T17:26:00Z'),{lane:'luna'});assert.equal(result.report.action,'review_handoff');const review=await buildReview(ctx,'FAB-1');assert.equal(review.bundle.results[0].runtime.worker_model,MODELS.luna);
});
test('Luna exhaustion gets one explicit editorial derivative, not replenished model retries',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});let r=await startV2(ctx,'spark',now);for(const lane of ['spark','luna']){if(lane==='luna')r=await startV2(ctx,lane,new Date('2026-09-13T17:26:00Z'));for(let n=0;n<2;n++){await writeCandidate(r,c=>({...c,packet_id:'MHP2-'+String(n).repeat(32)}));r=await advanceV2(ctx,'FAB-1',sessionId(r),now);}}
  assert.equal(r.state,'editorial_attention');const order=await reviewWorkOrderV2(ctx,now),basis=await readJson(order.packetPath);await writeFile(order.repairPath,bytesFor({schema_version:'mhc-evidence-editorial-repair/v2',input_sha256:basis.input_sha256,rejected_sha256:basis.rejected_sha256,status:'approved',reviewer:'FABRICATED editor',reviewed_at:now.toISOString(),findings:['FABRICATED exact evidence correction.'],candidate:candidate(basis.packet)}));
  const result=await editorialRepairV2(ctx,'FAB-1',now);assert.equal(result.action,'review_handoff');assert.equal((await loadJob(path.join(ctx.jobRoot,'FAB-1'))).state.total_submissions,4);await assert.rejects(editorialRepairV2(ctx,'FAB-1',now),/PHASE_INVALID/);
});
test('an older editorial repair queues remaining packets behind the active reading and resumes without resetting attempts',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:12,readingCount:2});let r=await startV2(ctx,'spark',now);
  for(const lane of ['spark','luna']){if(lane==='luna')r=await startV2(ctx,lane,new Date('2026-09-13T17:26:00Z'));for(let n=0;n<2;n++){await writeCandidate(r,c=>({...c,packet_id:'MHP2-'+String(n).repeat(32)}));r=await advanceV2(ctx,'FAB-1',sessionId(r),now);}}
  const later=new Date('2026-09-13T21:16:00Z'),active=await startV2(ctx,'spark',later);assert.equal(active.readingId,'FAB-2');
  const order=await reviewWorkOrderV2(ctx,later),basis=await readJson(order.packetPath);
  await writeFile(order.repairPath,bytesFor({schema_version:'mhc-evidence-editorial-repair/v2',input_sha256:basis.input_sha256,rejected_sha256:basis.rejected_sha256,status:'approved',reviewer:'FABRICATED editor',reviewed_at:later.toISOString(),findings:['FABRICATED supported correction while another reading is active.'],candidate:candidate(basis.packet)}));
  assert.equal((await editorialRepairV2(ctx,'FAB-1',later)).state,'queued');
  const queued=await loadJob(path.join(ctx.jobRoot,'FAB-1'));assert.equal(queued.state.total_submissions,4);
  assert.equal((await startV2(ctx,'spark',later)).readingId,'FAB-2');await drain(ctx,later);
  assert.equal((await startV2(ctx,'spark',later)).code,'V2_OTHER_MODEL_OWNS_CHAPTER');
  const resumed=await drain(ctx,later,{lane:'luna'});assert.equal(resumed.report.readingId,'FAB-1');assert.equal(resumed.report.action,'review_handoff');
  assert.equal((await loadJob(queued.directory)).state.total_submissions,5);
});
test('current review work precedes historical publication recovery without losing that recovery',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:2});
  await drain(ctx,now);await approve(ctx,'FAB-1',now);await drain(ctx,now);
  const order=await reviewWorkOrderV2(ctx,new Date('2026-09-14T15:16:00Z'));
  assert.equal(order.readingId,'FAB-2');assert.equal(order.action,'review');
  assert.equal((await loadJob(path.join(ctx.jobRoot,'FAB-1'))).state.phase,'publishing');
});
test('source changes and stale reviews cannot be rebound to approval',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});await drain(ctx,now);const order=await reviewWorkOrderV2(ctx,now);await writeFile(order.reviewPath,bytesFor({schema_version:'mhc-evidence-approval/v2',reading_id:'FAB-1',review_basis_sha256:'0'.repeat(64),status:'approved'}));await assert.rejects(applyReviewV2(ctx,'FAB-1',now),/APPROVAL_INVALID/);
  const sourceFile=path.join(ctx.mhcRoot,'normalized/TST/001.jsonl');const u=JSON.parse((await readFile(sourceFile,'utf8')).trim());u.source_atoms[0].text+=' changed';await writeFile(sourceFile,JSON.stringify(u)+'\n');await assert.rejects(buildReview(ctx,'FAB-1'),/SOURCE|INTEGRITY/);
});
test('event chain rejects mutation and missing history',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});await startV2(ctx,'spark',now);const dir=path.join(ctx.jobRoot,'FAB-1'),eventFile=path.join(dir,'events/000001.json'),event=await readJson(eventFile);event.state.total_submissions=500;await writeFile(eventFile,bytesFor(event));await assert.rejects(loadJob(dir),/EVENT_HASH_MISMATCH/);
});
test('pre-existing legacy cooldown blocks v2 reissue and forward debt blocks backlog',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});await atomicJson(ctx.privateRoot,'automation/mhc-backfill-attempt-state.json',{schemaVersion:'mhc-backfill-attempt-state/v1',planVersion:ctx.plan.planVersion,attempts:{'FAB-1':{attemptedAt:now.toISOString(),outcome:'model_failure',stage:'validation',code:'NATIVE_CANDIDATE_UNRESOLVED'}}});const result=await startV2(ctx,'spark',now);assert.equal(result.state,'no_eligible_reading');assert.equal(result.queue.coolingDownCount,1);assert.equal((await readdir(ctx.jobRoot)).length,0);
});

test('partial initial job and missing final handoff recover from the single event history',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});let r=await startV2(ctx,'spark',now);const directory=path.join(ctx.jobRoot,'FAB-1');
  // Simulate interruption after input commit but before the initial event.
  for(const n of await readdir(path.join(directory,'events')))await rm(path.join(directory,'events',n));
  r=await startV2(ctx,'spark',now);assert.equal(r.action,'author_candidate');await writeCandidate(r);await advanceV2(ctx,'FAB-1',sessionId(r),now);
  let job=await loadJob(directory);assert.equal(job.state.phase,'review_pending');const files=(await readdir(path.join(directory,'events'))).sort();const final=await readJson(path.join(directory,'events',files.at(-1)));assert.equal(final.kind,'generation_complete');await rm(path.join(directory,'events',files.at(-1)));
  r=await startV2(ctx,'spark',now);assert.equal(r.action,'review_handoff');job=await loadJob(directory);assert.equal(job.state.total_submissions,1);
});
test('reviewer can reject semantic evidence, record one correction, and invalidate the old approval basis',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});await drain(ctx,now);const initial=await reviewWorkOrderV2(ctx,now),bundle=await readJson(initial.bundlePath),packet=bundle.source_packets[0];
  await writeFile(initial.reviewPath,bytesFor({schema_version:'mhc-evidence-review-decision/v2',reading_id:'FAB-1',review_basis_sha256:bundle.review_basis_sha256,status:'changes_requested',packet_id:packet.packet_id,reviewer:'FABRICATED reviewer',reviewed_at:now.toISOString(),findings:['FABRICATED: preserve the specific kind of assistance.']}));
  await requestEditorialV2(ctx,'FAB-1',now);const order=await reviewWorkOrderV2(ctx,now),basis=await readJson(order.packetPath),corrected=candidate(packet);corrected.records[0].sentences[0].text='FABRICATED: the helpful caretaker delivers practical support to families during a trying period.';
  await writeFile(order.repairPath,bytesFor({schema_version:'mhc-evidence-editorial-repair/v2',input_sha256:basis.input_sha256,rejected_sha256:basis.rejected_sha256,status:'approved',reviewer:'FABRICATED editor',reviewed_at:now.toISOString(),findings:['FABRICATED direct comparison supports the correction.'],candidate:corrected}));
  await editorialRepairV2(ctx,'FAB-1',now);const updated=await buildReview(ctx,'FAB-1');assert.notEqual(updated.bundle.review_basis_sha256,bundle.review_basis_sha256);assert.equal(updated.job.state.total_submissions,1);assert.equal(updated.bundle.editorial_history.length,2);
  await assert.rejects(requestEditorialV2(ctx,'FAB-1',now),/BINDING/);await approve(ctx,'FAB-1',now);
});
test('forward cooldown debt prevents generation of historical backlog',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1,readingCount:2});ctx.appConfig.sharedStartDate='2026-09-12';await atomicJson(ctx.privateRoot,'automation/mhc-backfill-attempt-state.json',{schemaVersion:'mhc-backfill-attempt-state/v1',planVersion:ctx.plan.planVersion,attempts:{'FAB-2':{attemptedAt:now.toISOString(),outcome:'model_failure',stage:'validation',code:'NATIVE_CANDIDATE_UNRESOLVED'}}});const result=await startV2(ctx,'spark',now);assert.equal(result.state,'no_eligible_reading');assert.equal(result.queue.priorityTier,'forward');assert.equal(result.queue.historicalDebtCount,1);
});
test('expired session cannot author or replenish its budget until a later slot',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});const r=await startV2(ctx,'spark',now);await writeCandidate(r);const expired=new Date(now.getTime()+61*60*1000);assert.equal((await advanceV2(ctx,'FAB-1',sessionId(r),expired)).action,'checkpointed');assert.equal((await startV2(ctx,'spark',expired)).action,'checkpointed');const job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));assert.equal(job.state.total_submissions,0);assert.equal((await startV2(ctx,'spark',new Date('2026-09-13T21:16:00Z'))).action,'author_candidate');
});
test('tampered or wrong approved runtime cannot be completed by a locally valid publication receipt',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});await drain(ctx,now);await approve(ctx,'FAB-1',now);
  const {bundle}=await buildReview(ctx,'FAB-1'),metadataFile=path.join(ctx.privateRoot,'bridge/celebration-y3q4/FAB-1.metadata.json');
  const wrong={...bundle.results[0].runtime,review_status:'approved'};wrong.records['TST.1.1'].blurb='FABRICATED different content has been attached by mistake.';
  await writeFile(metadataFile,bytesFor({readingId:'FAB-1',verseCommentary:wrong}));await atomicJson(ctx.privateRoot,'private-manifest.json',{readings:{'FAB-1':{metadataFileId:'FABRICATED_POINTER'}}});await atomicJson(ctx.privateRoot,'automation/staging/FAB-1/manager-publication-result.json',{schemaVersion:'mhc-manager-publication-result/v1',readingId:'FAB-1',status:'published_verified',metadataReadback:'exact_bytes',manifestReadback:'exact_bytes',liveReadingStatus:'ready',henryLayerStatus:'complete',metadataFileId:'FABRICATED_POINTER',payloadSha256:sha256(await readFile(metadataFile))});
  assert.equal((await reviewWorkOrderV2(ctx,now)).action,'recover_publish');assert.equal((await loadJob(path.join(ctx.jobRoot,'FAB-1'))).state.phase,'publishing');
});
test('installed v2 launcher executes actual modules and cannot silently reinstall v1 over live v2 jobs',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});await cp(path.join(repo,'scripts'),path.join(ctx.releaseRoot,'scripts'),{recursive:true});
  for(const file of ['app/shared/server-core.js','app/frontend/app.js','config/pages-pwa-public.json']){await mkdir(path.dirname(path.join(ctx.releaseRoot,file)),{recursive:true});await cp(path.join(repo,file),path.join(ctx.releaseRoot,file));}
  await atomicJson(ctx.releaseRoot,'fixtures/pilot-content/app-config.json',{sharedStartDate:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit'}).format(new Date()),futureLookaheadDays:7});
  const run=(bin,args,options={})=>{const r=spawnSync(bin,args,{cwd:ctx.releaseRoot,encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024,...options});assert.equal(r.status,0,`${bin} failed: ${r.stderr}`);return r.stdout.trim();};
  run('git',['init','-q']);run('git',['add','scripts','schemas','prompts','fixtures','app','config']);run('git',['-c','user.name=FABRICATED Test','-c','user.email=fabricated@example.invalid','-c','core.hooksPath=.no-test-hooks','commit','-qm','FABRICATED runtime test only']);const revision=run('git',['rev-parse','HEAD']);
  const installer=path.join(ctx.releaseRoot,'scripts/install-mhc-native-runtime.mjs'),args=[installer,'--project-root',ctx.projectRoot,'--revision',revision,'--spark-automation-id','fabricated-spark','--luna-automation-id','fabricated-luna','--pipeline','v2'];
  const installed=JSON.parse(run(process.execPath,args));const invoke=(args)=>JSON.parse(run(process.execPath,[installed.launcher,...args],{cwd:os.tmpdir()}));
  const runtimePointer=await readJson(path.join(ctx.runtimeRoot,'current.json')),installedRelease=path.join(ctx.runtimeRoot,'releases',runtimePointer.release),requireInstalled=createRequire(path.join(installedRelease,'scripts/prepare-service-status.mjs'));
  assert.equal(typeof requireInstalled('../app/shared/server-core.js').preparationServiceStatus,'function');
  assert.equal(typeof requireInstalled('../app/frontend/app.js').evaluateContentReadiness,'function');
  const installedHealth=await import(pathToFileURL(path.join(installedRelease,'scripts/lib/live-horizon-health.mjs')).href);assert.equal(typeof installedHealth.verifyLiveHorizon,'function');
  assert.deepEqual(await readFile(path.join(installedRelease,'config/pages-pwa-public.json')),await readFile(path.join(repo,'config/pages-pwa-public.json')));
  const installedService=await import(pathToFileURL(path.join(installedRelease,'scripts/lib/mhc-v2-service.mjs')).href);assert.equal(installedService.historicalSelectionBindingVersion,'historical-selection/v1');assert.equal(typeof installedService.selectHistoricalAuthorWorkV2,'function');
  run(process.execPath,[path.join(installedRelease,'scripts/prepare-service-status.mjs'),'blocked','FABRICATED local closure test','FABRICATED staged only'],{cwd:ctx.projectRoot});
  assert.equal((await readJson(path.join(ctx.privateRoot,'automation/staging/service-status/manifest-candidate.json'))).preparationStatus.state,'blocked');
  // Actual installed selection, packet preparation, admission and review
  // discovery, from an arbitrary cwd. No model or real content is involved.
  let report=invoke(['spark']);
  assert.equal(report.action,'author_candidate');await writeCandidate(report);
  report=invoke(['advance','--reading','FAB-1','--session',sessionId(report)]);assert.equal(report.action,'review_handoff');assert.equal(report.published,false);
  const order=invoke(['reviewer','work-order']);assert.equal(order.action,'review');assert.equal(invoke(['status']).readings[0].state,'review_pending');
  const bundle=await readJson(order.bundlePath);await writeFile(order.reviewPath,bytesFor({schema_version:'mhc-evidence-approval/v2',reading_id:'FAB-1',review_basis_sha256:bundle.review_basis_sha256,status:'approved',reviewer:'FABRICATED independent reviewer',reviewed_at:new Date().toISOString(),findings:['FABRICATED source comparison.'],assertions:Object.fromEntries(REVIEW_ASSERTIONS.map(k=>[k,true])),corrections:[]}));
  const applied=invoke(['reviewer','apply','--reading','FAB-1']);assert.equal(applied.action,'publish_required');
  assert.equal(invoke(['reviewer','reopen','--reading','FAB-1','--approved-sha256',applied.approvedSha256,'--reviewer','FABRICATED independent reviewer','--reason','FABRICATED material source issue after approval']).action,'review_reopened');
  assert.notEqual((await readJson(invoke(['reviewer','work-order']).bundlePath)).review_basis_sha256,bundle.review_basis_sha256);
  const downgrade=spawnSync(process.execPath,[...args.slice(0,-1),'v1'],{cwd:ctx.releaseRoot,encoding:'utf8',windowsHide:true});assert.notEqual(downgrade.status,0);assert.match(downgrade.stderr,/V2 jobs exist/);
});

for (const [start,end] of [[1,8],[9,16],[25,33]]) test('ranged passage '+start+'-'+end+' completes generation, review and library finalization',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:33,chapterCount:2});
  ctx.plan.entries[0].passages[1]={bookId:'TST',chapter:2,verseStart:start,verseEnd:end,verseCount:end-start+1};
  const {report}=await drain(ctx,now);
  assert.equal(report.action,'review_handoff');
  const {bundle}=await buildReview(ctx,'FAB-1');
  const wanted=Array.from({length:end-start+1},(_,i)=>'TST.2.'+(start+i));
  assert.deepEqual(Object.keys(bundle.results[1].runtime.records),wanted);
  assert.equal(bundle.results[0].verse_count,33);
  assert.equal((await approve(ctx,'FAB-1',now)).action,'publish_required');
  const pointer=await readJson(path.join(ctx.mhcRoot,'stores/library/current.json'));
  const catalog=await readJson(path.join(ctx.mhcRoot,'stores/library',pointer.catalog_file));
  const portable=await readJson(path.join(ctx.mhcRoot,'stores/library',catalog.readings[0].file));
  assert.deepEqual(Object.keys(portable.chapters[1].runtime.records),wanted);
  assert.equal(portable.chapters[1].verse_count,wanted.length);
});
test('passage scope accepts a range inside a full source chapter but rejects malformed or out-of-bounds ranges',()=>{
  assert.deepEqual(passageScope({verseStart:9,verseEnd:16,verseCount:8},33),{start:9,end:16,ranged:true});
  for (const passage of [{verseCount:8},{verseStart:1,verseEnd:34,verseCount:34}])
    assert.throws(()=>passageScope(passage,33),/V2_SOURCE_VERSE_COUNT/);
  for (const passage of [{verseStart:9,verseEnd:16,verseCount:7},{verseStart:0,verseEnd:7,verseCount:8},{verseEnd:8,verseCount:8},{verseStart:8,verseEnd:1,verseCount:8}])
    assert.throws(()=>passageScope(passage,33),/V2_PASSAGE_RANGE_INVALID/);
});

async function historicalFixture(t) {
  const {ctx,now:initial}=await fixture(t,{verseCount:1,readingCount:10}),now=new Date(initial.getTime()+86400000);
  for(const entry of ctx.plan.entries.slice(1))await atomicJson(ctx.privateRoot,`bridge/celebration-y3q4/${entry.readingId}.metadata.json`,{readingId:entry.readingId});
  const health={status:'ready',effectiveDate:'2026-09-14',target:8,readingIds:ctx.plan.entries.slice(1,9).map(e=>e.readingId),
    missingPreparedReadingIds:[],missingPayloadReadingIds:[],componentFailures:[],currentHorizonHenryLayer:{status:'complete',fallbackReadingIds:[],unavailableReadingIds:[]}};
  return {ctx,now,health,verify:async()=>structuredClone(health)};
}
test('historical native discovery selects original manifest target without mutation and exact one-reading author preserves provenance',async t=>{
  const {ctx,now,verify}=await historicalFixture(t),before=await jobBytes(ctx.jobRoot);let checks=0;
  assert.equal(historicalSelectionBindingVersion,'historical-selection/v1');
  const selected=await selectHistoricalAuthorWorkV2(ctx,{},now,{health:async(...args)=>{checks++;return verify(...args);}});
  assert.equal(selected.readingId,'FAB-1');assert.equal(selected.authorLane,'spark');assert.deepEqual(await jobBytes(ctx.jobRoot),before);
  assert.equal((await selectAuthorWorkV2(ctx,{requestedReadingId:'FAB-1'},now)).reason,'outside_forward_window');
  const model=fabricatedModelRun();let probes=0;
  const run=(...args)=>{if(args[2].input?.startsWith('Availability preflight')){probes++;assert.deepEqual(readdirSync(ctx.jobRoot),[]);}return model.run(...args);};
  const work=await runAuthorSession(ctx,{lane:selected.authorLane,codexExecutable:process.execPath,maxReadings:1,requestedReadingId:selected.readingId,requestedHistoricalAuthorization:selected.historicalAuthorization},{run,clock:()=>now});
  assert.equal(probes,2);assert.equal(checks,2);assert.equal(model.calls,1);assert.equal(work.action,'review_handoff');assert.deepEqual(await readdir(ctx.jobRoot),['FAB-1']);
  const job=await loadJob(path.join(ctx.jobRoot,'FAB-1')),proof=job.state.history.find(h=>h.kind==='historical_authorization_admitted');
  assert.match(proof.health_sha256,/^[a-f0-9]{64}$/);assert.equal(proof.checked_at,now.toISOString());assert.equal(job.state.total_submissions,1);
});
for(const mode of ['devotional_gap','henry_fallback','missing_measurement','wrong_date','wrong_scope','short_horizon'])test(`historical discovery rejects ${mode} with no job writes`,async t=>{
  const {ctx,now,health}=await historicalFixture(t),before=await jobBytes(ctx.jobRoot);
  if(mode==='devotional_gap')health.missingPreparedReadingIds=['FAB-2'];
  if(mode==='henry_fallback'){health.currentHorizonHenryLayer.status='debt';health.currentHorizonHenryLayer.fallbackReadingIds=['FAB-2'];}
  if(mode==='missing_measurement')delete health.currentHorizonHenryLayer;
  if(mode==='wrong_date')health.effectiveDate='2026-09-13';
  if(mode==='wrong_scope')health.readingIds.reverse();
  if(mode==='short_horizon'){health.readingIds.pop();health.target=7;}
  await assert.rejects(selectHistoricalAuthorWorkV2(ctx,{},now,{health:async()=>health}),/V2_HISTORICAL_FORWARD_INCOMPLETE|SUPERVISOR_HEALTH_SCOPE_INVALID/);
  assert.deepEqual(await jobBytes(ctx.jobRoot),before);
});
for(const mode of ['copied','forged','stale','future','owner','reading','root','config','plan','runtime'])test(`historical dispatch rejects ${mode} reference before counters or job writes`,async t=>{
  const {ctx,now,verify}=await historicalFixture(t),selected=await selectHistoricalAuthorWorkV2(ctx,{},now,{health:verify}),before=await jobBytes(ctx.jobRoot);
  let reference=selected.historicalAuthorization,time=now,target='FAB-1',lane='spark',context=ctx;
  if(mode==='copied')reference=structuredClone(reference);
  if(mode==='forged')reference={schemaVersion:historicalSelectionBindingVersion,readingId:target,authorLane:lane,issuedAt:now.toISOString(),forwardComplete:true};
  if(mode==='stale')time=new Date(now.getTime()+300001);
  if(mode==='future')time=new Date(now.getTime()-1);
  if(mode==='owner')lane='luna';
  if(mode==='reading')target='FAB-2';
  if(mode==='root')context={...ctx,projectRoot:path.join(ctx.projectRoot,'other')};
  if(mode==='config')context={...ctx,config:{...ctx.config,source_revision:'a'.repeat(40)}};
  if(mode==='plan')context={...ctx,plan:{...ctx.plan,planVersion:'FABRICATED-changed'}};
  if(mode==='runtime')context={...ctx,manifestSha256:'b'.repeat(64)};
  await assert.rejects(startV2(context,lane,time,{requestedReadingId:target,requestedHistoricalAuthorization:reference}),/V2_HISTORICAL_REFERENCE_INVALID/);
  assert.deepEqual(await jobBytes(ctx.jobRoot),before);
});
test('historical dispatch repeats actual health after preflight and rejects deterioration without claiming',async t=>{
  const {ctx,now,health}=await historicalFixture(t);let checks=0;
  const verify=async()=>{checks++;const result=structuredClone(health);if(checks>1){result.currentHorizonHenryLayer.status='debt';result.currentHorizonHenryLayer.fallbackReadingIds=['FAB-2'];}return result;};
  const selected=await selectHistoricalAuthorWorkV2(ctx,{},now,{health:verify}),before=await jobBytes(ctx.jobRoot),model=fabricatedModelRun();
  await assert.rejects(runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath,maxReadings:1,requestedReadingId:'FAB-1',requestedHistoricalAuthorization:selected.historicalAuthorization},{run:model.run,clock:()=>now}),/V2_HISTORICAL_FORWARD_INCOMPLETE/);
  assert.equal(checks,2);assert.equal(model.calls,0);assert.deepEqual(await jobBytes(ctx.jobRoot),before);
});
test('historical native selector honors original cooldown and forward fallback priority',async t=>{
  const {ctx,now,verify}=await historicalFixture(t);
  await atomicJson(ctx.privateRoot,'automation/mhc-backfill-attempt-state.json',{schemaVersion:'mhc-backfill-attempt-state/v1',planVersion:ctx.plan.planVersion,attempts:{'FAB-1':{attemptedAt:now.toISOString(),outcome:'model_failure',stage:'generate',code:'FABRICATED_FAILURE'}}});
  const before=await jobBytes(ctx.jobRoot),cooling=await selectHistoricalAuthorWorkV2(ctx,{requestedReadingId:'FAB-1'},now,{health:verify});
  assert.equal(cooling.action,'none');assert.equal(cooling.readingId,null);assert.deepEqual(await jobBytes(ctx.jobRoot),before);
  await atomicJson(ctx.privateRoot,'automation/mhc-backfill-attempt-state.json',{schemaVersion:'mhc-backfill-attempt-state/v1',planVersion:ctx.plan.planVersion,attempts:{}});
  const forward=await readJson(path.join(ctx.privateRoot,'bridge/celebration-y3q4/FAB-1.metadata.json'));forward.readingId='FAB-2';await atomicJson(ctx.privateRoot,'bridge/celebration-y3q4/FAB-2.metadata.json',forward);
  const selected=await selectHistoricalAuthorWorkV2(ctx,{requestedReadingId:'FAB-1'},now,{health:verify});assert.equal(selected.readingId,'FAB-2');assert.equal(selected.reason,'native_selection_differs');assert.deepEqual(await jobBytes(ctx.jobRoot),before);
});
test('historical dispatch rechecks original current selection without mutation after a new queue appears',async t=>{
  const {ctx,now,verify}=await historicalFixture(t),selected=await selectHistoricalAuthorWorkV2(ctx,{},now,{health:verify});
  const source=await sourceInput(ctx,ctx.plan.entries[1]);await createJob(ctx.jobRoot,source.input,now);const before=await jobBytes(ctx.jobRoot);
  const work=await startV2(ctx,'spark',now,{requestedReadingId:'FAB-1',requestedHistoricalAuthorization:selected.historicalAuthorization});
  assert.equal(work.readingId,'FAB-2');assert.equal(work.reason,'native_selection_differs');assert.deepEqual(await jobBytes(ctx.jobRoot),before);
});
test('historical actual fallback selection retains native attempts and sessions and rejects wrong owner without ownership wakes',async t=>{
  const {ctx,now,verify}=await historicalFixture(t);let work=await startV2(ctx,'spark',now,{}, {health:verify});
  for(let i=0;i<2;i++){await writeCandidate(work,c=>({...c,packet_id:'MHP2-'+String(i).repeat(32)}));work=await advanceV2(ctx,'FAB-1',sessionId(work),now);}
  const prior=await loadJob(path.join(ctx.jobRoot,'FAB-1')),before=await jobBytes(ctx.jobRoot);
  assert.equal((await selectHistoricalAuthorWorkV2(ctx,{requestedReadingId:'FAB-1',lane:'spark'},now,{health:verify})).reason,'chapter_owner_differs');assert.deepEqual(await jobBytes(ctx.jobRoot),before);
  const selected=await selectHistoricalAuthorWorkV2(ctx,{},now,{health:verify});assert.equal(selected.authorLane,'luna');
  work=await startV2(ctx,'luna',now,{requestedReadingId:'FAB-1',requestedHistoricalAuthorization:selected.historicalAuthorization});assert.equal(work.totalSubmissions,2);assert.equal(work.action,'author_candidate');
  const after=await loadJob(prior.directory);assert.deepEqual(after.state.rejected,prior.state.rejected);for(const [id,session] of Object.entries(prior.state.sessions))assert.deepEqual(after.state.sessions[id],session);
});

async function defaultPriorityFixture(t) {
  const historicalCount=32,{ctx,now:initial}=await fixture(t,{verseCount:1,readingCount:historicalCount+8}),
    now=new Date(initial.getTime()+historicalCount*86400000),forward=ctx.plan.entries.slice(historicalCount),
    historical=ctx.plan.entries.slice(0,historicalCount);
  for(const entry of forward)await atomicJson(ctx.privateRoot,`bridge/celebration-y3q4/${entry.readingId}.metadata.json`,{readingId:entry.readingId});
  const ready={status:'ready',effectiveDate:now.toISOString().slice(0,10),target:8,readingIds:forward.map(e=>e.readingId),
    missingPreparedReadingIds:[],missingPayloadReadingIds:[],componentFailures:[],currentHorizonHenryLayer:{status:'complete',fallbackReadingIds:[],unavailableReadingIds:[]}},
    incomplete={...structuredClone(ready),status:'not_ready',missingPreparedReadingIds:forward.slice(3).map(e=>e.readingId),
      missingPayloadReadingIds:forward.slice(3).map(e=>e.readingId),currentHorizonHenryLayer:{status:'unavailable',fallbackReadingIds:[],unavailableReadingIds:forward.slice(3).map(e=>e.readingId)}};
  const prepare=async full=>atomicJson(ctx.privateRoot,'private-manifest.json',{readings:Object.fromEntries(
    [...historical,...forward.slice(0,full?8:3)].map(e=>[e.readingId,{}]))});
  await prepare(false);return {ctx,now,forward,historical,ready,incomplete,prepare};
}
for(const lane of ['spark','luna'])test(`default ${lane} cannot claim 32 historical candidates behind five missing daily readings`,async t=>{
  const f=await defaultPriorityFixture(t);
  if(lane==='luna') {
    await f.prepare(true);let work=await startV2(f.ctx,'spark',f.now,{}, {health:async()=>f.ready});
    for(let i=0;i<2;i++){await writeCandidate(work,c=>({...c,packet_id:'MHP2-'+String(i).repeat(32)}));work=await advanceV2(f.ctx,work.readingId,sessionId(work),f.now);}
    assert.equal(work.state,'fallback_pending');await f.prepare(false);
  }
  const before=await jobBytes(f.ctx.jobRoot),ledger=Buffer.from(bytesFor({schemaVersion:'mhc-backfill-attempt-state/v1',planVersion:f.ctx.plan.planVersion,attempts:{}}));
  await writeFile(path.join(f.ctx.privateRoot,'automation/mhc-backfill-attempt-state.json'),ledger);
  const model=fabricatedModelRun(),result=await runAuthorSession(f.ctx,{lane,codexExecutable:process.execPath},
    {run:model.run,clock:()=>f.now,historicalHealth:async()=>structuredClone(f.incomplete)});
  assert.equal(result.action,'none');assert.equal(result.state,'forward_preparation_pending');assert.equal(result.code,null);
  assert.equal(result.buffer.completeConsecutiveReadings,3);assert.equal(result.buffer.devotionalGaps.length,5);assert.equal(model.calls,0);
  assert.deepEqual(await jobBytes(f.ctx.jobRoot),before);assert.deepEqual(await readFile(path.join(f.ctx.privateRoot,'automation/mhc-backfill-attempt-state.json')),ledger);
});
test('incomplete default buffer preserves historical expiry and model-rebind heads while forward maintenance remains allowed',async t=>{
  const f=await defaultPriorityFixture(t),past=await sourceInput(f.ctx,f.historical[0]);
  let historicalJob=await createJob(f.ctx.jobRoot,past.input,new Date(f.now.getTime()-25*60*60*1000),{spark:'gpt-5.3-codex-spark',luna:'gpt-5.6-luna'});
  await appendState(historicalJob,'FABRICATED retained queue',{...historicalJob.state,phase:'queued'},f.now);
  const historicalBefore=await jobBytes(path.join(f.ctx.jobRoot,f.historical[0].readingId));
  const next=await sourceInput(f.ctx,f.forward[0]),forwardJob=await createJob(f.ctx.jobRoot,next.input,f.now,{spark:'gpt-5.3-codex-spark',luna:'gpt-5.6-luna'});
  await appendState(forwardJob,'FABRICATED forward queue',{...forwardJob.state,phase:'queued'},f.now);
  const result=await startV2(f.ctx,'spark',f.now,{}, {health:async()=>f.incomplete});assert.equal(result.readingId,f.forward[0].readingId);
  const current=await loadJob(path.join(f.ctx.jobRoot,result.readingId));assert.equal(current.state.models.spark,'gpt-6-luna');
  assert.ok(current.state.history.some(h=>h.kind==='author_configuration_rebound'));assert.deepEqual(await jobBytes(path.join(f.ctx.jobRoot,f.historical[0].readingId)),historicalBefore);
});
test('incomplete default buffer preserves a historical active writer without another ownership wake or forward writer',async t=>{
  const f=await defaultPriorityFixture(t);await f.prepare(true);
  await startV2(f.ctx,'spark',f.now,{}, {health:async()=>f.ready});await f.prepare(false);
  const before=await jobBytes(f.ctx.jobRoot);
  const result=await startV2(f.ctx,'luna',f.now,{}, {health:async()=>f.incomplete});
  assert.equal(result.action,'none');assert.equal(result.state,'forward_preparation_pending');assert.deepEqual(await jobBytes(f.ctx.jobRoot),before);
});
test('default historical admission rechecks authenticated scope immediately before mutation and accepts only all eight complete',async t=>{
  const f=await defaultPriorityFixture(t);await f.prepare(true);const before=await jobBytes(f.ctx.jobRoot);let checks=0;
  const denied=await startV2(f.ctx,'spark',f.now,{}, {health:async()=>++checks===1?f.ready:f.incomplete});
  assert.equal(checks,2);assert.equal(denied.state,'forward_preparation_pending');assert.deepEqual(await jobBytes(f.ctx.jobRoot),before);
  const ledger={schemaVersion:'mhc-backfill-attempt-state/v1',planVersion:f.ctx.plan.planVersion,attempts:{[f.historical[0].readingId]:{
    attemptedAt:f.now.toISOString(),outcome:'model_failure',stage:'generate',code:'FABRICATED_FAILURE'}}};
  await atomicJson(f.ctx.privateRoot,'automation/mhc-backfill-attempt-state.json',ledger);checks=0;
  const model=fabricatedModelRun(),result=await runAuthorSession(f.ctx,{lane:'spark',codexExecutable:process.execPath},
    {run:model.run,clock:()=>f.now,historicalHealth:async()=>{checks++;return structuredClone(f.ready);}});
  assert.equal(checks,2);assert.equal(result.readingId,f.historical[1].readingId);assert.equal(result.action,'review_handoff');assert.equal(model.calls,1);
  assert.equal(result.readings.length,1);const job=await loadJob(path.join(f.ctx.jobRoot,result.readingId));
  assert.equal(job.state.total_submissions,1);assert.equal(job.state.session.submissions,1);
  assert.equal(Date.parse(job.state.session.deadline_at)-Date.parse(job.state.session.started_at),60*60*1000);
  const proof=job.state.history.find(h=>h.kind==='default_historical_authorization_admitted');assert.match(proof.health_sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(await readJson(path.join(f.ctx.privateRoot,'automation/mhc-backfill-attempt-state.json')),ledger);
});
test('eight complete permits original default fallback transfer without replenishing primary submissions or sessions',async t=>{
  const f=await defaultPriorityFixture(t);await f.prepare(true);let work=await startV2(f.ctx,'spark',f.now,{}, {health:async()=>f.ready});
  for(let i=0;i<2;i++){await writeCandidate(work,c=>({...c,packet_id:'MHP2-'+String(i).repeat(32)}));work=await advanceV2(f.ctx,work.readingId,sessionId(work),f.now);}
  const before=await loadJob(path.join(f.ctx.jobRoot,work.readingId)),model=fabricatedModelRun(x=>x,{model:MODELS.luna});let checks=0;
  const result=await runAuthorSession(f.ctx,{lane:'luna',codexExecutable:process.execPath},
    {run:model.run,clock:()=>f.now,historicalHealth:async()=>{checks++;return f.ready;}});
  assert.equal(checks,2);assert.equal(result.readingId,before.input.reading_id);assert.equal(result.action,'review_handoff');assert.equal(model.calls,1);
  const after=await loadJob(before.directory);assert.deepEqual(after.state.rejected,before.state.rejected);assert.equal(after.state.total_submissions,3);
  for(const [id,session]of Object.entries(before.state.sessions))assert.deepEqual(after.state.sessions[id],session);
  assert.equal(after.state.owners['TST.1'],'luna');
});

async function publishPriorityForward(f,count) {
  await f.prepare(count===8);
  for(const entry of f.forward.slice(0,count)) {
    const metadataPath=`bridge/celebration-y3q4/${entry.readingId}.metadata.json`,
      fallback=await readJson(path.join(f.ctx.privateRoot,`bridge/celebration-y3q4/${f.historical[0].readingId}.metadata.json`));
    await atomicJson(f.ctx.privateRoot,metadataPath,{...fallback,readingId:entry.readingId});
    let work=await startV2(f.ctx,'spark',f.now,{requestedReadingId:entry.readingId});
    assert.equal(work.readingId,entry.readingId);await writeCandidate(work);
    work=await advanceV2(f.ctx,entry.readingId,sessionId(work),f.now);assert.equal(work.action,'review_handoff');
    await approve(f.ctx,entry.readingId,f.now);
    const job=await loadJob(path.join(f.ctx.jobRoot,entry.readingId)),
      approved=await readJson(path.join(job.directory,`approved/${job.state.review.approved_sha256}.json`)),
      metadataFile=await atomicJson(f.ctx.privateRoot,metadataPath,{readingId:entry.readingId,verseCommentaries:approved.results.map(r=>r.runtime)}),
      manifest=await readJson(path.join(f.ctx.privateRoot,'private-manifest.json')),pointer=`FABRICATED_POINTER_${entry.readingId}`;
    manifest.readings[entry.readingId].metadataFileId=pointer;await atomicJson(f.ctx.privateRoot,'private-manifest.json',manifest);
    await atomicJson(f.ctx.privateRoot,`automation/staging/${entry.readingId}/manager-publication-result.json`,{
      schemaVersion:'mhc-manager-publication-result/v1',readingId:entry.readingId,status:'published_verified',
      metadataReadback:'exact_bytes',manifestReadback:'exact_bytes',liveReadingStatus:'ready',henryLayerStatus:'complete',
      metadataFileId:pointer,payloadSha256:sha256(await readFile(metadataFile))});
    assert.equal((await reviewWorkOrderV2(f.ctx,f.now)).state,'no_review_work');
    assert.equal((await loadJob(job.directory)).state.phase,'published');
  }
}
async function priorityCooldown(f) {
  const file=await atomicJson(f.ctx.privateRoot,'automation/mhc-backfill-attempt-state.json',{
    schemaVersion:'mhc-backfill-attempt-state/v1',planVersion:f.ctx.plan.planVersion,attempts:{[f.historical[0].readingId]:{
      attemptedAt:f.now.toISOString(),outcome:'model_failure',stage:'generate',code:'FABRICATED_FAILURE'}}});
  return {file,bytes:await readFile(file)};
}
for(const lane of ['spark','luna'])test(`verified published forward jobs clear ${lane} queue debt but three of eight still cannot claim historical work`,async t=>{
  const f=await defaultPriorityFixture(t);await publishPriorityForward(f,3);const ledger=await priorityCooldown(f),before=await jobBytes(f.ctx.jobRoot);
  const model=fabricatedModelRun(x=>x,{model:MODELS[lane]});let checks=0;
  const result=await runAuthorSession(f.ctx,{lane,codexExecutable:process.execPath},
    {run:model.run,clock:()=>f.now,historicalHealth:async()=>{checks++;return f.incomplete;}});
  assert.equal(result.action,'none');assert.equal(result.state,'forward_preparation_pending');assert.equal(result.code,null);
  assert.equal(checks,1);assert.equal(model.calls,0);assert.equal(result.buffer.completeConsecutiveReadings,3);
  assert.equal(result.queue.forwardDebtCount,0);assert.equal(result.queue.awaitingReviewCount,0);assert.equal(result.queue.historicalDebtCount,32);
  assert.deepEqual(await jobBytes(f.ctx.jobRoot),before);assert.deepEqual(await readFile(ledger.file),ledger.bytes);
});
test('eight verified published forward jobs admit the original historical selector without changing retained heads or cooldowns',async t=>{
  const f=await defaultPriorityFixture(t);await publishPriorityForward(f,8);const ledger=await priorityCooldown(f),before=await jobBytes(f.ctx.jobRoot);
  const selected=await selectHistoricalAuthorWorkV2(f.ctx,{},f.now,{health:async()=>f.ready});
  assert.equal(selected.action,'selected');assert.equal(selected.readingId,f.historical[1].readingId);assert.equal(selected.authorLane,'spark');
  assert.deepEqual(await jobBytes(f.ctx.jobRoot),before);
  const retained=await Promise.all(f.forward.map(e=>jobBytes(path.join(f.ctx.jobRoot,e.readingId))));let checks=0;
  const work=await startV2(f.ctx,'spark',f.now,{}, {health:async()=>{checks++;return f.ready;}});
  assert.equal(checks,2);assert.equal(work.action,'author_candidate');assert.equal(work.readingId,selected.readingId);
  assert.equal(work.totalSubmissions,0);assert.equal(work.submissionsRemaining,2);
  assert.deepEqual(await Promise.all(f.forward.map(e=>jobBytes(path.join(f.ctx.jobRoot,e.readingId)))),retained);
  assert.deepEqual(await readFile(ledger.file),ledger.bytes);
});
for(const mode of ['stale_receipt','changed_runtime','reopened_review','unresolved_publication','changed_approval','missing_approval'])test(`published queue retains ${mode} as pending without claims or historical budget changes`,async t=>{
  const f=await defaultPriorityFixture(t);await publishPriorityForward(f,8);
  const id=f.forward[0].readingId,job=await loadJob(path.join(f.ctx.jobRoot,id)),
    metadataPath=`bridge/celebration-y3q4/${id}.metadata.json`,receiptPath=`automation/staging/${id}/manager-publication-result.json`,
    approvedPath=path.join(job.directory,`approved/${job.state.review.approved_sha256}.json`);
  if(mode==='stale_receipt'){const receipt=await readJson(path.join(f.ctx.privateRoot,receiptPath));receipt.payloadSha256='0'.repeat(64);await atomicJson(f.ctx.privateRoot,receiptPath,receipt);}
  if(mode==='changed_runtime') {
    const metadata=await readJson(path.join(f.ctx.privateRoot,metadataPath));metadata.verseCommentaries[0].worker_model=MODELS.luna;
    const file=await atomicJson(f.ctx.privateRoot,metadataPath,metadata),receipt=await readJson(path.join(f.ctx.privateRoot,receiptPath));
    receipt.payloadSha256=sha256(await readFile(file));await atomicJson(f.ctx.privateRoot,receiptPath,receipt);
  }
  if(mode==='reopened_review')await reopenReviewV2(f.ctx,id,job.state.review.approved_sha256,'FABRICATED reviewer','FABRICATED newly discovered source omission',f.now);
  if(mode==='unresolved_publication')await appendState(job,'FABRICATED unresolved publication',{...job.state,phase:'publishing',publication:null},f.now);
  if(mode==='changed_approval'){const approved=await readJson(approvedPath);approved.results[0].runtime.worker_model=MODELS.luna;await writeFile(approvedPath,bytesFor(approved));}
  if(mode==='missing_approval')await rm(approvedPath);
  const ledger=await priorityCooldown(f),before=await jobBytes(f.ctx.jobRoot);let checks=0;
  const verify=async()=>{checks++;return f.ready;},work=await startV2(f.ctx,'spark',f.now,{}, {health:verify});
  assert.equal(work.action,'none');assert.equal(work.state,'no_eligible_reading');assert.equal(checks,0);
  assert.equal(work.queue.forwardDebtCount,1);assert.equal(work.queue.awaitingReviewCount,1);assert.equal(work.queue.selectableCount,0);
  const historical=await selectHistoricalAuthorWorkV2(f.ctx,{},f.now,{health:verify});
  assert.equal(checks,1);assert.equal(historical.action,'none');assert.equal(historical.readingId,null);
  assert.deepEqual(await jobBytes(f.ctx.jobRoot),before);assert.deepEqual(await readFile(ledger.file),ledger.bytes);
});
test('historical reference cannot combine with daily admission or a multi-reading author run',async t=>{
  const {ctx,now,verify}=await historicalFixture(t),selected=await selectHistoricalAuthorWorkV2(ctx,{},now,{health:verify}),before=await jobBytes(ctx.jobRoot);
  for(const options of [{maxReadings:2},{maxReadings:1,requestedDailyWorkOrder:{}},{maxReadings:1,requestedReadingId:undefined}])await assert.rejects(runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath,requestedReadingId:'FAB-1',requestedHistoricalAuthorization:selected.historicalAuthorization,...options},{run:()=>assert.fail('no probe'),clock:()=>now}),/V2_AUTHOR_.*CAP_INVALID/);
  assert.deepEqual(await jobBytes(ctx.jobRoot),before);
});
for(const mode of ['unpublished','owner_changed','expired_lease','transport_failure'])test(`historical retained guard rejects ${mode} without job or counter mutation`,async t=>{
  const {ctx,now,verify}=await historicalFixture(t);
  const selected=await selectHistoricalAuthorWorkV2(ctx,{},now,{health:verify});
  if(mode==='unpublished'){const manifest=await readJson(path.join(ctx.privateRoot,'private-manifest.json'));delete manifest.readings['FAB-1'];await atomicJson(ctx.privateRoot,'private-manifest.json',manifest);}
  if(mode==='owner_changed'||mode==='expired_lease'){
    const source=await sourceInput(ctx,ctx.plan.entries[0]);let job=await createJob(ctx.jobRoot,source.input,now);
    await appendState(job,'FABRICATED retained guard fixture',{...job.state,...(mode==='owner_changed'?{owners:{'TST.1':'luna'}}:{lease:{id:'FABRICATED expired lease',expires_at:new Date(now.getTime()-1).toISOString()}})},now);
  }
  const before=await jobBytes(ctx.jobRoot);
  if(mode==='transport_failure')await assert.rejects(selectHistoricalAuthorWorkV2(ctx,{},now,{health:async()=>{throw Error('FABRICATED health transport unavailable');}}),/FABRICATED health transport/);
  else {const result=await startV2(ctx,'spark',now,{requestedReadingId:'FAB-1',requestedHistoricalAuthorization:selected.historicalAuthorization});assert.equal(result.action,'none');}
  assert.deepEqual(await jobBytes(ctx.jobRoot),before);
});
