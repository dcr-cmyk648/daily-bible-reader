const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const modules=Promise.all([import('../scripts/lib/service-supervisor-exec.mjs'),import('../scripts/lib/service-supervisor-store.mjs')]);
const now=new Date('2026-10-10T16:00:00Z');
const schema={type:'object',additionalProperties:false,required:['label'],properties:{label:{type:'string',const:'FABRICATED verified output'}}};
const events=(items=[],thread='FABRICATED-thread')=>[JSON.stringify({type:'thread.started',thread_id:thread}),
  ...items.map(item=>JSON.stringify({type:'item.completed',item})),JSON.stringify({type:'turn.completed'})].join('\n')+'\n';
async function fixture(t) {
  const [executor,store]=await modules,root=await fs.mkdtemp(path.join(os.tmpdir(),'dbr-child-fabricated-'));
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('dbr-child-fabricated-'));await fs.rm(root,{recursive:true,force:true});});
  const ctx={projectRoot:root,stateRoot:path.join(root,'state'),config:{children:{codexExecutable:path.join(root,'FABRICATED-codex.exe')}}},
    journal=await store.openJournal(ctx.stateRoot),lease=await journal.acquire('preparation',{now,durationMs:90*60*1000});
  const args={journal,lease,jobId:'FABRICATED-job',readingId:'FABRICATED-reading',kind:'daily-synthesis',packet:{label:'FABRICATED no Scripture packet'},
    schema,prompt:'FABRICATED isolated test prompt',deadline:now.getTime()+90*60*1000};
  let calls=0;
  const deps={clock:()=>now,transport:async()=>({env:{},mcpNames:[],proof:{billingRoute:'FABRICATED local test; no model call'}}),
    execute:async(_,argv)=>{calls++;await fs.writeFile(argv[argv.indexOf('--output-last-message')+1],store.jsonBytes({label:'FABRICATED verified output'}));
      return {status:0,stdout:events(),stderr:''};}};
  return {executor,store,ctx,journal,lease,args,deps,getCalls:()=>calls};
}
test('Sol child arguments pin model/effort/ephemeral isolation and never inherit API environment',async()=>{
  const [executor]=await modules,args=executor.childArguments({kind:'daily-research',schemaPath:'FABRICATED-schema',outputPath:'FABRICATED-output',mcpNames:['FABRICATED_mcp']});
  assert.ok(args.includes('--ephemeral'));assert.equal(args[args.indexOf('--model')+1],'gpt-6.1-sol');
  for(const flag of ['model_reasoning_effort="high"','forced_login_method="chatgpt"','web_search="live"','mcp_servers.FABRICATED_mcp.enabled=false'])assert.ok(args.includes(flag));
  assert.ok(executor.childArguments({kind:'independent-review',schemaPath:'a',outputPath:'b'}).includes('web_search="disabled"'));
  assert.deepEqual(executor.childEnvironment({PATH:'FABRICATED',OPENAI_API_KEY:'FABRICATED_SECRET',CUSTOM_API_KEY:'FABRICATED_SECRET',OPENAI_BASE_URL:'FABRICATED_URL'}),{PATH:'FABRICATED'});
});
test('consultation needs a real successful opened-page result; snippets, 404s and lossy events fail',async()=>{
  const [executor]=await modules,url='https://example.invalid/FABRICATED-source',item={id:'FABRICATED-open',type:'web_search',
    action:{type:'open_page',url},results:[{url,content:'FABRICATED consulted source evidence.'}]};
  const accepted=executor.analyzeChildEvents(events([item]),{kind:'daily-research'});assert.equal(accepted.opened[0].url,url);
  for(const changed of [{...item,action:{type:'search'}},{...item,results:undefined},{...item,results:[{url,content:'FABRICATED unavailable',error:{status:404}}]},
    {...item,results:[{url,content:'FABRICATED unavailable',status:404}]},{...item,action:{type:'other'}}])
    assert.throws(()=>executor.analyzeChildEvents(events([changed]),{kind:'daily-research'}),/SOURCE_ACCESS_UNVERIFIABLE/);
  assert.equal(executor.privateEventLog(events([item])).includes('FABRICATED consulted source evidence.'),false);
  const raw=events([{type:'reasoning',text:'FABRICATED sensitive raw reasoning',summary:['FABRICATED source prose']},
    {...item,action:{type:'search',query:'FABRICATED sensitive query'}}]);
  assert.equal(executor.privateEventLog(raw).includes('FABRICATED sensitive'),false);assert.equal(executor.privateEventLog(raw).includes('FABRICATED source prose'),false);
});
test('unexpected child tools and excessive web operations cannot be admitted',async()=>{
  const [executor]=await modules;
  for(const type of ['command_execution','mcp_tool_call','file_change','collab_agent_tool_call'])
    assert.throws(()=>executor.analyzeChildEvents(events([{id:'FABRICATED',type}]),{kind:'daily-synthesis'}),/TOOL_OR_TURN_FAILED/);
  assert.throws(()=>executor.analyzeChildEvents(events(Array.from({length:65},(_,i)=>({id:String(i),type:'web_search'}))),{kind:'daily-research'}),/WEB_BUDGET_EXHAUSTED/);
});
test('durable reservation prevents crash replay and accepted raw output is hash-checked on reuse',async t=>{
  const f=await fixture(t),first=await f.executor.executeBoundedChild(f.ctx,f.args,f.deps);
  assert.equal(first.execution.phase,'accepted');assert.equal(f.getCalls(),1);
  await f.executor.executeBoundedChild(f.ctx,f.args,f.deps);assert.equal(f.getCalls(),1);
  await fs.appendFile(path.join(f.ctx.stateRoot,first.execution.output.path),' ');
  await assert.rejects(f.executor.executeBoundedChild(f.ctx,f.args,f.deps),/ACCEPTED_OUTPUT_CHANGED/);
  const g=await fixture(t);
  await assert.rejects(g.executor.executeBoundedChild(g.ctx,g.args,{...g.deps,execute:async()=>{throw Error('FABRICATED host crash');}}),/host crash/);
  await assert.rejects(g.executor.executeBoundedChild(g.ctx,g.args,g.deps),/DISPATCH_UNCERTAIN/);assert.equal(g.getCalls(),0);
});
test('independent review cannot reuse the actual author thread and malformed output repairs cannot replenish',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.executor.executeBoundedChild(f.ctx,{...f.args,kind:'independent-review',authorThreadIds:['FABRICATED-thread']},f.deps),/REVIEW_NOT_INDEPENDENT/);
  const g=await fixture(t),bad={...g.deps,execute:async(_,argv)=>{await fs.writeFile(argv[argv.indexOf('--output-last-message')+1],'{}');return {status:0,stdout:events(),stderr:''};}};
  for(let i=0;i<2;i++)await assert.rejects(g.executor.executeBoundedChild(g.ctx,g.args,bad),/Bounded child output/);
  await assert.rejects(g.executor.executeBoundedChild(g.ctx,g.args,g.deps),/REPAIR_EXHAUSTED/);assert.equal(g.getCalls(),0);
});
test('an unauditable research capability blocks on its first failure and remains durable',async t=>{
  const f=await fixture(t),args={...f.args,kind:'daily-research'};
  await assert.rejects(f.executor.executeBoundedChild(f.ctx,args,f.deps),/SOURCE_ACCESS_UNVERIFIABLE/);
  await assert.rejects(f.executor.executeBoundedChild(f.ctx,args,f.deps),/CAPABILITY_BLOCK_RETAINED/);assert.equal(f.getCalls(),1);
});

test('new native review bases retain per-basis retry limits and reading-wide capability and uncertain-dispatch blocks',async t=>{
  const f=await fixture(t);
  for(let i=0;i<3;i++)await f.executor.executeBoundedChild(f.ctx,{...f.args,kind:'independent-review',jobId:`FABRICATED-validated-basis-${i}`},
    {...f.deps,execute:async(_,argv)=>{await fs.writeFile(argv[argv.indexOf('--output-last-message')+1],f.store.jsonBytes({label:'FABRICATED verified output'}));return {status:0,stdout:events([],`FABRICATED-review-${i}`),stderr:''};}});
  const g=await fixture(t);
  await assert.rejects(g.executor.executeBoundedChild(g.ctx,{...g.args,kind:'independent-review'},
    {...g.deps,execute:async()=>{throw Error('FABRICATED dispatch uncertainty');}}),/uncertainty/);
  await assert.rejects(g.executor.executeBoundedChild(g.ctx,{...g.args,kind:'independent-review',jobId:'FABRICATED-new-basis'},g.deps),/DISPATCH_UNCERTAIN/);
  const h=await fixture(t);
  await assert.rejects(h.executor.executeBoundedChild(h.ctx,{...h.args,kind:'independent-review'},
    {...h.deps,execute:async()=>({status:0,stdout:events([{type:'command_execution'}]),stderr:''})}),/TOOL_OR_TURN_FAILED/);
  await assert.rejects(h.executor.executeBoundedChild(h.ctx,{...h.args,kind:'independent-review',jobId:'FABRICATED-new-basis'},h.deps),/CAPABILITY_BLOCK_RETAINED/);
});

test('real local child streaming kills forbidden tools, excess output and absolute deadline without dispatching a model',async t=>{
  const f=await fixture(t),options={cwd:f.ctx.projectRoot,env:f.executor.childEnvironment(),input:'FABRICATED stdin',timeout:1000};
  const forbidden=await f.executor.streamChild(process.execPath,['-e',
    "process.stdout.write(JSON.stringify({type:'item.started',item:{type:'command_execution'}})+'\\n');setInterval(()=>{},1000)"],options,{kind:'daily-synthesis'});
  assert.equal(forbidden.error.code,'SUPERVISOR_CHILD_TOOL_OR_TURN_FAILED');
  const large=await f.executor.streamChild(process.execPath,['-e',
    "process.stderr.write('FABRICATED'.repeat(130000));setInterval(()=>{},1000)"],options,{kind:'daily-synthesis'});
  assert.equal(large.error.code,'SUPERVISOR_CHILD_OUTPUT_LIMIT');
  const started=Date.now(),timeout=await f.executor.streamChild(process.execPath,['-e','setInterval(()=>{},1000)'],
    {...options,timeout:100},{kind:'daily-synthesis'});
  assert.equal(timeout.error.code,'SUPERVISOR_CHILD_DEADLINE');assert.ok(Date.now()-started<12000);
  const completed=await f.executor.streamChild(process.execPath,['-e',
    "process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(JSON.stringify({type:'turn.completed'})+'\\n'))"],options,{kind:'daily-synthesis'});
  assert.equal(completed.status,0);assert.equal(completed.error,null);
});
