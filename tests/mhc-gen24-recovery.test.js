import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {serviceContext,sourceInput,startV2,advanceV2,reviewWorkOrderV2,applyReviewV2} from '../scripts/lib/mhc-v2-service.mjs';
import {atomicJson,loadJob,createJob,appendState,bytesFor,assertAuthorExecutionsFinished} from '../scripts/lib/mhc-v2-store.mjs';
import {digestObject,REVIEW_ASSERTIONS} from '../scripts/lib/mhc-v2.mjs';
import {sha256,normalizedBatchHash} from '../scripts/lib/mhc-pipeline.mjs';
import {GEN24_RECOVERY_GRANT,inspectGen24Recovery,prepareGen24Recovery,runGen24Recovery,inspectGen24Owners,evaluateGen24Owners} from '../scripts/lib/mhc-gen24-recovery.mjs';
import {prepareAuthorTransport,runAuthorSession} from '../scripts/lib/mhc-v2-author-session.mjs';

const repo=fileURLToPath(new URL('..',import.meta.url)),READING='LTP-0041-GEN-024',GRANT=GEN24_RECOVERY_GRANT;
const originalAt=new Date('2026-10-19T05:06:00Z'),windowStart='2026-10-21T05:05:00Z',windowEnd='2026-10-21T06:05:00Z';
const sourceManifest={source_id:'fabricated-gen24',work_title:'FABRICATED TEST COMMENTARY',module_name:'MHC',module_version:'2.2',source_version_date:'2026-01-01',retrieved_at:'2026-01-01',license:'Public domain FABRICATED TEST',archive_sha256:'a'.repeat(64),source_format:'CrossWire SWORD zCom4 OSIS',versification:'KJV',source_url:'https://example.invalid/fabricated',download_url:'https://example.invalid/fabricated.zip'};
function candidate(packet){return {schema_version:'mhc-evidence-candidate/v2',packet_id:packet.packet_id,records:packet.requests.map(r=>({verse_id:r.verse_id,sentences:[{text:'FABRICATED: a thoughtful village helper hands out supplies, easing hardship for local families.',evidence_ids:[r.evidence_ids[0]]}]}))};}
async function hashes(root){const result=[];async function walk(dir){for(const d of await readdir(dir,{withFileTypes:true})){const f=path.join(dir,d.name);if(d.isDirectory())await walk(f);else result.push([path.relative(root,f),sha256(await readFile(f))]);}}await walk(root);return result.sort((a,b)=>a[0].localeCompare(b[0]));}
async function fixture(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'gen24-recovery-fabricated-'));t.after(async()=>{assert.ok(root.startsWith(path.join(os.tmpdir(),'gen24-recovery-fabricated-')));await rm(root,{recursive:true,force:true});});
  const releaseRoot=path.join(root,'release'),projectRoot=path.join(root,'project'),runtimeRoot=path.join(projectRoot,'private-content/automation/mhc-runtime');
  for(const name of ['schemas','prompts'])await cp(path.join(repo,name),path.join(releaseRoot,name),{recursive:true});
  await mkdir(path.join(releaseRoot,'scripts/lib'),{recursive:true});await cp(path.join(repo,'scripts/lib/mhc-gen24-recovery.mjs'),path.join(releaseRoot,'scripts/lib/mhc-gen24-recovery.mjs'));
  const moduleBytes=await readFile(path.join(releaseRoot,'scripts/lib/mhc-gen24-recovery.mjs')),runtimeManifest={schema_version:'mhc-native-runtime-manifest/v1',source_revision:'f'.repeat(40),files:[{path:'scripts/lib/mhc-gen24-recovery.mjs',sha256:sha256(moduleBytes),bytes:moduleBytes.length}]};await writeFile(path.join(releaseRoot,'manifest.json'),bytesFor(runtimeManifest));
  const entries=Array.from({length:6},(_,i)=>({readingId:i===5?READING:`FAB-UNUSED-${i}`,planVersion:'fabricated-gen24-v1',dayIndex:i+1,kind:'chapter',passages:[{bookId:'GEN',chapter:i===5?24:i+1,verseCount:i===5?67:1}]}));
  await atomicJson(releaseRoot,'fixtures/pilot-content/plan.json',{planVersion:'fabricated-gen24-v1',entries});await atomicJson(releaseRoot,'fixtures/pilot-content/app-config.json',{sharedStartDate:'2026-10-21',futureLookaheadDays:7});
  await atomicJson(projectRoot,'private-content/private-manifest.json',{readings:{[READING]:{}}});await atomicJson(projectRoot,`private-content/bridge/celebration-y3q4/${READING}.metadata.json`,{readingId:READING,henrySourceLink:{sourceId:'fabricated-gen24',title:'FABRICATED Henry',note:'FABRICATED fallback',url:'https://example.invalid/fabricated'}});
  await atomicJson(projectRoot,'private-commentary/mhc/source-manifest.json',sourceManifest);
  const ranges=[[1,6],[7,12],[13,18],[19,24],[25,30],[31,36],[37,44],[45,52],[53,53],[54,61],[62,67]],units=ranges.map(([start,end])=>{
    const id=`fabricated:GEN:24:${start}-${end}`,text=`vv. ${start}-${end}. FABRICATED TEST COMMENTARY: the caretaker distributes parcels to needy households. Patient kindness benefits the village during its difficult season.`,{source_id,work_title,...provenance}=sourceManifest;
    return {schema_version:'mhc-normalized-source/v3',source_id,source_unit_id:id,work_title,book_id:'GEN',chapter:24,verse_start:start,verse_end:end,reference_label:`Genesis 24:${start}-${end}`,unit_type:'verse_range',source_text:text,source_text_sha256:sha256(text),source_atoms:[{source_atom_id:`${id}:a1`,sequence:1,atom_type:'commentary',text,text_sha256:sha256(text)}],worker_source_sha256:sha256(text),excluded_scripture_sha256:null,verse_anchors:[],provenance};});
  const normalized=path.join(projectRoot,'private-commentary/mhc/normalized/GEN');await mkdir(normalized,{recursive:true});await writeFile(path.join(normalized,'024.jsonl'),units.map(x=>JSON.stringify(x)).join('\n')+'\n');await atomicJson(normalized,'024.manifest.json',{source_archive_sha256:sourceManifest.archive_sha256,book_id:'GEN',chapter:24,indexed_verse_count:67,normalized_batch_sha256:normalizedBatchHash(units)});
  const ctx=await serviceContext({projectRoot,releaseRoot,runtimeRoot,launcher:path.join(runtimeRoot,'launcher.mjs'),manifestSha256:sha256(bytesFor(runtimeManifest)),config:{source_revision:'f'.repeat(40),project_root:projectRoot,runtime_root:runtimeRoot,author_model:'gpt-6-luna',spark_automation_id:'FABRICATED',luna_automation_id:'FABRICATED'}});
  let work=await startV2(ctx,'spark',originalAt);
  for(let i=0;i<6;i++){
    const packet=JSON.parse(await readFile(work.sourcePath)),body=candidate(packet),before=await loadJob(path.join(ctx.jobRoot,READING)),key=digestObject({session:before.state.session.id,packet:packet.packet_id,submissions:i});
    await atomicJson(before.directory,`model-executions/${key}/result.json`,{schema_version:'mhc-model-execution/v1',session:before.state.session.id,status:'completed',started_at:originalAt.toISOString(),finished_at:originalAt.toISOString(),candidate_sha256:digestObject(body),proof:{packet_sha256:digestObject(packet),model:'gpt-6-luna',reasoning_effort:'medium'}});
    await atomicJson(before.directory,`model-executions/${key}/response.json`,body);await writeFile(path.join(before.directory,`model-executions/${key}/events.jsonl`),'{"type":"turn.completed"}\n');await writeFile(work.candidatePath,bytesFor(body));work=await advanceV2(ctx,READING,before.state.session.id,originalAt);
  }
  let old=await loadJob(path.join(ctx.jobRoot,READING));const next=JSON.parse(await readFile(work.sourcePath)),unknown=digestObject({session:old.state.session.id,packet:next.packet_id,submissions:6});
  await atomicJson(old.directory,`model-executions/${unknown}/result.json`,{schema_version:'mhc-model-execution/v1',session:old.state.session.id,status:'started',started_at:originalAt.toISOString(),proof:{packet_sha256:digestObject(next),model:'gpt-6-luna',reasoning_effort:'medium'}});
  old=await appendState(old,'FABRICATED expired lease',{...old.state,phase:'blocked',lease:{...old.state.lease,released:true},blocker:{stage:'model_transport',code:'V2_AUTHOR_LEASE_EXPIRED'}},new Date('2026-10-20T05:07:00Z'));
  await atomicJson(runtimeRoot,'runner.lock/owner.json',{pid:process.pid});const executable=path.join(root,'fabricated-codex.exe');await writeFile(executable,'FABRICATED EXECUTABLE IDENTITY ONLY');
  const receipt={schema_version:'mhc-author-preflight/v1',state:'available',billingRoute:'existing ChatGPT login; no API-key fallback',codexExecutable:executable,executableSha256:sha256(await readFile(executable)),version:'codex-cli 0.162.1',receipts:[{model:'gpt-6-luna',reasoning:'medium',code:null}]},receiptId=digestObject(receipt);await atomicJson(runtimeRoot,`author-preflight/receipts/${receiptId}.json`,receipt);
  const inspected=await inspectGen24Recovery(ctx),grantRoot=path.join(projectRoot,'private-content/automation',GRANT);
  await atomicJson(grantRoot,'approval.json',{schema_version:'mhc-gen24-user-approval/v1',grant_id:GRANT,approved:true,approved_at:'2026-10-20T21:47:00Z',original_binding_sha256:inspected.binding_sha256,max_author_calls:5,max_duration_ms:3600000,unknown_prior_dispatches_charged:1});
  const cap=await prepareGen24Recovery(ctx,{notBefore:windowStart,expiresAt:windowEnd,codexExecutable:executable,preflightReceipt:receiptId});
  return {ctx,root,old,unknown,grantRoot,executable,receiptId,cap,originalHashes:await hashes(old.directory)};
}
function transport(f,{mode='success',owners}={}){
  let calls=0,time=new Date('2026-10-21T05:06:00Z');
  const run=(bin,args,opts)=>{
    if(args[0]==='login')return {status:0,stderr:mode==='api_auth'?'Logged in using an API key':'Logged in using ChatGPT'};
    if(args.includes('mcp'))return {status:0,stdout:'[]'};
    if(args[0]==='--version')return {status:0,stdout:'codex-cli 0.162.1'};
    assert.equal(args[0],'exec');calls++;assert.ok(args.includes('gpt-6-luna'));assert.ok(args.includes('model_reasoning_effort="medium"'));assert.ok(args.includes('forced_login_method="chatgpt"'));assert.equal(opts.env.OPENAI_API_KEY,undefined);assert.equal(opts.env.CODEX_API_KEY,undefined);assert.ok(opts.timeout<=12*60000);assert.ok(!opts.input.includes('original_binding_sha256'));assert.ok(!opts.input.includes('Availability preflight'));
    const packet=JSON.parse(opts.input.split('SOURCE PACKET:\n')[1]),events=readdirSyncSafe(path.join(f.grantRoot,'ledger')).map(name=>JSON.parse(readFileSync(path.join(f.grantRoot,'ledger',name),'utf8'))),intents=events.filter(e=>e.kind==='author_intent');assert.equal(intents.length,calls);assert.equal(intents.at(-1).data.packet_id,packet.packet_id);
    if(mode==='interrupt')throw Error('FABRICATED abrupt coordinator loss');
    if(mode==='timeout')return {status:null,error:{code:'ETIMEDOUT'},stdout:'',stderr:'FABRICATED timeout'};
    const output=candidate(packet);if(mode==='invalid')output.packet_id='MHP2-'+'0'.repeat(32);
    writeFileSync(args[args.indexOf('--output-last-message')+1],bytesFor(output));if(mode==='late')time=new Date('2026-10-21T06:06:00Z');
    return {status:0,stdout:'{"type":"thread.started"}\n{"type":"turn.completed"}\n',stderr:''};
  };
  return {run,clock:()=>time,checkOwners:owners||(()=>({quiescent:true,unknown:false,processes:[]})),get calls(){return calls;}};
}
import {readdirSync as readdirSyncSafe} from 'node:fs';
const execute=(f,t)=>runGen24Recovery(f.ctx,{capabilitySha256:f.cap.capability_sha256,codexExecutable:f.executable},t);

test('one approved window makes exactly five calls and exposes a full normal independent-review derivative',async t=>{
  const f=await fixture(t),tr=transport(f),result=await execute(f,tr);assert.equal(result.action,'review_handoff');assert.equal(tr.calls,5);assert.equal(result.newAuthorCalls,5);
  assert.deepEqual(await hashes(f.old.directory),f.originalHashes);await assert.rejects(assertAuthorExecutionsFinished(await loadJob(f.old.directory)),/V2_TRANSPORT_UNCERTAIN/);
  const order=await reviewWorkOrderV2(f.ctx,tr.clock());assert.equal(order.action,'review');assert.equal(order.readingId,READING);assert.notEqual(path.dirname(order.reviewPath),f.old.directory);
  const bundle=JSON.parse(await readFile(order.bundlePath));assert.equal(bundle.source_packets.length,11);assert.equal(bundle.sentences.length,67);assert.equal(Object.keys(bundle.results[0].runtime.records).length,67);
  const review={schema_version:'mhc-evidence-approval/v2',reading_id:READING,review_basis_sha256:bundle.review_basis_sha256,status:'approved',reviewer:'FABRICATED independent reviewer',reviewed_at:tr.clock().toISOString(),findings:['FABRICATED full67/all11 independent comparison.'],assertions:Object.fromEntries(REVIEW_ASSERTIONS.map(k=>[k,true])),corrections:[]};
  await writeFile(order.reviewPath,bytesFor(review));const applied=await applyReviewV2(f.ctx,READING,tr.clock());assert.ok(['publish_pending','publishing'].includes(applied.state));assert.deepEqual(await hashes(f.old.directory),f.originalHashes);
  const upgraded={...f.ctx,manifestSha256:'9'.repeat(64),config:{...f.ctx.config,source_revision:'9'.repeat(40)}};assert.equal((await reviewWorkOrderV2(upgraded,tr.clock())).action,'recover_publish');
  await assert.rejects(execute(f,tr),/CONSUMED/);assert.equal(tr.calls,5);
});

for(const mode of ['interrupt','timeout','invalid','late','api_auth'])test(`recovery ${mode} consumes the one window and never retries or repairs`,async t=>{
  const f=await fixture(t),tr=transport(f,{mode}),result=await execute(f,tr);assert.equal(result.state,'blocked');assert.equal(tr.calls,mode==='api_auth'?0:1);assert.equal(result.reservedAuthorCalls,mode==='api_auth'?0:1);assert.equal(result.unknownPriorDispatchesCharged,1);assert.deepEqual(await hashes(f.old.directory),f.originalHashes);
  await assert.rejects(execute(f,tr),/CONSUMED/);assert.equal(tr.calls,mode==='api_auth'?0:1);
  await assert.rejects(readFile(path.join(f.grantRoot,'completed.json')),/ENOENT/);
});

for(const mode of ['head','source','active_owner','uncertain_owner','cap_limit','generic_target','deadline','lock'])test(`recovery rejects ${mode} before any author call`,async t=>{
  const f=await fixture(t),tr=transport(f,{owners:mode==='active_owner'?()=>({quiescent:false,unknown:false,processes:[{pid:123}]}):mode==='uncertain_owner'?()=>({quiescent:false,unknown:true,processes:[]}):undefined});
  if(mode==='head')await appendState(await loadJob(f.old.directory),'FABRICATED changed head',(await loadJob(f.old.directory)).state,originalAt);
  if(mode==='source')await writeFile(path.join(f.ctx.mhcRoot,'normalized/GEN/024.jsonl'),'FABRICATED invalid changed source');
  if(mode==='cap_limit'||mode==='generic_target'){
    const cap=JSON.parse(await readFile(f.cap.capability_path));if(mode==='cap_limit')cap.policy.max_author_calls=6;else cap.policy.reading_id='FABRICATED-OTHER';const id=digestObject(cap);await atomicJson(f.grantRoot,`capabilities/${id}.json`,cap);f.cap.capability_sha256=id;
  }
  if(mode==='deadline')tr.clock=()=>new Date(windowEnd);
  if(mode==='lock')await atomicJson(f.ctx.runtimeRoot,'runner.lock/owner.json',{pid:process.pid+100000});
  await assert.rejects(execute(f,tr));assert.equal(tr.calls,0);await assert.rejects(readFile(path.join(f.grantRoot,'consumed.json')),/ENOENT/);
});

test('another prepared capability cannot redeem the same grant after interruption',async t=>{
  const f=await fixture(t),other=await prepareGen24Recovery(f.ctx,{notBefore:'2026-10-21T05:07:00Z',expiresAt:'2026-10-21T06:04:00Z',codexExecutable:f.executable,preflightReceipt:f.receiptId}),tr=transport(f,{mode:'interrupt'});
  await execute(f,tr);f.cap=other;await assert.rejects(execute(f,tr),/CONSUMED/);assert.equal(tr.calls,1);
});

test('a partial durable claim cannot be consumed a second time',async t=>{
  const f=await fixture(t),tr=transport(f);await writeFile(path.join(f.grantRoot,'consumed.json'),'FABRICATED interrupted claim');
  await assert.rejects(execute(f,tr),/CONSUMED/);assert.equal(tr.calls,0);
});

test('a second unapproved started intent cannot use the one-intent exception',async t=>{
  const f=await fixture(t),tr=transport(f);await atomicJson(f.old.directory,`model-executions/${'c'.repeat(64)}/result.json`,{status:'started'});
  await assert.rejects(execute(f,tr),/INTENT_CHANGED/);assert.equal(tr.calls,0);await assert.rejects(readFile(path.join(f.grantRoot,'consumed.json')),/ENOENT/);
});

test('a new owner appearing during the window stops before the second intent',async t=>{
  const f=await fixture(t);const tr=transport(f,{owners:()=>tr.calls===0?{quiescent:true,unknown:false,processes:[]}:{quiescent:false,unknown:false,processes:[{pid:123}]}});
  const result=await execute(f,tr);assert.equal(result.state,'blocked');assert.equal(tr.calls,1);
  await assert.rejects(execute(f,tr),/CONSUMED/);assert.equal(tr.calls,1);assert.deepEqual(await hashes(f.old.directory),f.originalHashes);
});

for(const uncertain of [false,true])test(`a different ${uncertain?'uncertain':'active'} native owner blocks this one-reading exception`,async t=>{
  const f=await fixture(t),tr=transport(f),{input_sha256,...original}=f.old.input,basis={...original,reading_id:'FABRICATED-OTHER-OWNER'},input={...basis,input_sha256:digestObject(basis)};
  let other=await createJob(f.ctx.jobRoot,input,originalAt);
  if(uncertain){other=await appendState(other,'FABRICATED blocked owner',{...other.state,phase:'blocked',blocker:{code:'FABRICATED uncertainty'}},originalAt);await atomicJson(other.directory,`model-executions/${'b'.repeat(64)}/result.json`,{status:'started'});}
  await assert.rejects(execute(f,tr));assert.equal(tr.calls,0);await assert.rejects(readFile(path.join(f.grantRoot,'consumed.json')),/ENOENT/);
});

test('preparation refuses a longer or daytime window and a weakened approval',async t=>{
  const f=await fixture(t);
  for(const [notBefore,expiresAt] of [['2026-10-21T05:05:00Z','2026-10-21T06:06:00Z'],['2026-10-21T16:00:00Z','2026-10-21T16:30:00Z']])await assert.rejects(prepareGen24Recovery(f.ctx,{notBefore,expiresAt,codexExecutable:f.executable,preflightReceipt:f.receiptId}),/WINDOW_INVALID/);
  const approval=JSON.parse(await readFile(path.join(f.grantRoot,'approval.json')));approval.max_author_calls=9;await atomicJson(f.grantRoot,'approval.json',approval);
  await assert.rejects(execute(f,transport(f)),/APPROVAL_INVALID/);
});

test('recovery cannot qualify an unlisted module under a prevention-only manifest',async t=>{
  const f=await fixture(t),manifest=JSON.parse(await readFile(path.join(f.ctx.releaseRoot,'manifest.json')));manifest.files=[];await writeFile(path.join(f.ctx.releaseRoot,'manifest.json'),bytesFor(manifest));f.ctx.manifestSha256=sha256(bytesFor(manifest));
  await assert.rejects(prepareGen24Recovery(f.ctx,{notBefore:windowStart,expiresAt:windowEnd,codexExecutable:f.executable,preflightReceipt:f.receiptId}),/RUNTIME_NOT_QUALIFIED/);
});

test('non-model transport qualification cannot serialize its environment or spend author allowance',async t=>{
  const f=await fixture(t),tr=transport(f),receipt=await prepareAuthorTransport(f.ctx,{lane:'spark',codexExecutable:f.executable},{run:tr.run});
  assert.equal(tr.calls,0);assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(receipt)),'options'),false);assert.equal(receipt.options.env.OPENAI_API_KEY,undefined);
});

const historyIds=['LTP-0009-GEN-004','LTP-0022-GEN-012'];
async function retainedFixture(f){
  const reports=[],histories=[],originalTrees=[],manifest=JSON.parse(await readFile(path.join(f.ctx.privateRoot,'private-manifest.json')));
  const descriptor=async file=>({sha256:sha256(await readFile(file))});
  for(const [i,id] of historyIds.entries()){
    const packet=structuredClone(f.old.input.chapters[0].batches[0]);packet.packet_id='MHP2-'+digestObject({fabricated:id}).slice(0,32);
    const chapter=i===0?4:12;packet.requests=packet.requests.slice(0,4).map((r,index)=>({...r,verse_id:`GEN.${chapter}.${index+1}`}));
    const {input_sha256,...original}=f.old.input,basis={...original,reading_id:id,chapters:[{...original.chapters[0],chapter,batches:[packet]}]},input={...basis,input_sha256:digestObject(basis)};
    let job=await createJob(f.ctx.jobRoot,input,new Date('2026-09-01T00:00:00Z'),f.old.state.models);
    const session='luna:2026-09-01T00:00:00.000Z',key=digestObject({session,packet:packet.packet_id,submissions:0}),replacementKey=digestObject({fabricated:'replacement',id}),proof={packet_sha256:digestObject(packet),model:'gpt-5.6-luna',reasoning_effort:'low'};
    await atomicJson(job.directory,`model-executions/${key}/result.json`,{status:'started',session,started_at:'2026-09-01T00:00:00Z',proof});await atomicJson(job.directory,`model-executions/${key}/transport.schema.json`,{FABRICATED:true});
    const body=candidate(packet),bytes=bytesFor(body),candidateHash=sha256(bytes);await atomicJson(job.directory,`attempts/${candidateHash}.json`,{bytes});
    await atomicJson(job.directory,`model-executions/${replacementKey}/result.json`,{status:'completed',session:'luna:2026-09-02T00:00:00.000Z',proof,candidate_sha256:digestObject(body)});
    await atomicJson(job.directory,`model-executions/${replacementKey}/response.json`,body);await writeFile(path.join(job.directory,`model-executions/${replacementKey}/events.jsonl`),'{"type":"turn.completed"}\n');
    const runtime={schema_version:'FABRICATED published runtime',chapter},approved={results:[{runtime}]},approvedHash=digestObject(approved);await atomicJson(job.directory,`approved/${approvedHash}.json`,approved);
    const metadata={readingId:id,verseCommentaries:[runtime],FABRICATED:true},metadataFile=path.join(f.ctx.privateRoot,`bridge/celebration-y3q4/${id}.metadata.json`);await writeFile(metadataFile,bytesFor(metadata));
    manifest.readings[id]={metadataFileId:`FABRICATED-METADATA-${chapter}`};
    const publication={schemaVersion:'mhc-manager-publication-result/v1',readingId:id,status:'published_verified',metadataReadback:'exact_bytes',manifestReadback:'exact_bytes',liveReadingStatus:'ready',henryLayerStatus:'complete',metadataFileId:manifest.readings[id].metadataFileId,payloadSha256:sha256(bytesFor(metadata))};
    const receiptFile=await atomicJson(f.ctx.privateRoot,`automation/staging/${id}/manager-publication-result.json`,publication);
    job=await appendState(job,'FABRICATED published historical reading',{...job.state,phase:'published',accepted:{[`${packet.packet_id}:luna`]:{candidate_sha256:candidateHash}},owners:{[`GEN.${chapter}`]:'luna'},sessions:{[session]:{id:session,deadline_at:'2026-09-01T01:00:00Z'}},review:{approved_sha256:approvedHash},publication:{receipt_sha256:digestObject(publication)}},new Date('2026-09-02T02:00:00Z'));
    const files=(await hashes(job.directory)).map(([relativePath,sum])=>({relativePath,sha256:sum,bytes:readFileSync(path.join(job.directory,relativePath)).length}));
    reports.push({readingId:id,inputSha256:input.input_sha256,eventHead:job.previous,files});
    const child=bytesFor({FABRICATED:'unknown child UserMessage only',id}),parent=bytesFor({FABRICATED:'parent lost session and archived',id});
    for(const b of [child,parent])await atomicJson(f.grantRoot,`history-admission/evidence/${sha256(b)}.jsonl`,JSON.parse(b));
    histories.push({readingId:id,inputSha256:input.input_sha256,eventHead:job.previous,eventSequence:job.sequence,unknown:{status:'started',terminalOutcomeProven:false,key,record:await descriptor(path.join(job.directory,`model-executions/${key}/result.json`)),session,packetSha256:digestObject(packet),packetId:packet.packet_id,submissionsBeforeIntent:0},replacement:{key:replacementKey,acceptedCandidateByteSha256:candidateHash,record:await descriptor(path.join(job.directory,`model-executions/${replacementKey}/result.json`)),events:await descriptor(path.join(job.directory,`model-executions/${replacementKey}/events.jsonl`))},publication:{receipt:await descriptor(receiptFile),metadata:await descriptor(metadataFile),approvedArtifact:await descriptor(path.join(job.directory,`approved/${approvedHash}.json`))},childRollout:{sha256:sha256(child)},parentCoordinator:{sha256:sha256(parent)}});
    originalTrees.push({id,directory:job.directory,hashes:await hashes(job.directory),key,packet,session,metadataFile,receiptFile});
  }
  await writeFile(path.join(f.ctx.privateRoot,'private-manifest.json'),bytesFor(manifest));
  const inspection={schemaVersion:'gen24-history-admission-inspection/v1',reports},inspectionBytes=bytesFor(inspection);await atomicJson(f.grantRoot,'history-admission/history-inspection.json',inspection);
  const diagnosis={schemaVersion:'gen24-two-historical-intents-admission-diagnosis/v1',histories,assets:{'history-inspection.json':{sha256:sha256(inspectionBytes)}},FABRICATED:true},diagnosisBytes=bytesFor(diagnosis);await atomicJson(f.grantRoot,'history-admission/diagnosis.json',diagnosis);
  const review={schema_version:'wo3-gen24-history-admission-design-review/v1',assessment:'ACCEPTED_DESIGN_ONLY_NO_BLOCKING_DESIGN_FINDING',diagnosis_sha256:sha256(diagnosisBytes),histories:histories.map(j=>({reading_id:j.readingId,event_head:j.eventHead,input_sha256:j.inputSha256,unknown_key:j.unknown.key,unknown_record_sha256:j.unknown.record.sha256,status_unchanged:'started',remote_termination_proven:false})),FABRICATED:true};await atomicJson(f.grantRoot,'history-admission/design-review.json',review);
  await atomicJson(f.grantRoot,'history-admission/authority.json',{schema_version:'mhc-gen24-history-authority/v1',grant_id:GRANT,classification:'retained_unknown_for_GEN24_admission_only',accepted:true,accepted_at:'2026-10-20T22:00:00Z',diagnosis_sha256:sha256(diagnosisBytes),design_review_sha256:sha256(bytesFor(review))});
  f.cap=await prepareGen24Recovery(f.ctx,{notBefore:windowStart,expiresAt:windowEnd,codexExecutable:f.executable,preflightReceipt:f.receiptId});f.histories=originalTrees;
  return f;
}
const processRow=(pid,name,command_line,parent_pid=0)=>({pid,parent_pid,name,command_line,created_at:'2026-10-20T00:00:00Z'});
function ownerInventory(f,rows=[],other=rows){const base=[processRow(900002,'powershell.exe',`powershell -Command node "${f.ctx.launcher}"`,0),processRow(process.ppid,'node.exe',`node "${f.ctx.launcher}"`,900002),processRow(process.pid,'node.exe',`node "${path.join(f.ctx.releaseRoot,'scripts/mhc-native-runner.mjs')}" gen24-recovery run`,process.ppid),processRow(900001,'powershell.exe','FABRICATED process inspector',process.pid)];return {inspector_pid:900001,first:structuredClone([...base,...rows]),second:structuredClone([...base,...other])};}
async function matcher(f,rows=[],other=rows){const cap=JSON.parse(await readFile(f.cap.capability_path));return inspectGen24Owners(f.ctx,{historyAdmission:cap.history_admission,run:()=>({status:0,stdout:JSON.stringify(ownerInventory(f,rows,other))})});}

test('exact two retained unknowns bind a v2 capability and preserve all three trees through full review',async t=>{
  const f=await retainedFixture(await fixture(t)),tr=transport(f),cap=JSON.parse(await readFile(f.cap.capability_path));
  assert.equal(cap.schema_version,'mhc-gen24-recovery-capability/v2');assert.equal(cap.history_admission.bindings.length,2);assert.ok(cap.history_admission.bindings.every(b=>b.provider_termination_proven===false));
  assert.deepEqual(JSON.parse(await readFile(path.join(f.grantRoot,'retained-unknown',digestObject(cap.history_admission)+'.json'))),cap.history_admission);
  const result=await execute(f,tr);assert.equal(result.action,'review_handoff');assert.equal(tr.calls,5);
  for(const h of f.histories){assert.deepEqual(await hashes(h.directory),h.hashes);await assert.rejects(assertAuthorExecutionsFinished(await loadJob(h.directory)),/V2_TRANSPORT_UNCERTAIN/);}
  assert.deepEqual(await hashes(f.old.directory),f.originalHashes);const order=await reviewWorkOrderV2(f.ctx,tr.clock()),bundle=JSON.parse(await readFile(order.bundlePath));assert.equal(bundle.source_packets.length,11);assert.equal(bundle.sentences.length,67);
  await writeFile(order.reviewPath,bytesFor({schema_version:'mhc-evidence-approval/v2',reading_id:READING,review_basis_sha256:bundle.review_basis_sha256,status:'approved',reviewer:'FABRICATED independent reviewer',reviewed_at:tr.clock().toISOString(),findings:['FABRICATED all67/all11 independent review.'],assertions:Object.fromEntries(REVIEW_ASSERTIONS.map(k=>[k,true])),corrections:[]}));await applyReviewV2(f.ctx,READING,tr.clock());
  for(const h of f.histories)assert.deepEqual(await hashes(h.directory),h.hashes);assert.deepEqual(await hashes(f.old.directory),f.originalHashes);
});

for(const mode of ['extra_unknown','malformed','record_drift','head_drift','reopened','pending','active_session','receipt','metadata','approval','manifest','authority','evidence','classification','third_unknown'])test(`retained history ${mode} blocks before consumption`,async t=>{
  const f=await retainedFixture(await fixture(t)),h=f.histories[0],job=await loadJob(h.directory),tr=transport(f);
  if(mode==='extra_unknown')await atomicJson(h.directory,`model-executions/${'e'.repeat(64)}/result.json`,{status:'started'});
  if(mode==='malformed')await writeFile(path.join(h.directory,`model-executions/${h.key}/result.json`),'FABRICATED bad JSON');
  if(mode==='record_drift')await atomicJson(h.directory,`model-executions/${h.key}/result.json`,{status:'completed'});
  if(mode==='head_drift')await appendState(job,'FABRICATED drift',job.state,originalAt);
  if(mode==='reopened')await appendState(job,'FABRICATED reopened',{...job.state,phase:'review_pending'},originalAt);
  if(mode==='pending')await appendState(job,'FABRICATED pending',{...job.state,pending_attempt:{key:Object.keys(job.state.accepted)[0],hash:'a'.repeat(64)}},originalAt);
  if(mode==='active_session')await appendState(job,'FABRICATED active session',{...job.state,sessions:{...job.state.sessions,[h.session]:{id:h.session,deadline_at:'2027-01-01T00:00:00Z'}}},originalAt);
  if(mode==='receipt')await writeFile(h.receiptFile,'FABRICATED stale receipt');
  if(mode==='metadata')await writeFile(h.metadataFile,bytesFor({readingId:h.id,verseCommentaries:[]}));
  if(mode==='approval')await writeFile(path.join(h.directory,`approved/${job.state.review.approved_sha256}.json`),bytesFor({results:[]}));
  if(mode==='manifest'){const file=path.join(f.ctx.privateRoot,'private-manifest.json'),m=JSON.parse(await readFile(file));m.readings[h.id].metadataFileId='FABRICATED changed pointer';await writeFile(file,bytesFor(m));}
  if(mode==='authority'){const file=path.join(f.grantRoot,'history-admission/authority.json'),a=JSON.parse(await readFile(file));a.skip_all_published=true;await writeFile(file,bytesFor(a));}
  if(mode==='evidence')await writeFile(path.join(f.grantRoot,'history-admission/history-inspection.json'),'FABRICATED changed snapshot');
  if(mode==='classification'){const c=JSON.parse(await readFile(f.cap.capability_path));await writeFile(path.join(f.grantRoot,'retained-unknown',digestObject(c.history_admission)+'.json'),bytesFor({status:'completed'}));}
  if(mode==='third_unknown'){const {input_sha256,...old}=f.old.input,basis={...old,reading_id:'FABRICATED-THIRD'},input={...basis,input_sha256:digestObject(basis)};let third=await createJob(f.ctx.jobRoot,input,originalAt);third=await appendState(third,'FABRICATED published third',{...third.state,phase:'published',publication:{}},originalAt);await atomicJson(third.directory,`model-executions/${'d'.repeat(64)}/result.json`,{status:'started'});}
  await assert.rejects(execute(f,tr));assert.equal(tr.calls,0);await assert.rejects(readFile(path.join(f.grantRoot,'consumed.json')),/ENOENT/);
});

for(const i of [0,1])test(`real owner matcher catches historical job ${i+1} output/schema path and descendants`,async t=>{
  const f=await retainedFixture(await fixture(t)),h=f.histories[i],oldPath=path.join(h.directory,'model-executions',h.key,i===0?'response.json':'transport.schema.json').replaceAll('\\','/').toUpperCase();
  const rows=[processRow(901001,'codex.exe',`codex exec --output-schema "${oldPath}"`),processRow(901002,'cmd.exe','FABRICATED opaque child',901001)];
  const proof=await matcher(f,rows);assert.equal(proof.quiescent,false);assert.deepEqual(proof.processes.map(p=>p.pid),[901001,901002]);assert.ok(!JSON.stringify(proof).includes(oldPath));
  const tr=transport(f,{owners:()=>matcher(f,rows)});await assert.rejects(execute(f,tr),/ACTIVE_OWNER/);assert.equal(tr.calls,0);
});

test('owner matcher fails closed on unavailable inventory, command lines and observed races',async t=>{
  const f=await retainedFixture(await fixture(t));
  assert.throws(()=>inspectGen24Owners(f.ctx,{run:()=>({status:1,stderr:'FABRICATED CIM failure'})}),/OWNER_UNVERIFIABLE/);
  assert.throws(()=>evaluateGen24Owners(f.ctx,{inspector_pid:900001,first:null,second:[]}),/OWNER_UNVERIFIABLE/);
  assert.equal((await matcher(f,[processRow(901001,'codex.exe',null)])).unknown,true);
  const quiet=[processRow(901001,'node.exe','node FABRICATED unrelated.js')],racy=[...quiet,processRow(901002,'codex.exe','codex FABRICATED new child')];assert.equal((await matcher(f,quiet,racy)).observed_race,true);
  const tr=transport(f,{owners:()=>inspectGen24Owners(f.ctx,{run:()=>({status:1})})});await assert.rejects(execute(f,tr),/OWNER_UNVERIFIABLE/);await assert.rejects(readFile(path.join(f.grantRoot,'consumed.json')),/ENOENT/);assert.equal(tr.calls,0);
});

test('historical child appearing after call one stops before another call and keeps the grant spent',async t=>{
  const f=await retainedFixture(await fixture(t)),h=f.histories[1],tr=transport(f,{owners:()=>matcher(f,tr.calls?[processRow(901001,'codex.exe',`codex --output-last-message ${path.join(h.directory,'model-executions',h.key,'response.json')}`)]:[])});
  const result=await execute(f,tr);assert.equal(result.state,'blocked');assert.equal(tr.calls,1);assert.equal(result.reservedAuthorCalls,1);await assert.rejects(execute(f,tr),/CONSUMED/);
});

test('history drift after call one blocks the remaining author allowance',async t=>{
  const f=await retainedFixture(await fixture(t)),tr=transport(f),run=tr.run;tr.run=(bin,args,options)=>{const r=run(bin,args,options);if(args[0]==='exec')writeFileSync(path.join(f.histories[0].directory,`model-executions/${f.histories[0].key}/result.json`),'FABRICATED drift');return r;};
  const result=await execute(f,tr);assert.equal(result.state,'blocked');assert.equal(tr.calls,1);await assert.rejects(execute(f,tr),/CONSUMED/);
});

test('an old unbound capability cannot activate under the new history policy',async t=>{
  const f=await fixture(t),c=JSON.parse(await readFile(f.cap.capability_path));c.schema_version='mhc-gen24-recovery-capability/v1';delete c.history_admission;const id=digestObject(c);await atomicJson(f.grantRoot,`capabilities/${id}.json`,c);f.cap.capability_sha256=id;const tr=transport(f);await assert.rejects(execute(f,tr),/SHAPE_INVALID|CAPABILITY_INVALID/);assert.equal(tr.calls,0);
});

for(const id of historyIds)test(`ordinary start advance and author-run retain the same-reading barrier for ${id}`,async t=>{
  const f=await fixture(t),now=new Date('2026-10-21T05:06:00Z'),entry={...f.ctx.plan.entries[0],readingId:id,passages:f.ctx.plan.entries.at(-1).passages};f.ctx.plan.entries[0]=entry;
  const {input}=await sourceInput(f.ctx,entry);let job=await createJob(f.ctx.jobRoot,input,now,f.old.state.models),session={id:'luna:FABRICATED-normal-session',lane:'luna',started_at:now.toISOString(),deadline_at:'2026-10-21T06:06:00Z',submissions:0};
  job=await appendState(job,'FABRICATED retained ordinary writer',{...job.state,phase:'generating',session,sessions:{[session.id]:session},lease:{started_at:now.toISOString(),expires_at:session.deadline_at}},now);await atomicJson(job.directory,`model-executions/${'e'.repeat(64)}/result.json`,{status:'started'});
  const before=await hashes(job.directory);await assert.rejects(startV2(f.ctx,'luna',now),/V2_TRANSPORT_UNCERTAIN/);await assert.rejects(advanceV2(f.ctx,id,session.id,now),/V2_TRANSPORT_UNCERTAIN/);
  let calls=0;await assert.rejects(runAuthorSession(f.ctx,{lane:'luna',codexExecutable:f.executable},{clock:()=>now,run:()=>{calls++;throw Error('FABRICATED preflight must not run');}}),/V2_TRANSPORT_UNCERTAIN/);assert.equal(calls,0);assert.deepEqual(await hashes(job.directory),before);
});

for(const property of ['reading_id','unknown_key'])test(`capability cannot transplant a historical ${property}`,async t=>{
  const f=await retainedFixture(await fixture(t)),c=JSON.parse(await readFile(f.cap.capability_path));c.history_admission.bindings[0][property]=property==='reading_id'?'FABRICATED-OTHER':'a'.repeat(64);const id=digestObject(c);await atomicJson(f.grantRoot,`capabilities/${id}.json`,c);f.cap.capability_sha256=id;const tr=transport(f);await assert.rejects(execute(f,tr),/HISTORY_CHANGED/);assert.equal(tr.calls,0);await assert.rejects(readFile(path.join(f.grantRoot,'consumed.json')),/ENOENT/);
});

test('new historical owner after durable intent prevents dispatch and consumes no extra call',async t=>{
  const f=await retainedFixture(await fixture(t)),h=f.histories[0],tr=transport(f,{owners:()=>{const ledger=path.join(f.grantRoot,'ledger'),names=existsSync(ledger)?readdirSyncSafe(ledger):[],intent=names.some(n=>JSON.parse(readFileSync(path.join(ledger,n))).kind==='author_intent');return matcher(f,intent?[processRow(901001,'codex.exe',`codex ${path.join(h.directory,'model-executions',h.key,'transport.schema.json')}`)]:[]);}});
  const result=await execute(f,tr);assert.equal(result.state,'blocked');assert.equal(result.reservedAuthorCalls,1);assert.equal(tr.calls,0);await assert.rejects(execute(f,tr),/CONSUMED/);
});

test('historical binding preservation is checked again before completion',async t=>{
  const f=await retainedFixture(await fixture(t)),tr=transport(f),run=tr.run;tr.run=(bin,args,options)=>{const r=run(bin,args,options);if(tr.calls===5)writeFileSync(f.histories[1].receiptFile,'FABRICATED late publication drift');return r;};
  const result=await execute(f,tr);assert.equal(result.state,'blocked');assert.equal(tr.calls,5);await assert.rejects(readFile(path.join(f.grantRoot,'completed.json')),/ENOENT/);await assert.rejects(execute(f,tr),/CONSUMED/);
});

test('owner inspection crossing the window deadline leaves the grant unconsumed',async t=>{
  const f=await retainedFixture(await fixture(t));let now=new Date('2026-10-21T05:06:00Z');const tr=transport(f,{owners:()=>{now=new Date(windowEnd);return {quiescent:true,unknown:false,processes:[]};}});tr.clock=()=>now;
  await assert.rejects(execute(f,tr),/WINDOW_CLOSED/);assert.equal(tr.calls,0);await assert.rejects(readFile(path.join(f.grantRoot,'consumed.json')),/ENOENT/);
});

test('completed recovery uses consumed evidence after unrelated historical manifest annotation',async t=>{
  const f=await retainedFixture(await fixture(t)),tr=transport(f);assert.equal((await execute(f,tr)).action,'review_handoff');const before=await reviewWorkOrderV2(f.ctx,tr.clock()),beforeBasis=JSON.parse(await readFile(before.bundlePath)).review_basis_sha256;
  const file=path.join(f.ctx.privateRoot,'private-manifest.json'),m=JSON.parse(await readFile(file));m.readings['FABRICATED-UNRELATED']={};m.readings[historyIds[0]].auditNote='FABRICATED harmless annotation';m.readings[historyIds[1]].auditNote='FABRICATED second annotation';await writeFile(file,bytesFor(m));
  // The consumed copies, not mutable live admission material, prove completion.
  await writeFile(path.join(f.grantRoot,'history-admission/authority.json'),'FABRICATED no longer needed for completed reads');
  const order=await reviewWorkOrderV2(f.ctx,tr.clock());assert.equal(order.action,'review');const bundle=JSON.parse(await readFile(order.bundlePath));assert.equal(bundle.review_basis_sha256,beforeBasis);assert.equal(bundle.sentences.length,67);assert.equal(bundle.source_packets.length,11);
  await writeFile(order.reviewPath,bytesFor({schema_version:'mhc-evidence-approval/v2',reading_id:READING,review_basis_sha256:bundle.review_basis_sha256,status:'approved',reviewer:'FABRICATED independent reviewer',reviewed_at:tr.clock().toISOString(),findings:['FABRICATED independent complete review.'],assertions:Object.fromEntries(REVIEW_ASSERTIONS.map(k=>[k,true])),corrections:[]}));await applyReviewV2(f.ctx,READING,tr.clock());assert.equal((await reviewWorkOrderV2(f.ctx,tr.clock())).action,'recover_publish');assert.equal(tr.calls,5);
  for(const h of f.histories)assert.deepEqual(await hashes(h.directory),h.hashes);assert.deepEqual(await hashes(f.old.directory),f.originalHashes);
});

for(const when of ['before_claim','after_call_one'])test(`historical annotation ${when} still fails live admission`,async t=>{
  const f=await retainedFixture(await fixture(t)),file=path.join(f.ctx.privateRoot,'private-manifest.json'),annotate=()=>{const m=JSON.parse(readFileSync(file));m.readings[historyIds[0]].auditNote='FABRICATED changed live binding';writeFileSync(file,bytesFor(m));},tr=transport(f);
  if(when==='before_claim'){annotate();await assert.rejects(execute(f,tr),/HISTORY_CHANGED/);await assert.rejects(readFile(path.join(f.grantRoot,'consumed.json')),/ENOENT/);assert.equal(tr.calls,0);}
  else{const run=tr.run;tr.run=(bin,args,opts)=>{const r=run(bin,args,opts);if(args[0]==='exec')annotate();return r;};const result=await execute(f,tr);assert.equal(result.state,'blocked');assert.equal(tr.calls,1);await assert.rejects(execute(f,tr),/CONSUMED/);}
});

for(const mode of ['classification','authority','inspection','consumed_capability','consumed_approval','consumed_claim','ledger','target_candidate'])test(`completed recovery rejects tampered frozen ${mode}`,async t=>{
  const f=await retainedFixture(await fixture(t)),tr=transport(f);await execute(f,tr);
  if(mode==='target_candidate'){const job=await loadJob(path.join(f.grantRoot,'derivative-jobs',READING)),hash=Object.values(job.state.accepted).at(-1).candidate_sha256;await writeFile(path.join(job.directory,'attempts',hash+'.json'),'FABRICATED corrupt target candidate');}
  else if(mode==='ledger'){const file=path.join(f.grantRoot,'ledger','000001.json'),record=JSON.parse(await readFile(file));record.data.max_author_calls=9;await writeFile(file,bytesFor(record));}
  else{const relative=({classification:'consumed-history/classification.json',authority:'consumed-history/authority.json',inspection:'consumed-history/history-inspection.json',consumed_capability:'consumed-capability.json',consumed_approval:'consumed-approval.json',consumed_claim:'consumed.json'})[mode],file=path.join(f.grantRoot,relative),record=JSON.parse(await readFile(file));record.FABRICATED_TAMPER=true;await writeFile(file,bytesFor(record));}
  await assert.rejects(reviewWorkOrderV2(f.ctx,tr.clock()));assert.equal(tr.calls,5);
});

test('actual owner matcher accepts only the stable verified shell launcher runner inspector invocation',async t=>{
  const f=await retainedFixture(await fixture(t)),data=ownerInventory(f);const cap=JSON.parse(await readFile(f.cap.capability_path)),proof=evaluateGen24Owners(f.ctx,data,{historyAdmission:cap.history_admission});assert.equal(proof.quiescent,true);assert.equal(proof.unknown,false);assert.ok(proof.invocation_sha256);
  const tr=transport(f,{owners:()=>matcher(f)});assert.equal((await execute(f,tr)).action,'review_handoff');assert.equal(tr.calls,5);
});

for(const mode of ['missing_launcher','missing_shell','hidden_launcher','hidden_shell','younger_launcher','cycle','changed_creation','changed_ancestor','unrelated_ancestor','opaque_sibling','historical_sibling'])test(`owner invocation ${mode} is not exempted`,async t=>{
  const f=await fixture(t),data=ownerInventory(f),change=rows=>{
    if(mode==='missing_launcher')return rows.filter(r=>r.pid!==process.ppid);
    if(mode==='missing_shell')return rows.filter(r=>r.pid!==900002);
    if(mode==='hidden_launcher')rows.find(r=>r.pid===process.ppid).command_line=null;
    if(mode==='hidden_shell')rows.find(r=>r.pid===900002).command_line=null;
    if(mode==='younger_launcher')rows.find(r=>r.pid===process.ppid).created_at='2026-10-21T00:00:00Z';
    if(mode==='cycle')rows.find(r=>r.pid===900002).parent_pid=process.pid;
    if(mode==='unrelated_ancestor'){rows.find(r=>r.pid===900002).parent_pid=900003;rows.push(processRow(900003,'powershell.exe',`powershell ${path.join(f.ctx.jobRoot,historyIds[0])}`));}
    if(mode==='opaque_sibling')rows.push(processRow(901010,'node.exe','node FABRICATED opaque sibling',process.ppid));
    if(mode==='historical_sibling')rows.push(processRow(901010,'codex.exe',`codex ${path.join(f.ctx.jobRoot,historyIds[1],'model-executions','a'.repeat(64),'response.json')}`,900002));
    return rows;
  };
  data.first=change(data.first);data.second=change(data.second);
  if(mode==='changed_creation')data.second.find(r=>r.pid===process.ppid).created_at='2026-10-19T00:00:00Z';
  if(mode==='changed_ancestor')data.second.find(r=>r.pid===900002).command_line+=' FABRICATED changed argument';
  let proof;try{proof=evaluateGen24Owners(f.ctx,data);}catch(e){assert.match(e.message,/OWNER_UNVERIFIABLE/);return;}assert.equal(proof.quiescent,false);
});
