import {readFile,lstat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {loadJob,confined,readJson,appendState} from './mhc-v2-store.mjs';
import {MODELS,digestObject} from './mhc-v2.mjs';
import {sha256} from './mhc-pipeline.mjs';
import {modelRequiresNewClient} from './mhc-v2-model-errors.mjs';

// Explicit operator recovery of a provider-rejected, never-authored request.
// The caller holds the installed global lock. No model call or budget reset.
export async function recoverClientUpgrade(ctx,readingId,priorExecutable,executable,now=new Date(),run=spawnSync){
  const root=await confined(ctx.jobRoot,readingId,{missing:false}),job=await loadJob(root),state=job.state;
  if(state?.phase!=='queued'||state.total_submissions!==0||state.pending_attempt||Object.keys(state.accepted).length||Object.keys(state.rejected).length||state.history.some(e=>e.kind==='client_upgrade_recovered'))throw Error('V2_CLIENT_RECOVERY_NOT_ELIGIBLE');
  const chapter=job.input.chapters.find(c=>c.batches.length),packet=chapter?.batches[0],lane=state.session?.lane;
  if(!packet||!MODELS[lane]||state.owners[`${chapter.book_id}.${chapter.chapter}`]!==lane)throw Error('V2_CLIENT_RECOVERY_BINDING');
  const key=digestObject({session:state.session.id,packet:packet.packet_id,submissions:0});
  const directory=await confined(root,`model-executions/${key}`,{missing:false});
  const record=await readJson(await confined(directory,'result.json',{missing:false}));
  const events=await readFile(await confined(directory,'events.jsonl',{missing:false}),'utf8');
  if(record.status!=='failed'||record.error_code!==null||record.session!==state.session.id||record.proof?.model!==MODELS[lane]||record.proof.packet_sha256!==digestObject(packet)||!modelRequiresNewClient({status:record.exit_code,stdout:events},MODELS[lane]))throw Error('V2_CLIENT_RECOVERY_PROOF');
  for(const file of [path.join(directory,'response.json'),path.join(root,'author',packet.packet_id,lane,'candidate.json')]){
    const stat=await lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(stat)throw Error('V2_CLIENT_RECOVERY_OUTPUT_EXISTS');
  }
  const binaries=[];
  for(const file of [priorExecutable,executable]){
    if(!path.isAbsolute(file))throw Error('V2_CLIENT_RECOVERY_EXECUTABLE');
    const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('V2_CLIENT_RECOVERY_EXECUTABLE');
    const result=run(file,['--version'],{encoding:'utf8',windowsHide:true,timeout:30000});
    const match=/^codex-cli (\d+)\.(\d+)\.(\d+)\s*$/.exec(String(result.stdout||'').trim());
    if(result.status!==0||!match)throw Error('V2_CLIENT_RECOVERY_VERSION');
    binaries.push({path:file,sha256:sha256(await readFile(file)),version:match.slice(1).map(Number)});
  }
  const [before,after]=binaries,changed=after.version.findIndex((v,i)=>v!==before.version[i]);
  if(before.sha256===after.sha256||changed<0||after.version[changed]<=before.version[changed])throw Error('V2_CLIENT_RECOVERY_UPGRADE_REQUIRED');
  const event={kind:'client_upgrade_recovered',execution_key:key,record_sha256:digestObject(record),events_sha256:digestObject(events),prior_executable:before,executable:after,at:now.toISOString()};
  await appendState(job,'client_upgrade_recovered',{...state,blocker:null,history:[...state.history,event]},now);
  return {readingId,recovered:true,modelStarted:false,budgetsUnchanged:true};
}
