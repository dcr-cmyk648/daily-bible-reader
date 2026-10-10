const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {writeFileSync}=require('node:fs');
const repo=path.resolve(__dirname,'..');
async function fixture(t,{verseCount=1,readingCount=1}={}) {
  const [service,author,runner,henry,store,nativeStore,pipeline,rolling]=await Promise.all([
    'mhc-v2-service','mhc-v2-author-session','mhc-native-runner','service-supervisor-henry','service-supervisor-store','mhc-v2-store','mhc-pipeline','rolling-study-work-order'
  ].map(name=>import(`../scripts/lib/${name}.mjs`)));
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'dbr-supervisor-native-fabricated-'));
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('dbr-supervisor-native-fabricated-'));await fs.rm(root,{recursive:true,force:true});});
  const releaseRoot=path.join(root,'release'),projectRoot=path.join(root,'project'),now=new Date('2026-10-10T16:00:00Z');
  await fs.mkdir(releaseRoot,{recursive:true});for(const name of ['schemas','prompts'])await fs.cp(path.join(repo,name),path.join(releaseRoot,name),{recursive:true});
  const entry={planVersion:'FABRICATED-plan',readingId:'FABRICATED-native',dayIndex:1,kind:'chapter',passages:[{bookId:'TST',chapter:1,verseCount}]},
    plan={planVersion:entry.planVersion,entries:Array.from({length:readingCount},(_,i)=>({...entry,dayIndex:i+1,readingId:i?`FABRICATED-next-${i+1}`:entry.readingId}))},appConfig={sharedStartDate:'2026-10-10',futureLookaheadDays:7},
    sourceManifest={source_id:'fabricated-henry',work_title:'FABRICATED TEST COMMENTARY',module_name:'MHC',module_version:'2.2',source_version_date:'2026-01-01',retrieved_at:'2026-01-01',license:'Public domain FABRICATED TEST',archive_sha256:'a'.repeat(64),source_format:'CrossWire SWORD zCom4 OSIS',versification:'KJV',source_url:'https://example.invalid/fabricated',download_url:'https://example.invalid/fabricated.zip'},
    text='FABRICATED TEST COMMENTARY: the caretaker distributes parcels to needy households. Patient kindness benefits the village during its difficult season.',hash=pipeline.sha256(text),
    {source_id,work_title,...provenance}=sourceManifest,unit={schema_version:'mhc-normalized-source/v3',source_id,work_title,source_unit_id:'FABRICATED:TST:1:1',book_id:'TST',chapter:1,verse_start:1,verse_end:verseCount,reference_label:`FABRICATED 1:1-${verseCount}`,unit_type:'verse_range',source_text:text,source_text_sha256:hash,source_atoms:[{source_atom_id:'FABRICATED-atom',sequence:1,atom_type:'commentary',text,text_sha256:hash}],worker_source_sha256:hash,excluded_scripture_sha256:null,verse_anchors:[],provenance};
  const write=(relative,value)=>nativeStore.atomicJson(projectRoot,relative,value);
  await nativeStore.atomicJson(releaseRoot,'fixtures/pilot-content/plan.json',plan);await nativeStore.atomicJson(releaseRoot,'fixtures/pilot-content/app-config.json',appConfig);
  for(const d of ['private-content','private-commentary/mhc/normalized/TST','research/raw','research/working'])await fs.mkdir(path.join(projectRoot,d),{recursive:true});
  await write('private-content/private-manifest.json',{readings:{}});await write('private-commentary/mhc/source-manifest.json',sourceManifest);
  await fs.writeFile(path.join(projectRoot,'private-commentary/mhc/normalized/TST/001.jsonl'),JSON.stringify(unit)+'\n');
  await write('private-commentary/mhc/normalized/TST/001.manifest.json',{source_archive_sha256:sourceManifest.archive_sha256,book_id:'TST',chapter:1,indexed_verse_count:verseCount,normalized_batch_sha256:pipeline.normalizedBatchHash([unit])});
  const native=await service.serviceContext({projectRoot,releaseRoot,runtimeRoot:path.join(projectRoot,'private-content/automation/mhc-runtime'),launcher:path.join(root,'FABRICATED-launcher.mjs'),config:{author_model:'gpt-6-luna',spark_automation_id:'FABRICATED-primary',luna_automation_id:'FABRICATED-fallback'}}),
    ctx={projectRoot,releaseRoot,stateRoot:path.join(projectRoot,'private-content/automation/service-supervisor/state'),config:{children:{codexExecutable:process.execPath}}},
    journal=await store.openJournal(ctx.stateRoot),lease=await journal.acquire('preparation',{now,durationMs:90*60*1000}),
    protocol=JSON.parse(await fs.readFile(path.join(repo,'config/daily-study-protocol.json'))),
    order=rolling.buildRollingStudyWorkOrder({plan,appConfig,protocol,today:'2026-10-10',issuedAt:now.toISOString()}),
    orderBytes=store.jsonBytes(order),orderHash=store.digest(orderBytes),orderPath=`private-content/automation/staging/${entry.readingId}/supervisor/orders/${orderHash}.json`,
    executionId='b'.repeat(32),output=store.jsonBytes({label:'FABRICATED accepted synthesis'});
  await store.durableWrite(projectRoot,orderPath,orderBytes);await store.durableWrite(ctx.stateRoot,`executions/${executionId}/output.json`,output);
  const daily={schemaVersion:'service-supervisor-daily-state/v1',id:'c'.repeat(32),readingId:entry.readingId,phase:'waiting_henry',blocker:null,workOrder:{path:orderPath,sha256:orderHash},authorSessionId:executionId,authorThreadId:'FABRICATED-daily-author'};
  await journal.append('observation',{role:'preparation',selection:{effectiveDate:'2026-10-10',next:{readingId:entry.readingId,component:'daily',action:'daily_author',scheduleDate:'2026-10-10'}}},now,lease);
  await journal.append('execution_state',{execution:{id:executionId,readingId:entry.readingId,kind:'daily-synthesis',phase:'accepted',threadId:daily.authorThreadId,output:{path:`executions/${executionId}/output.json`,sha256:store.digest(output)}}},now,lease);
  await journal.append('daily_state',{job:daily},now,lease);
  let calls=0;
  const run=(_exe,args,options)=>{
    if(args[0]==='--version')return {status:0,stdout:'codex-cli 0.162.1'};
    if(args[0]==='login')return {status:0,stderr:'Logged in using ChatGPT'};
    if(args.includes('mcp'))return {status:0,stdout:'[]'};
    const file=args[args.indexOf('--output-last-message')+1];
    if(options.input?.startsWith('Availability preflight')){writeFileSync(file,JSON.stringify({ok:true}));return {status:0,stdout:'{"type":"turn.completed"}\n'};}
    assert.ok(options.input?.startsWith('Condense the supplied verified public-domain Henry source packet.'));calls++;
    const packet=JSON.parse(options.input.split('SOURCE PACKET:\n')[1].split('\n\n')[0]),candidate={schema_version:'mhc-evidence-candidate/v2',packet_id:packet.packet_id,records:packet.requests.map(r=>({verse_id:r.verse_id,sentences:[{text:'FABRICATED: a thoughtful village helper hands out supplies, easing the hardship faced by local families.',evidence_ids:[r.evidence_ids[0]]}]}))};
    writeFileSync(file,nativeStore.bytesFor(candidate));return {status:0,stdout:'{"type":"thread.started","thread_id":"FABRICATED-native-author"}\n{"type":"turn.completed"}\n'};
  };
  const binding={native,service,author,runner,pointer:{source_revision:'a'.repeat(40)}},deps={binding:async()=>binding,transport:async()=>({billingRoute:'FABRICATED local fixture'}),clock:()=>now,run};
  await fs.mkdir(native.runtimeRoot,{recursive:true});
  return {ctx,native,henry,store,nativeStore,journal,lease,order,daily,now,deps,binding,readingId:entry.readingId,getCalls:()=>calls};
}
async function pinNative(f) {
  for(const name of ['scripts','app'])await fs.cp(path.join(repo,name),path.join(f.ctx.releaseRoot,name),{recursive:true});
  const files=[];
  async function collect(dir='') {for(const e of await fs.readdir(path.join(f.ctx.releaseRoot,dir),{withFileTypes:true})) {
    const relative=dir?`${dir}/${e.name}`:e.name;if(e.isDirectory())await collect(relative);else if(e.isFile()){
      const raw=await fs.readFile(path.join(f.ctx.releaseRoot,relative));files.push({path:relative,bytes:raw.length,sha256:f.store.digest(raw),raw});}
  }}await collect();
  const sourceRevision='e'.repeat(40),manifest={schema_version:'mhc-native-runtime-manifest/v1',source_revision:sourceRevision,
    created_at:f.now.toISOString(),files:files.map(({raw,...entry})=>entry)},manifestBytes=f.store.jsonBytes(manifest),manifestSha256=f.store.digest(manifestBytes),
    runtimeRoot=f.native.runtimeRoot,config={schema_version:'mhc-native-runtime-config/v1',source_revision:sourceRevision,project_root:f.ctx.projectRoot,runtime_root:runtimeRoot,
      spark_automation_id:'FABRICATED-primary',luna_automation_id:'FABRICATED-fallback',pipeline_version:'mhc-evidence-author/v2',author_model:'gpt-6-luna'},
    configBytes=f.store.jsonBytes(config),configSha256=f.store.digest(configBytes),release=`${sourceRevision}-${manifestSha256.slice(0,16)}`;
  for(const file of files)await f.store.durableWrite(runtimeRoot,`releases/${release}/${file.path}`,file.raw);
  await f.store.durableWrite(runtimeRoot,`releases/${release}/manifest.json`,manifestBytes);
  await f.store.durableWrite(runtimeRoot,`config-${configSha256}.json`,configBytes);
  const launcher=files.find(e=>e.path==='scripts/mhc-native-runtime-launcher.mjs').raw;
  await f.store.durableWrite(runtimeRoot,'launcher.mjs',launcher);
  await f.store.durableWrite(runtimeRoot,'current.json',f.store.jsonBytes({schema_version:'mhc-native-runtime-pointer/v1',source_revision:sourceRevision,release,manifest_sha256:manifestSha256,config_sha256:configSha256}));
  f.ctx.config.henryRuntime={sourceRevision,manifestSha256,configSha256};return {runtimeRoot,release,launcher,configBytes,configSha256,files};
}
test('native binding verifies actual immutable dependency closure, exact launcher, config and selected pointer before loading it',async t=>{
  const f=await fixture(t),p=await pinNative(f),binding=await f.henry.verifiedHenryContext(f.ctx);
  assert.equal(binding.native.projectRoot,f.ctx.projectRoot);assert.equal(binding.author.selectionBindingVersion,'requested-reading/v1');
  await fs.appendFile(path.join(p.runtimeRoot,'launcher.mjs'),'// FABRICATED alteration');
  await assert.rejects(f.henry.verifiedHenryContext(f.ctx),/PIN_CHANGED/);await fs.writeFile(path.join(p.runtimeRoot,'launcher.mjs'),p.launcher);
  await fs.appendFile(path.join(p.runtimeRoot,`config-${p.configSha256}.json`),' ');
  await assert.rejects(f.henry.verifiedHenryContext(f.ctx),/PIN_CHANGED/);await fs.writeFile(path.join(p.runtimeRoot,`config-${p.configSha256}.json`),p.configBytes);
  f.ctx.config.henryRuntime.sourceRevision='f'.repeat(40);await assert.rejects(f.henry.verifiedHenryContext(f.ctx),/PIN_CHANGED/);
});
test('C installation cannot switch a verified A pointer when offline ChatGPT capability proof fails',async t=>{
  const f=await fixture(t),p=await pinNative(f),runtime=await import('../scripts/lib/service-supervisor-runtime.mjs');
  await f.journal.release(f.lease,f.now);
  const mapping=[];
  for(const lane of ['daily','review','henry_primary','henry_recovery']) {
    const file=path.join(f.ctx.projectRoot,`automations/${lane}.toml`);
    await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,
      `name = "FABRICATED ${lane}"\nkind = "cron"\nstatus = "ACTIVE"\nrrule = "FREQ=DAILY;BYHOUR=3"\nmodel = "gpt-6.1-sol"\nreasoning_effort = "high"\nexecution_environment = "local"\nprompt = "FABRICATED thin prompt"\ncwds = ["FABRICATED-project"]\ntarget = { type = "project", project_id = "FABRICATED-project" }\n`);
    mapping.push({lane,file});
  }
  const inventory=await runtime.captureInventory(mapping),files=p.files.map(f=>({path:f.path,bytes:f.raw})),
    original=await runtime.installRuntime({projectRoot:f.ctx.projectRoot,sourceRevision:'a'.repeat(40),files,inventory,now:f.now}),
    supervisorRoot=path.dirname(original.launcher),before=await fs.readFile(path.join(supervisorRoot,'current.json')),
    launcherBefore=await fs.readFile(original.launcher),resources={manifest:{fileId:'FABRICATED-MANIFEST',mimeType:'application/json',parents:['FABRICATED-FOLDER'],permissionsSha256:'f'.repeat(64)},
      folder:{fileId:'FABRICATED-FOLDER',mimeType:'application/vnd.google-apps.folder',parents:[],permissionsSha256:'f'.repeat(64)}};
  await assert.rejects(runtime.installRuntime({projectRoot:f.ctx.projectRoot,sourceRevision:'b'.repeat(40),files,inventory,stage:'C',
    publicationResources:resources,children:{model:'gpt-6.1-sol',reasoningEffort:'high',codexExecutable:process.execPath,
      executableSha256:f.store.digest(await fs.readFile(process.execPath)),version:'codex-cli 0.162.1',sourceAccessMode:'bounded_https'},
    henryRuntime:f.ctx.config.henryRuntime,now:f.now}),/CHATGPT_LOGIN_REQUIRED/);
  assert.deepEqual(await fs.readFile(path.join(supervisorRoot,'current.json')),before);assert.deepEqual(await fs.readFile(original.launcher),launcherBefore);
});
test('C dependency adapter uses actual installed-policy selector, preflight and native event chain for an unpublished reading',async t=>{
  const f=await fixture(t),before=await fs.readFile(path.join(f.ctx.projectRoot,'private-content/private-manifest.json')),
    dependency=await f.henry.prepareHenryDependency(f.ctx,{journal:f.journal,lease:f.lease,order:f.order,deadline:f.now.getTime()+90*60000},f.deps);
  assert.equal(dependency.state.phase,'absent');assert.equal(dependency.authorization.dailyJobId,f.daily.id);
  const result=await f.henry.runHenryWork(f.ctx,{journal:f.journal,lease:f.lease,wakeId:'d'.repeat(32),readingId:f.readingId,deadline:f.now.getTime()+90*60000,dailyDependency:dependency.authorization},f.deps);
  assert.equal(result.action,'review_handoff',JSON.stringify({action:result.action,code:result.code}));assert.equal(f.getCalls(),1);
  const job=await f.nativeStore.loadJob(path.join(f.native.jobRoot,f.readingId));assert.equal(job.state.phase,'review_pending');assert.equal(job.state.total_submissions,1);
  assert.equal(job.state.history.find(e=>e.kind==='daily_dependency_admitted').work_order_sha256,f.daily.workOrder.sha256);
  assert.deepEqual(await f.henry.authorThreads(f.native,f.readingId),['FABRICATED-native-author']);
  assert.deepEqual(await fs.readFile(path.join(f.ctx.projectRoot,'private-content/private-manifest.json')),before);
  await fs.appendFile(path.join(f.ctx.stateRoot,`executions/${f.daily.authorSessionId}/output.json`),' ');
  await assert.rejects(f.henry.runHenryWork(f.ctx,{journal:f.journal,lease:f.lease,wakeId:'d'.repeat(32),readingId:f.readingId,deadline:f.now.getTime()+90*60000,dailyDependency:dependency.authorization},f.deps));
  assert.equal(f.getCalls(),1);
});

test('native changes request receives one source-bound repair and a fresh independent review before the library finalizer',async t=>{
  const f=await fixture(t),options={journal:f.journal,lease:f.lease,wakeId:'d'.repeat(32),readingId:f.readingId,deadline:f.now.getTime()+90*60000},
    dependency=await f.henry.prepareHenryDependency(f.ctx,{...options,order:f.order},f.deps);
  await f.henry.runHenryWork(f.ctx,{...options,dailyDependency:dependency.authorization},f.deps);
  let reviews=0,repairs=0;
  const exec={clock:()=>f.now,transport:async()=>({env:{},mcpNames:[],proof:{billingRoute:'FABRICATED local fixture'}}),execute:async(_exe,args,opts)=>{
    const packet=JSON.parse(opts.input.slice(opts.input.indexOf('\n')+1)),inputSha256=f.store.digest(f.store.jsonBytes(
      packet.schemaVersion==='supervisor-henry-editorial-input/v1'?Object.fromEntries(Object.entries(packet).filter(([key])=>key!=='candidateSchema')):packet));
    let output,thread;
    if(packet.schemaVersion==='supervisor-henry-review-input/v1') {
      reviews++;thread=`FABRICATED-review-${reviews}`;
      output={schemaVersion:'independent-review/v1',readingId:f.readingId,inputSha256,
        verdict:reviews===1?'changes_requested':'approved',assertions:Object.fromEntries(Object.keys(JSON.parse(await fs.readFile(args[args.indexOf('--output-schema')+1]))
          .properties.assertions.properties).map(k=>[k,true])),findings:['FABRICATED direct comparison of each sentence with its cited source atom.'],corrections:[],
        repairPacketId:reviews===1?packet.reviewBasis.source_packets[0].packet_id:null,coverageLimits:[]};
    } else {
      repairs++;thread='FABRICATED-repair';assert.equal(packet.allowedRepairCount,1);
      output={schemaVersion:'henry-editorial-repair/v1',readingId:f.readingId,inputSha256,verdict:'repaired',
        candidateJson:JSON.stringify(packet.original),findings:['FABRICATED complete direct source comparison retained the supported draft.']};
    }
    await fs.writeFile(args[args.indexOf('--output-last-message')+1],f.store.jsonBytes(output));
    return {status:0,stderr:'',stdout:`${JSON.stringify({type:'thread.started',thread_id:thread})}\n${JSON.stringify({type:'turn.completed'})}\n`};
  }},deps={...f.deps,exec};
  const first=await f.henry.reviewHenryWork(f.ctx,options,deps);assert.equal(first.action,'editorial_attention');
  const repaired=await f.henry.repairHenryWork(f.ctx,options,deps);assert.equal(repaired.action,'review_handoff');
  const second=await f.henry.reviewHenryWork(f.ctx,options,deps);assert.equal(second.action,'publish_required');
  assert.equal(reviews,2);assert.equal(repairs,1);
  const job=await f.nativeStore.loadJob(path.join(f.native.jobRoot,f.readingId));assert.equal(job.state.phase,'publishing');assert.equal(job.state.total_submissions,1);
  assert.equal(job.state.history.filter(e=>e.kind==='editorial_repair').length,1);
  const events=await f.journal.load(),accepted=events.filter(e=>e.kind==='execution_state'&&e.data.execution.phase==='accepted').map(e=>e.data.execution);
  assert.deepEqual(accepted.filter(e=>e.kind==='independent-review').map(e=>e.threadId),['FABRICATED-review-1','FABRICATED-review-2']);
  assert.ok(accepted.some(e=>e.kind==='henry-editorial-repair'&&e.threadId==='FABRICATED-repair'));
  await assert.rejects(f.henry.repairHenryWork(f.ctx,options,deps),/EDITORIAL_PHASE_CHANGED/);assert.equal(repairs,1);
});
test('two legitimate native packet repairs permit a third fresh exact-basis review without resetting native submissions',async t=>{
  const f=await fixture(t,{verseCount:9}),options={journal:f.journal,lease:f.lease,wakeId:'d'.repeat(32),readingId:f.readingId,deadline:f.now.getTime()+90*60000},
    dependency=await f.henry.prepareHenryDependency(f.ctx,{...options,order:f.order},f.deps);
  assert.equal((await f.henry.runHenryWork(f.ctx,{...options,dailyDependency:dependency.authorization},f.deps)).action,'review_handoff');
  let reviews=0,repairs=0;
  const exec={clock:()=>f.now,transport:async()=>({env:{},mcpNames:[],proof:{billingRoute:'FABRICATED local fixture'}}),execute:async(_exe,args,opts)=>{
    const schema=JSON.parse(await fs.readFile(args[args.indexOf('--output-schema')+1])),packet=JSON.parse(opts.input.slice(opts.input.indexOf('\n')+1)),
      fields={schemaVersion:schema.properties.schemaVersion.const,readingId:schema.properties.readingId.const,inputSha256:schema.properties.inputSha256.const};
    let output,thread;
    if(fields.schemaVersion==='independent-review/v1') {
      reviews++;thread=`FABRICATED-review-${reviews}`;output={...fields,verdict:reviews<3?'changes_requested':'approved',
        assertions:Object.fromEntries(Object.keys(schema.properties.assertions.properties).map(k=>[k,true])),findings:['FABRICATED full packet source comparison.'],
        corrections:[],repairPacketId:reviews<3?packet.reviewBasis.source_packets[reviews-1].packet_id:null,coverageLimits:[]};
    } else {
      repairs++;thread=`FABRICATED-repair-${repairs}`;const candidate=structuredClone(packet.original);
      candidate.records.forEach(r=>r.sentences[0].text='FABRICATED: patient assistance from the village caretaker provides needy households with necessary parcels.');
      output={...fields,verdict:'repaired',candidateJson:JSON.stringify(candidate),findings:['FABRICATED source-bound revision of this packet.']};
    }
    await fs.writeFile(args[args.indexOf('--output-last-message')+1],f.store.jsonBytes(output));
    return {status:0,stderr:'',stdout:`${JSON.stringify({type:'thread.started',thread_id:thread})}\n${JSON.stringify({type:'turn.completed'})}\n`};
  }},deps={...f.deps,exec};
  for(let i=0;i<2;i++) {
    assert.equal((await f.henry.reviewHenryWork(f.ctx,options,deps)).action,'editorial_attention');
    assert.equal((await f.henry.repairHenryWork(f.ctx,options,deps)).action,'review_handoff');
  }
  assert.equal((await f.henry.reviewHenryWork(f.ctx,options,deps)).action,'publish_required');assert.equal(reviews,3);assert.equal(repairs,2);
  const job=await f.nativeStore.loadJob(path.join(f.native.jobRoot,f.readingId));assert.equal(job.state.total_submissions,2);
  assert.equal(job.state.history.filter(e=>e.kind==='editorial_repair').length,2);
  const accepted=(await f.journal.load()).filter(e=>e.kind==='execution_state'&&e.data.execution.kind==='independent-review'&&e.data.execution.phase==='accepted').map(e=>e.data.execution);
  assert.equal(new Set(accepted.map(e=>e.jobId)).size,3);assert.equal(new Set(accepted.map(e=>e.threadId)).size,3);
});
for(const losesHealth of [false,true])test(`D adapter invokes the real native historical guard and its post-preflight health check (losesHealth=${losesHealth})`,async t=>{
  const f=await fixture(t,{readingCount:10}),now=new Date(f.now.getTime()+86400000);f.ctx.config.stage='D';
  await f.journal.release(f.lease,f.now);const lease=await f.journal.acquire('preparation',{now,durationMs:90*60000});
  await f.nativeStore.atomicJson(f.ctx.projectRoot,'private-content/private-manifest.json',{readings:Object.fromEntries(f.native.plan.entries.map(e=>[e.readingId,{}]))});
  for(const e of f.native.plan.entries)await f.nativeStore.atomicJson(f.ctx.projectRoot,`private-content/bridge/celebration-y3q4/${e.readingId}.metadata.json`,
    {readingId:e.readingId,...(e.dayIndex===1?{henrySourceLink:{sourceId:'fabricated-henry',title:'FABRICATED Henry',note:'FABRICATED prior fallback',url:'https://example.invalid/fabricated'}}:{})});
  let measurements=0;
  const health=async()=>{measurements++;return {status:'ready',effectiveDate:'2026-10-11',target:8,readingIds:f.native.plan.entries.slice(1,9).map(e=>e.readingId),
    missingPreparedReadingIds:[],missingPayloadReadingIds:[],componentFailures:[],currentHorizonHenryLayer:{status:'complete',unavailableReadingIds:[],
      fallbackReadingIds:losesHealth&&measurements>1?[f.native.plan.entries[1].readingId]:[]}};};
  const service=f.binding.service,binding={...f.binding,service:{...service,
    selectHistoricalAuthorWorkV2:(ctx,request,date)=>service.selectHistoricalAuthorWorkV2(ctx,request,date,{health})}},
    options={journal:f.journal,lease,wakeId:'d'.repeat(32),readingId:f.readingId,deadline:now.getTime()+90*60000,historical:true},
    deps={...f.deps,binding:async()=>binding,clock:()=>now};
  if(losesHealth) {
    await assert.rejects(f.henry.runHenryWork(f.ctx,options,deps),/HISTORICAL_FORWARD_INCOMPLETE/);
    assert.equal(f.getCalls(),0);assert.deepEqual(await fs.readdir(f.native.jobRoot),[]);
  } else {
    assert.equal((await f.henry.runHenryWork(f.ctx,options,deps)).action,'review_handoff');assert.equal(f.getCalls(),1);
    const job=await f.nativeStore.loadJob(path.join(f.native.jobRoot,f.readingId));
    assert.equal(job.state.total_submissions,1);assert.ok(job.state.history.some(e=>e.kind==='historical_authorization_admitted'));
  }
  assert.equal(measurements,2);
});
