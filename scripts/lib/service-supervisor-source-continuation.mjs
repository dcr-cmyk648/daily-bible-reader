import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual as equal} from 'node:util';
import {confined,readPrivate,openJournal,durableWrite,digest,jsonBytes,fault} from './service-supervisor-store.mjs';
import {assertSchemaValid} from './schema-validator.mjs';
import {assertNoWriters} from './service-supervisor-runtime.mjs';
import {checkedSourceRuntime,sourceAttemptRecorder} from './service-supervisor-source-journal.mjs';
import {verifiedHenryContext} from './service-supervisor-henry.mjs';
import {checkedThreadIdentity,analyzeChildEvents} from './service-supervisor-exec.mjs';
import {assertChildPrivacy,decodeResearch,admitResearch,researchContract} from './service-supervisor-contracts.mjs';
import {dailyFoundation,dailyResearchPacket,admitDailyOrder} from './service-supervisor-daily.mjs';
import {consultResearchSources,sourceWorkBinding} from './service-supervisor-source-fetch.mjs';

const incident={jobId:'e1e14cd7fff6655f15cf4991db575d1b',executionId:'af1469b581e29f1ac8850dc2509a4a4f',threadId:'01a127d0-c8fa-7ed2-8932-d0968ce870d1',readingId:'LTP-0028-GEN-016',
  blockedEventSha256:'f3ed84907f1f4c0ba927b40f82f3f7a9185a97cdda2b767a39d339cf9ad1add5',inputSha256:'90771784f80e5c3beb436ad156ae89ef81dbfad9c313c1752d909fdb3222bb42',outputSha256:'b8f897b3cd83f02fe76c1bf5cd67c9a64b933e4711766dd68ef62afc2906ec5d',
  failedReceiptSha256:'751fcda6fba2f7802b6ed9e07bb8aa74fe5a7e0bd5244a6f18a2e55fb07a7daf',failedEventSha256:'10f0456e5fec2712344003b96021f2071cd7d4ec77b1615e72000042a8b9b396',
  diagnosticReceiptSha256:'5bba1c2ace4b69c0a6268b56211435920533d365a2288bd6c35eab2cac2a55c6',diagnosticResultSha256:'fe26719c725462b88f372ed59e0c4db814d9b9f291496134c50222bbdc710118',
  sourceId:'net_genesis16_notes_20261010',sourceWorkSha256:'7fd5c274305369fdd798af80d3e3ba3cfe6ed52c6adc6180d5095f1dd1603ec3',originalExcerptSha256:'bf18417514547670748ae8b4513ec03a9905ab6c53248e1e831b71a59f9c905e',
  urlOrCitation:'https://bible.org/sites/bible.org/resources/netbible/gen16_notes.htm',originalAccessedUrl:'https://bible.org/sites/bible.org/resources/netbible/gen16_notes.htm',
  effectiveAccessedUrl:'https://classic.net.bible.org/verse.php?book=Gen&chapter=16&tab=commentaries&theme=wiki&verse=12',
  reservationHashes:['552e8b772931ea85abff0ea685ed86ee61a3d24cffcb4284b9e287a8404bf6ee','330a8843a0ebb0f8d8b7ce452af96e82aa18b1a14a34581950b0c86937f72f1a','c42d5c99bfac230eafebd8b64d2bbdbf37f67213b5a988fa9e9e595f5d00b110','5c39e19e75b262c1fbdff4a48e188af8c972e14f492933b4615f361646f6c15e','5fab765c0f3c7298c58944afb168f0dcb055687f7fa4496762f35f69f55e5580']};
const discovery={kind:'manager_reported_native_web_discovery',reference:'turn161view0',url:incident.effectiveAccessedUrl,lines:[1,5,44],
  freshness:'Tool reported crawled last week; no origin freshness established.',identity:'Legacy NET Learning Environment; Genesis 16:12, NET notes and bible.org publisher identity. Manager also observed the publisher homepage identify 60,932 translator notes and 2006 copyright.',
  homepage:'https://classic.net.bible.org/home.php',httpBytesClaimed:false,consultationProof:false};
const bad=()=>fault('SUPERVISOR_SOURCE_CONTINUATION_BASIS_CHANGED');
const pins=p=>({sourceRevision:p.sourceRevision,manifestSha256:p.manifestSha256,configSha256:p.configSha256});
const result=(outcome,extra={})=>({schemaVersion:'genesis16-source-continuation-result/v1',outcome,modelDispatched:false,budgetReset:false,receiptReopened:false,published:false,...extra});
async function checkedBytes(root,ref){const bytes=await readFile(await confined(root,ref.path,false));if(digest(bytes)!==ref.sha256)throw bad();return bytes;}
async function currentPins(ctx,receipt,dependencies){
  const runtime=await checkedSourceRuntime(ctx,dependencies.runtime);
  const native=await (dependencies.native||verifiedHenryContext)(ctx),p=native.pointer;
  const nativePins={sourceRevision:p.source_revision,manifestSha256:p.manifest_sha256,configSha256:p.config_sha256};
  if(!equal(pins(runtime),pins(receipt))||!equal(nativePins,receipt.nativePins)||!equal(nativePins,ctx.config.henryRuntime))throw bad();
  return {runtime,nativePins};
}
async function historicalPins(ctx,oldReceipt,diagnostic){
  const readConfig=async p=>{
    const config=JSON.parse(await checkedBytes(ctx.runtimeRoot,{path:`config-${p.configSha256}.json`,sha256:p.configSha256})),
      manifest=JSON.parse(await checkedBytes(ctx.runtimeRoot,{path:`releases/${p.sourceRevision}-${p.manifestSha256.slice(0,16)}/manifest.json`,sha256:p.manifestSha256}));
    if(config.sourceRevision!==p.sourceRevision||manifest.sourceRevision!==p.sourceRevision||manifest.schemaVersion!=='service-supervisor-release/v1'||!config.henryRuntime)throw bad();
    return config.henryRuntime;
  };
  return {failedSupervisor:pins(oldReceipt),failedNative:await readConfig(oldReceipt),diagnosticSupervisor:pins(diagnostic.runtime),diagnosticNative:await readConfig(diagnostic.runtime)};
}
async function basis(ctx,receipt,events,target,dependencies={}){
  if(Object.keys(target).some(k=>k!=='readingId'&&!equal(receipt[k],target[k]))||new Set(receipt.identityTerms).size!==receipt.identityTerms.length)throw fault('SUPERVISOR_SOURCE_CONTINUATION_RECEIPT_INVALID');
  const anchor=events.find(e=>e.sha256===receipt.basisEventSha256),blocked=events.find(e=>e.sha256===target.blockedEventSha256),
    jobEvent=events.find(e=>e.sha256===receipt.blockedJobEventSha256),failed=events.find(e=>e.sha256===target.failedEventSha256);
  if(!anchor||!blocked||blocked.kind!=='execution_state'||!jobEvent||jobEvent.kind!=='daily_state'||!failed||failed.kind!=='research_revalidation_failed'||
    failed.data.executionId!==target.executionId||failed.data.receiptSha256!==target.failedReceiptSha256||failed.data.code!=='SUPERVISOR_SOURCE_ACCESS_UNAVAILABLE')throw bad();
  const original=blocked.data.execution,job=jobEvent.data.job,old=events.filter(e=>e.sequence<=anchor.sequence),executions=old.filter(e=>e.kind==='execution_state'&&e.data.execution.jobId===target.jobId&&e.data.execution.kind==='daily-research');
  if(original.id!==target.executionId||original.jobId!==target.jobId||original.readingId!==target.readingId||original.threadId!==target.threadId||original.inputSha256!==target.inputSha256||
    original.ordinal!==1||original.phase!=='blocked'||original.code!=='SUPERVISOR_CHILD_SOURCE_ACCESS_UNVERIFIABLE'||executions.length!==2||executions[0].data.execution.phase!=='reserved'||executions[1].sha256!==blocked.sha256||
    job.id!==target.jobId||job.readingId!==target.readingId||job.phase!=='blocked'||job.blocker?.code!==original.code||['research','draft','approvalPath','authorSessionId'].some(k=>job[k]!==null)||
    !equal(old.filter(e=>e.kind==='source_fetch_reserved'&&e.data.jobId===target.jobId).map(e=>e.sha256),target.reservationHashes))throw bad();
  const base=`executions/${target.executionId}`,packetBytes=await checkedBytes(ctx.stateRoot,{path:`${base}/packet.json`,sha256:target.inputSha256}),outputBytes=await checkedBytes(ctx.stateRoot,{path:`${base}/output.json`,sha256:target.outputSha256}),
    schemaBytes=await checkedBytes(ctx.stateRoot,{path:`${base}/schema.json`,sha256:receipt.schemaSha256}),eventBytes=await checkedBytes(ctx.stateRoot,original.eventLog),identityBytes=await checkedBytes(ctx.stateRoot,original.threadIdentity);
  if(digest(eventBytes)!==receipt.eventLogSha256||digest(identityBytes)!==receipt.identitySha256)throw bad();
  const identity=checkedThreadIdentity(eventBytes.toString(),{redacted:true}),savedIdentity=JSON.parse(identityBytes);
  if(identity?.threadId!==target.threadId||savedIdentity.threadId!==target.threadId||savedIdentity.rawEventsSha256!==original.eventsSha256)throw bad();
  analyzeChildEvents(eventBytes.toString(),{kind:'daily-research',sourceAccessMode:'code_consultation',redacted:true});
  const packet=JSON.parse(packetBytes),sourceSchema=await readPrivate(ctx.releaseRoot,'schemas/source.schema.json');
  if(!equal(JSON.parse(schemaBytes),researchContract(packet,sourceSchema)))throw bad();
  const decoded=decodeResearch(JSON.parse(outputBytes),{packet,sourceSchema}),net=decoded.records.find(r=>r.source.sourceId===target.sourceId);
  if(!net||net.source.summaryUseStatus!=='consulted'||net.source.urlOrCitation!==target.urlOrCitation||net.accessedUrl!==target.originalAccessedUrl||sourceWorkBinding(net.source)!==target.sourceWorkSha256||
    digest(Buffer.from(net.evidenceExcerpt.replace(/\s+/g,' ').trim()))!==target.originalExcerptSha256)throw bad();
  const oldReceipt=JSON.parse(await checkedBytes(ctx.stateRoot,{path:`research-revalidation/${target.failedReceiptSha256}/manager-receipt.json`,sha256:target.failedReceiptSha256}));
  assertSchemaValid(oldReceipt,await readPrivate(ctx.releaseRoot,'schemas/genesis16-research-revalidation.schema.json'));
  if(digest(jsonBytes(oldReceipt.mappings))!==receipt.priorMappingsSha256||oldReceipt.mappings.some(m=>m.sourceId===target.sourceId))throw bad();
  const diagnosticReceipt=JSON.parse(await checkedBytes(ctx.stateRoot,{path:`source-diagnostics/${target.diagnosticReceiptSha256}/manager-receipt.json`,sha256:target.diagnosticReceiptSha256}));
  assertSchemaValid(diagnosticReceipt,await readPrivate(ctx.releaseRoot,'schemas/genesis16-source-diagnostic.schema.json'));
  const diagnostic=JSON.parse(await checkedBytes(ctx.stateRoot,{path:`source-diagnostics/${target.diagnosticReceiptSha256}/result.json`,sha256:target.diagnosticResultSha256})),
    completed=old.find(e=>e.kind==='source_diagnostic_complete'&&e.data.receiptSha256===target.diagnosticReceiptSha256),terminal=old.find(e=>e.kind==='source_attempt_outcome'&&e.data.attemptId===target.reservationHashes[4]);
  if(!completed||completed.data.result.path!==`source-diagnostics/${target.diagnosticReceiptSha256}/result.json`||completed.data.result.sha256!==target.diagnosticResultSha256||
    !terminal||!equal(terminal.data,diagnostic.attempt)||diagnostic.receiptSha256!==target.diagnosticReceiptSha256||diagnostic.executionId!==target.executionId||diagnostic.sourceId!==target.sourceId||
    diagnostic.sourceWorkSha256!==target.sourceWorkSha256||diagnostic.originalOutputSha256!==target.outputSha256||diagnostic.passed!==false||diagnostic.checkpoint!==null||diagnostic.excerptMatched!==null||
    diagnostic.code!=='SUPERVISOR_SOURCE_ACCESS_UNAVAILABLE'||terminal.data.observation.status!==403||terminal.data.observation.bodyComplete!==true||terminal.data.observation.finalUrl!==target.originalAccessedUrl||
    terminal.data.observation.redirects.length!==0||diagnostic.researchAdmitted!==false||diagnostic.blockCleared!==false||diagnostic.budgetReset!==false||diagnostic.published!==false)throw bad();
  const historical=await historicalPins(ctx,oldReceipt,diagnostic);
  if(!equal(historical,receipt.historicalPins)||!equal(historical.failedSupervisor,pins(oldReceipt))||!equal(historical.diagnosticSupervisor,pins(diagnostic.runtime)))throw bad();
  const order=JSON.parse(await checkedBytes(ctx.projectRoot,job.workOrder)),registry=JSON.parse(await checkedBytes(ctx.projectRoot,job.baseRegistry));
  return {original,job,packet,decoded,net,sourceSchema,oldReceipt,order,registry,anchor};
}
function overlay(b,receipt){
  const before=digest(jsonBytes(b.net));b.net.accessedUrl=receipt.effectiveAccessedUrl;
  return {schemaVersion:'genesis16-source-locator-audit/v1',sourceId:receipt.sourceId,sourceWorkSha256:receipt.sourceWorkSha256,originalOutputSha256:receipt.outputSha256,
    originalExcerptSha256:receipt.originalExcerptSha256,originalUrlOrCitation:receipt.urlOrCitation,originalAccessedUrl:receipt.originalAccessedUrl,effectiveAccessedUrl:receipt.effectiveAccessedUrl,
    originalRecordSha256:before,effectiveRecordSha256:digest(jsonBytes(b.net)),identityTerms:receipt.identityTerms,discovery,
    reason:'Manager-approved same legacy NET work locator after the original anonymous HTTPS URL returned actual 403. New consultation must independently verify bytes, identity and original literal selection.',
    rawResponseChanged:false,sourceIdentityChanged:false,editionChanged:false,rightsChanged:false,discoveryAdmittedAsBytes:false};
}
async function verifyPrepared(ctx,events,prepared,receipt,b,current){
  const proof=JSON.parse(await checkedBytes(ctx.stateRoot,prepared.data.proof)),audit=JSON.parse(await checkedBytes(ctx.stateRoot,proof.locatorAudit)),admission=JSON.parse(await checkedBytes(ctx.stateRoot,proof.admission));
  const expectedAudit=overlay(b,receipt);
  const base=`source-continuations/${prepared.data.receiptSha256}`;
  if(prepared.data.proof.path!==`${base}/proof.json`||proof.receipt.path!==`${base}/manager-receipt.json`||proof.locatorAudit.path!==`${base}/locator-audit.json`||proof.admission.path!==`${base}/admission.json`)throw bad();
  const correctedPacket=await dailyResearchPacket(ctx,{entry:b.packet.reading,order:b.order,job:b.job,priorRegistry:b.registry,foundation:b.packet.foundation});
  if(proof.schemaVersion!=='genesis16-source-continuation-proof/v1'||proof.receipt.sha256!==prepared.data.receiptSha256||proof.executionId!==receipt.executionId||proof.outputSha256!==receipt.outputSha256||proof.inputSha256!==receipt.inputSha256||
    proof.basisEventSha256!==receipt.basisEventSha256||proof.blockedJobEventSha256!==receipt.blockedJobEventSha256||!equal(proof.runtime,current.runtime)||!equal(proof.nativePins,current.nativePins)||
    !equal(audit,expectedAudit)||!equal(proof.original,b.original)||!equal(proof.originalJob,b.job)||proof.budgetReset!==false||proof.consumedOrdinal!==1||proof.originalResponseChanged!==false||
    proof.diagnosticResultSha256!==receipt.diagnosticResultSha256||!equal(proof.historicalPins,receipt.historicalPins)||!equal(proof.oldReservationHashes,receipt.reservationHashes)||proof.correctedInputSha256!==digest(jsonBytes(correctedPacket))||
    proof.foundationSourceId!==b.packet.foundation.sourceId||proof.foundationSourceUrl!==b.packet.foundation.sourceUrl)throw bad();
  await checkedBytes(ctx.stateRoot,proof.receipt);
  const consulted=b.decoded.records.filter(r=>r.source.summaryUseStatus==='consulted');
  if(proof.checkpoints.length!==consulted.length||admission.records.length!==b.decoded.records.length||admission.evidence.length!==consulted.length||new Set(proof.checkpoints.map(c=>c.sourceId)).size!==consulted.length||
    admission.readingId!==b.job.readingId||admission.inputSha256!==receipt.inputSha256||!equal(admission.claims,b.decoded.claims)||!equal(admission.representedCategories,b.decoded.representedCategories)||
    !equal(admission.missingCategories,b.decoded.missingCategories)||admission.stoppingReason!==b.decoded.stoppingReason||!equal(admission.limitations,b.decoded.limitations))throw bad();
  for(let i=0;i<b.decoded.records.length;i++){
    const raw=b.decoded.records[i],accepted=admission.records[i];
    if(raw.source.summaryUseStatus!=='consulted'){if(!equal(raw,accepted))throw bad();continue;}
    const {accessDate,accessMethod,...identity}=accepted.source,{accessDate:oldDate,accessMethod:oldMethod,...oldIdentity}=raw.source;
    if(!equal(identity,oldIdentity)||accepted.accessedUrl!==(raw.source.sourceId===proof.foundationSourceId?proof.foundationSourceUrl:raw.accessedUrl)||accepted.evidenceExcerpt!==raw.evidenceExcerpt.replace(/\s+/g,' ').trim()||
      !equal({...accepted,source:null,accessedUrl:null,evidenceExcerpt:null,limitations:null},{...raw,source:null,accessedUrl:null,evidenceExcerpt:null,limitations:null})||
      !raw.limitations.every((v,j)=>accepted.limitations[j]===v))throw bad();
  }
  for(const item of proof.checkpoints){
    const cp=JSON.parse(await checkedBytes(ctx.stateRoot,item.ref)),raw=b.decoded.records.find(r=>r.source.sourceId===item.sourceId),evidence=admission.evidence.find(e=>e.sourceId===item.sourceId),
      written=events.find(e=>e.kind==='source_checkpoint_written'&&equal(e.data.checkpoint,item.ref));
    if(item.ref.path!==`source-checkpoints/${item.ref.sha256}.json`||!raw||!evidence||!written||cp.jobId!==receipt.jobId||cp.executionId!==receipt.executionId||cp.outputSha256!==receipt.outputSha256||cp.inputSha256!==receipt.inputSha256||cp.authoritySha256!==prepared.data.receiptSha256||
      cp.sourceId!==item.sourceId||cp.sourceWorkSha256!==sourceWorkBinding(raw.source)||cp.urlOrCitation!==raw.source.urlOrCitation||cp.accessedUrl!==evidence.url||!equal(cp.runtime,pins(current.runtime))||
      cp.rightsStatus!==raw.source.rightsStatus||cp.originalExcerptSha256!==digest(Buffer.from(evidence.excerpt))||cp.excerptMatched!==true||cp.approval!==false||cp.published!==false||
      cp.originalExcerptWords!==evidence.excerpt.trim().split(/\s+/).length||cp.quotedWords>cp.quoteCeiling||cp.quoteCeiling>(['public_domain','open_license'].includes(cp.rightsStatus)?200:25)||
      cp.excerpt!==null&&(cp.excerpt!==evidence.excerpt||cp.quoteOmitted!==false||cp.quotedWords!==cp.originalExcerptWords)||cp.excerpt===null&&(cp.quoteOmitted!==true||cp.quotedWords!==0))throw bad();
    if(['jobId','executionId','inputSha256','outputSha256','authoritySha256','attemptId','sourceId'].some(k=>written.data[k]!==cp[k])||!equal(written.data.runtime,cp.runtime))throw bad();
    if(item.sourceId===proof.foundationSourceId){if(cp.accessKind!=='local_verified_henry'||cp.attemptId!==null||!equal(cp.atomHashes,evidence.atomHashes)||cp.archiveSha256!==evidence.archiveSha256||
      cp.archiveSha256!==b.packet.foundation.archiveSha256||!equal(cp.atomHashes,b.packet.foundation.atoms.map(a=>({id:a.id,sha256:a.sha256}))))throw bad();}
    else {
      const attempt=events.find(e=>e.kind==='source_attempt_outcome'&&e.data.attemptId===cp.attemptId),reservation=events.find(e=>e.sha256===cp.attemptId&&e.kind==='source_fetch_reserved');
      if(!attempt||!reservation||attempt.data.authoritySha256!==prepared.data.receiptSha256||attempt.data.sourceId!==item.sourceId||attempt.data.outcome!=='returned'||!equal(cp.observation,attempt.data.observation)||
        reservation.data.receiptSha256!==prepared.data.receiptSha256||reservation.data.jobId!==receipt.jobId||cp.observation.status!==200||cp.observation.bodyComplete!==true||cp.observation.contentSha256!==evidence.contentSha256||
        cp.observation.normalizedTextSha256!==evidence.normalizedTextSha256||cp.observation.accessedAt!==evidence.accessedAt||
        admission.records.find(r=>r.source.sourceId===item.sourceId).source.accessDate!==cp.observation.accessedAt?.slice(0,10)||cp.accessKind!=='bounded_anonymous_https'||!equal(cp.citationBinding,evidence.citationBinding))throw bad();
    }
    assertChildPrivacy(cp);
  }
  // Re-run aggregate rights/coverage using only authenticated saved selected excerpts,
  // never label these reconstructed selected strings as new page/body returns.
  const selectedEvidence=admission.evidence.map(e=>({...e,kind:e.accessKind,returnedContent:e.excerpt,...(e.accessKind==='local_verified_henry'?{locator:b.decoded.records.find(r=>r.source.sourceId===e.sourceId).source.urlOrCitation}: {})}));
  if(!equal(admitResearch({...admission,status:'complete'},{packet:b.packet,sourceSchema:b.sourceSchema,sourceEvidence:selectedEvidence,decoded:true}),admission))throw bad();
  return proof;
}
export async function continueGenesis16Sources(ctx,{receiptPath,clock=()=>new Date()},dependencies={}){
  const target=dependencies.incident||incident;
  if(ctx.config.stage!=='C'||ctx.config.maxReadingsPerWake!==1||ctx.config.children?.sourceAccessMode!=='code_consultation')throw fault('SUPERVISOR_SOURCE_CONTINUATION_MODE_REQUIRED');
  if(!receiptPath.replaceAll('\\','/').startsWith('private-content/automation/service-supervisor/'))throw fault('SUPERVISOR_SOURCE_CONTINUATION_RECEIPT_INVALID');
  const rawReceipt=await readFile(await confined(ctx.projectRoot,receiptPath,false)),receipt=JSON.parse(rawReceipt),receiptSha256=digest(rawReceipt);
  assertSchemaValid(receipt,await readPrivate(ctx.releaseRoot,'schemas/genesis16-source-continuation.schema.json'));assertChildPrivacy(receipt);
  await assertNoWriters(ctx.projectRoot,ctx.stateRoot,{now:clock()});const journal=await openJournal(ctx.stateRoot),before=await journal.load(),lease=await journal.acquire('installation',{now:clock(),durationMs:15*60*1000});
  try{
    let events=await journal.load();const prior=events.find(e=>e.kind==='research_source_continuation_reserved'&&e.data.executionId===target.executionId);
    if(prior&&prior.data.receiptSha256!==receiptSha256)throw fault('SUPERVISOR_SOURCE_CONTINUATION_ALREADY_USED');
    const b=await basis(ctx,receipt,events,target,dependencies),current=await currentPins(ctx,receipt,dependencies),base=`source-continuations/${receiptSha256}`,
      prepared=events.find(e=>e.kind==='research_source_continuation_prepared'&&e.data.receiptSha256===receiptSha256),completed=events.find(e=>e.kind==='research_source_continuation_complete'&&e.data.receiptSha256===receiptSha256);
    if(prior&&events.some(e=>e.kind==='research_source_continuation_failed'&&e.data.receiptSha256===receiptSha256))return result('already_failed');
    if(prior&&!prepared)return result('uncertain',{code:'SUPERVISOR_SOURCE_CONTINUATION_UNCERTAIN'});
    let proof,proofRef;
    if(prepared){
      proof=await verifyPrepared(ctx,events,prepared,receipt,b,current);proofRef=prepared.data.proof;
      if(completed){
        const accepted=events.find(e=>e.sha256===completed.data.acceptedEventSha256),queued=events.find(e=>e.sha256===completed.data.queuedEventSha256);
        if(!equal(completed.data.proof,proofRef)||accepted?.kind!=='execution_state'||accepted.data.execution.id!==target.executionId||accepted.data.execution.phase!=='accepted'||!equal(accepted.data.execution.revalidation,{...proofRef,inputSha256:proof.correctedInputSha256})||
          queued?.kind!=='daily_state'||queued.data.job.id!==target.jobId||queued.data.job.phase!=='queued'||!equal(queued.data.job.researchRevalidation,proofRef))throw bad();
        return result('already_accepted',{proofSha256:proofRef.sha256,originalOrdinal:1});
      }
    }else{
      const now=clock().getTime(),issued=Date.parse(receipt.issuedAt),expires=Date.parse(receipt.expiresAt);
      if(issued>now||expires<=now||expires-issued>15*60*1000)throw fault('SUPERVISOR_SOURCE_CONTINUATION_EXPIRED');
      if(before.at(-1)?.sha256!==receipt.basisEventSha256||events.findLast(e=>e.kind==='execution_state'&&e.data.execution.id===target.executionId)?.sha256!==target.blockedEventSha256||
        events.findLast(e=>e.kind==='daily_state'&&e.data.job.id===target.jobId)?.sha256!==receipt.blockedJobEventSha256||
        events.some(e=>e.kind==='execution_state'&&e.data.execution.jobId===target.jobId&&e.data.execution.kind==='daily-research'&&e.data.execution.id!==target.executionId))throw bad();
      const fetches=events.filter(e=>e.kind==='source_fetch_reserved'&&e.data.jobId===target.jobId);
      if(fetches.length>=64)throw fault('SUPERVISOR_SOURCE_FETCH_BUDGET_EXHAUSTED');
      if(!equal(fetches.map(e=>e.sha256),receipt.reservationHashes))throw bad();
      const {entry}=await (dependencies.admitOrder||admitDailyOrder)(ctx,b.order,clock(),dependencies),foundation=await (dependencies.foundation||dailyFoundation)(ctx,entry,new Date(b.job.createdAt));
      if(!foundation||entry.readingId!==target.readingId||!equal(JSON.parse(jsonBytes({...foundation,sourceEvidence:undefined})),b.packet.foundation))throw bad();
      const correctedPacket=await dailyResearchPacket(ctx,{entry,order:b.order,job:b.job,priorRegistry:b.registry,foundation}),correctedInputSha256=digest(jsonBytes(correctedPacket)),audit=overlay(b,receipt),
        receiptRef={path:`${base}/manager-receipt.json`,sha256:receiptSha256},auditBytes=jsonBytes(audit),auditRef={path:`${base}/locator-audit.json`,sha256:digest(auditBytes)};
      await durableWrite(ctx.stateRoot,receiptRef.path,rawReceipt);await durableWrite(ctx.stateRoot,auditRef.path,auditBytes);
      await journal.append('research_source_continuation_reserved',{executionId:target.executionId,jobId:target.jobId,receiptSha256,receipt:receiptRef,locatorAudit:auditRef,
        basisEventSha256:receipt.basisEventSha256,oldReservationHashes:receipt.reservationHashes,diagnosticResultSha256:receipt.diagnosticResultSha256,runtime:current.runtime,nativePins:current.nativePins},clock(),lease);
      try{
        const checkpoints=[],recorder=sourceAttemptRecorder(ctx,{journal,lease,jobId:target.jobId,executionId:target.executionId,inputSha256:target.inputSha256,outputSha256:target.outputSha256,
          runtime:current.runtime,authoritySha256:receiptSha256,clock,fetchSource:dependencies.fetchSource}),mappings=[...b.oldReceipt.mappings,{sourceId:target.sourceId,sourceWorkSha256:target.sourceWorkSha256,
            urlOrCitation:target.urlOrCitation,accessedUrl:target.effectiveAccessedUrl,identityTerms:receipt.identityTerms}],
          sourceEvidence=await consultResearchSources({...b.decoded,records:[b.net,...b.decoded.records.filter(r=>r!==b.net)]},{foundation,deadline:expires,mappings,pdfExtractor:ctx.config.children.pdfExtractor,
            fetchSource:recorder.fetchSource,matchFailed:recorder.matchFailed,checkpoint:async(record,p,...args)=>{const ref=await recorder.checkpoint(record,p,...args);checkpoints.push({sourceId:record.source.sourceId,ref});},
            reserve:async request=>{
              await journal.assertLease(lease,clock());if(clock().getTime()>=expires)throw fault('SUPERVISOR_SOURCE_CONTINUATION_EXPIRED');
              const count=(await journal.load()).filter(e=>e.kind==='source_fetch_reserved'&&e.data.jobId===target.jobId).length;if(count>=64)throw fault('SUPERVISOR_SOURCE_FETCH_BUDGET_EXHAUSTED');
              await journal.append('source_fetch_reserved',{...request,jobId:target.jobId,executionId:target.executionId,receiptSha256,ordinal:count+1,continuation:true},clock(),lease);
            }}),admission=admitResearch(b.decoded,{packet:b.packet,sourceSchema:b.sourceSchema,sourceEvidence,decoded:true}),admissionBytes=jsonBytes(admission),admissionRef={path:`${base}/admission.json`,sha256:digest(admissionBytes)};
        if(!admission.evidence.some(e=>e.sourceId===foundation.sourceId))throw fault('SUPERVISOR_DAILY_HENRY_FOUNDATION_MISSING');
        await durableWrite(ctx.stateRoot,admissionRef.path,admissionBytes);
        proof={schemaVersion:'genesis16-source-continuation-proof/v1',executionId:target.executionId,inputSha256:target.inputSha256,outputSha256:target.outputSha256,
          basisEventSha256:receipt.basisEventSha256,blockedJobEventSha256:receipt.blockedJobEventSha256,original:b.original,originalJob:b.job,receipt:receiptRef,locatorAudit:auditRef,admission:admissionRef,checkpoints,
          runtime:current.runtime,nativePins:current.nativePins,historicalPins:receipt.historicalPins,diagnosticResultSha256:receipt.diagnosticResultSha256,oldReservationHashes:receipt.reservationHashes,correctedInputSha256,
          foundationSourceId:foundation.sourceId,foundationSourceUrl:foundation.sourceUrl,consumedOrdinal:1,originalResponseChanged:false,budgetReset:false};
        const proofBytes=jsonBytes(proof);proofRef={path:`${base}/proof.json`,sha256:digest(proofBytes)};await durableWrite(ctx.stateRoot,proofRef.path,proofBytes);
        await journal.append('research_source_continuation_prepared',{executionId:target.executionId,receiptSha256,proof:proofRef},clock(),lease);
      }catch(error){
        await journal.append('research_source_continuation_failed',{executionId:target.executionId,receiptSha256,code:/^SUPERVISOR_[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:'SUPERVISOR_SOURCE_CONTINUATION_FAILED'},clock(),lease);throw error;
      }
    }
    events=await journal.load();const latest=events.findLast(e=>e.kind==='execution_state'&&e.data.execution.id===target.executionId),
      accepted={...b.original,phase:'accepted',output:{path:`executions/${target.executionId}/output.json`,sha256:target.outputSha256},admission:proof.admission,revalidation:{...proofRef,inputSha256:proof.correctedInputSha256}};delete accepted.code;
    let acceptedEvent=latest;if(latest.sha256===target.blockedEventSha256)acceptedEvent=await journal.append('execution_state',{execution:accepted},clock(),lease);
    else if(!equal(latest.data.execution,accepted))throw bad();
    const lastJob=(await journal.load()).findLast(e=>e.kind==='daily_state'&&e.data.job.id===target.jobId),queued={...b.job,phase:'queued',blocker:null,researchRevalidation:proofRef};
    assertSchemaValid(queued,await readPrivate(ctx.releaseRoot,'schemas/service-supervisor-daily-state.schema.json'));
    let queuedEvent=lastJob;if(lastJob.sha256===receipt.blockedJobEventSha256)queuedEvent=await journal.append('daily_state',{job:queued},clock(),lease);
    else if(!equal(lastJob.data.job,queued))throw bad();
    await journal.append('research_source_continuation_complete',{executionId:target.executionId,receiptSha256,proof:proofRef,acceptedEventSha256:acceptedEvent.sha256,queuedEventSha256:queuedEvent.sha256},clock(),lease);
    return result('accepted',{proofSha256:proofRef.sha256,originalOrdinal:1});
  }finally{await journal.release(lease,clock());}
}
export async function verifyAcceptedSourceContinuation(ctx,accepted,inputSha256,dependencies={}){
  const journal=await openJournal(ctx.stateRoot),events=await journal.load(),binding=JSON.parse(await checkedBytes(ctx.stateRoot,accepted.revalidation)),
    receipt=JSON.parse(await checkedBytes(ctx.stateRoot,binding.receipt)),completed=events.find(e=>e.kind==='research_source_continuation_complete'&&equal(e.data.proof,{path:accepted.revalidation.path,sha256:accepted.revalidation.sha256}));
  assertSchemaValid(receipt,await readPrivate(ctx.releaseRoot,'schemas/genesis16-source-continuation.schema.json'));
  if(!completed||binding.correctedInputSha256!==inputSha256||binding.executionId!==accepted.id||!equal(binding.admission,accepted.admission))throw bad();
  const b=await basis(ctx,receipt,events,dependencies.incident||incident,dependencies),current=await currentPins(ctx,receipt,dependencies),prepared=events.find(e=>e.kind==='research_source_continuation_prepared'&&equal(e.data.proof,completed.data.proof));
  if(!prepared)throw bad();await verifyPrepared(ctx,events,prepared,receipt,b,current);
}
