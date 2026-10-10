import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {confined,readPrivate,openJournal,durableWrite,jsonBytes,digest,fault} from './service-supervisor-store.mjs';
import {loadHenryPlan} from './mhc-priority.mjs';
import {loadJob} from './mhc-v2-store.mjs';
import {reconcileManifestBackedPrefix} from './active-calendar.mjs';
import {buildRollingStudyWorkOrder} from './rolling-study-work-order.mjs';
import {selectProtocolBackfillCandidate,buildProtocolBackfillWorkOrder} from './protocol-backfill-work-order.mjs';
import {ROLES,inspectAutomations,selectEDF,forwardWindow,safeCode} from './service-supervisor-policy.mjs';
import {authenticatedForwardHealth} from './service-supervisor-scope.mjs';
import {defaultJobs} from './service-supervisor.mjs';
import {runDailyWork,latestDailyJob} from './service-supervisor-daily.mjs';
import {runHenryWork,reviewHenryWork,repairHenryWork,prepareHenryDependency,prepareHenryPublication,verifiedHenryContext} from './service-supervisor-henry.mjs';
import {retainExhaustedHenryReviews} from './service-supervisor-debt.mjs';

async function optionalBytes(ctx,relative) {
  try{return await readFile(await confined(ctx.projectRoot,relative,false));}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
export async function dailyOrder(ctx,{plan,appConfig,health,now,historical=false}) {
  const manifest=await readPrivate(ctx.projectRoot,'private-content/private-manifest.json'),prefix=reconcileManifestBackedPrefix({
    privatePlan:await readPrivate(ctx.releaseRoot,'fixtures/pilot-content/plan.json'),activePlan:plan,appConfig,manifestReadingIds:Object.keys(manifest.readings)}),
    protocol=await readPrivate(ctx.releaseRoot,'config/daily-study-protocol.json'),artifacts={};
  for(const entry of plan.entries.filter(e=>historical?manifest.readings[e.readingId]:health.readingIds.includes(e.readingId))) {
    const relative=`private-content/bridge/celebration-y3q4/${entry.readingId}`,metadata=await optionalBytes(ctx,`${relative}.metadata.json`);
    artifacts[entry.readingId]={metadata:metadata?JSON.parse(metadata):null,markdownBytes:await optionalBytes(ctx,`${relative}.md`),
      manifestHasReading:Boolean(manifest.readings[entry.readingId])};
  }
  if(historical) {
    const candidate=selectProtocolBackfillCandidate({plan,appConfig,today:health.effectiveDate,protocol,artifactsByReadingId:artifacts,
      manifestReadingIds:Object.keys(manifest.readings)});
    return buildProtocolBackfillWorkOrder({plan,appConfig,today:health.effectiveDate,protocol,horizonReady:true,candidate,issuedAt:now.toISOString()});
  }
  return buildRollingStudyWorkOrder({plan,privatePlan:prefix.plan,appConfig,protocol,today:health.effectiveDate,issuedAt:now.toISOString(),readingArtifacts:artifacts});
}
async function saveWake(journal,lease,wake,clock) {await journal.append('wake_state',{wake},clock(),lease);}
async function completeHenryReview(ctx,options,dependencies) {
  const shared={...dependencies.henry,clock:dependencies.clock},job=await (dependencies.henryJob||
    (async()=>loadJob(await confined(ctx.projectRoot,`private-content/automation/mhc-v2/${options.readingId}`,false))))();
  let work;
  if(job.state.phase==='editorial_attention')work=await (dependencies.repairHenry||repairHenryWork)(ctx,options,shared);
  if(!work||work.action==='review_handoff')work=await (dependencies.reviewHenry||reviewHenryWork)(ctx,options,shared);
  if(work.action==='editorial_attention') {
    work=await (dependencies.repairHenry||repairHenryWork)(ctx,options,shared);
    if(work.action==='review_handoff')work=await (dependencies.reviewHenry||reviewHenryWork)(ctx,options,shared);
  }
  return work;
}
export async function runStageC(ctx,{role,now=new Date()},dependencies={}) {
  if(!['C','D'].includes(ctx.config.stage)||!ROLES.includes(role))throw fault('SUPERVISOR_ROLE_INVALID');
  const clock=dependencies.clock||(()=>new Date()),journal=await openJournal(ctx.stateRoot,dependencies.journalOptions),events=await journal.load();
  let wake=events.findLast(e=>e.kind==='wake_state'&&e.data.wake.role===role)?.data.wake;
  if(!wake||['complete','checkpointed','blocked'].includes(wake.phase))wake={schemaVersion:'supervisor-wake/v1',id:randomBytes(16).toString('hex'),
    role,sourceRevision:ctx.config.sourceRevision,createdAt:now.toISOString(),deadline:new Date(now.getTime()+90*60*1000).toISOString(),
    maxReadings:ctx.config.maxReadingsPerWake,readingIds:[],completed:[],phase:'working',pending:null,code:null};
  if(wake.sourceRevision!==ctx.config.sourceRevision)throw fault('SUPERVISOR_WAKE_REVISION_CHANGED');
  const deadline=Date.parse(wake.deadline),lease=await journal.acquire(role,{now,durationMs:90*60*1000,runId:wake.id});
  let result,workLease;
  try {
    workLease=await journal.acquire('work',{now,durationMs:90*60*1000,runId:wake.id});
    await saveWake(journal,lease,wake,clock);
    if(deadline-clock().getTime()<=5*60*1000){wake.phase='checkpointed';wake.code='SUPERVISOR_WAKE_DEADLINE';}
    else {
      const inventory=await inspectAutomations(ctx.config.automations,dependencies.automations);
      if(inventory.findings.length)throw fault(inventory.findings[0].code);
      const publications=new Map();for(const event of await journal.load())if(event.kind==='publication_state')publications.set(event.data.transaction.id,event.data.transaction);
      if(wake.pending) {
        if(!wake.pending.transactionId) {
          const request=await readPrivate(ctx.projectRoot,wake.pending.requestPath);
          const recovered=[...publications.values()].findLast(t=>t.sourceRevision===wake.sourceRevision&&t.role===role&&
            t.readingId===request.readingId&&t.component===request.component&&t.approval?.sha256===request.approvalSha256);
          if(recovered)wake.pending.transactionId=recovered.id;
          else return {action:'publish_required',requestPath:wake.pending.requestPath,wakeId:wake.id,role,published:false,runComplete:false};
        }
        const transaction=publications.get(wake.pending.transactionId);
        if(!transaction||transaction.phase!=='complete')throw fault('SUPERVISOR_WAKE_PUBLICATION_PENDING');
        if(transaction.sourceRevision!==wake.sourceRevision||transaction.role!==role)throw fault('SUPERVISOR_WAKE_BINDING_CHANGED');
        if(transaction.kind==='reading') {
          const request=await readPrivate(ctx.projectRoot,wake.pending.requestPath);
          if(transaction.readingId!==request.readingId||transaction.component!==request.component||
            transaction.approval?.sha256!==request.approvalSha256)throw fault('SUPERVISOR_WAKE_BINDING_CHANGED');
          if(!wake.completed.includes(transaction.readingId))wake.completed.push(transaction.readingId);
          wake.completedPublications=[...(wake.completedPublications||[]).filter(p=>p.readingId!==transaction.readingId),
            {readingId:transaction.readingId,transactionId:transaction.id}];
          if(transaction.component==='daily') {
            const job=await latestDailyJob(journal,transaction.readingId);
            if(job&&job.approvalSha256===transaction.approval.sha256)await journal.append('daily_state',
              {job:{...job,phase:'published',publicationTransactionId:transaction.id}},clock(),lease);
          }
        }
        wake.pending=null;
        wake.phase='working';
      }
      const children=new Map();for(const event of await journal.load())if(event.kind==='execution_state')children.set(event.data.execution.id,event.data.execution);
      if([...children.values()].some(e=>['reserved','uncertain'].includes(e.phase)))throw fault('SUPERVISOR_CHILD_DISPATCH_UNCERTAIN');
      if([...children.values()].some(e=>e.phase==='blocked'))throw fault('SUPERVISOR_CHILD_CAPABILITY_BLOCK_RETAINED');
      if([...publications.values()].some(t=>!['complete','blocked'].includes(t.phase)))throw fault('SUPERVISOR_WAKE_PUBLICATION_PENDING');
      if(wake.completed.length>=wake.maxReadings)wake.phase='complete';
      else {
        const {plan,appConfig}=await (dependencies.plan||(()=>loadHenryPlan(ctx.releaseRoot)))(),health=await (dependencies.health||authenticatedForwardHealth)(ctx,clock()),
          binding=dependencies.jobs?null:await (dependencies.henry?.binding||verifiedHenryContext)(ctx);
        if(binding)await binding.runner.withRunnerLock(binding.native,async()=>{
          await binding.service.reviewWorkOrderV2(binding.native,clock());
          await retainExhaustedHenryReviews(ctx,{journal,lease,binding,readingIds:health.readingIds,clock});
        });
        const jobs=await (dependencies.jobs||defaultJobs)(ctx,health,{binding,journal}),selection=selectEDF({plan,appConfig,health,jobs,role,now:clock(),includeReview:true});
        const capability=selection.debts.find(d=>/CONFIG|EXECUTABLE|MODEL_UNAVAILABLE|CLI|HELPER|ROUTE|LOGIN/.test(d.code));
        if(capability)throw fault(capability.code);
        await journal.append('observation',{runId:wake.id,role,stage:ctx.config.stage,inventory,selection,measuredAt:clock().toISOString()},clock(),lease);
        let next=selection.next,order,historicalBinding;
        if(next?.component==='daily') {
          const broken=selection.debts.find(d=>selection.buffer.devotionalGaps.includes(d.readingId)&&
            plan.entries.find(e=>e.readingId===d.readingId)?.dayIndex<=plan.entries.find(e=>e.readingId===next.readingId)?.dayIndex);
          if(broken)throw fault(broken.code);
        }
        if(!next&&selection.forwardComplete&&!selection.debts.length) {
          // Retained review selection reconciles existing native publication
          // receipts. Historical author selection remains its native policy.
          const binding=await (dependencies.henry?.binding||verifiedHenryContext)(ctx);
          const retained=await binding.runner.withRunnerLock(binding.native,()=>binding.service.reviewWorkOrderV2(binding.native,clock()));
          if(retained.readingId&&retained.action!=='none')next={readingId:retained.readingId,component:'henry',action:
            retained.action==='recover_publish'?'recover_publication':'review',historical:true};
          else if(role==='preparation'&&ctx.config.stage==='D') {
            if(binding.service.historicalSelectionBindingVersion!=='historical-selection/v1'||
              typeof binding.service.selectHistoricalAuthorWorkV2!=='function')throw fault('SUPERVISOR_HENRY_HISTORICAL_INTERFACE_REQUIRED');
            const original=await binding.runner.withRunnerLock(binding.native,()=>binding.service.selectHistoricalAuthorWorkV2(binding.native,{},clock()));
            if(original.action==='selected') {
              next={readingId:original.readingId,component:'henry',action:'henry_author',historical:true};historicalBinding=binding;
            } else if(original.action!=='none')throw fault(original.code||'SUPERVISOR_HENRY_HISTORICAL_SELECTION_BLOCKED');
          }
          if(!next&&role==='preparation') {
            order=await (dependencies.order||dailyOrder)(ctx,{plan,appConfig,health,now:clock(),historical:true});
            if(order.action==='refresh_review_publish')next={readingId:order.reading.readingId,component:'daily',action:'daily_author',historical:true};
          }
        }
        if(!next){wake.phase=selection.debts.length?'blocked':'complete';wake.code=selection.debts[0]?.code||null;}
        else {
          if(!wake.readingIds.includes(next.readingId)) {
            if(wake.readingIds.length>=wake.maxReadings){wake.phase='checkpointed';wake.code='SUPERVISOR_WAKE_READING_CAP';}
            else wake.readingIds.push(next.readingId);
          }
          if(wake.phase==='working') {
            await saveWake(journal,lease,wake,clock);
            let work;
            if(next.component==='daily') {
              const retained=await latestDailyJob(journal,next.readingId);
              order=retained?JSON.parse(await readFile(await confined(ctx.projectRoot,retained.workOrder.path,false))):
                order||await (dependencies.order||dailyOrder)(ctx,{plan,appConfig,health,now:clock()});
              if(order.reading?.readingId!==next.readingId)throw fault('SUPERVISOR_DAILY_EDF_ORDER_CHANGED');
              work=await (dependencies.daily||runDailyWork)(ctx,{journal,lease,order,deadline,wakeId:wake.id},{...dependencies.dailyDependencies,clock});
              if(work.action==='henry_dependency_required') {
                const original=await (dependencies.dependency||prepareHenryDependency)(ctx,{journal,lease,order,deadline},{...dependencies.henry,clock});
                if(['review_pending','editorial_attention'].includes(original.state.phase))work=await completeHenryReview(ctx,
                  {journal,lease,readingId:next.readingId,deadline},{...dependencies,clock});
                else if(!['approved','publishing'].includes(original.state.phase))work=await (dependencies.authorHenry||runHenryWork)(ctx,
                  {journal,lease,wakeId:wake.id,readingId:next.readingId,deadline,dailyDependency:original.authorization},{...dependencies.henry,clock});
                if(work?.action==='review_handoff')work=await completeHenryReview(ctx,
                  {journal,lease,readingId:next.readingId,deadline},{...dependencies,clock});
                if(['publish_required','publishing','approved'].includes(work?.action)||['approved','publishing'].includes(original.state.phase))
                  work=await (dependencies.daily||runDailyWork)(ctx,{journal,lease,order,deadline,wakeId:wake.id},{...dependencies.dailyDependencies,clock});
              }
            } else {
              if(next.action==='henry_author')work=await (dependencies.authorHenry||runHenryWork)(ctx,
                {journal,lease,wakeId:wake.id,readingId:next.readingId,deadline,historical:next.historical===true},
                {...dependencies.henry,...(historicalBinding?{binding:async()=>historicalBinding}:{}),clock});
              if(next.action==='review'||work?.action==='review_handoff')work=await completeHenryReview(ctx,
                {journal,lease,readingId:next.readingId,deadline},{...dependencies,clock});
              if(['publish','recover_publication'].includes(next.action)||work?.action==='publish_required')
                work=await (dependencies.henryPublication||prepareHenryPublication)(ctx,{journal,lease,readingId:next.readingId,now:clock()},{...dependencies.henry,clock});
            }
            if(work?.requestPath) {
              wake.phase='handoff';wake.pending={requestPath:work.requestPath,transactionId:null};
              result={action:'publish_required',requestPath:work.requestPath,wakeId:wake.id,role,published:false,runComplete:false};
            } else {wake.phase='checkpointed';wake.code=safeCode(work?.code||work?.job?.blocker?.code||'SUPERVISOR_WORK_CHECKPOINTED');}
          }
        }
      }
    }
    // Detect a saved-definition change during work before preparing publication.
    const finalInventory=await inspectAutomations(ctx.config.automations,dependencies.automations);
    if(finalInventory.findings.length)throw fault(finalInventory.findings[0].code);
    await saveWake(journal,lease,wake,clock);
    return result||{schemaVersion:'supervisor-work-result/v1',role,wakeId:wake.id,action:wake.phase,outcome:wake.phase,
      code:wake.code,published:false,runComplete:true,completedReadingIds:[...wake.completed]};
  } catch(e) {
    wake.phase='blocked';wake.code=safeCode(e.code);await saveWake(journal,lease,wake,clock);
    return {schemaVersion:'supervisor-work-result/v1',role,wakeId:wake.id,action:'blocked',outcome:'blocked',code:wake.code,published:false,runComplete:true};
  } finally {if(workLease)await journal.release(workLease,clock());await journal.release(lease,clock());}
}
export async function verifiedWakePublications(ctx,{wakeId,role}) {
  if(!wakeId)return [];
  const events=await (await openJournal(ctx.stateRoot)).load(),wake=events.findLast(e=>e.kind==='wake_state'&&e.data.wake.id===wakeId)?.data.wake;
  if(!wake||wake.role!==role||wake.sourceRevision!==ctx.config.sourceRevision||wake.phase!=='complete'||wake.code||wake.pending)return [];
  if(!wake.completed?.length||wake.completedPublications?.length!==wake.completed.length||
    new Set(wake.completedPublications.map(p=>p.readingId)).size!==wake.completed.length)return [];
  const publications=new Map();for(const e of events)if(e.kind==='publication_state')publications.set(e.data.transaction.id,e.data.transaction);
  const verified=[];
  for(const completed of wake.completedPublications||[]) {
    const t=publications.get(completed.transactionId);
    if(!wake.completed.includes(completed.readingId)||!t||t.kind!=='reading'||t.phase!=='complete'||t.sourceRevision!==ctx.config.sourceRevision||
      t.role!==role||t.readingId!==completed.readingId||t.code&&t.code!=='SUPERVISOR_HEARTBEAT_NOT_READER_VISIBLE'||!t.health||!t.manifestReadback||!t.candidate||
      !['content','metadata'].every(slot=>t.artifacts?.some(a=>a.slot===slot&&a.readback)))return [];
    const bytes=async ref=>{
      if(!ref.path?.startsWith(`publications/${t.id}/`))throw fault('SUPERVISOR_WAKE_PROOF_CHANGED');
      const raw=await readFile(await confined(ctx.stateRoot,ref.path,false));
      if(digest(raw)!==ref.sha256)throw fault('SUPERVISOR_WAKE_PROOF_CHANGED');return raw;
    };
    const health=JSON.parse(await bytes(t.health));
    if(health.named?.readingId!==t.readingId||health.named.status!=='ready'||
      (t.component==='henry'||t.approvalAuthority?.henry)&&health.named.henryLayerStatus!=='complete')throw fault('SUPERVISOR_WAKE_PROOF_CHANGED');
    if(digest(await bytes(t.manifestReadback))!==digest(await bytes(t.candidate)))throw fault('SUPERVISOR_WAKE_PROOF_CHANGED');
    for(const a of t.artifacts)if(['content','metadata'].includes(a.slot)) {
      if(digest(await bytes(a.readback))!==a.sha256||digest(await bytes({path:a.snapshot,sha256:a.sha256}))!==a.sha256)
        throw fault('SUPERVISOR_WAKE_PROOF_CHANGED');
    }
    const receipt=await readPrivate(ctx.stateRoot,`publications/${t.id}/publication-receipt.json`);
    if(receipt.status!=='published_verified'||receipt.transactionId!==t.id||receipt.readingId!==t.readingId||
      receipt.healthSha256!==t.health.sha256||receipt.metadataReadback!=='exact_bytes'||receipt.manifestReadback!=='exact_bytes'||
      receipt.liveReadingStatus!=='ready'||receipt.payloadSha256!==t.artifacts.find(a=>a.slot==='metadata').sha256)throw fault('SUPERVISOR_WAKE_PROOF_CHANGED');
    verified.push(t.readingId);
  }
  return verified;
}
export async function bindWakePublication(ctx,wakeId,transactionId,now=new Date()) {
  const journal=await openJournal(ctx.stateRoot),wake=(await journal.load()).findLast(e=>e.kind==='wake_state'&&e.data.wake.id===wakeId)?.data.wake;
  if(!wake||wake.phase!=='handoff'||wake.pending.transactionId&&wake.pending.transactionId!==transactionId)throw fault('SUPERVISOR_WAKE_BINDING_CHANGED');
  const lease=await journal.acquire(wake.role,{now,runId:wake.id});
  try{wake.pending.transactionId=transactionId;await journal.append('wake_state',{wake},now,lease);}finally{await journal.release(lease,now);}
}
