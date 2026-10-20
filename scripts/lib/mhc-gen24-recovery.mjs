import {readFile,readdir,mkdir,lstat,open} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {sourceInput,advanceV2,buildReview} from './mhc-v2-service.mjs';
import {loadJob,createJob,appendState,atomicJson,bytesFor,confined,maybeJson,readJson,assertAuthorExecutionsFinished} from './mhc-v2-store.mjs';
import {digestObject,candidateSchema,validateCandidate} from './mhc-v2.mjs';
import {sha256} from './mhc-pipeline.mjs';
import {prepareAuthorTransport,authorArguments,transportSchema,successfulModelResult,verifyPublicPacket} from './mhc-v2-author-session.mjs';
import {configuredModels} from './mhc-v2-author-config.mjs';
import {henryPriorityWindow} from './mhc-priority.mjs';
import {assertNativeWriterAllowed} from './mhc-native-supervisor-guard.mjs';

export const GEN24_RECOVERY_GRANT='gen24-recovery-20261020';
const READING='LTP-0041-GEN-024',MODEL='gpt-6-luna',HOUR=3600000;
const POLICY={grant_id:GEN24_RECOVERY_GRANT,reading_id:READING,max_author_calls:5,max_duration_ms:HOUR,unknown_prior_dispatches_charged:1,model:MODEL,reasoning:'medium',billing_route:'existing ChatGPT login; no API-key fallback',missing_packet_indexes:[6,7,8,9,10]};
const hash=x=>/^[a-f0-9]{64}$/.test(String(x||''));
const error=code=>Object.assign(Error(`V2_GEN24_RECOVERY_${code}`),{stage:'recovery',readingId:READING});
function requireThat(ok,code){if(!ok)throw error(code);}
function exact(value,keys){requireThat(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(','),'SHAPE_INVALID');}
const normalJobs=ctx=>path.join(ctx.projectRoot,'private-content/automation/mhc-v2');
const recoveryRoot=ctx=>path.join(ctx.projectRoot,'private-content/automation',GEN24_RECOVERY_GRANT);
const derivativeJobs=ctx=>path.join(recoveryRoot(ctx),'derivative-jobs');
const originalRoot=ctx=>path.join(normalJobs(ctx),READING);
const runtimeBinding=ctx=>({project_root:path.resolve(ctx.projectRoot),runtime_root:path.resolve(ctx.runtimeRoot),source_revision:ctx.config.source_revision,manifest_sha256:ctx.manifestSha256,config_sha256:digestObject(ctx.config)});
async function runtimeCode(ctx){
  const installed=await readFile(path.join(ctx.releaseRoot,'scripts/lib/mhc-gen24-recovery.mjs')),manifestBytes=await readFile(path.join(ctx.releaseRoot,'manifest.json')),manifest=JSON.parse(manifestBytes),entry=manifest.files?.find(f=>f.path==='scripts/lib/mhc-gen24-recovery.mjs');
  requireThat(sha256(installed)===sha256(await readFile(fileURLToPath(import.meta.url)))&&sha256(manifestBytes)===ctx.manifestSha256&&manifest.source_revision===ctx.config.source_revision&&entry?.sha256===sha256(installed)&&entry.bytes===installed.length,'RUNTIME_NOT_QUALIFIED');return sha256(installed);
}
async function immutable(root,relative,value,{raw=false}={}){
  const file=await confined(root,relative);await mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const handle=await open(file,'wx',0o600);try{await handle.writeFile(raw?value:bytesFor(value));await handle.sync();}finally{await handle.close();}return file;
}
async function inventory(root){const files=[];async function walk(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const file=await confined(root,path.relative(root,path.join(dir,ent.name)),{missing:false});if(ent.isDirectory()&&!ent.isSymbolicLink())await walk(file);else{requireThat(ent.isFile()&&!ent.isSymbolicLink(),'ORIGINAL_UNVERIFIABLE');const b=await readFile(file);files.push({path:path.relative(root,file).replaceAll('\\','/'),sha256:sha256(b),bytes:b.length});}}}await walk(root);return files.sort((a,b)=>a.path.localeCompare(b.path));}

export async function inspectGen24Recovery(ctx){
  const root=await confined(ctx.projectRoot,path.relative(ctx.projectRoot,originalRoot(ctx)),{missing:false}),job=await loadJob(root),entry=ctx.plan.entries.find(e=>e.readingId===READING);
  requireThat(entry&&job.state.phase==='blocked'&&job.state.blocker?.code==='V2_AUTHOR_LEASE_EXPIRED'&&job.state.lease?.released===true&&job.state.total_submissions===6&&!job.state.pending_attempt&&job.state.models?.spark===MODEL,'ORIGINAL_STATE_INVALID');
  const published=await readJson(await confined(ctx.privateRoot,'private-manifest.json',{missing:false})),metadata=await readJson(await confined(ctx.privateRoot,`bridge/celebration-y3q4/${READING}.metadata.json`,{missing:false}));
  requireThat(Boolean(published.readings?.[READING])&&metadata.readingId===READING,'DEVOTIONAL_NOT_PREPARED');
  const sources=await sourceInput(ctx,entry),packets=job.input.chapters.flatMap(c=>c.batches);
  requireThat(sources.input.input_sha256===job.input.input_sha256&&job.input.chapters.length===1&&job.input.chapters[0].book_id==='GEN'&&job.input.chapters[0].chapter===24&&packets.length===11&&isDeepStrictEqual(packets.flatMap(p=>p.requests.map(r=>r.verse_id)),Array.from({length:67},(_,i)=>`GEN.24.${i+1}`)),'SOURCE_CHANGED');
  requireThat(isDeepStrictEqual(packets.slice(0,6).flatMap(p=>p.requests.map(r=>r.verse_id)),Array.from({length:36},(_,i)=>`GEN.24.${i+1}`))&&isDeepStrictEqual(packets.slice(6).flatMap(p=>p.requests.map(r=>r.verse_id)),Array.from({length:31},(_,i)=>`GEN.24.${i+37}`)),'SOURCE_CHANGED');
  requireThat(Object.keys(job.state.accepted).length===6&&Object.keys(job.state.rejected).length===0&&job.state.owners['GEN.24']==='spark','ACCEPTED_CHANGED');
  const accepted=[];
  for(let i=0;i<packets.length;i++){
    const p=packets[i],admitted=job.state.accepted[`${p.packet_id}:spark`];if(i>=6){requireThat(!admitted,'ACCEPTED_CHANGED');continue;}
    requireThat(admitted&&hash(admitted.candidate_sha256),'ACCEPTED_CHANGED');const attempt=await readJson(await confined(root,`attempts/${admitted.candidate_sha256}.json`,{missing:false}));
    requireThat(sha256(attempt.bytes)===admitted.candidate_sha256&&validateCandidate(JSON.parse(attempt.bytes),p).valid,'ACCEPTED_CHANGED');accepted.push({packet_id:p.packet_id,candidate_sha256:admitted.candidate_sha256});
  }
  const unresolved=[],completedExecutions=[];const execRoot=await confined(root,'model-executions',{missing:false});
  for(const key of (await readdir(execRoot)).sort()){requireThat(hash(key),'INTENT_UNVERIFIABLE');const record=await readJson(await confined(execRoot,`${key}/result.json`,{missing:false}));
    requireThat(['started','completed','failed'].includes(record.status),'INTENT_UNVERIFIABLE');if(record.status==='started')unresolved.push({key,record});else completedExecutions.push({key,record});}
  requireThat(completedExecutions.length===6,'EXECUTION_HISTORY_CHANGED');
  for(const a of accepted){const packet=packets.find(p=>p.packet_id===a.packet_id),attempt=await readJson(await confined(root,`attempts/${a.candidate_sha256}.json`,{missing:false})),candidateDigest=digestObject(JSON.parse(attempt.bytes)),matches=completedExecutions.filter(e=>e.record.status==='completed'&&e.record.candidate_sha256===candidateDigest&&e.record.proof?.packet_sha256===digestObject(packet)&&e.record.proof.model===MODEL&&e.record.proof.reasoning_effort==='medium');
    requireThat(matches.length===1,'EXECUTION_HISTORY_CHANGED');const execution=matches[0],response=await readJson(await confined(execRoot,`${execution.key}/response.json`,{missing:false})),events=await readFile(await confined(execRoot,`${execution.key}/events.jsonl`,{missing:false}),'utf8');requireThat(digestObject(response)===candidateDigest&&successfulModelResult({status:0,stdout:events}),'EXECUTION_HISTORY_CHANGED');}
  requireThat(unresolved.length===1,'INTENT_CHANGED');const unknown=unresolved[0],packet=packets[6];
  requireThat(unknown.key===digestObject({session:unknown.record.session,packet:packet.packet_id,submissions:6})&&unknown.record.session===job.state.session.id&&unknown.record.proof?.packet_sha256===digestObject(packet)&&unknown.record.proof.model===MODEL,'INTENT_CHANGED');
  for(const name of ['response.json','events.jsonl','stderr.txt'])requireThat(!await lstat(path.join(execRoot,unknown.key,name)).catch(e=>{if(e.code==='ENOENT')return null;throw e;}),'INTENT_CHANGED');
  const files=await inventory(root),after=await loadJob(root);requireThat(after.previous===job.previous,'ORIGINAL_CHANGED');
  const binding={project_root:path.resolve(ctx.projectRoot),reading_id:READING,plan_version:job.input.plan_version,input_sha256:job.input.input_sha256,event_head:job.previous,event_sequence:job.sequence,file_inventory_sha256:digestObject(files),source_archive_sha256:sources.sourceManifest.archive_sha256,packets:packets.map(p=>({packet_id:p.packet_id,sha256:digestObject(p)})),accepted,known_author_executions:completedExecutions.map(e=>({key:e.key,record_sha256:digestObject(e.record)})),unknown_intent:{key:unknown.key,record_sha256:digestObject(unknown.record),allowance_charged:1},original_session:job.state.session,original_lease:job.state.lease};
  return {binding,binding_sha256:digestObject(binding),job,packets};
}
async function approval(ctx,bindingSha){
  const value=await readJson(await confined(recoveryRoot(ctx),'approval.json',{missing:false}));
  exact(value,['schema_version','grant_id','approved','approved_at','original_binding_sha256','max_author_calls','max_duration_ms','unknown_prior_dispatches_charged']);
  requireThat(value.schema_version==='mhc-gen24-user-approval/v1'&&value.grant_id===GEN24_RECOVERY_GRANT&&value.approved===true&&value.max_author_calls===5&&value.max_duration_ms===HOUR&&value.unknown_prior_dispatches_charged===1&&value.original_binding_sha256===bindingSha&&Number.isFinite(Date.parse(value.approved_at)),'APPROVAL_INVALID');return value;
}
function overnight(date){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Detroit',hourCycle:'h23',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(date)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value])),minutes=+p.hour*60+(+p.minute);return minutes>=1410||minutes<390;}
function windowValid(window,approvedAt,now){
  exact(window,['not_before','expires_at']);const start=Date.parse(window.not_before),end=Date.parse(window.expires_at);
  requireThat(Number.isFinite(start)&&Number.isFinite(end)&&start>=Date.parse(approvedAt)&&end>start&&end-start<=HOUR&&overnight(start)&&overnight(end-1),'WINDOW_INVALID');
  if(now!==undefined)requireThat(+new Date(now)>=start&&+new Date(now)<end&&overnight(now),'WINDOW_CLOSED');
}
export async function prepareGen24Recovery(ctx,{notBefore,expiresAt,codexExecutable,preflightReceipt}){
  await assertNativeWriterAllowed(ctx);requireThat(!await lstat(await confined(recoveryRoot(ctx),'consumed.json')).catch(e=>{if(e.code==='ENOENT')return null;throw e;}),'CONSUMED');const inspected=await inspectGen24Recovery(ctx),approved=await approval(ctx,inspected.binding_sha256),window={not_before:notBefore,expires_at:expiresAt};windowValid(window,approved.approved_at);
  requireThat(hash(preflightReceipt)&&path.isAbsolute(codexExecutable),'TRANSPORT_UNQUALIFIED');const receipt=await readJson(await confined(ctx.runtimeRoot,`author-preflight/receipts/${preflightReceipt}.json`,{missing:false}));
  requireThat(digestObject(receipt)===preflightReceipt&&receipt.state==='available'&&receipt.billingRoute===POLICY.billing_route&&path.resolve(receipt.codexExecutable)===path.resolve(codexExecutable)&&receipt.executableSha256===sha256(await readFile(codexExecutable))&&receipt.receipts?.some(r=>r.model===MODEL&&r.reasoning==='medium'&&r.code===null),'TRANSPORT_UNQUALIFIED');
  const cap={schema_version:'mhc-gen24-recovery-capability/v1',policy:structuredClone(POLICY),approval_sha256:digestObject(approved),binding:inspected.binding,runtime:runtimeBinding(ctx),runtime_code_sha256:await runtimeCode(ctx),window,transport:{executable:path.resolve(codexExecutable),executable_sha256:receipt.executableSha256,version:receipt.version,preflight_receipt:preflightReceipt,preflight_receipt_sha256:digestObject(receipt)}};
  const id=digestObject(cap),root=recoveryRoot(ctx);await mkdir(root,{recursive:true,mode:0o700});const prior=await maybeJson(await confined(root,`capabilities/${id}.json`));if(prior)requireThat(isDeepStrictEqual(prior,cap),'CAPABILITY_INVALID');else await immutable(root,`capabilities/${id}.json`,cap);
  return {capability_sha256:id,capability_path:await confined(root,`capabilities/${id}.json`),max_author_calls:5,window};
}
async function capability(ctx,id,completed=false){
  requireThat(hash(id),'CAPABILITY_INVALID');const cap=await readJson(await confined(recoveryRoot(ctx),`capabilities/${id}.json`,{missing:false}));
  exact(cap,['schema_version','policy','approval_sha256','binding','runtime','runtime_code_sha256','window','transport']);
  requireThat(digestObject(cap)===id&&cap.schema_version==='mhc-gen24-recovery-capability/v1'&&isDeepStrictEqual(cap.policy,POLICY),'CAPABILITY_INVALID');
  if(!completed)requireThat(isDeepStrictEqual(cap.runtime,runtimeBinding(ctx))&&cap.runtime_code_sha256===await runtimeCode(ctx),'CAPABILITY_INVALID');
  exact(cap.transport,['executable','executable_sha256','version','preflight_receipt','preflight_receipt_sha256']);requireThat(hash(cap.transport.preflight_receipt),'TRANSPORT_UNQUALIFIED');
  const receipt=await readJson(await confined(ctx.runtimeRoot,`author-preflight/receipts/${cap.transport.preflight_receipt}.json`,{missing:false}));
  requireThat(digestObject(receipt)===cap.transport.preflight_receipt&&digestObject(receipt)===cap.transport.preflight_receipt_sha256&&receipt.state==='available'&&receipt.billingRoute===POLICY.billing_route&&path.resolve(receipt.codexExecutable)===cap.transport.executable&&receipt.executableSha256===cap.transport.executable_sha256&&receipt.version===cap.transport.version&&receipt.receipts?.some(r=>r.model===MODEL&&r.reasoning==='medium'&&r.code===null),'TRANSPORT_UNQUALIFIED');
  const inspected=await inspectGen24Recovery(ctx);requireThat(isDeepStrictEqual(cap.binding,inspected.binding),'BINDING_CHANGED');const approved=await approval(ctx,inspected.binding_sha256);requireThat(digestObject(approved)===cap.approval_sha256,'BINDING_CHANGED');windowValid(cap.window,approved.approved_at);
  return {cap,inspected,approved};
}
async function ledger(ctx){const root=recoveryRoot(ctx),names=await readdir(await confined(root,'ledger')).catch(e=>{if(e.code==='ENOENT')return [];throw e;}),events=[];let previous='0'.repeat(64);
  for(const [i,name] of names.sort().entries()){requireThat(name===String(i+1).padStart(6,'0')+'.json','LEDGER_INVALID');const event=await readJson(await confined(root,`ledger/${name}`,{missing:false})),{sha256:sum,...body}=event;requireThat(body.sequence===i+1&&body.previous===previous&&digestObject(body)===sum,'LEDGER_INVALID');events.push(event);previous=sum;}return events;
}
async function appendLedger(ctx,kind,data,now){const events=await ledger(ctx),body={sequence:events.length+1,previous:events.at(-1)?.sha256??'0'.repeat(64),kind,at:new Date(now).toISOString(),data},event={...body,sha256:digestObject(body)};await immutable(recoveryRoot(ctx),`ledger/${String(body.sequence).padStart(6,'0')}.json`,event);return event;}
async function lockOwned(ctx){const owner=await readJson(await confined(ctx.runtimeRoot,'runner.lock/owner.json',{missing:false}));requireThat(owner.pid===process.pid,'LOCK_REQUIRED');}
export function inspectGen24Owners(ctx,{run=spawnSync}={}){
  requireThat(process.platform==='win32','OWNER_UNVERIFIABLE');
  const script=String.raw`$ErrorActionPreference='Stop'
$gen24Unknown=$false
$gen24Processes=@(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -in @('node.exe','codex.exe') -and $_.ProcessId -notin @([int]$env:DBR_RECOVERY_PID,[int]$env:DBR_RECOVERY_PARENT)
} | Where-Object {
  if (-not $_.CommandLine) { $script:gen24Unknown=$true; $false } else {
    $gen24Command=$_.CommandLine.Replace([char]47,[char]92)
    $gen24Matched=$false
    foreach ($gen24Target in @($env:DBR_RECOVERY_ORIGINAL,$env:DBR_RECOVERY_NATIVE,$env:DBR_RECOVERY_GRANT)) {
      if ($gen24Command.IndexOf($gen24Target.Replace([char]47,[char]92),[StringComparison]::OrdinalIgnoreCase) -ge 0) { $gen24Matched=$true }
    }
    $gen24Matched
  }
} | ForEach-Object { [pscustomobject]@{pid=$_.ProcessId;parent_pid=$_.ParentProcessId} })
[pscustomobject]@{quiescent=(!$gen24Unknown -and $gen24Processes.Count -eq 0);unknown=$gen24Unknown;processes=$gen24Processes} | ConvertTo-Json -Depth 3 -Compress`;
  const result=run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,encoding:'utf8',timeout:30000,env:{...process.env,DBR_RECOVERY_PID:String(process.pid),DBR_RECOVERY_PARENT:String(process.ppid),DBR_RECOVERY_ORIGINAL:originalRoot(ctx),DBR_RECOVERY_NATIVE:ctx.runtimeRoot,DBR_RECOVERY_GRANT:recoveryRoot(ctx)}});
  requireThat(result.status===0&&!result.error,'OWNER_UNVERIFIABLE');let proof;try{proof=JSON.parse(result.stdout);}catch{throw error('OWNER_UNVERIFIABLE');}return proof;
}
async function quiescent(ctx,checkOwners){
  for(const d of await readdir(normalJobs(ctx),{withFileTypes:true})){requireThat(d.isDirectory()&&!d.isSymbolicLink(),'OWNER_UNVERIFIABLE');if(d.name===READING)continue;const job=await loadJob(await confined(normalJobs(ctx),d.name,{missing:false}));requireThat(job.state?.phase!=='generating'&&!job.state?.pending_attempt,'ACTIVE_OWNER');await assertAuthorExecutionsFinished(job);}
  let proof;try{proof=await checkOwners(ctx);}catch{throw error('OWNER_UNVERIFIABLE');}requireThat(proof?.quiescent===true&&proof.unknown===false&&Array.isArray(proof.processes)&&proof.processes.length===0,'ACTIVE_OWNER');return proof;
}

export async function runGen24Recovery(ctx,{capabilitySha256,codexExecutable},dependencies={}){
  await assertNativeWriterAllowed(ctx);await lockOwned(ctx);const root=recoveryRoot(ctx);
  requireThat(!await lstat(await confined(root,'consumed.json')).catch(e=>{if(e.code==='ENOENT')return null;throw e;}),'CONSUMED');
  const {cap,inspected,approved}=await capability(ctx,capabilitySha256),clock=dependencies.clock||(()=>new Date()),run=dependencies.run||spawnSync,checkOwners=dependencies.checkOwners||inspectGen24Owners;
  windowValid(cap.window,approved.approved_at,clock());const entry=ctx.plan.entries.find(e=>e.readingId===READING),priority=henryPriorityWindow(ctx.appConfig,clock());requireThat(entry.dayIndex>=priority.currentDay&&entry.dayIndex<=priority.horizonDay,'OUTSIDE_FORWARD_WINDOW');
  requireThat(Date.parse(inspected.job.state.session.deadline_at)<=+clock()&&Date.parse(inspected.job.state.lease.expires_at)<=+clock(),'ORIGINAL_STATE_INVALID');
  requireThat(path.resolve(codexExecutable)===cap.transport.executable&&sha256(await readFile(codexExecutable))===cap.transport.executable_sha256&&configuredModels(ctx).spark===MODEL,'TRANSPORT_UNQUALIFIED');await quiescent(ctx,checkOwners);
  const consumed={grant_id:GEN24_RECOVERY_GRANT,capability_sha256:capabilitySha256,original_binding_sha256:digestObject(cap.binding),claimed_at:clock().toISOString(),expires_at:cap.window.expires_at,max_author_calls:5,unknown_prior_dispatches_charged:1};
  await immutable(root,'consumed.json',consumed);await immutable(root,'consumed-capability.json',cap);await immutable(root,'consumed-approval.json',approved);await appendLedger(ctx,'capability_consumed',consumed,clock());
  let derived;
  const derivativeCtx={...ctx,jobRoot:derivativeJobs(ctx)};
  try{
    const transport=await prepareAuthorTransport(ctx,{lane:'spark',codexExecutable},{run,clock});requireThat(transport.executableSha256===cap.transport.executable_sha256&&transport.version===cap.transport.version&&transport.models.spark===MODEL,'TRANSPORT_UNQUALIFIED');
    derived=await createJob(derivativeCtx.jobRoot,inspected.job.input,clock(),inspected.job.state.models);
    for(const accepted of cap.binding.accepted)await immutable(derived.directory,`attempts/${accepted.candidate_sha256}.json`,await readFile(await confined(originalRoot(ctx),`attempts/${accepted.candidate_sha256}.json`,{missing:false})),{raw:true});
    await immutable(derived.directory,'original-binding.json',cap.binding);
    const session={id:`spark:${GEN24_RECOVERY_GRANT}:${capabilitySha256}`,lane:'spark',started_at:clock().toISOString(),deadline_at:cap.window.expires_at,submissions:0,runtime_revision:ctx.config.source_revision,runtime_manifest_sha256:ctx.manifestSha256};
    derived=await appendState(derived,'approved_gen24_recovery_derivative',{...derived.state,accepted:structuredClone(inspected.job.state.accepted),rejected:structuredClone(inspected.job.state.rejected),total_submissions:inspected.job.state.total_submissions,owners:structuredClone(inspected.job.state.owners),sessions:{...structuredClone(inspected.job.state.sessions),[session.id]:session},session,lease:{id:session.id,started_at:session.started_at,expires_at:cap.window.expires_at,transport_checkpoints:0},history:[...inspected.job.state.history,{kind:'approved_gen24_recovery',capability_sha256:capabilitySha256,original_event_head:cap.binding.event_head,unknown_intent:cap.binding.unknown_intent,new_author_call_limit:5}]},clock());
    for(const index of POLICY.missing_packet_indexes){
      windowValid(cap.window,approved.approved_at,clock());requireThat(Date.parse(cap.window.expires_at)-+clock()>=15000,'DEADLINE');
      const again=await inspectGen24Recovery(ctx);requireThat(isDeepStrictEqual(again.binding,cap.binding),'BINDING_CHANGED');await quiescent(ctx,checkOwners);await assertAuthorExecutionsFinished(await loadJob(derived.directory));
      const packet=inspected.packets[index],base=`author/${packet.packet_id}/spark`,work={readingId:READING,requiredModel:MODEL};
      work.sourcePath=await atomicJson(derived.directory,`${base}/source-view.json`,packet,{immutable:true});work.schemaPath=await atomicJson(derived.directory,`${base}/candidate.schema.json`,candidateSchema,{immutable:true});
      work.instructionsPath=await atomicJson(derived.directory,`${base}/instructions-${MODEL}.json`,{model:MODEL,reasoning_effort:'medium',instructions:await readFile(path.join(ctx.releaseRoot,'prompts/mhc-v2-author.md'),'utf8')},{immutable:true});work.candidatePath=await confined(derived.directory,`${base}/candidate.json`);work.validationPath=await confined(derived.directory,`${base}/validation.json`);
      const verified=await verifyPublicPacket(derivativeCtx,work,'spark'),events=await ledger(ctx),intents=events.filter(e=>e.kind==='author_intent');requireThat(intents.length<5&&!intents.some(e=>e.data.packet_id===packet.packet_id),'CALL_LIMIT');
      const key=digestObject({grant_id:GEN24_RECOVERY_GRANT,capability_sha256:capabilitySha256,packet_id:packet.packet_id,attempt:1}),relative=`model-executions/${key}`;
      const schemaPath=await immutable(derived.directory,`${relative}/transport.schema.json`,transportSchema(candidateSchema)),outputPath=await confined(derived.directory,`${relative}/response.json`);
      await appendLedger(ctx,'author_intent',{execution_key:key,packet_id:packet.packet_id,packet_sha256:digestObject(packet),call_number:intents.length+1,model:MODEL,reasoning:'medium',original_unknown_allowance:index===6?1:0},clock());
      const args=authorArguments({model:MODEL,reasoning:'medium',schemaPath,outputPath,mcpNames:transport.mcpNames}),remaining=Date.parse(cap.window.expires_at)-+clock();requireThat(remaining>=15000,'DEADLINE');
      const result=run(codexExecutable,args,{...transport.options,cwd:path.dirname(outputPath),timeout:Math.min(12*60000,remaining-5000),input:`Condense the supplied verified public-domain Henry source packet. Return only the candidate JSON. Do not use tools, read other files, change files or publish.\n\n${verified.instructions.instructions}\n\nSOURCE PACKET:\n${JSON.stringify(packet)}`});
      await immutable(derived.directory,`${relative}/events.jsonl`,result.stdout||'',{raw:true});await immutable(derived.directory,`${relative}/stderr.txt`,result.stderr||'',{raw:true});
      if(!successfulModelResult(result)){await immutable(derived.directory,`${relative}/result.json`,{schema_version:'mhc-model-execution/v1',session:session.id,proof:verified.proof,status:'failed',finished_at:clock().toISOString(),exit_code:result.status??null,error_code:result.error?.code??null});throw error('AUTHOR_FAILED');}
      const candidate=await readJson(outputPath);await immutable(derived.directory,`${relative}/result.json`,{schema_version:'mhc-model-execution/v1',session:session.id,proof:verified.proof,status:'completed',finished_at:clock().toISOString(),candidate_sha256:digestObject(candidate)});
      windowValid(cap.window,approved.approved_at,clock());await atomicJson(derived.directory,path.relative(derived.directory,work.candidatePath),candidate);
      const report=await advanceV2(derivativeCtx,READING,session.id,clock());derived=await loadJob(derived.directory);
      await appendLedger(ctx,'author_complete',{execution_key:key,packet_id:packet.packet_id,accepted:Boolean(derived.state.accepted[`${packet.packet_id}:spark`]),candidate_sha256:digestObject(candidate)},clock());
      requireThat(derived.state.accepted[`${packet.packet_id}:spark`]&&report.action!=='repair_candidate','CANDIDATE_REJECTED');
    }
    windowValid(cap.window,approved.approved_at,clock());const {job,bundle}=await buildReview(derivativeCtx,READING);requireThat(job.state.phase==='review_pending'&&Object.keys(job.state.accepted).length===11,'INCOMPLETE');
    const bundlePath=await immutable(job.directory,`review/${bundle.review_basis_sha256}.json`,bundle),last=await appendLedger(ctx,'window_complete',{capability_sha256:capabilitySha256,job_sequence:job.sequence,job_event_head:job.previous,review_basis_sha256:bundle.review_basis_sha256},clock());
    await immutable(root,'completed.json',{capability_sha256:capabilitySha256,job_sequence:job.sequence,job_event_head:job.previous,review_basis_sha256:bundle.review_basis_sha256,ledger_head:last.sha256});
    return {action:'review_handoff',state:'review_pending',readingId:READING,recoveryGrantId:GEN24_RECOVERY_GRANT,capabilitySha256,bundlePath,reviewPath:path.join(job.directory,'review.json'),instructionsPath:path.join(ctx.releaseRoot,'prompts/mhc-v2-review.md'),validatedBatches:11,totalBatches:11,newAuthorCalls:5,unknownPriorDispatchesCharged:1,published:false};
  }catch(e){
    const code=/^V2_GEN24_RECOVERY_[A-Z_]+$/.test(e.message)?e.message:'V2_GEN24_RECOVERY_STOPPED';
    await appendLedger(ctx,'window_blocked',{code},clock());if(derived){const current=await loadJob(derived.directory);await appendState(current,'recovery_window_blocked',{...current.state,phase:'blocked',lease:{...current.state.lease,released:true},blocker:{stage:'recovery',code}},clock());}
    const reserved=(await ledger(ctx)).filter(event=>event.kind==='author_intent').length;
    return {action:'none',state:'blocked',stage:'recovery',code,readingId:READING,recoveryGrantId:GEN24_RECOVERY_GRANT,reservedAuthorCalls:reserved,maxAuthorCalls:5,unknownPriorDispatchesCharged:1,grantConsumed:true,published:false};
  }
}

export async function completedGen24Recovery(ctx,id){
  if(id!==READING||path.resolve(ctx.jobRoot)!==path.resolve(normalJobs(ctx)))return null;
  const root=recoveryRoot(ctx),completed=await maybeJson(await confined(root,'completed.json'));if(!completed)return null;
  const {cap}=await capability(ctx,completed.capability_sha256,true),consumed=await readJson(await confined(root,'consumed.json',{missing:false}));requireThat(consumed.capability_sha256===completed.capability_sha256,'COMPLETION_INVALID');
  const events=await ledger(ctx),intents=events.filter(e=>e.kind==='author_intent'),successes=events.filter(e=>e.kind==='author_complete');
  requireThat(consumed.original_binding_sha256===digestObject(cap.binding)&&events[0]?.kind==='capability_consumed'&&events[0].data.capability_sha256===completed.capability_sha256&&events.at(-1)?.kind==='window_complete'&&events.at(-1).sha256===completed.ledger_head&&events.at(-1).data.job_event_head===completed.job_event_head&&events.at(-1).data.job_sequence===completed.job_sequence&&events.at(-1).data.review_basis_sha256===completed.review_basis_sha256&&intents.length===5&&successes.length===5&&successes.every((e,i)=>e.data.accepted&&e.data.execution_key===intents[i].data.execution_key&&e.data.packet_id===intents[i].data.packet_id)&&new Set(intents.map(e=>e.data.packet_id)).size===5&&isDeepStrictEqual(intents.map(e=>e.data.packet_id),cap.binding.packets.slice(6).map(p=>p.packet_id)),'COMPLETION_INVALID');
  const directory=await confined(derivativeJobs(ctx),READING,{missing:false}),job=await loadJob(directory),event=await readJson(await confined(directory,`events/${String(completed.job_sequence).padStart(6,'0')}.json`,{missing:false}));
  requireThat(event.event_sha256===completed.job_event_head&&event.state.phase==='review_pending'&&cap.binding.accepted.every(a=>event.state.accepted[`${a.packet_id}:spark`]?.candidate_sha256===a.candidate_sha256)&&job.input.input_sha256===cap.binding.input_sha256&&['review_pending','editorial_attention','approved','publishing','published'].includes(job.state.phase),'COMPLETION_INVALID');
  return {...job,recoveryGrantId:GEN24_RECOVERY_GRANT};
}
