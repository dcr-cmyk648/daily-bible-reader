const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdtemp,mkdir,readFile,readdir,writeFile,rm}=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const sha=b=>createHash('sha256').update(b).digest('hex');
const jsonBytes=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const pending='V2_NATIVE_SOURCE_TRANSACTION_PENDING',invalid='V2_SUPERVISOR_JOURNAL_UNVERIFIABLE';
const transaction=(phase,id='a'.repeat(32))=>({schemaVersion:'native-source-transaction/v1',id,jobId:'b'.repeat(32),executionId:'c'.repeat(32),
  receipt:{path:'native-sources/fabricated-receipt.json',sha256:'d'.repeat(64)},phase,cursor:0,totalSources:1});
async function fixture(t,{journal=true}={}) {
  const root=await mkdtemp(path.join(os.tmpdir(),'fabricated-native-exclusion-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const runtimeRoot=path.join(root,'private-content/automation/mhc-runtime'),stateRoot=path.join(root,'private-content/automation/service-supervisor/state');
  await mkdir(runtimeRoot,{recursive:true});
  const {openJournal}=await import('../scripts/lib/service-supervisor-store.mjs');
  return {ctx:{projectRoot:root,runtimeRoot},root,stateRoot,journal:journal?await openJournal(stateRoot):null,
    guard:(await import('../scripts/lib/mhc-native-supervisor-guard.mjs')).assertNativeWriterAllowed,
    lock:(await import('../scripts/lib/mhc-native-runner.mjs')).withRunnerLock};
}
async function snapshot(root) {
  const records=[];
  async function scan(directory){for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(directory,entry.name);records.push([path.relative(root,file),entry.isDirectory()?'directory':sha(await readFile(file))]);if(entry.isDirectory())await scan(file);}}
  await scan(root);return records;
}
async function state(f,phase,id){return f.journal.append('native_source_state',{transaction:transaction(phase,id)},new Date('2026-10-11T01:00:00Z'));}

test('standalone writer guard creates no supervisor files',async t=>{
  const f=await fixture(t,{journal:false}),before=await snapshot(f.root);await f.guard(f.ctx);assert.deepEqual(await snapshot(f.root),before);
  await f.lock(f.ctx,async()=>{});assert.deepEqual(await snapshot(f.root),before);
});
for(const phase of ['ready','dispatched','captured','prepared'])test(`native ${phase} transaction blocks independent writer before lock or callback writes`,async t=>{
  const f=await fixture(t);await state(f,phase);const before=await snapshot(f.root);let entered=0;
  await assert.rejects(f.lock(f.ctx,async()=>{entered++;await writeFile(path.join(f.root,'unexpected-mutation'),'bad');}),{code:pending,stage:'native_source_exclusion'});
  assert.equal(entered,0);assert.deepEqual(await snapshot(f.root),before);
});
for(const phase of ['complete','failed'])test(`same transaction ${phase} releases exclusion without changing journal`,async t=>{
  const f=await fixture(t);await state(f,'prepared');await state(f,phase);const before=await snapshot(f.root);let entered=0;
  await f.lock(f.ctx,async()=>{entered++;});assert.equal(entered,1);assert.deepEqual(await snapshot(f.root),before);
});
test('a different terminal transaction cannot hide an earlier pending writer',async t=>{
  const f=await fixture(t);await state(f,'ready');await state(f,'complete','e'.repeat(32));await assert.rejects(f.guard(f.ctx),{code:pending});
});
test('native source reservation under existing lock excludes later cells and inferred installer project',async t=>{
  const f=await fixture(t);await f.lock(f.ctx,()=>state(f,'ready'));
  await assert.rejects(f.lock({runtimeRoot:f.ctx.runtimeRoot},()=>assert.fail('installer entered')),{code:pending});
  const before=await snapshot(f.root);await assert.rejects(f.lock(f.ctx,()=>assert.fail('writer entered')),{code:pending});assert.deepEqual(await snapshot(f.root),before);
});
test('an existing native lock holder blocks source BEGIN before its pending event is reserved',async t=>{
  assert.equal((await import('../scripts/lib/mhc-native-runner.mjs')).nativeSourceGuardVersion,'native-source-exclusion/v1');
  const f=await fixture(t);let entered,release;
  const ready=new Promise(resolve=>{entered=resolve;}),hold=new Promise(resolve=>{release=resolve;});
  const native=f.lock(f.ctx,async()=>{entered();await hold;});await ready;
  try {
    await assert.rejects(f.lock(f.ctx,()=>state(f,'ready'),{readOnly:true}),/Another native runner operation is active/);
    assert.equal((await f.journal.load()).length,0);
  } finally {release();await native;}
  await f.lock(f.ctx,()=>state(f,'ready'),{readOnly:true});await assert.rejects(f.lock(f.ctx,()=>assert.fail('later writer entered')),{code:pending});
});
for(const damage of ['missing-state','bad-json','bad-hash','bad-sequence','wrong-previous','unexpected-file','event-directory'])test(`existing supervisor ${damage} fails closed without repair`,async t=>{
  const f=await fixture(t,{journal:damage!=='missing-state'}),supervisorRoot=path.dirname(f.stateRoot),eventsRoot=path.join(f.stateRoot,'events');
  if(damage==='missing-state')await mkdir(supervisorRoot,{recursive:true});
  else {
    await state(f,'complete');const file=path.join(eventsRoot,'000000001.json');
    if(damage==='bad-json')await writeFile(file,'{broken');
    else if(damage==='unexpected-file')await writeFile(path.join(eventsRoot,'unknown.json'),'{}');
    else if(damage==='event-directory'){await rm(file);await mkdir(file);}
    else {const event=JSON.parse(await readFile(file));if(damage==='bad-hash')event.sha256='f'.repeat(64);
      else {if(damage==='bad-sequence')event.sequence=2;else event.previous='f'.repeat(64);const {sha256,...body}=event;event.sha256=sha(jsonBytes(body));}await writeFile(file,jsonBytes(event));}
  }
  const before=await snapshot(f.root);await assert.rejects(f.guard(f.ctx),{code:invalid});assert.deepEqual(await snapshot(f.root),before);
});
for(const bad of [null,{},transaction('unknown'),{...transaction('complete'),phase:null},{...transaction('complete'),receipt:null}])test(`hash-valid malformed source state ${JSON.stringify(bad?.phase??bad)} cannot release exclusion`,async t=>{
  const f=await fixture(t);await f.journal.append('native_source_state',{transaction:bad});await assert.rejects(f.guard(f.ctx),{code:invalid});
});
test('inspection lock grants no bypass to direct Henry mutating interfaces or author preflight dispatch',async t=>{
  const f=await fixture(t);await state(f,'captured');const before=await snapshot(f.root);
  const service=await import('../scripts/lib/mhc-v2-service.mjs'),author=await import('../scripts/lib/mhc-v2-author-session.mjs');let calls=0;
  const attempts=[...['migrateCurrentV2','startV2','advanceV2','reopenReviewV2','reviewWorkOrderV2','editorialRepairV2','requestEditorialV2','applyReviewV2'].map(name=>()=>service[name](f.ctx)),
    ()=>service.serviceContext({...f.ctx,releaseRoot:path.resolve(__dirname,'..')}),
    ()=>import('../scripts/lib/mhc-native-runner.mjs').then(m=>m.startRunner(f.ctx,{})),
    ()=>import('../scripts/lib/mhc-native-runner.mjs').then(m=>m.advanceRunner(f.ctx,{})),
    ()=>author.runAuthorSession(f.ctx,{lane:'spark',codexExecutable:'fabricated-unused'},{run:()=>{calls++;assert.fail('model launched');}}),
    ()=>import('../scripts/lib/mhc-v2-client-upgrade.mjs').then(m=>m.recoverClientUpgrade(f.ctx)),
    ()=>import('../scripts/lib/mhc-v2-transport-recovery.mjs').then(m=>m.recoverUnstartedTransport(f.root))];
  await f.lock(f.ctx,async()=>{for(const attempt of attempts)await assert.rejects(attempt,{code:pending});},{readOnly:true});
  assert.equal(calls,0);assert.deepEqual(await snapshot(f.root),before);
});
test('pending source status observes partial input without creating missing job events',async t=>{
  const f=await fixture(t);await state(f,'ready');const {statusV2}=await import('../scripts/lib/mhc-v2-service.mjs'),{digestObject}=await import('../scripts/lib/mhc-v2.mjs');
  const jobRoot=path.join(f.root,'private-content/automation/mhc-v2'),directory=path.join(jobRoot,'FAB-PARTIAL-INPUT'),basis={reading_id:'FAB-PARTIAL-INPUT',chapters:[]};
  await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'input.json'),jsonBytes({...basis,input_sha256:digestObject(basis)}));const before=await snapshot(f.root);
  const result=await f.lock(f.ctx,()=>statusV2({...f.ctx,jobRoot}),{readOnly:true});
  assert.deepEqual(result.readings,[{readingId:'FAB-PARTIAL-INPUT',state:'initializing',published:false}]);assert.deepEqual(await snapshot(f.root),before);
});
test('pending source status and preflight context do not initialize an absent Henry job root',async t=>{
  const f=await fixture(t);await state(f,'prepared');const {serviceContext,statusV2}=await import('../scripts/lib/mhc-v2-service.mjs'),before=await snapshot(f.root);
  const context=await f.lock(f.ctx,()=>serviceContext({...f.ctx,releaseRoot:path.resolve(__dirname,'..')},{readOnly:true}),{readOnly:true});
  assert.deepEqual((await statusV2(context)).readings,[]);assert.deepEqual(await snapshot(f.root),before);
});
for(const command of ['work-order','prepare','apply','finalize'])test(`legacy reviewer ${command} owns the native lock until mutation completes and blocks later pending entry`,async t=>{
  const f=await fixture(t),releaseRoot=path.join(f.root,'fabricated-release'),runnerPath=path.resolve(__dirname,'../scripts/mhc-native-runner.mjs'),libraryRoot=path.resolve(__dirname,'../scripts/lib');
  await mkdir(path.join(releaseRoot,'scripts'),{recursive:true});await mkdir(path.join(releaseRoot,'schemas'));
  await writeFile(path.join(releaseRoot,'schemas/mhc-native-runner-checkpoint.schema.json'),'{}\n');
  const configPath=path.join(f.root,'fabricated-config.json'),effectPath=path.join(f.root,'private-commentary/mhc/fabricated-review-effect.json');
  await writeFile(configPath,jsonBytes({project_root:f.root,runtime_root:f.ctx.runtimeRoot,pipeline_version:'fabricated-v1'}));
  const worker=`import {existsSync,mkdirSync,writeFileSync} from 'node:fs';import path from 'node:path';
    const {withRunnerLock}=await import(${JSON.stringify(pathToFileURL(path.join(libraryRoot,'mhc-native-runner.mjs')).href)});
    const {openJournal}=await import(${JSON.stringify(pathToFileURL(path.join(libraryRoot,'service-supervisor-store.mjs')).href)});
    const projectRoot=process.cwd(),runtimeRoot=path.join(projectRoot,'private-content/automation/mhc-runtime');
    if(!existsSync(path.join(runtimeRoot,'runner.lock','owner.json')))throw Error('FABRICATED reviewer lacks native lock');
    const journal=await openJournal(path.join(projectRoot,'private-content/automation/service-supervisor/state'));let sourceBeginBlocked=false;
    try{await withRunnerLock({projectRoot,runtimeRoot},()=>journal.append('native_source_state',{transaction:${JSON.stringify(transaction('ready'))}}),{readOnly:true});}
    catch(error){if(!error.message.includes('Another native runner operation is active'))throw error;sourceBeginBlocked=true;}
    if(!sourceBeginBlocked)throw Error('FABRICATED competing source BEGIN entered');
    const effect=path.join(projectRoot,'private-commentary/mhc/fabricated-review-effect.json');mkdirSync(path.dirname(effect),{recursive:true});writeFileSync(effect,'FABRICATED canonical review effect');
    process.stdout.write(JSON.stringify({state:'fabricated_review_complete',sourceBeginBlocked})+'\\n');`;
  for(const name of ['mhc-native-review-work-order.mjs','mhc-native-worker.mjs'])await writeFile(path.join(releaseRoot,'scripts',name),worker);
  const invoke=()=>spawnSync(process.execPath,[runnerPath,'reviewer',command],{cwd:f.root,encoding:'utf8',windowsHide:true,env:{...process.env,MHC_NATIVE_RUNTIME_CONFIG:configPath,MHC_NATIVE_RELEASE_ROOT:releaseRoot,MHC_NATIVE_LAUNCHER:path.join(f.ctx.runtimeRoot,'fabricated-launcher.mjs'),MHC_NATIVE_MANIFEST_SHA256:'e'.repeat(64)}});
  const first=invoke();assert.equal(first.status,0,first.stderr);assert.equal(JSON.parse(first.stdout).sourceBeginBlocked,true);assert.equal((await f.journal.load()).length,0);assert.equal(await readFile(effectPath,'utf8'),'FABRICATED canonical review effect');
  await f.lock(f.ctx,()=>state(f,'ready'),{readOnly:true});const before=await snapshot(f.root),second=invoke();assert.equal(second.status,1);assert.match(second.stderr,new RegExp(pending));assert.deepEqual(await snapshot(f.root),before);
});
test('redirected supervisor ancestor fails closed',async t=>{
  const f=await fixture(t,{journal:false}),outside=await mkdtemp(path.join(os.tmpdir(),'fabricated-peer-outside-'));t.after(()=>rm(outside,{recursive:true,force:true}));
  const {symlink}=require('node:fs/promises');await symlink(outside,path.join(f.root,'private-content/automation/service-supervisor'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(f.guard(f.ctx),{code:invalid});assert.deepEqual(await readdir(outside),[]);
});
