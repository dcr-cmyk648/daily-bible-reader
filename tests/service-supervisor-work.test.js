const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const modules=Promise.all(['work','store','runtime','contracts'].map(name=>import(`../scripts/lib/service-supervisor-${name}.mjs`)));
const now=new Date('2026-10-10T16:00:00Z'),repo=path.resolve(__dirname,'..'),
  sourceIds=['FABRICATED-henry','FABRICATED-independent'],urls=['https://example.invalid/FABRICATED-henry','https://example.invalid/FABRICATED-independent'];
async function fixture(t,{changes=false,alwaysChanges=false,malformed=false,prefixShape=false,retainedReady=null,legacyBibliography=false,sourceMode='cli_content',unconsultedCitation=false,priorSourceBudget=false,fullLink=false}={}) {
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
    children:{codexExecutable:path.join(root,'FABRICATED-codex.exe'),sourceAccessMode:sourceMode}},
    ctx={projectRoot:root,releaseRoot,stateRoot:path.join(root,'private-content/automation/service-supervisor/state'),config};
  const window=prefixShape?plan.entries.slice(63,71):plan.entries,missing=window.filter(e=>!prepared.some(p=>p.readingId===e.readingId)).map(e=>e.readingId),
    health={effectiveDate:'2026-10-10',target:8,readingIds:window.map(e=>e.readingId),missingPreparedReadingIds:missing,
    missingPayloadReadingIds:[],componentFailures:[],currentHorizonHenryLayer:{status:'unavailable',fallbackReadingIds:[],unavailableReadingIds:[...missing]}};
  const validationPlans=[];
  let libraryReady=false,authors=0,reviews=0,researches=0,syntheses=0,validated=0;
  const foundation={sourceId:sourceIds[0],sourceUrl:urls[0],locator:`${urls[0]} [FABRICATED chapter 1]`,verifiedAt:now.toISOString(),
    license:'FABRICATED public domain',archiveSha256:'f'.repeat(64),
    atoms:[{id:'FABRICATED-atom',text:'FABRICATED source evidence',sha256:store.digest(Buffer.from('FABRICATED source evidence'))}],
    sourceEvidence:{kind:'local_verified_henry',sourceId:sourceIds[0],locator:`${urls[0]} [FABRICATED chapter 1]`,eventId:'FABRICATED-local',
      url:urls[0],returnedContent:'FABRICATED source evidence',contentSha256:store.digest(Buffer.from('FABRICATED source evidence'))}};
  const source=(i)=>({sourceId:sourceIds[i],title:`FABRICATED work ${i}`,authorOrOrganization:`FABRICATED author ${i}`,edition:'FABRICATED edition',
    publicationDate:null,publisher:'FABRICATED publisher',resourceType:'FABRICATED commentary',traditionOrPerspective:['FABRICATED historical'],
    scope:'FABRICATED chapter 1',urlOrCitation:i?urls[i]:foundation.locator,accessDate:'2026-10-10',accessMethod:'FABRICATED verified page',
    rightsStatus:'public_domain',license:'FABRICATED public-domain license',allowedUses:['original synthesis'],rawTextStorageAllowed:false,
    summaryUseStatus:'consulted',qualityTier:'primary',includedReadings:[],notes:'FABRICATED source; no actual Scripture.'});
  const fallbackId='FABRICATED-full-Henry',fallbackUrl='https://example.invalid/FABRICATED-complete-Henry-chapter',
    includedIds=fullLink?[...sourceIds,fallbackId]:sourceIds,
    fullSource={...source(1),sourceId:fallbackId,title:'FABRICATED Matthew Henry Complete Commentary',
      authorOrOrganization:'Matthew Henry (FABRICATED test record)',urlOrCitation:fallbackUrl},
    link={sourceId:fallbackId,title:'FABRICATED full chapter',url:fallbackUrl,note:'FABRICATED complete chapter fallback; no real source or Scripture.'};
  const legacy=legacyBibliography?{...source(0),sourceId:'FABRICATED-retained-bibliography',urlOrCitation:'https://example.invalid/FABRICATED-retained',
    title:'FABRICATED ESV Study Bible',edition:'FABRICATED bibliographic copyright © 2008 Crossway, ESV Study Bible edition.'}:null;
  if(legacy)await store.durableWrite(root,'research/working/bridge-source-registry.json',store.jsonBytes({schemaVersion:'source-registry/v1',registryVersion:'FABRICATED-initial',updatedAt:null,sources:[legacy]}),{immutable:false});
  const exec={clock:()=>now,transport:async()=>({env:{},mcpNames:[],proof:{model:'gpt-6.1-sol',reasoningEffort:'high',billingRoute:'FABRICATED local test'}}),
    execute:async(_bin,argv,options)=>{
      const schema=JSON.parse(await fs.readFile(argv[argv.indexOf('--output-schema')+1])),kind=schema.properties.schemaVersion.const,
        fields={schemaVersion:kind,readingId:schema.properties.readingId.const,inputSha256:schema.properties.inputSha256.const};
      let output,items=[];
      if(kind==='daily-research/v1') {researches++;output={...fields,status:'complete',records:[0,1].map(i=>({sourceJson:JSON.stringify(source(i)),
        eventId:null,accessedUrl:urls[i],evidenceExcerpt:'FABRICATED source evidence',claimNotes:['FABRICATED supported claim'],inclusionReason:'FABRICATED fixture',
        independenceKey:`FABRICATED work ${i}`,limitations:['FABRICATED only']})),claims:[{claimId:'FABRICATED-claim',claim:'FABRICATED supported claim',sourceIds}],
        representedCategories:['FABRICATED historical'],missingCategories:[],stoppingReason:'FABRICATED no real research',limitations:['FABRICATED only']};
        if(fullLink)output.records.push({...output.records[1],sourceJson:JSON.stringify(fullSource),accessedUrl:fallbackUrl});
        if(unconsultedCitation)output.records.push({...output.records[1],sourceJson:JSON.stringify({...source(1),sourceId:'FABRICATED-unconsulted',
          urlOrCitation:'https://example.invalid/FABRICATED-unconsulted',summaryUseStatus:'discovered'})});
        items=sourceMode==='code_consultation'?['search','other','find_in_page'].map((type,i)=>({id:`FABRICATED-web-${i}`,type:'web_search',action:{type}})):
          [{id:'FABRICATED-open',type:'web_search',action:{type:'open_page',url:urls[1]},results:[{url:urls[1],content:'FABRICATED source evidence'}]}];
        if(fullLink)items.push({id:'FABRICATED-full-open',type:'web_search',action:{type:'open_page',url:fallbackUrl},
          results:[{url:fallbackUrl,content:'FABRICATED source evidence'}]});
      } else if(kind==='daily-synthesis/v1') {syntheses++;output={...fields,metadataJson:JSON.stringify({schemaVersion:'commentary/v3',readingId:fields.readingId,
        generation:{humanReviewStatus:'unreviewed'},label:`FABRICATED study ${syntheses}`,...(fullLink?{henrySourceLink:link}:{})}),markdown:`FABRICATED non-Scripture study ${syntheses}`,
          includedSourceIds:unconsultedCitation?[...includedIds,'FABRICATED-unconsulted']:includedIds,coverageLimits:['FABRICATED only']};if(malformed&&syntheses===1)output={label:'FABRICATED malformed first response'};
      } else {reviews++;output={...fields,verdict:alwaysChanges||changes&&reviews===1?'changes_requested':'approved',
        assertions:Object.fromEntries(Object.keys(schema.properties.assertions.properties).map(k=>[k,true])),
        findings:['FABRICATED independent substantive fixture review'],corrections:[],repairPacketId:null,coverageLimits:['FABRICATED only']};}
      await fs.writeFile(argv[argv.indexOf('--output-last-message')+1],store.jsonBytes(output));
      const threadId=`FABRICATED-${kind.replaceAll('/','-')}-${researches}-${syntheses}-${reviews}`;
      return {status:0,stderr:'',stdout:[{type:'thread.started',thread_id:threadId},...items.map(item=>({type:'item.completed',item})),
        {type:'turn.completed'}].map(JSON.stringify).join('\n')+'\n'};
    }};
  const dependencies={clock:()=>now,health:async()=>health,jobs:async()=>[],henryJob:async()=>({state:{phase:'review_pending'}}),
    dailyDependencies:{sourceRuntime:async()=>({releaseRoot,config,pointer:{sourceRevision:config.sourceRevision,manifestSha256:'f'.repeat(64),configSha256:store.digest(store.jsonBytes(config))}}),foundation:async(_ctx)=>{
      if(priorSourceBudget){const journal=await store.openJournal(_ctx.stateRoot),job=(await journal.load()).findLast(e=>e.kind==='daily_state').data.job;
        for(let i=0;i<64;i++)await journal.append('source_fetch_reserved',{jobId:job.id,wakeId:'FABRICATED-prior-wake',ordinal:i+1},now);}
      return foundation;},exec,fetchSource:async value=>({kind:'bounded_anonymous_https',url:value,finalUrl:value,
      redirects:[],contentSha256:store.digest(Buffer.from('FABRICATED source evidence')),normalizedTextSha256:store.digest(Buffer.from('FABRICATED source evidence')),
      normalization:'html-text/v1',returnedContent:'FABRICATED source evidence',rawBodyStored:false,accessedAt:now.toISOString()}),
      attachment:async()=>{if(!libraryReady)throw Object.assign(Error('FABRICATED library absent'),{code:'MHC_READING_ABSENT'});
      return {verseCommentaries:[{label:'FABRICATED independently reviewed Henry layer'}]};},validate:async(_ctx,plan)=>{validated++;validationPlans.push({root:_ctx.publicationInputRoot,plan});}},
    dependency:async(_ctx,{journal})=>{
      const job=(await journal.load()).findLast(e=>e.kind==='daily_state').data.job;
      assert.equal(job.phase,'waiting_henry');assert.ok(job.authorSessionId);assert.equal((await journal.load()).findLast(e=>e.kind==='observation').data.selection.next.readingId,job.readingId);
      if(retainedReady)libraryReady=true;
      return {state:{phase:retainedReady||'absent'},authorization:{path:job.workOrder.path,sha256:job.workOrder.sha256,dailyJobId:job.id}};
    },authorHenry:async(_ctx,options)=>{authors++;assert.ok(options.dailyDependency);return {action:'review_handoff',published:false};},
    reviewHenry:async()=>{libraryReady=true;return {action:'publish_required',published:false};}};
  if(fullLink)delete dependencies.dailyDependencies.attachment;
  return {ctx,work,store,dependencies,validationPlans,plan,health,legacy,counts:()=>({authors,reviews,researches,syntheses,validated})};
}
test('retained copyright bibliography survives full research, synthesis, Henry dependency and independent daily review',async t=>{
  const f=await fixture(t,{legacyBibliography:true}),result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(result.action,'publish_required',result.code);assert.deepEqual(f.counts(),{authors:1,reviews:1,researches:1,syntheses:1,validated:1});
  const registry=JSON.parse(await fs.readFile(path.join(f.ctx.projectRoot,'research/working/bridge-source-registry.json')));
  assert.deepEqual(registry.sources.find(s=>s.sourceId===f.legacy.sourceId),f.legacy);
});
test('explicit code consultation handles actual-shaped discovery through the complete GEN16 daily dependency and independent review',async t=>{
  const f=await fixture(t,{sourceMode:'code_consultation',prefixShape:true,legacyBibliography:true}),result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(result.action,'publish_required',result.code);
  assert.deepEqual(f.counts(),{authors:1,reviews:1,researches:1,syntheses:1,validated:1});
  const events=await (await f.store.openJournal(f.ctx.stateRoot)).load(),reservations=events.filter(e=>e.kind==='source_fetch_reserved');
  assert.equal(events.findLast(e=>e.kind==='daily_state').data.job.readingId,'LTP-0028-GEN-016');
  assert.equal(reservations.length,1);assert.equal(reservations[0].data.eventId,null);
});

test('normal daily source budget retains the same job counts across previous wakes before another source request',async t=>{
  const f=await fixture(t,{sourceMode:'code_consultation',priorSourceBudget:true}),r=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(r.outcome,'blocked');assert.equal(r.code,'SUPERVISOR_SOURCE_FETCH_BUDGET_EXHAUSTED');assert.equal(f.counts().syntheses,0);
  const events=await (await f.store.openJournal(f.ctx.stateRoot)).load();assert.equal(events.filter(e=>e.kind==='source_fetch_reserved').length,64);
  assert.equal(events.filter(e=>e.kind==='source_attempt_reserved').length,0);
});
test('synthesis cannot turn an unconsulted discovery record into an included source reference',async t=>{
  const f=await fixture(t,{sourceMode:'code_consultation',unconsultedCitation:true}),result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(result.code,'SUPERVISOR_DAILY_CITATION_UNCONSULTED');assert.deepEqual(f.counts(),{authors:0,reviews:0,researches:1,syntheses:1,validated:0});
});
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
test('retained legacy dependency finalizes interrupted native approval before default daily attachment and full-study review',async t=>{
  const f=await fixture(t),[service,author,runner,henry,nativeStore,pipeline]=await Promise.all(
    ['mhc-v2-service','mhc-v2-author-session','mhc-native-runner','service-supervisor-henry','mhc-v2-store','mhc-pipeline']
      .map(n=>import(`../scripts/lib/${n}.mjs`)));
  for(const name of ['schemas','prompts'])await fs.cp(path.join(repo,name),path.join(f.ctx.releaseRoot,name),{recursive:true});
  f.ctx.config.children.codexExecutable=process.execPath;
  const archive=Buffer.from('FABRICATED local archive bytes; no actual Scripture or commentary');
  await f.store.durableWrite(f.ctx.projectRoot,'research/raw/matthew-henry/crosswire/MHC-2.2.zip',archive);
  const manifest={source_id:'fabricated-henry',work_title:'FABRICATED TEST COMMENTARY',module_name:'MHC',module_version:'2.2',
    source_version_date:'2026-01-01',retrieved_at:'2026-01-01',license:'Public domain FABRICATED TEST',archive_sha256:f.store.digest(archive),
    source_format:'CrossWire SWORD zCom4 OSIS',versification:'KJV',source_url:'https://example.invalid/fabricated',download_url:'https://example.invalid/fabricated.zip'},
    text='FABRICATED TEST COMMENTARY: the caretaker distributes parcels to needy households. Patient kindness benefits the village during its difficult season.',
    hash=pipeline.sha256(text),{source_id,work_title,...provenance}=manifest,
    unit={schema_version:'mhc-normalized-source/v3',source_id,work_title,source_unit_id:'FABRICATED:NAM:1:1',book_id:'NAM',chapter:1,
      verse_start:1,verse_end:1,reference_label:'FABRICATED 1:1',unit_type:'verse_range',source_text:text,source_text_sha256:hash,
      source_atoms:[{source_atom_id:'FABRICATED-atom',sequence:1,atom_type:'commentary',text,text_sha256:hash}],worker_source_sha256:hash,
      excluded_scripture_sha256:null,verse_anchors:[],provenance};
  await f.store.durableWrite(f.ctx.projectRoot,'private-commentary/mhc/source-manifest.json',f.store.jsonBytes(manifest));
  await f.store.durableWrite(f.ctx.projectRoot,'private-commentary/mhc/normalized/NAM/001.jsonl',Buffer.from(JSON.stringify(unit)+'\n'));
  await f.store.durableWrite(f.ctx.projectRoot,'private-commentary/mhc/normalized/NAM/001.manifest.json',f.store.jsonBytes({
    source_archive_sha256:manifest.archive_sha256,book_id:'NAM',chapter:1,indexed_verse_count:1,normalized_batch_sha256:pipeline.normalizedBatchHash([unit])}));
  const native=await service.serviceContext({projectRoot:f.ctx.projectRoot,releaseRoot:f.ctx.releaseRoot,
    runtimeRoot:path.join(f.ctx.projectRoot,'private-content/automation/mhc-runtime'),launcher:path.join(f.ctx.projectRoot,'FABRICATED-launcher.mjs'),
    config:{author_model:'gpt-6-luna',spark_automation_id:'FABRICATED-primary',luna_automation_id:'FABRICATED-fallback'}}),
    binding={native,service,author,runner,pointer:{source_revision:'a'.repeat(40)}};
  await fs.mkdir(native.runtimeRoot,{recursive:true});let calls=0;
  const run=(_exe,args,opts)=>{
    if(args[0]==='--version')return {status:0,stdout:'codex-cli 0.162.1'};
    if(args[0]==='login')return {status:0,stderr:'Logged in using ChatGPT'};
    if(args.includes('mcp'))return {status:0,stdout:'[]'};
    const file=args[args.indexOf('--output-last-message')+1];
    if(opts.input.startsWith('Availability preflight')){require('node:fs').writeFileSync(file,JSON.stringify({ok:true}));return {status:0,stdout:'{"type":"turn.completed"}\n'};}
    calls++;const packet=JSON.parse(opts.input.split('SOURCE PACKET:\n')[1].split('\n\n')[0]);
    require('node:fs').writeFileSync(file,nativeStore.bytesFor({schema_version:'mhc-evidence-candidate/v2',packet_id:packet.packet_id,
      records:packet.requests.map(r=>({verse_id:r.verse_id,sentences:[{text:'FABRICATED: a thoughtful village helper hands out supplies, easing the hardship faced by local families.',evidence_ids:[r.evidence_ids[0]]}]}))}));
    return {status:0,stdout:'{"type":"thread.started","thread_id":"FABRICATED-native-author"}\n{"type":"turn.completed"}\n'};
  };
  const deps={...f.dependencies,henry:{binding:async()=>binding,transport:async()=>({billingRoute:'FABRICATED local fixture'}),run,
    exec:f.dependencies.dailyDependencies.exec},dailyDependencies:{...f.dependencies.dailyDependencies},
    dependency:henry.prepareHenryDependency,authorHenry:henry.runHenryWork,reviewHenry:henry.reviewHenryWork,
    henryJob:async()=>nativeStore.loadJob(path.join(native.jobRoot,'FABRICATED-0'))};
  // Explicitly seed the retained legacy waiting_henry route. New daily work
  // with no library uses a verified full link instead of creating this debt.
  const legacyDependency=()=>{deps.dailyDependencies.attachment=async()=>{
    delete deps.dailyDependencies.attachment;
    throw Object.assign(Error('FABRICATED retained legacy dependency'),{code:'MHC_READING_ABSENT'});
  };};
  legacyDependency();
  const interrupted=path.join(native.jobRoot,'FABRICATED-0','transactions');let fixtureError;
  deps.reviewHenry=async(...args)=>{
    await fs.writeFile(interrupted,'FABRICATED interruption before native transaction/library finalization');
    try{return await henry.reviewHenryWork(...args);}catch(e){fixtureError=e;throw e;}
  };
  const blocked=await f.work.runStageC(f.ctx,{role:'preparation',now},deps);assert.equal(blocked.action,'blocked');
  assert.equal(blocked.code,'EEXIST',fixtureError?.stack||JSON.stringify(blocked));
  const retained=await nativeStore.loadJob(path.join(native.jobRoot,'FABRICATED-0'));
  assert.equal(retained.state.phase,'approved');assert.equal(retained.state.total_submissions,1);assert.equal(calls,1);
  await assert.rejects(fs.access(path.join(f.ctx.projectRoot,'private-commentary/mhc/stores/library/current.json')));
  const decision=await fs.readFile(path.join(retained.directory,'review.json')),approvedSha=retained.state.review.approved_sha256;
  assert.equal(path.dirname(interrupted),retained.directory);await fs.unlink(interrupted);
  for(const key of ['dependency','daily']){const original=deps[key]||((await import('../scripts/lib/service-supervisor-daily.mjs')).runDailyWork);
    deps[key]=async(...args)=>{try{return await original(...args);}catch(e){fixtureError=e;throw e;}};}
  legacyDependency();
  const result=await f.work.runStageC(f.ctx,{role:'preparation',now},deps);assert.equal(result.action,'publish_required',fixtureError?.stack||result.code);
  const resumed=await nativeStore.loadJob(retained.directory);assert.equal(resumed.state.phase,'publishing');
  assert.equal(resumed.state.total_submissions,1);assert.equal(resumed.state.review.approved_sha256,approvedSha);assert.equal(calls,1);
  assert.deepEqual(await fs.readFile(path.join(retained.directory,'review.json')),decision);
  assert.deepEqual(f.counts(),{authors:0,reviews:2,researches:1,syntheses:1,validated:1});
  const journal=await f.store.openJournal(f.ctx.stateRoot),events=await journal.load(),daily=events.findLast(e=>e.kind==='daily_state').data.job,
    request=await f.store.readPrivate(f.ctx.projectRoot,result.requestPath);
  assert.equal(daily.phase,'approved');assert.equal(request.component,'daily');assert.notEqual(daily.authorThreadId,daily.reviewerThreadId);
  assert.equal(events.filter(e=>e.kind==='henry_finalization_resumed').length,1);
  assert.equal((await f.work.runStageC(f.ctx,{role:'preparation',now},deps)).requestPath,result.requestPath);assert.equal(calls,1);
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
test('retained GEN15 Henry debt permits the exact GEN16 contiguous daily prefix without redispatching GEN15',async t=>{
  const f=await fixture(t,{prefixShape:true}),held=f.plan.entries[65],next=f.plan.entries[66];
  assert.equal(held.passages[0].chapter,15);assert.equal(next.passages[0].chapter,16);
  f.dependencies.jobs=async()=>[{readingId:held.readingId,component:'henry',phase:'blocked',blocker:{scope:'reading',terminal:true,
    code:'SUPERVISOR_CHILD_REPAIR_EXHAUSTED',proof:{sha256:'f'.repeat(64)}}}];
  const oldHealth=f.dependencies.health;f.dependencies.health=async()=>{const health=structuredClone(await oldHealth());
    health.currentHorizonHenryLayer.fallbackReadingIds=[held.readingId];return health;};
  const result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);assert.equal(result.action,'publish_required',result.code);
  assert.equal(f.validationPlans[0].plan.entries.length,67);assert.equal(f.validationPlans[0].plan.entries.at(-1).readingId,next.readingId);
  const events=await (await f.store.openJournal(f.ctx.stateRoot)).load(),observation=events.findLast(e=>e.kind==='observation').data.selection;
  assert.equal(observation.next.readingId,next.readingId);assert.equal(observation.debts[0].terminal,true);
  assert.deepEqual(f.counts(),{authors:1,reviews:1,researches:1,syntheses:1,validated:1});
});
for(const phase of ['eligible','exhausted','operator_review','review_pending','approved','publishing'])
test(`today's GEN16 devotional wins over GEN15 ${phase} Henry work and uses a consulted full link`,async t=>{
  const f=await fixture(t,{prefixShape:true,fullLink:true}),held=f.plan.entries[65],next=f.plan.entries[66],
    terminal=['exhausted','operator_review'].includes(phase),job={readingId:held.readingId,component:'henry',
      phase:terminal?'review_pending':phase==='eligible'?'queued':phase,...(terminal?{blocker:{scope:'reading',terminal:true,
        code:'SUPERVISOR_CHILD_REPAIR_EXHAUSTED',proof:{sha256:'f'.repeat(64)}},operatorReviewEligible:phase==='operator_review'}:{})};
  assert.equal(held.readingId,'LTP-0027-GEN-015');assert.equal(next.readingId,'LTP-0028-GEN-016');
  f.health.currentHorizonHenryLayer.fallbackReadingIds=[held.readingId];
  f.dependencies.jobs=async()=>[job];
  f.dependencies.dependency=()=>{throw Error('Henry dependency must not run');};
  f.dependencies.authorHenry=()=>{throw Error('Henry author must not run');};
  f.dependencies.reviewHenry=()=>{throw Error('Henry review must not run');};
  const result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(result.action,'publish_required',result.code);
  assert.equal(f.validationPlans[0].plan.entries.length,67);
  const journal=await f.store.openJournal(f.ctx.stateRoot),events=await journal.load(),
    observation=events.findLast(e=>e.kind==='observation').data.selection,
    daily=events.findLast(e=>e.kind==='daily_state').data.job,
    metadata=await f.store.readPrivate(daily.draft.inputRoot,daily.draft.metadataPath);
  assert.equal(observation.next.component,'daily');assert.equal(observation.next.readingId,next.readingId);
  assert.ok(observation.buffer.henryGaps.includes(held.readingId));
  assert.equal(metadata.henrySourceLink.sourceId,'FABRICATED-full-Henry');assert.equal(metadata.verseCommentaries,undefined);
  assert.equal(daily.henryApproval,undefined);assert.equal(events.some(e=>e.kind==='daily_state'&&e.data.job.phase==='waiting_henry'),false);
  assert.deepEqual(f.counts(),{authors:0,reviews:1,researches:1,syntheses:1,validated:1});
  const {verifyCurrentPublicationApproval}=await import('../scripts/lib/service-supervisor-approval.mjs'),
    transaction={kind:'reading',component:'daily',readingId:next.readingId,approval:{path:daily.approvalPath,sha256:daily.approvalSha256}};
  assert.equal((await verifyCurrentPublicationApproval(f.ctx,transaction)).kind,'daily_job');
  await fs.appendFile(path.join(f.ctx.projectRoot,daily.research.path),'FABRICATED tamper');
  await assert.rejects(verifyCurrentPublicationApproval(f.ctx,transaction),/SOURCE_EVIDENCE_CHANGED/);
});

test('Henry debt on the missing devotional itself does not block its verified full-link fallback',async t=>{
  const f=await fixture(t,{fullLink:true});f.dependencies.jobs=async()=>[{readingId:f.plan.entries[0].readingId,component:'henry',phase:'blocked',
    blocker:{scope:'reading',terminal:true,code:'SUPERVISOR_CHILD_REPAIR_EXHAUSTED',proof:{sha256:'f'.repeat(64)}}}];
  const result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(result.action,'publish_required',result.code);assert.deepEqual(f.counts(),{authors:0,reviews:1,researches:1,syntheses:1,validated:1});
});

test('absent Henry library without a verified full link fails closed without Henry author/review dispatch',async t=>{
  const f=await fixture(t);delete f.dependencies.dailyDependencies.attachment;
  const result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(result.code,'SUPERVISOR_DAILY_HENRY_FALLBACK_UNVERIFIED');
  assert.deepEqual(f.counts(),{authors:0,reviews:0,researches:1,syntheses:1,validated:0});
});

for(const artifactPresent of [false,true])test(`validated Henry catalog ${artifactPresent?'missing referenced file fails closed':'missing reading permits full-link fallback'}`,async t=>{
  const f=await fixture(t,{fullLink:true}),readingId=f.plan.entries[0].readingId,
    catalog={schema_version:'mhc-library-catalog/v1',plan_version:f.plan.planVersion,
      readings:artifactPresent?[{reading_id:readingId,file:'FABRICATED-missing.json',sha256:'f'.repeat(64)}]:[]},
    bytes=f.store.jsonBytes(catalog),pointer={schema_version:'mhc-library-pointer/v1',plan_version:f.plan.planVersion,
      catalog_file:'FABRICATED-catalog.json',catalog_sha256:f.store.digest(bytes)};
  await f.store.durableWrite(f.ctx.projectRoot,'private-commentary/mhc/stores/library/FABRICATED-catalog.json',bytes);
  await f.store.durableWrite(f.ctx.projectRoot,'private-commentary/mhc/stores/library/current.json',f.store.jsonBytes(pointer));
  const result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(result.action,artifactPresent?'blocked':'publish_required',result.code);
  assert.deepEqual(f.counts(),{authors:0,reviews:artifactPresent?0:1,researches:1,syntheses:1,validated:artifactPresent?0:1});
  const events=await (await f.store.openJournal(f.ctx.stateRoot)).load();
  assert.equal(events.some(e=>e.kind==='daily_state'&&e.data.job.phase==='waiting_henry'),false);
});

test('a corrupt newest Henry pointer cannot be hidden by an otherwise verified full link',async t=>{
  const f=await fixture(t,{fullLink:true});
  await f.store.durableWrite(f.ctx.projectRoot,'private-commentary/mhc/stores/library/current.json',Buffer.from('FABRICATED corrupt pointer'));
  const result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(result.action,'blocked');assert.deepEqual(f.counts(),{authors:0,reviews:0,researches:1,syntheses:1,validated:0});
  const events=await (await f.store.openJournal(f.ctx.stateRoot)).load();
  assert.equal(events.some(e=>e.kind==='daily_state'&&e.data.job.phase==='waiting_henry'),false);
});

test('a missing daily entry with terminal daily debt prevents skipping the broken contiguous prefix',async t=>{
  const f=await fixture(t);f.dependencies.jobs=async()=>[{readingId:f.plan.entries[0].readingId,component:'daily',phase:'blocked',
    blocker:{scope:'reading',terminal:true,code:'SUPERVISOR_CHILD_REPAIR_EXHAUSTED',proof:{sha256:'f'.repeat(64)}}}];
  const result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(result.code,'SUPERVISOR_CHILD_REPAIR_EXHAUSTED');assert.deepEqual(f.counts(),{authors:0,reviews:0,researches:0,syntheses:0,validated:0});
});
for(const guard of ['reserved','blocked','publication'])test(`forward progress never bypasses global ${guard} uncertainty or capability`,async t=>{
  const f=await fixture(t),journal=await f.store.openJournal(f.ctx.stateRoot);
  if(guard==='publication')await journal.append('publication_state',{transaction:{id:'f'.repeat(32),phase:'handoff'}},now);
  else await journal.append('execution_state',{execution:{id:'f'.repeat(32),readingId:'FABRICATED-old',kind:'independent-review',phase:guard}},now);
  const result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(result.code,guard==='publication'?'SUPERVISOR_WAKE_PUBLICATION_PENDING':guard==='reserved'?'SUPERVISOR_CHILD_DISPATCH_UNCERTAIN':'SUPERVISOR_CHILD_CAPABILITY_BLOCK_RETAINED');
  assert.deepEqual(f.counts(),{authors:0,reviews:0,researches:0,syntheses:0,validated:0});
});
test('retained outside-window Henry debt prevents historical selection and healthy no-op in Stage D',async t=>{
  const f=await fixture(t);f.ctx.config.stage='D';f.ctx.config.maxReadingsPerWake=3;
  const prior=f.dependencies.health;f.dependencies.health=async()=>({...await prior(),status:'ready',missingPreparedReadingIds:[],
    currentHorizonHenryLayer:{status:'complete',fallbackReadingIds:[],unavailableReadingIds:[]}});
  f.dependencies.jobs=async()=>[{readingId:'FABRICATED-earlier',component:'henry',phase:'review_pending',operatorReviewEligible:true,
    blocker:{scope:'reading',terminal:true,code:'SUPERVISOR_CHILD_REPAIR_EXHAUSTED',proof:{sha256:'f'.repeat(64)}}}];
  f.dependencies.henry={binding:async()=>{throw Error('FABRICATED historical selection forbidden');}};
  const result=await f.work.runStageC(f.ctx,{role:'preparation',now},f.dependencies);
  assert.equal(result.outcome,'blocked');assert.equal(result.code,'SUPERVISOR_CHILD_REPAIR_EXHAUSTED');
  assert.deepEqual(f.counts(),{authors:0,reviews:0,researches:0,syntheses:0,validated:0});
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
