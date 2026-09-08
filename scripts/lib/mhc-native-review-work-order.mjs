import {createHash} from "node:crypto";
import {lstat, readFile, readdir} from "node:fs/promises";
import path from "node:path";
import {assertSchemaValid} from "./schema-validator.mjs";
import {loadLatestHenryReading, sameHenryRuntime} from "./mhc-library-sync.mjs";
import {sha256, stableJson} from "./mhc-pipeline.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const safeId = value => /^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(String(value || ""));
function scheduleDate(appConfig, entry) {
  const [year, month, day] = String(appConfig?.sharedStartDate || "").split("-").map(Number);
  if (![year,month,day].every(Number.isInteger) || !Number.isInteger(entry?.dayIndex)) throw new Error("Review work order cannot derive the reading schedule date.");
  return new Date(Date.UTC(year, month - 1, day + entry.dayIndex - 1)).toISOString().slice(0,10);
}

export function classifyNativeReviewState({handoff, canonical, library, attached, manifestBacked}) {
  const priorManifestState = manifestBacked ? "manifest_backed" : "manifest_unpublished";
  if (!handoff.valid) return {action:"none",state:"blocked",stage:"classification",code:handoff.code || "REVIEW_HANDOFF_INVALID",priorManifestState};
  if (canonical.state === "absent") {
    if (handoff.approvalState === "valid") return {action:"resume_apply",state:"approved_uncommitted",stage:"admission",code:null,priorManifestState};
    if (handoff.approvalState === "invalid") return {action:"none",state:"blocked",stage:"classification",code:"REVIEW_APPROVAL_INVALID",priorManifestState};
    return {action:"review",state:"pending_review",stage:"review",code:null,priorManifestState};
  }
  if (canonical.state !== "committed") return {action:"none",state:"blocked",stage:"classification",code:canonical.code || "REVIEW_CANONICAL_AMBIGUOUS",priorManifestState};
  if (library.invalid) return {action:"none",state:"blocked",stage:"classification",code:"REVIEW_LIBRARY_INVALID",priorManifestState};
  if (attached.invalid) return {action:"none",state:"blocked",stage:"classification",code:"REVIEW_ATTACHMENT_INVALID",priorManifestState};
  if (!library.current) return {action:"recover_finalize",state:"committed_library_debt",stage:"finalization",code:null,priorManifestState};
  if (!attached.current) return {action:"recover_attach",state:"committed_attachment_debt",stage:"attachment",code:null,priorManifestState};
  if (!manifestBacked) return {action:"recover_publish",state:"committed_publication_debt",stage:"publication",code:null,priorManifestState};
  return {action:"none",state:"completed",stage:"completion",code:null,priorManifestState};
}

async function json(file, optional = false) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (optional && error.code === "ENOENT") return null; throw error; }
}

async function regular(file) {
  const entry = await lstat(file);
  if (entry.isSymbolicLink() || !entry.isFile()) throw new Error("unsafe private review file");
  return file;
}

function expectedDestinations(entry, readingId) {
  return new Set([
    `schedule/${readingId}/audit.json`,
    ...entry.passages.map(passage => `runtime/${passage.bookId}/${String(passage.chapter).padStart(3, "0")}.json`)
  ]);
}

async function canonicalState({canonicalRoot, transactionRoot, readingId, planVersion, entry, transactionSchema}) {
  let audit;
  try { audit = await json(await regular(path.join(canonicalRoot, "schedule", readingId, "audit.json"))); }
  catch (error) {
    if (error.code !== "ENOENT") return {state:"invalid",code:"REVIEW_CANONICAL_INVALID"};
    try {
      const candidates = await readdir(transactionRoot,{withFileTypes:true});
      if (candidates.some(candidate => candidate.name.startsWith(`${readingId}-`))) return {state:"invalid",code:"REVIEW_TRANSACTION_ORPHANED"};
    } catch (transactionError) { if (transactionError.code !== "ENOENT") return {state:"invalid",code:"REVIEW_TRANSACTION_UNAVAILABLE"}; }
    return {state:"absent"};
  }
  if (audit?.schema_version !== "mhc-schedule-audit/v1" || audit.reading_id !== readingId || audit.plan_version !== planVersion ||
      audit.audit_status !== "approved" || audit.review_status !== "approved" || audit.human_review?.status !== "approved" || audit.human_review?.approval !== "approved") return {state:"invalid",code:"REVIEW_CANONICAL_INVALID"};
  if (!Array.isArray(audit.passages) || audit.passages.length !== entry.passages.length || audit.passages.some((passage,index) => passage.book_id !== entry.passages[index].bookId || passage.chapter !== entry.passages[index].chapter || passage.verse_count !== entry.passages[index].verseCount || passage.runtime_path !== `runtime/${entry.passages[index].bookId}/${String(entry.passages[index].chapter).padStart(3, "0")}.json`)) return {state:"invalid",code:"REVIEW_CANONICAL_INVALID"};
  const wanted = expectedDestinations(entry, readingId);
  let directories;
  try { directories = await readdir(transactionRoot, {withFileTypes:true}); }
  catch { return {state:"invalid",code:"REVIEW_TRANSACTION_UNAVAILABLE"}; }
  const matches = directories.filter(item => item.isDirectory() && !item.isSymbolicLink() && item.name.startsWith(`${readingId}-`));
  const committed = [];
  for (const item of matches) {
    try {
      const base = path.join(transactionRoot, item.name);
      const [manifest, marker] = await Promise.all([json(await regular(path.join(base, "manifest.json"))), json(await regular(path.join(base, "committed.json")))]);
      assertSchemaValid(manifest, transactionSchema, {label:"Native review transaction manifest"});
      assertSchemaValid(marker, transactionSchema, {label:"Native review transaction marker"});
      if (manifest.reading_id !== readingId || manifest.plan_version !== planVersion || manifest.state !== "staged" || JSON.stringify(marker) !== JSON.stringify({...manifest,state:"committed"})) return {state:"invalid",code:"REVIEW_TRANSACTION_INVALID"};
      const actual = new Set(manifest.destinations.map(destination => destination.destination));
      if (actual.size !== wanted.size || [...wanted].some(destination => !actual.has(destination))) return {state:"invalid",code:"REVIEW_TRANSACTION_INVALID"};
      for (const destination of manifest.destinations) {
        const canonicalBytes = await readFile(path.join(canonicalRoot, destination.destination));
        const stagedBytes = await readFile(path.join(base, destination.staged_file));
        if (digest(canonicalBytes) !== destination.sha256 || digest(stagedBytes) !== destination.sha256) return {state:"invalid",code:"REVIEW_TRANSACTION_INVALID"};
      }
      committed.push(manifest);
    } catch { return {state:"invalid",code:"REVIEW_TRANSACTION_INVALID"}; }
  }
  return committed.length === 1 ? {state:"committed"} : {state:"invalid",code:"REVIEW_TRANSACTION_AMBIGUOUS"};
}

async function libraryAndAttachment({libraryRoot, runtimeSchemaPath, metadataPath, readingId}) {
  let latest;
  try { latest = await loadLatestHenryReading({libraryRoot,readingId,runtimeSchemaPath}); }
  catch (error) { return ["ENOENT","MHC_READING_ABSENT"].includes(error.code) ? {library:{current:false},attached:{current:false}} : {library:{current:false,invalid:true},attached:{current:false}}; }
  try {
    const metadata = await json(await regular(metadataPath));
    const current = Array.isArray(metadata.verseCommentaries) ? metadata.verseCommentaries : metadata.verseCommentary ? [metadata.verseCommentary] : [];
    return {library:{current:true},attached:{current:metadata.readingId === readingId && !metadata.henrySourceLink && sameHenryRuntime(current, latest.runtimes)}};
  } catch (error) { return error.code === "ENOENT" ? {library:{current:true},attached:{current:false}} : {library:{current:true},attached:{current:false,invalid:true}}; }
}

async function approvalState({base, handoff, readingId, planVersion, approvalSchema, candidateSchema, reviewSchema}) {
  const approval = await json(path.join(base,"review-approval.json"),true);
  if (!approval) return "absent";
  try {
    assertSchemaValid(approval,approvalSchema,{label:"Native review approval binding"});
    const candidate = await json(await regular(path.join(base,"review-candidate.json")));
    assertSchemaValid(candidate,candidateSchema,{label:"Native review candidate"});
    if (approval.reading_id !== readingId || approval.plan_version !== planVersion || approval.handoff_sha256 !== sha256(stableJson(handoff)) || approval.review_candidate_sha256 !== sha256(stableJson(candidate)) || candidate.reading_id !== readingId || candidate.plan_version !== planVersion || candidate.handoff_sha256 !== approval.handoff_sha256) return "invalid";
    const files = await readdir(base,{withFileTypes:true});
    const reviews = [];
    for (const file of files) if (file.isFile() && !file.isSymbolicLink() && file.name.endsWith(".json") && !["review-approval.json","review-candidate.json","review-handoff.json"].includes(file.name)) {
      try { const review = await json(await regular(path.join(base,file.name))); assertSchemaValid(review,reviewSchema,{label:"Native approved schedule review"}); if (sha256(stableJson(review)) === approval.schedule_review_sha256) reviews.push(review); } catch { /* Other retained private artifacts are not review records. */ }
    }
    return reviews.length === 1 && reviews[0].reading_id === readingId && reviews[0].plan_version === planVersion && reviews[0].status === "approved" && Object.values(reviews[0].assertions).every(value => value === true) ? "valid" : "invalid";
  } catch { return "invalid"; }
}

export async function nativeReviewWorkOrder({root, workRoot, privateRoot, canonicalRoot, libraryRoot, transactionRoot, plan, appConfig, handoffSchema, transactionSchema, approvalSchema = {}, candidateSchema = {}, reviewSchema = {}, runtimeSchemaPath}) {
  let children;
  try { children = await readdir(path.join(workRoot, "review-staging"), {withFileTypes:true}); }
  catch (error) { if (error.code === "ENOENT") return {lane:"henry_backfill",readingId:null,scheduleDate:null,action:"none",state:"no_review_handoffs",stage:"classification",priorManifestState:"manifest_unchanged"}; throw error; }
  if (!children.length) return {lane:"henry_backfill",readingId:null,scheduleDate:null,action:"none",state:"no_review_handoffs",stage:"classification",priorManifestState:"manifest_unchanged"};
  const byId = new Map(plan.entries.map(entry => [entry.readingId, entry]));
  const candidates = [];
  for (const child of children) {
    if (!child.isDirectory() || child.isSymbolicLink() || !safeId(child.name) || !byId.has(child.name)) return {lane:"henry_backfill",readingId:null,scheduleDate:null,action:"none",state:"blocked",stage:"classification",code:"REVIEW_HANDOFF_AMBIGUOUS",priorManifestState:"manifest_unchanged"};
    const readingId = child.name, entry = byId.get(readingId), base = path.join(workRoot,"review-staging",readingId);
    let handoff;
    try {
      handoff = await json(await regular(path.join(base,"review-handoff.json")));
      assertSchemaValid(handoff,handoffSchema,{label:"Native review handoff"});
    } catch { handoff = null; }
    const handoffState = {valid:Boolean(handoff && handoff.reading_id === readingId && handoff.plan_version === plan.planVersion && handoff.status === "unreviewed" && handoff.publication_status === "not_published" && handoff.chapters.length === entry.passages.length),approvalState:handoff ? await approvalState({base,handoff,readingId,planVersion:plan.planVersion,approvalSchema,candidateSchema,reviewSchema}) : "absent"};
    const canonical = await canonicalState({canonicalRoot,transactionRoot,readingId,planVersion:plan.planVersion,entry,transactionSchema});
    const local = canonical.state === "committed" ? await libraryAndAttachment({libraryRoot,runtimeSchemaPath,metadataPath:path.join(privateRoot,"bridge","celebration-y3q4",`${readingId}.metadata.json`),readingId}) : {library:{current:false},attached:{current:false}};
    const manifest = await json(path.join(privateRoot,"private-manifest.json"),true);
    const result = classifyNativeReviewState({handoff:handoffState,canonical,library:local.library,attached:local.attached,manifestBacked:Boolean(manifest?.readings?.[readingId])});
    candidates.push({readingId,scheduleDate:scheduleDate(appConfig,entry),...result});
  }
  const invalid = candidates.find(candidate => candidate.state === "blocked");
  if (invalid) return {lane:"henry_backfill",readingId:invalid.readingId,scheduleDate:invalid.scheduleDate,action:invalid.action,state:invalid.state,stage:invalid.stage,code:invalid.code,priorManifestState:invalid.priorManifestState};
  const rank = {resume_apply:0,recover_finalize:1,recover_attach:2,recover_publish:3,review:4,none:5};
  candidates.sort((left,right) => rank[left.action] - rank[right.action] || left.scheduleDate.localeCompare(right.scheduleDate) || left.readingId.localeCompare(right.readingId));
  const chosen = candidates[0];
  return {lane:"henry_backfill",readingId:chosen.readingId,scheduleDate:chosen.scheduleDate,action:chosen.action,state:chosen.state,stage:chosen.stage,...(chosen.code ? {code:chosen.code} : {}),priorManifestState:chosen.priorManifestState};
}
