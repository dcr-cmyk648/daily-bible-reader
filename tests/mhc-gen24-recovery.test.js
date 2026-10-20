import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {serviceContext,sourceInput,startV2,advanceV2,reviewWorkOrderV2,applyReviewV2} from '../scripts/lib/mhc-v2-service.mjs';
import {atomicJson,loadJob,createJob,appendState,bytesFor,assertAuthorExecutionsFinished} from '../scripts/lib/mhc-v2-store.mjs';
import {digestObject,REVIEW_ASSERTIONS} from '../scripts/lib/mhc-v2.mjs';
import {sha256,normalizedBatchHash} from '../scripts/lib/mhc-pipeline.mjs';
import {GEN24_RECOVERY_GRANT,inspectGen24Recovery,prepareGen24Recovery,runGen24Recovery} from '../scripts/lib/mhc-gen24-recovery.mjs';
import {prepareAuthorTransport} from '../scripts/lib/mhc-v2-author-session.mjs';

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
  const f=await fixture(t);let checks=0;const tr=transport(f,{owners:()=>++checks<3?{quiescent:true,unknown:false,processes:[]}:{quiescent:false,unknown:false,processes:[{pid:123}]}});
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
