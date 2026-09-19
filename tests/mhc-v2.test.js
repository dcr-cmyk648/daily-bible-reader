import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,cp,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {VERSION,MODELS,REVIEW_ASSERTIONS,compileReading,validateCandidate,digestObject} from '../scripts/lib/mhc-v2.mjs';
import {sha256,normalizedBatchHash} from '../scripts/lib/mhc-pipeline.mjs';
import {serviceContext,startV2,advanceV2,buildReview,reviewWorkOrderV2,applyReviewV2,editorialRepairV2,requestEditorialV2,migrateCurrentV2,reopenReviewV2} from '../scripts/lib/mhc-v2-service.mjs';
import {atomicJson,appendState,loadJob,readJson,bytesFor,createJob} from '../scripts/lib/mhc-v2-store.mjs';
import {writeFileSync} from 'node:fs';
import {runAuthorSession,transportSchema,authorArguments,successfulModelResult,verifyPublicPacket,publicRepairDiagnostics} from '../scripts/lib/mhc-v2-author-session.mjs';
import {recoverUnstartedTransport} from '../scripts/lib/mhc-v2-transport-recovery.mjs';
import {sparkModelUnavailable} from '../scripts/lib/mhc-v2-model-errors.mjs';
import {recoverClientUpgrade} from '../scripts/lib/mhc-v2-client-upgrade.mjs';

const unavailableSparkEvents = () => JSON.stringify({type:'turn.failed',error:{message:JSON.stringify({type:'error',status:400,error:{type:'invalid_request_error',message:"The 'gpt-5.3-codex-spark' model is not supported when using Codex with a ChatGPT account."}})}})+'\n';

test('explicit client upgrade recovers only a retained exact refusal with a newer bound binary and unchanged budgets',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1}),model=fabricatedModelRun();
  const events=unavailableSparkEvents().replace('is not supported when using Codex with a ChatGPT account.','requires a newer version of Codex. Please upgrade to the latest app or CLI and try again.');
  const options={lane:'spark',codexExecutable:process.execPath};
  const failed=await runAuthorSession(ctx,options,{clock:()=>now,run:(bin,args,opts)=>args[0]==='exec'?{status:1,stdout:events}:model.run(bin,args,opts)});
  assert.equal(failed.code,'V2_TRANSPORT_FAILED');
  const root=path.join(ctx.jobRoot,'FAB-1'),before=await loadJob(root),key=(await readdir(path.join(root,'model-executions')))[0];
  const recordPath=path.join(root,'model-executions',key,'result.json'),recordBytes=await readFile(recordPath);
  const old=path.join(ctx.projectRoot,'FABRICATED-old-cli.exe');await writeFile(old,'FABRICATED OLD CLI');
  const version=file=>({status:0,stdout:file===old?'codex-cli 0.141.0':'codex-cli 0.153.4'});
  await assert.rejects(recoverClientUpgrade(ctx,'FAB-1',old,process.execPath,now,()=>({status:0,stdout:'codex-cli 0.141.0'})),/UPGRADE_REQUIRED/);
  const eventsPath=path.join(root,'model-executions',key,'events.jsonl');
  await writeFile(eventsPath,events+'{"type":"turn.completed"}\n');
  await assert.rejects(recoverClientUpgrade(ctx,'FAB-1',old,process.execPath,now,version),/RECOVERY_PROOF/);
  await writeFile(eventsPath,events);
  const result=await recoverClientUpgrade(ctx,'FAB-1',old,process.execPath,now,version);
  assert.equal(result.budgetsUnchanged,true);
  const after=await loadJob(root);assert.deepEqual(after.state.sessions,before.state.sessions);assert.equal(after.state.total_submissions,0);
  await assert.rejects(recoverClientUpgrade(ctx,'FAB-1',old,process.execPath,now,version),/NOT_ELIGIBLE/);
  await writeFile(eventsPath,events+'\n');
  await assert.rejects(runAuthorSession(ctx,options,{run:model.run,clock:()=>now}),/PROOF_CHANGED/);
  await writeFile(eventsPath,events);
  const complete=await runAuthorSession(ctx,options,{run:model.run,clock:()=>now});
  assert.equal(complete.action,'review_handoff');assert.equal(model.calls,1);assert.deepEqual(await readFile(recordPath),recordBytes);
});

for(const expired of [false,true])test(`retained unsupported-Spark failure recovers without repeating dispatch (expired=${expired})`, async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1}),normal=fabricatedModelRun();let calls=0;
  const run=(bin,args,options)=>{if(args[0]!=='exec')return normal.run(bin,args,options);calls++;return {status:1,stdout:unavailableSparkEvents()};};
  const options={lane:'spark',codexExecutable:process.execPath},deps={run,clock:()=>now};
  await runAuthorSession(ctx,options,deps);
  const job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));
  // Reproduce the previous runtime's generic queued checkpoint with the same real-shaped receipt.
  await appendState(job,'FABRICATED older runtime checkpoint',{...job.state,phase:'queued',blocker:{code:'V2_TRANSPORT_FAILED'},history:[]},now);
  const result=await runAuthorSession(ctx,options,{...deps,clock:()=>expired?new Date(now.getTime()+2*60*60*1000):now});
  assert.equal(calls,1);assert.equal(result.code,'V2_SPARK_MODEL_UNAVAILABLE');
  assert.equal(result.totalSubmissions,0);
  const after=await loadJob(job.directory);
  assert.deepEqual(after.state.sessions,job.state.sessions);
  assert.deepEqual(after.state.session,job.state.session);
});


test('verified Spark provider refusal hands off to Luna without spending or resetting candidates', async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1}),normal=fabricatedModelRun();
  const run=(bin,args,options)=>args[0]==='exec'?{status:1,stdout:unavailableSparkEvents(),stderr:''}:normal.run(bin,args,options);
  const result=await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath},{run,clock:()=>now});
  assert.equal(result.code,'V2_SPARK_MODEL_UNAVAILABLE');assert.equal(result.state,'fallback_pending');
  const before=await loadJob(path.join(ctx.jobRoot,'FAB-1'));
  assert.equal(before.state.total_submissions,0);assert.equal(before.state.owners['TST.1'],'spark');
  const order=await startV2(ctx,'luna',now);
  assert.equal(order.requiredModel,MODELS.luna);assert.equal(order.submissionsRemaining,2);
  const after=await loadJob(before.directory);
  assert.deepEqual(after.state.sessions[before.state.session.id],before.state.session);
  assert.equal(after.state.total_submissions,0);assert.equal(after.state.owners['TST.1'],'luna');
  await writeCandidate(order);
  const complete=await advanceV2(ctx,order.readingId,sessionId(order),now);
  assert.equal(complete.action,'review_handoff');assert.equal(complete.totalSubmissions,1);
});

test('Spark availability handoff rejects tampered provider evidence', async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1}),normal=fabricatedModelRun();
  const run=(bin,args,options)=>args[0]==='exec'?{status:1,stdout:unavailableSparkEvents()}:normal.run(bin,args,options);
  await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath},{run,clock:()=>now});
  const job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));
  await writeFile(path.join(job.directory,'model-executions',job.state.blocker.execution_key,'events.jsonl'),'FABRICATED altered refusal');
  await assert.rejects(startV2(ctx,'luna',now),/AVAILABILITY_PROOF_INVALID/);
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
const sessionId=report=>report.advanceArgv.at(-1);
function fabricatedModelRun(transform=x=>x){
  let calls=0;
  const run=(_binary,args,options)=>{
    if(args[0]==='login')return {status:0,stderr:'Logged in using ChatGPT'};
    if(args.includes('mcp'))return {status:0,stdout:JSON.stringify([{name:'fabricated_mcp',enabled:!args.includes('mcp_servers.fabricated_mcp.enabled=false')}])};
    calls++;
    assert.ok(args.includes('gpt-5.3-codex-spark'));assert.ok(args.includes('mcp_servers.fabricated_mcp.enabled=false'));
    assert.ok(!options.input.includes('FABRICATED PRIVATE DEVOTIONAL'));
    const packet=JSON.parse(options.input.split('SOURCE PACKET:\n')[1].split('\n\n')[0]);
    const output=transform(candidate(packet),calls);
    if(output===null)return {status:1,stderr:'FABRICATED transport failure'};
    writeFileSync(args[args.indexOf('--output-last-message')+1],bytesFor(output));
    return {status:0,stdout:'{"type":"thread.started"}\n{"type":"item.completed","item":{"type":"agent_message","text":"FABRICATED JSON output"}}\n{"type":"turn.completed"}\n'};
  };
  return {run,get calls(){return calls;}};
}

test('installed author transport drains only one reading through strict controller and leaves review pending',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:12,readingCount:2}),model=fabricatedModelRun();
  const result=await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath},{run:model.run,clock:()=>now});
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
  assert.equal(first.code,'V2_TRANSPORT_FAILED');assert.equal(second.code,'V2_TRANSPORT_ALREADY_ATTEMPTED');assert.equal(model.calls,1);
  const job=await loadJob(path.join(ctx.jobRoot,'FAB-1'));assert.equal(job.state.total_submissions,0);assert.equal(job.state.phase,'queued');
});
test('unstarted configuration recovery preserves failed bytes and budgets and resumes only on a new release',async t=>{
  const {ctx,now}=await fixture(t,{verseCount:1});ctx.config.source_revision='a'.repeat(40);const model=fabricatedModelRun();
  const failing=(bin,args,options)=>args[0]==='exec'?{status:1,stdout:'',stderr:'Error loading config.toml: invalid transport\nin `mcp_servers.fabricated_mcp`\n'}:model.run(bin,args,options);
  await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath},{run:failing,clock:()=>now});
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
  const result=await runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath},{run:model.run,clock:()=>now});assert.equal(result.action,'review_handoff');assert.equal(result.totalSubmissions,1);assert.equal(model.calls,1);assert.deepEqual(await readFile(file),bytes);
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
  await assert.rejects(runAuthorSession(ctx,{lane:'spark',codexExecutable:process.execPath},{run:()=>({status:0,stdout:'Logged in using API key'}),clock:()=>now}),/CHATGPT_LOGIN_REQUIRED/);
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
  await atomicJson(ctx.releaseRoot,'fixtures/pilot-content/app-config.json',{sharedStartDate:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit'}).format(new Date()),futureLookaheadDays:7});
  const run=(bin,args,options={})=>{const r=spawnSync(bin,args,{cwd:ctx.releaseRoot,encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024,...options});assert.equal(r.status,0,`${bin} failed: ${r.stderr}`);return r.stdout.trim();};
  run('git',['init','-q']);run('git',['add','scripts','schemas','prompts','fixtures']);run('git',['-c','user.name=FABRICATED Test','-c','user.email=fabricated@example.invalid','-c','core.hooksPath=.no-test-hooks','commit','-qm','FABRICATED runtime test only']);const revision=run('git',['rev-parse','HEAD']);
  const installer=path.join(ctx.releaseRoot,'scripts/install-mhc-native-runtime.mjs'),args=[installer,'--project-root',ctx.projectRoot,'--revision',revision,'--spark-automation-id','fabricated-spark','--luna-automation-id','fabricated-luna','--pipeline','v2'];
  const installed=JSON.parse(run(process.execPath,args));const invoke=(args)=>JSON.parse(run(process.execPath,[installed.launcher,...args],{cwd:os.tmpdir()}));
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
