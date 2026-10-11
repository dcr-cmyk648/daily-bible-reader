import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {performance} from 'node:perf_hooks';
import {confined,readPrivate,openJournal,digest,fault} from './service-supervisor-store.mjs';
import {loadJob} from './mhc-v2-store.mjs';
import {sourceInput} from './mhc-v2-service.mjs';
import {loadHenryPlan} from './mhc-priority.mjs';
import {loadLatestHenryReading} from './mhc-library-sync.mjs';
import {digestObject} from './mhc-v2.mjs';
import {verifiedDailyHenryFallback} from './service-supervisor-henry-fallback.mjs';

export async function verifyCurrentPublicationApproval(ctx,transaction,dependencies={}) {
  if(!['reading','daily_henry_binding'].includes(transaction.kind))return null;
  const started=performance.now(),reference=transaction.approval;
  if(!reference?.path||!/^[a-f0-9]{64}$/.test(reference.sha256||''))throw fault('SUPERVISOR_APPROVAL_REQUIRED');
  const raw=await readFile(await confined(ctx.projectRoot,reference.path,false));
  if(digest(raw)!==reference.sha256)throw fault('SUPERVISOR_APPROVAL_CHANGED');
  const approval=JSON.parse(raw),id=transaction.readingId;
  if(transaction.component==='henry') {
    const job=await (dependencies.loadHenryJob||loadJob)(await confined(ctx.projectRoot,`private-content/automation/mhc-v2/${id}`,false));
    const approvedSha256=digestObject(approval);
    if(!(transaction.kind==='daily_henry_binding'?['publishing','published'].includes(job.state.phase):job.state.phase==='publishing')||job.state.blocker||job.state.review?.approved_sha256!==approvedSha256||
      job.state.review?.review_basis_sha256!==approval.review_basis_sha256||job.input.input_sha256!==approval.input_sha256||
      job.input.reading_id!==id||approval.reading_id!==id||approval.schema_version!=='mhc-evidence-approved/v2'||approval.review?.status!=='approved')
      throw fault('SUPERVISOR_CURRENT_HENRY_APPROVAL_CHANGED');
    const {plan,appConfig}=await loadHenryPlan(ctx.releaseRoot),entry=plan.entries.find(e=>e.readingId===id);
    if(!entry||job.input.plan_version!==plan.planVersion)throw fault('SUPERVISOR_HENRY_SOURCE_CHANGED');
    const source=await (dependencies.source||sourceInput)({...ctx,plan,appConfig,mhcRoot:path.join(ctx.projectRoot,'private-commentary/mhc')},entry);
    if(source.input.input_sha256!==job.input.input_sha256||!/public domain/i.test(source.sourceManifest.license))throw fault('SUPERVISOR_HENRY_SOURCE_CHANGED');
    const archive=await readFile(await confined(ctx.projectRoot,'research/raw/matthew-henry/crosswire/MHC-2.2.zip',false));
    if(digest(archive)!==source.sourceManifest.archive_sha256)throw fault('SUPERVISOR_HENRY_SOURCE_ARCHIVE_CHANGED');
    const libraryRoot=await confined(ctx.projectRoot,'private-commentary/mhc/stores/library',Boolean(dependencies.library));
    if(!dependencies.library) {
      const pointer=await readPrivate(libraryRoot,'current.json');
      const catalog=await readPrivate(libraryRoot,pointer.catalog_file);
      const descriptor=catalog.readings?.find(r=>r.reading_id===id);
      if(!descriptor)throw fault('SUPERVISOR_CURRENT_HENRY_LIBRARY_CHANGED');
      await confined(libraryRoot,descriptor.file,false);
    }
    const library=await (dependencies.library||loadLatestHenryReading)({libraryRoot,
      readingId:id,runtimeSchemaPath:path.join(ctx.releaseRoot,'schemas/mhc-runtime.schema.json')});
    if(!isDeepStrictEqual(library.runtimes,approval.results.map(r=>r.runtime))||
      transaction.approvalAuthority?.libraryReadingSha256&&transaction.approvalAuthority.libraryReadingSha256!==library.artifactSha256)
      throw fault('SUPERVISOR_CURRENT_HENRY_LIBRARY_CHANGED');
    return {kind:'henry_native',approvedSha256,inputSha256:job.input.input_sha256,reviewBasisSha256:approval.review_basis_sha256,
      libraryReadingSha256:library.artifactSha256,runtimeSha256:library.runtimes.map(digestObject),elapsedMs:Math.ceil(performance.now()-started)};
  }
  if(transaction.component!=='daily'||approval.schemaVersion!=='supervisor-editorial-approval/v1')throw fault('SUPERVISOR_DAILY_APPROVAL_INVALID');
  const events=await (await openJournal(ctx.stateRoot)).load();
  const record=events.findLast(e=>e.kind==='daily_state'&&e.data.job?.readingId===id),job=record?.data.job;
  if(!job||job.schemaVersion!=='service-supervisor-daily-state/v1')throw fault('SUPERVISOR_DAILY_CURRENT_APPROVAL_MISSING');
  if(!['approved','publishing'].includes(job.phase)||job.approvalSha256!==reference.sha256||job.approvalPath!==reference.path||
    approval.status!=='approved'||job.contentSha256!==approval.contentSha256||job.metadataSha256!==approval.metadataSha256||
    job.registrySha256!==approval.registrySha256||job.authorSessionId!==approval.authorSessionId||job.reviewerSessionId!==approval.reviewerSessionId||
    job.authorSessionId===job.reviewerSessionId)throw fault('SUPERVISOR_CURRENT_DAILY_APPROVAL_CHANGED');
  if(!job.research?.path?.startsWith(`private-content/automation/staging/${id}/`)||
    !/^[a-f0-9]{64}$/.test(job.research.sha256||''))throw fault('SUPERVISOR_DAILY_SOURCE_EVIDENCE_REQUIRED');
  const evidence=await readFile(await confined(ctx.projectRoot,job.research.path,false));
  if(digest(evidence)!==job.research.sha256)throw fault('SUPERVISOR_DAILY_SOURCE_EVIDENCE_CHANGED');
  let henry=null;
  if(job.henryApproval) {
    if(!job.henryApproval.path.startsWith(`private-content/automation/mhc-v2/${id}/approved/`))throw fault('SUPERVISOR_DAILY_HENRY_APPROVAL_CHANGED');
    henry=await verifyCurrentPublicationApproval(ctx,{kind:'daily_henry_binding',component:'henry',readingId:id,
      approval:job.henryApproval,approvalAuthority:{libraryReadingSha256:job.henryApproval.libraryReadingSha256}},dependencies);
    if(henry.inputSha256!==job.henryApproval.inputSha256||henry.approvedSha256!==job.henryApproval.approvedSha256)
      throw fault('SUPERVISOR_DAILY_HENRY_APPROVAL_CHANGED');
    if(!job.draft?.inputRoot||!job.draft.metadataPath)throw fault('SUPERVISOR_DAILY_HENRY_APPROVAL_CHANGED');
    const staged=await readFile(await confined(job.draft.inputRoot,job.draft.metadataPath,false));
    if(digest(staged)!==job.metadataSha256)throw fault('SUPERVISOR_DAILY_INPUT_CHANGED');
    const metadata=JSON.parse(staged),runtimes=metadata.verseCommentaries||(metadata.verseCommentary?[metadata.verseCommentary]:[]);
    if(!isDeepStrictEqual(runtimes.map(digestObject),henry.runtimeSha256)||metadata.henrySourceLink)
      throw fault('SUPERVISOR_DAILY_HENRY_ATTACHMENT_CHANGED');
  } else if(['C','D'].includes(ctx.config.stage)) {
    const {plan}=await loadHenryPlan(ctx.releaseRoot);
    const entry=plan.entries.find(e=>e.readingId===id);
    if(entry?.kind==='chapter') {
      if(!job.draft?.inputRoot||!job.draft.metadataPath)throw fault('SUPERVISOR_DAILY_HENRY_APPROVAL_REQUIRED');
      const staged=await readFile(await confined(job.draft.inputRoot,job.draft.metadataPath,false)),
        registryBytes=await readFile(await confined(job.draft.inputRoot,'research/working/bridge-source-registry.json',false));
      if(digest(staged)!==job.metadataSha256||digest(registryBytes)!==job.registrySha256)throw fault('SUPERVISOR_DAILY_INPUT_CHANGED');
      verifiedDailyHenryFallback({entry,metadata:JSON.parse(staged),registry:JSON.parse(registryBytes),research:JSON.parse(evidence)});
    }
  }
  return {kind:'daily_job',approvedSha256:reference.sha256,authorSessionId:job.authorSessionId,reviewerSessionId:job.reviewerSessionId,
    currentStateSha256:record.sha256,...(henry?{henry}:{}),elapsedMs:Math.ceil(performance.now()-started)};
}
