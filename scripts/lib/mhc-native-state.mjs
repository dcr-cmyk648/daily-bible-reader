import {mkdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import {sha256, stableJson} from "./mhc-pipeline.mjs";
import {assertSchemaValid} from "./schema-validator.mjs";
import {SPARK, LUNA} from "./mhc-native-worker.mjs";

export const LEDGER_VERSION = "mhc-native-ledger/v1";
export const PAIR_VERSION = "mhc-native-pair/v1";
export const SUBMIT_ATTEMPTS_VERSION = "mhc-native-submit-attempts/v1";
export const DETROIT = "America/Detroit";
export const SLOT_GRACE_MS = 10 * 60 * 1000;
export const LOCK_STALE_MS = 2 * 60 * 1000;

const parts = (date) => Object.fromEntries(new Intl.DateTimeFormat("en-US", {timeZone: DETROIT, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23"}).formatToParts(new Date(date)).filter(x => x.type !== "literal").map(x => [x.type, x.value]));
const utcForDetroit = (year, month, day, hour, minute) => {
  // Iterating the offset is bounded and delegates DST to the platform zone database.
  const target = Date.UTC(year, Number(month)-1, Number(day), hour, minute);
  let ms = target;
  for (let tries=0; tries<4; tries+=1) {
    const p=parts(ms), local=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);
    const delta=target-local;
    if (delta===0) return new Date(ms).toISOString();
    ms+=delta;
  }
  return null; // Spring-forward local wall times do not exist.
};
export const SPARK_SLOT_MINUTES = [5 * 60 + 15, 11 * 60 + 15, 17 * 60 + 15, 23 * 60 + 15];
export function currentLedgerEvents({events, planVersion, workItemIds}) {
  const allowed = new Set(workItemIds);
  return (events || []).filter((event) => event.plan_version === planVersion && allowed.has(event.work_item_id));
}
export function latestDetroitSparkSlot(now, slotMinutes = SPARK_SLOT_MINUTES) {
  const p = parts(now), candidates = [];
  for (const delta of [-1,0]) { const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + delta)); const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,"0"), day=String(d.getUTCDate()).padStart(2,"0"); for (const total of slotMinutes) { const slot=utcForDetroit(y,m,day,Math.floor(total / 60),total % 60); if(slot)candidates.push(slot); } }
  return candidates.filter(x => Date.parse(x) <= Date.parse(now)).sort().at(-1);
}
export function deriveChapterDecision({events, orderedChunkIds, now, slotGraceMs = SLOT_GRACE_MS}) {
  const ordered=[...events].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const blocking=ordered.find(e=>["deterministic_failure","source_failure","schema_failure","review_failure"].includes(e.outcome));
  if (blocking) return {owner:null,blocked:true,reason:blocking.outcome};
  const transfer=ordered.find(e=>e.model===SPARK && ["model_failure","missed_primary","stale_primary"].includes(e.outcome));
  if (transfer) {
    const lunaValidated=new Set(ordered.filter(e=>e.model===LUNA&&e.outcome==="validated").map(e=>e.chunk_id));
    const nextLuna=orderedChunkIds.find(id=>!lunaValidated.has(id));
    if (!nextLuna) return {owner:LUNA,complete:true,blocked:false,reason:"complete"};
    return {owner:LUNA,restart:true,blocked:false,reason:transfer.outcome,nextChunkId:nextLuna};
  }
  const validated=new Set(ordered.filter(e=>e.model===SPARK&&e.outcome==="validated").map(e=>e.chunk_id));
  const nextChunkId=orderedChunkIds.find(id=>!validated.has(id));
  if (!nextChunkId) return {owner:SPARK,complete:true,blocked:false,reason:"complete"};
  const slot=latestDetroitSparkSlot(now);
  const knownChunks=new Set(orderedChunkIds);
  const primaryProgress=ordered.some(e=>e.model===SPARK&&e.outcome==="validated"&&e.primary_slot===slot&&knownChunks.has(e.chunk_id));
  if (primaryProgress) return {owner:null,restart:false,blocked:false,reason:"primary_slot_complete",nextChunkId,primary_slot:slot};
  const sparkForSlot=ordered.filter(e=>e.model===SPARK&&e.chunk_id===nextChunkId&&e.primary_slot===slot);
  const active=sparkForSlot.at(-1);
  if (active?.outcome==="leased" && Date.parse(now)>=Date.parse(slot)+slotGraceMs) return {owner:LUNA,restart:true,blocked:false,reason:"stale_primary",nextChunkId:orderedChunkIds[0],transferChunkId:nextChunkId,primary_slot:slot};
  if (!active && Date.parse(now)>=Date.parse(slot)+slotGraceMs) return {owner:LUNA,restart:true,blocked:false,reason:"missed_primary",nextChunkId:orderedChunkIds[0],transferChunkId:nextChunkId,primary_slot:slot};
  return {owner:SPARK,restart:false,blocked:false,reason:"primary_pending",nextChunkId,primary_slot:slot};
}
export function makeLedgerEvent(fields) { const event={...fields}; event.event_id ||= `MHNLE-${sha256(stableJson({...fields, event_id:undefined})).slice(0,32)}`; return event; }
export function nativePairDigest(pair) {
  const {pair_sha256: _digest, ...identity} = pair || {};
  return sha256(stableJson(identity));
}
export function nativePairId({planVersion, primaryAutomationId, primarySlot}) {
  return `MHNP-${sha256(stableJson({planVersion, primaryAutomationId, primarySlot})).slice(0,32)}`;
}
export function makeNativePairSelection({planVersion, readingId, scheduleDate, primaryAutomationId, primarySlot, selectedAt}) {
  const pair={schema_version:PAIR_VERSION,pair_id:nativePairId({planVersion,primaryAutomationId,primarySlot}),pair_sha256:"",plan_version:planVersion,reading_id:readingId,schedule_date:scheduleDate,primary_automation_id:primaryAutomationId,primary_slot:primarySlot,selected_at:selectedAt,state:"selected",source_state:[],code:null};
  pair.pair_sha256=nativePairDigest(pair);
  return pair;
}
export function transitionNativePair(pair, {state, sourceState = [], code = null}) {
  if (!pair || pair.pair_sha256 !== nativePairDigest(pair) || pair.state !== "selected" || !["ready","blocked"].includes(state)) {
    throw new Error("Native pair transition is stale or invalid.");
  }
  if (state === "ready" && (!Array.isArray(sourceState) || !sourceState.length || code !== null)) throw new Error("Ready native pair requires exact source state.");
  if (state === "blocked" && (!/^[A-Z0-9_:-]{1,120}$/.test(String(code || "")) || sourceState.length)) throw new Error("Blocked native pair requires one safe code.");
  const next={...pair,state,source_state:structuredClone(sourceState),code};
  next.pair_sha256=nativePairDigest(next);
  return next;
}
export function assertNativePair(pair, pairSchema) {
  assertSchemaValid(pair,pairSchema,{label:"Native pair state"});
  if (pair.pair_id !== nativePairId({planVersion:pair.plan_version,primaryAutomationId:pair.primary_automation_id,primarySlot:pair.primary_slot}) || pair.pair_sha256 !== nativePairDigest(pair)) throw new Error("Native pair state hash or identity is invalid.");
  if ((pair.state==="selected"&&(pair.source_state.length||pair.code!==null)) ||
      (pair.state==="ready"&&(!pair.source_state.length||pair.code!==null)) ||
      (pair.state==="blocked"&&(pair.source_state.length||typeof pair.code!=="string"))) throw new Error("Native pair state payload is invalid.");
  const chapters=new Set();
  for(const chapter of pair.source_state){if(chapters.has(chapter.chapter))throw new Error("Native pair source state contains a duplicate chapter.");chapters.add(chapter.chapter);const chunks=new Set();for(const chunk of chapter.chunks){if(chunks.has(chunk.chunk_id))throw new Error("Native pair source state contains a duplicate chunk.");chunks.add(chunk.chunk_id);}}
  return pair;
}
export async function readNativePair({root, pairId, pairSchema}) {
  if (!/^MHNP-[a-f0-9]{32}$/.test(String(pairId || ""))) throw new Error("Invalid native pair ID.");
  const target=path.join(path.resolve(root),"pairs",`${pairId}.json`);
  try { return assertNativePair(JSON.parse(await readFile(target,"utf8")),pairSchema); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
export async function writeNativePair({root, pair, pairSchema, lockStaleMs = LOCK_STALE_MS}) {
  assertNativePair(pair,pairSchema);
  if (!Number.isSafeInteger(lockStaleMs) || lockStaleMs < 0) throw new Error("Native pair lock stale interval is invalid.");
  const pairDir=path.join(path.resolve(root),"pairs"),target=path.join(pairDir,`${pair.pair_id}.json`),lock=`${target}.lock`;
  await mkdir(pairDir,{recursive:true,mode:0o700});
  try { await mkdir(lock,{mode:0o700}); } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const age=Date.now()-(await stat(lock)).mtimeMs;
    if (age <= lockStaleMs) throw new Error("Native pair lock is active.");
    await rm(lock,{recursive:true,force:true});
    await mkdir(lock,{mode:0o700});
  }
  try {
    const current=await readNativePair({root,pairId:pair.pair_id,pairSchema});
    if (current) {
      const identityKeys=["pair_id","plan_version","reading_id","schedule_date","primary_automation_id","primary_slot","selected_at"];
      if (identityKeys.some((key)=>current[key]!==pair[key])) throw new Error("Native pair selection is mismatched.");
      if (current.pair_sha256===pair.pair_sha256) return {pair:current,written:false};
      if (current.state!=="selected"||!["ready","blocked"].includes(pair.state)) throw new Error("Native pair state cannot be reinterpreted.");
    }
    const temp=path.join(pairDir,`.${pair.pair_id}.${process.pid}.${Date.now()}.tmp`);
    await writeFile(temp,`${JSON.stringify(pair,null,2)}\n`,{mode:0o600,flag:"wx"});
    await rename(temp,target);
    return {pair,written:true};
  } finally { await rm(lock,{recursive:true,force:true}); }
}

function isMatchingSubmitLease(item, lease) {
  return Boolean(lease && lease.outcome==="leased" && lease.plan_version===item.plan_version && lease.reading_id===item.reading_id &&
    lease.chapter===`${item.chapter.book_id}:${item.chapter.chapter}` && lease.chunk_id===item.chunk_id &&
    lease.work_item_id===item.work_item_id && lease.model===item.required_model && lease.automation_id===item.automation_id);
}

function initialNativeSubmitAttempts({item, lease}) {
  if(!isMatchingSubmitLease(item,lease)) throw new Error("Native submit attempt has no matching ledger lease.");
  return {
    schema_version: SUBMIT_ATTEMPTS_VERSION,
    work_item_id: item.work_item_id,
    work_item_sha256: item.work_item_sha256,
    plan_version: item.plan_version,
    lease_id: item.lease_id,
    ledger_lease_event_id: lease.event_id,
    attempts: []
  };
}

function assertNativeSubmitAttemptsShape(value, attemptsSchema) {
  assertSchemaValid(value, attemptsSchema, {label:"Native submit attempts"});
  if(value.attempts.some((attempt,index)=>attempt.ordinal!==index+1) || new Set(value.attempts.map((attempt)=>attempt.candidate_sha256)).size!==value.attempts.length) {
    throw new Error("Native submit attempts are disordered or reuse candidate bytes.");
  }
  return value;
}

export function assertNativeSubmitAttempts({value, item, lease, attemptsSchema}) {
  assertNativeSubmitAttemptsShape(value,attemptsSchema);
  const expected=initialNativeSubmitAttempts({item,lease});
  for(const key of ["schema_version","work_item_id","work_item_sha256","plan_version","lease_id","ledger_lease_event_id"]) {
    if(value[key]!==expected[key]) throw new Error("Native submit attempts do not match the current work-item lease.");
  }
  return value;
}

export function assertNativeSubmitAttemptReset({value, item, lease, ledgerEvents, attemptsSchema}) {
  assertNativeSubmitAttemptsShape(value,attemptsSchema);
  if(!isMatchingSubmitLease(item,lease)) throw new Error("Native submit-attempt reset has no matching current lease.");
  for(const key of ["schema_version","work_item_id","work_item_sha256","plan_version","lease_id"]) {
    if(value[key]!==initialNativeSubmitAttempts({item,lease})[key]) throw new Error("Native submit-attempt reset crosses a work-item binding.");
  }
  if(value.ledger_lease_event_id===lease.event_id || value.attempts.length!==3 || !Array.isArray(ledgerEvents)) throw new Error("Native submit-attempt reset has no completed prior lease cycle.");
  const priorMatches=ledgerEvents.map((event,index)=>({event,index})).filter(({event})=>event.event_id===value.ledger_lease_event_id);
  const currentMatches=ledgerEvents.map((event,index)=>({event,index})).filter(({event})=>event.event_id===lease.event_id);
  if(priorMatches.length!==1||currentMatches.length!==1||!isMatchingSubmitLease(item,priorMatches[0].event)||!isMatchingSubmitLease(item,currentMatches[0].event)) throw new Error("Native submit-attempt reset lease history is missing, forged, or ambiguous.");
  const prior=priorMatches[0],current=currentMatches[0];
  const priorSlot=Date.parse(prior.event.primary_slot),currentSlot=Date.parse(current.event.primary_slot);
  if(prior.index>=current.index||!Number.isFinite(priorSlot)||!Number.isFinite(currentSlot)||currentSlot<=priorSlot||!hasActiveMatchingLease({events:ledgerEvents,lease:current.event})) throw new Error("Native submit-attempt reset current lease is not a later active lease.");
  const between=ledgerEvents.slice(prior.index+1,current.index),terminals=between.filter((event)=>event.outcome==="model_failure"&&event.code==="NATIVE_CANDIDATE_UNRESOLVED"&&event.plan_version===item.plan_version&&event.reading_id===item.reading_id&&event.chapter===`${item.chapter.book_id}:${item.chapter.chapter}`&&event.chunk_id===item.chunk_id&&event.work_item_id===item.work_item_id&&event.model===item.required_model&&event.automation_id===item.automation_id&&event.primary_slot===prior.event.primary_slot);
  const interveningLeases=between.filter((event)=>event.outcome==="leased"&&event.work_item_id===item.work_item_id&&event.model===item.required_model&&event.automation_id===item.automation_id);
  if(terminals.length!==1||interveningLeases.length||hasActiveMatchingLease({events:ledgerEvents,lease:prior.event})) throw new Error("Native submit-attempt reset prior lease is active, unterminated, or ambiguous.");
  return true;
}

export async function readNativeSubmitAttempts({workItemDir, item, lease, attemptsSchema}) {
  const target=path.join(path.resolve(workItemDir),"submit-attempts.json");
  let value;
  try { value=JSON.parse(await readFile(target,"utf8")); }
  catch(error) { if(error.code!=="ENOENT") throw error; value=initialNativeSubmitAttempts({item,lease}); }
  return assertNativeSubmitAttempts({value,item,lease,attemptsSchema});
}

export async function recordNativeSubmitFailure({workItemDir, item, lease, candidateSha256, validationCode, diagnosticsSha256, attemptsSchema, ledgerEvents = null, lockStaleMs = LOCK_STALE_MS}) {
  if(!/^[a-f0-9]{64}$/.test(String(candidateSha256||"")) || !/^[a-f0-9]{64}$/.test(String(diagnosticsSha256||""))) throw new Error("Native submit attempt fingerprints are invalid.");
  const base=path.resolve(workItemDir),target=path.join(base,"submit-attempts.json"),lock=path.join(base,"submit-attempts.lock");
  if(!Number.isSafeInteger(lockStaleMs)||lockStaleMs<0)throw new Error("Native submit-attempt lock stale interval is invalid.");
  try { await mkdir(lock,{mode:0o700}); } catch(error) {
    if(error.code!=="EEXIST")throw error;
    const age=Date.now()-(await stat(lock)).mtimeMs;
    if(age<=lockStaleMs)throw new Error("Native submit-attempt lock is active.");
    await rm(lock,{recursive:true,force:true});
    await mkdir(lock,{mode:0o700});
  }
  try {
    let value;
    try {
      const stored=JSON.parse(await readFile(target,"utf8"));
      assertNativeSubmitAttemptsShape(stored,attemptsSchema);
      if(stored.ledger_lease_event_id===lease.event_id) value=assertNativeSubmitAttempts({value:stored,item,lease,attemptsSchema});
      else { assertNativeSubmitAttemptReset({value:stored,item,lease,ledgerEvents,attemptsSchema}); value=initialNativeSubmitAttempts({item,lease}); }
    } catch(error) {
      if(error.code!=="ENOENT")throw error;
      value=initialNativeSubmitAttempts({item,lease});
    }
    if(value.attempts.some((attempt)=>attempt.candidate_sha256===candidateSha256)) throw new Error("Native submit retry must change candidate bytes.");
    if(value.attempts.length>=3) throw new Error("Native submit retry budget is exhausted.");
    value.attempts.push({ordinal:value.attempts.length+1,candidate_sha256:candidateSha256,validation_code:validationCode,diagnostics_sha256:diagnosticsSha256});
    assertNativeSubmitAttempts({value,item,lease,attemptsSchema});
    const temp=path.join(base,`.submit-attempts.${process.pid}.${Date.now()}.tmp`);
    await writeFile(temp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600,flag:"wx"});
    await rename(temp,target);
    return value;
  } finally { await rm(lock,{recursive:true,force:true}); }
}

export function assertNativeTerminalFailureAttempts({value, item, lease, attemptsSchema}) {
  const checked=assertNativeSubmitAttempts({value,item,lease,attemptsSchema});
  if(checked.attempts.length!==3) throw new Error("Native terminal failure requires three distinct failed submit attempts for the current lease.");
  return checked;
}
const LEASE_TERMINAL_OUTCOMES = new Set(["validated", "model_failure", "deterministic_failure", "source_failure", "schema_failure", "review_failure", "missed_primary", "stale_primary"]);
export function hasActiveMatchingLease({events, lease}) {
  const index = (events || []).findIndex((event) => event.event_id === lease.event_id);
  if (index < 0 || lease.outcome !== "leased") return false;
  return !(events || []).slice(index + 1).some((event) => event.work_item_id === lease.work_item_id &&
    event.model === lease.model && event.automation_id === lease.automation_id && event.plan_version === lease.plan_version &&
    event.reading_id === lease.reading_id && event.chapter === lease.chapter && event.chunk_id === lease.chunk_id &&
    LEASE_TERMINAL_OUTCOMES.has(event.outcome));
}
export async function appendLedgerEvent({root, readingId, event, ledgerSchema, now = () => new Date(), lockStaleMs = LOCK_STALE_MS}) {
  const base=path.resolve(root), ledgerDir=path.join(base,"ledger"), target=path.join(ledgerDir,`${readingId}.json`), lock=path.join(ledgerDir,`${readingId}.lock`);
  if (path.dirname(target)!==ledgerDir || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(readingId)) throw new Error("Invalid ledger reading ID.");
  await mkdir(ledgerDir,{recursive:true,mode:0o700});
  try { await mkdir(lock,{mode:0o700}); } catch (error) { if (error.code !== "EEXIST") throw error; const age=Date.now()-(await stat(lock)).mtimeMs; if (age <= lockStaleMs) throw new Error("Native ledger lock is active."); await rm(lock,{recursive:true,force:true}); await mkdir(lock,{mode:0o700}); }
  try { let ledger={schema_version:LEDGER_VERSION,reading_id:readingId,events:[]}; try { ledger=JSON.parse(await readFile(target,"utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
    assertSchemaValid(ledger,ledgerSchema,{label:"Native ledger"});
    if (event.reading_id !== readingId) throw new Error("Ledger event reading ID mismatch.");
    if (ledger.events.some(x=>x.event_id===event.event_id)) return {ledger, appended:false};
    if (event.outcome === "leased" && ledger.events.some((prior) => prior.outcome === "leased" && prior.model === event.model && prior.reading_id === event.reading_id && prior.chapter === event.chapter && prior.chunk_id === event.chunk_id && prior.primary_slot === event.primary_slot && hasActiveMatchingLease({events:ledger.events,lease:prior}))) throw new Error("Native ledger already has a lease for this chunk, model, and slot.");
    ledger.events.push(event); assertSchemaValid(ledger,ledgerSchema,{label:"Native ledger"});
    const temp=path.join(ledgerDir,`.${readingId}.${process.pid}.${Date.now()}.tmp`); await writeFile(temp,`${JSON.stringify(ledger,null,2)}\n`,{mode:0o600,flag:"wx"}); await rename(temp,target); return {ledger,appended:true};
  } finally { await rm(lock,{recursive:true,force:true}); }
}
