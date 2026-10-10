const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const modules=Promise.all(['henry','store'].map(name=>import(`../scripts/lib/service-supervisor-${name}.mjs`)));
const now=new Date('2026-10-10T16:00:00Z');
async function fixture(t,{fallback=false}={}) {
  const [henry,store]=await modules,nativeStore=await import('../scripts/lib/mhc-v2-store.mjs'),nativeModel=await import('../scripts/lib/mhc-v2.mjs'),
    root=await fs.mkdtemp(path.join(os.tmpdir(),'dbr-henry-fabricated-'));
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('dbr-henry-fabricated-'));await fs.rm(root,{recursive:true,force:true});});
  const ctx={projectRoot:root,stateRoot:path.join(root,'state'),config:{children:{codexExecutable:process.execPath}}},
    journal=await store.openJournal(ctx.stateRoot),lease=await journal.acquire('preparation',{now}),readingId='FABRICATED-reading',jobRoot=path.join(root,'private-content/automation/mhc-v2'),
    packet={packet_id:`MHP2-${'c'.repeat(32)}`,reading_id:readingId,requests:[{verse_id:'NAM.1.1'}],evidence:[{evidence_id:'FABRICATED-atom',text:'FABRICATED source evidence'}]},
    input={schema_version:'mhc-reading-input/v2',reading_id:readingId,plan_version:'FABRICATED-plan',schedule_date:'2026-10-10',
      source_archive_sha256:'b'.repeat(64),chapters:[{book_id:'NAM',chapter:1,batches:[packet]}]};input.input_sha256=nativeModel.digestObject(input);
  let job=await nativeStore.createJob(jobRoot,input,now,{spark:'gpt-6-luna',luna:'gpt-5.6-luna'});
  if(fallback)job=await nativeStore.appendState(job,'FABRICATED-fallback',{...job.state,phase:'fallback_pending',blocker:{code:'V2_CANDIDATE_EXHAUSTED'}},now);
  const binding={native:{projectRoot:root,jobRoot},pointer:{source_revision:'a'.repeat(40)},runner:{withRunnerLock:(_ctx,fn)=>fn()},author:{selectionBindingVersion:'requested-reading/v1'},
    service:{selectAuthorWorkV2:async()=>({action:'selected',readingId,authorLane:fallback?'luna':'spark',requiredModel:fallback?'gpt-5.6-luna':'gpt-6-luna'})}};
  const options={journal,lease,readingId,wakeId:'d'.repeat(32),deadline:now.getTime()+90*60*1000},deps={clock:()=>now,binding:async()=>binding,
    transport:async()=>({proof:{billingRoute:'FABRICATED local transport'}}),run:()=>({status:0,stdout:'',stderr:''})};
  return {henry,store,nativeStore,nativeModel,ctx,journal,lease,readingId,packet,input,job,binding,options,deps};
}
test('Henry adapter chooses retained fallback without a mutating preview and binds requested reading after transport proof',async t=>{
  const f=await fixture(t,{fallback:true});let called=false,transported=false;
  f.binding.service.startV2=()=>{throw Error('mutating preview forbidden');};
  f.binding.author.runAuthorSession=async(_ctx,opts)=>{assert.equal(transported,true);assert.equal(opts.lane,'luna');assert.equal(opts.requestedReadingId,f.readingId);
    assert.equal(opts.maxReadings,1);called=true;return {action:'review_handoff',state:'review_pending'};};
  await f.henry.runHenryWork(f.ctx,f.options,{...f.deps,transport:async()=>{transported=true;}});
  assert.equal(called,true);assert.equal((await f.nativeStore.loadJob(f.job.directory)).previous,f.job.previous);
  f.binding.service.selectAuthorWorkV2=async()=>({action:'none',state:'requested_reading_mismatch'});
  called=false;assert.equal((await f.henry.runHenryWork(f.ctx,f.options,f.deps)).state,'requested_reading_mismatch');assert.equal(called,false);
  f.binding.author.selectionBindingVersion=undefined;
  await assert.rejects(f.henry.runHenryWork(f.ctx,f.options,f.deps),/SELECTION_INTERFACE_REQUIRED/);
});
test('Henry packet reservations survive calls, cap at 32 and refuse a different requested reading before dispatch',async t=>{
  const f=await fixture(t);let dispatches=0;
  f.binding.author.runAuthorSession=async(_ctx,_opts,{run})=>{
    for(let i=0;i<17;i++)run(process.execPath,['exec','--ephemeral','--model','gpt-6-luna','-c','model_reasoning_effort="medium"','-c','forced_login_method="chatgpt"'],
      {input:`Condense the supplied verified public-domain Henry source packet.\n${JSON.stringify(f.packet)}`,timeout:1000});
    return {action:'checkpointed',state:'generating'};
  };
  const deps={...f.deps,run:()=>{dispatches++;return {status:0,stdout:'',stderr:''};}};
  await f.henry.runHenryWork(f.ctx,f.options,deps);
  await assert.rejects(f.henry.runHenryWork(f.ctx,f.options,deps),/WAKE_BUDGET_EXHAUSTED/);assert.equal(dispatches,32);
  const g=await fixture(t);g.binding.author.runAuthorSession=async(_ctx,_opts,{run})=>run(process.execPath,
    ['exec','--ephemeral','--model','gpt-6-luna','-c','model_reasoning_effort="medium"','-c','forced_login_method="chatgpt"'],
    {input:'Condense the supplied verified public-domain Henry source packet.\n{"reading_id":"FABRICATED-other"}',timeout:1000});
  await assert.rejects(g.henry.runHenryWork(g.ctx,g.options,{...g.deps,run:()=>{throw Error('must not execute');}}),/SELECTED_READING_CHANGED/);
});
test('author independence proves each accepted candidate, packet, session and full completed event stream',async t=>{
  const f=await fixture(t),candidate={schema_version:'mhc-evidence-candidate/v2',packet_id:f.packet.packet_id,records:[{verse_id:'NAM.1.1',
    sentences:[{text:'FABRICATED supported candidate prose.',evidence_ids:['FABRICATED-atom']}]}]},bytes=f.nativeStore.bytesFor(candidate),hash=f.store.digest(Buffer.from(bytes)),
    session='spark:FABRICATED-session',record={schema_version:'mhc-model-execution/v1',session,status:'completed',candidate_sha256:f.nativeModel.digestObject(candidate),
      proof:{packet_sha256:f.nativeModel.digestObject(f.packet),source_archive_sha256:f.input.source_archive_sha256,
        public_domain_commentary_only:true,model:'gpt-6-luna',reasoning_effort:'medium'}},key='e'.repeat(64);
  await f.nativeStore.atomicJson(f.job.directory,`attempts/${hash}.json`,{bytes,value:candidate},{immutable:true});
  f.job=await f.nativeStore.appendState(f.job,'FABRICATED-accepted',{...f.job.state,phase:'review_pending',total_submissions:1,
    sessions:{[session]:{id:session,lane:'spark',submissions:1}},accepted:{[`${f.packet.packet_id}:spark`]:{candidate_sha256:hash}}},now);
  await f.nativeStore.atomicJson(f.job.directory,`model-executions/${key}/result.json`,record);
  await f.nativeStore.atomicJson(f.job.directory,`model-executions/${key}/response.json`,candidate);
  const events=Buffer.from([{type:'thread.started',thread_id:'FABRICATED-original-author'},{type:'turn.completed'}].map(JSON.stringify).join('\n'));
  await f.store.durableWrite(f.job.directory,`model-executions/${key}/events.jsonl`,events);
  assert.deepEqual(await f.henry.authorThreads(f.binding.native,f.readingId),['FABRICATED-original-author']);
  await f.nativeStore.atomicJson(f.job.directory,`model-executions/${key}/result.json`,{...record,proof:{...record.proof,packet_sha256:'f'.repeat(64)}});
  await assert.rejects(f.henry.authorThreads(f.binding.native,f.readingId),/AUTHOR_PROOF_CHANGED/);
  await f.nativeStore.atomicJson(f.job.directory,`model-executions/${key}/result.json`,record);
  const directory=path.join(f.job.directory,'model-executions',key);assert.ok(directory.startsWith(f.job.directory+path.sep));await fs.rm(directory,{recursive:true});
  await assert.rejects(f.henry.authorThreads(f.binding.native,f.readingId),/AUTHOR_PROOF_REQUIRED/);
});
test('D historical dispatch retains the native in-memory authorization/context and never forces forward or daily authority',async t=>{
  const f=await fixture(t),authorization=Object.freeze({label:'FABRICATED nonserializable native authority'});f.ctx.config.stage='D';
  f.binding.service.historicalSelectionBindingVersion='historical-selection/v1';f.binding.author.historicalSelectionBindingVersion='historical-selection/v1';
  f.binding.service.selectHistoricalAuthorWorkV2=async(ctx,request)=>{assert.equal(ctx,f.binding.native);assert.equal(request.requestedReadingId,f.readingId);
    assert.equal(request.requestedDailyWorkOrder,undefined);return {action:'selected',readingId:f.readingId,authorLane:'spark',requiredModel:'gpt-6-luna',historicalAuthorization:authorization};};
  let calls=0;f.binding.author.runAuthorSession=async(ctx,options)=>{calls++;assert.equal(ctx,f.binding.native);assert.equal(ctx.forwardOnly,undefined);
    assert.equal(options.requestedHistoricalAuthorization,authorization);assert.equal(options.requestedDailyWorkOrder,undefined);return {action:'review_handoff',state:'review_pending'};};
  await f.henry.runHenryWork(f.ctx,{...f.options,historical:true},f.deps);assert.equal(calls,1);
  f.ctx.config.stage='C';await assert.rejects(f.henry.runHenryWork(f.ctx,{...f.options,historical:true},f.deps),/HISTORICAL_INTERFACE_REQUIRED/);assert.equal(calls,1);
});
