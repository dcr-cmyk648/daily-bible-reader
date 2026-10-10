const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const modules=Promise.all([import('../scripts/lib/service-supervisor-daily.mjs'),import('../scripts/lib/service-supervisor-store.mjs'),
  import('../scripts/lib/rolling-study-work-order.mjs'),import('../scripts/lib/service-supervisor-publication-gates.mjs')]);
const now=new Date('2026-10-10T16:00:00Z'),releaseRoot=path.resolve(__dirname,'..');
async function fixture(t) {
  const [daily,store,rolling,gates]=await modules,root=await fs.mkdtemp(path.join(os.tmpdir(),'dbr-daily-fabricated-'));
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('dbr-daily-fabricated-'));await fs.rm(root,{recursive:true,force:true});});
  const read=async file=>JSON.parse(await fs.readFile(path.join(releaseRoot,file))),plan=await read('config/active-calendar/celebration-bridge-long-term-active.json'),
    appConfig=await read('fixtures/pilot-content/app-config.json'),protocol=await read('config/daily-study-protocol.json'),
    order=rolling.buildRollingStudyWorkOrder({plan,appConfig,protocol,today:'2026-10-10',issuedAt:now.toISOString()}),readingId=order.reading.readingId,
    stateRoot=path.join(root,'state'),ctx={projectRoot:root,releaseRoot,stateRoot,config:{sourceRevision:'a'.repeat(40)}};
  const journal=await store.openJournal(stateRoot),lease=await journal.acquire('preparation',{now,durationMs:90*60*1000}),
    job={schemaVersion:'service-supervisor-daily-state/v1',id:'b'.repeat(32),readingId,phase:'approved',sourceRevision:'a'.repeat(40),createdAt:now.toISOString()};
  const stage=`private-content/automation/staging/${readingId}/supervisor`,workOrderBytes=store.jsonBytes(order);
  job.workOrder={path:`${stage}/order.json`,sha256:store.digest(workOrderBytes)};await store.durableWrite(root,job.workOrder.path,workOrderBytes);
  const contentPath=`private-content/bridge/celebration-y3q4/${readingId}.md`,metadataPath=contentPath.replace(/\.md$/,'.metadata.json'),
    registryPath='research/working/bridge-source-registry.json',inputRoot=path.join(stateRoot,'daily-inputs',job.id),
    content=Buffer.from('FABRICATED non-Scripture study'),metadata=store.jsonBytes({label:'FABRICATED metadata'}),
    prior=store.jsonBytes({label:'FABRICATED original registry'}),registry=store.jsonBytes({label:'FABRICATED approved registry'});
  await store.durableWrite(inputRoot,contentPath,content);await store.durableWrite(inputRoot,metadataPath,metadata);
  await store.durableWrite(inputRoot,registryPath,registry);await store.durableWrite(root,registryPath,prior);
  job.contentSha256=store.digest(content);job.metadataSha256=store.digest(metadata);job.registrySha256=store.digest(registry);
  job.draft={inputRoot,contentPath,metadataPath,contentSha256:job.contentSha256,metadataSha256:job.metadataSha256,registrySha256:job.registrySha256,
    priorRegistrySha256:store.digest(prior),originalContentSha256:null,originalMetadataSha256:null};
  const approval={schemaVersion:'supervisor-editorial-approval/v1',readingId,status:'approved',contentSha256:job.contentSha256,
    metadataSha256:job.metadataSha256,registrySha256:job.registrySha256,authorSessionId:'c'.repeat(32),reviewerSessionId:'d'.repeat(32),
    reviewedAt:now.toISOString(),findings:['FABRICATED independent review'],assertions:Object.fromEntries(gates.DAILY_REVIEW_ASSERTIONS.map(k=>[k,true]))};
  const bytes=store.jsonBytes(approval);job.approvalPath=`${stage}/approval.json`;job.approvalSha256=store.digest(bytes);
  await store.durableWrite(root,job.approvalPath,bytes);await journal.append('daily_state',{job},now,lease);
  return {daily,store,ctx,journal,lease,job,order,now,registryPath};
}
test('approved daily resume completes partial private inputs and returns identical request without authors',async t=>{
  const f=await fixture(t);let writes=0;
  await assert.rejects(f.daily.runDailyWork(f.ctx,{journal:f.journal,lease:f.lease,order:f.order,deadline:now.getTime()+3600000},
    {clock:()=>now,child:()=>{throw Error('must not dispatch');},promote:async(...args)=>{if(++writes===2)throw Error('FABRICATED host crash');return f.store.durableWrite(...args);}}),/host crash/);
  assert.equal((await f.daily.latestDailyJob(f.journal,f.job.readingId)).phase,'approved');
  const a=await f.daily.runDailyWork(f.ctx,{journal:f.journal,lease:f.lease,order:f.order,deadline:now.getTime()+3600000},{clock:()=>now});
  const b=await f.daily.runDailyWork(f.ctx,{journal:f.journal,lease:f.lease,order:f.order,deadline:now.getTime()+3600000},{clock:()=>now});
  assert.equal(a.action,'publish_required');assert.equal(a.requestPath,b.requestPath);
  assert.equal(f.store.digest(await fs.readFile(path.join(f.ctx.projectRoot,f.registryPath))),f.job.registrySha256);
});
test('daily promotion refuses changed private inputs, altered approved bytes and revoked journal authority',async t=>{
  const f=await fixture(t);await f.store.durableWrite(f.ctx.projectRoot,f.job.draft.contentPath,Buffer.from('FABRICATED competing draft'));
  await assert.rejects(f.daily.promoteApprovedDaily(f.ctx,f),/PROMOTION_CONFLICT/);
  const g=await fixture(t);await fs.appendFile(path.join(g.job.draft.inputRoot,g.job.draft.contentPath),'FABRICATED tamper');
  await assert.rejects(g.daily.promoteApprovedDaily(g.ctx,g),/INPUT_CHANGED/);
  const h=await fixture(t);await h.journal.append('daily_state',{job:{...h.job,phase:'blocked'}},now,h.lease);
  await assert.rejects(h.daily.promoteApprovedDaily(h.ctx,h),/APPROVAL_REVOKED/);
});
