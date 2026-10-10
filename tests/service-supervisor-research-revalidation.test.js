const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const modules=Promise.all(['research-revalidation','source-fetch','exec','contracts','daily','store'].map(n=>import(`../scripts/lib/service-supervisor-${n}.mjs`)));
const repo=path.resolve(__dirname,'..'),now=new Date('2026-10-10T22:30:00Z'),url='https://example.invalid/FABRICATED-paper';
const rawEvents=thread=>[{type:'thread.started',thread_id:thread},{type:'turn.started'},
  ...['search','other','find_in_page'].flatMap((type,i)=>[{type:'item.started',item:{id:`FABRICATED-web-${i}`,type:'web_search',action:{type:'other'}}},
    {type:'item.completed',item:{id:`FABRICATED-web-${i}`,type:'web_search',action:{type}}}]),{type:'turn.completed'}].map(JSON.stringify).join('\n');
test('actual-shaped search/other/find telemetry is discovery only in explicit code mode',async()=>{
  const [,,exec]=await modules,events=rawEvents('FABRICATED-thread');
  for(const mode of ['cli_content','bounded_https'])assert.throws(()=>exec.analyzeChildEvents(events,{kind:'daily-research',sourceAccessMode:mode}),/SOURCE_ACCESS_UNVERIFIABLE/);
  const proof=exec.analyzeChildEvents(events,{kind:'daily-research',sourceAccessMode:'code_consultation'});assert.equal(proof.opened.length,0);assert.equal(proof.webOperations,3);
  const redacted=exec.privateEventLog(events);assert.equal(exec.analyzeChildEvents(redacted,{kind:'daily-research',sourceAccessMode:'code_consultation',redacted:true}).webOperations,3);
  assert.throws(()=>exec.analyzeChildEvents(events.replace('web_search','command_execution'),{kind:'daily-research',sourceAccessMode:'code_consultation'}),/TOOL_OR_TURN_FAILED/);
});
test('future logs retain checked public discovery URLs without queries, secrets or result bodies becoming proof',async()=>{
  const [,,exec]=await modules;
  for(const value of [url,'https://docs.google.com/FABRICATED','https://example.invalid/?token=FABRICATED','https://example.invalid/?q=private%40example.invalid']) {
    const events=[{type:'item.completed',item:{id:'FABRICATED',type:'web_search',action:{type:'other',url:value},results:[{content:'FABRICATED body must not persist'}]}}].map(JSON.stringify).join('\n');
    const item=JSON.parse(exec.privateEventLog(events)).item;assert.equal(!!item.publicDiscovery,value===url);assert.equal(item.resultsStored,false);assert.equal(item.results,undefined);
  }
});
async function fixture(t,{mismatch=true,alterOutput=()=>{}}={}) {
  const [revalidation,fetcher,exec,contracts,daily,store]=await modules,root=await fs.mkdtemp(path.join(os.tmpdir(),'dbr-consult-fabricated-'));
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('dbr-consult-fabricated-'));await fs.rm(root,{recursive:true,force:true});});
  const stateRoot=path.join(root,'private-content/automation/service-supervisor/state'),pointer={sourceRevision:'b'.repeat(40),manifestSha256:'c'.repeat(64),configSha256:'d'.repeat(64)},
    config={stage:'C',maxReadingsPerWake:1,sourceRevision:pointer.sourceRevision,children:{sourceAccessMode:'code_consultation'}},ctx={projectRoot:root,releaseRoot:repo,stateRoot,config},
    plan=JSON.parse(await fs.readFile(path.join(repo,'config/active-calendar/celebration-bridge-long-term-active.json'))),entry=plan.entries.find(e=>e.readingId==='LTP-0028-GEN-016'),
    rolling=await import('../scripts/lib/rolling-study-work-order.mjs'),appConfig=JSON.parse(await fs.readFile(path.join(repo,'fixtures/pilot-content/app-config.json'))),
    protocol=JSON.parse(await fs.readFile(path.join(repo,'config/daily-study-protocol.json'))),order=rolling.buildRollingStudyWorkOrder({plan,appConfig,protocol,today:'2026-10-10',issuedAt:now.toISOString()});
  order.reading=entry;order.planExtensionRequired=true;
  pointer.configSha256=store.digest(store.jsonBytes(config));
  const text='FABRICATED local Henry source evidence.',foundation={sourceId:'FABRICATED-henry',sourceUrl:'https://example.invalid/FABRICATED-henry',
    locator:'https://example.invalid/FABRICATED-henry [MHC FABRICATED]',archiveSha256:'a'.repeat(64),license:'FABRICATED public domain',verifiedAt:now.toISOString(),
    atoms:[{id:'FABRICATED-atom',text,sha256:store.digest(Buffer.from(text))}],sourceEvidence:{kind:'local_verified_henry',sourceId:'FABRICATED-henry',
      locator:'https://example.invalid/FABRICATED-henry [MHC FABRICATED]',url:'https://example.invalid/FABRICATED-henry',eventId:'FABRICATED-local',returnedContent:text,contentSha256:store.digest(Buffer.from(text))}},
    job={schemaVersion:'service-supervisor-daily-state/v1',id:'a'.repeat(32),readingId:entry.readingId,phase:'blocked',sourceRevision:'e'.repeat(40),createdAt:now.toISOString(),
      research:null,draft:null,approvalPath:null,approvalSha256:null,authorSessionId:null,reviewerSessionId:null,contentSha256:null,metadataSha256:null,registrySha256:null,
      blocker:{code:'SUPERVISOR_CHILD_SOURCE_ACCESS_UNVERIFIABLE'}},registry={sources:[]};
  for(const [key,file,value]of [['workOrder','private-content/automation/FABRICATED/order.json',order],['baseRegistry','research/working/FABRICATED-registry.json',registry]]) {
    const bytes=store.jsonBytes(value);job[key]={path:file,sha256:store.digest(bytes)};await store.durableWrite(root,file,bytes);
  }
  const packet=await daily.dailyResearchPacket({...ctx,config:{...config,children:{sourceAccessMode:'bounded_https'}}},{entry,order,job,priorRegistry:registry,foundation}),inputSha256=store.digest(store.jsonBytes(packet)),
    source=(local)=>({sourceId:local?foundation.sourceId:'FABRICATED-paper',title:local?'FABRICATED Henry':'FABRICATED Scholar Two',authorOrOrganization:local?'FABRICATED Henry':'FABRICATED Author Two',
      edition:'FABRICATED edition',publicationDate:null,publisher:'FABRICATED publisher',resourceType:'FABRICATED commentary',traditionOrPerspective:['FABRICATED historical'],scope:'FABRICATED chapter',
      urlOrCitation:local?foundation.locator:url+(mismatch?' [FABRICATED section]':''),accessDate:'2026-10-10',accessMethod:'FABRICATED child self-report',
      rightsStatus:local?'public_domain':'copyrighted',license:local?'FABRICATED public domain':null,allowedUses:['original synthesis'],rawTextStorageAllowed:false,
      summaryUseStatus:'consulted',qualityTier:'primary',includedReadings:[],notes:'FABRICATED source; no actual Scripture.'}),
    output={schemaVersion:'daily-research/v1',readingId:entry.readingId,inputSha256,status:'complete',records:[true,false].map(local=>({sourceJson:JSON.stringify(source(local)),eventId:null,
      accessedUrl:local?null:url,evidenceExcerpt:local?text:'FABRICATED selected article excerpt.',claimNotes:['FABRICATED supported claim'],inclusionReason:'FABRICATED fixture',
      independenceKey:local?'FABRICATED Henry':'FABRICATED scholar',limitations:['FABRICATED only']})),claims:[{claimId:'FABRICATED-claim',claim:'FABRICATED supported claim',sourceIds:['FABRICATED-henry','FABRICATED-paper']}],
      representedCategories:['FABRICATED historical'],missingCategories:[],stoppingReason:'FABRICATED retained result',limitations:['FABRICATED only']};alterOutput(output);
  const execution={id:'f'.repeat(32),jobId:job.id,readingId:entry.readingId,kind:'daily-research',inputSha256,phase:'reserved',ordinal:1,proof:{billingRoute:'FABRICATED no model'},
    reservedAt:now.toISOString(),deadline:new Date(now.getTime()+20*60*1000).toISOString()},base=`executions/${execution.id}`,eventBytes=Buffer.from(exec.privateEventLog(rawEvents('FABRICATED-retained-thread'))),
    originalEventsSha256=store.digest(Buffer.from(rawEvents('FABRICATED-retained-thread'))),identity=exec.checkedThreadIdentity(rawEvents('FABRICATED-retained-thread')),
    identityBytes=store.jsonBytes({...identity,rawEventsSha256:originalEventsSha256});
  await store.durableWrite(stateRoot,`${base}/packet.json`,store.jsonBytes(packet));await store.durableWrite(stateRoot,`${base}/output.json`,store.jsonBytes(output));
  await store.durableWrite(stateRoot,`${base}/schema.json`,store.jsonBytes(contracts.researchContract(packet,JSON.parse(await fs.readFile(path.join(repo,'schemas/source.schema.json'))))));
  await store.durableWrite(stateRoot,`${base}/events.jsonl`,eventBytes);await store.durableWrite(stateRoot,`${base}/thread-identity.json`,identityBytes);
  const journal=await store.openJournal(stateRoot),lease=await journal.acquire('preparation',{now});await journal.append('execution_state',{execution:structuredClone(execution)},now,lease);
  Object.assign(execution,{phase:'blocked',code:'SUPERVISOR_CHILD_SOURCE_ACCESS_UNVERIFIABLE',eventLog:{path:`${base}/events.jsonl`,sha256:store.digest(eventBytes)},
    threadIdentity:{path:`${base}/thread-identity.json`,sha256:store.digest(identityBytes)},threadId:identity.threadId,eventsSha256:originalEventsSha256});
  const event=await journal.append('execution_state',{execution},now,lease);await journal.append('daily_state',{job},now,lease);await journal.release(lease,now);
  const incident={jobId:job.id,executionId:execution.id,readingId:entry.readingId,threadId:identity.threadId,blockedEventSha256:event.sha256,outputSha256:store.digest(store.jsonBytes(output)),inputSha256},
    paper=JSON.parse(output.records[1].sourceJson),receipt={schemaVersion:'genesis16-research-revalidation/v1',managerAccepted:true,...Object.fromEntries(['jobId','executionId','threadId','blockedEventSha256','outputSha256','inputSha256'].map(k=>[k,incident[k]])),
      ...pointer,issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+15*60*1000).toISOString(),mappings:mismatch?[{sourceId:paper.sourceId,sourceWorkSha256:fetcher.sourceWorkBinding(paper),
        urlOrCitation:paper.urlOrCitation,accessedUrl:url,identityTerms:['FABRICATED Scholar Two','FABRICATED Author Two']}]:[]},
    receiptPath='private-content/automation/service-supervisor/FABRICATED/receipt.json';await store.durableWrite(root,receiptPath,store.jsonBytes(receipt));
  let fetches=0;const dependencies={incident,runtime:async()=>({releaseRoot:repo,config,pointer}),foundation:async()=>foundation,
    fetchSource:async value=>{fetches++;const body='FABRICATED Scholar Two. FABRICATED Author Two. FABRICATED selected article excerpt.';return{kind:'bounded_anonymous_https',url:value,finalUrl:value,
      redirects:[],contentSha256:store.digest(Buffer.from(body)),normalizedTextSha256:store.digest(Buffer.from(body)),normalization:'html-text/v1',bytes:body.length,
      mimeType:'text/html',returnedContent:body,rawBodyStored:false,accessedAt:now.toISOString()};}};
  return {ctx,revalidation,fetcher,exec,contracts,daily,store,journal,job,execution,incident,output,packet,receipt,receiptPath,dependencies,options:{receiptPath,clock:()=>now},fetches:()=>fetches};
}
test('retained result is admitted by code evidence with null local URL; original response/history/ordinal persist and no model is replayed',async t=>{
  const f=await fixture(t),before=(await f.journal.load()).filter(e=>e.kind==='execution_state'),originalBytes=await fs.readFile(path.join(f.ctx.stateRoot,`executions/${f.execution.id}/output.json`)),
    result=await f.revalidation.revalidateGenesis16Research(f.ctx,f.options,f.dependencies);
  assert.equal(result.outcome,'accepted');assert.equal(result.dispatched,false);assert.equal(result.budgetReset,false);assert.equal(f.fetches(),1);
  const after=(await f.journal.load()).filter(e=>e.kind==='execution_state');assert.deepEqual(after.slice(0,2),before);assert.equal(after.at(-1).data.execution.ordinal,1);
  assert.deepEqual(await fs.readFile(path.join(f.ctx.stateRoot,`executions/${f.execution.id}/output.json`)),originalBytes);
  const accepted=after.at(-1).data.execution,admission=JSON.parse(await fs.readFile(path.join(f.ctx.stateRoot,accepted.admission.path)));
  assert.equal(admission.records[0].accessedUrl,'https://example.invalid/FABRICATED-henry');assert.match(admission.records[0].source.accessMethod,/local/);
  assert.equal(admission.evidence[1].eventId,null);assert.match(admission.records[1].source.accessMethod,/Code consultation/);assert.equal(JSON.stringify(admission).includes('returnedContent'),false);
  const lease=await f.journal.acquire('preparation',{now}),corrected=await f.daily.dailyResearchPacket(f.ctx,{entry:f.packet.reading,order:f.packet.workOrder,job:f.job,priorRegistry:{sources:[]},foundation:await f.dependencies.foundation()});
  const reused=await f.exec.executeBoundedChild(f.ctx,{journal:f.journal,lease,jobId:f.job.id,readingId:f.job.readingId,kind:'daily-research',packet:corrected,schema:{},prompt:'FABRICATED no dispatch',deadline:Date.now()+3600000},
    {clock:()=>now,transport:()=>{throw Error('must not call model');}});assert.equal(reused.execution.id,f.execution.id);await f.journal.release(lease,now);
  const later=await f.journal.acquire('preparation',{now});await f.journal.append('daily_state',{job:{...f.job,blocker:{code:'FABRICATED_LATER_CHILD_FAILED'}}},now,later);await f.journal.release(later,now);
  assert.equal((await f.revalidation.revalidateGenesis16Research(f.ctx,f.options,f.dependencies)).outcome,'already_accepted');assert.equal(f.fetches(),1);
  assert.equal((await f.daily.latestDailyJob(f.journal,f.job.readingId)).blocker.code,'FABRICATED_LATER_CHILD_FAILED');
});
test('failed exact excerpt keeps original blocked execution and counts fetch; reimport and replacement cannot retry',async t=>{
  const f=await fixture(t);f.dependencies.fetchSource=async value=>{return{kind:'bounded_anonymous_https',url:value,finalUrl:value,rawBodyStored:false,returnedContent:'FABRICATED wrong excerpt'};};
  await assert.rejects(f.revalidation.revalidateGenesis16Research(f.ctx,f.options,f.dependencies),/ACCESS_BINDING_FAILED/);
  const events=await f.journal.load();assert.equal(events.filter(e=>e.kind==='source_fetch_reserved').length,1);assert.equal(events.filter(e=>e.kind==='execution_state').at(-1).data.execution.phase,'blocked');
  f.dependencies.fetchSource=()=>{throw Error('must not retry');};assert.equal((await f.revalidation.revalidateGenesis16Research(f.ctx,f.options,f.dependencies)).outcome,'already_failed');
  await fs.appendFile(path.join(f.ctx.projectRoot,f.receiptPath),' ');await assert.rejects(f.revalidation.revalidateGenesis16Research(f.ctx,f.options,f.dependencies),/ALREADY_USED/);
});
test('mapping identity failure and unmapped different-page citation preserve counted consultation failures',async t=>{
  const f=await fixture(t);f.receipt.mappings[0].identityTerms=['FABRICATED absent title','FABRICATED absent author'];await fs.writeFile(path.join(f.ctx.projectRoot,f.receiptPath),f.store.jsonBytes(f.receipt));
  await assert.rejects(f.revalidation.revalidateGenesis16Research(f.ctx,f.options,f.dependencies),/IDENTITY_BINDING_FAILED/);assert.equal(f.fetches(),1);
  const g=await fixture(t);g.receipt.mappings=[];await fs.writeFile(path.join(g.ctx.projectRoot,g.receiptPath),g.store.jsonBytes(g.receipt));
  await assert.rejects(g.revalidation.revalidateGenesis16Research(g.ctx,g.options,g.dependencies),/CITATION_BINDING_FAILED/);assert.equal(g.fetches(),2);
});
test('different citation admits only actual identical final page bytes when no manager mapping exists',async t=>{
  const f=await fixture(t);f.receipt.mappings=[];await fs.writeFile(path.join(f.ctx.projectRoot,f.receiptPath),f.store.jsonBytes(f.receipt));
  const original=f.dependencies.fetchSource;f.dependencies.fetchSource=async value=>({...await original(value),finalUrl:url});
  assert.equal((await f.revalidation.revalidateGenesis16Research(f.ctx,f.options,f.dependencies)).outcome,'accepted');assert.equal(f.fetches(),2);
});
for(const [name,mutate,code]of [
  ['changed response',async f=>fs.appendFile(path.join(f.ctx.stateRoot,`executions/${f.execution.id}/output.json`),' '),'BASIS_CHANGED'],
  ['changed packet',async f=>fs.appendFile(path.join(f.ctx.stateRoot,`executions/${f.execution.id}/packet.json`),' '),'BASIS_CHANGED'],
  ['changed event log',async f=>fs.appendFile(path.join(f.ctx.stateRoot,`executions/${f.execution.id}/events.jsonl`),' '),'BASIS_CHANGED'],
  ['weakened schema',async f=>fs.writeFile(path.join(f.ctx.stateRoot,`executions/${f.execution.id}/schema.json`),'{}'),'BASIS_CHANGED'],
  ['changed registry',async f=>fs.appendFile(path.join(f.ctx.projectRoot,f.job.baseRegistry.path),' '),'BASIS_CHANGED'],
  ['wrong pin',async f=>{f.receipt.configSha256='e'.repeat(64);await fs.writeFile(path.join(f.ctx.projectRoot,f.receiptPath),f.store.jsonBytes(f.receipt));},'BASIS_CHANGED'],
  ['expired grant',async f=>{f.receipt.expiresAt=f.receipt.issuedAt;await fs.writeFile(path.join(f.ctx.projectRoot,f.receiptPath),f.store.jsonBytes(f.receipt));},'EXPIRED'],
  ['wrong mode',async f=>{f.ctx.config.children.sourceAccessMode='bounded_https';},'MODE_REQUIRED'],
  ['changed foundation',async f=>{const foundation=await f.dependencies.foundation();f.dependencies.foundation=async()=>({...foundation,archiveSha256:'e'.repeat(64)});},'BASIS_CHANGED']
])test(`retained revalidation refuses ${name} before any real consultation`,async t=>{
  const f=await fixture(t);await mutate(f);await assert.rejects(f.revalidation.revalidateGenesis16Research(f.ctx,f.options,f.dependencies),new RegExp(code));assert.equal(f.fetches(),0);
});
test('production incident constants reject fabricated authorization without fixture override',async t=>{
  const f=await fixture(t),{incident,...dependencies}=f.dependencies;
  await assert.rejects(f.revalidation.revalidateGenesis16Research(f.ctx,f.options,dependencies),/RECEIPT_INVALID/);assert.equal(f.fetches(),0);
});
test('later research response, pending publication and exhausted 64-fetch budget cannot be bypassed',async t=>{
  for(const [kind,data,code]of [['execution_state',{execution:{...{jobId:'a'.repeat(32),kind:'daily-research',id:'e'.repeat(32),phase:'failed'}}},'INELIGIBLE'],
    ['publication_state',{transaction:{id:'e'.repeat(32),phase:'uploading',readingId:'FABRICATED-other'}},'PUBLICATION_PENDING']]) {
    const f=await fixture(t),lease=await f.journal.acquire('preparation',{now});await f.journal.append(kind,data,now,lease);await f.journal.release(lease,now);
    await assert.rejects(f.revalidation.revalidateGenesis16Research(f.ctx,f.options,f.dependencies),new RegExp(code));assert.equal(f.fetches(),0);
  }
  const f=await fixture(t),lease=await f.journal.acquire('preparation',{now});for(let i=0;i<64;i++)await f.journal.append('source_fetch_reserved',{jobId:f.job.id,ordinal:i+1},now,lease);await f.journal.release(lease,now);
  await assert.rejects(f.revalidation.revalidateGenesis16Research(f.ctx,f.options,f.dependencies),/FETCH_BUDGET_EXHAUSTED/);assert.equal(f.fetches(),0);
});
test('accepted idempotence refuses tampered proof and original response',async t=>{
  const f=await fixture(t);await f.revalidation.revalidateGenesis16Research(f.ctx,f.options,f.dependencies);
  await fs.appendFile(path.join(f.ctx.stateRoot,`executions/${f.execution.id}/output.json`),' ');await assert.rejects(f.revalidation.revalidateGenesis16Research(f.ctx,f.options,f.dependencies),/BASIS_CHANGED/);
  const g=await fixture(t);await g.revalidation.revalidateGenesis16Research(g.ctx,g.options,g.dependencies);const completed=(await g.journal.load()).find(e=>e.kind==='research_revalidation_complete');
  await fs.appendFile(path.join(g.ctx.stateRoot,completed.data.proof.path),' ');await assert.rejects(g.revalidation.revalidateGenesis16Research(g.ctx,g.options,g.dependencies),/BASIS_CHANGED/);
});
test('unknown rights, modern raw storage and excessive selected quotation block without a fetch',async t=>{
  for(const alter of [s=>{s.rightsStatus='unknown';},s=>{s.rawTextStorageAllowed=true;},(_s,r)=>{r.evidenceExcerpt=Array(26).fill('FABRICATED').join(' ');}]) {
    const f=await fixture(t,{alterOutput:out=>{const record=out.records[1],source=JSON.parse(record.sourceJson);alter(source,record);record.sourceJson=JSON.stringify(source);}});
    await assert.rejects(f.revalidation.revalidateGenesis16Research(f.ctx,f.options,f.dependencies),/RIGHTS_OR_ACCESS_FAILED/);assert.equal(f.fetches(),0);
  }
});
test('crash after immutable admission/proof resumes without another fetch; missing proof stays uncertain',async t=>{
  for(const savedProof of [true,false]) {
    const f=await fixture(t),initial=await f.journal.load();await f.revalidation.revalidateGenesis16Research(f.ctx,f.options,f.dependencies);
    const reservation=(await f.journal.load()).find(e=>e.kind==='research_revalidation_reserved'),clone=path.join(f.ctx.projectRoot,'FABRICATED-crash-state');
    assert.ok(clone.startsWith(f.ctx.projectRoot+path.sep));await fs.mkdir(path.join(clone,'events'),{recursive:true});
    for(const e of initial)await fs.writeFile(path.join(clone,'events',String(e.sequence).padStart(9,'0')+'.json'),f.store.jsonBytes(e));
    await fs.cp(path.join(f.ctx.stateRoot,'executions'),path.join(clone,'executions'),{recursive:true});
    if(savedProof)await fs.cp(path.join(f.ctx.stateRoot,'research-revalidation'),path.join(clone,'research-revalidation'),{recursive:true});
    const journal=await f.store.openJournal(clone);await journal.append('research_revalidation_reserved',reservation.data,now);
    const ctx={...f.ctx,stateRoot:clone},dependencies={...f.dependencies,fetchSource:()=>{throw Error('must not refetch after crash');}};
    if(savedProof){assert.equal((await f.revalidation.revalidateGenesis16Research(ctx,f.options,dependencies)).outcome,'accepted');
      assert.equal((await f.daily.latestDailyJob(journal,f.job.readingId)).phase,'queued');}
    else {await assert.rejects(f.revalidation.revalidateGenesis16Research(ctx,f.options,dependencies),/UNCERTAIN/);
      assert.equal((await f.daily.latestDailyJob(journal,f.job.readingId)).phase,'blocked');}
  }
});
test('quotation caps aggregate one underlying work across distinct fetched pages',async t=>{
  const f=await fixture(t,{mismatch:false}),schema=JSON.parse(await fs.readFile(path.join(repo,'schemas/source.schema.json'))),decoded=f.contracts.decodeResearch(f.output,{packet:f.packet,sourceSchema:schema}),
    second=structuredClone(decoded.records[1]);second.source.sourceId='FABRICATED-second-page';second.accessedUrl=url+'-second';second.source.urlOrCitation=second.accessedUrl;
  decoded.records.push(second);decoded.records[1].evidenceExcerpt=second.evidenceExcerpt=Array(16).fill('FABRICATED').join(' ');
  const fetchSource=async value=>({kind:'bounded_anonymous_https',url:value,finalUrl:value,rawBodyStored:false,accessedAt:now.toISOString(),
    returnedContent:Array(16).fill('FABRICATED').join(' '),contentSha256:'a'.repeat(64)});
  const evidence=await f.fetcher.consultResearchSources(decoded,{foundation:await f.dependencies.foundation(),fetchSource});
  assert.throws(()=>f.contracts.admitResearch(decoded,{packet:f.packet,sourceSchema:schema,sourceEvidence:evidence,decoded:true}),/RIGHTS_OR_ACCESS_FAILED/);
});

for(const reverse of [false,true])for(const samePage of [false,true])test(`conflicting rights enforce strictest work/page cap (reverse=${reverse}, samePage=${samePage})`,async t=>{
  const f=await fixture(t,{mismatch:false}),schema=JSON.parse(await fs.readFile(path.join(repo,'schemas/source.schema.json'))),
    decoded=f.contracts.decodeResearch(f.output,{packet:f.packet,sourceSchema:schema}),second=structuredClone(decoded.records[1]);
  second.source.sourceId='FABRICATED-permissive-source';second.accessedUrl=url+'-second';second.source.urlOrCitation=second.accessedUrl;
  second.source.rightsStatus='public_domain';second.source.rawTextStorageAllowed=false;
  if(samePage){second.source.title='FABRICATED different underlying work';second.source.edition='FABRICATED different edition';}
  decoded.records.push(second);decoded.records[1].evidenceExcerpt=second.evidenceExcerpt=Array(16).fill('FABRICATED').join(' ');
  if(reverse)decoded.records.reverse();
  const fetchSource=async value=>({kind:'bounded_anonymous_https',url:value,finalUrl:samePage?url:value,rawBodyStored:false,accessedAt:now.toISOString(),
    returnedContent:Array(16).fill('FABRICATED').join(' '),contentSha256:'a'.repeat(64)});
  const evidence=await f.fetcher.consultResearchSources(decoded,{foundation:await f.dependencies.foundation(),fetchSource});
  assert.throws(()=>f.contracts.admitResearch(decoded,{packet:f.packet,sourceSchema:schema,sourceEvidence:evidence,decoded:true}),/RIGHTS_OR_ACCESS_FAILED/);
});
