const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {baseFixture,repo,url}=require('./helpers/service-supervisor-continuation-fixture.cjs');
const modules=Promise.all(['source-continuation','source-diagnostic','source-journal'].map(n=>import(`../scripts/lib/service-supervisor-${n}.mjs`)));
const alternate='https://example.invalid/FABRICATED-legacy-NET',excerpt='FABRICATED selected article excerpt.';
async function fixture(t,{answer=null,alterOutput=()=>{},remoteCount=13}={}){
  const f=await baseFixture(t,{mismatch:false,alterOutput:out=>{
    for(let i=1;i<remoteCount;i++){const record=structuredClone(out.records[1]),source=JSON.parse(record.sourceJson);source.sourceId=`FABRICATED-remaining-${i}`;
      source.title=`FABRICATED remaining work ${i}`;source.authorOrOrganization=`FABRICATED author ${i}`;record.accessedUrl=source.urlOrCitation=url+'-'+i;record.sourceJson=JSON.stringify(source);out.records.push(record);}
    alterOutput(out);
  }}),[continuation,diagnostic,recording]=await modules,now=f.options.clock();
  f.ctx.runtimeRoot=path.join(f.ctx.projectRoot,'private-content/automation/service-supervisor/runtime');
  const oldRuntime=await f.dependencies.runtime(),manifestBytes=f.store.jsonBytes({schemaVersion:'service-supervisor-release/v1',sourceRevision:oldRuntime.pointer.sourceRevision,files:[]});
  oldRuntime.pointer.manifestSha256=f.store.digest(manifestBytes);f.receipt.manifestSha256=oldRuntime.pointer.manifestSha256;
  await f.store.durableWrite(f.ctx.runtimeRoot,`config-${oldRuntime.pointer.configSha256}.json`,f.store.jsonBytes(f.ctx.config));
  await f.store.durableWrite(f.ctx.runtimeRoot,`releases/${oldRuntime.pointer.sourceRevision}-${oldRuntime.pointer.manifestSha256.slice(0,16)}/manifest.json`,manifestBytes);
  const oldReceiptBytes=f.store.jsonBytes(f.receipt),oldReceiptSha256=f.store.digest(oldReceiptBytes);
  await f.store.durableWrite(f.ctx.stateRoot,`research-revalidation/${oldReceiptSha256}/manager-receipt.json`,oldReceiptBytes);
  await f.journal.append('research_revalidation_reserved',{executionId:f.execution.id,receiptSha256:oldReceiptSha256},now);
  const reservationHashes=[];for(let i=0;i<4;i++)reservationHashes.push((await f.journal.append('source_fetch_reserved',{jobId:f.job.id,executionId:f.execution.id,
    sourceId:i===3?'FABRICATED-paper':`FABRICATED-old-${i}`,url:i===3?url:url+'-old-'+i,ordinal:i+1,receiptSha256:oldReceiptSha256},now)).sha256);
  const failure=await f.journal.append('research_revalidation_failed',{executionId:f.execution.id,receiptSha256:oldReceiptSha256,code:'SUPERVISOR_SOURCE_ACCESS_UNAVAILABLE'},now),
    diagnosticTarget={...f.incident,sourceId:'FABRICATED-paper',url,failedReceiptSha256:oldReceiptSha256,failedEventSha256:failure.sha256,reservationHashes},source=JSON.parse(f.output.records[1].sourceJson),
    diagReceipt={...f.receipt,schemaVersion:'genesis16-source-diagnostic/v1',purpose:'net_original_url_diagnostic_only',failedReceiptSha256:oldReceiptSha256,failedEventSha256:failure.sha256,
      sourceId:source.sourceId,sourceWorkSha256:f.fetcher.sourceWorkBinding(source),urlOrCitation:url,accessedUrl:url};delete diagReceipt.mappings;
  const diagnosticPath='private-content/automation/service-supervisor/FABRICATED-diag.json';await fs.writeFile(path.join(f.ctx.projectRoot,diagnosticPath),f.store.jsonBytes(diagReceipt));
  const diagnosed=await diagnostic.diagnoseGenesis16Source(f.ctx,{receiptPath:diagnosticPath,clock:()=>now},{incident:diagnosticTarget,runtime:f.dependencies.runtime,
    fetchSource:(value,options)=>f.fetcher.fetchLawfulSource(value,{...options,resolve:async()=>[{address:'93.184.216.34',family:4}],fetch:async()=>({status:403,mimeType:'text/html',bytes:Buffer.from('FABRICATED actual-shaped denial')})})});
  const events=await f.journal.load(),net=JSON.parse(f.output.records[1].sourceJson),target={...f.incident,readingId:f.job.readingId,
    failedReceiptSha256:oldReceiptSha256,failedEventSha256:failure.sha256,diagnosticReceiptSha256:diagnosed.diagnostic.receiptSha256,diagnosticResultSha256:diagnosed.result.sha256,
    sourceId:net.sourceId,sourceWorkSha256:f.fetcher.sourceWorkBinding(net),originalExcerptSha256:f.store.digest(Buffer.from(f.output.records[1].evidenceExcerpt.replace(/\s+/g,' ').trim())),
    urlOrCitation:url,originalAccessedUrl:url,effectiveAccessedUrl:alternate,reservationHashes:events.filter(e=>e.kind==='source_fetch_reserved').map(e=>e.sha256)};
  const receipt={schemaVersion:'genesis16-source-continuation/v1',managerAccepted:true,purpose:'same_response_NET_locator_continuation',
    ...Object.fromEntries(Object.entries(target).filter(([key])=>key!=='readingId')),blockedJobEventSha256:events.find(e=>e.kind==='daily_state').sha256,basisEventSha256:events.at(-1).sha256,
    schemaSha256:f.store.digest(await fs.readFile(path.join(f.ctx.stateRoot,`executions/${f.execution.id}/schema.json`))),eventLogSha256:f.execution.eventLog.sha256,identitySha256:f.execution.threadIdentity.sha256,
    priorMappingsSha256:f.store.digest(f.store.jsonBytes(f.receipt.mappings)),identityTerms:['FABRICATED Scholar Two','FABRICATED Author Two'],
    ...(await f.dependencies.runtime()).pointer,nativePins:f.ctx.config.henryRuntime,
    historicalPins:{failedSupervisor:Object.fromEntries(['sourceRevision','manifestSha256','configSha256'].map(k=>[k,f.receipt[k]])),failedNative:f.ctx.config.henryRuntime,
      diagnosticSupervisor:Object.fromEntries(['sourceRevision','manifestSha256','configSha256'].map(k=>[k,diagnosed.diagnostic.runtime[k]])),diagnosticNative:f.ctx.config.henryRuntime},
    issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+15*60*1000).toISOString()};
  const receiptPath='private-content/automation/service-supervisor/FABRICATED-continuation.json';await fs.writeFile(path.join(f.ctx.projectRoot,receiptPath),f.store.jsonBytes(receipt));let requests=[];
  const dependencies={...f.dependencies,incident:target,native:async()=>({pointer:{source_revision:f.ctx.config.henryRuntime.sourceRevision,manifest_sha256:f.ctx.config.henryRuntime.manifestSha256,config_sha256:f.ctx.config.henryRuntime.configSha256}}),
    admitOrder:async()=>({entry:f.packet.reading}),fetchSource:(value,options)=>f.fetcher.fetchLawfulSource(value,{...options,
      resolve:async()=>[{address:'93.184.216.34',family:4}],fetch:async()=>{requests.push(value);return answer?answer(value,requests.length):{status:200,mimeType:'text/html',bytes:Buffer.from('FABRICATED Scholar Two. FABRICATED Author Two. '+excerpt)};}})};
  return {...f,continuation,recording,receipt,receiptPath,target,dependencies,options:{receiptPath,clock:()=>now},now,requests:()=>requests};
}
async function writeReceipt(f){await fs.writeFile(path.join(f.ctx.projectRoot,f.receiptPath),f.store.jsonBytes(f.receipt));}
test('same-response continuation consults NET first and all thirteen remote sources; preserves five debts, raw identities, ordinal and failed receipts',async t=>{
  const f=await fixture(t),original=await f.journal.load(),raw=await fs.readFile(path.join(f.ctx.stateRoot,`executions/${f.execution.id}/output.json`)),r=await f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies);
  assert.equal(r.outcome,'accepted');assert.equal(r.modelDispatched,false);assert.equal(r.budgetReset,false);assert.equal(f.requests().length,13);assert.equal(f.requests()[0],alternate);assert.equal(f.requests().includes(url),false);
  assert.deepEqual(await fs.readFile(path.join(f.ctx.stateRoot,`executions/${f.execution.id}/output.json`)),raw);
  const events=await f.journal.load();assert.deepEqual(events.slice(0,original.length),original);assert.equal(events.filter(e=>e.kind==='source_fetch_reserved').length,18);
  assert.equal(events.filter(e=>e.kind==='research_revalidation_failed').length,1);assert.equal(events.filter(e=>e.kind==='source_diagnostic_complete').length,1);
  const completed=events.find(e=>e.kind==='research_source_continuation_complete'),proof=await f.store.readPrivate(f.ctx.stateRoot,completed.data.proof.path),
    audit=await f.store.readPrivate(f.ctx.stateRoot,proof.locatorAudit.path),admission=await f.store.readPrivate(f.ctx.stateRoot,proof.admission.path);
  assert.equal(proof.checkpoints.length,14);assert.equal(audit.discoveryAdmittedAsBytes,false);assert.equal(audit.discovery.httpBytesClaimed,false);assert.equal(audit.rawResponseChanged,false);
  assert.equal(audit.originalAccessedUrl,url);assert.equal(audit.effectiveAccessedUrl,alternate);assert.equal(admission.records[1].accessedUrl,alternate);assert.equal(admission.records[1].source.urlOrCitation,url);
  assert.deepEqual(JSON.parse(f.output.records[1].sourceJson),{...admission.records[1].source,accessMethod:'FABRICATED child self-report',accessDate:'2026-10-10'});
  assert.equal(events.filter(e=>e.kind==='execution_state').at(-1).data.execution.ordinal,1);assert.equal((await f.daily.latestDailyJob(f.journal,f.job.readingId)).phase,'queued');
  assert.equal(JSON.stringify(admission).includes('returnedContent'),false);
  assert.equal((await f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies)).outcome,'already_accepted');assert.equal(f.requests().length,13);
  await f.journal.append('daily_state',{job:{...f.job,phase:'blocked',blocker:{code:'FABRICATED_LATER_FAILURE'}}},f.now);
  assert.equal((await f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies)).outcome,'already_accepted');assert.equal((await f.daily.latestDailyJob(f.journal,f.job.readingId)).blocker.code,'FABRICATED_LATER_FAILURE');
});
for(const [name,answer,code]of [
  ['NET 403',()=>({status:403,mimeType:'text/html',bytes:Buffer.from('FABRICATED denied')}),'ACCESS_UNAVAILABLE'],
  ['missing original selection',()=>({status:200,mimeType:'text/html',bytes:Buffer.from('FABRICATED Scholar Two. FABRICATED Author Two. different')}),'ACCESS_BINDING_FAILED'],
  ['wrong publisher identity',()=>({status:200,mimeType:'text/html',bytes:Buffer.from(excerpt)}),'IDENTITY_BINDING_FAILED']
])test(`${name} permanently consumes continuation without admitting or repeating a request`,async t=>{
  const f=await fixture(t,{answer});await assert.rejects(f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies),new RegExp(code));assert.equal(f.requests().length,1);
  assert.equal((await f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies)).outcome,'already_failed');assert.equal(f.requests().length,1);
  const events=await f.journal.load();assert.equal(events.filter(e=>e.kind==='source_fetch_reserved').length,6);assert.equal(events.filter(e=>e.kind==='execution_state').at(-1).data.execution.phase,'blocked');
  f.receipt.issuedAt=new Date(f.now.getTime()+1).toISOString();await writeReceipt(f);await assert.rejects(f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies),/ALREADY_USED/);
});
test('an earlier passing NET checkpoint survives a later source denial; all evidence remains unadmitted',async t=>{
  const f=await fixture(t,{answer:(_url,n)=>n===1?{status:200,mimeType:'text/html',bytes:Buffer.from('FABRICATED Scholar Two. FABRICATED Author Two. '+excerpt)}:
    {status:403,mimeType:'text/html',bytes:Buffer.from('FABRICATED denied later')}});
  await assert.rejects(f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies),/ACCESS_UNAVAILABLE/);
  const events=await f.journal.load();assert.equal(events.filter(e=>e.kind==='source_checkpoint_written').length,2);assert.equal(events.some(e=>e.kind==='research_source_continuation_prepared'),false);
  assert.equal(events.filter(e=>e.kind==='source_fetch_reserved').length,7);assert.equal(f.requests().length,2);
});
test('excluded discovery records remain byte-equivalent in admission and replay; no source silently disappears',async t=>{
  const f=await fixture(t,{remoteCount:1,alterOutput:out=>{const r=structuredClone(out.records[1]),s=JSON.parse(r.sourceJson);s.sourceId='FABRICATED-excluded';s.summaryUseStatus='discovered';
    r.sourceJson=JSON.stringify(s);r.evidenceExcerpt='  FABRICATED discovery only  ';out.records.push(r);}});
  assert.equal((await f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies)).outcome,'accepted');
  assert.equal((await f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies)).outcome,'already_accepted');assert.equal(f.requests().length,1);
});
test('all retained job debt counts against 64 even if additional fabricated reservations appear after the first source',async t=>{
  const f=await fixture(t,{remoteCount:2});let first=true;const original=f.dependencies.fetchSource;
  f.dependencies.fetchSource=async(...args)=>{const proof=await original(...args);if(first){first=false;for(let i=7;i<=64;i++)await f.journal.append('source_fetch_reserved',{jobId:f.job.id,ordinal:i,url:'https://example.invalid/FABRICATED-old-debt-'+i,sourceId:'FABRICATED-debt-'+i},f.now);}return proof;};
  await assert.rejects(f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies),/FETCH_BUDGET_EXHAUSTED/);
  assert.equal((await f.journal.load()).filter(e=>e.kind==='source_fetch_reserved').length,64);assert.equal(f.requests().length,1);
  assert.equal((await f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies)).outcome,'already_failed');assert.equal(f.requests().length,1);
});
for(const [name,change,code]of [
  ['unaccepted',async f=>{f.receipt.managerAccepted=false;await writeReceipt(f);},'validation'],
  ['expired',async f=>{f.receipt.expiresAt=f.receipt.issuedAt;await writeReceipt(f);},'EXPIRED'],
  ['long authority',async f=>{f.receipt.expiresAt=new Date(f.now.getTime()+16*60*1000).toISOString();await writeReceipt(f);},'EXPIRED'],
  ['alternate arbitrary URL',async f=>{f.receipt.effectiveAccessedUrl=alternate+'-other';await writeReceipt(f);},'RECEIPT_INVALID'],
  ['changed original work',async f=>{f.receipt.sourceWorkSha256='0'.repeat(64);await writeReceipt(f);},'RECEIPT_INVALID'],
  ['changed original selection',async f=>{f.receipt.originalExcerptSha256='0'.repeat(64);await writeReceipt(f);},'RECEIPT_INVALID'],
  ['changed diagnostic result',async f=>fs.appendFile(path.join(f.ctx.stateRoot,`source-diagnostics/${f.target.diagnosticReceiptSha256}/result.json`),' '),'BASIS_CHANGED'],
  ['changed original response',async f=>fs.appendFile(path.join(f.ctx.stateRoot,`executions/${f.execution.id}/output.json`),' '),'BASIS_CHANGED'],
  ['changed original event log',async f=>fs.appendFile(path.join(f.ctx.stateRoot,`executions/${f.execution.id}/events.jsonl`),' '),'BASIS_CHANGED'],
  ['changed original schema',async f=>fs.appendFile(path.join(f.ctx.stateRoot,`executions/${f.execution.id}/schema.json`),' '),'BASIS_CHANGED'],
  ['changed failed grant',async f=>fs.appendFile(path.join(f.ctx.stateRoot,`research-revalidation/${f.target.failedReceiptSha256}/manager-receipt.json`),' '),'BASIS_CHANGED'],
  ['changed base registry',async f=>fs.appendFile(path.join(f.ctx.projectRoot,f.job.baseRegistry.path),' '),'BASIS_CHANGED'],
  ['supervisor manifest mismatch',async f=>{f.receipt.manifestSha256='0'.repeat(64);await writeReceipt(f);},'BASIS_CHANGED'],
  ['native manifest mismatch',async f=>{f.receipt.nativePins={...f.receipt.nativePins,manifestSha256:'0'.repeat(64)};await writeReceipt(f);},'BASIS_CHANGED'],
  ['historical native mismatch',async f=>{f.receipt.historicalPins.failedNative={...f.receipt.historicalPins.failedNative,manifestSha256:'0'.repeat(64)};await writeReceipt(f);},'BASIS_CHANGED'],
  ['historical config tampering',async f=>fs.appendFile(path.join(f.ctx.runtimeRoot,`config-${f.receipt.configSha256}.json`),' '),'BASIS_CHANGED'],
  ['later research response',async f=>f.journal.append('execution_state',{execution:{...f.execution,id:'0'.repeat(32),phase:'blocked'}},f.now),'BASIS_CHANGED'],
  ['pending publication',async f=>f.journal.append('publication_state',{transaction:{id:'FABRICATED-pending',phase:'uploading'}},f.now),'PUBLICATION_PENDING'],
  ['changed current journal head',async f=>f.journal.append('fabricated_unrelated',{},f.now),'BASIS_CHANGED']
])test(`continuation refuses ${name} before a new source reservation`,async t=>{
  const f=await fixture(t);await change(f);await assert.rejects(f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies),new RegExp(code));assert.equal(f.requests().length,0);
  assert.equal((await f.journal.load()).filter(e=>e.kind==='source_fetch_reserved').length,5);
});
test('production incident and default native verifier cannot be replaced by fabricated receipts',async t=>{
  const f=await fixture(t),{incident,...deps}=f.dependencies;await assert.rejects(f.continuation.continueGenesis16Sources(f.ctx,f.options,deps),/RECEIPT_INVALID/);assert.equal(f.requests().length,0);
  const g=await fixture(t),{native,...defaultNative}=g.dependencies;await assert.rejects(g.continuation.continueGenesis16Sources(g.ctx,g.options,defaultNative),/ENOENT|HENRY_PIN/);assert.equal(g.requests().length,0);
});
test('accepted child reuse validates the continuation history and checkpoint set; unknown proof types refuse reuse',async t=>{
  const f=await fixture(t,{remoteCount:1});await f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies);
  const accepted=(await f.journal.load()).findLast(e=>e.kind==='execution_state').data.execution,proof=await f.store.readPrivate(f.ctx.stateRoot,accepted.revalidation.path);
  await f.continuation.verifyAcceptedSourceContinuation(f.ctx,accepted,proof.correctedInputSha256,f.dependencies);assert.equal(f.requests().length,1);
  await fs.appendFile(path.join(f.ctx.stateRoot,proof.checkpoints[0].ref.path),' ');
  await assert.rejects(f.continuation.verifyAcceptedSourceContinuation(f.ctx,accepted,proof.correctedInputSha256,f.dependencies),/BASIS_CHANGED/);
  const g=await fixture(t,{remoteCount:1});await g.continuation.continueGenesis16Sources(g.ctx,g.options,g.dependencies);
  const retained=(await g.journal.load()).findLast(e=>e.kind==='execution_state').data.execution,unknown={...await g.store.readPrivate(g.ctx.stateRoot,retained.revalidation.path),schemaVersion:'FABRICATED-unknown-proof'},
    bytes=g.store.jsonBytes(unknown),ref={path:'source-continuations/FABRICATED-unknown.json',sha256:g.store.digest(bytes)};
  await g.store.durableWrite(g.ctx.stateRoot,ref.path,bytes);await g.journal.append('execution_state',{execution:{...retained,revalidation:{...ref,inputSha256:unknown.correctedInputSha256}}},g.now);
  const lease=await g.journal.acquire('preparation',{now:g.now}),packet=await g.daily.dailyResearchPacket(g.ctx,{entry:g.packet.reading,order:g.packet.workOrder,job:g.job,priorRegistry:{sources:[]},foundation:await g.dependencies.foundation()});
  await assert.rejects(g.exec.executeBoundedChild(g.ctx,{journal:g.journal,lease,jobId:g.job.id,readingId:g.job.readingId,kind:'daily-research',packet,schema:{},prompt:'FABRICATED no model',deadline:Date.now()+3600000},
    {clock:()=>g.now,transport:()=>{throw Error('FABRICATED must not dispatch');}}),/ACCEPTED_OUTPUT_CHANGED/);await g.journal.release(lease,g.now);
});
test('completed replay verifies checkpoint, audit and aggregate admission hashes without network',async t=>{
  for(const artifact of ['checkpoint','locatorAudit','admission','proof']){
    const f=await fixture(t,{remoteCount:1});await f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies);
    const completed=(await f.journal.load()).find(e=>e.kind==='research_source_continuation_complete'),proof=await f.store.readPrivate(f.ctx.stateRoot,completed.data.proof.path),
      ref=artifact==='checkpoint'?proof.checkpoints[0].ref:artifact==='proof'?completed.data.proof:proof[artifact];
    await fs.appendFile(path.join(f.ctx.stateRoot,ref.path),' ');await assert.rejects(f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies),/BASIS_CHANGED/);assert.equal(f.requests().length,1);
  }
});
test('prepared crash recovery never fetches again; a reserved continuation without a prepared event stays uncertain even with orphan files',async t=>{
  for(const boundaryKind of ['research_source_continuation_prepared','execution_state','daily_state','research_source_continuation_complete']){
    const f=await fixture(t,{remoteCount:1});await f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies);const events=await f.journal.load(),
      reserved=events.find(e=>e.kind==='research_source_continuation_reserved'),boundary=events.find(e=>e.sequence>reserved.sequence&&e.kind===boundaryKind),lease=events.findLast(e=>e.kind==='lease_acquired').data;
    for(let i=events.length;i>=boundary.sequence;i--)await fs.unlink(path.join(f.ctx.stateRoot,'events',String(i).padStart(9,'0')+'.json'));
    await f.journal.release(lease,f.now);const r=await f.continuation.continueGenesis16Sources(f.ctx,f.options,f.dependencies);
    assert.equal(r.outcome,boundaryKind==='research_source_continuation_prepared'?'uncertain':'accepted');assert.equal(f.requests().length,1);
  }
});
