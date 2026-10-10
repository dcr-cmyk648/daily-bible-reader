import {readdir,readFile} from 'node:fs/promises';
import {openJournal,confined,digest,jsonBytes} from './service-supervisor-store.mjs';
import {loadJob} from './mhc-v2-store.mjs';

// Read-only mapping. This report is a rollback gate, never a lease renewal,
// candidate rewrite, approval grant or request to rerun a parked daily job.
export async function fourLaneCompatibility(ctx) {
  const journal=await openJournal(ctx.stateRoot),events=await journal.load(),daily=new Map(),children=new Map(),publications=new Map();
  for(const event of events) {
    if(event.kind==='daily_state')daily.set(event.data.job.readingId,event.data.job);
    if(event.kind==='execution_state')children.set(event.data.execution.id,event.data.execution);
    if(event.kind==='publication_state')publications.set(event.data.transaction.id,event.data.transaction);
  }
  const report={schemaVersion:'supervisor-four-lane-compatibility/v1',sourceRevision:ctx.config.sourceRevision,
    journalHeadSha256:events.at(-1)?.sha256||null,automationsChanged:false,daily:[],henry:[],uncertainChildren:[],publications:[],
    oldDailyAuthorAllowed:true,rollbackSafe:true};
  for(const job of daily.values()) {
    const published=job.phase==='published',item={readingId:job.readingId,jobId:job.id,phase:job.phase,
      disposition:published?'preserve_published':'park_no_replay',stateSha256:digest(jsonBytes(job)),
      authorSessionId:job.authorSessionId,reviewerSessionId:job.reviewerSessionId,contentSha256:job.contentSha256,
      workOrderSha256:job.workOrder.sha256};
    report.daily.push(item);if(!published)report.oldDailyAuthorAllowed=false;
  }
  for(const execution of children.values())if(['reserved','uncertain'].includes(execution.phase)) {
    report.uncertainChildren.push({executionId:execution.id,jobId:execution.jobId,kind:execution.kind,phase:execution.phase,inputSha256:execution.inputSha256});
    report.rollbackSafe=false;
  }
  for(const t of publications.values()) {
    report.publications.push({transactionId:t.id,readingId:t.readingId,phase:t.phase,ordinal:t.ordinal,
      disposition:['complete','blocked'].includes(t.phase)?'preserve_receipt':'reconcile_before_routing'});
    if(!['complete','blocked'].includes(t.phase))report.rollbackSafe=false;
  }
  const root=await confined(ctx.projectRoot,'private-content/automation/mhc-v2');
  for(const name of await readdir(root).catch(e=>{if(e.code==='ENOENT')return [];throw e;})) {
    const job=await loadJob(await confined(root,name,false)),hashes=[];
    for(const [key,value] of Object.entries(job.state.accepted)) {
      const raw=await readFile(await confined(job.directory,`attempts/${value.candidate_sha256}.json`,false));
      hashes.push({key,sha256:digest(raw),candidateSha256:value.candidate_sha256});
    }
    const unpublishedDependency=report.daily.some(d=>d.readingId===name&&d.disposition==='park_no_replay');
    report.henry.push({readingId:name,phase:job.state.phase,inputSha256:job.input.input_sha256,eventHeadSha256:job.previous,
      totalSubmissions:job.state.total_submissions,sessions:job.state.sessions,accepted:hashes,
      disposition:unpublishedDependency?'park_dependency_until_daily_publication':'retained_native_interface',
      requiredLane:job.state.phase==='fallback_pending'?'luna':job.state.session?.lane||'spark'});
  }
  return report;
}
