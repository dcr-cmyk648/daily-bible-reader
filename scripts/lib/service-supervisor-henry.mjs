import path from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import {readFileSync,writeFileSync,openSync,fsyncSync,closeSync,readdirSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {confined,readPrivate,digest,jsonBytes,durableWrite,fault} from './service-supervisor-store.mjs';
import {forwardWindow,measuredBuffer} from './service-supervisor-policy.mjs';
import {authenticatedForwardHealth} from './service-supervisor-scope.mjs';
import {executeBoundedChild,childEnvironment,verifyChildTransport} from './service-supervisor-exec.mjs';
import {independentReviewContract,henryRepairContract,assertChildPrivacy} from './service-supervisor-contracts.mjs';
import {REVIEW_ASSERTIONS,digestObject,candidateSchema,validateCandidate} from './mhc-v2.mjs';
import {assertSchemaValid} from './schema-validator.mjs';
import {loadLatestHenryReading} from './mhc-library-sync.mjs';
import {loadJob} from './mhc-v2-store.mjs';

export async function verifiedHenryContext(ctx) {
  const expected=ctx.config.henryRuntime;
  if(!expected||!/^[a-f0-9]{40}$/.test(expected.sourceRevision)||
    ![expected.manifestSha256,expected.configSha256].every(s=>/^[a-f0-9]{64}$/.test(s||'')))throw fault('SUPERVISOR_HENRY_PIN_REQUIRED');
  const runtimeRoot=await confined(ctx.projectRoot,'private-content/automation/mhc-runtime',false),pointer=await readPrivate(runtimeRoot,'current.json');
  if(pointer.schema_version!=='mhc-native-runtime-pointer/v1'||pointer.source_revision!==expected.sourceRevision||
    pointer.manifest_sha256!==expected.manifestSha256||pointer.config_sha256!==expected.configSha256||
    pointer.release!==`${expected.sourceRevision}-${expected.manifestSha256.slice(0,16)}`)throw fault('SUPERVISOR_HENRY_PIN_CHANGED');
  const releaseRoot=await confined(runtimeRoot,`releases/${pointer.release}`,false),
    manifestBytes=await readFile(await confined(releaseRoot,'manifest.json',false)),
    configBytes=await readFile(await confined(runtimeRoot,`config-${pointer.config_sha256}.json`,false));
  if(digest(manifestBytes)!==expected.manifestSha256||digest(configBytes)!==expected.configSha256)throw fault('SUPERVISOR_HENRY_PIN_CHANGED');
  const manifest=JSON.parse(manifestBytes),config=JSON.parse(configBytes),names=new Set();
  if(manifest.schema_version!=='mhc-native-runtime-manifest/v1'||manifest.source_revision!==expected.sourceRevision||
    config.schema_version!=='mhc-native-runtime-config/v1'||config.source_revision!==expected.sourceRevision||
    config.project_root!==ctx.projectRoot||config.runtime_root!==runtimeRoot||config.author_model!=='gpt-6-luna'||
    config.pipeline_version!=='mhc-evidence-author/v2')throw fault('SUPERVISOR_HENRY_PIN_CHANGED');
  for(const entry of manifest.files) {
    if(typeof entry.path!=='string'||names.has(entry.path)||!Number.isSafeInteger(entry.bytes)||!/^[a-f0-9]{64}$/.test(entry.sha256||''))
      throw fault('SUPERVISOR_HENRY_PIN_CHANGED');
    names.add(entry.path);const bytes=await readFile(await confined(releaseRoot,entry.path,false));
    if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)throw fault('SUPERVISOR_HENRY_PIN_CHANGED');
  }
  for(const required of ['scripts/lib/mhc-v2-author-session.mjs','scripts/lib/mhc-v2-service.mjs','scripts/lib/mhc-native-runner.mjs'])
    if(!names.has(required))throw fault('SUPERVISOR_HENRY_PIN_CHANGED');
  const load=relative=>import(pathToFileURL(path.join(releaseRoot,relative)).href),
    service=await load('scripts/lib/mhc-v2-service.mjs'),author=await load('scripts/lib/mhc-v2-author-session.mjs'),
    runner=await load('scripts/lib/mhc-native-runner.mjs');
  if(author.selectionBindingVersion!=='requested-reading/v1'||typeof service.selectAuthorWorkV2!=='function')
    throw fault('SUPERVISOR_HENRY_SELECTION_INTERFACE_REQUIRED');
  if(ctx.config.stage==='D'&&(author.historicalSelectionBindingVersion!=='historical-selection/v1'||
    service.historicalSelectionBindingVersion!=='historical-selection/v1'||typeof service.selectHistoricalAuthorWorkV2!=='function'))
    throw fault('SUPERVISOR_HENRY_HISTORICAL_INTERFACE_REQUIRED');
  const launcher=await confined(runtimeRoot,'launcher.mjs',false),launcherEntry=manifest.files.find(e=>e.path==='scripts/mhc-native-runtime-launcher.mjs');
  if(!launcherEntry||digest(await readFile(launcher))!==launcherEntry.sha256)throw fault('SUPERVISOR_HENRY_PIN_CHANGED');
  const native=await service.serviceContext({config,projectRoot:ctx.projectRoot,releaseRoot,runtimeRoot,
    launcher,manifestSha256:expected.manifestSha256});
  return {native,service,author,runner,pointer};
}
export async function runHenryWork(ctx,{journal,lease,wakeId,readingId,deadline,dailyDependency=null,historical=false},dependencies={}) {
  const clock=dependencies.clock||(()=>new Date()),binding=await (dependencies.binding||verifiedHenryContext)(ctx);
  await journal.assertLease(lease,clock());
  await (dependencies.transport||verifyChildTransport)(ctx);
  const budgetRoot=await confined(ctx.stateRoot,`wakes/${wakeId}/henry-reservations`);mkdirSync(budgetRoot,{recursive:true});
  const existing=readdirSync(budgetRoot).sort();
  if(existing.some((n,i)=>n!==`${String(i+1).padStart(3,'0')}.json`))throw fault('SUPERVISOR_HENRY_BUDGET_CORRUPT');
  for(const name of existing) {
    let record;try{record=JSON.parse(readFileSync(path.join(budgetRoot,name)));}catch{throw fault('SUPERVISOR_HENRY_BUDGET_CORRUPT');}
    if(record.wakeId!==wakeId||!['gpt-6-luna','gpt-5.6-luna'].includes(record.model))throw fault('SUPERVISOR_HENRY_BUDGET_CORRUPT');
  }
  let count=existing.length;
  const run=dependencies.run||spawnSync;
  const boundedRun=(executable,args,options)=>{
    const remaining=deadline-clock().getTime()-5*60*1000;
    if(remaining<15000)return {status:null,error:{code:'SUPERVISOR_CHILD_DEADLINE'},stdout:'',stderr:''};
    if(args[0]==='exec') {
      const model=args[args.indexOf('--model')+1],effort=model==='gpt-6-luna'?'medium':'low';
      if(!['gpt-6-luna','gpt-5.6-luna'].includes(model)||!args.includes('--ephemeral')||
        !args.includes(`model_reasoning_effort="${effort}"`)||!args.includes('forced_login_method="chatgpt"'))
        throw fault('SUPERVISOR_HENRY_MODEL_CHANGED');
      if(String(options.input||'').startsWith('Condense the supplied verified public-domain Henry source packet.')) {
        if(!String(options.input).includes(`"reading_id":"${readingId}"`)&&!String(options.input).includes(`"reading_id": "${readingId}"`))
          throw fault('SUPERVISOR_HENRY_SELECTED_READING_CHANGED');
        if(count>=32)throw fault('SUPERVISOR_HENRY_WAKE_BUDGET_EXHAUSTED');
        const file=path.join(budgetRoot,`${String(++count).padStart(3,'0')}.json`),handle=openSync(file,'wx',0o600);
        try{writeFileSync(handle,jsonBytes({schemaVersion:'supervisor-henry-reservation/v1',wakeId,readingId,model,effort,
          ordinal:count,inputSha256:digest(Buffer.from(options.input)),reservedAt:clock().toISOString()}));fsyncSync(handle);}finally{closeSync(handle);}
      }
    }
    return run(executable,args,{...options,env:childEnvironment(options.env),timeout:Math.min(options.timeout||30000,remaining)});
  };
  return binding.runner.withRunnerLock(binding.native,async()=>{
    if(typeof binding.author.selectionBindingVersion!=='string'||binding.author.selectionBindingVersion!=='requested-reading/v1')
      throw fault('SUPERVISOR_HENRY_SELECTION_INTERFACE_REQUIRED');
    if(typeof binding.service?.selectAuthorWorkV2!=='function')throw fault('SUPERVISOR_HENRY_SELECTION_INTERFACE_REQUIRED');
    if(historical&&(ctx.config.stage!=='D'||dailyDependency||binding.service.historicalSelectionBindingVersion!=='historical-selection/v1'||
      binding.author.historicalSelectionBindingVersion!=='historical-selection/v1'||typeof binding.service.selectHistoricalAuthorWorkV2!=='function'))
      throw fault('SUPERVISOR_HENRY_HISTORICAL_INTERFACE_REQUIRED');
    const request={requestedReadingId:readingId,...(dailyDependency?{requestedDailyWorkOrder:dailyDependency}:{})};
    // This is the retained controller's exact, read-only policy. The session
    // repeats it after capability preflight before any guarded state mutation.
    const selected=await (historical?binding.service.selectHistoricalAuthorWorkV2:binding.service.selectAuthorWorkV2)(binding.native,request,clock());
    if(selected.action!=='selected'||selected.readingId!==readingId)return selected;
    const lane=selected.authorLane;
    if(!['spark','luna'].includes(lane)||selected.requiredModel!==(lane==='spark'?'gpt-6-luna':'gpt-5.6-luna'))
      throw fault('SUPERVISOR_HENRY_MODEL_CHANGED');
    if(historical&&!selected.historicalAuthorization)throw fault('SUPERVISOR_HENRY_HISTORICAL_INTERFACE_REQUIRED');
    const result=await binding.author.runAuthorSession(historical?binding.native:{...binding.native,forwardOnly:true},{lane,
      codexExecutable:ctx.config.children.codexExecutable,maxReadings:1,...request,
      ...(historical?{requestedHistoricalAuthorization:selected.historicalAuthorization}:{})},{run:boundedRun,clock});
    await journal.assertLease(lease,clock());
    await journal.append('henry_adapter_result',{wakeId,readingId,action:result.action,state:result.state,
      code:result.code||null,reservations:count,sourceRevision:binding.pointer.source_revision,published:false},clock(),lease);
    return result;
  });
}
export async function prepareHenryDependency(ctx,{journal,lease,order,deadline},dependencies={}) {
  const clock=dependencies.clock||(()=>new Date()),binding=await (dependencies.binding||verifiedHenryContext)(ctx),readingId=order.reading.readingId;
  return binding.runner.withRunnerLock(binding.native,async()=>{
    await journal.assertLease(lease,clock());
    if(clock().getTime()>deadline-5*60*1000)throw fault('SUPERVISOR_CHILD_DEADLINE');
    const entry=binding.native.plan.entries.find(e=>e.readingId===readingId);
    if(!entry||entry.kind!=='chapter'||!forwardWindow(binding.native.plan,binding.native.appConfig,clock()).entries.some(e=>e.readingId===readingId))
      throw fault('SUPERVISOR_HENRY_DEPENDENCY_SCOPE_CHANGED');
    const daily=(await journal.load()).findLast(e=>e.kind==='daily_state'&&e.data.job?.readingId===readingId)?.data.job;
    if(!daily||daily.phase!=='waiting_henry'||daily.workOrder.sha256!==digest(jsonBytes(order)))throw fault('SUPERVISOR_HENRY_DEPENDENCY_AUTHORITY_REQUIRED');
    const raw=await readFile(await confined(ctx.projectRoot,daily.workOrder.path,false));
    if(digest(raw)!==daily.workOrder.sha256)throw fault('SUPERVISOR_HENRY_DEPENDENCY_AUTHORITY_CHANGED');
    const authorization={dailyJobId:daily.id,path:daily.workOrder.path,sha256:daily.workOrder.sha256};
    let job;try {job=await loadJob(await confined(binding.native.jobRoot,readingId,false));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(!job)return {state:{phase:'absent'},authorization};
    return {...await resumeApprovedHenry(ctx,binding,{journal,lease,readingId,now:clock(),job}),authorization};
  });
}
// Both callers already hold the retained native runner lock. An approval event
// may survive an interruption before transaction/library finalization. Resume
// that exact decision; never reserve another author or independent review.
async function resumeApprovedHenry(ctx,binding,{journal,lease,readingId,now,job:retained}) {
  const job=retained||await loadJob(await confined(binding.native.jobRoot,readingId,false));
  if(job.state.phase!=='approved')return job;
  await journal.assertLease(lease,now);
  const approvedSha256=job.state.review?.approved_sha256;
  if(!approvedSha256)throw fault('SUPERVISOR_HENRY_APPROVAL_REQUIRED');
  const approved=await readPrivate(job.directory,`approved/${approvedSha256}.json`),decision=await readPrivate(job.directory,'review.json');
  if(job.state.blocker||digestObject(approved)!==approvedSha256||approved.schema_version!=='mhc-evidence-approved/v2'||
    approved.reading_id!==readingId||approved.input_sha256!==job.input.input_sha256||
    approved.review_basis_sha256!==job.state.review.review_basis_sha256||approved.review?.review_basis_sha256!==approved.review_basis_sha256||
    digestObject(decision)!==digestObject(approved.review)||decision.status!=='approved'||!REVIEW_ASSERTIONS.every(k=>decision.assertions?.[k]===true))
    throw fault('SUPERVISOR_HENRY_APPROVAL_CHANGED');
  // buildReview checks the retained input, current source and every accepted
  // candidate before applyReviewV2 repeats those checks and its finalizer.
  await binding.service.buildReview(binding.native,readingId);
  const result=await binding.service.applyReviewV2(binding.native,readingId,now);
  await journal.assertLease(lease,now);
  const resumed=await loadJob(await confined(binding.native.jobRoot,readingId,false));
  if(result.action!=='publish_required'||resumed.state.phase!=='publishing'||resumed.state.review?.approved_sha256!==approvedSha256)
    throw fault('SUPERVISOR_HENRY_APPROVAL_CHANGED');
  await journal.append('henry_finalization_resumed',{readingId,inputSha256:job.input.input_sha256,approvedSha256,
    decisionSha256:digestObject(decision),action:result.action,published:false},now,lease);
  return resumed;
}
export async function prepareHenryPublication(ctx,{journal,lease,readingId,now=new Date()},dependencies={}) {
  const binding=await (dependencies.binding||verifiedHenryContext)(ctx);
  return binding.runner.withRunnerLock(binding.native,async()=>{
    await journal.assertLease(lease,now);
    const job=await resumeApprovedHenry(ctx,binding,{journal,lease,readingId,now});
    if(job.state.phase!=='publishing'||!job.state.review?.approved_sha256)throw fault('SUPERVISOR_HENRY_APPROVAL_REQUIRED');
    const library=await loadLatestHenryReading({libraryRoot:await confined(ctx.projectRoot,'private-commentary/mhc/stores/library',false),
      readingId,runtimeSchemaPath:path.join(ctx.releaseRoot,'schemas/mhc-runtime.schema.json')});
    const approvalPath=`private-content/automation/mhc-v2/${readingId}/approved/${job.state.review.approved_sha256}.json`,
      approvalBytes=await readFile(await confined(ctx.projectRoot,approvalPath,false)),approval=JSON.parse(approvalBytes);
    if(digestObject(approval)!==job.state.review.approved_sha256||digestObject(library.runtimes)!==digestObject(approval.results.map(r=>r.runtime)))
      throw fault('SUPERVISOR_HENRY_APPROVAL_CHANGED');
    const manifest=await readPrivate(ctx.projectRoot,'private-content/private-manifest.json');
    if(!manifest.readings?.[readingId])throw fault('SUPERVISOR_HENRY_DAILY_PREFIX_REQUIRED');
    const metadataPath=`private-content/bridge/celebration-y3q4/${readingId}.metadata.json`,
      previous=await readFile(await confined(ctx.projectRoot,metadataPath,false)),metadata=JSON.parse(previous);
    if(metadata.readingId!==readingId)throw fault('SUPERVISOR_HENRY_ATTACHMENT_CHANGED');
    delete metadata.verseCommentary;delete metadata.henrySourceLink;metadata.verseCommentaries=library.runtimes;
    if(digest(await readFile(await confined(ctx.projectRoot,metadataPath,false)))!==digest(previous))throw fault('SUPERVISOR_HENRY_ATTACHMENT_CHANGED');
    await durableWrite(ctx.projectRoot,metadataPath,jsonBytes(metadata),{immutable:false});
    const request={schemaVersion:'supervisor-publication-request/v1',readingId,component:'henry',approvalPath,approvalSha256:digest(approvalBytes)},
      requestPath=`private-content/automation/staging/${readingId}/supervisor/requests/${digest(jsonBytes(request))}.json`;
    await durableWrite(ctx.projectRoot,requestPath,jsonBytes(request));return {action:'publish_required',requestPath,readingId,published:false};
  });
}
export async function authorThreads(native,readingId) {
  const root=await confined(native.projectRoot,`private-content/automation/mhc-v2/${readingId}/model-executions`,false),threads=[];
  const job=await loadJob(await confined(native.projectRoot,`private-content/automation/mhc-v2/${readingId}`,false)),records=[],covered=new Set();
  for(const name of await readdir(root)) {
    if(!/^[a-f0-9]{64}$/.test(name))throw fault('SUPERVISOR_HENRY_AUTHOR_PROOF_CHANGED');
    const record=await readPrivate(root,`${name}/result.json`);if(record.status!=='completed')continue;
    const response=await readPrivate(root,`${name}/response.json`),packet=job.input.chapters.flatMap(c=>c.batches)
      .find(p=>digestObject(p)===record.proof?.packet_sha256),session=job.state.sessions[record.session];
    if(!packet||!session||record.candidate_sha256!==digestObject(response)||
      record.proof.source_archive_sha256!==job.input.source_archive_sha256||record.proof.public_domain_commentary_only!==true||
      record.proof.model!==job.state.models[session.lane]||record.proof.reasoning_effort!==(session.lane==='spark'?'medium':'low'))
      throw fault('SUPERVISOR_HENRY_AUTHOR_PROOF_CHANGED');
    const events=(await readFile(await confined(root,`${name}/events.jsonl`,false),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
    const starts=events.filter(e=>e.type==='thread.started');
    if(starts.length!==1||!starts[0].thread_id||events.filter(e=>e.type==='turn.completed').length!==1||
      events.some(e=>['turn.failed','error'].includes(e.type)||e.item?.type&&!['agent_message','reasoning'].includes(e.item.type)))
      throw fault('SUPERVISOR_HENRY_AUTHOR_PROOF_CHANGED');
    records.push({packetId:packet.packet_id,lane:session.lane,candidateHash:digestObject(response)});threads.push(starts[0].thread_id);
  }
  for(const chapter of job.input.chapters)for(const packet of chapter.batches)for(const lane of ['spark','luna']) {
    const key=`${packet.packet_id}:${lane}`,accepted=job.state.accepted[key],hashes=[...(job.state.rejected[key]||[])];
    if(accepted)hashes.push(accepted.editorial_repair_sha256?
      job.state.history.find(e=>e.kind==='editorial_repair'&&e.packet_id===packet.packet_id)?.rejected_sha256:accepted.candidate_sha256);
    for(const hash of hashes) {
      if(!hash)throw fault('SUPERVISOR_HENRY_AUTHOR_PROOF_REQUIRED');
      const attempt=await readPrivate(job.directory,`attempts/${hash}.json`);
      if(digest(Buffer.from(attempt.bytes))!==hash)throw fault('SUPERVISOR_HENRY_AUTHOR_PROOF_CHANGED');
      const value=JSON.parse(attempt.bytes);
      if(!records.some(r=>r.packetId===packet.packet_id&&r.lane===lane&&r.candidateHash===digestObject(value)))
        throw fault('SUPERVISOR_HENRY_AUTHOR_PROOF_REQUIRED');
      covered.add(key);
    }
  }
  if(Object.keys(job.state.accepted).some(key=>!covered.has(key)))throw fault('SUPERVISOR_HENRY_AUTHOR_PROOF_REQUIRED');
  if(!threads.length)throw fault('SUPERVISOR_HENRY_AUTHOR_PROOF_REQUIRED');return [...new Set(threads)];
}
async function reviewScope(ctx,native,readingId,now,dependencies) {
  const window=forwardWindow(native.plan,native.appConfig,now),entry=native.plan.entries.find(e=>e.readingId===readingId);
  if(window.entries.some(e=>e.readingId===readingId))return;
  if(!entry||entry.dayIndex>=window.currentDay||
    measuredBuffer(native.plan,native.appConfig,await (dependencies.health||authenticatedForwardHealth)(ctx,now),now).status!=='ready'||
    !(await readPrivate(ctx.projectRoot,'private-content/private-manifest.json')).readings?.[readingId])
    throw fault('SUPERVISOR_HENRY_REVIEW_SCOPE_CHANGED');
}
export async function repairHenryWork(ctx,{journal,lease,readingId,deadline},dependencies={}) {
  const clock=dependencies.clock||(()=>new Date()),binding=await (dependencies.binding||verifiedHenryContext)(ctx);
  return binding.runner.withRunnerLock(binding.native,async()=>{
    await journal.assertLease(lease,clock());await reviewScope(ctx,binding.native,readingId,clock(),dependencies);
    const job=await loadJob(await confined(binding.native.jobRoot,readingId,false));
    if(job.state.phase!=='editorial_attention')throw fault('SUPERVISOR_HENRY_EDITORIAL_PHASE_CHANGED');
    const packet=job.input.chapters.flatMap(c=>c.batches).find(p=>p.packet_id===job.state.blocker?.packet_id);
    if(!packet||job.state.history.some(e=>e.kind==='editorial_repair'&&e.packet_id===packet.packet_id))
      throw fault('SUPERVISOR_HENRY_EDITORIAL_REPAIR_EXHAUSTED');
    const chapter=job.input.chapters.find(c=>c.batches.includes(packet)),lane=job.state.owners[`${chapter.book_id}.${chapter.chapter}`],
      key=`${packet.packet_id}:${lane}`,rejectedSha256=job.state.blocker.candidate_sha256||job.state.rejected[key]?.at(-1),
      attempt=await readPrivate(job.directory,`attempts/${rejectedSha256}.json`);
    if(digest(Buffer.from(attempt.bytes))!==rejectedSha256)throw fault('SUPERVISOR_HENRY_EDITORIAL_BASIS_CHANGED');
    const original=JSON.parse(attempt.bytes);assertSchemaValid(original,candidateSchema,{label:'Complete original editorial candidate'});
    if(original.records.length!==packet.requests.length||original.records.some((r,i)=>r.verse_id!==packet.requests[i].verse_id))
      throw fault('SUPERVISOR_HENRY_EDITORIAL_NO_SUBSTANTIVE_DRAFT');
    const entry=binding.native.plan.entries.find(e=>e.readingId===readingId),source=await binding.service.sourceInput(binding.native,entry);
    if(source.input.input_sha256!==job.input.input_sha256)throw fault('SUPERVISOR_HENRY_EDITORIAL_BASIS_CHANGED');
    const input={schemaVersion:'supervisor-henry-editorial-input/v1',readingId,inputSha256:job.input.input_sha256,
      rejectedSha256,packet,original,findings:job.state.blocker.findings||[],allowedRepairCount:1};
    assertChildPrivacy(input);
    const authorIds=await (dependencies.authorThreads||authorThreads)(binding.native,readingId),repair=await (dependencies.child||executeBoundedChild)(ctx,
      {journal,lease,jobId:`henry-editorial-${job.input.input_sha256}-${packet.packet_id}`,readingId,kind:'henry-editorial-repair',packet:input,
        schema:henryRepairContract(input),deadline,authorThreadIds:authorIds,
        prompt:`Perform the one permitted substantive editorial repair of this complete original candidate. Compare every sentence with exact cited public-domain atoms. Preserve original verse scope and all material identities, relationships, qualifications and alternatives. Return candidateJson using the exact mhc-evidence-candidate/v2 schema; no tools, external material or publication. If no safe complete repair exists, return blocked. inputSha256 ${digest(jsonBytes(input))}.\n${JSON.stringify({...input,candidateSchema})}`},dependencies.exec);
    if(repair.output.verdict!=='repaired')throw fault('SUPERVISOR_HENRY_EDITORIAL_REPAIR_BLOCKED');
    const candidate=JSON.parse(repair.output.candidateJson);assertChildPrivacy(candidate);
    if(!validateCandidate(candidate,packet).valid)throw fault('SUPERVISOR_HENRY_EDITORIAL_REPAIR_INVALID');
    const decision={schema_version:'mhc-evidence-editorial-repair/v2',input_sha256:job.input.input_sha256,rejected_sha256:rejectedSha256,
      status:'approved',reviewer:`Sol 6.1 high source-bound repair ${repair.execution.id}`,reviewed_at:clock().toISOString(),findings:repair.output.findings,candidate};
    await journal.assertLease(lease,clock());
    const current=await loadJob(job.directory);
    if(current.previous!==job.previous)throw fault('SUPERVISOR_HENRY_EDITORIAL_BASIS_CHANGED');
    await durableWrite(ctx.projectRoot,`private-content/automation/mhc-v2/${readingId}/editorial-repair.json`,jsonBytes(decision),{immutable:false});
    const result=await binding.service.editorialRepairV2(binding.native,readingId,clock());
    await journal.append('henry_editorial_repair',{readingId,executionId:repair.execution.id,threadId:repair.execution.threadId,
      packetId:packet.packet_id,rejectedSha256,decisionSha256:digest(jsonBytes(decision))},clock(),lease);
    return result;
  });
}
export async function reviewHenryWork(ctx,{journal,lease,readingId,deadline},dependencies={}) {
  const clock=dependencies.clock||(()=>new Date()),binding=await (dependencies.binding||verifiedHenryContext)(ctx);
  return binding.runner.withRunnerLock(binding.native,async()=>{
    const {job,entry,bundle}=await binding.service.buildReview(binding.native,readingId);
    await reviewScope(ctx,binding.native,readingId,clock(),dependencies);
    const threadIds=await (dependencies.authorThreads||authorThreads)(binding.native,readingId);
    for(const event of await journal.load())if(event.kind==='henry_editorial_repair'&&event.data.readingId===readingId)threadIds.push(event.data.threadId);
    const packet={
      schemaVersion:'supervisor-henry-review-input/v1',readingId,reading:entry,reviewBasis:bundle};
    assertChildPrivacy(packet);
    const review=await (dependencies.child||executeBoundedChild)(ctx,{journal,lease,jobId:`henry-${job.input.input_sha256}-${bundle.review_basis_sha256}`,
      readingId,kind:'independent-review',packet,schema:independentReviewContract(packet,{henryAssertions:REVIEW_ASSERTIONS}),deadline,
      authorThreadIds:threadIds,prompt:`Independently compare every requested verse and every sentence with its exact cited public-domain source atoms. Preserve scope, identities, qualifications, alternatives and direct readable prose. No tools or outside material. Never approve merely because JSON validates. If changes require another author pass, identify one exact repairPacketId from source_packets. Approved prose corrections must name real verse IDs. Return inputSha256 ${digest(jsonBytes(packet))}.\n${JSON.stringify(packet)}`},dependencies.exec);
    await journal.assertLease(lease,clock());
    const base={reading_id:readingId,review_basis_sha256:bundle.review_basis_sha256,reviewer:`Sol 6.1 high independent execution ${review.execution.id}`,
      reviewed_at:clock().toISOString(),findings:review.output.findings};
    if(review.output.verdict==='approved'&&REVIEW_ASSERTIONS.every(k=>review.output.assertions[k]===true)) {
      const decision={schema_version:'mhc-evidence-approval/v2',...base,status:'approved',assertions:review.output.assertions,
        corrections:review.output.corrections.map(c=>({verse_id:c.verseId,blurb:c.replacement,reason:c.reason}))};
      await durableWrite(ctx.projectRoot,`private-content/automation/mhc-v2/${readingId}/review.json`,jsonBytes(decision),{immutable:false});
      const result=await binding.service.applyReviewV2(binding.native,readingId,clock());
      await journal.append('henry_independent_review',{readingId,executionId:review.execution.id,threadId:review.execution.threadId,
        reviewBasisSha256:bundle.review_basis_sha256,decisionSha256:digest(jsonBytes(decision)),action:result.action,published:false},clock(),lease);
      return result;
    }
    if(review.output.verdict==='changes_requested'&&bundle.source_packets.some(p=>p.packet_id===review.output.repairPacketId)) {
      const decision={schema_version:'mhc-evidence-review-decision/v2',...base,status:'changes_requested',packet_id:review.output.repairPacketId};
      await durableWrite(ctx.projectRoot,`private-content/automation/mhc-v2/${readingId}/review.json`,jsonBytes(decision),{immutable:false});
      return binding.service.requestEditorialV2(binding.native,readingId,clock());
    }
    throw fault('SUPERVISOR_HENRY_SUBSTANTIVE_REVIEW_BLOCKED');
  });
}
