const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const modules=Promise.all(['source-diagnostic','source-journal','source-fetch','store','contracts'].map(n=>import(`../scripts/lib/service-supervisor-${n}.mjs`)));
const repo=path.resolve(__dirname,'..'),now=new Date('2026-10-10T23:20:00Z'),url='https://example.invalid/FABRICATED-NET',excerpt='FABRICATED selected source evidence.';
async function fixture(t,{answer={status:200,mimeType:'text/html',bytes:Buffer.from('<p>'+excerpt+'</p>')},defaultRuntime=false}={}) {
  const [diagnostic,recording,fetcher,store,contracts]=await modules,root=await fs.mkdtemp(path.join(os.tmpdir(),'FABRICATED-source-diagnostic-'));
  t.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('FABRICATED-source-diagnostic-'));return fs.rm(root,{recursive:true,force:true});});const stateRoot=path.join(root,'private-content/automation/service-supervisor/state'),runtimeRoot=path.join(root,'private-content/automation/service-supervisor/runtime'),
    config={stage:'C',maxReadingsPerWake:1,sourceRevision:'b'.repeat(40),runtimeRoot,children:{sourceAccessMode:'code_consultation'}},
    pointer={schemaVersion:'service-supervisor-pointer/v1',sourceRevision:config.sourceRevision,release:config.sourceRevision+'-'+'c'.repeat(16),configSha256:store.digest(store.jsonBytes(config)),manifestSha256:'d'.repeat(64)},
    releaseRoot=defaultRuntime?path.join(runtimeRoot,'releases',pointer.release):repo,ctx={projectRoot:root,stateRoot,runtimeRoot,releaseRoot,config};
  if(defaultRuntime) {
    const files=[];for(const name of ['schemas/genesis16-source-diagnostic.schema.json','schemas/source.schema.json']) {
      const bytes=await fs.readFile(path.join(repo,name));await store.durableWrite(releaseRoot,name,bytes);files.push({path:name,bytes:bytes.length,sha256:store.digest(bytes)});
    }
    const launcher=Buffer.from('// FABRICATED immutable launcher; no model or HTTP.\n');
    await store.durableWrite(releaseRoot,'scripts/service-supervisor-launcher.mjs',launcher);files.push({path:'scripts/service-supervisor-launcher.mjs',bytes:launcher.length,sha256:store.digest(launcher)});
    const manifest=store.jsonBytes({schemaVersion:'service-supervisor-release/v1',sourceRevision:config.sourceRevision,files});pointer.manifestSha256=store.digest(manifest);
    await store.durableWrite(releaseRoot,'manifest.json',manifest);await store.durableWrite(runtimeRoot,'launcher.mjs',launcher);
    await store.durableWrite(runtimeRoot,`config-${pointer.configSha256}.json`,store.jsonBytes(config));await store.durableWrite(runtimeRoot,'current.json',store.jsonBytes(pointer));
  }
  const packet={readingId:'FABRICATED-GEN16'},source={sourceId:'FABRICATED-NET',title:'FABRICATED NET source',authorOrOrganization:'FABRICATED author',edition:'FABRICATED edition',
    publicationDate:null,publisher:'FABRICATED',resourceType:'FABRICATED commentary',traditionOrPerspective:['FABRICATED'],scope:'FABRICATED chapter',urlOrCitation:url,
    accessDate:'2026-10-10',accessMethod:'FABRICATED original child claim',rightsStatus:'copyrighted',license:null,allowedUses:['original synthesis'],rawTextStorageAllowed:false,
    summaryUseStatus:'consulted',qualityTier:'primary',includedReadings:[],notes:'FABRICATED only'},
    output={schemaVersion:'daily-research/v1',readingId:packet.readingId,inputSha256:store.digest(store.jsonBytes(packet)),status:'complete',
      records:[{sourceJson:JSON.stringify(source),eventId:null,accessedUrl:url,evidenceExcerpt:excerpt,claimNotes:[],inclusionReason:'FABRICATED',independenceKey:'FABRICATED',limitations:[]}],
      claims:[],representedCategories:[],missingCategories:[],stoppingReason:'FABRICATED',limitations:[]},
    execution={id:'a'.repeat(32),jobId:'e'.repeat(32),readingId:packet.readingId,kind:'daily-research',phase:'reserved',ordinal:1,threadId:'FABRICATED-thread'},
    journal=await store.openJournal(stateRoot);
  await journal.append('execution_state',{execution:structuredClone(execution)},now);execution.phase='blocked';execution.code='SUPERVISOR_CHILD_SOURCE_ACCESS_UNVERIFIABLE';
  const blocked=await journal.append('execution_state',{execution:structuredClone(execution)},now),job={id:execution.jobId,readingId:packet.readingId,phase:'blocked',research:null,blocker:{code:execution.code}};
  await journal.append('daily_state',{job},now);
  const oldReceipt=store.jsonBytes({label:'FABRICATED consumed original manager authority'}),failedReceiptSha256=store.digest(oldReceipt);
  await store.durableWrite(stateRoot,`research-revalidation/${failedReceiptSha256}/manager-receipt.json`,oldReceipt);
  await journal.append('research_revalidation_reserved',{executionId:execution.id,receiptSha256:failedReceiptSha256},now);
  const reservationHashes=[];for(let i=0;i<4;i++)reservationHashes.push((await journal.append('source_fetch_reserved',{jobId:execution.jobId,
    sourceId:i===3?source.sourceId:`FABRICATED-old-${i}`,url:i===3?url:`https://example.invalid/FABRICATED-${i}`,ordinal:i+1,receiptSha256:failedReceiptSha256},now)).sha256);
  const failure=await journal.append('research_revalidation_failed',{executionId:execution.id,receiptSha256:failedReceiptSha256,code:'SUPERVISOR_SOURCE_ACCESS_UNAVAILABLE'},now),
    incident={jobId:execution.jobId,executionId:execution.id,threadId:execution.threadId,blockedEventSha256:blocked.sha256,
      inputSha256:store.digest(store.jsonBytes(packet)),outputSha256:store.digest(store.jsonBytes(output)),failedReceiptSha256,failedEventSha256:failure.sha256,
      sourceId:source.sourceId,url,reservationHashes};
  for(const [name,value]of [['packet.json',packet],['output.json',output]])await store.durableWrite(stateRoot,`executions/${execution.id}/${name}`,store.jsonBytes(value));
  const receipt={schemaVersion:'genesis16-source-diagnostic/v1',managerAccepted:true,purpose:'net_original_url_diagnostic_only',
    ...Object.fromEntries(Object.entries(incident).filter(([k])=>!['url','reservationHashes'].includes(k))),
    sourceWorkSha256:fetcher.sourceWorkBinding(source),urlOrCitation:url,accessedUrl:url,sourceRevision:pointer.sourceRevision,manifestSha256:pointer.manifestSha256,configSha256:pointer.configSha256,
    issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+15*60*1000).toISOString()},receiptPath='private-content/automation/service-supervisor/FABRICATED-diagnostic.json';
  await store.durableWrite(root,receiptPath,store.jsonBytes(receipt));let requests=0;
  const dependencies={incident,...(!defaultRuntime?{runtime:async()=>({releaseRoot,config,pointer})}:{}),
    fetchSource:(value,options)=>fetcher.fetchLawfulSource(value,{...options,resolve:async()=>[{address:'93.184.216.34',family:4}],fetch:async()=>{requests++;return typeof answer==='function'?answer(requests):answer;}})};
  return {ctx,pointer,diagnostic,recording,fetcher,store,contracts,journal,receipt,receiptPath,dependencies,options:{receiptPath,clock:()=>now},incident,output,packet,source,requests:()=>requests};
}
test('NET diagnostic captures real-shaped response and excerpt checkpoint without research admission, model or block clearing; exact replay sends nothing',async t=>{
  const f=await fixture(t),before=await f.journal.load(),result=await f.diagnostic.diagnoseGenesis16Source(f.ctx,f.options,f.dependencies);
  assert.equal(result.outcome,'complete');assert.equal(result.diagnostic.passed,true);assert.equal(result.diagnostic.excerptMatched,true);assert.equal(f.requests(),1);
  const events=await f.journal.load();assert.equal(events.filter(e=>e.kind==='source_fetch_reserved').length,5);assert.deepEqual(events.slice(0,before.length),before);
  assert.equal(events.filter(e=>e.kind==='execution_state').length,2);assert.equal(events.filter(e=>e.kind==='daily_state').length,1);
  assert.equal(events.filter(e=>e.kind==='research_revalidation_failed').length,1);assert.equal(events.some(e=>e.kind==='research_revalidation_complete'),false);
  const checkpoint=await f.store.readPrivate(f.ctx.stateRoot,result.diagnostic.checkpoint.path);assert.equal(checkpoint.excerpt,excerpt);assert.equal(checkpoint.approval,false);
  assert.equal(checkpoint.observation.status,200);assert.equal(checkpoint.observation.bytes,Buffer.byteLength('<p>'+excerpt+'</p>'));assert.equal(checkpoint.returnedContent,undefined);
  assert.equal((await f.diagnostic.diagnoseGenesis16Source(f.ctx,f.options,f.dependencies)).outcome,'already_completed');assert.equal(f.requests(),1);
  await fs.appendFile(path.join(f.ctx.projectRoot,f.receiptPath),' ');await assert.rejects(f.diagnostic.diagnoseGenesis16Source(f.ctx,f.options,f.dependencies),/ALREADY_USED/);assert.equal(f.requests(),1);
});
for(const [name,answer,stage,status,mime,match]of [
  ['non-200',{status:404,mimeType:'text/html',bytes:Buffer.from('FABRICATED failure body NEVER STORED')},'response',404,'text/html',null],
  ['wrong MIME',{status:200,mimeType:'application/octet-stream',bytes:Buffer.from(excerpt)},'response',200,'application/octet-stream',null],
  ['empty body',{status:200,mimeType:'text/html',bytes:Buffer.alloc(0)},'response',200,'text/html',null],
  ['empty normalized text',{status:200,mimeType:'text/html',bytes:Buffer.from('<script>FABRICATED ignored body</script>')},'normalization',200,'text/html',null],
  ['excerpt mismatch',{status:200,mimeType:'text/html',bytes:Buffer.from('FABRICATED other evidence')},'returned',200,'text/html',false]
])test(`failed ${name} retains safe exact metadata and stays a completed diagnostic, without an approved checkpoint`,async t=>{
  const f=await fixture(t,{answer}),r=await f.diagnostic.diagnoseGenesis16Source(f.ctx,f.options,f.dependencies),a=r.diagnostic.attempt;
  assert.equal(r.diagnostic.passed,false);assert.equal(r.diagnostic.checkpoint,null);assert.equal(r.diagnostic.excerptMatched,match);assert.equal(a.stage,stage);
  assert.equal(a.observation.status,status);assert.equal(a.observation.mimeType,mime);assert.equal(a.observation.contentSha256,f.store.digest(answer.bytes));
  assert.equal(a.observation.bytes,answer.bytes.length);assert.equal(a.observation.bodyComplete,true);
  if(name!=='excerpt mismatch')assert.equal(a.failureClass,{'non-200':'http_status','wrong MIME':'mime','empty body':'empty_body','empty normalized text':'empty_text'}[name]);
  const persisted=JSON.stringify(await f.journal.load());assert.equal(persisted.includes('NEVER STORED'),false);assert.equal(persisted.includes('FABRICATED ignored body'),false);
  assert.equal((await f.diagnostic.diagnoseGenesis16Source(f.ctx,f.options,f.dependencies)).outcome,'already_completed');assert.equal(f.requests(),1);
});
test('redirects retain each actual hop/status/hash; only one new logical budget slot is consumed',async t=>{
  const f=await fixture(t,{answer:n=>n===1?{status:302,mimeType:'text/html',location:'/FABRICATED-final',bytes:Buffer.from('FABRICATED redirect response')}:
    {status:200,mimeType:'text/html',bytes:Buffer.from(excerpt)}}),r=await f.diagnostic.diagnoseGenesis16Source(f.ctx,f.options,f.dependencies),events=await f.journal.load();
  assert.equal(f.requests(),2);assert.equal(r.diagnostic.passed,true);assert.equal(events.filter(e=>e.kind==='source_fetch_reserved').length,5);
  assert.equal(events.filter(e=>e.kind==='source_hop_dispatched').length,2);assert.deepEqual(events.filter(e=>e.kind==='source_hop_outcome').map(e=>e.data.observation.status),[302,200]);
  assert.deepEqual(r.diagnostic.attempt.observation.redirects,['https://example.invalid/FABRICATED-final']);
  const reserved=events.find(e=>e.kind==='source_diagnostic_reserved');assert.equal(reserved.data.oldPhysicalHopCount,null);assert.deepEqual(reserved.data.oldPhysicalHopBound,[4,16]);
});
test('transport failure retains null unknown fields and never retains error prose, DNS addresses, response headers or extraneous parser content',async t=>{
  const f=await fixture(t);f.dependencies.fetchSource=(value,options)=>f.fetcher.fetchLawfulSource(value,{...options,
    resolve:async()=>{throw Object.assign(Error('FABRICATED PRIVATE PARSER PROSE'),{code:'ENOTFOUND'});}});
  const r=await f.diagnostic.diagnoseGenesis16Source(f.ctx,f.options,f.dependencies);assert.equal(r.diagnostic.attempt.stage,'dns');assert.equal(r.diagnostic.attempt.observation.status,null);
  assert.equal(r.diagnostic.attempt.observation.contentSha256,null);assert.equal(r.diagnostic.attempt.observation.bytes,null);assert.equal(r.diagnostic.attempt.observation.mimeType,null);
  assert.equal(JSON.stringify(await f.journal.load()).includes('PRIVATE PARSER'),false);
  const safe=f.recording.safeSourceOutcome({status:200,mimeType:'text/html',headers:{authorization:'FABRICATED SECRET'},dnsAddresses:['127.0.0.1'],returnedContent:'FABRICATED MODERN BODY',
    extraction:{method:'pypdf-plain/v1',version:'6.10.0',text:'FABRICATED PARSER BODY'},finalUrl:'https://example.invalid/?token=FABRICATED'});
  assert.equal(safe.finalUrl,null);assert.equal(JSON.stringify(safe).includes('FABRICATED'),false);
});
test('incremental passing-source checkpoint survives later-source failure and stores no full modern body',async t=>{
  const f=await fixture(t),lease=await f.journal.acquire('installation',{now}),recorder=f.recording.sourceAttemptRecorder(f.ctx,{journal:f.journal,lease,jobId:f.incident.jobId,clock:()=>now,
    executionId:f.incident.executionId,inputSha256:f.incident.inputSha256,outputSha256:f.incident.outputSha256,runtime:f.pointer,
    fetchSource:(value,options)=>f.fetcher.fetchLawfulSource(value,{...options,resolve:async()=>[{address:'93.184.216.34',family:4}],
      fetch:async()=>value===url?{status:200,mimeType:'text/html',bytes:Buffer.from(excerpt+' FABRICATED FULL BODY NOT RETAINED')}:{status:403,mimeType:'text/html',bytes:Buffer.from('FABRICATED denied body')}})}),
    decoded=f.contracts.decodeResearch(f.output,{packet:f.packet,sourceSchema:JSON.parse(await fs.readFile(path.join(repo,'schemas/source.schema.json')))}),other=structuredClone(decoded.records[0]);
  other.source.sourceId='FABRICATED-later';other.source.urlOrCitation=other.accessedUrl=url+'-later';decoded.records.push(other);
  await assert.rejects(f.fetcher.consultResearchSources(decoded,{fetchSource:recorder.fetchSource,checkpoint:recorder.checkpoint,
    reserve:request=>f.journal.append('source_fetch_reserved',{...request,jobId:f.incident.jobId},now,lease)}),/ACCESS_UNAVAILABLE/);
  const checkpoints=(await f.journal.load()).filter(e=>e.kind==='source_checkpoint_written');assert.equal(checkpoints.length,1);
  const saved=await f.store.readPrivate(f.ctx.stateRoot,checkpoints[0].data.checkpoint.path);assert.equal(saved.excerpt,excerpt);assert.equal(JSON.stringify(saved).includes('FULL BODY'),false);
  await f.journal.release(lease,now);
});
test('reservation without terminal result is permanently uncertain; a missing completion cannot repeat even with saved response evidence',async t=>{
  for(const cut of ['source_hop_outcome','source_diagnostic_complete']) {
    const f=await fixture(t),r=await f.diagnostic.diagnoseGenesis16Source(f.ctx,f.options,f.dependencies),events=await f.journal.load(),boundary=events.find(e=>e.kind===cut),lease=events.findLast(e=>e.kind==='lease_acquired').data;
    for(let i=events.length;i>=boundary.sequence;i--)await fs.unlink(path.join(f.ctx.stateRoot,'events',String(i).padStart(9,'0')+'.json'));
    await f.journal.release(lease,now);
    const replay=await f.diagnostic.diagnoseGenesis16Source(f.ctx,f.options,f.dependencies);assert.equal(replay.outcome,'uncertain');assert.equal(f.requests(),1);
    const saved=await f.store.readPrivate(f.ctx.stateRoot,r.result.path);assert.equal(saved.passed,true);
  }
});
for(const [name,alter,code]of [
  ['unaccepted authority',f=>{f.receipt.managerAccepted=false;},'validation'],['expired authority',f=>{f.receipt.expiresAt=f.receipt.issuedAt;},'EXPIRED'],
  ['wrong pins',f=>{f.receipt.manifestSha256='0'.repeat(64);},'BASIS_CHANGED'],['changed source work',f=>{f.receipt.sourceWorkSha256='0'.repeat(64);},'BASIS_CHANGED'],
  ['alternate URL',f=>{f.receipt.accessedUrl=url+'-alternate';},'RECEIPT_INVALID'],['wrong failure',f=>{f.receipt.failedEventSha256='0'.repeat(64);},'RECEIPT_INVALID']
])test(`diagnostic refuses ${name} before a network reservation`,async t=>{
  const f=await fixture(t);alter(f);await fs.writeFile(path.join(f.ctx.projectRoot,f.receiptPath),f.store.jsonBytes(f.receipt));
  await assert.rejects(f.diagnostic.diagnoseGenesis16Source(f.ctx,f.options,f.dependencies),new RegExp(code));assert.equal(f.requests(),0);
  assert.equal((await f.journal.load()).filter(e=>e.kind==='source_fetch_reserved').length,4);
});
test('64 logical reservations remain exhausted; production constants reject fabricated incident overrides absent explicit fixture injection',async t=>{
  const f=await fixture(t);for(let i=4;i<64;i++)await f.journal.append('source_fetch_reserved',{jobId:f.incident.jobId,ordinal:i+1},now);
  await assert.rejects(f.diagnostic.diagnoseGenesis16Source(f.ctx,f.options,f.dependencies),/FETCH_BUDGET_EXHAUSTED/);assert.equal(f.requests(),0);
  const g=await fixture(t),{incident,...dependencies}=g.dependencies;await assert.rejects(g.diagnostic.diagnoseGenesis16Source(g.ctx,g.options,dependencies),/RECEIPT_INVALID/);assert.equal(g.requests(),0);
});
test('default actual runtime verifier accepts a fabricated pinned release and rejects launcher tampering before a request',async t=>{
  const f=await fixture(t,{defaultRuntime:true});assert.equal((await f.diagnostic.diagnoseGenesis16Source(f.ctx,f.options,f.dependencies)).diagnostic.passed,true);
  const g=await fixture(t,{defaultRuntime:true});await fs.appendFile(path.join(g.ctx.runtimeRoot,'launcher.mjs'),'FABRICATED tamper');
  await assert.rejects(g.diagnostic.diagnoseGenesis16Source(g.ctx,g.options,g.dependencies),/LAUNCHER_HASH_INVALID/);assert.equal(g.requests(),0);
});
test('hostile secret-shaped MIME is nulled before any event, while actual status/hash and failure stage remain truthful',async t=>{
  const hostile='application/sk-'+Array(25).fill('A').join(''),f=await fixture(t,{answer:{status:200,mimeType:hostile,bytes:Buffer.from(excerpt)}}),
    r=await f.diagnostic.diagnoseGenesis16Source(f.ctx,f.options,f.dependencies),events=await f.journal.load();
  assert.equal(r.diagnostic.passed,false);assert.equal(r.diagnostic.attempt.observation.status,200);assert.equal(r.diagnostic.attempt.observation.mimeType,null);
  assert.equal(r.diagnostic.attempt.stage,'response');assert.equal(JSON.stringify(events).includes(hostile),false);f.contracts.assertChildPrivacy(events);
});
for(const kind of ['missing','tampered','wrong_reference'])test(`completed replay verifies its ${kind} checkpoint without another request`,async t=>{
  const f=await fixture(t),r=await f.diagnostic.diagnoseGenesis16Source(f.ctx,f.options,f.dependencies),ref=r.diagnostic.checkpoint;
  if(kind==='missing')await fs.unlink(path.join(f.ctx.stateRoot,ref.path));
  if(kind==='tampered')await fs.appendFile(path.join(f.ctx.stateRoot,ref.path),' ');
  if(kind==='wrong_reference') {
    const resultFile=path.join(f.ctx.stateRoot,r.result.path),saved=JSON.parse(await fs.readFile(resultFile)),other='source-checkpoints/FABRICATED-wrong-reference.json';
    await f.store.durableWrite(f.ctx.stateRoot,other,await fs.readFile(path.join(f.ctx.stateRoot,ref.path)));saved.checkpoint.path=other;
    const bytes=f.store.jsonBytes(saved);await fs.writeFile(resultFile,bytes);const events=await f.journal.load(),completed=events.find(e=>e.kind==='source_diagnostic_complete');
    completed.data.result.sha256=f.store.digest(bytes);let previous=events[completed.sequence-2].sha256;
    for(const event of events.slice(completed.sequence-1)) {const {sha256,...body}=event;body.previous=previous;const next={...body,sha256:f.store.digest(f.store.jsonBytes(body))};previous=next.sha256;
      await fs.writeFile(path.join(f.ctx.stateRoot,'events',String(event.sequence).padStart(9,'0')+'.json'),f.store.jsonBytes(next));}
  }
  await assert.rejects(f.diagnostic.diagnoseGenesis16Source(f.ctx,f.options,f.dependencies));assert.equal(f.requests(),1);
});
test('checkpoints bind manifest, config, response, execution and original selection; duplicate selection and conflicting page rights cannot overstore quotes',async t=>{
  const f=await fixture(t),r=await f.diagnostic.diagnoseGenesis16Source(f.ctx,f.options,f.dependencies),saved=await f.store.readPrivate(f.ctx.stateRoot,r.diagnostic.checkpoint.path);
  assert.deepEqual(saved.runtime,{sourceRevision:f.pointer.sourceRevision,manifestSha256:f.pointer.manifestSha256,configSha256:f.pointer.configSha256});
  assert.equal(saved.outputSha256,f.incident.outputSha256);assert.equal(saved.inputSha256,f.incident.inputSha256);assert.equal(saved.executionId,f.incident.executionId);
  assert.equal(saved.originalExcerptSha256,f.store.digest(Buffer.from(excerpt)));
  const lease=await f.journal.acquire('installation',{now}),recorder=f.recording.sourceAttemptRecorder(f.ctx,{journal:f.journal,lease,jobId:f.incident.jobId,
    executionId:f.incident.executionId,inputSha256:f.incident.inputSha256,outputSha256:f.incident.outputSha256,runtime:f.pointer,clock:()=>now}),
    record={source:f.source,accessedUrl:url,evidenceExcerpt:excerpt},proof={kind:'bounded_anonymous_https',finalUrl:url,url,returnedContent:excerpt};
  const duplicate=await recorder.checkpoint(record,proof);assert.equal((await f.store.readPrivate(f.ctx.stateRoot,duplicate.path)).quotedWords,0);
  const long=Array(22).fill('FABRICATED').join(' ');record.source={...f.source,sourceId:'FABRICATED-other-work',title:'FABRICATED other title',rightsStatus:'public_domain'};record.evidenceExcerpt=long;
  const other=await recorder.checkpoint(record,proof,{quoteCeiling:25}),cp=await f.store.readPrivate(f.ctx.stateRoot,other.path);
  assert.equal(cp.quoteOmitted,true);assert.equal(cp.excerpt,null);assert.equal(cp.originalExcerptWords,22);assert.equal(cp.originalExcerptSha256,f.store.digest(Buffer.from(long)));
  const stored=(await f.journal.load()).filter(e=>e.kind==='source_checkpoint_written');let words=0;for(const e of stored)words+=(await f.store.readPrivate(f.ctx.stateRoot,e.data.checkpoint.path)).quotedWords;
  assert.equal(words,4);await f.journal.release(lease,now);
});
test('default source runtime binding awaits launcher bytes; changed manifest/config and missing response pins refuse recorder',async t=>{
  const f=await fixture(t,{defaultRuntime:true});assert.equal((await f.recording.checkedSourceRuntime(f.ctx)).manifestSha256,f.pointer.manifestSha256);
  assert.throws(()=>f.recording.sourceAttemptRecorder(f.ctx,{runtime:f.pointer}),/RUNTIME_BINDING_INVALID/);
  await fs.appendFile(path.join(f.ctx.releaseRoot,'manifest.json'),' ');await assert.rejects(f.recording.checkedSourceRuntime(f.ctx),/POINTER_HASH_INVALID/);
});
