import {readFile, readdir, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {confined, durableWrite, readPrivate, jsonBytes, digest, fault} from './service-supervisor-store.mjs';
import {assertSchemaValid} from './schema-validator.mjs';
import {loadHenryPlan} from './mhc-priority.mjs';
import {forwardWindow} from './service-supervisor-policy.mjs';
import {reconcileManifestBackedPrefix, extendActivePrefix} from './active-calendar.mjs';
import {evaluateContentProtocolFreshness} from './daily-study-protocol.mjs';
import {loadJob} from './mhc-v2-store.mjs';
import {digestObject, REVIEW_ASSERTIONS} from './mhc-v2.mjs';
import {authorizePublicationScope} from './service-supervisor-scope.mjs';
import {sourceInput} from './mhc-v2-service.mjs';
import {verifyCurrentPublicationApproval} from './service-supervisor-approval.mjs';

export const DAILY_REVIEW_ASSERTIONS=['sourceAccessHonest','claimsSupported','interpretationReviewed','coverageReviewed',
  'rightsAndPrivacyReviewed','editorialStanceReviewed','standaloneProseReviewed','historicalContextReviewed'];
const validHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const validSession=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
async function sourceArtifact(ctx,slot,relative,mimeType,readingId) {
  const file=await confined(ctx.publicationInputRoot||ctx.projectRoot,relative,false),bytes=await readFile(file);
  if(!bytes.length||bytes.length>8*1024*1024)throw fault('SUPERVISOR_PUBLICATION_ARTIFACT_SIZE');
  const sha256=digest(bytes);
  return {slot,path:relative,sha256,bytes:bytes.length,mimeType,
    name:`${readingId}-${slot}-${sha256}.${mimeType==='text/markdown'?'md':'json'}`};
}
export async function validatePublicationSnapshot(ctx,plan,appConfig,registry,readingId,transactionId,approvedArtifacts=[]) {
  const relative=`publications/${transactionId}/validation`,workspace=await confined(ctx.stateRoot,relative);
  await mkdir(workspace,{recursive:true,mode:0o700});
  async function copyTree(dir) {
    for(const entry of await readdir(await confined(ctx.releaseRoot,dir,false),{withFileTypes:true})) {
      const child=`${dir}/${entry.name}`;
      if(entry.isDirectory())await copyTree(child);
      else if(entry.isFile()&&!entry.isSymbolicLink())await durableWrite(workspace,child,await readFile(await confined(ctx.releaseRoot,child,false)));
      else throw fault('SUPERVISOR_VALIDATION_SOURCE_REDIRECT');
    }
  }
  for(const scope of ['scripts','schemas','config','fixtures'])await copyTree(scope);
  // The isolated validation snapshot has its own prepared prefix. Never change
  // a tracked canonical fixture or a floating publication checkout to admit it.
  await durableWrite(workspace,'fixtures/pilot-content/plan.json',jsonBytes(plan),{immutable:false});
  await durableWrite(workspace,'fixtures/pilot-content/app-config.json',jsonBytes(appConfig),{immutable:false});
  await durableWrite(workspace,'research/working/bridge-source-registry.json',registry);
  for(const entry of plan.entries)for(const suffix of ['md','metadata.json']) {
    const file=`private-content/bridge/celebration-y3q4/${entry.readingId}.${suffix}`;
    const bytes=await readFile(await confined(ctx.publicationInputRoot||ctx.projectRoot,file,false));
    const approved=approvedArtifacts.find(a=>a.path===file);
    if(approved&&(digest(bytes)!==approved.sha256||bytes.length!==approved.bytes))throw fault('SUPERVISOR_APPROVED_BYTES_CHANGED');
    await durableWrite(workspace,file,bytes);
  }
  const execution=spawnSync(process.execPath,[path.join(workspace,'scripts/validate-private-content.mjs'),'--require'],{
    cwd:workspace,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:4*1024*1024,
    env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP}});
  await durableWrite(workspace,'validation-result.json',jsonBytes({readingId,exitCode:execution.status,
    stdout:execution.stdout||'',stderr:execution.stderr||'',errorCode:execution.error?.code||null}));
  if(execution.status!==0||execution.error)throw fault('SUPERVISOR_PRIVATE_VALIDATION_FAILED');
  return {valid:true,readingId,validatedPrefixReadings:plan.entries.length,registrySha256:digest(registry)};
}
export async function admitPublication(ctx,request,{now=new Date(),transactionId}={},dependencies={}) {
  if(!request||request.schemaVersion!=='supervisor-publication-request/v1'||
    !['daily','henry'].includes(request.component)||!/^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/.test(request.readingId)||
    Object.keys(request).some(k=>!['schemaVersion','readingId','component','approvalPath','approvalSha256','workOrderPath','workOrderSha256'].includes(k)))throw fault('SUPERVISOR_PUBLICATION_REQUEST_INVALID');
  const id=request.readingId,{plan:activePlan,appConfig}=await loadHenryPlan(ctx.releaseRoot),window=forwardWindow(activePlan,appConfig,now);
  const scope=await authorizePublicationScope(ctx,request,now,dependencies);
  const entry=activePlan.entries.find(e=>e.readingId===id);if(!entry)throw fault('SUPERVISOR_PUBLICATION_SCOPE_CHANGED');
  const manifest=await readPrivate(ctx.projectRoot,'private-content/private-manifest.json');
  const privatePlan=await readPrivate(ctx.releaseRoot,'fixtures/pilot-content/plan.json');
  const prefix=reconcileManifestBackedPrefix({privatePlan,activePlan,appConfig,manifestReadingIds:Object.keys(manifest.readings)});
  let preparedPlan=prefix.plan,preparedConfig=prefix.appConfig;
  if(!manifest.readings[id]) {
    if(request.component!=='daily'||activePlan.entries[preparedPlan.entries.length]?.readingId!==id)throw fault('SUPERVISOR_PREFIX_NOT_CONTIGUOUS');
    preparedPlan=extendActivePrefix({privatePlan:preparedPlan,activePlan,appConfig:preparedConfig,today:window.today,lookaheadDays:7});
    preparedConfig={...preparedConfig,testingReadingIds:preparedPlan.entries.map(e=>e.readingId)};
  }
  const content=await sourceArtifact(ctx,'content',`private-content/bridge/celebration-y3q4/${id}.md`,'text/markdown',id);
  const metadata=await sourceArtifact(ctx,'metadata',`private-content/bridge/celebration-y3q4/${id}.metadata.json`,'application/json',id);
  const inputRoot=ctx.publicationInputRoot||ctx.projectRoot;
  const metadataValue=await readPrivate(inputRoot,metadata.path);
  if(metadataValue.readingId!==id||metadataValue.generation?.contentHash!==content.sha256||
      !['in_review','approved'].includes(metadataValue.generation.humanReviewStatus))throw fault('SUPERVISOR_REVIEW_NOT_ADMITTED');
  const protocol=await readPrivate(ctx.releaseRoot,'config/daily-study-protocol.json');
  if(!evaluateContentProtocolFreshness({metadata:metadataValue,markdownBytes:await readFile(await confined(inputRoot,content.path,false)),protocol}).current)
    throw fault('SUPERVISOR_CONTENT_PROTOCOL_STALE');
  if(!validHash(request.approvalSha256)||typeof request.approvalPath!=='string')throw fault('SUPERVISOR_APPROVAL_REQUIRED');
  const approvalRoot=request.component==='henry'?`private-content/automation/mhc-v2/${id}/approved/`:`private-content/automation/staging/${id}/`;
  if(!request.approvalPath.startsWith(approvalRoot))throw fault('SUPERVISOR_APPROVAL_PATH_INVALID');
  const approvalBytes=await readFile(await confined(ctx.projectRoot,request.approvalPath,false));
  if(digest(approvalBytes)!==request.approvalSha256)throw fault('SUPERVISOR_APPROVAL_CHANGED');
  const approval=JSON.parse(approvalBytes),registry=await sourceArtifact(ctx,'sourceRegistry','research/working/bridge-source-registry.json','application/json',id);
  if(request.component==='henry') {
    const job=await loadJob(await confined(ctx.projectRoot,`private-content/automation/mhc-v2/${id}`,false));
    const sources=await sourceInput({...ctx,plan:activePlan,appConfig,mhcRoot:path.join(ctx.projectRoot,'private-commentary/mhc')},entry);
    if(sources.input.input_sha256!==job.input.input_sha256)throw fault('SUPERVISOR_HENRY_SOURCE_CHANGED');
    if(job.state.phase!=='publishing'||!job.state.review?.approved_sha256||digestObject(approval)!==job.state.review.approved_sha256||
      approval.schema_version!=='mhc-evidence-approved/v2'||approval.reading_id!==id||approval.input_sha256!==job.input.input_sha256||
      approval.review?.status!=='approved'||!REVIEW_ASSERTIONS.every(k=>approval.review.assertions?.[k]===true))throw fault('SUPERVISOR_HENRY_APPROVAL_INVALID');
    const attached=metadataValue.verseCommentaries||(metadataValue.verseCommentary?[metadataValue.verseCommentary]:[]);
    if(entry.kind!=='chapter'||attached.length!==approval.results.length||
      !approval.results.every(r=>attached.some(a=>isDeepStrictEqual(a,r.runtime))))throw fault('SUPERVISOR_HENRY_ATTACHMENT_CHANGED');
  } else {
    assertSchemaValid(approval,await readPrivate(ctx.releaseRoot,'schemas/service-supervisor-editorial-approval.schema.json'),{label:'Independent daily approval'});
    if(approval.readingId!==id||approval.contentSha256!==content.sha256||approval.metadataSha256!==metadata.sha256||
      approval.registrySha256!==registry.sha256||!validSession(approval.authorSessionId)||!validSession(approval.reviewerSessionId)||
      approval.authorSessionId===approval.reviewerSessionId||!DAILY_REVIEW_ASSERTIONS.every(k=>approval.assertions[k]===true))throw fault('SUPERVISOR_DAILY_APPROVAL_INVALID');
  }
  const approvalAuthority=await (dependencies.verifyApproval||verifyCurrentPublicationApproval)(ctx,{kind:'reading',readingId:id,
    component:request.component,approval:{path:request.approvalPath,sha256:request.approvalSha256}});
  const registryBytes=await readFile(await confined(inputRoot,registry.path,false));
  if(digest(registryBytes)!==registry.sha256)throw fault('SUPERVISOR_APPROVED_BYTES_CHANGED');
  await (dependencies.validate||validatePublicationSnapshot)(ctx,preparedPlan,preparedConfig,registryBytes,id,transactionId,[content,metadata]);
  const artifacts=[content,metadata];
  if(request.component==='daily') {
    const stage=`private-content/automation/staging/${id}/supervisor-prefix/${digest(jsonBytes(preparedPlan))}`;
    await durableWrite(inputRoot,`${stage}/plan.json`,jsonBytes(preparedPlan));
    await durableWrite(inputRoot,`${stage}/app-config.json`,jsonBytes(preparedConfig));
    artifacts.push(registry,await sourceArtifact(ctx,'plan',`${stage}/plan.json`,'application/json',id),
      await sourceArtifact(ctx,'appConfig',`${stage}/app-config.json`,'application/json',id));
  }
  return {approval:{path:request.approvalPath,sha256:request.approvalSha256},approvalAuthority,artifacts,scope};
}
