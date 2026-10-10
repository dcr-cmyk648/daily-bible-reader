const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const modules=Promise.all([import('../scripts/lib/service-supervisor-contracts.mjs'),import('../scripts/lib/service-supervisor-preflight-recovery.mjs'),
  import('../scripts/lib/service-supervisor-daily.mjs'),import('../scripts/lib/service-supervisor-store.mjs'),import('../scripts/lib/rolling-study-work-order.mjs')]);
const root=path.resolve(__dirname,'..'),now=new Date('2026-10-10T21:29:25.730Z'),jobId='e1e14cd7fff6655f15cf4991db575d1b',originalSource='78357445c6e419816836883ba45dce0e115498ff';
const bibliography={sourceId:'FABRICATED-study-bible',title:'FABRICATED ESV Study Bible bibliography',authorOrOrganization:'FABRICATED publisher',
  edition:'FABRICATED bibliographic notice: copyright © 2008 Crossway, ESV Study Bible edition.',urlOrCitation:'https://example.org/fabricated-bibliography',includedReadings:[]};
const packet=()=>({policies:'FABRICATED policy: ESV translation decisions require source review; never store passage bodies.',existingSourceInventory:[structuredClone(bibliography)]});
test('only code-selected bibliography permits edition copyright; approved policy files and schema pass',async()=>{
  const [c]=await modules,p=packet();p.policies=Object.fromEntries(await Promise.all(['docs/EDITORIAL_STANCE.md','docs/CONTENT_AND_RIGHTS.md','docs/COMMENTARY_WORKFLOW.md','.agents/skills/draft-daily-commentary/SKILL.md'].map(async f=>[f,await fs.readFile(path.join(root,f),'utf8')])));
  p.sourceSchema=JSON.parse(await fs.readFile(path.join(root,'schemas/source.schema.json'))).$defs.source;
  c.assertResearchPacketPrivacy(p);assert.throws(()=>c.assertChildPrivacy(bibliography),/SCRIPTURE_REFUSED/);
  assert.throws(()=>c.assertResearchPacketPrivacy({...p,arbitrary:{edition:bibliography.edition}}),/SCRIPTURE_REFUSED/);
  assert.throws(()=>c.assertResearchPacketPrivacy({...p,existingSourceInventory:[{...bibliography,notes:'FABRICATED prose'}]}),/INVENTORY_INVALID/);
});
const passage='1 FABRICATED Scripture fixture row one contains no actual Bible text.\n2 FABRICATED Scripture fixture row two contains no actual Bible text.\n3 FABRICATED Scripture fixture row three contains no actual Bible text.';
for(const [label,value,code]of [
  ['numbered passage',passage,'SCRIPTURE'],['translation attribution','FABRICATED attribution: Scripture quotations are from the ESV; copyright © 2001 Crossway.','SCRIPTURE'],
  ['translation copyright','FABRICATED ESV text copyright © 2001 Crossway.','SCRIPTURE'],
  ['private URL','https://docs.google.com/document/d/FABRICATED_PRIVATE_RESOURCE','PRIVATE_DATA'],
  ['key','sk-FABRICATED01234567890123456789','PRIVATE_DATA'],['bearer','Bearer FABRICATED01234567890123456789','PRIVATE_DATA'],
  ['email','fabricated@example.invalid','PRIVATE_DATA']])test(`research bibliography and recursively encoded outputs refuse ${label}`,async()=>{
  const [c]=await modules,p=packet();p.existingSourceInventory[0].edition=value;
  assert.throws(()=>c.assertResearchPacketPrivacy(p),new RegExp(code+'_REFUSED'));
  for(const envelope of [value,{sourceJson:JSON.stringify({edition:value})},{metadataJson:JSON.stringify({markdown:value})},JSON.stringify(JSON.stringify({body:value})),
    JSON.stringify({body:value}).replaceAll('@','\\u0040')])assert.throws(()=>c.assertChildPrivacy(envelope),new RegExp(code+'_REFUSED'));
});
test('direct passage fields and nested JSON in bibliographic inventory cannot bypass content checks',async()=>{
  const [c]=await modules;assert.throws(()=>c.assertChildPrivacy({verseText:'FABRICATED single verse'}),/SCRIPTURE_REFUSED/);
  const p=packet();p.existingSourceInventory[0].edition=JSON.stringify({passageText:'FABRICATED one verse'});
  assert.throws(()=>c.assertResearchPacketPrivacy(p),/SCRIPTURE_REFUSED/);
});
test('review bibliography requires unchanged prior records; new sources and retained prose stay strict',async()=>{
  const [c]=await modules,source={...bibliography,notes:'FABRICATED retained non-Scripture notes'},prior={sources:[source]},review={registry:{sources:[structuredClone(source)]},markdown:'FABRICATED study'};
  c.assertDailyReviewPacketPrivacy(review,prior);
  assert.throws(()=>c.assertDailyReviewPacketPrivacy({...review,registry:{sources:[{...source,title:'FABRICATED changed'}]}},prior),/EXISTING_SOURCE_CHANGED/);
  assert.throws(()=>c.assertDailyReviewPacketPrivacy({...review,registry:{sources:[]}},prior),/EXISTING_SOURCE_CHANGED/);
  assert.throws(()=>c.assertDailyReviewPacketPrivacy(review,{sources:[]}),/SCRIPTURE_REFUSED/);
  const bad={...source,notes:passage};assert.throws(()=>c.assertDailyReviewPacketPrivacy({registry:{sources:[bad]}},{sources:[bad]}),/SCRIPTURE_REFUSED/);
  assert.throws(()=>c.assertDailyReviewPacketPrivacy({...review,metadataJson:JSON.stringify({text:passage})},prior),/SCRIPTURE_REFUSED/);
});
async function fixture(t,{alterJob=()=>{},extraEvents=[],jobOverride=jobId}={}) {
  const [c,recovery,daily,store,rolling]=await modules,projectRoot=await fs.mkdtemp(path.join(os.tmpdir(),'dbr-preflight-fabricated-'));
  t.after(async()=>{assert.equal(path.dirname(projectRoot),path.resolve(os.tmpdir()));assert.ok(path.basename(projectRoot).startsWith('dbr-preflight-fabricated-'));await fs.rm(projectRoot,{recursive:true,force:true});});
  const runtimeRoot=path.join(projectRoot,'runtime'),sourceRevision='b'.repeat(40),release=`${sourceRevision}-${'c'.repeat(16)}`,releaseRoot=path.join(runtimeRoot,'releases',release),stateRoot=path.join(projectRoot,'state');
  const names=['scripts/service-supervisor-launcher.mjs','fixtures/pilot-content/plan.json','fixtures/pilot-content/app-config.json',
    'config/active-calendar/celebration-bridge-long-term-active.json','schemas/source.schema.json','schemas/rolling-study-work-order.schema.json',
    'schemas/service-supervisor-daily-state.schema.json','docs/EDITORIAL_STANCE.md','docs/CONTENT_AND_RIGHTS.md','docs/COMMENTARY_WORKFLOW.md','.agents/skills/draft-daily-commentary/SKILL.md'],files=[];
  for(const name of names){const bytes=await fs.readFile(path.join(root,name));await store.durableWrite(releaseRoot,name,bytes);files.push({path:name,sha256:store.digest(bytes),bytes:bytes.length});}
  const config={stage:'C',maxReadingsPerWake:1,sourceRevision,runtimeRoot},manifest={schemaVersion:'service-supervisor-release/v1',sourceRevision,files},configBytes=store.jsonBytes(config),manifestBytes=store.jsonBytes(manifest),
    pointer={schemaVersion:'service-supervisor-pointer/v1',sourceRevision,release,configSha256:store.digest(configBytes),manifestSha256:store.digest(manifestBytes)};
  await store.durableWrite(releaseRoot,'manifest.json',manifestBytes);await store.durableWrite(runtimeRoot,`config-${pointer.configSha256}.json`,configBytes);
  await store.durableWrite(runtimeRoot,'current.json',store.jsonBytes(pointer));await store.durableWrite(runtimeRoot,'launcher.mjs',await fs.readFile(path.join(root,names[0])));
  const ctx={projectRoot,runtimeRoot,releaseRoot,stateRoot,config},read=async f=>JSON.parse(await fs.readFile(path.join(root,f))),plan=await read(names[3]),appConfig=await read(names[2]),protocol=await read('config/daily-study-protocol.json'),
    target=plan.entries.find(e=>e.readingId==='LTP-0028-GEN-016'),order=rolling.buildRollingStudyWorkOrder({plan,appConfig,protocol,today:'2026-10-10',issuedAt:now.toISOString()});
  // Code-only schedule fixture, selecting the actual missing chapter in the current horizon.
  order.reading=structuredClone(target);order.planExtensionRequired=true;
  const job={schemaVersion:'service-supervisor-daily-state/v1',id:jobOverride,readingId:target.readingId,phase:'queued',sourceRevision:originalSource,createdAt:now.toISOString(),
    research:null,draft:null,approvalPath:null,approvalSha256:null,authorSessionId:null,reviewerSessionId:null,contentSha256:null,metadataSha256:null,registrySha256:null,blocker:null},
    orderBytes=store.jsonBytes(order),registry={sources:[bibliography]},registryBytes=store.jsonBytes(registry);
  job.workOrder={path:'private-content/automation/staging/FABRICATED/order.json',sha256:store.digest(orderBytes)};
  await store.durableWrite(projectRoot,job.workOrder.path,orderBytes);
  const journal=await store.openJournal(stateRoot),lease=await journal.acquire('preparation',{now});
  await journal.append('daily_state',{job:structuredClone(job)},now,lease);
  job.baseRegistry={path:'research/working/FABRICATED-registry.json',sha256:store.digest(registryBytes)};await store.durableWrite(projectRoot,job.baseRegistry.path,registryBytes);
  await journal.append('daily_state',{job:structuredClone(job)},now,lease);
  job.phase='blocked';job.blocker={code:'SUPERVISOR_CHILD_SCRIPTURE_REFUSED'};alterJob(job);
  const event=await journal.append('daily_state',{job},now,lease);
  for(const [kind,data]of extraEvents)await journal.append(kind,data,now,lease);
  await journal.release(lease,now);
  const dependencies={foundation:async()=>({atoms:[{id:'FABRICATED-atom',text:'FABRICATED public-domain commentary fixture',sha256:store.digest(Buffer.from('FABRICATED public-domain commentary fixture'))}],verifiedAt:now.toISOString()})},
    input=await daily.dailyResearchPacket(ctx,{entry:target,order,job,priorRegistry:registry},dependencies),options={jobId:jobOverride,blockedEventSha256:event.sha256,packetSha256:store.digest(store.jsonBytes(input)),clock:()=>now};
  return {ctx,recovery,daily,store,journal,job,options,dependencies,pointer};
}
test('default runtime verifies awaited pinned launcher; one-use recovery preserves original history and never resets later failure',async t=>{
  const f=await fixture(t),before=(await f.journal.load()).filter(e=>e.kind==='daily_state'),result=await f.recovery.recoverGenesis16Preflight(f.ctx,f.options,f.dependencies);
  assert.equal(result.outcome,'recovered');assert.equal(result.dispatched,false);assert.equal(result.budgetReset,false);
  const after=(await f.journal.load()).filter(e=>e.kind==='daily_state');assert.deepEqual(after.slice(0,3),before);
  const job=after.at(-1).data.job;assert.deepEqual({...job,phase:f.job.phase,blocker:f.job.blocker,preflightRecovery:undefined},{...f.job,preflightRecovery:undefined});
  const proof=JSON.parse(await fs.readFile(path.join(f.ctx.projectRoot,job.preflightRecovery.path)));assert.equal(proof.priorChildDispatches,0);assert.equal(proof.packetBytesChanged,false);assert.deepEqual(proof.correctedRuntime,f.pointer);
  const lease=await f.journal.acquire('preparation',{now});await f.journal.append('execution_state',{execution:{id:'d'.repeat(32),jobId,readingId:f.job.readingId,phase:'failed'}},now,lease);
  await f.journal.append('daily_state',{job:{...job,phase:'blocked',blocker:{code:'FABRICATED_CHILD_FAILED'}}},now,lease);await f.journal.release(lease,now);
  const again=await f.recovery.recoverGenesis16Preflight(f.ctx,f.options,f.dependencies);assert.equal(again.outcome,'already_recovered');
  assert.equal((await f.daily.latestDailyJob(f.journal,f.job.readingId)).blocker.code,'FABRICATED_CHILD_FAILED');
  await assert.rejects(f.recovery.recoverGenesis16Preflight(f.ctx,{...f.options,packetSha256:'0'.repeat(64)},f.dependencies),/ALREADY_USED/);
});
test('default runtime refuses tampered launcher before any recovery state',async t=>{
  const f=await fixture(t);await fs.appendFile(path.join(f.ctx.runtimeRoot,'launcher.mjs'),'\n// FABRICATED tamper');
  await assert.rejects(f.recovery.recoverGenesis16Preflight(f.ctx,f.options,f.dependencies),/LAUNCHER_HASH_INVALID/);
  assert.equal((await f.daily.latestDailyJob(f.journal,f.job.readingId)).phase,'blocked');
});
test('different job from the same original source and reading is outside exact authorization',async t=>{
  const f=await fixture(t,{jobOverride:'a'.repeat(32)});
  await assert.rejects(f.recovery.recoverGenesis16Preflight(f.ctx,f.options,f.dependencies),/ARGUMENTS_INVALID/);
});
for(const [label,alterJob,extraEvents,code]of [
  ['accepted child',()=>{},[['execution_state',{execution:{id:'d'.repeat(32),jobId,phase:'accepted'}}]],'DISPATCH_EXISTS'],
  ['failed child',()=>{},[['execution_state',{execution:{id:'d'.repeat(32),jobId,phase:'failed'}}]],'DISPATCH_EXISTS'],
  ['source fetch reservation',()=>{},[['source_fetch_reserved',{jobId,readingId:'LTP-0028-GEN-016'}]],'DISPATCH_EXISTS'],
  ['repair reservation',()=>{},[['daily_repair_reserved',{jobId}]],'DISPATCH_EXISTS'],
  ['publication',()=>{},[['publication_state',{transaction:{id:'d'.repeat(32),readingId:'LTP-0028-GEN-016',phase:'complete'}}]],'DISPATCH_EXISTS'],
  ['research artifact',j=>{j.research={path:'FABRICATED',sha256:'d'.repeat(64)};},[],'INELIGIBLE'],
  ['wrong typed blocker',j=>{j.blocker.code='SUPERVISOR_CHILD_PRIVATE_DATA_REFUSED';},[],'INELIGIBLE'],
  ['different source',j=>{j.sourceRevision='d'.repeat(40);},[],'INELIGIBLE']
])test(`zero-dispatch recovery refuses ${label}`,async t=>{
  const f=await fixture(t,{alterJob,extraEvents});await assert.rejects(f.recovery.recoverGenesis16Preflight(f.ctx,f.options,f.dependencies),new RegExp(code));
  assert.equal((await f.daily.latestDailyJob(f.journal,f.job.readingId)).phase,'blocked');
});
test('changed event, packet or work-order bytes cannot authorize recovery',async t=>{
  const f=await fixture(t);await assert.rejects(f.recovery.recoverGenesis16Preflight(f.ctx,{...f.options,blockedEventSha256:'d'.repeat(64)},f.dependencies),/INELIGIBLE/);
  await assert.rejects(f.recovery.recoverGenesis16Preflight(f.ctx,{...f.options,packetSha256:'d'.repeat(64)},f.dependencies),/BASIS_CHANGED/);
  await fs.appendFile(path.join(f.ctx.projectRoot,f.job.workOrder.path),' ');await assert.rejects(f.recovery.recoverGenesis16Preflight(f.ctx,f.options,f.dependencies),/BASIS_CHANGED/);
});
test('pending child and publication are global recovery guards',async t=>{
  for(const [kind,data,code]of [['execution_state',{execution:{id:'d'.repeat(32),jobId:'f'.repeat(32),phase:'reserved'}},'CHILD_PENDING'],
    ['publication_state',{transaction:{id:'d'.repeat(32),readingId:'FABRICATED-OTHER',phase:'uploading'}},'PUBLICATION_PENDING']]) {
    const f=await fixture(t,{extraEvents:[[kind,data]]});await assert.rejects(f.recovery.recoverGenesis16Preflight(f.ctx,f.options,f.dependencies),new RegExp(code));
  }
});
test('native job existence, later daily state and changed recovery proof cannot reopen authority',async t=>{
  const f=await fixture(t);await fs.mkdir(path.join(f.ctx.projectRoot,'private-content/automation/mhc-v2',f.job.readingId),{recursive:true});
  await assert.rejects(f.recovery.validateGenesis16Preflight(f.ctx,{...f.options,journal:f.journal,now},f.dependencies),/DISPATCH_EXISTS/);
  const g=await fixture(t),lease=await g.journal.acquire('preparation',{now});await g.journal.append('daily_state',{job:g.job},now,lease);await g.journal.release(lease,now);
  await assert.rejects(g.recovery.recoverGenesis16Preflight(g.ctx,g.options,g.dependencies),/INELIGIBLE/);
  const h=await fixture(t);await h.recovery.recoverGenesis16Preflight(h.ctx,h.options,h.dependencies);
  const current=await h.daily.latestDailyJob(h.journal,h.job.readingId);await fs.appendFile(path.join(h.ctx.projectRoot,current.preflightRecovery.path),' ');
  await assert.rejects(h.recovery.recoverGenesis16Preflight(h.ctx,h.options,h.dependencies),/BASIS_CHANGED/);
});
