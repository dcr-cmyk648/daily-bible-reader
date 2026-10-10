import {readFile,readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {VERSION,MODELS,MAX_SUBMISSIONS,REVIEW_ASSERTIONS,candidateSchema,passageScope,compileReading,validateCandidate,chapterRuntime,digestObject} from './mhc-v2.mjs';
import {appendState,atomicJson,bytesFor,confined,createJob,initialJobState,loadJob,maybeJson,readJson} from './mhc-v2-store.mjs';
import {loadHenryPlan,henryPriorityWindow,hasHenryPublicationReceipt,pendingHenryHandoffs} from './mhc-priority.mjs';
import {selectMhcBackfillCandidate,isVerifiedHenryFallback} from './mhc-backfill-work-order.mjs';
import {latestDetroitSparkSlot} from './mhc-native-state.mjs';
import {scheduleDateForEntry} from './mhc-native-worker.mjs';
import {sha256,normalizedBatchHash,normalizeBookChapter,readSwordModule,findSourceReportingPhrase,validateSourceCopyRisk} from './mhc-pipeline.mjs';
import {assertSchemaValid} from './schema-validator.mjs';
import {applyNativeTransaction} from './mhc-native-transaction.mjs';
import {finalizeReviewedLibrary} from './mhc-reviewed-library-finalize.mjs';
import {sparkModelUnavailable} from './mhc-v2-model-errors.mjs';
import {configuredModels,jobModels} from './mhc-v2-author-config.mjs';
import {stageAuthorBlock} from './mhc-v2-author-status.mjs';
import {openJournal} from './service-supervisor-store.mjs';
import {measuredBuffer} from './service-supervisor-policy.mjs';

const HOUR=60*60*1000;
const chapterKey=c=>`${c.book_id}.${c.chapter}`;
const artifactKey=(packet,lane)=>`${packet.packet_id}:${lane}`;
const validReading=id=>/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(String(id||''));
const clone=value=>structuredClone(value);
export const historicalSelectionBindingVersion='historical-selection/v1';
const historicalReferences=new WeakMap(),HISTORICAL_REFERENCE_MS=5*60*1000;
async function historicalForwardHealth(ctx,now) {
  const {authenticatedForwardHealth}=await import('./service-supervisor-scope.mjs');
  return authenticatedForwardHealth(ctx,now);
}
const command=(ctx,args)=>{const argv=[process.execPath,ctx.launcher,...args];return {argv,command:process.platform==='win32'?'& '+argv.map(v=>`'${v.replaceAll("'","''")}'`).join(' '):argv.map(v=>`'${v.replaceAll("'","'\\''")}'`).join(' ')};};

export async function serviceContext(ctx) {
  const {plan,appConfig}=await loadHenryPlan(ctx.releaseRoot);
  const privateRoot=path.join(ctx.projectRoot,'private-content'),mhcRoot=path.join(ctx.projectRoot,'private-commentary/mhc');
  const jobRoot=await confined(ctx.projectRoot,'private-content/automation/mhc-v2');
  await mkdir(jobRoot,{recursive:true,mode:0o700});
  return {...ctx,privateRoot,mhcRoot,jobRoot,plan,appConfig};
}

export async function sourceInput(ctx,entry) {
  try {
  const sourceManifest=await readJson(await confined(ctx.mhcRoot,'source-manifest.json',{missing:false}));
  const chapters=[];let decoded;
  for(const p of entry.passages) {
    let units;
    passageScope(p);
    const stem=`normalized/${p.bookId}/${String(p.chapter).padStart(3,'0')}`;
    try {
      const normalizedFile=await confined(ctx.mhcRoot,`${stem}.jsonl`,{missing:false});
      units=(await readFile(normalizedFile,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
      const manifest=await readJson(await confined(ctx.mhcRoot,`${stem}.manifest.json`,{missing:false}));
      if(manifest.source_archive_sha256!==sourceManifest.archive_sha256||manifest.book_id!==p.bookId||manifest.chapter!==p.chapter||manifest.normalized_batch_sha256!==normalizedBatchHash(units))throw new Error('V2_NORMALIZED_SOURCE_MISMATCH');
      passageScope(p,manifest.indexed_verse_count);
      if(units.length&&units.every(u=>['mhc-normalized-source/v1','mhc-normalized-source/v2'].includes(u.schema_version)))throw Object.assign(new Error('V2_LEGACY_NORMALIZATION'),{code:'V2_LEGACY_NORMALIZATION'});
    } catch(error) {
      if(!['ENOENT','V2_LEGACY_NORMALIZATION'].includes(error.code))throw error;
      // Deterministic local normalization, never a network acquisition or model
      // call. The eligible reading was selected before accessing its source.
      const raw=await confined(ctx.projectRoot,'research/raw/matthew-henry/crosswire',{missing:false});
      const archive=await readFile(await confined(raw,'MHC-2.2.zip',{missing:false}));
      if(sha256(archive)!==sourceManifest.archive_sha256)throw new Error('V2_SOURCE_ARCHIVE_MISMATCH');
      if(!decoded){const extracted=await confined(raw,'MHC-2.2',{missing:false}),moduleRoot=await confined(extracted,'modules/comments/zcom4/mhc',{missing:false});for(const name of ['ot.bzs','ot.bzv','ot.bzz','nt.bzs','nt.bzv','nt.bzz','mhc.conf']){const file=await confined(extracted,name==='mhc.conf'?'mods.d/mhc.conf':`modules/comments/zcom4/mhc/${name}`,{missing:false});if(sha256(await readFile(file))!==sourceManifest.module_file_sha256?.[name])throw new Error('V2_SOURCE_MODULE_MISMATCH');}decoded=await readSwordModule(moduleRoot);}
      const normalized=normalizeBookChapter({decodedModule:decoded,sourceManifest,bookId:p.bookId,chapter:p.chapter,includeBookIntro:false});
      passageScope(p,normalized.chapterIndex.verseEntries.length);
      units=normalized.units;
    }
    const sourceSchema=await readJson(path.join(ctx.releaseRoot,'schemas/mhc-normalized-source.schema.json'));
    for(const unit of units){assertSchemaValid(unit,sourceSchema,{label:'V2 normalized source'});if(unit.provenance.archive_sha256!==sourceManifest.archive_sha256||sha256(unit.source_text)!==unit.source_text_sha256)throw new Error('V2_NORMALIZED_PROVENANCE_MISMATCH');}
    chapters.push({bookId:p.bookId,chapter:p.chapter,units:units.filter(u=>u.unit_type==='verse_range')});
  }
  return {sourceManifest,chapters,input:compileReading({entry,planVersion:ctx.plan.planVersion,scheduleDate:scheduleDateForEntry(ctx.appConfig,entry),sourceManifest,chapters})};
  } catch(error){error.readingId=entry.readingId;error.stage='source';throw error;}
}

async function allJobs(ctx,{readOnly=false}={}) {
  const names=await readdir(ctx.jobRoot,{withFileTypes:true}),jobs=[];
  for(const d of names){
    if(!d.isDirectory()||d.isSymbolicLink()||!validReading(d.name))throw new Error('V2_JOB_DIRECTORY_INVALID');
    const directory=await confined(ctx.jobRoot,d.name,{missing:false});
    const input=await maybeJson(await confined(directory,'input.json'));
    if(!input){if((await readdir(directory)).some(n=>!/^input\.json\.tmp-[a-f0-9]+$/.test(n)))throw new Error('V2_PARTIAL_JOB_INVALID');continue;}
    if(readOnly){
      const events=await readdir(await confined(directory,'events')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
      if(events===null){const {input_sha256,...basis}=input;if(digestObject(basis)!==input_sha256)throw new Error('V2_INPUT_HASH_MISMATCH');jobs.push({directory,input,state:null});continue;}
    } else await mkdir(await confined(directory,'events'),{recursive:true,mode:0o700});
    jobs.push(await loadJob(directory));
  }
  return jobs;
}
async function checkedJob(ctx,id) {
  if(!validReading(id))throw new Error('V2_READING_ID_INVALID');
  const job=await loadJob(await confined(ctx.jobRoot,id,{missing:false}));
  const entry=ctx.plan.entries.find(e=>e.readingId===id);
  if(!entry||job.input.plan_version!==ctx.plan.planVersion)throw new Error('V2_PLAN_CHANGED');
  const sources=await sourceInput(ctx,entry);
  if(job.input.input_sha256!==sources.input.input_sha256)throw new Error('V2_SOURCE_CHANGED');
  return {job,entry,sources};
}
function nextBatch(job) {
  for(const chapter of job.input.chapters){const lane=job.state.owners[chapterKey(chapter)];for(const packet of chapter.batches){const key=artifactKey(packet,lane);if(!job.state.accepted[key])return {chapter,packet,lane,key};}}
  return null;
}
function editorialTarget(job){
  const chapter=job.input.chapters.find(c=>c.batches.some(p=>p.packet_id===job.state.blocker?.packet_id));
  if(!chapter)throw new Error('V2_EDITORIAL_PACKET_MISSING');
  const packet=chapter.batches.find(p=>p.packet_id===job.state.blocker.packet_id),lane=job.state.owners[chapterKey(chapter)],key=artifactKey(packet,lane);
  const hash=job.state.blocker.candidate_sha256||job.state.rejected[key]?.at(-1);
  if(!hash)throw new Error('V2_EDITORIAL_BASIS_MISSING');
  return {chapter,packet,lane,key,hash};
}
function report(ctx,job,extra={}) {
  const batch=nextBatch(job),total=job.input.chapters.reduce((n,c)=>n+c.batches.length,0),complete=job.input.chapters.reduce((n,c)=>n+c.batches.filter(p=>job.state.accepted[artifactKey(p,job.state.owners[chapterKey(c)])]).length,0);
  return {pipeline:VERSION,lane:'henry_backfill',readingId:job.input.reading_id,scheduleDate:job.input.schedule_date,state:job.state.phase,action:'none',published:job.state.phase==='published',validatedBatches:complete,totalBatches:total,totalSubmissions:job.state.total_submissions,code:job.state.blocker?.code||null,...(batch?{requiredModel:jobModels(job)[batch.lane]}:{}),...extra};
}

async function selection(ctx,jobs,now) {
  const manifest=await readJson(await confined(ctx.privateRoot,'private-manifest.json',{missing:false}));
  const pending=await pendingHenryHandoffs({privateRoot:ctx.privateRoot,plan:ctx.plan,manifest,handoffSchema:await readJson(path.join(ctx.releaseRoot,'schemas/mhc-native-review-handoff.schema.json'))});
  for(const job of jobs)pending.add(job.input.reading_id);
  const metadata=new Map();
  for(const entry of ctx.plan.entries.filter(e=>manifest.readings?.[e.readingId]))metadata.set(entry.readingId,await maybeJson(await confined(ctx.privateRoot,`bridge/celebration-y3q4/${entry.readingId}.metadata.json`)));
  const attemptState=await maybeJson(await confined(ctx.privateRoot,'automation/mhc-backfill-attempt-state.json'));
  return selectMhcBackfillCandidate({plan:ctx.plan,appConfig:ctx.appConfig,metadataByReadingId:metadata,manifestReadingIds:Object.keys(manifest.readings||{}),pendingReadingIds:pending,attemptState,now});
}

// Explicit operator recovery only: migrate today's failed v1 contract once,
// preserving the exact legacy attempt and all v2 budgets. Scheduled selection
// never calls this function and still observes every shared cooldown.
export async function migrateCurrentV2(ctx,readingId,attemptSha256,reason,now=new Date()) {
  if(!validReading(readingId)||!/^[a-f0-9]{64}$/.test(String(attemptSha256))||typeof reason!=='string'||reason.trim().length<20||reason.length>1000)throw new Error('V2_MIGRATION_ARGUMENTS');
  const entry=ctx.plan.entries.find(e=>e.readingId===readingId),window=henryPriorityWindow(ctx.appConfig,now);
  const manifest=await readJson(await confined(ctx.privateRoot,'private-manifest.json',{missing:false}));
  if(!entry||entry.kind!=='chapter'||entry.dayIndex!==window.currentDay||!manifest.readings?.[readingId])throw new Error('V2_MIGRATION_CURRENT_PUBLISHED_ONLY');
  const bytes=await readFile(await confined(ctx.privateRoot,'automation/mhc-backfill-attempt-state.json',{missing:false}));
  if(sha256(bytes)!==attemptSha256)throw new Error('V2_MIGRATION_ATTEMPT_CHANGED');
  const attempts=JSON.parse(bytes),attempt=attempts.attempts?.[readingId];
  if(attempts.planVersion!==ctx.plan.planVersion||attempt?.outcome!=='model_failure'||attempt.code!=='NATIVE_CANDIDATE_UNRESOLVED'||!Number.isFinite(Date.parse(attempt.attemptedAt)))throw new Error('V2_MIGRATION_LEGACY_FAILURE_REQUIRED');
  const jobs=await allJobs(ctx),existing=jobs.find(j=>j.input.reading_id===readingId);
  if(existing)return report(ctx,existing,{action:'migration_already_exists'});
  if(jobs.some(j=>j.state?.phase==='generating'))throw new Error('V2_MIGRATION_AUTHOR_ACTIVE');
  const metadata=await readJson(await confined(ctx.privateRoot,`bridge/celebration-y3q4/${readingId}.metadata.json`,{missing:false}));
  const pending=await pendingHenryHandoffs({privateRoot:ctx.privateRoot,plan:ctx.plan,manifest,handoffSchema:await readJson(path.join(ctx.releaseRoot,'schemas/mhc-native-review-handoff.schema.json'))});
  if(metadata.readingId!==readingId||!isVerifiedHenryFallback(metadata.henrySourceLink)||pending.has(readingId))throw new Error('V2_MIGRATION_REVIEW_OR_CONTENT_EXISTS');
  const sources=await sourceInput(ctx,entry);
  const authorization={kind:'explicit_current_v1_migration',reading_id:readingId,reason:reason.trim(),legacy_attempt_sha256:attemptSha256,legacy_attempt:attempt,authorized_at:new Date(now).toISOString()};
  // Persist the authorization before creating the job, so even an interruption
  // between its first event and the migration event leaves the recovery basis.
  const auditPath=`migration-authorizations/${readingId}.json`;
  const prior=await maybeJson(await confined(ctx.privateRoot,auditPath));
  if(prior&&(prior.legacy_attempt_sha256!==attemptSha256||prior.reason!==authorization.reason))throw new Error('V2_MIGRATION_AUTHORIZATION_CHANGED');
  await atomicJson(ctx.privateRoot,auditPath,prior||authorization,{immutable:true});
  let job=await createJob(ctx.jobRoot,sources.input,now);
  job=await appendState(job,'explicit_legacy_migration',{...job.state,phase:'queued',history:[...job.state.history,prior||authorization]},now);
  return report(ctx,job,{action:'migration_queued'});
}

async function beginSession(ctx,job,lane,now) {
  const state=clone(job.state),slot=latestDetroitSparkSlot(now),id=`${lane}:${slot}`;
  if(!state.lease)state.lease={id,started_at:new Date(now).toISOString(),expires_at:new Date(new Date(now).getTime()+24*HOUR).toISOString(),transport_checkpoints:0};
  if(state.session?.id===id)return job; // Restart does not replenish time/budget.
  if(state.session&&Date.parse(state.session.deadline_at)>new Date(now).getTime())throw new Error('V2_SESSION_ALREADY_ACTIVE');
  state.session=state.sessions[id]||{id,lane,started_at:new Date(now).toISOString(),deadline_at:new Date(new Date(now).getTime()+HOUR).toISOString(),submissions:0,runtime_revision:ctx.config.source_revision??null,runtime_manifest_sha256:ctx.manifestSha256??null};
  state.sessions[id]=state.session;
  return appendState(job,'session_started',state,now);
}

async function authorPacket(ctx,job,now) {
  const next=nextBatch(job);
  if(!next){const state={...job.state,phase:'review_pending',blocker:null,lease:{...job.state.lease,released:true}};job=await appendState(job,'generation_complete',state,now);return report(ctx,job,{action:'review_handoff'});}
  if(next.lane!==job.state.session?.lane){job=await appendState(job,'chapter_model_handoff',{...job.state,session:null},now);return report(ctx,job,{action:'checkpointed',code:'V2_AWAITING_CHAPTER_OWNER'});}
  const budgetExpired=new Date(now).getTime()>=Date.parse(job.state.session?.deadline_at)||job.state.session?.submissions>=32;
  const {packet,lane,key}=next,relative=`author/${packet.packet_id}/${lane}`;
  await atomicJson(job.directory,`${relative}/source-view.json`,packet,{immutable:true});
  await atomicJson(job.directory,`${relative}/candidate.schema.json`,candidateSchema,{immutable:true});
  const instructions=await readFile(path.join(ctx.releaseRoot,'prompts/mhc-v2-author.md'),'utf8');
  // Instructions are an immutable JSON string, so the same confined writer is
  // used for all private artifacts. No shell interpolation of source prose.
  const instructionsPath=await atomicJson(job.directory,`${relative}/instructions-${jobModels(job)[lane]}.json`,{model:jobModels(job)[lane],reasoning_effort:lane==='spark'?'medium':'low',instructions},{immutable:true});
  const cmd=command(ctx,['advance','--reading',job.input.reading_id,'--session',job.state.session.id]);
  return report(ctx,job,{action:budgetExpired?'checkpointed':(job.state.rejected[key]||[]).length?'repair_candidate':'author_candidate',...(budgetExpired?{code:'V2_WAKE_BUDGET'}:{}),candidatePath:await confined(job.directory,`${relative}/candidate.json`),sourcePath:await confined(job.directory,`${relative}/source-view.json`),schemaPath:await confined(job.directory,`${relative}/candidate.schema.json`),instructionsPath,validationPath:await confined(job.directory,`${relative}/validation.json`),deadlineAt:job.state.session.deadline_at,submissionsRemaining:MAX_SUBMISSIONS-(job.state.rejected[key]||[]).length,advanceCommand:cmd.command,advanceArgv:cmd.argv});
}

// Compute the same housekeeping transitions without writing them. Exact-reading
// selection must reject a mismatch before even an unrelated expiry/rebind event.
function authorMaintenance(ctx,job,now) {
  const transitions=[];let state=job.state;
  const desired=configuredModels(ctx);
  if(jobModels(job).spark!==desired.spark&&state.total_submissions===0&&!state.pending_attempt&&Object.keys(state.accepted).length===0&&['queued','blocked','generating','fallback_pending'].includes(state.phase)&&!(state.phase==='generating'&&Date.parse(state.session?.deadline_at)>new Date(now).getTime())){
    state={...state,models:desired,owners:Object.fromEntries(job.input.chapters.map(c=>[chapterKey(c),'spark'])),phase:'queued',session:null,lease:{id:'configuration-rebound',started_at:new Date(now).toISOString(),expires_at:new Date(new Date(now).getTime()+24*HOUR).toISOString(),transport_checkpoints:0},blocker:null,history:[...state.history,{kind:'author_configuration_rebound',prior_models:jobModels(job),models:desired,at:new Date(now).toISOString()}]};
    transitions.push({kind:'author_configuration_rebound',state});
  }
  const started=Date.parse(state.lease?.started_at??state.created_at),expiry=Math.min(Date.parse(state.lease?.expires_at)||Infinity,started+24*HOUR);
  if(['queued','generating','fallback_pending'].includes(state.phase)&&expiry<=new Date(now).getTime()){
    state={...state,phase:'blocked',lease:{...state.lease,released:true},blocker:{stage:'model_transport',code:'V2_AUTHOR_LEASE_EXPIRED'}};
    transitions.push({kind:'author_lease_expired',state});
  }
  return transitions;
}
async function selectAuthorJob(ctx,jobs,lane,now,{dailyEntry,edf=false}={}) {
  const window=henryPriorityWindow(ctx.appConfig,now),forward=j=>!ctx.forwardOnly||(j.input.schedule_date>=window.today&&j.input.schedule_date<=window.horizonDate);
  const active=jobs.filter(j=>j.state?.phase==='generating');
  if(active.length>1)throw new Error('V2_MULTIPLE_GENERATING_JOBS');
  if(active[0])return {job:active[0],kind:'generating'};
  const earliest=phase=>jobs.filter(j=>j.state?.phase===phase&&forward(j)).sort((a,b)=>a.input.schedule_date.localeCompare(b.input.schedule_date))[0];
  const queued=earliest('queued');
  if(edf){
    const fallback=earliest('fallback_pending');if(fallback)await assertFallbackEligible(ctx,fallback,{exact:true});
    const selected=await selection(ctx,jobs,now),fresh=selected.candidate?.entry;
    const candidates=[...(queued?[{job:queued,kind:'queued'}]:[]),...(fallback?[{job:fallback,kind:'fallback_pending'}]:[]),
      ...(dailyEntry?[{entry:dailyEntry,kind:'daily_dependency'}]:[]),
      ...(fresh&&fresh.dayIndex>=window.currentDay&&fresh.dayIndex<=window.horizonDay?[{entry:fresh,kind:'new'}]:[])];
    const date=item=>item.job?.input.schedule_date??scheduleDateForEntry(ctx.appConfig,item.entry);
    candidates.sort((a,b)=>date(a).localeCompare(date(b)));
    return {...(candidates[0]||{kind:'new'}),queue:selected.queue};
  }
  if(queued)return {job:queued,kind:'queued'};
  if(lane!=='spark'){const fallback=earliest('fallback_pending');if(fallback)return {job:fallback,kind:'fallback_pending'};}
  const selected=await selection(ctx,jobs,now);
  if(dailyEntry&&lane!=='luna'&&(!selected.candidate||dailyEntry.dayIndex<=selected.candidate.entry.dayIndex))return {entry:dailyEntry,kind:'daily_dependency',queue:selected.queue};
  return {entry:selected.candidate?.entry,kind:'new',queue:selected.queue};
}
async function requestedDailyDependency(ctx,readingId,reference,now) {
  const invalid=()=>{throw new Error('V2_DAILY_DEPENDENCY_BINDING_INVALID');};
  if(!reference||Object.keys(reference).sort().join(',')!=='dailyJobId,path,sha256'||
    !/^[a-f0-9]{32}$/.test(reference.dailyJobId||'')||!/^[a-f0-9]{64}$/.test(reference.sha256||'')||
    reference.path!==`private-content/automation/staging/${readingId}/supervisor/orders/${reference.sha256}.json`)invalid();
  const bytes=await readFile(await confined(ctx.projectRoot,reference.path,{missing:false}));if(sha256(bytes)!==reference.sha256)invalid();
  const order=JSON.parse(bytes),window=henryPriorityWindow(ctx.appConfig,now),entry=ctx.plan.entries.find(e=>e.readingId===readingId);
  assertSchemaValid(order,await readJson(path.join(ctx.releaseRoot,'schemas/rolling-study-work-order.schema.json')),{label:'Requested Henry daily dependency'});
  const identity={plan:ctx.plan.planVersion,reading:readingId,reasonCode:order.reasonCode,planExtensionRequired:order.planExtensionRequired};
  if(order.action!=='prepare_publish'||order.reasonCode!=='horizon_content_missing_or_stale'||order.planVersion!==ctx.plan.planVersion||
    order.workOrderId!==`RSWO-${sha256(JSON.stringify(identity)).slice(0,24)}`||!isDeepStrictEqual(order.reading,entry)||entry?.kind!=='chapter'||
    order.effectiveDate!==window.today||order.targetDate!==window.horizonDate||!Number.isFinite(Date.parse(order.issuedAt))||
    Date.parse(order.issuedAt)>new Date(now).getTime()||henryPriorityWindow(ctx.appConfig,new Date(order.issuedAt)).today!==window.today||
    entry.dayIndex<window.currentDay||entry.dayIndex>window.horizonDay)invalid();
  // Read the existing same-project journal, never create an authority store.
  const root=await confined(ctx.projectRoot,'private-content/automation/service-supervisor/state',{missing:false});
  await confined(root,'events',{missing:false});const events=await (await openJournal(root)).load();
  const job=events.findLast(e=>e.kind==='daily_state'&&e.data.job?.readingId===readingId)?.data.job;
  const observation=events.findLast(e=>e.kind==='observation'&&e.data.role==='preparation'),selected=observation?.data.selection;
  if(job?.schemaVersion!=='service-supervisor-daily-state/v1'||job.id!==reference.dailyJobId||job.phase!=='waiting_henry'||job.blocker||
    !isDeepStrictEqual(job.workOrder,{path:reference.path,sha256:reference.sha256})||selected?.effectiveDate!==window.today||
    selected.next?.readingId!==readingId||!['daily_author','henry_author'].includes(selected.next?.action)||
    selected.next.component!==(selected.next.action==='daily_author'?'daily':'henry')||
    selected.next?.scheduleDate!==scheduleDateForEntry(ctx.appConfig,entry))invalid();
  const execution=events.filter(e=>e.kind==='execution_state'&&e.data.execution?.id===job.authorSessionId).at(-1)?.data.execution;
  if(!/^[a-f0-9]{32}$/.test(job.authorSessionId||'')||!job.authorThreadId||execution?.phase!=='accepted'||
    execution.kind!=='daily-synthesis'||execution.readingId!==readingId||execution.threadId!==job.authorThreadId||
    execution.output?.path!==`executions/${execution.id}/output.json`||!/^[a-f0-9]{64}$/.test(execution.output.sha256||''))invalid();
  if(sha256(await readFile(await confined(root,execution.output.path,{missing:false})))!==execution.output.sha256)invalid();
  return {entry,proof:{work_order_path:reference.path,work_order_sha256:reference.sha256,daily_job_id:job.id,selection_event_sha256:observation.sha256}};
}
async function assertFallbackEligible(ctx,job,{exact=false}={}) {
  const next=nextBatch(job),blocker=job.state.blocker;
  if(!next||next.lane!=='spark'||!['V2_CANDIDATE_EXHAUSTED','V2_SPARK_MODEL_UNAVAILABLE'].includes(blocker?.code))throw new Error('V2_FALLBACK_NOT_ELIGIBLE');
  if(exact&&blocker.code==='V2_CANDIDATE_EXHAUSTED'&&
    (blocker.packet_id!==next.packet.packet_id||blocker.lane!=='spark'||(job.state.rejected[next.key]||[]).length!==MAX_SUBMISSIONS))throw new Error('V2_FALLBACK_NOT_ELIGIBLE');
  if(blocker.code==='V2_SPARK_MODEL_UNAVAILABLE'){
    if(!/^[a-f0-9]{64}$/.test(blocker.execution_key||'')||blocker.packet_id!==next.packet.packet_id)throw new Error('V2_AVAILABILITY_PROOF_INVALID');
    const base=`model-executions/${blocker.execution_key}`;
    const execution=await readJson(await confined(job.directory,`${base}/result.json`,{missing:false}));
    const events=await readFile(await confined(job.directory,`${base}/events.jsonl`,{missing:false}),'utf8');
    if(execution.status!=='failed'||execution.proof?.model!==jobModels(job).spark||execution.proof.packet_sha256!==digestObject(next.packet)||
      execution.error_code!==null||digestObject(execution.proof)!==blocker.proof_sha256||digestObject(events)!==blocker.events_sha256||
      !sparkModelUnavailable({status:execution.exit_code,stdout:events}))throw new Error('V2_AVAILABILITY_PROOF_INVALID');
  }
}
async function projectedAuthorJobs(ctx,requestedReadingId,now) {
  const jobs=await allJobs(ctx,{readOnly:true});
  for(let i=0;i<jobs.length;i++){
    let job=jobs[i];
    if(!job.state){const entry=ctx.plan.entries.find(e=>e.readingId===job.input.reading_id);if(!entry)throw new Error('V2_PARTIAL_JOB_PLAN_CHANGED');const sources=await sourceInput(ctx,entry);if(sources.input.input_sha256!==job.input.input_sha256)throw new Error('V2_PARTIAL_JOB_SOURCE_CHANGED');job={...job,partial:true,state:initialJobState(job.input,now)};}
    if(job.input.reading_id===requestedReadingId)for(const transition of authorMaintenance(ctx,job,now))job={...job,state:transition.state};
    jobs[i]=job;
  }
  return jobs;
}
// References are native in-process capabilities, never serialized model claims.
// Hold the existing native lock across this read-only call and author dispatch.
export async function selectHistoricalAuthorWorkV2(ctx,{requestedReadingId,lane}={},now=new Date(),{health=historicalForwardHealth}={}) {
  if(requestedReadingId!==undefined&&!validReading(requestedReadingId))throw new Error('V2_REQUESTED_READING_INVALID');
  if(lane!==undefined&&!MODELS[lane])throw new Error('V2_MODEL_NOT_ALLOWED');
  const window=henryPriorityWindow(ctx.appConfig,now),measurement=await health(ctx,now),buffer=measuredBuffer(ctx.plan,ctx.appConfig,measurement,now);
  if(buffer.status!=='ready'||buffer.targetReadings!==8)throw new Error('V2_HISTORICAL_FORWARD_INCOMPLETE');
  const historicalCtx={...ctx,forwardOnly:false};
  let jobs=await projectedAuthorJobs(ctx,requestedReadingId,now),selected=await selectAuthorJob(historicalCtx,jobs,undefined,now);
  const id=selected.job?.input.reading_id??selected.entry?.readingId??null;
  const mismatch=reason=>({pipeline:VERSION,action:'none',state:'requested_reading_mismatch',code:'V2_REQUESTED_READING_MISMATCH',published:false,requestedReadingId,readingId:id,reason});
  if(requestedReadingId!==undefined&&id!==requestedReadingId)return mismatch('native_selection_differs');
  const entry=ctx.plan.entries.find(e=>e.readingId===id),manifest=await readJson(await confined(ctx.privateRoot,'private-manifest.json',{missing:false}));
  if(!entry||entry.kind!=='chapter'||entry.dayIndex>=window.currentDay||!manifest.readings?.[id])return mismatch('outside_historical_scope');
  // If discovery omitted an ID, project this target's maintenance before minting.
  if(requestedReadingId===undefined){jobs=await projectedAuthorJobs(ctx,id,now);selected=await selectAuthorJob(historicalCtx,jobs,undefined,now);if((selected.job?.input.reading_id??selected.entry?.readingId??null)!==id)return mismatch('native_selection_changed');}
  const job=selected.job,next=job&&nextBatch(job),authorLane=selected.kind==='fallback_pending'?'luna':next?.lane??job?.state.session?.lane??'spark';
  if(lane!==undefined&&lane!==authorLane)return mismatch('chapter_owner_differs');
  if(job&&!job.partial)await checkedJob(ctx,id);
  if(selected.kind==='fallback_pending')await assertFallbackEligible(ctx,job,{exact:true});
  const reference=Object.freeze({schemaVersion:historicalSelectionBindingVersion,readingId:id,authorLane,issuedAt:new Date(now).toISOString()});
  historicalReferences.set(reference,{projectRoot:ctx.projectRoot,releaseRoot:ctx.releaseRoot,planSha256:digestObject(ctx.plan),configSha256:digestObject(ctx.config),appConfigSha256:digestObject(ctx.appConfig),manifestSha256:ctx.manifestSha256,effectiveDate:window.today,health});
  return {pipeline:VERSION,action:'selected',state:'selection_ready',published:false,readingId:id,requestedReadingId:id,authorLane,
    requiredModel:(job?jobModels(job):configuredModels(ctx))[authorLane],selectionKind:selected.kind,historicalAuthorization:reference,
    historicalProof:{checked_at:reference.issuedAt,health_sha256:digestObject(measurement)}};
}
async function checkedHistoricalSelection(ctx,readingId,lane,reference,now) {
  const basis=reference&&typeof reference==='object'&&historicalReferences.get(reference),time=new Date(now).getTime(),issued=Date.parse(reference?.issuedAt);
  if(!basis||reference.readingId!==readingId||reference.authorLane!==lane||!Number.isFinite(time)||time<issued||time-issued>HISTORICAL_REFERENCE_MS||
    basis.projectRoot!==ctx.projectRoot||basis.releaseRoot!==ctx.releaseRoot||basis.planSha256!==digestObject(ctx.plan)||basis.configSha256!==digestObject(ctx.config)||
    basis.appConfigSha256!==digestObject(ctx.appConfig)||basis.manifestSha256!==ctx.manifestSha256||basis.effectiveDate!==henryPriorityWindow(ctx.appConfig,now).today)
    throw new Error('V2_HISTORICAL_REFERENCE_INVALID');
  const selected=await selectHistoricalAuthorWorkV2(ctx,{requestedReadingId:readingId,lane},now,{health:basis.health});
  return {...selected,historical:true};
}
// Caller holds the native runner lock through selection, preflight and dispatch.
// Omitted lane means report the actual owner, or Luna for proven fallback work.
export async function selectAuthorWorkV2(ctx,{requestedReadingId,lane,requestedDailyWorkOrder}={},now=new Date()) {
  if(!validReading(requestedReadingId))throw new Error('V2_REQUESTED_READING_INVALID');
  if(lane!==undefined&&!MODELS[lane])throw new Error('V2_MODEL_NOT_ALLOWED');
  const window=henryPriorityWindow(ctx.appConfig,now),entry=ctx.plan.entries.find(e=>e.readingId===requestedReadingId);
  const mismatch=extra=>({pipeline:VERSION,action:'none',state:'requested_reading_mismatch',code:'V2_REQUESTED_READING_MISMATCH',published:false,requestedReadingId,...extra});
  if(!entry||entry.kind!=='chapter'||entry.dayIndex<window.currentDay||entry.dayIndex>window.horizonDay)return mismatch({reason:'outside_forward_window',readingId:null});
  const daily=requestedDailyWorkOrder===undefined?null:await requestedDailyDependency(ctx,requestedReadingId,requestedDailyWorkOrder,now);
  const jobs=await projectedAuthorJobs(ctx,requestedReadingId,now);
  const selected=await selectAuthorJob({...ctx,forwardOnly:true},jobs,lane,now,{dailyEntry:daily?.entry,edf:true}),id=selected.job?.input.reading_id??selected.entry?.readingId??null;
  if(id!==requestedReadingId)return mismatch({reason:'native_selection_differs',readingId:id,selectionKind:selected.kind});
  const job=selected.job,next=job&&nextBatch(job),authorLane=selected.kind==='fallback_pending'?'luna':next?.lane??job?.state.session?.lane??'spark';
  if(lane!==undefined&&lane!==authorLane)return mismatch({reason:'chapter_owner_differs',readingId:id,authorLane});
  if(job&&!job.partial){const checked=await checkedJob(ctx,id);if(checked.job.input.input_sha256!==job.input.input_sha256)throw new Error('V2_SOURCE_CHANGED');}
  if(selected.kind==='fallback_pending')await assertFallbackEligible(ctx,job,{exact:true});
  return {pipeline:VERSION,action:'selected',state:'selection_ready',published:false,requestedReadingId,readingId:id,authorLane,
    requiredModel:(job?jobModels(job):configuredModels(ctx))[authorLane],selectionKind:selected.kind,...(daily?{dailyDependency:daily.proof}:{})};
}

export async function startV2(ctx,lane,now=new Date(),{requestedReadingId,requestedDailyWorkOrder,requestedHistoricalAuthorization}={}) {
  if(!MODELS[lane])throw new Error('V2_MODEL_NOT_ALLOWED');
  if(requestedDailyWorkOrder!==undefined&&requestedReadingId===undefined)throw new Error('V2_DAILY_DEPENDENCY_READING_REQUIRED');
  if(requestedHistoricalAuthorization!==undefined&&(requestedReadingId===undefined||requestedDailyWorkOrder!==undefined))throw new Error('V2_HISTORICAL_ARGUMENTS_INVALID');
  let exact;
  if(requestedReadingId!==undefined){exact=requestedHistoricalAuthorization===undefined?await selectAuthorWorkV2(ctx,{requestedReadingId,lane,requestedDailyWorkOrder},now):await checkedHistoricalSelection(ctx,requestedReadingId,lane,requestedHistoricalAuthorization,now);if(exact.action!=='selected')return exact;ctx={...ctx,forwardOnly:!exact.historical};}
  let jobs=await allJobs(ctx,{readOnly:requestedReadingId!==undefined});const window=henryPriorityWindow(ctx.appConfig,now);
  for(const partial of jobs.filter(j=>!j.state&&(requestedReadingId===undefined||j.input.reading_id===requestedReadingId))){const entry=ctx.plan.entries.find(e=>e.readingId===partial.input.reading_id);if(!entry)throw new Error('V2_PARTIAL_JOB_PLAN_CHANGED');const sources=await sourceInput(ctx,entry);if(sources.input.input_sha256!==partial.input.input_sha256)throw new Error('V2_PARTIAL_JOB_SOURCE_CHANGED');await createJob(ctx.jobRoot,partial.input,now);}
  jobs=await allJobs(ctx,{readOnly:requestedReadingId!==undefined});
  for(let old of jobs){
    if(!old.state||(requestedReadingId!==undefined&&old.input.reading_id!==requestedReadingId))continue;
    // The October replacement may rebind only never-authored work. Original
    // receipts, event history, session deadlines and budgets remain intact.
    for(const transition of authorMaintenance(ctx,old,now)){
      old=await appendState(old,transition.kind,transition.state,now);
      if(transition.kind==='author_lease_expired')await stageAuthorBlock(ctx,{model:jobModels(old)[old.state.session?.lane||'spark'],reason:'Author lease expired; fallback retained',code:'V2_AUTHOR_LEASE_EXPIRED'},now);
    }
  }
  jobs=await allJobs(ctx,{readOnly:requestedReadingId!==undefined});
  const selected=await selectAuthorJob(ctx,jobs,exact?.historical?undefined:lane,now,{dailyEntry:exact?.selectionKind==='daily_dependency'?ctx.plan.entries.find(e=>e.readingId===requestedReadingId):undefined,edf:Boolean(exact)&&!exact.historical});let job=selected.job;
  if(selected.kind==='queued'){job=(await checkedJob(ctx,job.input.reading_id)).job;const next=nextBatch(job);if(next&&next.lane!==lane)return ownershipWake(ctx,job,now);job=await appendState(job,'queued_authoring_resumed',{...job.state,phase:'generating'},now);}
  if(job&&selected.kind!=='fallback_pending'){job=(await checkedJob(ctx,job.input.reading_id)).job;const next=nextBatch(job);if(next&&next.lane!==lane)return ownershipWake(ctx,job,now);}
  if(selected.kind==='fallback_pending') {
      job=(await checkedJob(ctx,job.input.reading_id)).job;
      const next=nextBatch(job),state=clone(job.state);await assertFallbackEligible(ctx,job);
      state.owners[chapterKey(next.chapter)]='luna';state.phase='generating';state.session=null;state.blocker=null;
      job=await appendState(job,'eligible_luna_transfer',state,now);
  }
  if(!job) {
    if(!selected.entry)return {pipeline:VERSION,action:'none',state:'no_eligible_reading',queue:selected.queue};
    // Only Spark starts new v2 work. Luna needs a recorded actual Spark candidate
    // failure; absence or a host authorization denial never creates eligibility.
    if(lane==='luna')return {pipeline:VERSION,action:'none',state:'awaiting_primary',readingId:selected.entry.readingId};
    const entry=selected.entry;
    if(ctx.forwardOnly&&entry.dayIndex<window.currentDay)return {pipeline:VERSION,action:'none',state:'forward_drain_complete',queue:selected.queue};
    if(entry.dayIndex>window.horizonDay)throw new Error('V2_OUTSIDE_HORIZON');
    const sources=await sourceInput(ctx,entry);job=await createJob(ctx.jobRoot,sources.input,now,configuredModels(ctx));
    if(selected.kind==='daily_dependency')job=await appendState(job,'daily_dependency_admitted',{...job.state,history:[...job.state.history,{kind:'daily_dependency_admitted',...exact.dailyDependency}]},now);
  }
  if(exact?.historical)job=await appendState(job,'historical_authorization_admitted',{...job.state,history:[...job.state.history,{kind:'historical_authorization_admitted',...exact.historicalProof}]},now);
  job=await beginSession(ctx,job,lane,now);
  if(job.state.pending_attempt)return advanceV2(ctx,job.input.reading_id,job.state.session.id,now);
  return authorPacket(ctx,job,now);
}

async function ownershipWake(ctx,job,now){
  const count=(job.state.ownership_wakes||0)+1,exhausted=count>=2;
  job=await appendState(job,'other_owner_wake',{...job.state,ownership_wakes:count,...(exhausted?{phase:'blocked',lease:{...job.state.lease,released:true},blocker:{stage:'model_transport',code:'V2_OWNERSHIP_WAKE_EXHAUSTED'}}:{})},now);
  const status=exhausted?await stageAuthorBlock(ctx,{model:jobModels(job)[nextBatch(job).lane],reason:'Chapter ownership stalled across two wakes',code:'V2_OWNERSHIP_WAKE_EXHAUSTED'},now):{};
  return report(ctx,job,{code:exhausted?'V2_OWNERSHIP_WAKE_EXHAUSTED':'V2_OTHER_MODEL_OWNS_CHAPTER',...status});
}

export async function advanceV2(ctx,readingId,sessionId,now=new Date()) {
  let {job}=await checkedJob(ctx,readingId);
  if(job.state.phase!=='generating')return report(ctx,job,{action:job.state.phase==='review_pending'?'review_handoff':'none'});
  if(job.state.session?.id!==sessionId)throw new Error('V2_SESSION_MISMATCH');
  const next=nextBatch(job);if(!next)return authorPacket(ctx,job,now);
  const {packet,lane,key}=next;
  if(job.state.session.lane!==lane)throw new Error('V2_SESSION_MODEL_MISMATCH');
  let reserved=job.state.pending_attempt;
  if(!reserved) {
    if(new Date(now).getTime()>=Date.parse(job.state.session.deadline_at)||job.state.session.submissions>=32)return report(ctx,job,{action:'checkpointed',code:'V2_WAKE_BUDGET'});
    const candidatePath=await confined(job.directory,`author/${packet.packet_id}/${lane}/candidate.json`);
    let candidateBytes;try{candidateBytes=await readFile(candidatePath);}catch(e){if(e.code==='ENOENT')return authorPacket(ctx,job,now);throw e;}
    if(candidateBytes.length>128*1024)throw new Error('V2_CANDIDATE_FILE_TOO_LARGE');
    const hash=sha256(candidateBytes);
    if((job.state.rejected[key]||[]).includes(hash))return authorPacket(ctx,job,now);
    if((job.state.rejected[key]||[]).length>=MAX_SUBMISSIONS)throw new Error('V2_SUBMISSION_BUDGET_EXHAUSTED');
    let value;try{value=JSON.parse(candidateBytes);}catch{value={invalid_json:true};}
    // Preserve the exact rejected/accepted byte representation as an inert JSON
    // string; reservation is durable before any validation or result staging.
    await atomicJson(job.directory,`attempts/${hash}.json`,{bytes:candidateBytes.toString('utf8'),value},{immutable:true});
    const state=clone(job.state);state.pending_attempt={key,hash,packet_id:packet.packet_id,lane};state.total_submissions++;state.session.submissions++;state.sessions[state.session.id]=state.session;
    job=await appendState(job,'submission_reserved',state,now);reserved=state.pending_attempt;
  }
  if(reserved.key!==key||reserved.lane!==lane||reserved.packet_id!==packet.packet_id)throw new Error('V2_RESERVED_ATTEMPT_MISMATCH');
  const stored=await readJson(await confined(job.directory,`attempts/${reserved.hash}.json`,{missing:false}));
  if(sha256(stored.bytes)!==reserved.hash)throw new Error('V2_ATTEMPT_HASH_MISMATCH');
  let candidate;try{candidate=JSON.parse(stored.bytes);}catch{candidate={invalid_json:true};}
  const validation=validateCandidate(candidate,packet),state=clone(job.state);state.pending_attempt=null;
  await atomicJson(job.directory,`diagnostics/${reserved.hash}.json`,validation,{immutable:true});
  await atomicJson(job.directory,`author/${packet.packet_id}/${lane}/validation.json`,{candidate_sha256:reserved.hash,...validation});
  if(validation.valid){state.accepted[key]={candidate_sha256:reserved.hash,accepted_at:new Date(now).toISOString()};if(state.lease)state.lease.transport_checkpoints=0;state.ownership_wakes=0;job=await appendState(job,'candidate_accepted',state,now);}
  else {
    state.rejected[key]=[...(state.rejected[key]||[]),reserved.hash];
    if(state.rejected[key].length>=MAX_SUBMISSIONS){state.phase=lane==='spark'?'fallback_pending':'editorial_attention';state.blocker={code:'V2_CANDIDATE_EXHAUSTED',stage:'candidate',packet_id:packet.packet_id,lane};}
    job=await appendState(job,'candidate_rejected',state,now);
    if(state.phase!=='generating')return report(ctx,job);
  }
  return authorPacket(ctx,job,now);
}

export async function buildReview(ctx,readingId) {
  const {job,entry,sources}=await checkedJob(ctx,readingId);
  if(nextBatch(job))throw new Error('V2_REVIEW_INCOMPLETE');
  const results=[],sentences=[],concerns=[];
  for(const chapter of job.input.chapters){const lane=job.state.owners[chapterKey(chapter)],records=[];
    for(const packet of chapter.batches){const accepted=job.state.accepted[artifactKey(packet,lane)],stored=await readJson(await confined(job.directory,`attempts/${accepted.candidate_sha256}.json`,{missing:false}));if(sha256(stored.bytes)!==accepted.candidate_sha256)throw new Error('V2_ACCEPTED_ATTEMPT_CHANGED');const candidate=JSON.parse(stored.bytes),validation=validateCandidate(candidate,packet);if(!validation.valid)throw new Error('V2_ACCEPTED_CANDIDATE_INVALID');records.push(...validation.records);sentences.push(...candidate.records);concerns.push(...validation.reviewConcerns);}
    const units=sources.chapters.find(c=>c.bookId===chapter.book_id&&c.chapter===chapter.chapter).units;
    const runtime=chapterRuntime({chapter,records,units,sourceManifest:sources.sourceManifest,model:jobModels(job)[lane],createdAt:job.state.created_at});
    assertSchemaValid(runtime,await readJson(path.join(ctx.releaseRoot,'schemas/mhc-runtime.schema.json')),{label:'V2 unreviewed runtime'});
    results.push({book_id:chapter.book_id,chapter:chapter.chapter,verse_count:chapter.verse_count,runtime});
  }
  const basis={schema_version:'mhc-evidence-review/v2',reading_id:readingId,input_sha256:job.input.input_sha256,accepted:job.state.accepted,results,sentences,source_packets:job.input.chapters.flatMap(c=>c.batches),editorial_history:job.state.history,review_concerns:concerns,required_assertions:REVIEW_ASSERTIONS};
  const reopened=job.state.history.filter(e=>e.kind==='approval_reopened');
  if(reopened.length){basis.previous_approvals=[];for(const event of reopened){const approved=await readJson(await confined(job.directory,`approved/${event.approved_sha256}.json`,{missing:false}));if(digestObject(approved)!==event.approved_sha256)throw new Error('V2_APPROVED_ARTIFACT_CHANGED');basis.previous_approvals.push({approved_sha256:event.approved_sha256,review:approved.review});}}
  return {job,entry,bundle:{...basis,review_basis_sha256:digestObject(basis)}};
}

export async function reopenReviewV2(ctx,readingId,approvedSha256,reviewer,reason,now=new Date()) {
  if(!/^[a-f0-9]{64}$/.test(String(approvedSha256))||typeof reviewer!=='string'||reviewer.trim().length<2||reviewer.length>200||typeof reason!=='string'||reason.trim().length<20||reason.length>2000)throw new Error('V2_REOPEN_ARGUMENTS');
  let {job}=await checkedJob(ctx,readingId);
  const prior=job.state.history.filter(e=>e.kind==='approval_reopened').at(-1);
  if(job.state.phase==='review_pending'&&!job.state.review&&prior?.approved_sha256===approvedSha256)return report(ctx,job,{action:'review_reopened'});
  if(!['approved','publishing','published'].includes(job.state.phase)||job.state.review?.approved_sha256!==approvedSha256)throw new Error('V2_REOPEN_APPROVAL_BINDING');
  const approved=await readJson(await confined(job.directory,`approved/${approvedSha256}.json`,{missing:false}));
  if(digestObject(approved)!==approvedSha256)throw new Error('V2_APPROVED_ARTIFACT_CHANGED');
  const decision={kind:'approval_reopened',approved_sha256:approvedSha256,reviewer:reviewer.trim(),reason:reason.trim(),at:new Date(now).toISOString(),prior_publication:job.state.publication};
  await atomicJson(job.directory,`review/reopened-${digestObject(decision)}.json`,decision,{immutable:true});
  const state={...job.state,phase:'review_pending',review:null,publication:null,blocker:null,history:[...job.state.history,decision]};
  job=await appendState(job,'approval_reopened',state,now);
  return report(ctx,job,{action:'review_reopened'});
}

async function publicationMatches(ctx,job) {
  const manifest=await readJson(await confined(ctx.privateRoot,'private-manifest.json',{missing:false}));
  if(!await hasHenryPublicationReceipt({privateRoot:ctx.privateRoot,readingId:job.input.reading_id,manifest}))return false;
  const metadata=await readJson(await confined(ctx.privateRoot,`bridge/celebration-y3q4/${job.input.reading_id}.metadata.json`,{missing:false}));
  const approved=await readJson(await confined(job.directory,`approved/${job.state.review.approved_sha256}.json`,{missing:false}));
  if(digestObject(approved)!==job.state.review.approved_sha256)throw new Error('V2_APPROVED_ARTIFACT_CHANGED');
  const attached=metadata.verseCommentaries||(metadata.verseCommentary?[metadata.verseCommentary]:[]);
  return approved.results.length===attached.length&&approved.results.every(r=>attached.some(a=>digestObject(a)===digestObject(r.runtime)));
}

async function editorialOrder(ctx,job){
  const next=editorialTarget(job),hash=next.hash;
  const packetPath=await atomicJson(job.directory,`editorial/${next.packet.packet_id}-${hash}.json`,{input_sha256:job.input.input_sha256,packet:next.packet,rejected_sha256:hash,review_findings:job.state.blocker.findings||[]},{immutable:true});
  const cmd=command(ctx,['reviewer','repair','--reading',job.input.reading_id]);
  return report(ctx,job,{action:'editorial_attention',stage:'candidate',packetPath,candidatePath:await confined(job.directory,`attempts/${hash}.json`),repairPath:await confined(job.directory,'editorial-repair.json'),repairCommand:cmd.command,instructionsPath:path.join(ctx.releaseRoot,'prompts/mhc-v2-review.md')});
}

export async function reviewWorkOrderV2(ctx,now=new Date()) {
  let jobs=(await allJobs(ctx)).filter(j=>j.state);const window=henryPriorityWindow(ctx.appConfig,now);
  jobs.sort((a,b)=>{const recovery=j=>['approved','publishing'].includes(j.state.phase)?0:1;const tier=j=>j.input.schedule_date>=window.today?0:1;return tier(a)-tier(b)||recovery(a)-recovery(b)||a.input.schedule_date.localeCompare(b.input.schedule_date);});
  for(let job of jobs){
    if(job.state.phase==='published'){
      if(await publicationMatches(ctx,job))continue;
      job=await appendState(job,'publication_proof_stale',{...job.state,phase:'publishing',publication:null},now);
    }
    if(['queued','generating','fallback_pending','blocked'].includes(job.state.phase))continue;
    if(['review_pending','editorial_attention'].includes(job.state.phase)&&job.input.schedule_date>window.horizonDate)continue;
    if(job.state.phase==='editorial_attention')return editorialOrder(ctx,(await checkedJob(ctx,job.input.reading_id)).job);
    job=(await checkedJob(ctx,job.input.reading_id)).job;
    if(['approved','publishing'].includes(job.state.phase)) {
      if(await publicationMatches(ctx,job)){const receipt=await readJson(await confined(ctx.privateRoot,`automation/staging/${job.input.reading_id}/manager-publication-result.json`,{missing:false}));job=await appendState(job,'publication_verified',{...job.state,phase:'published',publication:{receipt_sha256:digestObject(receipt),verified_at:new Date(now).toISOString()}},now);continue;}
      const cmd=command(ctx,['reviewer','apply','--reading',job.input.reading_id]);
      return report(ctx,job,{action:'recover_publish',stage:'publication',applyCommand:cmd.command,reviewPath:await confined(job.directory,'review.json'),instructionsPath:path.join(ctx.releaseRoot,'prompts/mhc-v2-review.md')});
    }
    const {bundle}=await buildReview(ctx,job.input.reading_id);
    const bundlePath=await atomicJson(job.directory,`review/${bundle.review_basis_sha256}.json`,bundle,{immutable:true});
    const cmd=command(ctx,['reviewer','apply','--reading',job.input.reading_id]);
    return report(ctx,job,{action:'review',stage:'review',bundlePath,reviewPath:await confined(job.directory,'review.json'),instructionsPath:path.join(ctx.releaseRoot,'prompts/mhc-v2-review.md'),applyCommand:cmd.command,requestRepairCommand:command(ctx,['reviewer','request-repair','--reading',job.input.reading_id]).command,requiredAssertions:REVIEW_ASSERTIONS});
  }
  return {pipeline:VERSION,action:'none',state:'no_review_work'};
}

export async function editorialRepairV2(ctx,readingId,now=new Date()) {
  let {job}=await checkedJob(ctx,readingId);
  if(job.state.phase!=='editorial_attention')throw new Error('V2_EDITORIAL_PHASE_INVALID');
  const next=editorialTarget(job),rejected=next.hash;
  const original=await readJson(await confined(job.directory,`attempts/${rejected}.json`,{missing:false}));
  if(sha256(original.bytes)!==rejected)throw new Error('V2_EDITORIAL_ORIGINAL_CHANGED');
  let originalCandidate;try{originalCandidate=JSON.parse(original.bytes);}catch{throw new Error('V2_EDITORIAL_NO_SUBSTANTIVE_DRAFT');}
  assertSchemaValid(originalCandidate,candidateSchema,{label:'V2 editorial original draft'});
  if(originalCandidate.records.length!==next.packet.requests.length||originalCandidate.records.some((r,i)=>r.verse_id!==next.packet.requests[i].verse_id))throw new Error('V2_EDITORIAL_NO_SUBSTANTIVE_DRAFT');
  const repair=await readJson(await confined(job.directory,'editorial-repair.json',{missing:false}));
  if(repair.schema_version!=='mhc-evidence-editorial-repair/v2'||repair.input_sha256!==job.input.input_sha256||repair.rejected_sha256!==rejected||repair.status!=='approved'||typeof repair.reviewer!=='string'||repair.reviewer.length<2||!Array.isArray(repair.findings)||!repair.findings.length||!Number.isFinite(Date.parse(repair.reviewed_at)))throw new Error('V2_EDITORIAL_REPAIR_BINDING');
  if(job.state.history.some(e=>e.kind==='editorial_repair'&&e.packet_id===next.packet.packet_id))throw new Error('V2_EDITORIAL_REPAIR_ALREADY_USED');
  const checked=validateCandidate(repair.candidate,next.packet);if(!checked.valid)throw new Error(`V2_EDITORIAL_REPAIR_INVALID: ${checked.diagnostics.map(d=>d.code).join(', ')}`);
  const bytes=bytesFor(repair.candidate),hash=sha256(bytes),repairHash=digestObject(repair);
  await atomicJson(job.directory,`editorial/approved-${repairHash}.json`,repair,{immutable:true});
  await atomicJson(job.directory,`attempts/${hash}.json`,{bytes,value:repair.candidate},{immutable:true});
  const state=clone(job.state);state.accepted[next.key]={candidate_sha256:hash,accepted_at:new Date(now).toISOString(),editorial_repair_sha256:repairHash};state.history.push({kind:'editorial_repair',packet_id:next.packet.packet_id,rejected_sha256:rejected,repair_sha256:repairHash});state.phase='queued';state.blocker=null;state.session=null;
  job=await appendState(job,'editorial_repair_accepted',state,now);
  if(!nextBatch(job))job=await appendState(job,'generation_complete',{...job.state,phase:'review_pending'},now);
  return report(ctx,job,{action:job.state.phase==='review_pending'?'review_handoff':'checkpointed'});
}

export async function requestEditorialV2(ctx,readingId,now=new Date()) {
  let {job,bundle}=await buildReview(ctx,readingId);
  if(job.state.phase!=='review_pending')throw new Error('V2_REVIEW_REPAIR_PHASE_INVALID');
  const decision=await readJson(await confined(job.directory,'review.json',{missing:false}));
  const chapter=job.input.chapters.find(c=>c.batches.some(p=>p.packet_id===decision.packet_id));
  if(decision.schema_version!=='mhc-evidence-review-decision/v2'||decision.reading_id!==readingId||decision.review_basis_sha256!==bundle.review_basis_sha256||decision.status!=='changes_requested'||!chapter||typeof decision.reviewer!=='string'||decision.reviewer.length<2||!Array.isArray(decision.findings)||!decision.findings.length||!Number.isFinite(Date.parse(decision.reviewed_at)))throw new Error('V2_REVIEW_REPAIR_BINDING');
  if(job.state.history.some(e=>e.kind==='editorial_repair'&&e.packet_id===decision.packet_id))throw new Error('V2_EDITORIAL_REPAIR_ALREADY_USED');
  const packet=chapter.batches.find(p=>p.packet_id===decision.packet_id),lane=job.state.owners[chapterKey(chapter)],hash=job.state.accepted[artifactKey(packet,lane)].candidate_sha256;
  const decisionHash=digestObject(decision);await atomicJson(job.directory,`review/decision-${decisionHash}.json`,decision,{immutable:true});
  const state=clone(job.state);state.phase='editorial_attention';state.blocker={code:'V2_REVIEW_CHANGES_REQUESTED',stage:'review',packet_id:packet.packet_id,candidate_sha256:hash,findings:decision.findings};state.history.push({kind:'review_changes_requested',packet_id:packet.packet_id,decision_sha256:decisionHash});
  job=await appendState(job,'review_changes_requested',state,now);return report(ctx,job,{action:'editorial_attention'});
}

export async function applyReviewV2(ctx,readingId,now=new Date()) {
  let {job,bundle}=await buildReview(ctx,readingId);
  if(!['review_pending','approved','publishing'].includes(job.state.phase))throw new Error('V2_REVIEW_PHASE_INVALID');
  let approved;
  if(job.state.review){approved=await readJson(await confined(job.directory,`approved/${job.state.review.approved_sha256}.json`,{missing:false}));if(digestObject(approved)!==job.state.review.approved_sha256)throw new Error('V2_APPROVED_ARTIFACT_CHANGED');}
  else {
    const review=await readJson(await confined(job.directory,'review.json',{missing:false}));
    if(review.schema_version!=='mhc-evidence-approval/v2'||review.reading_id!==readingId||review.review_basis_sha256!==bundle.review_basis_sha256||review.status!=='approved'||typeof review.reviewer!=='string'||review.reviewer.length<2||!Number.isFinite(Date.parse(review.reviewed_at))||!Array.isArray(review.findings)||!review.findings.length||!REVIEW_ASSERTIONS.every(k=>review.assertions?.[k]===true)||Object.keys(review.assertions).length!==REVIEW_ASSERTIONS.length)throw new Error('V2_REVIEW_APPROVAL_INVALID');
    if(!Array.isArray(review.corrections))throw new Error('V2_REVIEW_CORRECTIONS_INVALID');
    const corrections=new Map(review.corrections.map(c=>[c.verse_id,c]));if(corrections.size!==review.corrections.length)throw new Error('V2_DUPLICATE_REVIEW_CORRECTION');
    const results=clone(bundle.results);
    for(const result of results){for(const [verseId,record] of Object.entries(result.runtime.records)){
      const correction=corrections.get(verseId);
      if(correction){if(typeof correction.blurb!=='string'||correction.blurb.length<20||correction.blurb.length>1200||typeof correction.reason!=='string'||correction.reason.length<3)throw new Error('V2_REVIEW_CORRECTION_INVALID');record.blurb=correction.blurb;corrections.delete(verseId);}
      if(findSourceReportingPhrase(record.blurb))throw new Error('V2_REVIEW_SOURCE_REPORTING');
      if(!validateSourceCopyRisk({records:[record],sourceAtoms:result.runtime.source_atoms,requireCitedSource:true}).valid)throw new Error('V2_REVIEW_SOURCE_COPY');
    }result.runtime.review_status='approved';assertSchemaValid(result.runtime,await readJson(path.join(ctx.releaseRoot,'schemas/mhc-runtime.schema.json')),{label:'V2 approved runtime'});}
    if(corrections.size)throw new Error('V2_UNKNOWN_REVIEW_CORRECTION');
    approved={schema_version:'mhc-evidence-approved/v2',reading_id:readingId,input_sha256:job.input.input_sha256,review_basis_sha256:bundle.review_basis_sha256,review,results};
    const hash=digestObject(approved);await atomicJson(job.directory,`approved/${hash}.json`,approved,{immutable:true});
    job=await appendState(job,'editorial_approved',{...job.state,phase:'approved',review:{approved_sha256:hash,review_basis_sha256:bundle.review_basis_sha256}},now);
  }
  const entry=ctx.plan.entries.find(e=>e.readingId===readingId);
  const passages=approved.results.map(r=>({book_id:r.book_id,chapter:r.chapter,verse_count:r.verse_count,job_id:`${r.book_id}-${String(r.chapter).padStart(3,'0')}`,fingerprint:digestObject(r.runtime),runtime_path:`runtime/${r.book_id}/${String(r.chapter).padStart(3,'0')}.json`,record_count:Object.keys(r.runtime.records).length,source_atom_count:Object.keys(r.runtime.source_atoms).length,worker_model:r.runtime.worker_model,generation_mode:VERSION,review_applied:true,corrected_verse_ids:approved.review.corrections.filter(c=>c.verse_id.startsWith(`${r.book_id}.${r.chapter}.`)).map(c=>c.verse_id)}));
  const audit={schema_version:'mhc-schedule-audit/v1',reading_id:readingId,plan_version:job.input.plan_version,...(entry.sourcePlanDay===undefined?{}:{source_plan_day:entry.sourcePlanDay}),prepared_on:job.state.created_at.slice(0,10),schedule_date:job.input.schedule_date,timezone:'America/Detroit',worker_model:approved.results[0].runtime.worker_model,worker_models:[...new Set(approved.results.map(r=>r.runtime.worker_model))],prompt_version:VERSION,generation_mode:VERSION,audit_status:'approved',review_status:'approved',publication_status:'not_published',main_commentary_unchanged:true,source_layer:'exact_cited_commentary_atoms_without_embedded_scripture_transcription',passages,human_review:{status:'approved',reviewed_at:approved.review.reviewed_at,reviewer:approved.review.reviewer,findings:approved.review.findings,approval:'approved'}};
  const entries=[...approved.results.map((r,i)=>({destination:passages[i].runtime_path,value:r.runtime})),{destination:`schedule/${readingId}/audit.json`,value:audit}];
  const transaction={schema_version:'mhc-native-review-transaction/v1',reading_id:readingId,plan_version:job.input.plan_version,review_sha256:digestObject(approved.review),state:'staged',destinations:entries.map((e,i)=>({destination:e.destination,staged_file:`staged/${i}.json`,sha256:sha256(bytesFor(e.value))}))};
  const schemas=async name=>readJson(path.join(ctx.releaseRoot,`schemas/${name}.schema.json`));
  // Review revisions get separate transactions; old committed bytes survive
  // without competing with this approval's exact-one finalization requirement.
  const revision=job.state.history.some(e=>e.kind==='approval_reopened')?`/revisions/${job.state.review.approved_sha256}`:'';
  const transactionRoot=await confined(ctx.jobRoot,`${readingId}/transactions${revision}`);await mkdir(transactionRoot,{recursive:true});
  // Canonical publication artifacts use the existing transaction/finalizer. V2
  // transactions live under this reading's job, not a competing global ledger.
  await applyNativeTransaction({root:transactionRoot,canonicalRoot:ctx.mhcRoot,manifest:transaction,entries,transactionSchema:await schemas('mhc-native-review-transaction'),progressSchema:await schemas('mhc-native-review-progress')});
  await finalizeReviewedLibrary({canonicalRoot:ctx.mhcRoot,libraryRoot:path.join(ctx.mhcRoot,'stores/library'),transactionRoot,readingId,plan:ctx.plan,appConfig:ctx.appConfig,runtimeSchema:await schemas('mhc-runtime'),readingSchema:await schemas('mhc-window-store'),catalogSchema:{...await schemas('mhc-activation'),$ref:'#/$defs/catalog'},transactionSchema:await schemas('mhc-native-review-transaction')});
  if(job.state.phase!=='publishing')job=await appendState(job,'publication_ready',{...job.state,phase:'publishing'},now);
  return report(ctx,job,{action:'publish_required',stage:'publication',approvedSha256:job.state.review.approved_sha256});
}

export async function statusV2(ctx) {
  const readings=[];
  for(const job of await allJobs(ctx)){if(!job.state){readings.push({readingId:job.input.reading_id,state:'initializing',published:false});continue;}const value=report(ctx,job);if(value.published&&!await publicationMatches(ctx,job)){value.published=false;value.state='publication_verification_debt';}readings.push(value);}
  return {pipeline:VERSION,readings};
}
