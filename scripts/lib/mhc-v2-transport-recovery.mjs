import {readFile,readdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {loadJob,confined,readJson,appendState} from './mhc-v2-store.mjs';
import {MODELS,digestObject} from './mhc-v2.mjs';

// Explicit installer recovery under its existing global lock. This is confined
// to a first CLI configuration rejection before any model response or candidate.
// It never clears an attempt, extends a deadline or authorizes a model fallback.
export async function recoverUnstartedTransport(projectRoot,readingId,revision,now=new Date()) {
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(readingId)||!/^[a-f0-9]{40}$/.test(revision))throw Error('V2_TRANSPORT_RECOVERY_ARGUMENTS');
  const root=await confined(projectRoot,`private-content/automation/mhc-v2/${readingId}`,{missing:false}),job=await loadJob(root),state=job.state;
  if(!['generating','queued'].includes(state?.phase)||state.total_submissions!==0||state.pending_attempt||Object.keys(state.accepted).length||Object.keys(state.rejected).length||state.session?.lane!=='spark'||Object.values(state.sessions).some(s=>s.submissions!==0)||state.history.some(e=>e.kind==='unstarted_transport_recovered'))throw Error('V2_TRANSPORT_RECOVERY_NOT_UNSTARTED');
  if(!/^[a-f0-9]{40}$/.test(state.session.runtime_revision)||revision===state.session.runtime_revision)throw Error('V2_TRANSPORT_RECOVERY_NEW_RELEASE_REQUIRED');
  const executions=await confined(root,'model-executions',{missing:false}),names=await readdir(executions);
  if(names.length!==1||!/^[a-f0-9]{64}$/.test(names[0]))throw Error('V2_TRANSPORT_RECOVERY_AMBIGUOUS');
  const directory=await confined(executions,names[0],{missing:false});
  const record=await readJson(await confined(directory,'result.json',{missing:false}));
  const packet=job.input.chapters.flatMap(c=>c.batches).find(p=>digestObject(p)===record.proof?.packet_sha256);
  if(record.status!=='failed'||record.exit_code!==1||record.error_code!==null||record.session!==state.session.id||record.proof?.model!==MODELS.spark||!packet||names[0]!==digestObject({session:record.session,packet:packet.packet_id,submissions:0}))throw Error('V2_TRANSPORT_RECOVERY_BINDING');
  const events=await readFile(await confined(directory,'events.jsonl',{missing:false}),'utf8');
  const stderr=await readFile(await confined(directory,'stderr.txt',{missing:false}),'utf8');
  if(events.trim()||!/^Error loading config\.toml: invalid transport\r?\nin `mcp_servers\.[A-Za-z0-9_-]+`$/.test(stderr.trim()))throw Error('V2_TRANSPORT_RECOVERY_MODEL_MAY_HAVE_STARTED');
  for(const file of [path.join(directory,'response.json'),path.join(root,'author',packet.packet_id,'spark','candidate.json')]){
    const stat=await lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(stat)throw Error('V2_TRANSPORT_RECOVERY_OUTPUT_EXISTS');
  }
  const event={kind:'unstarted_transport_recovered',execution_key:names[0],record_sha256:digestObject(record),prior_revision:state.session.runtime_revision,recovery_revision:revision,at:now.toISOString(),reason:'Codex configuration was rejected before model startup; preserve all source, sessions, budgets and failed-execution bytes.'};
  await appendState(job,'unstarted_transport_recovered',{...state,phase:'queued',blocker:null,history:[...state.history,event]},now);
  return {readingId,recovered:true,modelStarted:false,budgetsUnchanged:true};
}
