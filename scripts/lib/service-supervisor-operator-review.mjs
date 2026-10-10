import {readFile} from 'node:fs/promises';
import {digestObject} from './mhc-v2.mjs';
import {assertSchemaValid} from './schema-validator.mjs';
import {assertChildPrivacy} from './service-supervisor-contracts.mjs';
import {checkedThreadIdentity} from './service-supervisor-exec.mjs';
import {confined,readPrivate,openJournal,durableWrite,jsonBytes,digest,fault} from './service-supervisor-store.mjs';

export const operatorReviewKind='genesis15-operator-review';
export const operatorReviewPolicy={model:'gpt-6.1-sol',reasoningEffort:'high',billingRoute:'existing ChatGPT login only',
  maxExecutions:1,maxDurationMs:900000,allowProseCorrections:true,allowPacketRepair:false,allowResponseCorrection:false};
const policyId='genesis15-final-review-recovery-2026-10-10';
const latest=events=>[...events.filter(e=>e.kind==='execution_state').reduce((m,e)=>m.set(e.data.execution.id,e.data.execution),new Map()).values()];
function assertCertain(events) {
  const executions=latest(events),publications=new Map();for(const e of events)if(e.kind==='publication_state')publications.set(e.data.transaction.id,e.data.transaction);
  if(executions.some(e=>['reserved','uncertain'].includes(e.phase)))throw fault('SUPERVISOR_CHILD_DISPATCH_UNCERTAIN');
  if(executions.some(e=>e.phase==='blocked'))throw fault('SUPERVISOR_CHILD_CAPABILITY_BLOCK_RETAINED');
  if([...publications.values()].some(t=>!['complete','blocked'].includes(t.phase)))throw fault('SUPERVISOR_WAKE_PUBLICATION_PENDING');
}
async function priorThreadEvidence(ctx,{binding,job,events}) {
  const {readdir}=await import('node:fs/promises'),evidence=[],threads=[];
  for(const e of latest(events).filter(e=>e.readingId===job.input.reading_id&&['independent-review','henry-editorial-repair'].includes(e.kind))) {
    const relative=e.eventLog?.path||`executions/${e.id}/events.jsonl`,raw=await readFile(await confined(ctx.stateRoot,relative,false));
    if(e.eventLog&&digest(raw)!==e.eventLog.sha256)throw fault('SUPERVISOR_OPERATOR_REVIEW_THREAD_PROOF_CHANGED');
    const identity=checkedThreadIdentity(raw.toString(),{redacted:true});
    if(e.threadId&&identity?.threadId!==e.threadId)throw fault('SUPERVISOR_OPERATOR_REVIEW_THREAD_PROOF_CHANGED');
    if(e.threadIdentity) {
      const proofRaw=await readFile(await confined(ctx.stateRoot,e.threadIdentity.path,false)),proof=JSON.parse(proofRaw);
      if(digest(proofRaw)!==e.threadIdentity.sha256||proof.threadId!==identity?.threadId||proof.rawEventSha256!==identity?.rawEventSha256||
        proof.rawEventsSha256!==e.eventsSha256)
        throw fault('SUPERVISOR_OPERATOR_REVIEW_THREAD_PROOF_CHANGED');
    }
    evidence.push({kind:e.kind,id:e.id,eventLogSha256:digest(raw),identity});if(identity)threads.push(identity.threadId);
  }
  const root=await confined(binding.native.projectRoot,`private-content/automation/mhc-v2/${job.input.reading_id}/model-executions`,false);
  for(const id of (await readdir(root)).sort()) {
    if(!/^[a-f0-9]{64}$/.test(id))throw fault('SUPERVISOR_HENRY_AUTHOR_PROOF_CHANGED');
    const recordRaw=await readFile(await confined(root,`${id}/result.json`,false)),record=JSON.parse(recordRaw),
      session=job.state.sessions[record.session],packet=job.input.chapters.flatMap(c=>c.batches).find(p=>digestObject(p)===record.proof?.packet_sha256);
    if(!packet||!session||record.proof.source_archive_sha256!==job.input.source_archive_sha256||record.proof.public_domain_commentary_only!==true)
      throw fault('SUPERVISOR_HENRY_AUTHOR_PROOF_CHANGED');
    const raw=await readFile(await confined(root,`${id}/events.jsonl`,false)),identity=checkedThreadIdentity(raw.toString());
    evidence.push({kind:'native-author',id,recordSha256:digest(recordRaw),eventLogSha256:digest(raw),identity});if(identity)threads.push(identity.threadId);
  }
  return {sha256:digestObject(evidence),threads:[...new Set(threads)]};
}
export async function genesis15ReviewSnapshot(ctx,{journal,binding,readingId}={}) {
  journal=journal||await openJournal(ctx.stateRoot);
  if(!['C','D'].includes(ctx.config.stage)||!binding)throw fault('SUPERVISOR_OPERATOR_REVIEW_AUTHORIZATION_INVALID');
  const {verifiedHenryContext}=await import('./service-supervisor-henry.mjs');
  await verifiedHenryContext(ctx); // Recheck current pointer and closure before reservation/apply, not just cached modules.
  const {verifyRuntime}=await import('./service-supervisor-runtime.mjs'),installed=await verifyRuntime(ctx.runtimeRoot,
    await readFile(await confined(ctx.runtimeRoot,'launcher.mjs',false)));
  if(installed.releaseRoot!==ctx.releaseRoot||digestObject(installed.config)!==digestObject(ctx.config)||installed.pointer.sourceRevision!==ctx.config.sourceRevision)
    throw fault('SUPERVISOR_OPERATOR_REVIEW_BASIS_CHANGED');
  const entries=binding.native.plan.entries.filter(e=>e.kind==='chapter'&&e.passages?.length===1&&e.passages[0].bookId==='GEN'&&
    e.passages[0].chapter===15&&e.passages[0].verseCount===21&&!e.passages[0].verseStart);
  if(entries.length!==1||readingId&&readingId!==entries[0].readingId)throw fault('SUPERVISOR_OPERATOR_REVIEW_SCOPE_INVALID');
  readingId=entries[0].readingId;
  const {job,entry,bundle}=await binding.service.buildReview(binding.native,readingId);
  if(job.state.phase!=='review_pending'||bundle.source_packets.length!==5)throw fault('SUPERVISOR_OPERATOR_REVIEW_BASIS_CHANGED');
  const events=await journal.load(),jobId=`henry-${job.input.input_sha256}-${bundle.review_basis_sha256}`,
    values=latest(events).filter(e=>e.kind==='independent-review'&&e.jobId===jobId).sort((a,b)=>a.ordinal-b.ordinal),
    packet={schemaVersion:'supervisor-henry-review-input/v1',readingId,reading:entry,reviewBasis:bundle},baseSha=digest(jsonBytes(packet)),failedReviews=[],priorOutputs=[];
  if(values.length!==2||values.some((e,i)=>e.phase!=='failed'||e.ordinal!==i+1))throw fault('SUPERVISOR_OPERATOR_REVIEW_ORIGINAL_BUDGET_INVALID');
  for(const e of values) {
    const rawPacket=await readFile(await confined(ctx.stateRoot,`executions/${e.id}/packet.json`,false)),{repairPlan,...base}=JSON.parse(rawPacket),
      raw=await readFile(await confined(ctx.stateRoot,e.output?.path,false));
    if(digest(rawPacket)!==e.inputSha256||digest(jsonBytes(base))!==baseSha||digest(raw)!==e.output?.sha256||
      e.inputSha256!==baseSha&&e.repairOfInputSha256!==baseSha)throw fault('SUPERVISOR_OPERATOR_REVIEW_ORIGINAL_CHANGED');
    for(const ref of [e.admission,e.admissionRejected].filter(Boolean))if(digest(await readFile(await confined(ctx.stateRoot,ref.path,false)))!==ref.sha256)
      throw fault('SUPERVISOR_OPERATOR_REVIEW_ORIGINAL_CHANGED');
    assertChildPrivacy(raw.toString());failedReviews.push({ordinal:e.ordinal,executionId:e.id,packetInputSha256:e.inputSha256,rawOutputSha256:digest(raw)});
    priorOutputs.push(JSON.parse(raw));
  }
  const {reviewMechanicalFindings}=await import('./service-supervisor-henry.mjs'),pipeline=binding.pipeline||await import('./mhc-pipeline.mjs'),
    mechanicalFindings=reviewMechanicalFindings(bundle,pipeline),priorThreads=await priorThreadEvidence(ctx,{binding,job,events});
  return {job,entry,bundle,packet,priorOutputs,mechanicalFindings,events,priorThreadIds:priorThreads.threads,binding:{supervisorSourceRevision:ctx.config.sourceRevision,
    supervisorManifestSha256:installed.pointer.manifestSha256,supervisorConfigSha256:installed.pointer.configSha256,
    nativeRuntime:structuredClone(ctx.config.henryRuntime),readingId,nativeInputSha256:job.input.input_sha256,nativeEventSha256:job.previous,
    reviewBasisSha256:bundle.review_basis_sha256,mechanicalFindingsSha256:digest(jsonBytes(mechanicalFindings)),priorThreadEvidenceSha256:priorThreads.sha256,failedReviews}};
}
async function validateReceipt(ctx,receipt,snapshot) {
  try{assertSchemaValid(receipt,await readPrivate(ctx.releaseRoot,'schemas/genesis15-operator-review-authorization.schema.json'),{label:'Genesis 15 manager review authorization'});}
  catch{throw fault('SUPERVISOR_OPERATOR_REVIEW_AUTHORIZATION_INVALID');}
  assertChildPrivacy(receipt);
  const {schemaVersion,policyId:scope,decision,issuer,issuedAt,policy,...basis}=receipt;
  if(scope!==policyId||digestObject(policy)!==digestObject(operatorReviewPolicy)||!Number.isFinite(Date.parse(issuedAt))||
    digestObject(basis)!==digestObject(snapshot.binding))throw fault('SUPERVISOR_OPERATOR_REVIEW_BASIS_CHANGED');
}
export async function authorizeGenesis15Review(ctx,receipt,{binding,receiptBytes,clock=()=>new Date()}={}) {
  const journal=await openJournal(ctx.stateRoot),lease=await journal.acquire('installation',{now:clock()});
  try{return await binding.runner.withRunnerLock(binding.native,async()=>{
    const raw=receiptBytes===undefined?jsonBytes(receipt):Buffer.from(receiptBytes),sha256=digest(raw),events=await journal.load();
    if(digestObject(JSON.parse(raw))!==digestObject(receipt))throw fault('SUPERVISOR_OPERATOR_REVIEW_AUTHORIZATION_INVALID');
    assertCertain(events);
    const prior=events.find(e=>e.kind==='genesis_review_authorized');
    if(prior) {
      if(prior.data.authorization.sha256!==sha256)throw fault('SUPERVISOR_OPERATOR_REVIEW_ALREADY_AUTHORIZED');
      await checkedAuthorization(ctx,prior.data);
      return {schemaVersion:'genesis15-review-authorization-result/v1',outcome:'already_authorized',authorizationSha256:sha256,dispatched:false};
    }
    const snapshot=await genesis15ReviewSnapshot(ctx,{journal,binding});assertCertain(snapshot.events);await validateReceipt(ctx,receipt,snapshot);
    if(latest(snapshot.events).some(e=>e.kind===operatorReviewKind))throw fault('SUPERVISOR_OPERATOR_REVIEW_ALREADY_SPENT');
    const relative=`operator-review/${sha256}/authorization.json`;await durableWrite(ctx.stateRoot,relative,raw);
    await journal.append('genesis_review_authorized',{policyId,readingId:receipt.readingId,sourceRevision:ctx.config.sourceRevision,
      authorization:{path:relative,sha256}},clock(),lease);
    return {schemaVersion:'genesis15-review-authorization-result/v1',outcome:'authorized',authorizationSha256:sha256,dispatched:false};
  });}finally{await journal.release(lease,clock());}
}
async function checkedAuthorization(ctx,record) {
  const raw=await readFile(await confined(ctx.stateRoot,record.authorization.path,false));
  if(record.policyId!==policyId||digest(raw)!==record.authorization.sha256)throw fault('SUPERVISOR_OPERATOR_REVIEW_AUTHORIZATION_CHANGED');
  return JSON.parse(raw);
}
export async function genesis15OperatorReview(ctx,{journal,binding,readingId}) {
  const events=await journal.load(),record=events.find(e=>e.kind==='genesis_review_authorized'&&e.data.readingId===readingId)?.data;
  if(!record)return null;
  const receipt=await checkedAuthorization(ctx,record);
  const values=latest(events).filter(e=>e.kind===operatorReviewKind);
  if(values.length>1)throw fault('SUPERVISOR_OPERATOR_REVIEW_ALREADY_SPENT');
  if(values.length) {
    const e=values[0];
    if(e.phase!=='accepted')return null; // One failed/uncertain/blocked response ends the exception.
    const raw=await readFile(await confined(ctx.stateRoot,e.output.path,false));
    if(digest(raw)!==e.output.sha256)throw fault('SUPERVISOR_OPERATOR_REVIEW_AUTHORIZATION_CHANGED');
    if(JSON.parse(raw).verdict!=='approved')return null;
  }
  const snapshot=await genesis15ReviewSnapshot(ctx,{journal,binding,readingId});await validateReceipt(ctx,receipt,snapshot);
  return {receipt,snapshot,authorization:record.authorization,execution:values[0]||null,
    jobId:`genesis15-operator-${readingId}`,kind:operatorReviewKind};
}
export async function writeGenesis15ReviewSnapshot(ctx,{binding,output}) {
  if(!output?.startsWith('private-content/automation/service-supervisor/'))throw fault('SUPERVISOR_OPERATOR_REVIEW_SNAPSHOT_PATH_INVALID');
  const snapshot=await binding.runner.withRunnerLock(binding.native,()=>genesis15ReviewSnapshot(ctx,{binding})),
    value={schemaVersion:'genesis15-review-binding-snapshot/v1',authorizationGranted:false,...snapshot.binding,
      mechanicalFindings:snapshot.mechanicalFindings,policy:operatorReviewPolicy},raw=jsonBytes(value),saved=await durableWrite(ctx.projectRoot,output,raw);
  return {schemaVersion:value.schemaVersion,outcome:'snapshot_saved',snapshotPath:saved,snapshotSha256:digest(raw),authorizationGranted:false};
}
