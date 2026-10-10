import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {confined,readPrivate,durableWrite,jsonBytes,digest,fault} from './service-supervisor-store.mjs';
import {assertSchemaValid} from './schema-validator.mjs';
import {loadHenryPlan} from './mhc-priority.mjs';
import {forwardWindow} from './service-supervisor-policy.mjs';
import {authorizePublicationScope} from './service-supervisor-scope.mjs';
import {reconcileManifestBackedPrefix,extendActivePrefix} from './active-calendar.mjs';
import {validatePublicationSnapshot,DAILY_REVIEW_ASSERTIONS} from './service-supervisor-publication-gates.mjs';
import {executeBoundedChild} from './service-supervisor-exec.mjs';
import {researchContract,synthesisContract,independentReviewContract,decodeResearch,admitResearch,assertChildPrivacy,assertResearchPacketPrivacy,assertDailyReviewPacketPrivacy} from './service-supervisor-contracts.mjs';
import {verifiedResearchSources,consultResearchSources} from './service-supervisor-source-fetch.mjs';
import {PDF_LIMITS,PDF_VERSION,PDF_PACKAGE_SHA} from './service-supervisor-pdf.mjs';
import {sourceAttemptRecorder,checkedSourceRuntime} from './service-supervisor-source-journal.mjs';
import {sourceInput} from './mhc-v2-service.mjs';
import {loadLatestHenryReading} from './mhc-library-sync.mjs';
import {loadJob} from './mhc-v2-store.mjs';
import {digestObject} from './mhc-v2.mjs';
import {verifyCurrentPublicationApproval} from './service-supervisor-approval.mjs';
import {validateRegistryProvenance} from '../validate-source-registry.mjs';

const version='service-supervisor-daily-state/v1';
export async function latestDailyJob(journal,readingId) {
  return (await journal.load()).findLast(e=>e.kind==='daily_state'&&e.data.job?.readingId===readingId)?.data.job||null;
}
async function saveJob(ctx,journal,lease,job,now) {assertSchemaValid(job,await readPrivate(ctx.releaseRoot,'schemas/service-supervisor-daily-state.schema.json'),{label:'Daily supervisor state'});await journal.append('daily_state',{job},now,lease);}
async function privateArtifact(ctx,relative,bytes) {
  await durableWrite(ctx.projectRoot,relative,bytes);return {path:relative,sha256:digest(bytes)};
}
async function checkedArtifact(ctx,reference) {
  const bytes=await readFile(await confined(ctx.projectRoot,reference.path,false));
  if(digest(bytes)!==reference.sha256)throw fault('SUPERVISOR_DAILY_INPUT_CHANGED');return bytes;
}
async function optionalHash(root,relative) {
  try{return digest(await readFile(await confined(root,relative,false)));}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
async function ownedDraftRoot(ctx,root) {
  if(!path.isAbsolute(root)||await confined(ctx.stateRoot,path.relative(ctx.stateRoot,root),false)!==root)
    throw fault('SUPERVISOR_DAILY_INPUT_CHANGED');
  return root;
}
export async function promoteApprovedDaily(ctx,{journal,lease,job,now},dependencies={}) {
  const current=await latestDailyJob(journal,job.readingId);
  if(!current||current.id!==job.id||!['approved','publishing'].includes(current.phase)||
    current.approvalSha256!==job.approvalSha256)throw fault('SUPERVISOR_DAILY_APPROVAL_REVOKED');
  const approval=JSON.parse(await checkedArtifact(ctx,{path:job.approvalPath,sha256:job.approvalSha256}));
  assertSchemaValid(approval,await readPrivate(ctx.releaseRoot,'schemas/service-supervisor-editorial-approval.schema.json'),{label:'Daily independent approval'});
  if(approval.status!=='approved'||approval.contentSha256!==job.contentSha256||approval.metadataSha256!==job.metadataSha256||
    approval.registrySha256!==job.registrySha256)throw fault('SUPERVISOR_DAILY_APPROVAL_CHANGED');
  if(job.henryApproval)await verifyCurrentPublicationApproval(ctx,{kind:'reading',component:'daily',readingId:job.readingId,
    approval:{path:job.approvalPath,sha256:job.approvalSha256}},dependencies);
  const order=JSON.parse(await checkedArtifact(ctx,job.workOrder));await admitDailyOrder(ctx,order,now,dependencies);
  const writes=[{path:job.draft.contentPath,sha256:job.contentSha256,original:job.draft.originalContentSha256},
    {path:job.draft.metadataPath,sha256:job.metadataSha256,original:job.draft.originalMetadataSha256},
    {path:'research/working/bridge-source-registry.json',sha256:job.registrySha256,original:job.draft.priorRegistrySha256}];
  await ownedDraftRoot(ctx,job.draft.inputRoot);
  const bytes=[];
  for(const write of writes) {
    const raw=await readFile(await confined(job.draft.inputRoot,write.path,false));
    if(digest(raw)!==write.sha256)throw fault('SUPERVISOR_DAILY_INPUT_CHANGED');
    const hash=await optionalHash(ctx.projectRoot,write.path);
    if(hash!==write.sha256&&hash!==write.original)throw fault('SUPERVISOR_DAILY_INPUT_PROMOTION_CONFLICT');
    bytes.push(raw);
  }
  for(let i=0;i<writes.length;i++) {
    await journal.assertLease(lease,new Date(now));
    const latest=await latestDailyJob(journal,job.readingId);
    if(latest.approvalSha256!==job.approvalSha256||!['approved','publishing'].includes(latest.phase))throw fault('SUPERVISOR_DAILY_APPROVAL_REVOKED');
    if(job.henryApproval)await verifyCurrentPublicationApproval(ctx,{kind:'reading',component:'daily',readingId:job.readingId,
      approval:{path:job.approvalPath,sha256:job.approvalSha256}},dependencies);
    const hash=await optionalHash(ctx.projectRoot,writes[i].path);
    if(hash!==writes[i].sha256&&hash!==writes[i].original)throw fault('SUPERVISOR_DAILY_INPUT_PROMOTION_CONFLICT');
    await (dependencies.promote||durableWrite)(ctx.projectRoot,writes[i].path,bytes[i],{immutable:false});
  }
  const request={schemaVersion:'supervisor-publication-request/v1',readingId:job.readingId,component:'daily',
    approvalPath:job.approvalPath,approvalSha256:job.approvalSha256,...(order.schemaVersion==='protocol-backfill-work-order/v1'?
      {workOrderPath:job.workOrder.path,workOrderSha256:job.workOrder.sha256}:{})};
  const stage=`private-content/automation/staging/${job.readingId}/supervisor`,
    file=await privateArtifact(ctx,`${stage}/requests/${digest(jsonBytes(request))}.json`,jsonBytes(request));
  return {action:'publish_required',job,requestPath:file.path,published:false};
}
export async function dailyFoundation(ctx,entry,now) {
  if(entry.kind!=='chapter')return null;
  const {plan,appConfig}=await loadHenryPlan(ctx.releaseRoot),source=await sourceInput({...ctx,plan,appConfig,
    mhcRoot:path.join(ctx.projectRoot,'private-commentary/mhc')},entry);
  const manifest=source.sourceManifest,archive=await readFile(await confined(ctx.projectRoot,'research/raw/matthew-henry/crosswire/MHC-2.2.zip',false));
  if(!/public domain/i.test(manifest.license)||digest(archive)!==manifest.archive_sha256)throw fault('SUPERVISOR_DAILY_HENRY_SOURCE_CHANGED');
  const atoms=source.chapters.flatMap(c=>c.units.flatMap(u=>u.source_atoms));
  if(atoms.some(a=>!['commentary','heading'].includes(a.atom_type)||digest(Buffer.from(a.text))!==a.text_sha256))
    throw fault('SUPERVISOR_DAILY_HENRY_SOURCE_CHANGED');
  const sourceId=`henry_22_${entry.readingId.toLowerCase().replaceAll('-','_')}`,
    locator=`${manifest.source_url} [MHC ${manifest.module_version}; ${entry.passages.map(p=>`${p.bookId}.${p.chapter}`).join(', ')}]`;
  return {sourceId,sourceUrl:manifest.source_url,locator,archiveSha256:manifest.archive_sha256,
    license:manifest.license,workTitle:manifest.work_title,moduleVersion:manifest.module_version,
    atoms:atoms.map(a=>({id:a.source_atom_id,text:a.text,sha256:a.text_sha256})),
    sourceEvidence:{kind:'local_verified_henry',sourceId,locator,eventId:`local-henry-${source.input.input_sha256}`,url:manifest.source_url,
      contentSha256:digest(jsonBytes(atoms.map(a=>({id:a.source_atom_id,text:a.text})))),returnedContent:atoms.map(a=>a.text).join('\n\n')},
    verifiedAt:new Date(now).toISOString()};
}
async function editorialContract(ctx) {
  const files=['docs/EDITORIAL_STANCE.md','docs/CONTENT_AND_RIGHTS.md','docs/COMMENTARY_WORKFLOW.md',
    '.agents/skills/draft-daily-commentary/SKILL.md'];
  return Object.fromEntries(await Promise.all(files.map(async file=>[file,await readFile(await confined(ctx.releaseRoot,file,false),'utf8')])));
}
export async function dailyResearchPacket(ctx,{entry,order,job,priorRegistry,foundation},dependencies={}) {
  const sourceSchema=await readPrivate(ctx.releaseRoot,'schemas/source.schema.json'),policies=await editorialContract(ctx);
  foundation=foundation===undefined?await (dependencies.foundation||dailyFoundation)(ctx,entry,new Date(job.createdAt)):foundation;
  const packet={schemaVersion:'supervisor-daily-research-input/v1',readingId:entry.readingId,reading:entry,
    workOrder:order,policies,sourceSchema:sourceSchema.$defs.source,
    existingSourceInventory:priorRegistry.sources.map(({sourceId,title,authorOrOrganization,edition,urlOrCitation,includedReadings})=>
      ({sourceId,title,authorOrOrganization,edition,urlOrCitation,includedReadings})),
    registryContract:'Preserve existing records exactly. Reuse only a record already scoped to this reading; otherwise record a genuinely distinct accessed chapter/page/edition locator. Never invent a locator or count another chapter/mirror as an independent work.',
    sourceAccessContract:{mode:ctx.config.children?.sourceAccessMode||'cli_content',
      method:ctx.config.children?.sourceAccessMode==='code_consultation'?
        'CLI activity and candidate URLs are discovery only, never proof of an open. Code consultation requires actual anonymous HTTPS bytes, literal normalized excerpts and citation/rights binding. Use exact page URLs as citations; annotated or alternative citations need manager-verified identity mapping. Local Henry is code-verified without a network claim.':
        'Completed CLI page opens are discovery; source consultation needs returned page bytes and an exact selected excerpt.',
      copyrightExcerptWords:25,publicDomainExcerptWords:200,rawModernBodiesStored:false,
      ...(ctx.config.children?.sourceAccessMode==='code_consultation'?{pdf:{configured:!!ctx.config.children.pdfExtractor,
        method:'pypdf-plain/v1',version:PDF_VERSION,packageSha256:PDF_PACKAGE_SHA,...PDF_LIMITS}}:{})},
    foundation:foundation?{...foundation,sourceEvidence:undefined}:null};
  assertResearchPacketPrivacy(packet);return packet;
}
export async function admitDailyOrder(ctx,order,now,dependencies={}) {
  const name=order?.schemaVersion==='rolling-study-work-order/v1'?'rolling-study-work-order':'protocol-backfill-work-order';
  if(!['rolling-study-work-order/v1','protocol-backfill-work-order/v1'].includes(order?.schemaVersion))throw fault('SUPERVISOR_DAILY_WORK_ORDER_REQUIRED');
  assertSchemaValid(order,await readPrivate(ctx.releaseRoot,`schemas/${name}.schema.json`),{label:'Daily work order'});
  const {plan,appConfig}=await loadHenryPlan(ctx.releaseRoot),entry=plan.entries.find(e=>e.readingId===order.reading?.readingId);
  if(!entry||order.planVersion!==plan.planVersion||!isDeepStrictEqual(entry,order.reading)||
    !['prepare_publish','refresh_review_publish'].includes(order.action)||!Number.isFinite(Date.parse(order.issuedAt))||Date.parse(order.issuedAt)>new Date(now).getTime())
    throw fault('SUPERVISOR_DAILY_WORK_ORDER_CHANGED');
  if(order.schemaVersion==='rolling-study-work-order/v1') {
    const window=forwardWindow(plan,appConfig,now);
    if(order.effectiveDate!==window.today||!window.entries.some(e=>e.readingId===entry.readingId))
      throw fault('SUPERVISOR_DAILY_WORK_ORDER_SCOPE_CHANGED');
  }
  if(order.schemaVersion==='protocol-backfill-work-order/v1') {
    const workOrderPath=`private-content/automation/staging/${entry.readingId}/supervisor-orders/${digest(jsonBytes(order))}.json`;
    await durableWrite(ctx.projectRoot,workOrderPath,jsonBytes(order));
    await authorizePublicationScope(ctx,{readingId:entry.readingId,component:'daily',workOrderPath,workOrderSha256:digest(jsonBytes(order))},now,dependencies);
  }
  return {entry,plan,appConfig};
}
function registryForReading(prior,research,includedIds,readingId,now) {
  const verified=new Set(research.evidence.map(e=>e.sourceId));
  if(includedIds.some(id=>!verified.has(id)))throw fault('SUPERVISOR_DAILY_CITATION_UNCONSULTED');
  const next=structuredClone(prior),byId=new Map(next.sources.map(s=>[s.sourceId,s])),locators=new Set(next.sources.map(s=>s.urlOrCitation.trim().toLowerCase().replace(/\/$/,'')));
  for(const record of research.records) {
    const source=structuredClone(record.source),included=includedIds.includes(source.sourceId),existing=byId.get(source.sourceId);
    if(existing) {
      // Compatibility may never be fabricated by rewriting a prior source.
      if(included&&!existing.includedReadings.includes(readingId))throw fault('SUPERVISOR_REGISTRY_EXISTING_SOURCE_SCOPE_CHANGED');
      continue;
    }
    const locator=source.urlOrCitation.trim().toLowerCase().replace(/\/$/,'');
    if(locators.has(locator))throw fault('SUPERVISOR_REGISTRY_DUPLICATE_WORK');locators.add(locator);
    source.summaryUseStatus=included?'included':source.summaryUseStatus;source.includedReadings=included?[readingId]:[];
    next.sources.push(source);byId.set(source.sourceId,source);
  }
  if(includedIds.some(id=>!byId.has(id)))throw fault('SUPERVISOR_DAILY_CITATION_SOURCE_MISSING');
  const changed=digest(jsonBytes(next.sources))!==digest(jsonBytes(prior.sources));
  if(changed) {
    next.registryVersion=`supervisor-sources-${digest(jsonBytes(next.sources)).slice(0,24)}`;
    next.compatibleSourceSetVersions=[...new Set([...(prior.compatibleSourceSetVersions||[]),prior.registryVersion])];
    next.updatedAt=new Date(now).toISOString();
  }
  validateRegistryProvenance(next);return next;
}
async function defaultAttachment(ctx,entry) {
  if(entry.kind!=='chapter')return {};
  const library=await loadLatestHenryReading({libraryRoot:await confined(ctx.projectRoot,'private-commentary/mhc/stores/library',false),
    readingId:entry.readingId,runtimeSchemaPath:path.join(ctx.releaseRoot,'schemas/mhc-runtime.schema.json')});
  const job=await loadJob(await confined(ctx.projectRoot,`private-content/automation/mhc-v2/${entry.readingId}`,false));
  if(!['publishing','published'].includes(job.state.phase)||!job.state.review?.approved_sha256)throw fault('SUPERVISOR_DAILY_HENRY_APPROVAL_REQUIRED');
  const relative=`private-content/automation/mhc-v2/${entry.readingId}/approved/${job.state.review.approved_sha256}.json`,
    bytes=await readFile(await confined(ctx.projectRoot,relative,false)),approved=JSON.parse(bytes);
  if(digestObject(approved)!==job.state.review.approved_sha256||digestObject(approved.results.map(r=>r.runtime))!==digestObject(library.runtimes))
    throw fault('SUPERVISOR_DAILY_HENRY_APPROVAL_CHANGED');
  const attachment={verseCommentaries:library.runtimes};
  Object.defineProperty(attachment,'approvalBinding',{value:{path:relative,sha256:digest(bytes),inputSha256:job.input.input_sha256,
    approvedSha256:job.state.review.approved_sha256,libraryReadingSha256:library.artifactSha256},enumerable:false});
  return attachment;
}
async function dailyChild(execute,ctx,options,contract,dependencies) {
  const clock=dependencies.clock||(()=>new Date());
  try{return await execute(ctx,{...options,schema:contract(options.packet)},dependencies);}catch(e){
    const states=(await options.journal.load()).filter(event=>event.kind==='execution_state'&&
      event.data.execution.jobId===options.jobId&&event.data.execution.kind===options.kind),last=states.at(-1)?.data.execution;
    // A recorded malformed response may consume one repair. Capability errors,
    // uncertain dispatches and model refusals never become semantic repairs.
    if(!last||last.phase!=='failed'||last.code!=='SUPERVISOR_CHILD_OUTPUT_INVALID'||last.ordinal!==1)throw e;
    const raw=await readFile(await confined(ctx.stateRoot,`executions/${last.id}/output.json`,false));
    if(raw.length>2*1024*1024)throw e;assertChildPrivacy(raw.toString());
    const packet={...options.packet,repairPlan:{schemaVersion:'supervisor-structural-repair/v1',
      failedExecutionId:last.id,failedOutputSha256:digest(raw),failedOutput:raw.toString(),
      findings:[String(e.message).slice(0,8000)],allowedRepairCount:1}};
    await options.journal.append('daily_repair_reserved',{jobId:options.jobId,kind:options.kind,planSha256:digest(jsonBytes(packet.repairPlan))},clock(),options.lease);
    return execute(ctx,{...options,packet,schema:contract(packet),prompt:
      `Repair the exact prior response once against the supplied contract and findings. Preserve source honesty and all editorial/rights limits. Return inputSha256 ${digest(jsonBytes(packet))}.\n${JSON.stringify(packet)}`},dependencies);
  }
}
export async function runDailyWork(ctx,{journal,lease,order,deadline,wakeId=lease.runId},dependencies={}) {
  const clock=dependencies.clock||(()=>new Date()),now=clock(),{entry,plan,appConfig}=await admitDailyOrder(ctx,order,now,dependencies);
  let job=await latestDailyJob(journal,entry.readingId);
  if(job&&['blocked','editorial_attention'].includes(job.phase))return {action:'checkpointed',job,published:false};
  if(job?.phase==='published')return {action:'published',job,published:false};
  if(job&&['approved','publishing'].includes(job.phase))return promoteApprovedDaily(ctx,{journal,lease,job,now},dependencies);
  const stage=`private-content/automation/staging/${entry.readingId}/supervisor`,
    workOrder=await privateArtifact(ctx,`${stage}/orders/${digest(jsonBytes(order))}.json`,jsonBytes(order));
  if(!job) {
    job={schemaVersion:version,id:randomBytes(16).toString('hex'),readingId:entry.readingId,phase:'queued',sourceRevision:ctx.config.sourceRevision,
      workOrder,createdAt:new Date(now).toISOString(),research:null,draft:null,approvalPath:null,approvalSha256:null,
      authorSessionId:null,reviewerSessionId:null,contentSha256:null,metadataSha256:null,registrySha256:null,blocker:null};
    await saveJob(ctx,journal,lease,job,clock());
  }
  const boundOrder=JSON.parse(await checkedArtifact(ctx,job.workOrder));await admitDailyOrder(ctx,boundOrder,clock(),dependencies);
  try {
    if(!job.baseRegistry) {
      const raw=await readFile(await confined(ctx.projectRoot,'research/working/bridge-source-registry.json',false));
      job.baseRegistry=await privateArtifact(ctx,`${stage}/registries/${digest(raw)}.json`,raw);await saveJob(ctx,journal,lease,job,clock());
    }
    const sourceSchema=await readPrivate(ctx.releaseRoot,'schemas/source.schema.json'),policies=await editorialContract(ctx),
      foundation=await (dependencies.foundation||dailyFoundation)(ctx,entry,new Date(job.createdAt)),
      priorRegistryBytes=await checkedArtifact(ctx,job.baseRegistry),
      priorRegistry=JSON.parse(priorRegistryBytes),execute=dependencies.child||executeBoundedChild;
    let content,metadata,metadataBytes,registry,registryBytes,inputRoot,contentPath,metadataPath,research,synthesis;
    if(job.draft) {
      inputRoot=await ownedDraftRoot(ctx,job.draft.inputRoot);contentPath=job.draft.contentPath;metadataPath=job.draft.metadataPath;
      content=await readFile(await confined(inputRoot,contentPath,false));metadataBytes=await readFile(await confined(inputRoot,metadataPath,false));
      registryBytes=await readFile(await confined(inputRoot,'research/working/bridge-source-registry.json',false));
      if(digest(content)!==job.draft.contentSha256||digest(metadataBytes)!==job.draft.metadataSha256||
        digest(registryBytes)!==job.draft.registrySha256)throw fault('SUPERVISOR_DAILY_INPUT_CHANGED');
      metadata=JSON.parse(metadataBytes);registry=JSON.parse(registryBytes);
      research={admission:JSON.parse(await checkedArtifact(ctx,job.research)),execution:{threadId:job.researchThreadId}};
      synthesis={output:{markdown:content.toString()},execution:{id:job.authorSessionId,threadId:job.authorThreadId}};
    } else {
    const researchPacket=await dailyResearchPacket(ctx,{entry,order:boundOrder,job,priorRegistry,foundation});
    research=await dailyChild(execute,ctx,{journal,lease,jobId:job.id,readingId:entry.readingId,kind:'daily-research',packet:researchPacket,
      schema:researchContract(researchPacket,sourceSchema),deadline,
      prompt:`Research this one reading under the supplied editorial/rights policy. Web consultation only; no shell/apps/MCP/agents. Do not quote Scripture. eventId must be null: code binds actual opened-page events. Include the verified local Henry foundation when supplied, with its exact locator and source ID. Stop only for documented coverage limits/diminishing returns, never count mirrors as independent works. Return the contract JSON with inputSha256 ${digest(jsonBytes(researchPacket))}.\n${JSON.stringify(researchPacket)}`},
      packet=>researchContract(packet,sourceSchema),{...dependencies.exec,clock,admit:async(output,proof)=>{
        const decoded=decodeResearch(output,{packet:proof.packet,sourceSchema});
        const consult=ctx.config.children.sourceAccessMode==='code_consultation',
          verifier=consult?(_output,_events,options)=>consultResearchSources(_output,options):verifiedResearchSources,
          runtime=await checkedSourceRuntime(ctx,dependencies.sourceRuntime),
          recorder=sourceAttemptRecorder(ctx,{journal,lease,jobId:job.id,wakeId,clock,fetchSource:dependencies.fetchSource,runtime,
            executionId:proof.execution.id,inputSha256:proof.execution.inputSha256,outputSha256:proof.execution.output.sha256});
        const evidence=await verifier(decoded,proof.sourceEvidence,{foundation,deadline,
          fetchSource:recorder.fetchSource,checkpoint:recorder.checkpoint,matchFailed:recorder.matchFailed,
          ...(consult?{pdfExtractor:ctx.config.children.pdfExtractor}:{}),reserve:async proof=>{
            const reservations=(await journal.load()).filter(e=>e.kind==='source_fetch_reserved'&&e.data.jobId===job.id);
            if(reservations.length>=64)throw fault('SUPERVISOR_SOURCE_FETCH_BUDGET_EXHAUSTED');
            await journal.append('source_fetch_reserved',{wakeId,jobId:job.id,readingId:entry.readingId,
              ordinal:reservations.length+1,...proof},clock(),lease);
          }});
        return admitResearch(decoded,{...proof,sourceSchema,sourceEvidence:evidence,decoded:true});
      }});
    if(!research.admission)throw fault('SUPERVISOR_DAILY_RESEARCH_PROOF_MISSING');
    if(foundation&&!research.admission.evidence.some(e=>e.sourceId===foundation.sourceId))throw fault('SUPERVISOR_DAILY_HENRY_FOUNDATION_MISSING');
    job.research=await privateArtifact(ctx,`${stage}/research/${digest(jsonBytes(research.admission))}.json`,jsonBytes(research.admission));
    job.researchThreadId=research.execution.threadId;
    job.phase='authoring';await saveJob(ctx,journal,lease,job,clock());
    const synthesisPacket={schemaVersion:'supervisor-daily-synthesis-input/v1',readingId:entry.readingId,reading:entry,
      ...(job.repair?{repairPlan:job.repair}:{}),
      foundation:foundation?{...foundation,sourceEvidence:undefined}:null,
      workOrder:boundOrder,policies,research:research.admission,metadataSchema:await readPrivate(ctx.releaseRoot,'schemas/commentary.schema.json')};
    assertChildPrivacy(synthesisPacket);
    synthesis=await dailyChild(execute,ctx,{journal,lease,jobId:job.id,readingId:entry.readingId,kind:'daily-synthesis',packet:synthesisPacket,
      schema:synthesisContract(synthesisPacket),deadline,prompt:`Write the complete one-reading daily study using only verified source evidence. No tools or Scripture wording. Metadata is commentary/v3, draft and unreviewed; code supplies hashes, provenance and reviewed Henry attachments. Return exact JSON, metadataJson encodes the existing metadata schema. Use inputSha256 ${digest(jsonBytes(synthesisPacket))}.\n${JSON.stringify(synthesisPacket)}`},synthesisContract,{...dependencies.exec,clock});
    assertChildPrivacy(synthesis.output);
    if(foundation&&!synthesis.output.includedSourceIds.includes(foundation.sourceId))throw fault('SUPERVISOR_DAILY_HENRY_FOUNDATION_MISSING');
    registry=registryForReading(priorRegistry,research.admission,synthesis.output.includedSourceIds,entry.readingId,new Date(job.createdAt));
    content=Buffer.from(synthesis.output.markdown);metadata=JSON.parse(synthesis.output.metadataJson);
    if(metadata.readingId!==entry.readingId||metadata.schemaVersion!=='commentary/v3'||metadata.generation?.humanReviewStatus!=='unreviewed')
      throw fault('SUPERVISOR_DAILY_SYNTHESIS_BINDING_FAILED');
    let attachment;
    try{attachment=await (dependencies.attachment||defaultAttachment)(ctx,entry);}catch(e){
      if(!['ENOENT','MHC_READING_ABSENT'].includes(e.code))throw e;
      job.phase='waiting_henry';job.authorSessionId=synthesis.execution.id;job.authorThreadId=synthesis.execution.threadId;
      await saveJob(ctx,journal,lease,job,clock());return {action:'henry_dependency_required',job,published:false};
    }
    delete metadata.verseCommentary;delete metadata.verseCommentaries;delete metadata.henrySourceLink;
    if(attachment.approvalBinding)job.henryApproval=attachment.approvalBinding;
    Object.assign(metadata,attachment);
    metadata.generation={...metadata.generation,generatedAt:job.createdAt,modelOrTool:'gpt-6.1-sol/high; verified ChatGPT execution',
      promptOrWorkflowVersion:'supervisor-daily/v1',contentProtocolVersion:'daily-study-protocol/v1',sourceSetVersion:registry.registryVersion,
      contentHash:digest(content),humanReviewStatus:'in_review'};
    metadataBytes=jsonBytes(metadata);registryBytes=jsonBytes(registry);inputRoot=await confined(ctx.stateRoot,`daily-inputs/${job.id}-${digest(metadataBytes).slice(0,16)}`);
    contentPath=`private-content/bridge/celebration-y3q4/${entry.readingId}.md`;metadataPath=contentPath.replace(/\.md$/,'.metadata.json');
    const manifest=await readPrivate(ctx.projectRoot,'private-content/private-manifest.json'),prefix=reconcileManifestBackedPrefix({
      privatePlan:await readPrivate(ctx.releaseRoot,'fixtures/pilot-content/plan.json'),activePlan:plan,appConfig,manifestReadingIds:Object.keys(manifest.readings)});
    const preparedPlan=prefix.plan.entries.some(e=>e.readingId===entry.readingId)?prefix.plan:
      extendActivePrefix({privatePlan:prefix.plan,activePlan:plan,appConfig:prefix.appConfig,today:forwardWindow(plan,appConfig,clock()).today,lookaheadDays:7});
    // Isolated exact prefix; no canonical draft or tracked fixture changes before review.
    for(const item of preparedPlan.entries)for(const suffix of ['md','metadata.json']) {
      const relative=`private-content/bridge/celebration-y3q4/${item.readingId}.${suffix}`;
      await durableWrite(inputRoot,relative,item.readingId===entry.readingId?(suffix==='md'?content:metadataBytes):
        await readFile(await confined(ctx.projectRoot,relative,false)));
    }
    await durableWrite(inputRoot,'research/working/bridge-source-registry.json',registryBytes);
    await (dependencies.validate||validatePublicationSnapshot)({...ctx,publicationInputRoot:inputRoot},preparedPlan,
      {...prefix.appConfig,testingReadingIds:preparedPlan.entries.map(e=>e.readingId)},registryBytes,entry.readingId,job.id);
    job.draft={inputRoot,contentPath,metadataPath,priorRegistrySha256:digest(priorRegistryBytes),contentSha256:digest(content),
      metadataSha256:digest(metadataBytes),registrySha256:digest(registryBytes),
      originalContentSha256:await optionalHash(ctx.projectRoot,contentPath),originalMetadataSha256:await optionalHash(ctx.projectRoot,metadataPath)};
    job.authorSessionId=synthesis.execution.id;job.authorThreadId=synthesis.execution.threadId;job.phase='review_pending';
    await saveJob(ctx,journal,lease,job,clock());
    }
    const reviewPacket={schemaVersion:'supervisor-daily-review-input/v1',readingId:entry.readingId,reading:entry,workOrder:boundOrder,
      foundation:foundation?{...foundation,sourceEvidence:undefined}:null,
      policies,research:research.admission,markdown:synthesis.output.markdown,metadata,registry,
      contentSha256:job.draft.contentSha256,metadataSha256:job.draft.metadataSha256,registrySha256:job.draft.registrySha256};
    assertDailyReviewPacketPrivacy(reviewPacket,priorRegistry);
    const review=await dailyChild(execute,ctx,{journal,lease,jobId:job.id,readingId:entry.readingId,kind:'independent-review',packet:reviewPacket,
      schema:independentReviewContract(reviewPacket),deadline,authorThreadIds:[research.execution.threadId,synthesis.execution.threadId],
      prompt:`Independently review every claim and the complete exact study against the supplied real source-access evidence and editorial/rights policy. A machine-valid draft is unreviewed. Be explicit about omissions and source coverage limits. No tools, no Scripture wording, no publication. Approve only after all substantive assertions are true. Daily corrections array is empty; otherwise request changes. inputSha256 ${digest(jsonBytes(reviewPacket))}.\n${JSON.stringify(reviewPacket)}`},independentReviewContract,{...dependencies.exec,clock});
    if(review.output.verdict!=='approved'||review.output.corrections.length||!DAILY_REVIEW_ASSERTIONS.every(k=>review.output.assertions[k]===true)) {
      if(review.output.verdict==='changes_requested'&&!job.repair) {
        job.repair={schemaVersion:'supervisor-editorial-repair/v1',reviewExecutionId:review.execution.id,
          priorDraft:job.draft,findings:review.output.findings,priorMarkdown:content.toString(),priorMetadataJson:metadataBytes.toString(),allowedRepairCount:1};
        job.draft=null;job.phase='queued';await saveJob(ctx,journal,lease,job,clock());
        return runDailyWork(ctx,{journal,lease,order,deadline,wakeId},dependencies);
      }
      job.phase='editorial_attention';job.blocker={code:'SUPERVISOR_DAILY_REVIEW_CHANGES_REQUIRED',findings:review.output.findings};
      await saveJob(ctx,journal,lease,job,clock());return {action:'editorial_attention',job,published:false};
    }
    const approval={schemaVersion:'supervisor-editorial-approval/v1',readingId:entry.readingId,status:'approved',
      contentSha256:job.draft.contentSha256,metadataSha256:job.draft.metadataSha256,registrySha256:job.draft.registrySha256,
      authorSessionId:job.authorSessionId,reviewerSessionId:review.execution.id,reviewedAt:clock().toISOString(),
      findings:review.output.findings,assertions:review.output.assertions};
    assertSchemaValid(approval,await readPrivate(ctx.releaseRoot,'schemas/service-supervisor-editorial-approval.schema.json'),{label:'Daily independent approval'});
    const approved=await privateArtifact(ctx,`${stage}/approvals/${digest(jsonBytes(approval))}.json`,jsonBytes(approval));
    if(digest(await readFile(await confined(ctx.projectRoot,'research/working/bridge-source-registry.json',false)))!==job.draft.priorRegistrySha256)
      throw fault('SUPERVISOR_DAILY_REGISTRY_CHANGED_DURING_REVIEW');
    // Admission and current-source checks precede canonical private input promotion;
    // the remote manifest is still untouched and Stage B owns all connector writes.
    await admitDailyOrder(ctx,boundOrder,clock(),dependencies);await journal.assertLease(lease,clock());
    job.phase='approved';job.approvalPath=approved.path;job.approvalSha256=approved.sha256;
    job.contentSha256=approval.contentSha256;job.metadataSha256=approval.metadataSha256;job.registrySha256=approval.registrySha256;
    job.reviewerSessionId=review.execution.id;job.reviewerThreadId=review.execution.threadId;await saveJob(ctx,journal,lease,job,clock());
    return await promoteApprovedDaily(ctx,{journal,lease,job,now:clock()},dependencies);
  } catch(e) {
    // Approval remains resumable after a partial local promotion. Conflicts and
    // revocations are durable blocks; a host crash never refunds executions.
    if(job.phase==='approved'&&!/CONFLICT|CHANGED|REVOKED/.test(e.code||''))throw e;
    job.phase='blocked';job.blocker={code:e.code||'SUPERVISOR_DAILY_FAILED'};await saveJob(ctx,journal,lease,job,clock());throw e;
  }
}
