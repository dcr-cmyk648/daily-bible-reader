const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const modules=Promise.all(['research-revalidation','source-fetch','exec','contracts','daily','store'].map(n=>import(`../../scripts/lib/service-supervisor-${n}.mjs`)));
const repo=path.resolve(__dirname,'../..'),url='https://example.invalid/FABRICATED-paper';
const rawEvents=thread=>[{type:'thread.started',thread_id:thread},{type:'turn.started'},
  ...['search','other','find_in_page'].flatMap((type,i)=>[{type:'item.started',item:{id:`FABRICATED-web-${i}`,type:'web_search',action:{type:'other'}}},
    {type:'item.completed',item:{id:`FABRICATED-web-${i}`,type:'web_search',action:{type}}}]),{type:'turn.completed'}].map(JSON.stringify).join('\n');
async function baseFixture(t,{mismatch=true,alterOutput=()=>{}}={}) {
  const now=new Date();
  const [revalidation,fetcher,exec,contracts,daily,store]=await modules,root=await fs.mkdtemp(path.join(os.tmpdir(),'dbr-consult-fabricated-'));
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('dbr-consult-fabricated-'));await fs.rm(root,{recursive:true,force:true});});
  const stateRoot=path.join(root,'private-content/automation/service-supervisor/state'),pointer={sourceRevision:'b'.repeat(40),manifestSha256:'c'.repeat(64),configSha256:'d'.repeat(64)},
    config={stage:'C',maxReadingsPerWake:1,sourceRevision:pointer.sourceRevision,henryRuntime:{sourceRevision:'1'.repeat(40),manifestSha256:'2'.repeat(64),configSha256:'3'.repeat(64)},children:{sourceAccessMode:'code_consultation'}},ctx={projectRoot:root,releaseRoot:repo,stateRoot,config},
    plan=JSON.parse(await fs.readFile(path.join(repo,'config/active-calendar/celebration-bridge-long-term-active.json'))),entry=plan.entries.find(e=>e.readingId==='LTP-0028-GEN-016'),
    rolling=await import('../../scripts/lib/rolling-study-work-order.mjs'),appConfig=JSON.parse(await fs.readFile(path.join(repo,'fixtures/pilot-content/app-config.json'))),
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

module.exports={baseFixture,repo,url};
