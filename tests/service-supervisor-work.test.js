const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const modules=Promise.all(['work','store','runtime','contracts'].map(name=>import(`../scripts/lib/service-supervisor-${name}.mjs`)));
const now=new Date('2026-10-10T16:00:00Z'),repo=path.resolve(__dirname,'..'),
  sourceIds=['FABRICATED-henry','FABRICATED-independent'],urls=['https://example.invalid/FABRICATED-henry','https://example.invalid/FABRICATED-independent'];
async function fixture(t,{changes=false,alwaysChanges=false,malformed=false,prefixShape=false,retainedReady=null}={}) {
  const [work,store,runtime,contracts]=await modules,root=await fs.mkdtemp(path.join(os.tmpdir(),'dbr-work-fabricated-'));
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('dbr-work-fabricated-'));await fs.rm(root,{recursive:true,force:true});});
  const releaseRoot=path.join(root,'release'),write=async(relative,value)=>store.durableWrite(root,relative,Buffer.isBuffer(value)?value:store.jsonBytes(value));
  for(const file of ['schemas/source.schema.json','schemas/commentary.schema.json','schemas/rolling-study-work-order.schema.json',
    'schemas/service-supervisor-editorial-approval.schema.json','schemas/service-supervisor-daily-state.schema.json','config/daily-study-protocol.json',
    'docs/EDITORIAL_STANCE.md','docs/CONTENT_AND_RIGHTS.md','docs/COMMENTARY_WORKFLOW.md','.agents/skills/draft-daily-commentary/SKILL.md'])
    await write(`release/${file}`,await fs.readFile(path.join(repo,file)));
  const plan=prefixShape?JSON.parse(await fs.readFile(path.join(repo,'config/active-calendar/celebration-bridge-long-term-active.json'))):
    {planVersion:'FABRICATED-plan',bookMetrics:{},entries:Array.from({length:8},(_,i)=>({planVersion:'FABRICATED-plan',
    dayIndex:i+1,readingId:`FABRICATED-${i}`,kind:'chapter',passages:[{bookId:'NAM',chapter:1,verseCount:1}]}))};
  plan.calendarRevision=store.digest(Buffer.from(JSON.stringify(plan.entries)));
  await write('release/config/active-calendar/celebration-bridge-long-term-active.json',plan);
  await write('release/fixtures/pilot-content/plan.json',{...plan,entries:prefixShape?plan.entries.slice(0,55):[]});
  await write('release/fixtures/pilot-content/app-config.json',{sharedStartDate:prefixShape?'2026-08-08':'2026-10-10',futureLookaheadDays:7,testingReadingIds:[]});
  const prepared=prefixShape?plan.entries.slice(0,66):[];
  await write('private-content/private-manifest.json',{readings:Object.fromEntries(prepared.map(e=>[e.readingId,{}]))});
  for(const entry of prepared) {
    const prose=Buffer.from(`FABRICATED prior non-Scripture study ${entry.readingId}`),metadata={readingId:entry.readingId,publicationStatus:'published',
      generation:{contentProtocolVersion:'daily-study-protocol/v1',contentHash:store.digest(prose),humanReviewStatus:'in_review'},
      componentAssessments:{historicalContext:{status:'not_material',rationale:'FABRICATED no material historical context.'}},
      verseCommentaries:(entry.passages||[]).map(()=>({review_status:'in_review',label:'FABRICATED prior reviewed layer'}))};
    await write(`private-content/bridge/celebration-y3q4/${entry.readingId}.md`,prose);
    await write(`private-content/bridge/celebration-y3q4/${entry.readingId}.metadata.json`,metadata);
  }
  await write('research/working/bridge-source-registry.json',{schemaVersion:'source-registry/v1',registryVersion:'FABRICATED-initial',updatedAt:null,sources:[]});
  const mapping=[];
  for(const lane of ['daily','henry_primary','henry_recovery','review']) {
    const definition={name:`FABRICATED ${lane}`,kind:'cron',status:'ACTIVE',rrule:'FREQ=DAILY;BYHOUR=3',model:'gpt-6.1-sol',reasoning_effort:'high',
      execution_environment:'local',prompt:'FABRICATED thin prompt',cwds:[root]},file=path.join(root,`automations/${lane}.toml`);
    await write(`automations/${lane}.toml`,Buffer.from(Object.entries(definition).map(([k,v])=>`${k} = ${JSON.stringify(v)}`).join('\n')+
      '\ntarget = { type = "project", project_id = "FABRICATED-project" }\n'));mapping.push({lane,file});
  }
  const config={stage:'C',sourceRevision:'a'.repeat(40),maxReadingsPerWake:1,automations:await runtime.captureInventory(mapping),
    children:{codexExecutable:path.join(root,'FABRICATED-codex.exe'),sourceAccessMode:'cli_content'}},
    ctx={projectRoot:root,releaseRoot,stateRoot:path.join(root,'private-content/automation/service-supervisor/state'),config};
  const window=prefixShape?plan.entries.slice(63,71):plan.entries,missing=window.filter(e=>!prepared.some(p=>p.readingId===e.readingId)).map(e=>e.readingId),
    health={effectiveDate:'2026-10-10',target:8,readingIds:window.map(e=>e.readingId),missingPreparedReadingIds:missing,
    missingPayloadReadingIds:[],componentFailures:[],currentHorizonHenryLayer:{status:'unavailable',fallbackReadingIds:[],unavailableReadingIds:[...missing]}};
  const validationPlans=[];
  let libraryReady=false,authors=0,reviews=0,researches=0,syntheses=0,validated=0;
  const foundation={sourceId:sourceIds[0],sourceUrl:urls[0],locator:`${urls[0]} [FABRICATED chapter 1]`,verifiedAt:now.toISOString(),
    atoms:[{id:'FABRICATED-atom',text:'FABRICATED source evidence',sha256:store.digest(Buffer.from('FABRICATED source evidence'))}],
    sourceEvidence:{kind:'local_verified_henry',sourceId:sourceIds[0],locator:`${urls[0]} [FABRICATED chapter 1]`,eventId:'FABRICATED-local',
      url:urls[0],returnedContent:'FABRICATED source evidence',contentSha256:store.digest(Buffer.from('FABRICATED source evidence'))}};
  const source=(i)=>({sourceId:sourceIds[i],title:`FABRICATED work ${i}`,authorOrOrganization:`FABRICATED author ${i}`,edition:'FABRICATED edition',
    publicationDate:null,publisher:'FABRICATED publisher',resourceType:'FABRICATED commentary',traditionOrPerspective:['FABRICATED historical'],
    scope:'FABRICATED chapter 1',urlOrCitation:i?urls[i]:foundation.locator,accessDate:'2026-10-10',accessMethod:'FABRICATED verified page',
    rightsStatus:'public_domain',license:'FABRICATED public-domain license',allowedUses:['original synthesis'],rawTextStorageAllowed:false,
    summaryUseStatus:'consulted',qualityTier:'primary',includedReadings:[],notes:'FABRICATED source; no actual Scripture.'});
  const exec={clock:()=>now,transport:async()=>({env:{},mcpNames:[],proof:{model:'gpt-6.1-sol',reasoningEffort:'high',billingRoute:'FABRICATED local test'}}),
    execute:async(_bin,argv,options)=>{
      const schema=JSON.parse(await fs.readFile(argv[argv.indexOf('--output-schema')+1])),kind=schema.properties.schemaVersion.const,
        fields={schemaVersion:kind,readingId:schema.properties.readingId.const,inputSha256:schema.properties.inputSha256.const};
      let output,items=[];
      if(kind==='daily-research/v1') {researches++;output={...fields,status:'complete',records:[0,1].map(i=>({sourceJson:JSON.stringify(source(i)),
        eventId:null,accessedUrl:urls[i],evidenceExcerpt:'FABRICATED source evidence',claimNotes:['FABRICATED supported claim'],inclusionReason:'FABRICATED fixture',
        independenceKey:`FABRICATED work ${i}`,limitations:['FABRICATED only']})),claims:[{claimId:'FABRICATED-claim',claim:'FABRICATED supported claim',sourceIds}],
        representedCategories:['FABRICATED historical'],missingCategories:[],stoppingReason:'FABRICATED no real research',limitations:['FABRICATED only']};
        items=[{id:'FABRICATED-open',type:'web_search',action:{type:'open_page',url:urls[1]},results:[{url:urls[1],content:'FABRICATED source evidence'}]}];
      } else if(kind==='daily-synthesis/v1') {syntheses++;output={...fields,metadataJson:JSON.stringify({schemaVersion:'commentary/v3',readingId:fields.readingId,
        generation:{humanReviewStatus:'unreviewed'},label:`FABRICATED study ${syntheses}`}),markdown:`FABRICATED non-Scripture study ${syntheses}`,
        includedSourceIds:sourceIds,coverageLimits:['FABRICATED only']};if(malformed&&syntheses===1)output={label:'FABRICATED malformed first response'};
      } else {reviews++;output={...fields,verdict:alwaysChanges||changes&&reviews===1?'changes_requested':'approved',
        assertions:Object.fromEntries(Object.keys(schema.properties.assertions.properties).map(k=>[k,true])),
        findings:['FABRICATED independent substantive fixture review'],corrections:[],repairPacketId:null,coverageLimits:['FABRICATED only']};}
      await fs.writeFile(argv[argv.indexOf('--output-last-message')+1],store.jsonBytes(output));
      const threadId=`FABRICATED-${kind}-${researches}-${syntheses}-${reviews}`;
      return {status:0,stderr:'',stdout:[{type:'thread.started',thread_id:threadId},...items.map(item=>({type:'item.completed',item})),
        {type:'turn.completed'}].map(JSON.stringify).join('\n')+'\n'};
    }};
  const dependencies={clock:()=>now,health:async()=>health,jobs:async()=>[],henryJob:async()=>({state:{phase:'review_pending'}}),
    dailyDependencies:{foundation:async()=>foundation,exec,attachment:async()=>{if(!libraryReady)throw Object.assign(Error('FABRICATED library absent'),{code:'MHC_READING_ABSENT'});
      return {verseCommentaries:[{label:'FABRICATED independently reviewed Henry layer'}]};},validate:async(_ctx,plan)=>{validated++;validationPlans.push({root:_ctx.publicationInputRoot,plan});}},
    dependency:async(_ctx,{journal})=>{
      const job=(await journal.load()).findLast(e=>e.kind==='daily_state').data.job;
      assert.equal(job.phase,'waiting_henry');assert.ok(job.authorSessionId);assert.equal((await journal.load()).findLast(e=>e.kind==='observation').data.selection.next.readingId,job.readingId);
      if(retainedReady)libraryReady=true;
      return {state:{phase:retainedReady||'absent'},authorization:{path:job.workOrder.path,sha256:job.workOrder.sha256,dailyJobId:job.id}};
    },authorHenry:async(_ctx,options)=>{authors++;assert.ok(options.dailyDependency);return {action:'review_handoff',published:false};},
    reviewHenry:async()=>{libraryReady=true;return {action:'publish_required',published:false};}};
  return {ctx,work,store,dependencies,validationPlans,plan,counts:()=>({authors,reviews,researches,syntheses,validated})};
}
test('new unpublished reading reaches reviewed daily handoff through one bound Henry dependency without research replay',async t=>{
  const f=await fixture(t),result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(result.action,'publish_required');assert.equal(result.runComplete,false);
  assert.deepEqual(f.counts(),{authors:1,reviews:1,researches:1,syntheses:1,validated:1});
  const job=(await (await f.store.openJournal(f.ctx.stateRoot)).load()).findLast(e=>e.kind==='daily_state').data.job;
  assert.equal(job.phase,'approved');assert.notEqual(job.authorThreadId,job.reviewerThreadId);
  const resumed=await f.work.runStageC(f.ctx,{role:'preparation',now:new Date(now.getTime()+1000)},f.dependencies);
  assert.equal(resumed.requestPath,result.requestPath);assert.deepEqual(f.counts(),{authors:1,reviews:1,researches:1,syntheses:1,validated:1});
});
test('one substantive repair is exercised then independently reviewed, and exhausted changes remain debt',async t=>{
  const f=await fixture(t,{changes:true}),result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(result.action,'publish_required');assert.deepEqual(f.counts(),{authors:1,reviews:2,researches:1,syntheses:2,validated:2});
  const g=await fixture(t,{alwaysChanges:true}),blocked=await g.work.runStageC(g.ctx,{role:'preparation',now},g.dependencies);
  assert.equal(blocked.action,'checkpointed');assert.equal(blocked.code,'SUPERVISOR_DAILY_REVIEW_CHANGES_REQUIRED');
  const prior=g.counts();await g.work.runStageC(g.ctx,{role:'preparation',now},g.dependencies);assert.deepEqual(g.counts(),prior);
});
test('one malformed synthesis is repaired against exact failed output without dispatch budget renewal',async t=>{
  const f=await fixture(t,{malformed:true}),result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(result.action,'publish_required');assert.deepEqual(f.counts(),{authors:1,reviews:1,researches:1,syntheses:2,validated:1});
  const events=await (await f.store.openJournal(f.ctx.stateRoot)).load();assert.equal(events.filter(e=>e.kind==='daily_repair_reserved').length,1);
});
for(const phase of ['approved','publishing'])test(`retained ${phase} dependency resumes daily review without another Henry author`,async t=>{
  const f=await fixture(t,{retainedReady:phase}),result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(result.action,'publish_required',result.code);assert.deepEqual(f.counts(),{authors:0,reviews:1,researches:1,syntheses:1,validated:1});
});
test('actual calendar shape reconciles 55 tracked/66 published readings and stages only GEN16 as the 67th private entry',async t=>{
  const f=await fixture(t,{prefixShape:true}),result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(result.action,'publish_required',result.code);const snapshot=f.validationPlans[0];
  assert.equal(snapshot.plan.entries.length,67);assert.deepEqual(snapshot.plan.entries,f.plan.entries.slice(0,67));
  assert.equal(snapshot.plan.entries.at(-1).readingId,'LTP-0028-GEN-016');
  const dir=path.join(snapshot.root,'private-content/bridge/celebration-y3q4'),names=await fs.readdir(dir);
  assert.equal(names.length,134);assert.equal(names.some(n=>n.startsWith(f.plan.entries[67].readingId)),false);
  const manifest=await f.store.readPrivate(f.ctx.projectRoot,'private-content/private-manifest.json');assert.equal(Object.keys(manifest.readings).length,66);
  assert.deepEqual(f.counts(),{authors:1,reviews:1,researches:1,syntheses:1,validated:1});
});
test('four-lane round trip maps native state without resetting attempts and parks unsupported daily work',async t=>{
  const f=await fixture(t),{fourLaneCompatibility}=await import('../scripts/lib/service-supervisor-compatibility.mjs'),
    native=await import('../scripts/lib/mhc-v2-service.mjs'),nativeStore=await import('../scripts/lib/mhc-v2-store.mjs'),
    {digestObject}=await import('../scripts/lib/mhc-v2.mjs'),jobRoot=path.join(f.ctx.projectRoot,'private-content/automation/mhc-v2');
  const input={schema_version:'mhc-reading-input/v2',reading_id:'FABRICATED-native',plan_version:'FABRICATED-plan',schedule_date:'2026-10-10',
    source_archive_sha256:'b'.repeat(64),chapters:[{book_id:'NAM',chapter:1,batches:[{packet_id:`MHP2-${'c'.repeat(32)}`}]}]};
  input.input_sha256=digestObject(input);let job=await nativeStore.createJob(jobRoot,input,now,{spark:'gpt-6-luna',luna:'gpt-5.6-luna'});
  job=await nativeStore.appendState(job,'FABRICATED-retained-state',{...job.state,phase:'fallback_pending',total_submissions:2,
    rejected:{[`${input.chapters[0].batches[0].packet_id}:spark`]:['d'.repeat(64),'e'.repeat(64)]},blocker:{code:'V2_CANDIDATE_EXHAUSTED'}},now);
  const a=await fourLaneCompatibility(f.ctx),legacy=await native.statusV2({projectRoot:f.ctx.projectRoot,jobRoot,launcher:'FABRICATED-launcher'}),
    b=await fourLaneCompatibility(f.ctx),restored=await nativeStore.loadJob(job.directory);
  assert.deepEqual(a,b);assert.equal(legacy.readings[0].totalSubmissions,2);assert.equal(restored.previous,job.previous);
  assert.deepEqual(restored.state.rejected,job.state.rejected);assert.equal(a.henry[0].requiredLane,'luna');
  const result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);assert.equal(result.action,'publish_required');
  const parked=await fourLaneCompatibility(f.ctx);assert.equal(parked.oldDailyAuthorAllowed,false);assert.equal(parked.daily[0].disposition,'park_no_replay');
  const journal=await f.store.openJournal(f.ctx.stateRoot),lease=await journal.acquire('preparation',{now}),
    dailyJob=(await journal.load()).findLast(e=>e.kind==='daily_state').data.job;
  await journal.append('daily_state',{job:{...dailyJob,phase:'published'}},now,lease);await journal.release(lease,now);
  const completed=await fourLaneCompatibility(f.ctx);assert.equal(completed.oldDailyAuthorAllowed,true);assert.equal(completed.daily[0].disposition,'preserve_published');
});

test('D resumes the same bounded wake through three completed reading handoffs and stops before a fourth author',async t=>{
  const f=await fixture(t);f.ctx.config.stage='D';f.ctx.config.maxReadingsPerWake=3;
  for(const a of f.ctx.config.automations)if(a.lane.startsWith('henry_'))await fs.writeFile(a.file,(await fs.readFile(a.file,'utf8')).replace('status = "ACTIVE"','status = "PAUSED"'));
  f.ctx.config.automations=await (await modules)[2].captureInventory(f.ctx.config.automations.map(({lane,file})=>({lane,file})));
  const health=await f.dependencies.health(),journal=await f.store.openJournal(f.ctx.stateRoot);let authors=0,wakeId;
  const deps={...f.dependencies,order:async()=>({reading:{readingId:health.missingPreparedReadingIds[0]}}),daily:async(_ctx,{order})=>{
    authors++;const requestPath=`private-content/automation/staging/${order.reading.readingId}/FABRICATED-request.json`,
      request={readingId:order.reading.readingId,component:'daily',approvalSha256:'f'.repeat(64)};
    await f.store.durableWrite(f.ctx.projectRoot,requestPath,f.store.jsonBytes(request));return {action:'publish_required',requestPath};
  }};
  for(let i=0;i<3;i++) {
    const result=await f.work.runStageC(f.ctx,{role:'preparation',now},deps);assert.equal(result.action,'publish_required',JSON.stringify({i,code:result.code}));
    if(i===0)wakeId=result.wakeId;else assert.equal(result.wakeId,wakeId);
    const request=await f.store.readPrivate(f.ctx.projectRoot,result.requestPath),transactionId=String(i+1).repeat(32);
    await f.work.bindWakePublication(f.ctx,wakeId,transactionId,now);
    await journal.append('publication_state',{transaction:{id:transactionId,kind:'reading',component:'daily',readingId:request.readingId,
      role:'preparation',sourceRevision:f.ctx.config.sourceRevision,phase:'complete',approval:{sha256:request.approvalSha256}}},now);
    health.missingPreparedReadingIds.shift();health.currentHorizonHenryLayer.unavailableReadingIds.shift();
  }
  const done=await f.work.runStageC(f.ctx,{role:'preparation',now},deps);assert.equal(done.runComplete,true);assert.equal(done.action,'complete');
  assert.equal(done.wakeId,wakeId);assert.equal(authors,3);
  const wake=(await journal.load()).findLast(e=>e.kind==='wake_state').data.wake;
  assert.equal(wake.completed.length,3);assert.equal(wake.readingIds.length,3);assert.equal(wake.deadline,new Date(now.getTime()+90*60000).toISOString());
});
