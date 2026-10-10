const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const now=new Date('2026-10-10T14:00:00Z');
const modules=Promise.all(['service-supervisor-publication','service-supervisor-store','service-supervisor-runtime',
  'service-supervisor-publication-gates'].map(name=>import(`../scripts/lib/${name}.mjs`)));
const ids=Array.from({length:8},(_,i)=>`FABRICATED-${i}`);
const permissions=[{id:'FABRICATED-OWNER',type:'user',role:'owner',emailAddress:'fabricated@example.invalid'}];
const original=()=>({schemaVersion:'private-manifest/v1',appConfigFileId:'FABRICATED-CONFIG',planFileId:'FABRICATED-PLAN',
  sourceRegistryFileId:'FABRICATED-REGISTRY',readings:{[ids[0]]:{contentFileId:'FABRICATED-OLD-CONTENT',metadataFileId:'FABRICATED-OLD-METADATA'}},
  preparationStatus:{schemaVersion:'preparation-status/v1',state:'running',updatedAt:now.toISOString(),
    lanes:{review:{lastAttemptAt:now.toISOString(),lastOutcome:'error',lastErrorCode:'FABRICATED_REVIEW_FAILURE'}}}});
async function fixture(t) {
  const [publisher,store,runtime,gates]=await modules,root=await fs.mkdtemp(path.join(os.tmpdir(),'dbr-publication-fabricated-'));
  t.after(async()=>{assert.ok(path.dirname(root)===path.resolve(os.tmpdir())&&path.basename(root).startsWith('dbr-publication-fabricated-'));await fs.rm(root,{recursive:true,force:true});});
  const releaseRoot=path.join(root,'release'),stateRoot=path.join(root,'private-content/automation/service-supervisor/state');
  for(const d of ['private-content/bridge/celebration-y3q4','private-commentary','research/raw','research/working','release/fixtures/pilot-content','release/config','release/schemas'])await fs.mkdir(path.join(root,d),{recursive:true});
  const write=async(relative,value)=>{const target=path.join(root,relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,Buffer.isBuffer(value)?value:store.jsonBytes(value));};
  await write('private-content/private-manifest.json',original());
  const active={planVersion:'FABRICATED-PLAN',bookMetrics:{},entries:ids.map((readingId,i)=>({readingId,dayIndex:i+1,planVersion:'FABRICATED-PLAN',kind:'book_intro'}))};
  active.calendarRevision=store.digest(Buffer.from(JSON.stringify(active.entries)));
  await write('release/config/active-calendar/celebration-bridge-long-term-active.json',active);
  await write('release/fixtures/pilot-content/plan.json',{...active,entries:active.entries.slice(0,1)});
  await write('release/fixtures/pilot-content/app-config.json',{sharedStartDate:'2026-10-10',futureLookaheadDays:7,testingReadingIds:[ids[0]]});
  await write('release/config/daily-study-protocol.json',JSON.parse(await fs.readFile(path.join(__dirname,'../config/daily-study-protocol.json'),'utf8')));
  await write('release/schemas/service-supervisor-editorial-approval.schema.json',JSON.parse(await fs.readFile(path.join(__dirname,'../schemas/service-supervisor-editorial-approval.schema.json'),'utf8')));
  const sharing=publisher.permissionsDigest({permissions});
  const resources={manifest:{fileId:'FABRICATED-MANIFEST',mimeType:'application/json',parents:['FABRICATED-FOLDER'],permissionsSha256:sharing},
    folder:{fileId:'FABRICATED-FOLDER',mimeType:'application/vnd.google-apps.folder',parents:[],permissionsSha256:sharing}};
  const ctx={projectRoot:root,releaseRoot,stateRoot,config:{stage:'B',sourceRevision:'a'.repeat(40),publicationResources:resources}};
  const metadata=expected=>({id:expected.fileId,mimeType:expected.mimeType,parents:expected.parents,permissions,trashed:false});
  const request={schemaVersion:'supervisor-publication-request/v1',readingId:ids[0],component:'daily',
    approvalPath:`private-content/automation/staging/${ids[0]}/approval.json`,approvalSha256:''};
  await write(request.approvalPath,{label:'FABRICATED approval used only by injected protocol tests'});
  request.approvalSha256=store.digest(await fs.readFile(path.join(root,request.approvalPath)));
  const prose=Buffer.from('FABRICATED Scripture-free commentary.\r\n'),meta={readingId:ids[0],commentaryVersion:'FABRICATED-1',
    generation:{humanReviewStatus:'in_review',contentHash:store.digest(prose),contentProtocolVersion:'daily-study-protocol/v1'},
    componentAssessments:{historicalContext:{status:'not_material',rationale:'FABRICATED context assessment with no real historical claim.'}}};
  await write(`private-content/bridge/celebration-y3q4/${ids[0]}.md`,prose);
  await write(`private-content/bridge/celebration-y3q4/${ids[0]}.metadata.json`,meta);
  await write('research/working/bridge-source-registry.json',{label:'FABRICATED registry for protocol-only injection'});
  const artifacts=await Promise.all([['content',`private-content/bridge/celebration-y3q4/${ids[0]}.md`,'text/markdown'],
    ['metadata',`private-content/bridge/celebration-y3q4/${ids[0]}.metadata.json`,'application/json']].map(async([slot,relative,mimeType])=>{
    const bytes=await fs.readFile(path.join(root,relative));return {slot,path:relative,mimeType,sha256:store.digest(bytes),bytes:bytes.length,name:`FABRICATED-${slot}-${store.digest(bytes)}.json`};}));
  const health={status:'ready',effectiveDate:'2026-10-10',target:8,readingIds:ids,missingPreparedReadingIds:[],missingPayloadReadingIds:[],componentFailures:[],
    currentHorizonHenryLayer:{status:'complete',fallbackReadingIds:[],unavailableReadingIds:[]}};
  // Protocol-only injection is explicit. Separate tests exercise real native
  // event-chain authority and revocation with immutable approval bytes.
  const dependencies={verifyApproval:async()=>({kind:'FABRICATED_PROTOCOL_ONLY'}),
    admit:async()=>({approval:{path:request.approvalPath,sha256:request.approvalSha256},artifacts}),health:async(_,tx)=>{
    const candidate=JSON.parse(await fs.readFile(path.join(stateRoot,tx.candidate.path)));
    return {named:{readingId:ids[0],status:'ready',henryLayerStatus:'complete'},health,preparationStatus:candidate.preparationStatus,
      payloadBinding:{contentSha256:meta.generation.contentHash,commentaryVersion:meta.commentaryVersion,runtimeSha256:[]}};
  }};
  const heartbeat={state:'running',summary:'FABRICATED health observed',action:'',heartbeat:{lane:'daily',lastOutcome:'no_op',lastErrorCode:'',buffer:{
    schemaVersion:'service-buffer/v1',effectiveDate:'2026-10-10',readingIds:ids,devotionalGaps:[],henryGaps:[],fallbackReadingIds:[],measurementComplete:true}}};
  let live=store.jsonBytes(original()),uploads=new Map(),dispatched=[],readCount=0;
  async function step(handoff,override={},deps=dependencies) {
    const dispatch=await publisher.dispatchPublication(ctx,handoff.transactionId,handoff.operationId,{now},deps);
    const op=dispatch.authorizedOperation;dispatched.push(op);let receipt={operationId:op.operationId,operationSha256:handoff.operationSha256,
      dispatchEpoch:dispatch.dispatchEpoch,outcome:'success'};
    if(op.tool==='google_drive_get_file_metadata') {
      const resource=op.args.fileId===resources.manifest.fileId?resources.manifest:op.args.fileId===resources.folder.fileId?resources.folder:
        {fileId:op.args.fileId,mimeType:uploads.get(op.args.fileId).mimeType,parents:[resources.folder.fileId]};
      receipt.metadata=metadata(resource);
    } else if(op.tool==='google_drive_upload_file') {
      const fileId=`FABRICATED-UPLOADED-${uploads.size}`;uploads.set(fileId,{bytes:await fs.readFile(op.args.file_uri),mimeType:op.args.mime_type,name:op.args.file_name});receipt.fileId=fileId;
    } else if(op.tool==='google_drive_update_file') {live=await fs.readFile(op.args.file_uri);receipt.fileId=resources.manifest.fileId;}
    else if(op.tool==='google_drive_fetch') {
      const fileId=op.args.url.split('/')[5],bytes=fileId===resources.manifest.fileId?live:uploads.get(fileId).bytes;
      const name=`FABRICATED-${++readCount}.bin`;await write(`private-content/automation/service-supervisor/state/publications/${handoff.transactionId}/downloads/${name}`,bytes);
      receipt.rawPath=name;receipt.rawSha256=store.digest(bytes);
    } else if(op.tool==='google_drive_search')receipt.files=[...uploads.entries()].map(([id,f])=>({id,name:f.name})).filter(f=>op.args.special_filter_query_str.includes(f.name));
    receipt={...receipt,...override};return publisher.resumePublication(ctx,handoff.transactionId,receipt,{now},deps);
  }
  async function drain(handoff,deps=dependencies) {
    for(let i=0;i<35&&handoff.action==='dispatch_required';i++)handoff=await step(handoff,{},deps);
    return handoff;
  }
  return {publisher,store,runtime,gates,ctx,root,resources,request,dependencies,heartbeat,metadata,artifacts,write,step,drain,uploads,dispatched,
    getLive:()=>live,setLive:bytes=>{live=bytes;}};
}

test('status publication merges fresh lane state and preserves every reading pointer through exact raw readback',async t=>{
  const f=await fixture(t),before=original().readings;
  const started=await f.publisher.beginPublication(f.ctx,{role:'preparation',heartbeat:f.heartbeat,now});
  const done=await f.drain(started);
  assert.equal(done.outcome,'complete');assert.equal(done.published,false);assert.equal(done.heartbeatDelivered,true);assert.equal(done.readerVisible,true);
  const value=JSON.parse(f.getLive());assert.deepEqual(value.readings,before);assert.equal(value.preparationStatus.state,'blocked');
  assert.equal(value.preparationStatus.lanes.review.lastErrorCode,'FABRICATED_REVIEW_FAILURE');assert.equal(value.preparationStatus.lanes.daily.lastOutcome,'no_op');
});
test('content-first immutable versions require metadata/raw checks; upload acknowledgement alone is unpublished',async t=>{
  const f=await fixture(t);let next=await f.publisher.beginPublication(f.ctx,{role:'review-audit',request:f.request,now},f.dependencies);
  while(next.action==='dispatch_required') {
    const op=JSON.parse(await fs.readFile(next.operationPath));next=await f.step(next);
    if(op.purpose==='version_upload')assert.equal(next.published,false);
  }
  assert.equal(next.published,true);assert.equal(f.uploads.size,2);
  const purposes=f.dispatched.map(o=>o.purpose),pointer=purposes.indexOf('manifest_update');
  assert.ok(pointer>purposes.lastIndexOf('version_readback'));assert.equal(purposes.filter(x=>x==='manifest_update').length,1);
  assert.deepEqual(JSON.parse(f.getLive()).readings[ids[0]],{contentFileId:'FABRICATED-UPLOADED-0',metadataFileId:'FABRICATED-UPLOADED-1'});
});
test('dispatch intent survives a lost receipt and stale operation/epoch replay is rejected',async t=>{
  const f=await fixture(t),start=await f.publisher.beginPublication(f.ctx,{role:'preparation',heartbeat:f.heartbeat,now});
  const dispatch=await f.publisher.dispatchPublication(f.ctx,start.transactionId,start.operationId,{now});
  assert.equal((await f.publisher.publicationHandoff(f.ctx,start.transactionId)).action,'await_receipt');
  await assert.rejects(f.publisher.dispatchPublication(f.ctx,start.transactionId,start.operationId,{now}),/REPLAY_REFUSED/);
  await assert.rejects(f.publisher.resumePublication(f.ctx,start.transactionId,{operationId:start.operationId,operationSha256:start.operationSha256,
    dispatchEpoch:dispatch.dispatchEpoch+1,outcome:'success'},{now}),/RECEIPT_BINDING_INVALID/);
  await assert.rejects(f.publisher.beginPublication(f.ctx,{role:'review-audit',heartbeat:{...f.heartbeat,heartbeat:{...f.heartbeat.heartbeat,lane:'review'}},now}),/PUBLICATION_PENDING/);
  await assert.rejects(f.runtime.assertNoWriters(f.root,f.ctx.stateRoot,{now}),/INSTALL_PUBLICATION_PENDING/);
});
test('unrelated remote reading changes survive bounded rebase while same-reading conflicts stop pointer mutation',async t=>{
  const f=await fixture(t);let next=await f.publisher.beginPublication(f.ctx,{role:'review-audit',request:f.request,now},f.dependencies),changed=false;
  while(next.action==='dispatch_required') {
    const op=JSON.parse(await fs.readFile(next.operationPath));
    if(op.purpose==='manifest_before_update'&&!changed) {const m=JSON.parse(f.getLive());m.readings[ids[1]]={contentFileId:'FABRICATED-OTHER-CONTENT',metadataFileId:'FABRICATED-OTHER-METADATA'};f.setLive(f.store.jsonBytes(m));changed=true;}
    next=await f.step(next);
  }
  assert.equal(next.published,true);assert.equal(JSON.parse(f.getLive()).readings[ids[1]].contentFileId,'FABRICATED-OTHER-CONTENT');
  const g=await fixture(t);let conflict=await g.publisher.beginPublication(g.ctx,{role:'review-audit',request:g.request,now},g.dependencies);
  while(conflict.action==='dispatch_required') {
    const op=JSON.parse(await fs.readFile(conflict.operationPath));
    if(op.purpose==='manifest_before_update') {const m=JSON.parse(g.getLive());m.readings[ids[0]].metadataFileId='FABRICATED-NEWER-METADATA';g.setLive(g.store.jsonBytes(m));
      await assert.rejects(g.step(conflict),/SAME_READING_CONFLICT/);break;}
    conflict=await g.step(conflict);
  }
  assert.equal(g.dispatched.some(o=>o.purpose==='manifest_update'),false);
});
test('CRLF normalized text is not raw readback and changed approval bytes block dispatch',async t=>{
  const f=await fixture(t);let next=await f.publisher.beginPublication(f.ctx,{role:'review-audit',request:f.request,now},f.dependencies);
  while(next.action==='dispatch_required') {
    const op=JSON.parse(await fs.readFile(next.operationPath));
    if(op.purpose==='version_readback') {const uploaded=f.uploads.get('FABRICATED-UPLOADED-0');uploaded.bytes=Buffer.from(uploaded.bytes.toString().replace(/\r\n/g,'\n'));
      await assert.rejects(f.step(next),/VERSION_READBACK_MISMATCH/);break;}
    next=await f.step(next);
  }
  assert.equal(f.dispatched.some(o=>o.purpose==='manifest_update'),false);
  await assert.rejects(f.publisher.beginPublication(f.ctx,{role:'review-audit',request:f.request,now},f.dependencies),/BLOCK_RETAINED/);
  const g=await fixture(t),start=await g.publisher.beginPublication(g.ctx,{role:'review-audit',request:g.request,now},g.dependencies);
  await fs.appendFile(path.join(g.root,g.request.approvalPath),' ');
  await assert.rejects(g.publisher.dispatchPublication(g.ctx,start.transactionId,start.operationId,{now}),/APPROVAL_CHANGED/);
});
test('uncertain new version is reconciled by exact name/metadata/hash without a second create',async t=>{
  const f=await fixture(t);let next=await f.publisher.beginPublication(f.ctx,{role:'review-audit',request:f.request,now},f.dependencies);
  while(next.action==='dispatch_required') {
    const op=JSON.parse(await fs.readFile(next.operationPath));
    if(op.purpose==='version_upload') {next=await f.step(next,{outcome:'uncertain'});break;}
    next=await f.step(next);
  }
  assert.equal(next.outcome,'reconciliation_required');assert.equal(next.published,false);
  const resumed=await f.publisher.reconcilePublication(f.ctx,next.transactionId,{now});
  assert.equal(JSON.parse(await fs.readFile(resumed.operationPath)).purpose,'version_search');
  const done=await f.drain(resumed);assert.equal(done.published,true);assert.equal(f.dispatched.filter(o=>o.purpose==='version_upload').length,2);
});
test('uncertain pointer write only reads/reconciles its exact candidate and cannot replay the mutation',async t=>{
  const f=await fixture(t);let next=await f.publisher.beginPublication(f.ctx,{role:'preparation',heartbeat:f.heartbeat,now});
  while(next.action==='dispatch_required') {
    const op=JSON.parse(await fs.readFile(next.operationPath));
    if(op.purpose==='manifest_update') {next=await f.step(next,{outcome:'uncertain'});break;}
    next=await f.step(next);
  }
  assert.equal(next.outcome,'reconciliation_required');next=await f.publisher.reconcilePublication(f.ctx,next.transactionId,{now});
  assert.equal((await f.drain(next)).outcome,'complete');assert.equal(f.dispatched.filter(o=>o.purpose==='manifest_update').length,1);
});
test('sharing drift/denial fail first wake; exact temporary read failure receives at most one retry',async t=>{
  const f=await fixture(t),start=await f.publisher.beginPublication(f.ctx,{role:'preparation',heartbeat:f.heartbeat,now});
  const changed=f.metadata(f.resources.manifest);changed.permissions=[...permissions,{id:'FABRICATED-PUBLIC',type:'anyone',role:'reader'}];
  await assert.rejects(f.step(start,{metadata:changed}),/SHARING_UNSAFE/);
  assert.equal(f.dispatched.some(o=>o.write),false);
  const g=await fixture(t),denied=await g.publisher.beginPublication(g.ctx,{role:'preparation',heartbeat:g.heartbeat,now});
  assert.equal((await g.step(denied,{outcome:'denied'})).code,'SUPERVISOR_CONNECTOR_DENIED');
  const h=await fixture(t),read=await h.publisher.beginPublication(h.ctx,{role:'preparation',heartbeat:h.heartbeat,now});
  const retry=await h.step(read,{outcome:'error',code:'SUPERVISOR_CONNECTOR_TRANSPORT'});assert.equal(retry.action,'dispatch_required');
  const done=await h.step(retry,{outcome:'error',code:'SUPERVISOR_CONNECTOR_TRANSPORT'});assert.equal(done.outcome,'blocked');assert.equal(h.dispatched.length,2);
});
test('matching raw manifest cannot claim health completion from a stale payload; retry rechecks remote bytes',async t=>{
  const f=await fixture(t),started=await f.publisher.beginPublication(f.ctx,{role:'review-audit',request:f.request,now},f.dependencies);
  const bad={...f.dependencies,health:async(...args)=>({...await f.dependencies.health(...args),payloadBinding:{contentSha256:'b'.repeat(64)}})};
  const failed=await f.drain(started,bad);assert.equal(failed.outcome,'health_pending');assert.equal(failed.published,false);assert.equal(failed.manifestDelivered,true);
  const retry=await f.publisher.retryPublicationHealth(f.ctx,failed.transactionId,{now});
  assert.equal(JSON.parse(await fs.readFile(retry.operationPath)).purpose,'manifest_after_metadata');assert.equal((await f.drain(retry)).published,true);
});
test('old backend heartbeat visibility debt does not stop verified private content publication',async t=>{
  const f=await fixture(t),start=await f.publisher.beginPublication(f.ctx,{role:'review-audit',request:f.request,now},f.dependencies);
  const stripped={...f.dependencies,health:async(...args)=>({...await f.dependencies.health(...args),preparationStatus:{state:'running'}})};
  const done=await f.drain(start,stripped);assert.equal(done.published,true);assert.equal(done.readerVisible,false);
  assert.equal(done.heartbeatStored,true);assert.equal(done.heartbeatDelivered,false);
  assert.equal(done.code,'SUPERVISOR_HEARTBEAT_NOT_READER_VISIBLE');
  const g=await fixture(t),other=await g.publisher.beginPublication(g.ctx,{role:'review-audit',request:g.request,now},g.dependencies);
  const partial={...g.dependencies,health:async(...args)=>{
    const proof=await g.dependencies.health(...args),status=proof.preparationStatus;
    return {...proof,preparationStatus:{schemaVersion:status.schemaVersion,state:status.state,updatedAt:status.updatedAt,
      lastRunAt:status.lastRunAt,summary:status.summary,action:status.action}};
  }};
  const incomplete=await g.drain(other,partial);
  assert.equal(incomplete.published,true);assert.equal(incomplete.heartbeatStored,true);assert.equal(incomplete.heartbeatDelivered,false);
  assert.equal(incomplete.readerVisible,false);assert.equal(incomplete.code,'SUPERVISOR_HEARTBEAT_NOT_READER_VISIBLE');
});
test('production daily admission requires exact independent approval and full source/private validation',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.gates.admitPublication(f.ctx,f.request,{now,transactionId:'c'.repeat(32)}),/schema|Independent daily approval/i);
  const approval={schemaVersion:'supervisor-editorial-approval/v1',readingId:ids[0],status:'approved',contentSha256:f.artifacts[0].sha256,
    metadataSha256:f.artifacts[1].sha256,registrySha256:f.store.digest(await fs.readFile(path.join(f.root,'research/working/bridge-source-registry.json'))),
    authorSessionId:'a'.repeat(32),reviewerSessionId:'a'.repeat(32),reviewedAt:now.toISOString(),findings:['FABRICATED audit finding'],
    assertions:Object.fromEntries(f.gates.DAILY_REVIEW_ASSERTIONS.map(k=>[k,true]))};
  await f.write(f.request.approvalPath,approval);f.request.approvalSha256=f.store.digest(await fs.readFile(path.join(f.root,f.request.approvalPath)));
  await assert.rejects(f.gates.admitPublication(f.ctx,f.request,{now,transactionId:'c'.repeat(32)}),/DAILY_APPROVAL_INVALID/);
  approval.reviewerSessionId='b'.repeat(32);await f.write(f.request.approvalPath,approval);f.request.approvalSha256=f.store.digest(await fs.readFile(path.join(f.root,f.request.approvalPath)));
  await assert.rejects(f.gates.admitPublication(f.ctx,f.request,{now,transactionId:'c'.repeat(32)}),/DAILY_CURRENT_APPROVAL_MISSING/);
  await (await f.store.openJournal(f.ctx.stateRoot)).append('daily_state',{job:{schemaVersion:'service-supervisor-daily-state/v1',
    readingId:ids[0],phase:'approved',approvalPath:f.request.approvalPath,approvalSha256:f.request.approvalSha256,
    contentSha256:approval.contentSha256,metadataSha256:approval.metadataSha256,registrySha256:approval.registrySha256,
    authorSessionId:approval.authorSessionId,reviewerSessionId:approval.reviewerSessionId,
    research:{path:f.request.approvalPath,sha256:f.request.approvalSha256}}},now);
  // Conspicuously fabricated protocol-only metadata/registry cannot pass the
  // real comprehensive validator, even with an apparently valid approval.
  await assert.rejects(f.gates.admitPublication(f.ctx,f.request,{now,transactionId:'c'.repeat(32)}),/ENOENT|PRIVATE_VALIDATION/);
});

test('unchanged daily approval bytes cannot authorize a revoked authoritative job before a write',async t=>{
  const f=await fixture(t),{verifyCurrentPublicationApproval}=await import('../scripts/lib/service-supervisor-approval.mjs');
  const approval={schemaVersion:'supervisor-editorial-approval/v1',status:'approved',contentSha256:f.artifacts[0].sha256,
    metadataSha256:f.artifacts[1].sha256,registrySha256:'c'.repeat(64),authorSessionId:'a'.repeat(32),reviewerSessionId:'b'.repeat(32)};
  await f.write(f.request.approvalPath,approval);f.request.approvalSha256=f.store.digest(await fs.readFile(path.join(f.root,f.request.approvalPath)));
  const journal=await f.store.openJournal(f.ctx.stateRoot),job={...approval,schemaVersion:'service-supervisor-daily-state/v1',
    readingId:ids[0],phase:'approved',approvalPath:f.request.approvalPath,approvalSha256:f.request.approvalSha256,
    research:{path:f.request.approvalPath,sha256:f.request.approvalSha256}};
  await journal.append('daily_state',{job},now);
  const deps={...f.dependencies,verifyApproval:verifyCurrentPublicationApproval};
  let next=await f.publisher.beginPublication(f.ctx,{role:'preparation',request:f.request,now},deps);
  while(JSON.parse(await fs.readFile(next.operationPath)).write!==true)next=await f.step(next,{},deps);
  await journal.append('daily_state',{job:{...job,phase:'editorial_attention'}},now);
  await assert.rejects(f.publisher.dispatchPublication(f.ctx,next.transactionId,next.operationId,{now},deps),/CURRENT_DAILY_APPROVAL_CHANGED/);
  assert.equal((await f.publisher.publicationHandoff(f.ctx,next.transactionId)).outcome,'blocked');
  assert.equal(f.uploads.size,0);assert.equal(f.store.digest(await fs.readFile(path.join(f.root,f.request.approvalPath))),f.request.approvalSha256);
  await assert.rejects(f.publisher.beginPublication(f.ctx,{role:'preparation',request:f.request,now},deps),/BLOCK_RETAINED/);
});

async function nativeHenryAuthority(t) {
  const f=await fixture(t),native=await import('../scripts/lib/mhc-v2-store.mjs'),{digestObject}=await import('../scripts/lib/mhc-v2.mjs');
  const {verifyCurrentPublicationApproval}=await import('../scripts/lib/service-supervisor-approval.mjs');
  const basis={reading_id:ids[0],plan_version:'FABRICATED-PLAN',chapters:[]},input={...basis,input_sha256:digestObject(basis)};
  const jobRoot=path.join(f.root,'private-content/automation/mhc-v2');await fs.mkdir(jobRoot,{recursive:true});
  let job=await native.createJob(jobRoot,input,now);
  const runtime={label:'FABRICATED runtime for current-authority tests only'},approval={schema_version:'mhc-evidence-approved/v2',
    reading_id:ids[0],input_sha256:input.input_sha256,review_basis_sha256:'d'.repeat(64),review:{status:'approved'},results:[{runtime}]};
  f.request.component='henry';f.request.approvalPath=`private-content/automation/mhc-v2/${ids[0]}/approved/approved.json`;
  await f.write(f.request.approvalPath,approval);f.request.approvalSha256=f.store.digest(await fs.readFile(path.join(f.root,f.request.approvalPath)));
  job=await native.appendState(job,'FABRICATED approved',{...job.state,phase:'publishing',review:{
    approved_sha256:digestObject(approval),review_basis_sha256:approval.review_basis_sha256}},now);
  const archive=Buffer.from('FABRICATED public domain archive bytes');await f.write('research/raw/matthew-henry/crosswire/MHC-2.2.zip',archive);
  let source={input,sourceManifest:{license:'Public domain',archive_sha256:f.store.digest(archive)}},
    library={runtimes:[runtime],artifactSha256:'e'.repeat(64)};
  const verifyApproval=(ctx,tx)=>verifyCurrentPublicationApproval(ctx,tx,{source:async()=>source,library:async()=>library});
  return {...f,job,native,verifyApproval,setSource:value=>{source=value;},setLibrary:value=>{library=value;},source,library};
}

test('real Henry event-chain revocation refuses an unchanged old approval before immutable upload',async t=>{
  const f=await nativeHenryAuthority(t),deps={...f.dependencies,verifyApproval:f.verifyApproval};
  let next=await f.publisher.beginPublication(f.ctx,{role:'review-audit',request:f.request,now},deps);
  while(JSON.parse(await fs.readFile(next.operationPath)).write!==true)next=await f.step(next,{},deps);
  await f.native.appendState(f.job,'FABRICATED review revoked',{...f.job.state,phase:'review_pending'},now);
  await assert.rejects(f.publisher.dispatchPublication(f.ctx,next.transactionId,next.operationId,{now},deps),/CURRENT_HENRY_APPROVAL_CHANGED/);
  assert.equal(f.uploads.size,0);assert.equal((await f.publisher.publicationHandoff(f.ctx,next.transactionId)).outcome,'blocked');
  assert.equal(f.store.digest(await fs.readFile(path.join(f.root,f.request.approvalPath))),f.request.approvalSha256);
});

test('Henry current source, raw archive and selected library are independently rechecked',async t=>{
  const f=await nativeHenryAuthority(t),tx={kind:'reading',component:'henry',readingId:ids[0],
    approval:{path:f.request.approvalPath,sha256:f.request.approvalSha256}};
  tx.approvalAuthority=await f.verifyApproval(f.ctx,tx);
  f.setSource({...f.source,input:{...f.source.input,input_sha256:'f'.repeat(64)}});
  await assert.rejects(f.verifyApproval(f.ctx,tx),/HENRY_SOURCE_CHANGED/);f.setSource(f.source);
  f.setLibrary({...f.library,artifactSha256:'f'.repeat(64)});
  await assert.rejects(f.verifyApproval(f.ctx,tx),/CURRENT_HENRY_LIBRARY_CHANGED/);f.setLibrary(f.library);
  f.setLibrary({...f.library,runtimes:[{label:'FABRICATED newer unapproved runtime'}]});
  await assert.rejects(f.verifyApproval(f.ctx,tx),/CURRENT_HENRY_LIBRARY_CHANGED/);f.setLibrary(f.library);
  await fs.appendFile(path.join(f.root,'research/raw/matthew-henry/crosswire/MHC-2.2.zip'),'FABRICATED changed archive');
  await assert.rejects(f.verifyApproval(f.ctx,tx),/HENRY_SOURCE_ARCHIVE_CHANGED/);
});

test('optional publisher input root supplies approved bytes while authority stays canonical',async t=>{
  const f=await nativeHenryAuthority(t),inputRoot=path.join(f.root,'FABRICATED-publisher-inputs');
  for(const artifact of f.artifacts) {
    const target=path.join(inputRoot,artifact.path);await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.copyFile(path.join(f.root,artifact.path),target);
  }
  // An unrelated canonical private draft is not the manager's approved input.
  await fs.writeFile(path.join(f.root,f.artifacts[0].path),'FABRICATED other canonical draft');
  f.ctx.publicationInputRoot=inputRoot;
  const deps={...f.dependencies,verifyApproval:f.verifyApproval},next=await f.publisher.beginPublication(f.ctx,{role:'review-audit',request:f.request,now},deps);
  const events=await (await f.store.openJournal(f.ctx.stateRoot)).load(),tx=events.findLast(e=>e.kind==='publication_state').data.transaction;
  const snapshot=await fs.readFile(path.join(f.ctx.stateRoot,tx.artifacts[0].snapshot));
  assert.equal(f.store.digest(snapshot),f.artifacts[0].sha256);assert.equal(next.action,'dispatch_required');
  await fs.appendFile(path.join(f.root,f.request.approvalPath),' ');
  await assert.rejects(f.publisher.dispatchPublication(f.ctx,next.transactionId,next.operationId,{now},deps),/APPROVAL_CHANGED/);
});
test('observed connector metadata needs real principal evidence and scoped references preserve exact raw bytes',async t=>{
  const f=await fixture(t),connector=await import('../scripts/lib/service-supervisor-connector.mjs');
  const result={structuredContent:{id:'FABRICATED-MANIFEST',mime_type:'text/plain',parent_ids:['FABRICATED-FOLDER'],
    permissions:permissions.map(({id,...rest})=>rest),source_visibility_status:'permission_metadata_available'}};
  const normalized=connector.connectorMetadata(result);assert.equal(Object.hasOwn(normalized,'trashed'),false);
  assert.equal(Object.hasOwn(normalized.permissions[0],'id'),false);
  assert.equal(f.publisher.permissionsDigest(normalized),f.publisher.permissionsDigest({permissions}));
  assert.throws(()=>f.publisher.permissionsDigest({permissions:[{type:'user',role:'reader'}]}),/SHARING_UNSAFE/);
  const bytes=Buffer.from('FABRICATED exact raw CRLF\r\n'),ref={structuredContent:{file_uri:{
    file_id:'sediment://file_00000000111122223333444444444444',
    download_url:'https://fabricated.oaiusercontent.com/files/00000000-1111-2222-3333-444444444444/raw?sig=FABRICATED'},file_size_bytes:bytes.length}};
  const proof=await connector.materializeRawReference(ref,{root:f.root,relative:'fabricated-raw.bin',fetchImpl:async()=>({ok:true,body:[bytes]})});
  assert.ok(bytes.equals(await fs.readFile(path.join(f.root,proof.rawPath))));assert.equal(proof.rawSha256,f.store.digest(bytes));
  for(const bad of ['https://example.invalid/files/00000000-1111-2222-3333-444444444444/raw',
    'https://fabricated.oaiusercontent.com@evil.invalid/files/00000000-1111-2222-3333-444444444444/raw']) {
    const changed=structuredClone(ref);changed.structuredContent.file_uri.download_url=bad;
    await assert.rejects(connector.materializeRawReference(changed,{root:f.root,relative:'bad.bin',fetchImpl:()=>{throw Error('must not fetch');}}),/ORIGIN_INVALID/);
  }
  await assert.rejects(connector.materializeRawReference(ref,{root:f.root,relative:'large.bin',maxBytes:2,fetchImpl:()=>{throw Error('must not fetch');}}),/REFERENCE_INVALID/);
  await assert.rejects(connector.materializeRawReference(ref,{root:f.root,relative:'short.bin',fetchImpl:async()=>({ok:true,body:[bytes.subarray(0,2)]})}),/LENGTH_CHANGED/);
});
test('historical protocol publication is admitted only by an unchanged valid order and a freshly complete forward horizon',async t=>{
  const f=await fixture(t),scope=await import('../scripts/lib/service-supervisor-scope.mjs'),protocol=await import('../scripts/lib/protocol-backfill-work-order.mjs');
  const active=JSON.parse(await fs.readFile(path.join(f.ctx.releaseRoot,'config/active-calendar/celebration-bridge-long-term-active.json')));
  const appConfig=JSON.parse(await fs.readFile(path.join(f.ctx.releaseRoot,'fixtures/pilot-content/app-config.json'))),today='2026-10-11';
  const descriptor=JSON.parse(await fs.readFile(path.join(f.ctx.releaseRoot,'config/daily-study-protocol.json')));
  await f.write('release/schemas/protocol-backfill-work-order.schema.json',JSON.parse(await fs.readFile(path.join(__dirname,'../schemas/protocol-backfill-work-order.schema.json'))));
  const order=protocol.buildProtocolBackfillWorkOrder({plan:active,appConfig,today,protocol:descriptor,horizonReady:true,
    candidate:{entry:active.entries[0],freshness:{reasonCode:'content_protocol_version_missing_or_stale'}},issuedAt:'2026-10-11T14:00:00Z'});
  const relative=`private-content/automation/staging/${ids[0]}/protocol-order.json`;await f.write(relative,order);
  const request={readingId:ids[0],component:'daily',workOrderPath:relative,workOrderSha256:f.store.digest(await fs.readFile(path.join(f.root,relative)))};
  const h={status:'ready',effectiveDate:today,target:7,readingIds:ids.slice(1),missingPreparedReadingIds:[],missingPayloadReadingIds:[],componentFailures:[],
    currentHorizonHenryLayer:{status:'complete',fallbackReadingIds:[],unavailableReadingIds:[]}};
  const time=new Date('2026-10-11T14:00:00Z');
  assert.equal((await scope.authorizePublicationScope(f.ctx,request,time,{health:async()=>h})).kind,'protocol_refresh');
  await assert.rejects(scope.authorizePublicationScope(f.ctx,request,time,{health:async()=>({...h,status:'not_ready',missingPreparedReadingIds:[ids[1]]})}),/HISTORICAL_DEFERRED/);
  await fs.appendFile(path.join(f.root,relative),' ');
  await assert.rejects(scope.authorizePublicationScope(f.ctx,request,time,{health:async()=>h}),/WORK_ORDER_CHANGED/);
});
test('installed Stage B connector handoff runs from arbitrary CWD without a credential or Google call',async t=>{
  const f=await fixture(t),sourceRoot=path.resolve(__dirname,'..'),files=[];
  async function collect(root,relative) {
    for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})) {
      const name=`${relative}/${entry.name}`;
      if(entry.isDirectory())await collect(root,name);else if(entry.isFile())files.push({path:name,bytes:await fs.readFile(path.join(root,name))});
    }
  }
  for(const dir of ['scripts','schemas','app'])await collect(sourceRoot,dir);
  for(const dir of ['config','fixtures'])await collect(f.ctx.releaseRoot,dir);
  const mapping=[];
  for(const lane of ['daily','henry_primary','henry_recovery','review']) {
    const relative=`automations/${lane}.toml`,file=path.join(f.root,relative);await fs.mkdir(path.dirname(file),{recursive:true});
    await fs.writeFile(file,Object.entries({name:`FABRICATED ${lane}`,kind:'cron',status:'ACTIVE',rrule:'FREQ=DAILY;BYHOUR=3',
      model:'gpt-6.1-sol',reasoning_effort:'high',execution_environment:'local',cwds:[f.root],prompt:'FABRICATED installed connector test'}).
      map(([key,value])=>`${key} = ${JSON.stringify(value)}`).join('\n')+'\ntarget = { type = "project", project_id = "FABRICATED-PROJECT" }\n');
    mapping.push({lane,file});
  }
  const installed=await f.runtime.installRuntime({projectRoot:f.root,sourceRevision:f.ctx.config.sourceRevision,stage:'B',publicationResources:f.resources,
    files,inventory:await f.runtime.captureInventory(mapping)});
  const start=await f.publisher.beginPublication(f.ctx,{role:'preparation',heartbeat:f.heartbeat,now});
  const run=spawnSync(process.execPath,[installed.launcher,'publication-handoff','--transaction',start.transactionId],{
    cwd:os.tmpdir(),windowsHide:true,encoding:'utf8',timeout:15000});
  assert.equal(run.status,0,run.stdout+run.stderr);const result=JSON.parse(run.stdout);
  assert.equal(result.action,'dispatch_required');assert.equal(result.operationSha256,start.operationSha256);assert.equal(result.published,false);
});
