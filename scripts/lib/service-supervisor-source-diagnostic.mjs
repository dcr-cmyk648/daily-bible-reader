import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {assertSchemaValid} from './schema-validator.mjs';
import {assertChildPrivacy,decodeResearch} from './service-supervisor-contracts.mjs';
import {assertNoWriters,verifyRuntime} from './service-supervisor-runtime.mjs';
import {confined,readPrivate,openJournal,durableWrite,digest,jsonBytes,fault} from './service-supervisor-store.mjs';
import {consultResearchSources,sourceWorkBinding} from './service-supervisor-source-fetch.mjs';
import {sourceAttemptRecorder} from './service-supervisor-source-journal.mjs';

const incident={jobId:'e1e14cd7fff6655f15cf4991db575d1b',executionId:'af1469b581e29f1ac8850dc2509a4a4f',threadId:'01a127d0-c8fa-7ed2-8932-d0968ce870d1',
  blockedEventSha256:'f3ed84907f1f4c0ba927b40f82f3f7a9185a97cdda2b767a39d339cf9ad1add5',
  outputSha256:'b8f897b3cd83f02fe76c1bf5cd67c9a64b933e4711766dd68ef62afc2906ec5d',inputSha256:'90771784f80e5c3beb436ad156ae89ef81dbfad9c313c1752d909fdb3222bb42',
  failedReceiptSha256:'751fcda6fba2f7802b6ed9e07bb8aa74fe5a7e0bd5244a6f18a2e55fb07a7daf',failedEventSha256:'10f0456e5fec2712344003b96021f2071cd7d4ec77b1615e72000042a8b9b396',
  sourceId:'net_genesis16_notes_20261010',url:'https://bible.org/sites/bible.org/resources/netbible/gen16_notes.htm',
  reservationHashes:['552e8b772931ea85abff0ea685ed86ee61a3d24cffcb4284b9e287a8404bf6ee','330a8843a0ebb0f8d8b7ce452af96e82aa18b1a14a34581950b0c86937f72f1a',
    'c42d5c99bfac230eafebd8b64d2bbdbf37f67213b5a988fa9e9e595f5d00b110','5c39e19e75b262c1fbdff4a48e188af8c972e14f492933b4615f361646f6c15e']};
const result=(outcome,extra={})=>({schemaVersion:'genesis16-source-diagnostic-result/v1',outcome,modelDispatched:false,blockCleared:false,receiptReopened:false,budgetReset:false,published:false,...extra});
async function checkedReplay(ctx,events,prior,saved,receipt,target) {
  const base=`executions/${target.executionId}`;
  const raw=await readFile(await confined(ctx.stateRoot,`${base}/output.json`,false)),packet=await readFile(await confined(ctx.stateRoot,`${base}/packet.json`,false));
  const oldReceipt=await readFile(await confined(ctx.stateRoot,`research-revalidation/${target.failedReceiptSha256}/manager-receipt.json`,false));
  if(digest(raw)!==target.outputSha256||digest(packet)!==target.inputSha256||saved.receiptSha256!==prior.data.receiptSha256||saved.executionId!==target.executionId||
    digest(oldReceipt)!==target.failedReceiptSha256||prior.data.failedReceiptSha256!==target.failedReceiptSha256||prior.data.failedEventSha256!==target.failedEventSha256||
    !events.some(e=>e.sha256===target.failedEventSha256&&e.kind==='research_revalidation_failed'&&e.data.receiptSha256===target.failedReceiptSha256)||
    saved.sourceId!==target.sourceId||saved.originalOutputSha256!==target.outputSha256||saved.sourceWorkSha256!==receipt.sourceWorkSha256||
    !isDeepStrictEqual(saved.runtime,prior.data.runtime)||saved.researchAdmitted!==false||saved.blockCleared!==false||saved.budgetReset!==false||saved.published!==false||
    saved.passed!==!!saved.checkpoint)throw fault('SUPERVISOR_SOURCE_DIAGNOSTIC_BASIS_CHANGED');
  if(saved.attempt) {
    const event=events.find(e=>e.kind==='source_attempt_outcome'&&e.data.attemptId===saved.attempt.attemptId);
    if(!event||!isDeepStrictEqual(event.data,saved.attempt))throw fault('SUPERVISOR_SOURCE_DIAGNOSTIC_BASIS_CHANGED');
  }
  if(!saved.checkpoint)return;
  const ref=saved.checkpoint,bytes=await readFile(await confined(ctx.stateRoot,ref.path,false)),checkpoint=JSON.parse(bytes),
    record=JSON.parse(raw).records.find(r=>JSON.parse(r.sourceJson).sourceId===target.sourceId),source=JSON.parse(record.sourceJson),
    excerpt=record.evidenceExcerpt.replace(/\s+/g,' ').trim(),checkpointEvent=events.find(e=>e.kind==='source_checkpoint_written'&&e.data.checkpoint.sha256===ref.sha256),
    runtime={sourceRevision:saved.runtime.sourceRevision,manifestSha256:saved.runtime.manifestSha256,configSha256:saved.runtime.configSha256};
  if(digest(bytes)!==ref.sha256||!checkpointEvent||checkpointEvent.data.checkpoint.path!==ref.path||checkpointEvent.data.attemptId!==checkpoint.attemptId||
    checkpoint.authoritySha256!==saved.receiptSha256||checkpoint.jobId!==target.jobId||checkpoint.executionId!==target.executionId||
    checkpoint.outputSha256!==target.outputSha256||checkpoint.inputSha256!==target.inputSha256||checkpoint.sourceId!==target.sourceId||
    checkpoint.sourceWorkSha256!==sourceWorkBinding(source)||checkpoint.sourceWorkSha256!==receipt.sourceWorkSha256||checkpoint.urlOrCitation!==target.url||checkpoint.accessedUrl!==target.url||
    checkpoint.rightsStatus!==source.rightsStatus||!isDeepStrictEqual(checkpoint.runtime,runtime)||!saved.attempt||checkpoint.attemptId!==saved.attempt.attemptId||
    saved.attempt.outcome!=='returned'||checkpoint.accessKind!=='bounded_anonymous_https'||!isDeepStrictEqual(checkpoint.observation,saved.attempt.observation)||checkpoint.originalExcerptSha256!==digest(Buffer.from(excerpt))||
    checkpoint.originalExcerptWords!==excerpt.split(/\s+/).length||checkpoint.excerptMatched!==true||saved.excerptMatched!==true||checkpoint.approval!==false||checkpoint.published!==false||
    checkpoint.excerpt!==null&&(checkpoint.excerpt!==excerpt||checkpoint.quoteOmitted!==false||checkpoint.quotedWords!==checkpoint.originalExcerptWords)||
    checkpoint.excerpt===null&&(checkpoint.quoteOmitted!==true||checkpoint.quotedWords!==0)||checkpoint.quotedWords>checkpoint.quoteCeiling||
    checkpoint.quoteCeiling>(['public_domain','open_license'].includes(source.rightsStatus)?200:25))throw fault('SUPERVISOR_SOURCE_DIAGNOSTIC_BASIS_CHANGED');
  assertChildPrivacy(checkpoint);
}
export async function diagnoseGenesis16Source(ctx,{receiptPath,clock=()=>new Date()},dependencies={}) {
  const target=dependencies.incident||incident;
  if(ctx.config.stage!=='C'||ctx.config.maxReadingsPerWake!==1||ctx.config.children?.sourceAccessMode!=='code_consultation')throw fault('SUPERVISOR_SOURCE_DIAGNOSTIC_MODE_REQUIRED');
  if(!receiptPath.replaceAll('\\','/').startsWith('private-content/automation/service-supervisor/'))throw fault('SUPERVISOR_SOURCE_DIAGNOSTIC_RECEIPT_INVALID');
  const receiptBytes=await readFile(await confined(ctx.projectRoot,receiptPath,false)),receipt=JSON.parse(receiptBytes),receiptSha256=digest(receiptBytes);
  assertSchemaValid(receipt,await readPrivate(ctx.releaseRoot,'schemas/genesis16-source-diagnostic.schema.json'));assertChildPrivacy(receipt);
  if(['jobId','executionId','threadId','blockedEventSha256','inputSha256','outputSha256','failedReceiptSha256','failedEventSha256','sourceId'].some(k=>receipt[k]!==target[k])||
    receipt.accessedUrl!==target.url||receipt.urlOrCitation!==target.url)throw fault('SUPERVISOR_SOURCE_DIAGNOSTIC_RECEIPT_INVALID');
  await assertNoWriters(ctx.projectRoot,ctx.stateRoot,{now:clock()});const journal=await openJournal(ctx.stateRoot),lease=await journal.acquire('installation',{now:clock()});
  try {
    const events=await journal.load(),prior=events.find(e=>e.kind==='source_diagnostic_reserved'&&e.data.executionId===target.executionId),
      base=`source-diagnostics/${receiptSha256}`,completed=events.find(e=>e.kind==='source_diagnostic_complete'&&e.data.receiptSha256===receiptSha256);
    if(prior) {
      if(prior.data.receiptSha256!==receiptSha256)throw fault('SUPERVISOR_SOURCE_DIAGNOSTIC_ALREADY_USED');
      if(!completed)return result('uncertain',{code:'SUPERVISOR_SOURCE_DIAGNOSTIC_UNCERTAIN'});
      const saved=await readFile(await confined(ctx.stateRoot,completed.data.result.path,false));
      if(digest(saved)!==completed.data.result.sha256)throw fault('SUPERVISOR_SOURCE_DIAGNOSTIC_BASIS_CHANGED');
      const diagnostic=JSON.parse(saved);await checkedReplay(ctx,events,prior,diagnostic,receipt,target);
      return result('already_completed',{diagnostic,result:completed.data.result});
    }
    const installed=await (dependencies.runtime||(async()=>verifyRuntime(ctx.runtimeRoot,await readFile(await confined(ctx.runtimeRoot,'launcher.mjs',false)))))();
    if(installed.releaseRoot!==ctx.releaseRoot||!isDeepStrictEqual(installed.config,ctx.config)||
      ['sourceRevision','manifestSha256','configSha256'].some(k=>receipt[k]!==installed.pointer[k]))throw fault('SUPERVISOR_SOURCE_DIAGNOSTIC_BASIS_CHANGED');
    const issued=Date.parse(receipt.issuedAt),expires=Date.parse(receipt.expiresAt),now=clock().getTime();
    if(!Number.isFinite(issued)||!Number.isFinite(expires)||issued>now||expires<=now||expires-issued>15*60*1000)throw fault('SUPERVISOR_SOURCE_DIAGNOSTIC_EXPIRED');
    const blocked=events.find(e=>e.sha256===target.blockedEventSha256),failure=events.find(e=>e.sha256===target.failedEventSha256),
      latest=events.findLast(e=>e.kind==='execution_state'&&e.data.execution.id===target.executionId),job=events.findLast(e=>e.kind==='daily_state'&&e.data.job.id===target.jobId)?.data.job,
      fetches=events.filter(e=>e.kind==='source_fetch_reserved'&&e.data.jobId===target.jobId);
    if(fetches.length>=64)throw fault('SUPERVISOR_SOURCE_FETCH_BUDGET_EXHAUSTED');
    if(!blocked||blocked.kind!=='execution_state'||blocked.data.execution.id!==target.executionId||blocked.data.execution.ordinal!==1||blocked.data.execution.phase!=='blocked'||
      latest?.sha256!==target.blockedEventSha256||latest.data.execution.code!=='SUPERVISOR_CHILD_SOURCE_ACCESS_UNVERIFIABLE'||latest.data.execution.threadId!==target.threadId||
      !failure||failure.kind!=='research_revalidation_failed'||failure.data.executionId!==target.executionId||failure.data.receiptSha256!==target.failedReceiptSha256||
      failure.data.code!=='SUPERVISOR_SOURCE_ACCESS_UNAVAILABLE'||job?.phase!=='blocked'||job.blocker?.code!=='SUPERVISOR_CHILD_SOURCE_ACCESS_UNVERIFIABLE'||
      job.research!==null||fetches.length!==4||fetches.some((e,i)=>e.sha256!==target.reservationHashes[i])||
      events.some(e=>e.kind==='execution_state'&&e.data.execution.jobId===target.jobId&&e.data.execution.kind==='daily-research'&&e.data.execution.id!==target.executionId))
      throw fault('SUPERVISOR_SOURCE_DIAGNOSTIC_INELIGIBLE');
    const failedReceipt=await readFile(await confined(ctx.stateRoot,`research-revalidation/${target.failedReceiptSha256}/manager-receipt.json`,false));
    if(digest(failedReceipt)!==target.failedReceiptSha256)throw fault('SUPERVISOR_SOURCE_DIAGNOSTIC_BASIS_CHANGED');
    const originalBase=`executions/${target.executionId}`,outputBytes=await readFile(await confined(ctx.stateRoot,`${originalBase}/output.json`,false)),
      packetBytes=await readFile(await confined(ctx.stateRoot,`${originalBase}/packet.json`,false));
    if(digest(outputBytes)!==target.outputSha256||digest(packetBytes)!==target.inputSha256)throw fault('SUPERVISOR_SOURCE_DIAGNOSTIC_BASIS_CHANGED');
    const decoded=decodeResearch(JSON.parse(outputBytes),{packet:JSON.parse(packetBytes),sourceSchema:await readPrivate(ctx.releaseRoot,'schemas/source.schema.json')}),
      record=decoded.records.find(r=>r.source.sourceId===target.sourceId);
    if(!record||record.source.summaryUseStatus!=='consulted'||record.accessedUrl!==target.url||record.source.urlOrCitation!==target.url||
      sourceWorkBinding(record.source)!==receipt.sourceWorkSha256)throw fault('SUPERVISOR_SOURCE_DIAGNOSTIC_BASIS_CHANGED');
    await durableWrite(ctx.stateRoot,`${base}/manager-receipt.json`,receiptBytes);
    await journal.append('source_diagnostic_reserved',{executionId:target.executionId,jobId:target.jobId,receiptSha256,failedReceiptSha256:target.failedReceiptSha256,
      failedEventSha256:target.failedEventSha256,outputSha256:target.outputSha256,runtime:installed.pointer,oldLogicalReservations:4,oldPhysicalHopCount:null,oldPhysicalHopBound:[4,16]},clock(),lease);
    let checkpoint=null,code=null;const recorder=sourceAttemptRecorder(ctx,{journal,lease,jobId:target.jobId,executionId:target.executionId,
      inputSha256:target.inputSha256,outputSha256:target.outputSha256,runtime:installed.pointer,authoritySha256:receiptSha256,clock,fetchSource:dependencies.fetchSource});
    try {
      await consultResearchSources({...decoded,records:[record]},{deadline:expires,fetchSource:recorder.fetchSource,pdfExtractor:ctx.config.children.pdfExtractor,
        matchFailed:recorder.matchFailed,checkpoint:async(...args)=>{checkpoint=await recorder.checkpoint(...args);},reserve:async request=>{
          const count=(await journal.load()).filter(e=>e.kind==='source_fetch_reserved'&&e.data.jobId===target.jobId).length;
          if(count>=64)throw fault('SUPERVISOR_SOURCE_FETCH_BUDGET_EXHAUSTED');
          await journal.append('source_fetch_reserved',{...request,jobId:target.jobId,executionId:target.executionId,receiptSha256,ordinal:count+1,diagnosticOnly:true},clock(),lease);
        }});
    } catch(error) {code=/^SUPERVISOR_[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:'SUPERVISOR_SOURCE_DIAGNOSTIC_FAILED';}
    const terminalEvents=await journal.load(),attemptReserved=terminalEvents.findLast(e=>e.kind==='source_attempt_reserved'&&e.data.authoritySha256===receiptSha256),
      attemptOutcome=terminalEvents.findLast(e=>e.kind==='source_attempt_outcome'&&e.data.authoritySha256===receiptSha256);
    if(attemptReserved&&!attemptOutcome)return result('uncertain',{code:'SUPERVISOR_SOURCE_DIAGNOSTIC_UNCERTAIN'});
    const diagnostic={schemaVersion:'source-diagnostic-observation/v1',executionId:target.executionId,receiptSha256,sourceId:target.sourceId,
      sourceWorkSha256:receipt.sourceWorkSha256,originalOutputSha256:target.outputSha256,runtime:installed.pointer,
      passed:!!checkpoint,code,attempt:recorder.outcome,excerptMatched:checkpoint?true:code==='SUPERVISOR_SOURCE_ACCESS_BINDING_FAILED'?false:null,checkpoint,
      researchAdmitted:false,blockCleared:false,budgetReset:false,published:false},bytes=jsonBytes(diagnostic),ref={path:`${base}/result.json`,sha256:digest(bytes)};
    await durableWrite(ctx.stateRoot,ref.path,bytes);await journal.append('source_diagnostic_complete',{executionId:target.executionId,receiptSha256,result:ref},clock(),lease);
    return result('complete',{diagnostic,result:ref});
  } finally {await journal.release(lease,clock());}
}
