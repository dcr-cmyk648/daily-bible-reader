import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {openJournal,confined,durableWrite,digest,jsonBytes,readPrivate,fault} from './service-supervisor-store.mjs';
import {assertNoWriters,verifyRuntime} from './service-supervisor-runtime.mjs';
import {assertSchemaValid} from './schema-validator.mjs';
import {checkedThreadIdentity,analyzeChildEvents} from './service-supervisor-exec.mjs';
import {decodeResearch,admitResearch,assertChildPrivacy,researchContract} from './service-supervisor-contracts.mjs';
import {dailyFoundation,dailyResearchPacket,admitDailyOrder,latestDailyJob} from './service-supervisor-daily.mjs';
import {consultResearchSources} from './service-supervisor-source-fetch.mjs';
import {sourceAttemptRecorder} from './service-supervisor-source-journal.mjs';

const incident={jobId:'e1e14cd7fff6655f15cf4991db575d1b',executionId:'af1469b581e29f1ac8850dc2509a4a4f',
  threadId:'01a127d0-c8fa-7ed2-8932-d0968ce870d1',readingId:'LTP-0028-GEN-016',
  blockedEventSha256:'f3ed84907f1f4c0ba927b40f82f3f7a9185a97cdda2b767a39d339cf9ad1add5',
  outputSha256:'b8f897b3cd83f02fe76c1bf5cd67c9a64b933e4711766dd68ef62afc2906ec5d',
  inputSha256:'90771784f80e5c3beb436ad156ae89ef81dbfad9c313c1752d909fdb3222bb42'};
async function bytes(root,ref) {
  const raw=await readFile(await confined(root,ref.path,false));if(digest(raw)!==ref.sha256)throw fault('SUPERVISOR_RESEARCH_REVALIDATION_BASIS_CHANGED');return raw;
}
const result=(outcome,id,extra={})=>({schemaVersion:'genesis16-research-revalidation-result/v1',outcome,executionId:id,dispatched:false,budgetReset:false,...extra});
export async function revalidateGenesis16Research(ctx,{receiptPath,clock=()=>new Date()},dependencies={}) {
  // The CLI has no incident/dependency override. Fabricated unit fixtures inject
  // their complete incident and transport; production is bound to these constants.
  const target=dependencies.incident||incident;
  if(ctx.config.stage!=='C'||ctx.config.maxReadingsPerWake!==1||ctx.config.children?.sourceAccessMode!=='code_consultation')
    throw fault('SUPERVISOR_RESEARCH_REVALIDATION_MODE_REQUIRED');
  if(!receiptPath.replaceAll('\\','/').startsWith('private-content/automation/service-supervisor/'))throw fault('SUPERVISOR_RESEARCH_REVALIDATION_RECEIPT_INVALID');
  const rawReceipt=await readFile(await confined(ctx.projectRoot,receiptPath,false)),receipt=JSON.parse(rawReceipt),receiptSha256=digest(rawReceipt);
  assertSchemaValid(receipt,await readPrivate(ctx.releaseRoot,'schemas/genesis16-research-revalidation.schema.json'));assertChildPrivacy(receipt);
  if(['jobId','executionId','threadId','blockedEventSha256','outputSha256','inputSha256'].some(k=>receipt[k]!==target[k]))
    throw fault('SUPERVISOR_RESEARCH_REVALIDATION_RECEIPT_INVALID');
  await assertNoWriters(ctx.projectRoot,ctx.stateRoot,{now:clock()});
  const journal=await openJournal(ctx.stateRoot),lease=await journal.acquire('installation',{now:clock()});
  try {
    let events=await journal.load();const prior=events.find(e=>e.kind==='research_revalidation_reserved');
    if(prior&&prior.data.receiptSha256!==receiptSha256)throw fault('SUPERVISOR_RESEARCH_REVALIDATION_ALREADY_USED');
    if(events.some(e=>e.kind==='research_revalidation_failed'))return result('already_failed',target.executionId);
    const completed=events.find(e=>e.kind==='research_revalidation_complete');
    if(completed) {
      const proof=JSON.parse(await bytes(ctx.stateRoot,completed.data.proof));await bytes(ctx.stateRoot,proof.admission);await bytes(ctx.stateRoot,proof.receipt);
      await bytes(ctx.stateRoot,{path:`executions/${target.executionId}/output.json`,sha256:target.outputSha256});
      for(const [name,sha256]of [['packet.json',target.inputSha256],['schema.json',proof.schemaSha256],['events.jsonl',proof.eventLogSha256],['thread-identity.json',proof.identitySha256]])
        await bytes(ctx.stateRoot,{path:`executions/${target.executionId}/${name}`,sha256});
      return result('already_accepted',target.executionId,{proofSha256:completed.data.proof.sha256});
    }
    const installed=await (dependencies.runtime||(async()=>verifyRuntime(ctx.runtimeRoot,await readFile(await confined(ctx.runtimeRoot,'launcher.mjs',false)))))();
    if(installed.releaseRoot!==ctx.releaseRoot||!isDeepStrictEqual(installed.config,ctx.config)||
      ['sourceRevision','manifestSha256','configSha256'].some(k=>receipt[k]!==installed.pointer[k]))throw fault('SUPERVISOR_RESEARCH_REVALIDATION_BASIS_CHANGED');
    const executionEvents=events.filter(e=>e.kind==='execution_state'&&e.data.execution.id===target.executionId),blocked=executionEvents[1],original=blocked?.data.execution;
    if(!original||blocked.sha256!==target.blockedEventSha256||executionEvents[0]?.data.execution.phase!=='reserved'||
      original.phase!=='blocked'||original.code!=='SUPERVISOR_CHILD_SOURCE_ACCESS_UNVERIFIABLE'||original.ordinal!==1||original.kind!=='daily-research'||
      original.jobId!==target.jobId||original.readingId!==target.readingId||original.threadId!==target.threadId||original.inputSha256!==target.inputSha256||
      executionEvents.length>3||events.some(e=>e.kind==='execution_state'&&e.data.execution.jobId===target.jobId&&e.data.execution.kind==='daily-research'&&e.data.execution.id!==target.executionId))
      throw fault('SUPERVISOR_RESEARCH_REVALIDATION_INELIGIBLE');
    const job=await latestDailyJob(journal,target.readingId),jobEvent=events.findLast(e=>e.kind==='daily_state'&&e.data.job.id===target.jobId);
    if(job?.id!==target.jobId)throw fault('SUPERVISOR_RESEARCH_REVALIDATION_INELIGIBLE');
    const base=`executions/${target.executionId}`,proofPath=`research-revalidation/${receiptSha256}/proof.json`;
    let stored;try{stored=await readPrivate(ctx.stateRoot,proofPath);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(!stored&&prior)throw fault('SUPERVISOR_RESEARCH_REVALIDATION_UNCERTAIN');
    if(!stored&&(job?.id!==target.jobId||job.phase!=='blocked'||job.blocker?.code!=='SUPERVISOR_CHILD_SOURCE_ACCESS_UNVERIFIABLE'||
      ['research','draft','authorSessionId','approvalPath'].some(k=>job[k]!==null)||!job.baseRegistry))throw fault('SUPERVISOR_RESEARCH_REVALIDATION_INELIGIBLE');
    const eventBytes=await bytes(ctx.stateRoot,original.eventLog),identityBytes=await bytes(ctx.stateRoot,original.threadIdentity),
      identity=checkedThreadIdentity(eventBytes.toString(),{redacted:true}),threadProof=JSON.parse(identityBytes);
    if(identity?.threadId!==target.threadId||threadProof.threadId!==target.threadId||threadProof.rawEventsSha256!==original.eventsSha256)
      throw fault('SUPERVISOR_RESEARCH_REVALIDATION_BASIS_CHANGED');
    // Redacted actual telemetry proves turn/tool completion only, never a URL,
    // status or body that the retained log does not contain.
    const discovery=analyzeChildEvents(eventBytes.toString(),{kind:'daily-research',sourceAccessMode:'code_consultation',redacted:true});
    const outputBytes=await readFile(await confined(ctx.stateRoot,`${base}/output.json`,false)),packetBytes=await readFile(await confined(ctx.stateRoot,`${base}/packet.json`,false)),
      output=JSON.parse(outputBytes),packet=JSON.parse(packetBytes),schemaBytes=await readFile(await confined(ctx.stateRoot,`${base}/schema.json`,false));
    if(digest(outputBytes)!==target.outputSha256||digest(packetBytes)!==target.inputSha256||output.inputSha256!==target.inputSha256)
      throw fault('SUPERVISOR_RESEARCH_REVALIDATION_BASIS_CHANGED');
    assertSchemaValid(output,JSON.parse(schemaBytes));assertChildPrivacy(output);
    const sourceSchema=await readPrivate(ctx.releaseRoot,'schemas/source.schema.json');
    if(!isDeepStrictEqual(JSON.parse(schemaBytes),researchContract(packet,sourceSchema)))throw fault('SUPERVISOR_RESEARCH_REVALIDATION_BASIS_CHANGED');
    const decoded=decodeResearch(output,{packet,sourceSchema});
    if(!stored) {
      const issued=Date.parse(receipt.issuedAt),expires=Date.parse(receipt.expiresAt),now=clock().getTime();
      if(!Number.isFinite(issued)||issued>now||expires<=now||expires-issued>15*60*1000)throw fault('SUPERVISOR_RESEARCH_REVALIDATION_EXPIRED');
      const order=JSON.parse(await bytes(ctx.projectRoot,job.workOrder)),registry=JSON.parse(await bytes(ctx.projectRoot,job.baseRegistry)),{entry}=await admitDailyOrder(ctx,order,clock(),dependencies),
        foundation=await (dependencies.foundation||dailyFoundation)(ctx,entry,new Date(job.createdAt));
      if(!foundation||!isDeepStrictEqual(JSON.parse(jsonBytes({...foundation,sourceEvidence:undefined})),packet.foundation)||entry.readingId!==target.readingId)
        throw fault('SUPERVISOR_RESEARCH_REVALIDATION_BASIS_CHANGED');
      const correctedPacket=await dailyResearchPacket(ctx,{entry,order,job,priorRegistry:registry,foundation}),correctedInputSha256=digest(jsonBytes(correctedPacket));
      const receiptRef={path:`research-revalidation/${receiptSha256}/manager-receipt.json`,sha256:receiptSha256};await durableWrite(ctx.stateRoot,receiptRef.path,rawReceipt);
      await journal.append('research_revalidation_reserved',{executionId:target.executionId,receiptSha256,receipt:receiptRef,blockedJobEventSha256:jobEvent.sha256},clock(),lease);
      try {
        const recorder=sourceAttemptRecorder(ctx,{journal,lease,jobId:target.jobId,executionId:target.executionId,inputSha256:target.inputSha256,outputSha256:target.outputSha256,
          runtime:installed.pointer,authoritySha256:receiptSha256,clock,fetchSource:dependencies.fetchSource}),
          sourceEvidence=await consultResearchSources(decoded,{foundation,deadline:expires,mappings:receipt.mappings,fetchSource:recorder.fetchSource,
          checkpoint:recorder.checkpoint,matchFailed:recorder.matchFailed,
          pdfExtractor:ctx.config.children.pdfExtractor,
          reserve:async request=>{
            const reservations=(await journal.load()).filter(e=>e.kind==='source_fetch_reserved'&&e.data.jobId===target.jobId);
            if(reservations.length>=64)throw fault('SUPERVISOR_SOURCE_FETCH_BUDGET_EXHAUSTED');
            await journal.append('source_fetch_reserved',{...request,jobId:target.jobId,readingId:target.readingId,executionId:target.executionId,
              receiptSha256,ordinal:reservations.length+1},clock(),lease);
          }}),admission=admitResearch(decoded,{packet,sourceSchema,sourceEvidence,decoded:true}),admissionBytes=jsonBytes(admission),
          admissionRef={path:`research-revalidation/${receiptSha256}/admission.json`,sha256:digest(admissionBytes)};
        if(!admission.evidence.some(e=>e.sourceId===foundation.sourceId))throw fault('SUPERVISOR_DAILY_HENRY_FOUNDATION_MISSING');
        await durableWrite(ctx.stateRoot,admissionRef.path,admissionBytes);
        stored={schemaVersion:'genesis16-research-revalidation-proof/v1',executionId:target.executionId,original,blockedExecutionEventSha256:blocked.sha256,
          blockedJobEventSha256:jobEvent.sha256,originalJob:job,receipt:receiptRef,outputSha256:target.outputSha256,inputSha256:target.inputSha256,
          schemaSha256:digest(schemaBytes),eventLogSha256:digest(eventBytes),identitySha256:digest(identityBytes),runtime:installed.pointer,
          correctedInputSha256,admission:admissionRef,completedWebDiscoveryItems:discovery.webOperations,
          cliOpenProofClaimed:false,originalResponseChanged:false,consumedOrdinal:1,budgetReset:false};
        await durableWrite(ctx.stateRoot,proofPath,jsonBytes(stored));
      } catch(e) {
        await journal.append('research_revalidation_failed',{executionId:target.executionId,receiptSha256,code:e.code||'SUPERVISOR_RESEARCH_REVALIDATION_FAILED'},clock(),lease);throw e;
      }
    }
    const proofBytes=await readFile(await confined(ctx.stateRoot,proofPath,false)),proof={path:proofPath,sha256:digest(proofBytes)};
    if(stored.receipt.sha256!==receiptSha256||stored.executionId!==target.executionId||stored.outputSha256!==target.outputSha256||
      !isDeepStrictEqual(stored.runtime,installed.pointer)||stored.eventLogSha256!==digest(eventBytes)||stored.identitySha256!==digest(identityBytes)||
      stored.schemaSha256!==digest(schemaBytes))throw fault('SUPERVISOR_RESEARCH_REVALIDATION_BASIS_CHANGED');
    await bytes(ctx.stateRoot,stored.admission);await bytes(ctx.stateRoot,stored.receipt);
    events=await journal.load();const latestExecution=events.findLast(e=>e.kind==='execution_state'&&e.data.execution.id===target.executionId)?.data.execution;
    if(latestExecution.phase==='blocked') {
      const {code,...retained}=original,accepted={...retained,phase:'accepted',output:{path:`${base}/output.json`,sha256:target.outputSha256},admission:stored.admission,
        revalidation:{...proof,inputSha256:stored.correctedInputSha256}};
      await journal.append('execution_state',{execution:accepted},clock(),lease);
    } else if(latestExecution.phase!=='accepted'||latestExecution.revalidation?.sha256!==proof.sha256)throw fault('SUPERVISOR_RESEARCH_REVALIDATION_BASIS_CHANGED');
    const currentJobEvent=(await journal.load()).findLast(e=>e.kind==='daily_state'&&e.data.job.id===target.jobId);
    if(currentJobEvent.sha256===stored.blockedJobEventSha256) {
      const recovered={...stored.originalJob,phase:'queued',blocker:null,researchRevalidation:proof};
      assertSchemaValid(recovered,await readPrivate(ctx.releaseRoot,'schemas/service-supervisor-daily-state.schema.json'));
      await journal.append('daily_state',{job:recovered},clock(),lease);
    } else if(currentJobEvent.data.job.researchRevalidation?.sha256!==proof.sha256)
      throw fault('SUPERVISOR_RESEARCH_REVALIDATION_BASIS_CHANGED');
    await journal.append('research_revalidation_complete',{executionId:target.executionId,receiptSha256,proof},clock(),lease);
    return result('accepted',target.executionId,{proofSha256:proof.sha256,originalOrdinal:1});
  } finally {await journal.release(lease,clock());}
}
