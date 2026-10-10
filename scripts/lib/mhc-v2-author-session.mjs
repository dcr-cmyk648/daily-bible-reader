import {spawnSync} from 'node:child_process';
import {readFile,lstat,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {startV2,advanceV2,sourceInput} from './mhc-v2-service.mjs';
import {MODELS,digestObject} from './mhc-v2.mjs';
import {atomicJson,confined,maybeJson,readJson,loadJob,appendState} from './mhc-v2-store.mjs';
import {authorFailure} from './mhc-v2-model-errors.mjs';
import {configuredModels,jobModels,authorEffort,LEGACY_MODELS} from './mhc-v2-author-config.mjs';
import {stageAuthorBlock} from './mhc-v2-author-status.mjs';
import {sha256} from './mhc-pipeline.mjs';

const authorActions=new Set(['author_candidate','repair_candidate']);
export const selectionBindingVersion='requested-reading/v1';
export {historicalSelectionBindingVersion} from './mhc-v2-service.mjs';
const effort=lane=>lane==='spark'?'medium':'low';
const blocked=(work,code)=>({...work,action:'checkpointed',stage:'model_transport',code});
async function checkpointTransport(ctx,work,code,now,reason='Author transport failed'){
  const job=await loadJob(await confined(ctx.jobRoot,work.readingId,{missing:false}));
  const deterministic=code==='V2_AUTHOR_MODEL_UNAVAILABLE',count=(job.state.lease?.transport_checkpoints||0)+1;
  const exhausted=count>=2||code==='V2_TRANSPORT_UNCERTAIN';
  const state={...job.state,phase:deterministic||exhausted?'blocked':'queued',
    lease:{...job.state.lease,transport_checkpoints:count,released:deterministic||exhausted},
    blocker:{stage:deterministic?'model_availability':'model_transport',code:deterministic?code:exhausted?'V2_TRANSPORT_RETRY_EXHAUSTED':code}};
  await appendState(job,deterministic?'author_model_unavailable':'transport_checkpoint',state,now);
  const status=state.phase==='blocked'?await stageAuthorBlock(ctx,{model:work.requiredModel,code:state.blocker.code,reason},now):{};
  return {...blocked(work,state.blocker.code),state:state.phase,...status};
}
const repairMessages={V2_CANDIDATE_SCHEMA:'Return exactly the required candidate JSON schema.',V2_PACKET_MISMATCH:'Use the supplied packet_id.',V2_VERSE_COVERAGE:'Return all requested verses exactly once in the supplied order.',V2_EVIDENCE_SCOPE:'Cite only the evidence IDs allowed for this verse.',V2_EMPTY_PROSE:'Write substantive sentences.',V2_PROSE_LENGTH:'Keep combined prose within 1200 characters.',V2_CITATION_LIMIT:'Use at most twelve distinct evidence IDs per verse.',V2_REQUIRED_EVIDENCE:'Preserve and cite the required identity or relationship.',V2_SOURCE_COPY:'Use fresh wording without extended source copying.'};

export function publicRepairDiagnostics(validation,packet) {
  const verses=new Set(packet.requests.map(r=>r.verse_id));
  // Never forward raw validation messages, candidate records, paths, requirement
  // objects or extra properties. Every output word is static or from the already
  // verified public packet, even if the local diagnostics file was altered.
  return (Array.isArray(validation?.diagnostics)?validation.diagnostics:[]).map(d=>{
    const code=Object.hasOwn(repairMessages,d?.code)?d.code:'V2_CANDIDATE_SCHEMA';
    return {code,message:repairMessages[code],...(verses.has(d?.verse_id)?{verse_id:d.verse_id}:{})};
  });
}

export function transportSchema(schema) {
  const value=structuredClone(schema);
  function visit(node){if(!node||typeof node!=='object')return;if(node.const!==undefined&&!node.type)node.type=typeof node.const;delete node.uniqueItems;for(const child of Object.values(node))if(Array.isArray(child))child.forEach(visit);else visit(child);}
  visit(value);return value; // The original strict controller schema is unchanged.
}

export function authorArguments({model,reasoning,schemaPath,outputPath,mcpNames=[]}) {
  if(![...Object.values(MODELS),LEGACY_MODELS.spark].includes(model)||reasoning!==(model===MODELS.luna?'low':'medium'))throw Error('V2_TRANSPORT_MODEL_INVALID');
  if(mcpNames.some(name=>!/^[A-Za-z0-9_-]+$/.test(name)))throw Error('V2_TRANSPORT_MCP_NAME_INVALID');
  return ['exec','--ephemeral','--model',model,'-c',`model_reasoning_effort="${reasoning}"`,'-c','model_provider="openai"','-c','forced_login_method="chatgpt"','--sandbox','read-only',...['shell_tool','apps','plugins','multi_agent'].flatMap(feature=>['--disable',feature]),'-c','web_search="disabled"',...mcpNames.flatMap(name=>['-c',`mcp_servers.${name}.enabled=false`]),'--output-schema',schemaPath,'--output-last-message',outputPath,'--json','-'];
}

export function successfulModelResult(result) {
  if(result.status!==0||result.error)return false;
  const events=String(result.stdout||'').trim().split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return null;}});
  return events.some(e=>e?.type==='turn.completed')&&!events.some(e=>!e||typeof e.type!=='string'||['turn.failed','error'].includes(e.type)||(e?.item?.type&&!['agent_message','reasoning'].includes(e.item.type)));
}

export async function verifyPublicPacket(ctx,work,lane) {
  const root=await confined(ctx.jobRoot,work.readingId,{missing:false});
  const model=jobModels(await loadJob(root))[lane];
  if(work.requiredModel!==model)throw Error('V2_TRANSPORT_MODEL_INVALID');
  for(const key of ['sourcePath','schemaPath','instructionsPath','candidatePath','validationPath']){
    const verified=await confined(root,path.relative(root,work[key]));
    if(verified!==work[key])throw Error('V2_TRANSPORT_PATH_INVALID');
  }
  const entry=ctx.plan.entries.find(e=>e.readingId===work.readingId);
  if(!entry||entry.kind!=='chapter')throw Error('V2_TRANSPORT_READING_INVALID');
  const source=await sourceInput(ctx,entry),packet=await readJson(work.sourcePath);
  const expected=source.input.chapters.flatMap(c=>c.batches).find(p=>p.packet_id===packet.packet_id);
  if(!isDeepStrictEqual(packet,expected)||!/public domain/i.test(source.sourceManifest.license))throw Error('V2_TRANSPORT_PUBLIC_SOURCE_MISMATCH');
  const atoms=new Map(source.chapters.flatMap(c=>c.units.flatMap(u=>u.source_atoms.map(a=>[a.source_atom_id,a]))));
  for(const evidence of packet.evidence){const atom=atoms.get(evidence.evidence_id);if(!atom||!['commentary','heading'].includes(atom.atom_type)||atom.text!==evidence.text)throw Error('V2_TRANSPORT_NON_COMMENTARY_INPUT');}
  const instructions=await readJson(work.instructionsPath);
  if(instructions.model!==model||instructions.reasoning_effort!==effort(lane)||instructions.instructions!==await readFile(path.join(ctx.releaseRoot,'prompts/mhc-v2-author.md'),'utf8'))throw Error('V2_TRANSPORT_INSTRUCTIONS_INVALID');
  return {packet,instructions,proof:{packet_sha256:digestObject(packet),source_archive_sha256:source.sourceManifest.archive_sha256,public_domain_commentary_only:true,model,reasoning_effort:effort(lane),destination:'OpenAI Codex using existing ChatGPT login'}};
}

// The installed CLI holds the existing lock. Preflight claims nothing. Each
// reading still passes the strict controller; this adapter cannot review/publish.
export async function authorPreflight(ctx,{lane='spark',codexExecutable},dependencies={}) {
  try{return await performPreflight(ctx,{lane,codexExecutable},dependencies);}catch(error){
    const reason=/CHATGPT_LOGIN_REQUIRED/.test(error.message)?'Existing ChatGPT login required':/MCP/.test(error.message)?'Tool isolation verification failed':'Author executable or configuration unavailable';
    const failure={action:'none',state:'blocked',stage:'model_availability',code:'V2_AUTHOR_MODEL_UNAVAILABLE',model:configuredModels(ctx)[lane],reason};
    return {...failure,...await stageAuthorBlock(ctx,failure,(dependencies.clock||(()=>new Date()))())};
  }
}

async function performPreflight(ctx,{lane='spark',codexExecutable},dependencies={}) {
  if(!MODELS[lane]||!path.isAbsolute(codexExecutable))throw Error('V2_TRANSPORT_CONFIGURATION_INVALID');
  const binary=await lstat(codexExecutable);if(!binary.isFile()||binary.isSymbolicLink())throw Error('V2_TRANSPORT_EXECUTABLE_INVALID');
  const run=dependencies.run||spawnSync,clock=dependencies.clock||(()=>new Date());
  const env={...process.env};for(const name of ['OPENAI_API_KEY','CODEX_API_KEY','OPENAI_BASE_URL','CODEX_ACCESS_TOKEN'])delete env[name];
  const options={cwd:ctx.projectRoot,env,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,timeout:30000};
  const login=run(codexExecutable,['login','status'],options),auth=`${login.stdout||''}\n${login.stderr||''}`;
  if(login.status!==0||!/Logged in using ChatGPT/i.test(auth)||/API key/i.test(auth))throw Error('V2_TRANSPORT_CHATGPT_LOGIN_REQUIRED');
  const restricted=['--disable','apps','--disable','plugins'];
  const mcp=run(codexExecutable,[...restricted,'mcp','list','--json'],options);
  if(mcp.status!==0)throw Error('V2_TRANSPORT_MCP_PREFLIGHT_FAILED');
  let servers;try{servers=JSON.parse(mcp.stdout);}catch{throw Error('V2_TRANSPORT_MCP_PREFLIGHT_FAILED');}
  if(!Array.isArray(servers)||servers.some(s=>typeof s.name!=='string'))throw Error('V2_TRANSPORT_MCP_PREFLIGHT_FAILED');
  const mcpNames=servers.map(s=>s.name);
  if(mcpNames.some(name=>!/^[A-Za-z0-9_-]+$/.test(name)))throw Error('V2_TRANSPORT_MCP_NAME_INVALID');
  const check=run(codexExecutable,[...restricted,...mcpNames.flatMap(name=>['-c',`mcp_servers.${name}.enabled=false`]),'mcp','list','--json'],options);
  let disabled;try{disabled=JSON.parse(check.stdout);}catch{throw Error('V2_TRANSPORT_MCP_PREFLIGHT_FAILED');}
  if(check.status!==0||!Array.isArray(disabled)||disabled.some(s=>s.enabled!==false))throw Error('V2_TRANSPORT_MCP_PREFLIGHT_FAILED');
  const models=configuredModels(ctx),receipts=[];
  const version=run(codexExecutable,['--version'],options);
  if(version.status!==0||!/^codex-cli \d+\.\d+\.\d+$/.test(String(version.stdout||'').trim()))throw Error('V2_TRANSPORT_EXECUTABLE_VERSION_INVALID');
  const executableSha256=sha256(await readFile(codexExecutable));
  const root=path.join(ctx.runtimeRoot,'author-preflight');
  for(const [authorLane,model] of Object.entries(models)){
    const schemaPath=await atomicJson(root,'probe.schema.json',{type:'object',required:['ok'],additionalProperties:false,properties:{ok:{type:'boolean',const:true}}},{immutable:true});
    const outputPath=await confined(root,`probe-${authorLane}.json`);
    await unlink(outputPath).catch(error=>{if(error.code!=='ENOENT')throw error;});
    const result=run(codexExecutable,authorArguments({model,reasoning:authorEffort(authorLane),schemaPath,outputPath,mcpNames}),{...options,cwd:root,timeout:60000,input:'Availability preflight only. Do not use tools or read files. Return exactly {"ok":true}.'});
    let ok=false;try{ok=(await readJson(outputPath)).ok===true;}catch{}
    const failure=authorFailure(result);
    const valid=successfulModelResult(result)&&ok;
    const receipt={model,lane:authorLane,reasoning:authorEffort(authorLane),checkedAt:clock().toISOString(),code:failure?.code??(valid?null:'V2_TRANSPORT_PREFLIGHT_FAILED'),reason:failure?.reason??(valid?'Model availability verified':'Probe response invalid'),eventsSha256:sha256(result.stdout||''),stderrSha256:sha256(result.stderr||'')};
    receipts.push(receipt);
    if(receipt.code){
      const failed={schema_version:'mhc-author-preflight/v1',state:'blocked',billingRoute:'existing ChatGPT login; no API-key fallback',codexExecutable,executableSha256,version:String(version.stdout||'').trim(),receipts};
      const receiptPath=await atomicJson(root,`receipts/${digestObject(failed)}.json`,failed,{immutable:true});
      const status=await stageAuthorBlock(ctx,receipt,clock());return {...failed,action:'none',stage:'model_availability',code:receipt.code,model,reason:receipt.reason,...status,receiptPath};
    }
  }
  const receipt={schema_version:'mhc-author-preflight/v1',state:'available',billingRoute:'existing ChatGPT login; no API-key fallback',codexExecutable,executableSha256,version:String(version.stdout||'').trim(),receipts};
  const receiptPath=await atomicJson(root,`receipts/${digestObject(receipt)}.json`,receipt,{immutable:true});
  const value={...receipt,receiptPath};
  // Never serialize the inherited process environment into receipts or logs.
  Object.defineProperty(value,'transport',{value:{mcpNames,options},enumerable:false});
  return value;
}

export async function runAuthorSession(ctx,{lane,codexExecutable,maxReadings=3,requestedReadingId,requestedDailyWorkOrder,requestedHistoricalAuthorization},dependencies={}) {
  if(!Number.isInteger(maxReadings)||maxReadings<1||maxReadings>3)throw Error('V2_AUTHOR_RUN_CAP_INVALID');
  if(requestedReadingId!==undefined&&maxReadings!==1)throw Error('V2_AUTHOR_REQUESTED_READING_CAP_INVALID');
  if(requestedDailyWorkOrder!==undefined&&(requestedReadingId===undefined||maxReadings!==1))throw Error('V2_AUTHOR_DAILY_WORK_ORDER_CAP_INVALID');
  if(requestedHistoricalAuthorization!==undefined&&(requestedReadingId===undefined||maxReadings!==1||requestedDailyWorkOrder!==undefined))throw Error('V2_AUTHOR_HISTORICAL_CAP_INVALID');
  const preflight=await authorPreflight(ctx,{lane,codexExecutable},dependencies);
  if(preflight.state!=='available')return preflight;
  const run=dependencies.run||spawnSync,clock=dependencies.clock||(()=>new Date()),{mcpNames,options}=preflight.transport;
  const results=[],runDeadline=clock().getTime()+60*60*1000;
  for(let readingCount=0;readingCount<maxReadings&&clock().getTime()<runDeadline;readingCount++){
    const work=await drainReading(readingCount?{...ctx,forwardOnly:true}:ctx,{lane,codexExecutable,run,clock,mcpNames,options,runDeadline,requestedReadingId,requestedDailyWorkOrder,requestedHistoricalAuthorization});
    results.push(work);
    if(work.action!=='review_handoff'||work.scheduleDate<henryToday(ctx,clock()))break;
  }
  return {...results.at(-1),readings:results,preflightReceiptPath:preflight.receiptPath};
}
const henryToday=(ctx,now)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
async function drainReading(ctx,{lane,codexExecutable,run,clock,mcpNames,options,runDeadline,requestedReadingId,requestedDailyWorkOrder,requestedHistoricalAuthorization}) {
  let work=await startV2(ctx,lane,clock(),{requestedReadingId,requestedDailyWorkOrder,requestedHistoricalAuthorization});
  // Classifying retained provider evidence is not a model dispatch. An expired
  // session may transfer its proven refusal, but cannot get time or attempts back.
  if(lane==='spark'&&work.code==='V2_WAKE_BUDGET'){
    const {packet,proof}=await verifyPublicPacket(ctx,work,lane);
    const session=work.advanceArgv.at(-1),root=await confined(ctx.jobRoot,work.readingId,{missing:false});
    const key=digestObject({session,packet:packet.packet_id,submissions:work.totalSubmissions});
    const record=await maybeJson(await confined(root,`model-executions/${key}/result.json`));
    if(record?.status==='failed'&&record.error_code===null&&record.session===session&&isDeepStrictEqual(record.proof,proof)){
      const stdout=await readFile(await confined(root,`model-executions/${key}/events.jsonl`,{missing:false}),'utf8');
      const stderr=await readFile(await confined(root,`model-executions/${key}/stderr.txt`,{missing:false}),'utf8');
      const failure=authorFailure({status:record.exit_code,stdout,stderr});
      if(failure?.code==='V2_AUTHOR_MODEL_UNAVAILABLE')return checkpointTransport(ctx,work,failure.code,clock(),failure.reason);
    }
    return work;
  }
  for(let count=0;authorActions.has(work.action)&&count<32;count++){
    const {packet,instructions,proof}=await verifyPublicPacket(ctx,work,lane);
    const remaining=Math.min(Date.parse(work.deadlineAt),runDeadline)-clock().getTime();
    if(remaining<15000)return checkpointTransport(ctx,work,'V2_TRANSPORT_DEADLINE',clock());
    const session=work.advanceArgv.at(-1),root=await confined(ctx.jobRoot,work.readingId,{missing:false});
    const job=await loadJob(root);
    const baseKey=digestObject({session,packet:packet.packet_id,submissions:work.totalSubmissions,...(job.state.history.some(e=>e.kind==='author_configuration_rebound')?{model:proof.model}:{})});
    const recovery=job.state.history.findLast(e=>['unstarted_transport_recovered','client_upgrade_recovered'].includes(e.kind)&&e.execution_key===baseKey);
    if(recovery?.kind==='client_upgrade_recovered'&&(codexExecutable!==recovery.executable.path||sha256(await readFile(codexExecutable))!==recovery.executable.sha256))throw Error('V2_CLIENT_RECOVERY_EXECUTABLE_CHANGED');
    if(recovery?.kind==='client_upgrade_recovered'){
      const prior=await readJson(await confined(root,`model-executions/${baseKey}/result.json`,{missing:false}));
      const events=await readFile(await confined(root,`model-executions/${baseKey}/events.jsonl`,{missing:false}),'utf8');
      if(digestObject(prior)!==recovery.record_sha256||digestObject(events)!==recovery.events_sha256)throw Error('V2_CLIENT_RECOVERY_PROOF_CHANGED');
    }
    const key=recovery?digestObject({original_execution:baseKey,recovery_sha256:digestObject(recovery)}):baseKey;
    const relative=`model-executions/${key}`,recordPath=await confined(root,`${relative}/result.json`);
    let record=await maybeJson(recordPath);
    if(record&&(!isDeepStrictEqual(record.proof,proof)||record.session!==session))throw Error('V2_TRANSPORT_RECEIPT_MISMATCH');
    if(record&&record.status!=='completed'){
      if(record.status==='failed'){
        const stdout=await readFile(await confined(root,`${relative}/events.jsonl`,{missing:false}),'utf8');
        const stderr=await readFile(await confined(root,`${relative}/stderr.txt`,{missing:false}),'utf8');
        const failure=authorFailure({status:record.exit_code,stdout,stderr});
        if(failure?.code==='V2_AUTHOR_MODEL_UNAVAILABLE')return checkpointTransport(ctx,work,failure.code,clock(),failure.reason);
      }
      return checkpointTransport(ctx,work,record.status==='started'?'V2_TRANSPORT_UNCERTAIN':'V2_TRANSPORT_ALREADY_ATTEMPTED',clock());
    }
    const outputPath=await confined(root,`${relative}/response.json`);
    if(!record){
      const schemaPath=await atomicJson(root,`${relative}/transport.schema.json`,transportSchema(await readJson(work.schemaPath)),{immutable:true});
      const args=authorArguments({model:proof.model,reasoning:effort(lane),schemaPath,outputPath,mcpNames});
      let diagnostics='';if(work.action==='repair_candidate')diagnostics=JSON.stringify(publicRepairDiagnostics(await readJson(work.validationPath),packet));
      const prompt=`Condense the supplied verified public-domain Henry source packet. You are the exact assigned author, not the reviewer. Return only the candidate JSON. Do not use tools, read other files, change files, or publish. The parent records and validates your final response.\n\n${instructions.instructions}\n\nSOURCE PACKET:\n${JSON.stringify(packet)}\n\n${diagnostics?'VALIDATION TO REPAIR:\n'+diagnostics:''}`;
      record={schema_version:'mhc-model-execution/v1',session,proof,started_at:clock().toISOString(),status:'started'};
      await atomicJson(root,`${relative}/result.json`,record);
      const result=run(codexExecutable,args,{...options,cwd:path.dirname(outputPath),input:prompt,timeout:Math.min(12*60*1000,remaining-5000)});
      await writeFile(await confined(root,`${relative}/events.jsonl`),result.stdout||'',{mode:0o600});
      await writeFile(await confined(root,`${relative}/stderr.txt`),result.stderr||'',{mode:0o600});
      if(!successfulModelResult(result)){
        await atomicJson(root,`${relative}/result.json`,{...record,status:'failed',finished_at:clock().toISOString(),exit_code:result.status,error_code:result.error?.code??null});
        const failure=authorFailure(result)||{code:'V2_TRANSPORT_PROTOCOL_FAILED',reason:'Author response protocol failed'};
        return checkpointTransport(ctx,work,failure.code,clock(),failure.reason);
      }
      let candidate;try{candidate=await readJson(outputPath);}catch{return checkpointTransport(ctx,work,'V2_TRANSPORT_OUTPUT_MISSING',clock());}
      record={...record,status:'completed',finished_at:clock().toISOString(),candidate_sha256:digestObject(candidate)};
      await atomicJson(root,`${relative}/result.json`,record);
    }
    const candidate=await readJson(outputPath);
    if(digestObject(candidate)!==record.candidate_sha256)throw Error('V2_TRANSPORT_OUTPUT_CHANGED');
    await atomicJson(root,path.relative(root,work.candidatePath),candidate);
    const priorSubmissions=work.totalSubmissions;
    work=await advanceV2(ctx,work.readingId,session,clock());
    if(authorActions.has(work.action)&&work.totalSubmissions===priorSubmissions)return checkpointTransport(ctx,work,'V2_TRANSPORT_UNCHANGED_CANDIDATE',clock());
  }
  return work;
}
