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
import {henryPriorityWindow,hasHenryPublicationReceipt} from './mhc-priority.mjs';
import {assertNativeWriterAllowed} from './mhc-native-supervisor-guard.mjs';
import {safeV2ErrorCode} from './mhc-v2-error-code.mjs';

export const GEN24_RECOVERY_GRANT='gen24-recovery-20261020';
const READING='LTP-0041-GEN-024',MODEL='gpt-6-luna',HOUR=3600000;
const POLICY={grant_id:GEN24_RECOVERY_GRANT,reading_id:READING,max_author_calls:5,max_duration_ms:HOUR,unknown_prior_dispatches_charged:1,model:MODEL,reasoning:'medium',billing_route:'existing ChatGPT login; no API-key fallback',missing_packet_indexes:[6,7,8,9,10]};
// Factual reading IDs only. Opaque execution keys, hashes and private evidence
// belong in the separately accepted private authority, never in this source.
const HISTORIES=['LTP-0009-GEN-004','LTP-0022-GEN-012'];
const CLASSIFICATION='retained_unknown_for_GEN24_admission_only';
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

async function historyEvidence(ctx,now,consumed=false){
  const root=recoveryRoot(ctx),prefix=consumed?'consumed-history':'history-admission',authorityPath=await confined(root,`${prefix}/authority.json`),authority=await maybeJson(authorityPath);if(!authority){requireThat(!consumed,'HISTORY_EVIDENCE_CHANGED');return null;}
  exact(authority,['schema_version','grant_id','classification','accepted','accepted_at','diagnosis_sha256','design_review_sha256']);
  requireThat(authority.schema_version==='mhc-gen24-history-authority/v1'&&authority.grant_id===GEN24_RECOVERY_GRANT&&authority.classification===CLASSIFICATION&&authority.accepted===true&&Number.isFinite(Date.parse(authority.accepted_at))&&(!now||Date.parse(authority.accepted_at)<=+new Date(now))&&hash(authority.diagnosis_sha256)&&hash(authority.design_review_sha256),'HISTORY_AUTHORITY_INVALID');
  const evidence=async(relative,sum)=>{requireThat(hash(sum),'HISTORY_AUTHORITY_INVALID');const b=await readFile(await confined(root,`${prefix}/${relative}`,{missing:false}));requireThat(sha256(b)===sum,'HISTORY_EVIDENCE_CHANGED');return b;};
  const diagnosis=JSON.parse(await evidence('diagnosis.json',authority.diagnosis_sha256)),review=JSON.parse(await evidence('design-review.json',authority.design_review_sha256));
  requireThat(diagnosis.schemaVersion==='gen24-two-historical-intents-admission-diagnosis/v1'&&review.schema_version==='wo3-gen24-history-admission-design-review/v1'&&review.assessment==='ACCEPTED_DESIGN_ONLY_NO_BLOCKING_DESIGN_FINDING'&&review.diagnosis_sha256===authority.diagnosis_sha256&&isDeepStrictEqual(diagnosis.histories?.map(j=>j.readingId),HISTORIES)&&isDeepStrictEqual(review.histories?.map(j=>j.reading_id),HISTORIES),'HISTORY_AUTHORITY_INVALID');
  const inspectionSha=diagnosis.assets?.['history-inspection.json']?.sha256,inspection=JSON.parse(await evidence('history-inspection.json',inspectionSha));
  requireThat(inspection.schemaVersion==='gen24-history-admission-inspection/v1'&&isDeepStrictEqual(inspection.reports?.map(j=>j.readingId),HISTORIES),'HISTORY_AUTHORITY_INVALID');
  return {root,authorityPath,authority,diagnosis,review,inspectionSha,inspection,evidence};
}
async function retainedHistories(ctx,now){
  const proof=await historyEvidence(ctx,now);if(!proof)return null;const {authorityPath,authority,diagnosis,review,inspectionSha,inspection,evidence}=proof;
  const manifest=await readJson(await confined(ctx.privateRoot,'private-manifest.json',{missing:false})),bindings=[];
  for(const [index,id] of HISTORIES.entries()){
    const accepted=diagnosis.histories[index],reviewed=review.histories[index],snapshot=inspection.reports[index],directory=await confined(normalJobs(ctx),id,{missing:false}),job=await loadJob(directory),unknown=accepted.unknown;
    requireThat(unknown?.status==='started'&&unknown.terminalOutcomeProven===false&&reviewed.status_unchanged==='started'&&reviewed.remote_termination_proven===false&&reviewed.event_head===accepted.eventHead&&reviewed.input_sha256===accepted.inputSha256&&reviewed.unknown_key===unknown.key&&reviewed.unknown_record_sha256===unknown.record?.sha256,'HISTORY_AUTHORITY_INVALID');
    requireThat(job.state.phase==='published'&&!job.state.pending_attempt&&job.input.input_sha256===accepted.inputSha256&&job.previous===accepted.eventHead&&job.sequence===accepted.eventSequence&&snapshot.inputSha256===accepted.inputSha256&&snapshot.eventHead===accepted.eventHead,'HISTORY_CHANGED');
    if(now)requireThat(Object.values(job.state.sessions).every(s=>Number.isFinite(Date.parse(s.deadline_at))&&Date.parse(s.deadline_at)<=+new Date(now))&&(!job.state.lease||job.state.lease.released===true||Date.parse(job.state.lease.expires_at)<=+new Date(now)),'ACTIVE_OWNER');
    const files=await inventory(directory),expected=snapshot.files.map(f=>({path:String(f.relativePath).replaceAll('\\','/'),sha256:f.sha256,bytes:f.bytes})).sort((a,b)=>a.path.localeCompare(b.path));requireThat(isDeepStrictEqual(files,expected),'HISTORY_CHANGED');
    const executions=await readdir(await confined(directory,'model-executions',{missing:false}));let retained=0;
    for(const key of executions){requireThat(hash(key),'HISTORY_CHANGED');const recordBytes=await readFile(await confined(directory,`model-executions/${key}/result.json`,{missing:false})),record=JSON.parse(recordBytes);
      if(key===unknown.key){retained++;requireThat(record.status==='started'&&sha256(recordBytes)===unknown.record.sha256&&record.session===unknown.session&&record.proof?.packet_sha256===unknown.packetSha256,'HISTORY_CHANGED');}
      else requireThat(['completed','failed'].includes(record.status),'HISTORY_CHANGED');
    }
    requireThat(retained===1,'HISTORY_CHANGED');
    const packet=job.input.chapters.flatMap(c=>c.batches).find(p=>p.packet_id===unknown.packetId),admitted=job.state.accepted[`${unknown.packetId}:luna`];
    requireThat(packet&&digestObject(packet)===unknown.packetSha256&&unknown.key===digestObject({session:unknown.session,packet:packet.packet_id,submissions:unknown.submissionsBeforeIntent})&&admitted?.candidate_sha256===accepted.replacement?.acceptedCandidateByteSha256,'HISTORY_CHANGED');
    const attempt=await readJson(await confined(directory,`attempts/${admitted.candidate_sha256}.json`,{missing:false})),candidate=JSON.parse(attempt.bytes);requireThat(sha256(attempt.bytes)===admitted.candidate_sha256&&validateCandidate(candidate,packet).valid,'HISTORY_CHANGED');
    const replacement=accepted.replacement,executionRoot=`model-executions/${replacement.key}`;
    const replacementBytes=await readFile(await confined(directory,`${executionRoot}/result.json`,{missing:false})),record=JSON.parse(replacementBytes),events=await readFile(await confined(directory,`${executionRoot}/events.jsonl`,{missing:false}));
    requireThat(sha256(replacementBytes)===replacement.record.sha256&&sha256(events)===replacement.events.sha256&&record.status==='completed'&&record.session!==unknown.session&&record.proof?.packet_sha256===digestObject(packet)&&record.candidate_sha256===digestObject(candidate)&&successfulModelResult({status:0,stdout:events.toString()})&&digestObject(await readJson(await confined(directory,`${executionRoot}/response.json`,{missing:false})))===digestObject(candidate),'HISTORY_CHANGED');
    const publication=accepted.publication,receiptBytes=await readFile(await confined(ctx.privateRoot,`automation/staging/${id}/manager-publication-result.json`,{missing:false})),metadataBytes=await readFile(await confined(ctx.privateRoot,`bridge/celebration-y3q4/${id}.metadata.json`,{missing:false})),approvalBytes=await readFile(await confined(directory,`approved/${job.state.review?.approved_sha256}.json`,{missing:false}));
    const approved=JSON.parse(approvalBytes),metadata=JSON.parse(metadataBytes),attached=metadata.verseCommentaries||(metadata.verseCommentary?[metadata.verseCommentary]:[]);
    requireThat(sha256(receiptBytes)===publication.receipt.sha256&&sha256(metadataBytes)===publication.metadata.sha256&&sha256(approvalBytes)===publication.approvedArtifact.sha256&&digestObject(JSON.parse(receiptBytes))===job.state.publication.receipt_sha256&&digestObject(approved)===job.state.review.approved_sha256&&await hasHenryPublicationReceipt({privateRoot:ctx.privateRoot,readingId:id,manifest})&&approved.results.length===attached.length&&approved.results.every(r=>attached.some(a=>digestObject(a)===digestObject(r.runtime))),'HISTORY_PUBLICATION_CHANGED');
    // These immutable copies establish provenance only, never provider termination.
    for(const r of [accepted.childRollout,accepted.parentCoordinator])await evidence(`evidence/${r.sha256}.jsonl`,r.sha256);
    requireThat((await loadJob(directory)).previous===job.previous,'HISTORY_CHANGED');
    bindings.push({reading_id:id,input_sha256:job.input.input_sha256,event_head:job.previous,event_sequence:job.sequence,file_inventory_sha256:digestObject(files),unknown_key:unknown.key,unknown_record_sha256:unknown.record.sha256,unknown_session:unknown.session,unknown_packet_sha256:unknown.packetSha256,replacement_record_sha256:sha256(replacementBytes),replacement_events_sha256:sha256(events),approved_sha256:sha256(approvalBytes),publication_receipt_sha256:sha256(receiptBytes),metadata_sha256:sha256(metadataBytes),manifest_entry_sha256:digestObject(manifest.readings[id]),child_rollout_sha256:accepted.childRollout.sha256,parent_coordinator_sha256:accepted.parentCoordinator.sha256,classification:CLASSIFICATION,provider_termination_proven:false});
  }
  return {schema_version:'mhc-gen24-retained-histories/v1',grant_id:GEN24_RECOVERY_GRANT,classification:CLASSIFICATION,authority_sha256:sha256(await readFile(authorityPath)),diagnosis_sha256:authority.diagnosis_sha256,design_review_sha256:authority.design_review_sha256,inspection_sha256:inspectionSha,bindings};
}
async function checkRetainedHistories(ctx,expected,now){const current=await retainedHistories(ctx,now);requireThat(isDeepStrictEqual(current,expected),'HISTORY_CHANGED');if(current){const receipt=await readJson(await confined(recoveryRoot(ctx),`retained-unknown/${digestObject(current)}.json`,{missing:false}));requireThat(isDeepStrictEqual(receipt,current),'HISTORY_CHANGED');}return current;}
async function freezeRetainedHistories(ctx,admission){
  if(!admission)return;
  const proof=await historyEvidence(ctx),{authorityPath,diagnosis}=proof,root=recoveryRoot(ctx);
  requireThat(sha256(await readFile(authorityPath))===admission.authority_sha256,'HISTORY_CHANGED');
  const names=['authority.json','diagnosis.json','design-review.json','history-inspection.json',...diagnosis.histories.flatMap(h=>[h.childRollout,h.parentCoordinator].map(r=>`evidence/${r.sha256}.jsonl`))];
  for(const name of names)await immutable(root,`consumed-history/${name}`,await readFile(await confined(root,`history-admission/${name}`,{missing:false})),{raw:true});
  await immutable(root,'consumed-history/classification.json',admission);await frozenRetainedHistories(ctx,admission);
}
async function frozenRetainedHistories(ctx,admission){
  if(!admission)return;
  const {authorityPath,authority,diagnosis,review,inspectionSha,inspection,evidence}=await historyEvidence(ctx,undefined,true),stored=await readJson(await confined(recoveryRoot(ctx),'consumed-history/classification.json',{missing:false}));
  requireThat(isDeepStrictEqual(stored,admission)&&admission.schema_version==='mhc-gen24-retained-histories/v1'&&admission.grant_id===GEN24_RECOVERY_GRANT&&admission.classification===CLASSIFICATION&&admission.authority_sha256===sha256(await readFile(authorityPath))&&admission.diagnosis_sha256===authority.diagnosis_sha256&&admission.design_review_sha256===authority.design_review_sha256&&admission.inspection_sha256===inspectionSha&&isDeepStrictEqual(admission.bindings?.map(b=>b.reading_id),HISTORIES),'HISTORY_EVIDENCE_CHANGED');
  // Completed reads use only the evidence admitted under the lock and copied at
  // consumption. Later maintenance of unrelated historical publications cannot
  // re-admit or invalidate a finished GEN24 derivative.
  for(const [i,b] of admission.bindings.entries()){
    const h=diagnosis.histories[i],r=review.histories[i],s=inspection.reports[i],files=s.files.map(f=>({path:String(f.relativePath).replaceAll('\\','/'),sha256:f.sha256,bytes:f.bytes})).sort((a,b)=>a.path.localeCompare(b.path));
    requireThat(b.classification===CLASSIFICATION&&b.provider_termination_proven===false&&h.unknown.status==='started'&&h.unknown.terminalOutcomeProven===false&&r.status_unchanged==='started'&&r.remote_termination_proven===false&&b.input_sha256===h.inputSha256&&b.input_sha256===s.inputSha256&&b.input_sha256===r.input_sha256&&b.event_head===h.eventHead&&b.event_head===s.eventHead&&b.event_head===r.event_head&&b.event_sequence===h.eventSequence&&b.file_inventory_sha256===digestObject(files)&&b.unknown_key===h.unknown.key&&b.unknown_key===r.unknown_key&&b.unknown_record_sha256===h.unknown.record.sha256&&b.unknown_record_sha256===r.unknown_record_sha256&&b.unknown_session===h.unknown.session&&b.unknown_packet_sha256===h.unknown.packetSha256&&b.replacement_record_sha256===h.replacement.record.sha256&&b.replacement_events_sha256===h.replacement.events.sha256&&b.approved_sha256===h.publication.approvedArtifact.sha256&&b.publication_receipt_sha256===h.publication.receipt.sha256&&b.metadata_sha256===h.publication.metadata.sha256&&hash(b.manifest_entry_sha256)&&b.child_rollout_sha256===h.childRollout.sha256&&b.parent_coordinator_sha256===h.parentCoordinator.sha256,'HISTORY_EVIDENCE_CHANGED');
    for(const p of [h.childRollout,h.parentCoordinator])await evidence(`evidence/${p.sha256}.jsonl`,p.sha256);
  }
}

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
  const histories=await retainedHistories(ctx,new Date(notBefore));
  if(histories){const relative=`retained-unknown/${digestObject(histories)}.json`,prior=await maybeJson(await confined(recoveryRoot(ctx),relative));if(prior)requireThat(isDeepStrictEqual(prior,histories),'HISTORY_CHANGED');else await immutable(recoveryRoot(ctx),relative,histories);}
  const cap={schema_version:'mhc-gen24-recovery-capability/v2',policy:structuredClone(POLICY),approval_sha256:digestObject(approved),binding:inspected.binding,history_admission:histories,runtime:runtimeBinding(ctx),runtime_code_sha256:await runtimeCode(ctx),window,transport:{executable:path.resolve(codexExecutable),executable_sha256:receipt.executableSha256,version:receipt.version,preflight_receipt:preflightReceipt,preflight_receipt_sha256:digestObject(receipt)}};
  const id=digestObject(cap),root=recoveryRoot(ctx);await mkdir(root,{recursive:true,mode:0o700});const prior=await maybeJson(await confined(root,`capabilities/${id}.json`));if(prior)requireThat(isDeepStrictEqual(prior,cap),'CAPABILITY_INVALID');else await immutable(root,`capabilities/${id}.json`,cap);
  return {capability_sha256:id,capability_path:await confined(root,`capabilities/${id}.json`),max_author_calls:5,window};
}
async function capability(ctx,id,completed=false,now){
  requireThat(hash(id),'CAPABILITY_INVALID');const cap=await readJson(await confined(recoveryRoot(ctx),`capabilities/${id}.json`,{missing:false}));
  exact(cap,['schema_version','policy','approval_sha256','binding','history_admission','runtime','runtime_code_sha256','window','transport']);
  requireThat(digestObject(cap)===id&&cap.schema_version==='mhc-gen24-recovery-capability/v2'&&isDeepStrictEqual(cap.policy,POLICY),'CAPABILITY_INVALID');
  if(!completed)requireThat(isDeepStrictEqual(cap.runtime,runtimeBinding(ctx))&&cap.runtime_code_sha256===await runtimeCode(ctx),'CAPABILITY_INVALID');
  exact(cap.transport,['executable','executable_sha256','version','preflight_receipt','preflight_receipt_sha256']);requireThat(hash(cap.transport.preflight_receipt),'TRANSPORT_UNQUALIFIED');
  const receipt=await readJson(await confined(ctx.runtimeRoot,`author-preflight/receipts/${cap.transport.preflight_receipt}.json`,{missing:false}));
  requireThat(digestObject(receipt)===cap.transport.preflight_receipt&&digestObject(receipt)===cap.transport.preflight_receipt_sha256&&receipt.state==='available'&&receipt.billingRoute===POLICY.billing_route&&path.resolve(receipt.codexExecutable)===cap.transport.executable&&receipt.executableSha256===cap.transport.executable_sha256&&receipt.version===cap.transport.version&&receipt.receipts?.some(r=>r.model===MODEL&&r.reasoning==='medium'&&r.code===null),'TRANSPORT_UNQUALIFIED');
  const inspected=await inspectGen24Recovery(ctx);requireThat(isDeepStrictEqual(cap.binding,inspected.binding),'BINDING_CHANGED');const approved=await approval(ctx,inspected.binding_sha256);requireThat(digestObject(approved)===cap.approval_sha256,'BINDING_CHANGED');windowValid(cap.window,approved.approved_at);
  if(completed)await frozenRetainedHistories(ctx,cap.history_admission);else await checkRetainedHistories(ctx,cap.history_admission,now);
  return {cap,inspected,approved};
}
async function ledger(ctx){const root=recoveryRoot(ctx),names=await readdir(await confined(root,'ledger')).catch(e=>{if(e.code==='ENOENT')return [];throw e;}),events=[];let previous='0'.repeat(64);
  for(const [i,name] of names.sort().entries()){requireThat(name===String(i+1).padStart(6,'0')+'.json','LEDGER_INVALID');const event=await readJson(await confined(root,`ledger/${name}`,{missing:false})),{sha256:sum,...body}=event;requireThat(body.sequence===i+1&&body.previous===previous&&digestObject(body)===sum,'LEDGER_INVALID');events.push(event);previous=sum;}return events;
}
async function appendLedger(ctx,kind,data,now){const events=await ledger(ctx),body={sequence:events.length+1,previous:events.at(-1)?.sha256??'0'.repeat(64),kind,at:new Date(now).toISOString(),data},event={...body,sha256:digestObject(body)};await immutable(recoveryRoot(ctx),`ledger/${String(body.sequence).padStart(6,'0')}.json`,event);return event;}
async function lockOwned(ctx){const owner=await readJson(await confined(ctx.runtimeRoot,'runner.lock/owner.json',{missing:false}));requireThat(owner.pid===process.pid,'LOCK_REQUIRED');}
const ownerTargets=(ctx,histories)=>[originalRoot(ctx),ctx.runtimeRoot,recoveryRoot(ctx),derivativeJobs(ctx),...HISTORIES.map(id=>path.join(normalJobs(ctx),id)),...(histories?.bindings||[]).map(b=>{requireThat(HISTORIES.includes(b.reading_id)&&hash(b.unknown_key),'OWNER_UNVERIFIABLE');return path.join(normalJobs(ctx),b.reading_id,'model-executions',b.unknown_key);})].map(p=>path.resolve(p));
function startupConsoleHost(row,self,inspector,rows,image,targets){
  const canonical=value=>typeof value==='string'&&/^[a-z]:\\/i.test(value)&&!/[\x00-\x1f"<>|?*]/.test(value)&&!value.slice(2).includes(':')&&path.win32.normalize(value)===value?value.toLowerCase():null;
  if(!image||Array.isArray(image)||!canonical(image.windows_directory)||!canonical(image.path)||canonical(image.path)!==path.win32.join(image.windows_directory,'System32','conhost.exe').toLowerCase()||image.path_no_reparse_points!==true||image.stable_file!==true||image.signature_status!=='Valid'||!['Catalog','Authenticode'].includes(image.signature_type)||image.is_os_binary!==true||!['Microsoft Windows','Microsoft Windows Publisher'].includes(image.signer_name)||image.microsoft_organization!==true||typeof image.sha256!=='string'||image.sha256.length!==64||!hash(image.sha256)||!Number.isSafeInteger(image.bytes)||image.bytes<=0||!Number.isFinite(Date.parse(image.last_write_utc)))return null;
  if(!/^conhost\.exe$/i.test(row.name)||row.parent_pid!==self.pid||canonical(row.executable_path)!==canonical(image.path)||typeof row.command_line!=='string'||targets.some(t=>row.command_line.replaceAll('/','\\').toLowerCase().includes(t.replaceAll('/','\\').toLowerCase()))||rows.some(r=>r.parent_pid===row.pid))return null;
  // Windows' own startup host has exactly an image token and a console handle.
  // Do not admit headless hosts, flags, a client program or trailing arguments.
  const command=/^(?:"([^"\r\n]+)"|([^\s"]+)) (0x[0-9a-f]{1,16})$/i.exec(row.command_line);
  if(!command||command[0]!==row.command_line||BigInt(command[3])===0n)return null;
  let executable=command[1]||command[2];if(executable.startsWith('\\??\\'))executable=executable.slice(4);else if(executable.startsWith('\\\\?\\'))executable=executable.slice(4);
  const born=Date.parse(row.created_at),parentBorn=Date.parse(self.created_at);
  if(canonical(executable)!==canonical(image.path)||!Number.isFinite(born)||born<parentBorn||born-parentBorn>1000||born>Date.parse(inspector.created_at))return null;
  return {pid:row.pid,parent_pid:row.parent_pid,name:row.name,created_at:row.created_at,command_sha256:sha256(row.command_line),executable_path_sha256:sha256(row.executable_path),image_sha256:image.sha256,image_identity_sha256:digestObject(image)};
}
export function evaluateGen24Owners(ctx,data,{historyAdmission=null}={}){
  requireThat(data&&Number.isInteger(data.inspector_pid)&&data.inspector_pid>0&&Array.isArray(data.first)&&Array.isArray(data.second),'OWNER_UNVERIFIABLE');
  const targets=ownerTargets(ctx,historyAdmission),normal=s=>s.replaceAll('/','\\').toLowerCase();
  function inspect(rows,image){
    const byPid=new Map(),matched=new Set();let unknown=false;
    for(const r of rows){requireThat(r&&Number.isInteger(r.pid)&&r.pid>=0&&Number.isInteger(r.parent_pid)&&r.parent_pid>=0&&typeof r.name==='string'&&r.name.length>0&&!byPid.has(r.pid),'OWNER_UNVERIFIABLE');byPid.set(r.pid,r);}
    const identity=r=>{requireThat(r&&typeof r.command_line==='string'&&r.command_line.length>0&&Number.isFinite(Date.parse(r.created_at)),'OWNER_UNVERIFIABLE');return {pid:r.pid,parent_pid:r.parent_pid,name:r.name,created_at:r.created_at,command_sha256:sha256(r.command_line)};};
    const self=byPid.get(process.pid),inspector=byPid.get(data.inspector_pid),launcher=byPid.get(process.ppid),launcherPath=normal(path.resolve(ctx.launcher)),runnerPath=normal(path.join(ctx.releaseRoot,'scripts/mhc-native-runner.mjs'));
    const ancestry=[identity(self),identity(inspector),identity(launcher)];
    requireThat(/^node(\.exe)?$/i.test(self.name)&&self.parent_pid===process.ppid&&normal(self.command_line).includes(runnerPath)&&/^node(\.exe)?$/i.test(launcher.name)&&normal(launcher.command_line).includes(launcherPath)&&Date.parse(launcher.created_at)<=Date.parse(self.created_at)&&inspector.parent_pid===self.pid&&/^(powershell|pwsh)(\.exe)?$/i.test(inspector.name)&&Date.parse(inspector.created_at)>=Date.parse(self.created_at),'OWNER_UNVERIFIABLE');
    const excluded=new Set([self.pid,inspector.pid,launcher.pid]),ancestors=new Set([launcher.pid]);let child=launcher,seen=new Set([self.pid,inspector.pid,launcher.pid]);
    while(child.parent_pid!==0){
      const parent=byPid.get(child.parent_pid);requireThat(parent&&!seen.has(parent.pid),'OWNER_UNVERIFIABLE');seen.add(parent.pid);ancestry.push(identity(parent));requireThat(Date.parse(parent.created_at)<=Date.parse(child.created_at),'OWNER_UNVERIFIABLE');
      // Exempt only the proved launcher and shells actually invoking it. The
      // first other ancestor is checked normally, never broadly exempted.
      if(!/^(powershell|pwsh|cmd)(\.exe)?$/i.test(parent.name)||!normal(parent.command_line).includes(launcherPath))break;
      excluded.add(parent.pid);ancestors.add(parent.pid);child=parent;
    }
    const candidates=rows.filter(r=>/^conhost\.exe$/i.test(r.name)&&r.parent_pid===self.pid),consoleHosts=[];
    if(candidates.length===1){const host=startupConsoleHost(candidates[0],self,inspector,rows,image,targets);if(host){excluded.add(host.pid);consoleHosts.push(host);}else unknown=true;}else if(candidates.length>1)unknown=true;
    for(const r of rows){
      if(excluded.has(r.pid))continue;
      const critical=/^(node|codex)(\.exe)?$/i.test(r.name),command=typeof r.command_line==='string'?normal(r.command_line):'',hit=targets.some(t=>command.includes(normal(t)));
      if((critical||hit)&&(!command||!Number.isFinite(Date.parse(r.created_at))))unknown=true;
      if(hit||r.parent_pid===process.pid||(critical&&ancestors.has(r.parent_pid)))matched.add(r.pid);
    }
    for(let changed=true;changed;){changed=false;for(const r of rows){if(excluded.has(r.pid)||matched.has(r.pid)||!matched.has(r.parent_pid))continue;matched.add(r.pid);changed=true;const parent=byPid.get(r.parent_pid);if(!Number.isFinite(Date.parse(r.created_at))||!parent||Date.parse(r.created_at)<Date.parse(parent.created_at))unknown=true;}}
    for(const pid of matched){let r=byPid.get(pid),seen=new Set();while(r){if(seen.has(r.pid)){unknown=true;break;}seen.add(r.pid);r=byPid.get(r.parent_pid);}}
    const watched=rows.filter(r=>!excluded.has(r.pid)&&(/^(node|codex)(\.exe)?$/i.test(r.name)||matched.has(r.pid))).map(r=>({pid:r.pid,parent_pid:r.parent_pid,name:r.name,created_at:r.created_at,command_sha256:sha256(String(r.command_line??''))})).sort((a,b)=>a.pid-b.pid);
    return {unknown,matched,watched,byPid,ancestry,consoleHosts};
  }
  const first=inspect(data.first,data.first_console_host_image),second=inspect(data.second,data.second_console_host_image),race=!isDeepStrictEqual(first.watched,second.watched)||!isDeepStrictEqual(first.ancestry,second.ancestry)||!isDeepStrictEqual(first.consoleHosts,second.consoleHosts),unknown=first.unknown||second.unknown||race,pids=[...new Set([...first.matched,...second.matched])].sort((a,b)=>a-b);
  return {quiescent:!unknown&&pids.length===0,unknown,observed_race:race,snapshot_count:2,coverage_sha256:digestObject(targets),invocation_sha256:digestObject([...first.ancestry,...first.consoleHosts]),console_hosts:first.consoleHosts,processes:pids.map(pid=>({pid,parent_pid:(second.byPid.get(pid)||first.byPid.get(pid)).parent_pid}))};
}
export function inspectGen24Owners(ctx,{run=spawnSync,historyAdmission=null}={}){
  requireThat(process.platform==='win32','OWNER_UNVERIFIABLE');
  // Keep raw command lines in memory only. Public proof contains IDs and hashes.
  const script=String.raw`$ErrorActionPreference='Stop'
function Get-Gen24Processes {
  @(Get-CimInstance Win32_Process | ForEach-Object {
    [pscustomobject]@{pid=[int]$_.ProcessId;parent_pid=[int]$_.ParentProcessId;name=$_.Name;command_line=$_.CommandLine;executable_path=$_.ExecutablePath;created_at=$(if ($_.CreationDate) {$_.CreationDate.ToUniversalTime().ToString('o')} else {$null})}
  })
}
function Get-Gen24ConsoleImage($rows) {
  try {
    $inspector=@($rows|Where-Object{$_.pid -eq $PID})
    if($inspector.Count -ne 1){return $null}
    if(@($rows|Where-Object{$_.parent_pid -eq $inspector[0].parent_pid -and $_.name -ieq 'conhost.exe'}).Count -eq 0){return $null}
    $windows=(Get-CimInstance Win32_OperatingSystem -Property WindowsDirectory).WindowsDirectory
    $expected=[IO.Path]::GetFullPath((Join-Path $windows 'System32/conhost.exe'))
    $component=$expected
    while($component){$item=Get-Item -LiteralPath $component -Force;if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){return $null};$component=Split-Path -Parent $component}
    $before=Get-Item -LiteralPath $expected -Force
    $sumBefore=(Get-FileHash -LiteralPath $expected -Algorithm SHA256).Hash.ToLowerInvariant()
    $signature=Get-AuthenticodeSignature -LiteralPath $expected
    $sum=(Get-FileHash -LiteralPath $expected -Algorithm SHA256).Hash.ToLowerInvariant()
    $after=Get-Item -LiteralPath $expected -Force
    if($sumBefore -ne $sum -or $before.Length -ne $after.Length -or $before.LastWriteTimeUtc.Ticks -ne $after.LastWriteTimeUtc.Ticks -or $before.CreationTimeUtc.Ticks -ne $after.CreationTimeUtc.Ticks){return $null}
    [pscustomobject]@{windows_directory=$windows;path=$expected;path_no_reparse_points=$true;stable_file=$true;sha256=$sum;bytes=[long]$after.Length;last_write_utc=$after.LastWriteTimeUtc.ToString('o');signature_status=$signature.Status.ToString();signature_type=$signature.SignatureType.ToString();is_os_binary=$signature.IsOSBinary;signer_name=$signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false);microsoft_organization=($signature.SignerCertificate.Subject -match '(?:^|,\s*)O=Microsoft Corporation(?:,|$)')}
  }catch{return $null}
}
$gen24First=@(Get-Gen24Processes)
$gen24FirstImage=Get-Gen24ConsoleImage $gen24First
$gen24Second=@(Get-Gen24Processes)
$gen24SecondImage=Get-Gen24ConsoleImage $gen24Second
[pscustomobject]@{inspector_pid=$PID;first=$gen24First;second=$gen24Second;first_console_host_image=$gen24FirstImage;second_console_host_image=$gen24SecondImage} | ConvertTo-Json -Depth 4 -Compress`;
  const result=run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,env:{...process.env}});
  requireThat(result.status===0&&!result.error,'OWNER_UNVERIFIABLE');let data;try{data=JSON.parse(result.stdout);}catch{throw error('OWNER_UNVERIFIABLE');}return evaluateGen24Owners(ctx,data,{historyAdmission});
}
async function quiescent(ctx,checkOwners,histories,now){
  await assertNativeWriterAllowed(ctx);await lockOwned(ctx);await checkRetainedHistories(ctx,histories,now);
  for(const d of await readdir(normalJobs(ctx),{withFileTypes:true})){requireThat(d.isDirectory()&&!d.isSymbolicLink(),'OWNER_UNVERIFIABLE');if(d.name===READING)continue;const job=await loadJob(await confined(normalJobs(ctx),d.name,{missing:false}));requireThat(job.state?.phase!=='generating'&&!job.state?.pending_attempt,'ACTIVE_OWNER');if(!histories?.bindings.some(b=>b.reading_id===d.name))await assertAuthorExecutionsFinished(job);}
  let proof;try{proof=await checkOwners(ctx,{historyAdmission:histories});}catch{throw error('OWNER_UNVERIFIABLE');}requireThat(proof?.quiescent===true&&proof.unknown===false&&Array.isArray(proof.processes)&&proof.processes.length===0,'ACTIVE_OWNER');return proof;
}

// Observation only. Do not enter withRunnerLock: even its readOnly mode writes
// a lock. No clock override, capability preparation, transport or author entry is
// reachable here. These non-atomic observations never authorize dispatch and
// cannot reconstruct a prior failure whose complete code was not retained.
export async function diagnoseGen24Recovery(ctx,{capabilitySha256,codexExecutable},{checkOwners=inspectGen24Owners}={}){
  const started=new Date(),checks=[];
  async function check(guard,operation){
    try{const value=await operation();checks.push({guard,status:'passed',code:null});return {passed:true,value};}
    catch(e){checks.push({guard,status:'blocked',code:safeV2ErrorCode(e)});return {passed:false};}
  }
  function skip(guard){checks.push({guard,status:'not_checked',code:null});}
  await check('native_source_writer',()=>assertNativeWriterAllowed(ctx));
  await check('grant_unconsumed',async()=>requireThat(!await lstat(await confined(recoveryRoot(ctx),'consumed.json')).catch(e=>{if(e.code==='ENOENT')return null;throw e;}),'CONSUMED'));
  // Read the checksum-verified document separately so a runtime/binding failure
  // cannot hide the independent fact that its existing window is now closed.
  const document=await check('capability_document',async()=>{
    requireThat(hash(capabilitySha256),'CAPABILITY_INVALID');
    const cap=await readJson(await confined(recoveryRoot(ctx),`capabilities/${capabilitySha256}.json`,{missing:false}));
    exact(cap,['schema_version','policy','approval_sha256','binding','history_admission','runtime','runtime_code_sha256','window','transport']);
    requireThat(digestObject(cap)===capabilitySha256&&cap.schema_version==='mhc-gen24-recovery-capability/v2'&&isDeepStrictEqual(cap.policy,POLICY),'CAPABILITY_INVALID');return cap;
  });
  await check('bound_capability',()=>capability(ctx,capabilitySha256,false,new Date()));
  const original=await check('original_snapshot',()=>inspectGen24Recovery(ctx));
  await check('forward_window',async()=>{const entry=ctx.plan.entries.find(e=>e.readingId===READING),priority=henryPriorityWindow(ctx.appConfig,new Date());requireThat(entry&&entry.dayIndex>=priority.currentDay&&entry.dayIndex<=priority.horizonDay,'OUTSIDE_FORWARD_WINDOW');});
  if(original.passed)await check('original_deadlines',async()=>requireThat(Date.parse(original.value.job.state.session.deadline_at)<=Date.now()&&Date.parse(original.value.job.state.lease.expires_at)<=Date.now(),'ORIGINAL_STATE_INVALID'));else skip('original_deadlines');
  if(document.passed){
    const cap=document.value;
    await check('current_window',async()=>{const approved=await approval(ctx,digestObject(cap.binding));requireThat(digestObject(approved)===cap.approval_sha256,'BINDING_CHANGED');windowValid(cap.window,approved.approved_at,new Date());});
    await check('executable_identity',async()=>requireThat(typeof codexExecutable==='string'&&path.isAbsolute(codexExecutable)&&path.resolve(codexExecutable)===cap.transport?.executable&&sha256(await readFile(codexExecutable))===cap.transport.executable_sha256&&configuredModels(ctx).spark===MODEL,'TRANSPORT_UNQUALIFIED'));
    const histories=await check('retained_histories',()=>checkRetainedHistories(ctx,cap.history_admission,new Date()));
    if(histories.passed){
      await check('other_jobs',async()=>{
        for(const d of await readdir(normalJobs(ctx),{withFileTypes:true})){requireThat(d.isDirectory()&&!d.isSymbolicLink(),'OWNER_UNVERIFIABLE');if(d.name===READING)continue;const job=await loadJob(await confined(normalJobs(ctx),d.name,{missing:false}));requireThat(job.state?.phase!=='generating'&&!job.state?.pending_attempt,'ACTIVE_OWNER');if(!histories.value?.bindings.some(b=>b.reading_id===d.name))await assertAuthorExecutionsFinished(job);}
      });
      await check('process_owners',async()=>{
        let proof;try{proof=await checkOwners(ctx,{historyAdmission:histories.value});}catch{throw error('OWNER_UNVERIFIABLE');}
        requireThat(proof?.quiescent===true&&proof.unknown===false&&Array.isArray(proof.processes)&&proof.processes.length===0,'ACTIVE_OWNER');
      });
    }else{skip('other_jobs');skip('process_owners');}
  }else for(const guard of ['current_window','executable_identity','retained_histories','other_jobs','process_owners'])skip(guard);
  await check('runner_lock_absent',async()=>requireThat(!await lstat(await confined(ctx.runtimeRoot,'runner.lock')).catch(e=>{if(e.code==='ENOENT')return null;throw e;}),'LOCK_PRESENT'));
  return {schema_version:'mhc-gen24-recovery-diagnostic/v1',readingId:READING,scope:'current_observation_only',started_at:started.toISOString(),finished_at:new Date().toISOString(),checks,dispatchAuthorized:false,runnerLockAcquired:false,originalFailureReconstructed:false,modelCalls:0};
}

export async function runGen24Recovery(ctx,{capabilitySha256,codexExecutable},dependencies={}){
  await assertNativeWriterAllowed(ctx);await lockOwned(ctx);const root=recoveryRoot(ctx);
  requireThat(!await lstat(await confined(root,'consumed.json')).catch(e=>{if(e.code==='ENOENT')return null;throw e;}),'CONSUMED');
  const clock=dependencies.clock||(()=>new Date()),run=dependencies.run||spawnSync,checkOwners=dependencies.checkOwners||inspectGen24Owners,{cap,inspected,approved}=await capability(ctx,capabilitySha256,false,clock());
  windowValid(cap.window,approved.approved_at,clock());const entry=ctx.plan.entries.find(e=>e.readingId===READING),priority=henryPriorityWindow(ctx.appConfig,clock());requireThat(entry.dayIndex>=priority.currentDay&&entry.dayIndex<=priority.horizonDay,'OUTSIDE_FORWARD_WINDOW');
  requireThat(Date.parse(inspected.job.state.session.deadline_at)<=+clock()&&Date.parse(inspected.job.state.lease.expires_at)<=+clock(),'ORIGINAL_STATE_INVALID');
  requireThat(path.resolve(codexExecutable)===cap.transport.executable&&sha256(await readFile(codexExecutable))===cap.transport.executable_sha256&&configuredModels(ctx).spark===MODEL,'TRANSPORT_UNQUALIFIED');await quiescent(ctx,checkOwners,cap.history_admission,clock());
  windowValid(cap.window,approved.approved_at,clock());
  const consumed={grant_id:GEN24_RECOVERY_GRANT,capability_sha256:capabilitySha256,original_binding_sha256:digestObject(cap.binding),history_admission_sha256:digestObject(cap.history_admission),claimed_at:clock().toISOString(),expires_at:cap.window.expires_at,max_author_calls:5,unknown_prior_dispatches_charged:1};
  await immutable(root,'consumed.json',consumed);await immutable(root,'consumed-capability.json',cap);await immutable(root,'consumed-approval.json',approved);await appendLedger(ctx,'capability_consumed',consumed,clock());
  let derived;
  const derivativeCtx={...ctx,jobRoot:derivativeJobs(ctx)};
  try{
    await freezeRetainedHistories(ctx,cap.history_admission);
    const transport=await prepareAuthorTransport(ctx,{lane:'spark',codexExecutable},{run,clock});requireThat(transport.executableSha256===cap.transport.executable_sha256&&transport.version===cap.transport.version&&transport.models.spark===MODEL,'TRANSPORT_UNQUALIFIED');
    derived=await createJob(derivativeCtx.jobRoot,inspected.job.input,clock(),inspected.job.state.models);
    for(const accepted of cap.binding.accepted)await immutable(derived.directory,`attempts/${accepted.candidate_sha256}.json`,await readFile(await confined(originalRoot(ctx),`attempts/${accepted.candidate_sha256}.json`,{missing:false})),{raw:true});
    await immutable(derived.directory,'original-binding.json',cap.binding);
    const session={id:`spark:${GEN24_RECOVERY_GRANT}:${capabilitySha256}`,lane:'spark',started_at:clock().toISOString(),deadline_at:cap.window.expires_at,submissions:0,runtime_revision:ctx.config.source_revision,runtime_manifest_sha256:ctx.manifestSha256};
    derived=await appendState(derived,'approved_gen24_recovery_derivative',{...derived.state,accepted:structuredClone(inspected.job.state.accepted),rejected:structuredClone(inspected.job.state.rejected),total_submissions:inspected.job.state.total_submissions,owners:structuredClone(inspected.job.state.owners),sessions:{...structuredClone(inspected.job.state.sessions),[session.id]:session},session,lease:{id:session.id,started_at:session.started_at,expires_at:cap.window.expires_at,transport_checkpoints:0},history:[...inspected.job.state.history,{kind:'approved_gen24_recovery',capability_sha256:capabilitySha256,original_event_head:cap.binding.event_head,unknown_intent:cap.binding.unknown_intent,new_author_call_limit:5}]},clock());
    for(const index of POLICY.missing_packet_indexes){
      windowValid(cap.window,approved.approved_at,clock());requireThat(Date.parse(cap.window.expires_at)-+clock()>=15000,'DEADLINE');
      const again=await inspectGen24Recovery(ctx);requireThat(isDeepStrictEqual(again.binding,cap.binding),'BINDING_CHANGED');await quiescent(ctx,checkOwners,cap.history_admission,clock());await assertAuthorExecutionsFinished(await loadJob(derived.directory));
      const packet=inspected.packets[index],base=`author/${packet.packet_id}/spark`,work={readingId:READING,requiredModel:MODEL};
      work.sourcePath=await atomicJson(derived.directory,`${base}/source-view.json`,packet,{immutable:true});work.schemaPath=await atomicJson(derived.directory,`${base}/candidate.schema.json`,candidateSchema,{immutable:true});
      work.instructionsPath=await atomicJson(derived.directory,`${base}/instructions-${MODEL}.json`,{model:MODEL,reasoning_effort:'medium',instructions:await readFile(path.join(ctx.releaseRoot,'prompts/mhc-v2-author.md'),'utf8')},{immutable:true});work.candidatePath=await confined(derived.directory,`${base}/candidate.json`);work.validationPath=await confined(derived.directory,`${base}/validation.json`);
      const verified=await verifyPublicPacket(derivativeCtx,work,'spark'),events=await ledger(ctx),intents=events.filter(e=>e.kind==='author_intent');requireThat(intents.length<5&&!intents.some(e=>e.data.packet_id===packet.packet_id),'CALL_LIMIT');
      const key=digestObject({grant_id:GEN24_RECOVERY_GRANT,capability_sha256:capabilitySha256,packet_id:packet.packet_id,attempt:1}),relative=`model-executions/${key}`;
      const schemaPath=await immutable(derived.directory,`${relative}/transport.schema.json`,transportSchema(candidateSchema)),outputPath=await confined(derived.directory,`${relative}/response.json`);
      await quiescent(ctx,checkOwners,cap.history_admission,clock());windowValid(cap.window,approved.approved_at,clock());
      await appendLedger(ctx,'author_intent',{execution_key:key,packet_id:packet.packet_id,packet_sha256:digestObject(packet),call_number:intents.length+1,model:MODEL,reasoning:'medium',original_unknown_allowance:index===6?1:0},clock());
      await quiescent(ctx,checkOwners,cap.history_admission,clock());
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
    windowValid(cap.window,approved.approved_at,clock());requireThat(isDeepStrictEqual((await inspectGen24Recovery(ctx)).binding,cap.binding),'BINDING_CHANGED');await quiescent(ctx,checkOwners,cap.history_admission,clock());const {job,bundle}=await buildReview(derivativeCtx,READING);requireThat(job.state.phase==='review_pending'&&Object.keys(job.state.accepted).length===11,'INCOMPLETE');
    await quiescent(ctx,checkOwners,cap.history_admission,clock());windowValid(cap.window,approved.approved_at,clock());
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
  requireThat(isDeepStrictEqual(await readJson(await confined(root,'consumed-capability.json',{missing:false})),cap)&&digestObject(await readJson(await confined(root,'consumed-approval.json',{missing:false})))===cap.approval_sha256&&consumed.grant_id===GEN24_RECOVERY_GRANT&&consumed.max_author_calls===5&&consumed.unknown_prior_dispatches_charged===1&&consumed.history_admission_sha256===digestObject(cap.history_admission),'COMPLETION_INVALID');
  const events=await ledger(ctx),intents=events.filter(e=>e.kind==='author_intent'),successes=events.filter(e=>e.kind==='author_complete');
  requireThat(consumed.original_binding_sha256===digestObject(cap.binding)&&events[0]?.kind==='capability_consumed'&&isDeepStrictEqual(events[0].data,consumed)&&events.at(-1)?.kind==='window_complete'&&events.at(-1).sha256===completed.ledger_head&&events.at(-1).data.job_event_head===completed.job_event_head&&events.at(-1).data.job_sequence===completed.job_sequence&&events.at(-1).data.review_basis_sha256===completed.review_basis_sha256&&intents.length===5&&successes.length===5&&successes.every((e,i)=>e.data.accepted&&e.data.execution_key===intents[i].data.execution_key&&e.data.packet_id===intents[i].data.packet_id)&&new Set(intents.map(e=>e.data.packet_id)).size===5&&isDeepStrictEqual(intents.map(e=>e.data.packet_id),cap.binding.packets.slice(6).map(p=>p.packet_id)),'COMPLETION_INVALID');
  const directory=await confined(derivativeJobs(ctx),READING,{missing:false}),job=await loadJob(directory),event=await readJson(await confined(directory,`events/${String(completed.job_sequence).padStart(6,'0')}.json`,{missing:false}));
  requireThat(event.event_sha256===completed.job_event_head&&event.state.phase==='review_pending'&&cap.binding.accepted.every(a=>event.state.accepted[`${a.packet_id}:spark`]?.candidate_sha256===a.candidate_sha256)&&job.input.input_sha256===cap.binding.input_sha256&&['review_pending','editorial_attention','approved','publishing','published'].includes(job.state.phase),'COMPLETION_INVALID');
  return {...job,recoveryGrantId:GEN24_RECOVERY_GRANT};
}
