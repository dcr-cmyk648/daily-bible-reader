import {readFile,lstat} from 'node:fs/promises';
import {openJournal,confined,readPrivate,durableWrite,jsonBytes,digest,fault} from './service-supervisor-store.mjs';
import {admitDailyOrder,dailyResearchPacket} from './service-supervisor-daily.mjs';
import {assertChildPrivacy} from './service-supervisor-contracts.mjs';
import {assertSchemaValid} from './schema-validator.mjs';
import {assertNoWriters,verifyRuntime} from './service-supervisor-runtime.mjs';

const originalSource='78357445c6e419816836883ba45dce0e115498ff',policyId='genesis16-zero-dispatch-privacy-recovery-2026-10-10';
const authorizedJob='e1e14cd7fff6655f15cf4991db575d1b';
const empty=['research','draft','approvalPath','approvalSha256','authorSessionId','reviewerSessionId','contentSha256','metadataSha256','registrySha256'];
const progressed=['repair','henryApproval','publicationTransactionId','researchThreadId','authorThreadId','reviewerThreadId','preflightRecovery'];
async function checked(ctx,ref) {
  const raw=await readFile(await confined(ctx.projectRoot,ref.path,false));
  if(digest(raw)!==ref.sha256)throw fault('SUPERVISOR_PREFLIGHT_RECOVERY_BASIS_CHANGED');return JSON.parse(raw);
}
export async function validateGenesis16Preflight(ctx,{journal,jobId,blockedEventSha256,packetSha256,now},dependencies={}) {
  if(jobId!==authorizedJob||![blockedEventSha256,packetSha256].every(v=>/^[a-f0-9]{64}$/.test(v||'')))
    throw fault('SUPERVISOR_PREFLIGHT_RECOVERY_ARGUMENTS_INVALID');
  const events=await journal.load(),states=events.filter(e=>e.kind==='daily_state'&&e.data.job.id===jobId),event=states.at(-1),job=event?.data.job;
  if(!job||event.sha256!==blockedEventSha256||job.sourceRevision!==originalSource||job.phase!=='blocked'||
    job.blocker?.code!=='SUPERVISOR_CHILD_SCRIPTURE_REFUSED'||empty.some(k=>job[k]!==null)||
    progressed.some(k=>Object.hasOwn(job,k))||
    states.length!==3||states[0].data.job.phase!=='queued'||states[1].data.job.phase!=='queued'||!job.baseRegistry||
    events.findLast(e=>e.kind==='daily_state'&&e.data.job.readingId===job.readingId)?.data.job.id!==jobId)
    throw fault('SUPERVISOR_PREFLIGHT_RECOVERY_INELIGIBLE');
  if(states.some(({data:{job:prior}},index)=>empty.some(k=>prior[k]!==null)||progressed.some(k=>Object.hasOwn(prior,k))||
    ['sourceRevision','readingId','createdAt','workOrder'].some(k=>digest(jsonBytes(prior[k]))!==digest(jsonBytes(job[k])))||
    index<2&&prior.blocker!==null||index===0&&Object.hasOwn(prior,'baseRegistry')||
    index>0&&digest(jsonBytes(prior.baseRegistry))!==digest(jsonBytes(job.baseRegistry))))
    throw fault('SUPERVISOR_PREFLIGHT_RECOVERY_INELIGIBLE');
  // Any reservation counts, regardless of its later phase. No terminal child,
  // native author, research fetch, repair or publication receives a new budget.
  if(events.some(e=>(e.kind==='execution_state'&&(e.data.execution.jobId===jobId||e.data.execution.readingId===job.readingId))||
    (e.kind==='publication_state'&&e.data.transaction.readingId===job.readingId)||
    (e.kind!=='daily_state'&&(e.kind.includes('reserved')||e.kind.startsWith('henry_'))&&
      (e.data.jobId===jobId||e.data.readingId===job.readingId))))throw fault('SUPERVISOR_PREFLIGHT_RECOVERY_DISPATCH_EXISTS');
  if(await lstat(await confined(ctx.projectRoot,`private-content/automation/mhc-v2/${job.readingId}`)).catch(e=>{if(e.code==='ENOENT')return null;throw e;}))
    throw fault('SUPERVISOR_PREFLIGHT_RECOVERY_DISPATCH_EXISTS');
  const order=await checked(ctx,job.workOrder),{entry}=await admitDailyOrder(ctx,order,now,dependencies);
  if(entry.readingId!==job.readingId||order.schemaVersion!=='rolling-study-work-order/v1'||order.action!=='prepare_publish'||entry.kind!=='chapter'||entry.passages?.length!==1||
    entry.passages[0].bookId!=='GEN'||entry.passages[0].chapter!==16||entry.passages[0].verseCount!==16||entry.passages[0].verseStart)
    throw fault('SUPERVISOR_PREFLIGHT_RECOVERY_INELIGIBLE');
  const priorRegistry=await checked(ctx,job.baseRegistry),packet=await dailyResearchPacket(ctx,{entry,order,job,priorRegistry},dependencies);
  if(digest(jsonBytes(packet))!==packetSha256)throw fault('SUPERVISOR_PREFLIGHT_RECOVERY_BASIS_CHANGED');
  let legacyCode;try{assertChildPrivacy(packet);}catch(e){legacyCode=e.code;}
  if(legacyCode!=='SUPERVISOR_CHILD_SCRIPTURE_REFUSED')throw fault('SUPERVISOR_PREFLIGHT_RECOVERY_INELIGIBLE');
  return {job,event,packetSha256}; // Read-only eligibility, no authority or dispatch.
}
export async function recoverGenesis16Preflight(ctx,{jobId,blockedEventSha256,packetSha256,clock=()=>new Date()},dependencies={}) {
  if(jobId!==authorizedJob)throw fault('SUPERVISOR_PREFLIGHT_RECOVERY_ARGUMENTS_INVALID');
  if(ctx.config.stage!=='C'||ctx.config.maxReadingsPerWake!==1||ctx.config.sourceRevision===originalSource)
    throw fault('SUPERVISOR_PREFLIGHT_RECOVERY_CORRECTED_RELEASE_REQUIRED');
  await assertNoWriters(ctx.projectRoot,ctx.stateRoot,{now:clock()});
  const journal=await openJournal(ctx.stateRoot),lease=await journal.acquire('installation',{now:clock()});
  try {
    const prior=(await journal.load()).find(e=>e.kind==='daily_state'&&e.data.job.preflightRecovery);
    if(prior) {
      const ref=prior.data.job.preflightRecovery,proof=await checked(ctx,ref);
      if(proof.policyId!==policyId||proof.job.id!==jobId||proof.blockedEventSha256!==blockedEventSha256||proof.packetSha256!==packetSha256)
        throw fault('SUPERVISOR_PREFLIGHT_RECOVERY_ALREADY_USED');
      return {schemaVersion:'genesis16-preflight-recovery-result/v1',outcome:'already_recovered',jobId,
        readingId:proof.job.readingId,recoverySha256:ref.sha256,dispatched:false,budgetReset:false};
    }
    const installed=await (dependencies.runtime||(async()=>verifyRuntime(ctx.runtimeRoot,await readFileLauncher(ctx))))();
    if(installed.releaseRoot!==ctx.releaseRoot||digest(jsonBytes(installed.config))!==digest(jsonBytes(ctx.config))||
      installed.pointer.sourceRevision!==ctx.config.sourceRevision)throw fault('SUPERVISOR_PREFLIGHT_RECOVERY_BASIS_CHANGED');
    const {job,event}=await validateGenesis16Preflight(ctx,{journal,jobId,blockedEventSha256,packetSha256,now:clock()},dependencies),
      proof={schemaVersion:'genesis16-zero-dispatch-recovery/v1',policyId,blockedEventSha256:event.sha256,job,
        originalSourceRevision:originalSource,correctedRuntime:installed.pointer,packetSha256,packetBytesChanged:false,
        priorChildDispatches:0,budgetReset:false,scope:'one manager-selected Genesis16 preflight-only job; no child or native debt retry'},
      raw=jsonBytes(proof),sha256=digest(raw),relative=`private-content/automation/service-supervisor/preflight-recovery/${sha256}.json`,
      recovered={...job,phase:'queued',blocker:null,preflightRecovery:{path:relative,sha256}};
    assertSchemaValid(recovered,await readPrivate(ctx.releaseRoot,'schemas/service-supervisor-daily-state.schema.json'),{label:'Recovered preflight-only daily job'});
    await durableWrite(ctx.projectRoot,relative,raw);await journal.assertLease(lease,clock());
    // One atomic event is both the recovery reservation and phase transition.
    // A crash before it leaves the original block; after it exact reimport is a
    // no-op even if a later real child failed. Original events remain immutable.
    await journal.append('daily_state',{job:recovered},clock(),lease);
    return {schemaVersion:'genesis16-preflight-recovery-result/v1',outcome:'recovered',jobId,readingId:job.readingId,
      recoverySha256:sha256,dispatched:false,budgetReset:false};
  } finally {await journal.release(lease,clock());}
}
async function readFileLauncher(ctx) {return readFile(await confined(ctx.runtimeRoot,'launcher.mjs',false));}
