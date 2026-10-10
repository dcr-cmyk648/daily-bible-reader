import path from 'node:path';
import {readFile,lstat,unlink} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {confined,durableWrite,digest,jsonBytes,fault} from './service-supervisor-store.mjs';
import {assertSchemaValid} from './schema-validator.mjs';
import {authorFailure} from './mhc-v2-model-errors.mjs';
import {assertChildPrivacy} from './service-supervisor-contracts.mjs';

const model='gpt-6.1-sol',reasoning='high';
const kinds=new Set(['daily-research','daily-synthesis','independent-review','henry-editorial-repair']);
const limits={'daily-research':20*60*1000,'daily-synthesis':20*60*1000,'independent-review':15*60*1000,'henry-editorial-repair':15*60*1000};
export function childEnvironment(environment=process.env) {
  // Only the existing local login/config and host executable path are inherited.
  const permitted=['PATH','SystemRoot','WINDIR','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','TEMP','TMP','CODEX_HOME'];
  return Object.fromEntries(permitted.filter(k=>typeof environment[k]==='string').map(k=>[k,environment[k]]));
}
export function childArguments({kind,schemaPath,outputPath,mcpNames=[]}) {
  if(!kinds.has(kind)||mcpNames.some(n=>!/^[A-Za-z0-9_-]+$/.test(n)))throw fault('SUPERVISOR_CHILD_CONFIGURATION_INVALID');
  return ['exec','--ephemeral','--model',model,'-c',`model_reasoning_effort="${reasoning}"`,
    '-c','model_provider="openai"','-c','forced_login_method="chatgpt"','--sandbox','read-only',
    ...['shell_tool','apps','plugins','multi_agent'].flatMap(f=>['--disable',f]),
    '-c',`web_search="${kind==='daily-research'?'live':'disabled'}"`,
    ...mcpNames.flatMap(n=>['-c',`mcp_servers.${n}.enabled=false`]),
    '--output-schema',schemaPath,'--output-last-message',outputPath,'--json','-'];
}
export function privateEventLog(stdout) {
  return stdout.trim().split('\n').filter(Boolean).map(line=>{
    let event;try{event=JSON.parse(line);}catch{return JSON.stringify({type:'invalid_line',sha256:digest(Buffer.from(line))});}
    // Preserve the event identity and digest, never raw reasoning, snippets,
    // search phrases, prose, provider errors or page bodies. Admission uses the
    // actual transient stream; rights-checked short evidence lives separately.
    const safe={type:event.type,eventSha256:digest(Buffer.from(line))};
    if(event.type==='thread.started')safe.thread_id=event.thread_id;
    if(event.item)safe.item={id:event.item.id,type:event.item.type,itemSha256:digest(jsonBytes(event.item)),
      ...(event.item.type==='web_search'?{action:{type:event.item.action?.type},resultsStored:false}:{textStored:false})};
    return JSON.stringify(safe);
  }).join('\n')+'\n';
}
export async function verifyChildTransport(ctx,{run=spawnSync}={}) {
  const binding=ctx.config.children;
  if(!binding||binding.model!==model||binding.reasoningEffort!==reasoning||!path.isAbsolute(binding.codexExecutable)||
    !/^[a-f0-9]{64}$/.test(binding.executableSha256||''))throw fault('SUPERVISOR_CHILD_CONFIGURATION_INVALID');
  const file=await lstat(binding.codexExecutable);
  if(!file.isFile()||file.isSymbolicLink()||digest(await readFile(binding.codexExecutable))!==binding.executableSha256)
    throw fault('SUPERVISOR_CHILD_EXECUTABLE_CHANGED');
  const options={cwd:ctx.projectRoot,env:childEnvironment(),encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1024*1024};
  const login=run(binding.codexExecutable,['login','status'],options),auth=`${login.stdout||''}\n${login.stderr||''}`;
  if(login.status!==0||!/Logged in using ChatGPT/i.test(auth)||/API key/i.test(auth))throw fault('SUPERVISOR_CHILD_CHATGPT_LOGIN_REQUIRED');
  const version=run(binding.codexExecutable,['--version'],options);
  if(version.status!==0||String(version.stdout||'').trim()!==binding.version)throw fault('SUPERVISOR_CHILD_EXECUTABLE_CHANGED');
  const restricted=['--disable','apps','--disable','plugins'];
  function list(args) {
    const result=run(binding.codexExecutable,[...restricted,...args,'mcp','list','--json'],options);
    let servers;try{servers=JSON.parse(result.stdout);}catch{throw fault('SUPERVISOR_CHILD_ISOLATION_FAILED');}
    if(result.status!==0||!Array.isArray(servers)||servers.some(s=>typeof s.name!=='string'||!/^[A-Za-z0-9_-]+$/.test(s.name)))
      throw fault('SUPERVISOR_CHILD_ISOLATION_FAILED');
    return servers;
  }
  const mcpNames=list([]).map(s=>s.name),disabled=list(mcpNames.flatMap(n=>['-c',`mcp_servers.${n}.enabled=false`]));
  if(disabled.some(s=>s.enabled!==false))throw fault('SUPERVISOR_CHILD_ISOLATION_FAILED');
  return {mcpNames,env:options.env,proof:{model,reasoningEffort:reasoning,version:binding.version,
    executableSha256:binding.executableSha256,billingRoute:'existing ChatGPT login; no API-key fallback',ephemeral:true}};
}

export function analyzeChildEvents(stdout,{kind,maxWebOperations=64,sourceAccessMode='cli_content'}={}) {
  if(!['cli_content','bounded_https'].includes(sourceAccessMode))throw fault('SUPERVISOR_CHILD_CONFIGURATION_INVALID');
  let events;try{events=stdout.trim().split('\n').filter(Boolean).map(JSON.parse);}catch{throw fault('SUPERVISOR_CHILD_EVENTS_INVALID');}
  const permitted=kind==='daily-research'?['agent_message','reasoning','web_search']:['agent_message','reasoning'];
  if(events.some(e=>!e||typeof e.type!=='string'||['turn.failed','error'].includes(e.type)||
    e.item?.type&&!permitted.includes(e.item.type)))throw fault('SUPERVISOR_CHILD_TOOL_OR_TURN_FAILED');
  const starts=events.filter(e=>e.type==='thread.started'),turns=events.filter(e=>e.type==='turn.completed');
  if(starts.length!==1||typeof starts[0].thread_id!=='string'||!starts[0].thread_id||turns.length!==1)
    throw fault('SUPERVISOR_CHILD_COMPLETION_REQUIRED');
  const web=events.filter(e=>e.type==='item.completed'&&e.item?.type==='web_search');
  if(web.length>maxWebOperations)throw fault('SUPERVISOR_CHILD_WEB_BUDGET_EXHAUSTED');
  const opened=[];
  for(const {item} of web) {
    if(!['open_page','find_in_page'].includes(item.action?.type))continue;
    let url;try{url=new URL(item.action.url);}catch{throw fault('SUPERVISOR_CHILD_SOURCE_ACCESS_UNVERIFIABLE');}
    if(url.protocol!=='https:'||url.username||url.password)throw fault('SUPERVISOR_CHILD_SOURCE_ACCESS_UNVERIFIABLE');
    // An attempted open is not consultation. Require a successful returned page
    // with matching URL and actual content; old lossy CLI events fail closed.
    const result=item.results?.find(r=>r?.url===url.href&&typeof r.content==='string'&&r.content.trim()&&!r.error&&
      (!Number.isInteger(r.status)||r.status<400));
    if(result)opened.push({eventId:item.id,url:url.href,contentSha256:digest(Buffer.from(result.content)),returnedContent:result.content});
    else if(sourceAccessMode==='bounded_https'&&item.action.type==='open_page'&&
      item.results?.some(r=>r?.url===url.href&&!r.error&&(!Number.isInteger(r.status)||r.status<400)))
      opened.push({eventId:item.id,url:url.href,kind:'completed_cli_open_requires_fetch',returnedContent:null});
  }
  if(kind==='daily-research'&&!opened.length)throw fault('SUPERVISOR_CHILD_SOURCE_ACCESS_UNVERIFIABLE');
  return {threadId:starts[0].thread_id,opened,webOperations:web.length,eventsSha256:digest(Buffer.from(stdout))};
}

export async function streamChild(executable,args,options,{kind,maxWebOperations=64}={}) {
  return new Promise(resolve=>{
    let stdout='',stderr='',partial='',error=null,closed=false;const web=new Set();
    const child=spawn(executable,args,{cwd:options.cwd,env:options.env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    function stop(code) {
      if(error||closed)return;error={code};
      if(process.platform==='win32'&&Number.isSafeInteger(child.pid))spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:10000});
      else child.kill('SIGKILL');
    }
    const timer=setTimeout(()=>stop('SUPERVISOR_CHILD_DEADLINE'),options.timeout);
    child.stdout.on('data',bytes=>{
      stdout+=bytes.toString();partial+=bytes.toString();
      if(Buffer.byteLength(stdout)>8*1024*1024)return stop('SUPERVISOR_CHILD_OUTPUT_LIMIT');
      const lines=partial.split('\n');partial=lines.pop();
      for(const line of lines.filter(Boolean)) {
        let event;try{event=JSON.parse(line);}catch{return stop('SUPERVISOR_CHILD_EVENTS_INVALID');}
        if(event.item?.type&&!['reasoning','agent_message',...(kind==='daily-research'?['web_search']:[])].includes(event.item.type))
          return stop('SUPERVISOR_CHILD_TOOL_OR_TURN_FAILED');
        if(event.item?.type==='web_search')web.add(event.item.id);
        if(web.size>maxWebOperations)return stop('SUPERVISOR_CHILD_WEB_BUDGET_EXHAUSTED');
      }
    });
    child.stderr.on('data',bytes=>{stderr+=bytes.toString();if(Buffer.byteLength(stderr)>1024*1024)stop('SUPERVISOR_CHILD_OUTPUT_LIMIT');});
    child.on('error',e=>{error={code:e.code};});
    child.on('close',status=>{closed=true;clearTimeout(timer);resolve({status,error,stdout,stderr});});
    child.stdin.on('error',()=>{});child.stdin.end(options.input);
  });
}

export async function executeBoundedChild(ctx,{journal,lease,jobId,readingId,kind,packet,schema,prompt,deadline,authorThreadIds=[]},dependencies={}) {
  if(!kinds.has(kind)||!Number.isFinite(deadline))throw fault('SUPERVISOR_CHILD_CONFIGURATION_INVALID');
  const clock=dependencies.clock||(()=>new Date()),inputSha256=digest(jsonBytes(packet));
  await journal.assertLease(lease,clock());
  const all=(await journal.load()).filter(e=>e.kind==='execution_state').reduce((m,e)=>m.set(e.data.execution.id,e.data.execution),new Map());
  // A new substantive native review basis permits a fresh review, never a
  // workaround for an unresolved dispatch or an unavailable review capability.
  if(kind==='independent-review') {
    const readingReviews=[...all.values()].filter(e=>e.readingId===readingId&&e.kind===kind);
    if(readingReviews.some(e=>['reserved','uncertain'].includes(e.phase)))throw fault('SUPERVISOR_CHILD_DISPATCH_UNCERTAIN');
    if(readingReviews.some(e=>e.phase==='blocked'))throw fault('SUPERVISOR_CHILD_CAPABILITY_BLOCK_RETAINED');
  }
  const previous=new Map([...all.entries()].filter(([,e])=>e.jobId===jobId&&e.kind===kind));
  const values=[...previous.values()];
  if(values.some(e=>['reserved','uncertain'].includes(e.phase)))throw fault('SUPERVISOR_CHILD_DISPATCH_UNCERTAIN');
  if(values.some(e=>e.phase==='blocked'))throw fault('SUPERVISOR_CHILD_CAPABILITY_BLOCK_RETAINED');
  const accepted=values.find(e=>e.phase==='accepted'&&(e.inputSha256===inputSha256||e.repairOfInputSha256===inputSha256));
  if(accepted) {
    const raw=await readFile(await confined(ctx.stateRoot,accepted.output.path,false));
    if(digest(raw)!==accepted.output.sha256)throw fault('SUPERVISOR_CHILD_ACCEPTED_OUTPUT_CHANGED');
    let admission=null;
    if(accepted.admission) {
      const proof=await readFile(await confined(ctx.stateRoot,accepted.admission.path,false));
      if(digest(proof)!==accepted.admission.sha256)throw fault('SUPERVISOR_CHILD_ACCEPTED_OUTPUT_CHANGED');
      admission=JSON.parse(proof);
    }
    return {execution:accepted,output:JSON.parse(raw),admission};
  }
  if(values.length>=2)throw fault('SUPERVISOR_CHILD_REPAIR_EXHAUSTED');
  const remaining=deadline-clock().getTime()-5*60*1000;
  if(remaining<60000)throw fault('SUPERVISOR_CHILD_DEADLINE');
  const transport=await (dependencies.transport||verifyChildTransport)(ctx),id=randomBytes(16).toString('hex'),base=`executions/${id}`;
  const schemaPath=await durableWrite(ctx.stateRoot,`${base}/schema.json`,jsonBytes(schema)),outputPath=await confined(ctx.stateRoot,`${base}/output.json`);
  await durableWrite(ctx.stateRoot,`${base}/prompt.txt`,Buffer.from(prompt));
  const execution={id,jobId,readingId,kind,inputSha256,phase:'reserved',ordinal:values.length+1,proof:transport.proof,
    reservedAt:clock().toISOString(),deadline:new Date(deadline).toISOString()};
  if(packet.repairPlan?.schemaVersion==='supervisor-structural-repair/v1') {
    const {repairPlan,...original}=packet,prior=values.find(v=>v.id===repairPlan.failedExecutionId);
    const nativeRejected=kind==='henry-editorial-repair'&&prior?.code==='SUPERVISOR_HENRY_EDITORIAL_REPAIR_INVALID';
    if(!prior||prior.phase!=='failed'||prior.ordinal!==1||(!nativeRejected&&prior.code!=='SUPERVISOR_CHILD_OUTPUT_INVALID')||
      prior.inputSha256!==digest(jsonBytes(original)))throw fault('SUPERVISOR_CHILD_REPAIR_BINDING_CHANGED');
    const originalRaw=await readFile(await confined(ctx.stateRoot,`executions/${prior.id}/output.json`,false));
    if(digest(originalRaw)!==repairPlan.failedOutputSha256||originalRaw.toString()!==repairPlan.failedOutput)
      throw fault('SUPERVISOR_CHILD_REPAIR_BINDING_CHANGED');
    if(nativeRejected) {
      if(!prior.admissionRejected||repairPlan.admissionRejectedSha256!==prior.admissionRejected.sha256||
        prior.output?.sha256!==repairPlan.failedOutputSha256)throw fault('SUPERVISOR_CHILD_REPAIR_BINDING_CHANGED');
      const rejectionBytes=await readFile(await confined(ctx.stateRoot,prior.admissionRejected.path,false)),rejection=JSON.parse(rejectionBytes);
      if(digest(rejectionBytes)!==prior.admissionRejected.sha256||rejection.executionId!==prior.id||
        rejection.inputSha256!==prior.inputSha256||rejection.failedOutputSha256!==repairPlan.failedOutputSha256||
        digest(jsonBytes(rejection.diagnostics))!==digest(jsonBytes(repairPlan.findings)))throw fault('SUPERVISOR_CHILD_REPAIR_BINDING_CHANGED');
    }
    execution.repairOfInputSha256=prior.inputSha256;
  }
  await durableWrite(ctx.stateRoot,`${base}/packet.json`,jsonBytes(packet));
  await journal.append('execution_state',{execution},clock(),lease); // Before any model dispatch; no refund after a crash.
  const result=await (dependencies.execute||streamChild)(ctx.config.children.codexExecutable,
    childArguments({kind,schemaPath,outputPath,mcpNames:transport.mcpNames}),{cwd:path.dirname(outputPath),env:transport.env,input:prompt,
      timeout:Math.min(limits[kind],remaining)},{kind});
  await durableWrite(ctx.stateRoot,`${base}/events.jsonl`,Buffer.from(privateEventLog(result.stdout||'')));
  await durableWrite(ctx.stateRoot,`${base}/stderr.json`,jsonBytes({sha256:digest(Buffer.from(result.stderr||'')),
    bytes:Buffer.byteLength(result.stderr||''),errorCode:result.error?.code||null}));
  try {
    const failure=authorFailure(result);
    if(result.status!==0||result.error)throw fault(result.error?.code||failure?.code||'SUPERVISOR_CHILD_FAILED');
    const sourceAccessMode=ctx.config.children.sourceAccessMode||'cli_content';
    if(kind==='daily-research'&&sourceAccessMode==='bounded_https'&&!dependencies.admit)throw fault('SUPERVISOR_CHILD_SOURCE_ACCESS_UNVERIFIABLE');
    const proof=analyzeChildEvents(result.stdout,{kind,sourceAccessMode});
    if(['independent-review','henry-editorial-repair'].includes(kind)&&authorThreadIds.includes(proof.threadId))throw fault('SUPERVISOR_CHILD_REVIEW_NOT_INDEPENDENT');
    const raw=await readFile(await confined(ctx.stateRoot,`${base}/output.json`,false));
    if(!raw.length||raw.length>2*1024*1024)throw fault('SUPERVISOR_CHILD_OUTPUT_LIMIT');
    try{assertChildPrivacy(raw.toString());}catch(e){
      // The disposable child may violate its no-Scripture/no-secrets contract.
      // Remove only its confined owned last-message file; retain the hash/code.
      execution.refusedOutputSha256=digest(raw);await unlink(await confined(ctx.stateRoot,`${base}/output.json`,false));throw e;
    }
    const output=JSON.parse(raw);assertSchemaValid(output,schema,{label:'Bounded child output'});
    execution.output={path:`${base}/output.json`,sha256:digest(raw)};
    execution.threadId=proof.threadId;execution.eventsSha256=proof.eventsSha256;
    const admission=dependencies.admit?await dependencies.admit(output,{packet,execution,sourceEvidence:proof.opened}):null;
    if(admission) {
      const admissionBytes=jsonBytes(admission),relative=`${base}/admission.json`;
      await durableWrite(ctx.stateRoot,relative,admissionBytes);execution.admission={path:relative,sha256:digest(admissionBytes)};
    }
    await journal.assertLease(lease,clock());
    execution.phase='accepted';execution.output={path:`${base}/output.json`,sha256:digest(raw)};
    execution.threadId=proof.threadId;execution.eventsSha256=proof.eventsSha256;
    await journal.append('execution_state',{execution},clock(),lease);
    return {execution,output,admission};
  } catch(e) {
    execution.code=e.code||'SUPERVISOR_CHILD_OUTPUT_INVALID';
    execution.phase=['SUPERVISOR_CHILD_COMPLETION_REQUIRED','SUPERVISOR_CHILD_DEADLINE','ETIMEDOUT'].includes(execution.code)?'uncertain':
      ['SUPERVISOR_CHILD_SOURCE_ACCESS_UNVERIFIABLE','SUPERVISOR_CHILD_TOOL_OR_TURN_FAILED','V2_AUTHOR_MODEL_UNAVAILABLE'].includes(execution.code)?'blocked':'failed';
    await journal.append('execution_state',{execution},clock(),lease);throw e;
  }
}
