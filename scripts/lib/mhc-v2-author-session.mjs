import {spawnSync} from 'node:child_process';
import {readFile,lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {startV2,advanceV2,sourceInput} from './mhc-v2-service.mjs';
import {MODELS,digestObject} from './mhc-v2.mjs';
import {atomicJson,confined,maybeJson,readJson} from './mhc-v2-store.mjs';

const authorActions=new Set(['author_candidate','repair_candidate']);
const effort=lane=>lane==='spark'?'medium':'low';
const blocked=(work,code)=>({...work,action:'checkpointed',stage:'model_transport',code});
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
  if(!Object.values(MODELS).includes(model)||reasoning!==(model===MODELS.spark?'medium':'low'))throw Error('V2_TRANSPORT_MODEL_INVALID');
  if(mcpNames.some(name=>!/^[A-Za-z0-9_-]+$/.test(name)))throw Error('V2_TRANSPORT_MCP_NAME_INVALID');
  return ['exec','--model',model,'-c',`model_reasoning_effort="${reasoning}"`,'-c','model_provider="openai"','--sandbox','read-only',...['shell_tool','apps','plugins','multi_agent'].flatMap(feature=>['--disable',feature]),'-c','web_search="disabled"',...mcpNames.flatMap(name=>['-c',`mcp_servers.${name}.enabled=false`]),'--output-schema',schemaPath,'--output-last-message',outputPath,'--json','-'];
}

export function successfulModelResult(result) {
  if(result.status!==0||result.error)return false;
  const events=String(result.stdout||'').trim().split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return null;}});
  return events.some(e=>e?.type==='turn.completed')&&!events.some(e=>e?.type==='turn.failed'||(e?.item?.type&&!['agent_message','reasoning'].includes(e.item.type)));
}

export async function verifyPublicPacket(ctx,work,lane) {
  if(work.requiredModel!==MODELS[lane])throw Error('V2_TRANSPORT_MODEL_INVALID');
  const root=await confined(ctx.jobRoot,work.readingId,{missing:false});
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
  if(instructions.model!==MODELS[lane]||instructions.reasoning_effort!==effort(lane)||instructions.instructions!==await readFile(path.join(ctx.releaseRoot,'prompts/mhc-v2-author.md'),'utf8'))throw Error('V2_TRANSPORT_INSTRUCTIONS_INVALID');
  return {packet,instructions,proof:{packet_sha256:digestObject(packet),source_archive_sha256:source.sourceManifest.archive_sha256,public_domain_commentary_only:true,model:MODELS[lane],reasoning_effort:effort(lane),destination:'OpenAI Codex using existing ChatGPT login'}};
}

// The installed CLI invokes this while holding the existing runner lock. Only one
// reading is drained, and all submissions, fallback decisions and time limits
// still belong to the unchanged v2 controller. This function cannot review/publish.
export async function runAuthorSession(ctx,{lane,codexExecutable},dependencies={}) {
  if(!MODELS[lane]||!path.isAbsolute(codexExecutable))throw Error('V2_TRANSPORT_CONFIGURATION_INVALID');
  const binary=await lstat(codexExecutable);if(!binary.isFile()||binary.isSymbolicLink())throw Error('V2_TRANSPORT_EXECUTABLE_INVALID');
  const run=dependencies.run||spawnSync,clock=dependencies.clock||(()=>new Date());
  const env={...process.env};delete env.OPENAI_API_KEY;delete env.CODEX_API_KEY;
  const options={cwd:ctx.projectRoot,env,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,timeout:30000};
  const login=run(codexExecutable,['login','status'],options),auth=`${login.stdout||''}\n${login.stderr||''}`;
  if(login.status!==0||!/Logged in using ChatGPT/i.test(auth)||/API key/i.test(auth))throw Error('V2_TRANSPORT_CHATGPT_LOGIN_REQUIRED');
  const mcp=run(codexExecutable,['mcp','list','--json'],options);
  if(mcp.status!==0)throw Error('V2_TRANSPORT_MCP_PREFLIGHT_FAILED');
  let servers;try{servers=JSON.parse(mcp.stdout);}catch{throw Error('V2_TRANSPORT_MCP_PREFLIGHT_FAILED');}
  if(!Array.isArray(servers)||servers.some(s=>typeof s.name!=='string'))throw Error('V2_TRANSPORT_MCP_PREFLIGHT_FAILED');
  const mcpNames=servers.map(s=>s.name);
  let work=await startV2(ctx,lane,clock());
  for(let count=0;authorActions.has(work.action)&&count<32;count++){
    const {packet,instructions,proof}=await verifyPublicPacket(ctx,work,lane);
    const remaining=Date.parse(work.deadlineAt)-clock().getTime();
    if(remaining<15000)return blocked(work,'V2_TRANSPORT_DEADLINE');
    const session=work.advanceArgv.at(-1),root=await confined(ctx.jobRoot,work.readingId,{missing:false});
    const key=digestObject({session,packet:packet.packet_id,submissions:work.totalSubmissions});
    const relative=`model-executions/${key}`,recordPath=await confined(root,`${relative}/result.json`);
    let record=await maybeJson(recordPath);
    if(record&&(!isDeepStrictEqual(record.proof,proof)||record.session!==session))throw Error('V2_TRANSPORT_RECEIPT_MISMATCH');
    if(record&&record.status!=='completed')return blocked(work,'V2_TRANSPORT_ALREADY_ATTEMPTED');
    const outputPath=await confined(root,`${relative}/response.json`);
    if(!record){
      const schemaPath=await atomicJson(root,`${relative}/transport.schema.json`,transportSchema(await readJson(work.schemaPath)),{immutable:true});
      const args=authorArguments({model:MODELS[lane],reasoning:effort(lane),schemaPath,outputPath,mcpNames});
      let diagnostics='';if(work.action==='repair_candidate')diagnostics=JSON.stringify(publicRepairDiagnostics(await readJson(work.validationPath),packet));
      const prompt=`Condense the supplied verified public-domain Henry source packet. You are the exact assigned author, not the reviewer. Return only the candidate JSON. Do not use tools, read other files, change files, or publish. The parent records and validates your final response.\n\n${instructions.instructions}\n\nSOURCE PACKET:\n${JSON.stringify(packet)}\n\n${diagnostics?'VALIDATION TO REPAIR:\n'+diagnostics:''}`;
      record={schema_version:'mhc-model-execution/v1',session,proof,started_at:clock().toISOString(),status:'started'};
      await atomicJson(root,`${relative}/result.json`,record);
      const result=run(codexExecutable,args,{...options,cwd:path.dirname(outputPath),input:prompt,timeout:Math.min(12*60*1000,remaining-5000)});
      await writeFile(await confined(root,`${relative}/events.jsonl`),result.stdout||'',{mode:0o600});
      await writeFile(await confined(root,`${relative}/stderr.txt`),result.stderr||'',{mode:0o600});
      if(!successfulModelResult(result)){
        await atomicJson(root,`${relative}/result.json`,{...record,status:'failed',finished_at:clock().toISOString(),exit_code:result.status,error_code:result.error?.code??null});
        return blocked(work,'V2_TRANSPORT_FAILED');
      }
      let candidate;try{candidate=await readJson(outputPath);}catch{return blocked(work,'V2_TRANSPORT_OUTPUT_MISSING');}
      record={...record,status:'completed',finished_at:clock().toISOString(),candidate_sha256:digestObject(candidate)};
      await atomicJson(root,`${relative}/result.json`,record);
    }
    const candidate=await readJson(outputPath);
    if(digestObject(candidate)!==record.candidate_sha256)throw Error('V2_TRANSPORT_OUTPUT_CHANGED');
    await atomicJson(root,path.relative(root,work.candidatePath),candidate);
    const priorSubmissions=work.totalSubmissions;
    work=await advanceV2(ctx,work.readingId,session,clock());
    if(authorActions.has(work.action)&&work.totalSubmissions===priorSubmissions)return blocked(work,'V2_TRANSPORT_UNCHANGED_CANDIDATE');
  }
  return work;
}
