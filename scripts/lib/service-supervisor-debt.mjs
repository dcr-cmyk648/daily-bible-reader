import {readFile} from 'node:fs/promises';
import {loadJob} from './mhc-v2-store.mjs';
import {REVIEW_ASSERTIONS,digestObject,validateCandidate} from './mhc-v2.mjs';
import {reviewMechanicalFindings,mechanicalFindings} from './service-supervisor-henry.mjs';
import {confined,readPrivate,durableWrite,jsonBytes,digest,fault} from './service-supervisor-store.mjs';

const latestExecutions=events=>[...events.filter(e=>e.kind==='execution_state')
  .reduce((m,e)=>m.set(e.data.execution.id,e.data.execution),new Map()).values()];
const markers=events=>new Map(events.filter(e=>e.kind==='henry_terminal_debt').map(e=>[e.data.readingId,e.data]));
const candidateBasis=job=>digest(jsonBytes({inputSha256:job.input.input_sha256,
  accepted:Object.entries(job.state.accepted).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,value.candidate_sha256])}));
async function checkedBytes(ctx,ref) {
  const raw=await readFile(await confined(ctx.stateRoot,ref.path,false));
  if(digest(raw)!==ref.sha256)throw fault('SUPERVISOR_HENRY_DEBT_PROOF_CHANGED');return raw;
}
async function checkedExecution(ctx,execution) {
  for(const ref of [execution.output,execution.admission,execution.admissionRejected].filter(Boolean))await checkedBytes(ctx,ref);
}
async function checkedProof(ctx,journal,marker) {
  const proof=JSON.parse(await checkedBytes(ctx,marker.proof)),executions=latestExecutions(await journal.load());
  if(proof.schemaVersion!=='supervisor-henry-terminal-debt/v1'||proof.readingId!==marker.readingId||
    proof.code!==marker.code||proof.executions.length!==2)throw fault('SUPERVISOR_HENRY_DEBT_PROOF_CHANGED');
  for(const saved of proof.executions) {
    const current=executions.find(e=>e.id===saved.id);
    if(!current||digest(jsonBytes(current))!==saved.executionSha256||current.phase!=='failed'||
      current.jobId!==proof.jobId||current.kind!==proof.kind)throw fault('SUPERVISOR_HENRY_DEBT_PROOF_CHANGED');
    await checkedBytes(ctx,saved.packet);await checkedExecution(ctx,current);
  }
  return proof;
}
async function currentReview(binding,readingId) {
  const value=await binding.service.buildReview(binding.native,readingId),pipeline=binding.pipeline||await import('./mhc-pipeline.mjs');
  return {...value,mechanical:reviewMechanicalFindings(value.bundle,pipeline)};
}
async function currentEditorial(binding,job) {
  const packet=job.input.chapters.flatMap(c=>c.batches).find(p=>p.packet_id===job.state.blocker?.packet_id);
  if(!packet)throw fault('SUPERVISOR_HENRY_DEBT_PROOF_CHANGED');
  const chapter=job.input.chapters.find(c=>c.batches.includes(packet)),lane=job.state.owners[`${chapter.book_id}.${chapter.chapter}`],
    rejectedSha256=job.state.blocker.candidate_sha256||job.state.rejected[`${packet.packet_id}:${lane}`]?.at(-1),
    stored=await readPrivate(job.directory,`attempts/${rejectedSha256}.json`),original=JSON.parse(stored.bytes),validation=validateCandidate(original,packet);
  if(digest(Buffer.from(stored.bytes))!==rejectedSha256||original.records?.length!==packet.requests.length||
    original.records.some((r,i)=>r.verse_id!==packet.requests[i].verse_id)||!validation.records?.length)
    throw fault('SUPERVISOR_HENRY_DEBT_PROOF_CHANGED');
  const entry=binding.native.plan.entries.find(e=>e.readingId===job.input.reading_id),source=await binding.service.sourceInput(binding.native,entry);
  if(source.input.input_sha256!==job.input.input_sha256)throw fault('SUPERVISOR_HENRY_DEBT_PROOF_CHANGED');
  const packetInput={schemaVersion:'supervisor-henry-editorial-input/v1',readingId:job.input.reading_id,inputSha256:job.input.input_sha256,
    rejectedSha256,packet,original,findings:job.state.blocker.findings||[],allowedRepairCount:1},pipeline=binding.pipeline||await import('./mhc-pipeline.mjs');
  return {job,packetInput,packetId:packet.packet_id,rejectedSha256,mechanical:mechanicalFindings(validation.records,
    Object.fromEntries(packet.evidence.map(e=>[e.evidence_id,{text:e.text}])),pipeline,()=>packet.packet_id)};
}
async function approvedNative(job) {
  if(!['approved','publishing','published'].includes(job.state.phase)||!job.state.review)return false;
  const approved=await readPrivate(job.directory,`approved/${job.state.review.approved_sha256}.json`);
  if(digestObject(approved)!==job.state.review.approved_sha256||approved.input_sha256!==job.input.input_sha256||
    approved.review_basis_sha256!==job.state.review.review_basis_sha256||approved.review?.status!=='approved'||
    !REVIEW_ASSERTIONS.every(k=>approved.review.assertions?.[k]===true))throw fault('SUPERVISOR_HENRY_DEBT_PROOF_CHANGED');
  return true; // Existing native source/library/publication gates still apply.
}
export async function retainedHenryDebt(ctx,{journal,binding,job}) {
  const marker=markers(await journal.load()).get(job.input.reading_id);if(!marker)return null;
  const proof=await checkedProof(ctx,journal,marker);
  if(await approvedNative(job)) {
    const entry=binding.native.plan.entries.find(e=>e.readingId===job.input.reading_id),source=await binding.service.sourceInput(binding.native,entry);
    if(source.input.input_sha256!==job.input.input_sha256)throw fault('SUPERVISOR_HENRY_DEBT_PROOF_CHANGED');
    return null;
  }
  if(proof.kind==='henry-editorial-repair') {
    if(job.input.input_sha256===proof.nativeInputSha256&&job.state.history.some(e=>e.kind==='editorial_repair'&&
      e.packet_id===proof.packetId&&e.rejected_sha256===proof.rejectedSha256)) {
      const source=await binding.service.sourceInput(binding.native,binding.native.plan.entries.find(e=>e.readingId===job.input.reading_id)),
        accepted=Object.entries(job.state.accepted).find(([key])=>key.startsWith(`${proof.packetId}:`))?.[1],
        packet=job.input.chapters.flatMap(c=>c.batches).find(p=>p.packet_id===proof.packetId);
      if(source.input.input_sha256===proof.nativeInputSha256&&accepted&&packet) {
        const stored=await readPrivate(job.directory,`attempts/${accepted.candidate_sha256}.json`),validation=validateCandidate(JSON.parse(stored.bytes),packet),
          pipeline=binding.pipeline||await import('./mhc-pipeline.mjs');
        if(digest(Buffer.from(stored.bytes))!==accepted.candidate_sha256)throw fault('SUPERVISOR_HENRY_DEBT_PROOF_CHANGED');
        const findings=mechanicalFindings(validation.records||[],Object.fromEntries(packet.evidence.map(e=>[e.evidence_id,{text:e.text}])),pipeline,()=>packet.packet_id);
        if(validation.valid&&proof.mechanicalFindings.some(f=>!findings.some(n=>n.code===f.code&&n.verseId===f.verseId)))return null;
      }
    }
    return {code:job.previous===proof.nativeEventSha256?proof.code:'SUPERVISOR_HENRY_TERMINAL_BASIS_CHANGED',scope:'reading',terminal:true,
      proof:marker.proof,originalCode:proof.code,resumption:'verified native approval or meaningful admitted correction of the original rejected packet; no budget reset'};
  }
  const current=await currentReview(binding,job.input.reading_id),sameCandidates=candidateBasis(current.job)===proof.candidateBasisSha256;
  if(!sameCandidates&&current.job.input.input_sha256===proof.nativeInputSha256) {
    // A history-only event or an unrelated/trivial candidate change cannot
    // manufacture a new reviewer budget. Only a native applied repair that
    // resolves an original mandatory finding can supersede this scoped debt.
    const meaningful=proof.mechanicalFindings.some(f=>!current.mechanical.some(n=>n.code===f.code&&n.verseId===f.verseId)&&
      current.job.state.history.some(e=>e.kind==='editorial_repair'&&e.packet_id===f.packetId&&
        Object.entries(proof.acceptedCandidates).some(([key,sha])=>key.startsWith(`${f.packetId}:`)&&sha===e.rejected_sha256)));
    if(meaningful&&current.job.state.phase==='review_pending')return null;
  }
  const same=current.job.previous===proof.nativeEventSha256&&current.bundle.review_basis_sha256===proof.reviewBasisSha256&&
    current.job.input.input_sha256===proof.nativeInputSha256&&sameCandidates;
  return {code:same?proof.code:'SUPERVISOR_HENRY_TERMINAL_BASIS_CHANGED',scope:'reading',terminal:true,
    proof:marker.proof,originalCode:proof.code,resumption:'verified native approval or meaningful admitted native correction of an original finding; no budget reset'};
}
export async function retainExhaustedHenryReviews(ctx,{journal,lease,binding,readingIds,clock}) {
  const events=await journal.load(),executions=latestExecutions(events),saved=markers(events);
  for(const readingId of readingIds) {
    const directory=await confined(binding.native.jobRoot,readingId),job=await loadJob(directory).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(!job||!['review_pending','editorial_attention'].includes(job.state.phase)||saved.has(readingId))continue;
    if(job.state.phase==='editorial_attention') {
      const jobId=`henry-editorial-${job.input.input_sha256}-${job.state.blocker?.packet_id}`,
        values=executions.filter(e=>e.jobId===jobId&&e.kind==='henry-editorial-repair').sort((a,b)=>a.ordinal-b.ordinal);
      if(values.length!==2||values.some((e,i)=>e.phase!=='failed'||e.ordinal!==i+1))continue;
      const current=await currentEditorial(binding,job),inputSha256=digest(jsonBytes(current.packetInput)),refs=[];
      for(const execution of values) {
        const relative=`executions/${execution.id}/packet.json`,raw=await readFile(await confined(ctx.stateRoot,relative,false)),{repairPlan,...base}=JSON.parse(raw);
        if(digest(raw)!==execution.inputSha256||digest(jsonBytes(base))!==inputSha256||
          execution.inputSha256!==inputSha256&&execution.repairOfInputSha256!==inputSha256)throw fault('SUPERVISOR_HENRY_DEBT_PROOF_CHANGED');
        await checkedExecution(ctx,execution);refs.push({id:execution.id,ordinal:execution.ordinal,executionSha256:digest(jsonBytes(execution)),
          packet:{path:relative,sha256:digest(raw)},output:execution.output||null});
      }
      const proof={schemaVersion:'supervisor-henry-terminal-debt/v1',readingId,component:'henry',kind:'henry-editorial-repair',jobId,
        code:'SUPERVISOR_CHILD_REPAIR_EXHAUSTED',nativeInputSha256:job.input.input_sha256,nativeEventSha256:job.previous,
        packetId:current.packetId,rejectedSha256:current.rejectedSha256,mechanicalFindings:current.mechanical,executions:refs,approvalGranted:false,budgetReset:false},
        raw=jsonBytes(proof),relative=`henry-debt/${readingId}/${digest(raw)}.json`;
      await journal.assertLease(lease,clock());await durableWrite(ctx.stateRoot,relative,raw);
      await journal.append('henry_terminal_debt',{readingId,component:'henry',code:proof.code,proof:{path:relative,sha256:digest(raw)},scope:'reading',terminal:true},clock(),lease);
      continue;
    }
    // Do not inspect unrelated source artifacts until a reading actually has
    // two certain failed reviews. Capability/uncertainty remains a global guard.
    if(executions.filter(e=>e.readingId===readingId&&e.kind==='independent-review'&&e.phase==='failed').length<2)continue;
    const current=await currentReview(binding,readingId),jobId=`henry-${job.input.input_sha256}-${current.bundle.review_basis_sha256}`,
      values=executions.filter(e=>e.jobId===jobId&&e.kind==='independent-review').sort((a,b)=>a.ordinal-b.ordinal);
    if(values.length!==2||values.some((e,i)=>e.phase!=='failed'||e.ordinal!==i+1))continue;
    if(current.mechanical.some(f=>f.packetId&&!job.state.history.some(e=>e.kind==='editorial_repair'&&e.packet_id===f.packetId)))continue;
    const packet={schemaVersion:'supervisor-henry-review-input/v1',readingId,reading:current.entry,reviewBasis:current.bundle},inputSha256=digest(jsonBytes(packet)),refs=[];
    for(const execution of values) {
      const relative=`executions/${execution.id}/packet.json`,raw=await readFile(await confined(ctx.stateRoot,relative,false)),value=JSON.parse(raw),
        {repairPlan,...base}=value;
      if(digest(raw)!==execution.inputSha256||digest(jsonBytes(base))!==inputSha256||
        execution.inputSha256!==inputSha256&&execution.repairOfInputSha256!==inputSha256)throw fault('SUPERVISOR_HENRY_DEBT_PROOF_CHANGED');
      await checkedExecution(ctx,execution);
      refs.push({id:execution.id,ordinal:execution.ordinal,executionSha256:digest(jsonBytes(execution)),
        packet:{path:relative,sha256:digest(raw)},output:execution.output||null});
    }
    const proof={schemaVersion:'supervisor-henry-terminal-debt/v1',readingId,component:'henry',kind:'independent-review',jobId,
      code:'SUPERVISOR_CHILD_REPAIR_EXHAUSTED',nativeInputSha256:job.input.input_sha256,nativeEventSha256:job.previous,
      reviewBasisSha256:current.bundle.review_basis_sha256,candidateBasisSha256:candidateBasis(job),
      acceptedCandidates:Object.fromEntries(Object.entries(job.state.accepted).map(([key,value])=>[key,value.candidate_sha256])),
      mechanicalFindings:current.mechanical,executions:refs,approvalGranted:false,budgetReset:false},raw=jsonBytes(proof),
      relative=`henry-debt/${readingId}/${digest(raw)}.json`;
    await journal.assertLease(lease,clock());await durableWrite(ctx.stateRoot,relative,raw);
    await journal.append('henry_terminal_debt',{readingId,component:'henry',code:proof.code,
      proof:{path:relative,sha256:digest(raw)},scope:'reading',terminal:true},clock(),lease);
  }
}
