import {createHash, randomBytes} from "node:crypto";
import {lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {assertCanonicalPath} from "./mhc-native-paths.mjs";
import {latestDetroitSparkSlot} from "./mhc-native-state.mjs";
import {assertSchemaValid} from "./schema-validator.mjs";

export const CHECKPOINT_VERSION="mhc-native-runner-checkpoint/v1";
export const MAX_VALIDATED_CHUNKS=16;
export const MAX_CANDIDATE_SUBMISSIONS=48;
export const LEASE_WINDOW_MS=45*60*1000;
export const DEADLINE_MS=60*60*1000;

const json=async file=>JSON.parse(await readFile(file,"utf8"));
const digest=value=>createHash("sha256").update(value).digest("hex");
const safeCheckpointId=value=>/^MHNR-[a-f0-9]{32}$/.test(String(value||""));
const quote=value=>`'${String(value).replaceAll("'", "'\\''")}'`;
function checkpointDigest(value){const {checkpoint_sha256:ignored,...identity}=value;return digest(JSON.stringify(identity));}
function seal(value){return {...value,checkpoint_sha256:checkpointDigest(value)};}

async function atomicJson(file,value){await mkdir(path.dirname(file),{recursive:true,mode:0o700});const bytes=`${JSON.stringify(value,null,2)}\n`,temp=`${file}.tmp-${process.pid}`;await writeFile(temp,bytes,{mode:0o600});await rename(temp,file);}

export function runnerCommand({launcher,checkpointId}) {
  const argv=[process.execPath,launcher,"advance","--checkpoint",checkpointId];
  return {advanceArgv:argv,advanceCommand:process.platform === "win32" ? "& " + argv.map(value => "'" + String(value).replaceAll("'", "''") + "'").join(" ") : argv.map(quote).join(" ")};
}

export function newCheckpoint({lane,config,manifestSha256,now=new Date()}) {
  const started=now instanceof Date?now:new Date(now),spark=lane==="spark";
  if(!["spark","luna"].includes(lane)||!Number.isFinite(started.getTime()))throw Error("Invalid native runner lane or start time.");
  return seal({schema_version:CHECKPOINT_VERSION,checkpoint_id:`MHNR-${randomBytes(16).toString("hex")}`,runtime_manifest_sha256:manifestSha256,runtime_revision:config.source_revision,lane,model:spark?"gpt-5.3-codex-spark":"gpt-5.6-luna",automation_id:spark?config.spark_automation_id:config.luna_automation_id,primary_automation_id:spark?null:config.spark_automation_id,started_at:started.toISOString(),lease_cutoff_at:new Date(started.getTime()+LEASE_WINDOW_MS).toISOString(),deadline_at:new Date(started.getTime()+DEADLINE_MS).toISOString(),validated_chunks:0,candidate_submissions:0,max_validated_chunks:MAX_VALIDATED_CHUNKS,max_candidate_submissions:MAX_CANDIDATE_SUBMISSIONS,state:"starting",reading_id:null,work_item_path:null,work_item_sha256:null,last_code:null});
}

export function refreshCheckpointBudget(checkpoint,now=new Date()) {
  const started=now instanceof Date?now:new Date(now);
  return seal({...checkpoint,started_at:started.toISOString(),lease_cutoff_at:new Date(started.getTime()+LEASE_WINDOW_MS).toISOString(),deadline_at:new Date(started.getTime()+DEADLINE_MS).toISOString(),validated_chunks:0,candidate_submissions:0,state:"starting",last_code:null});
}

export function mayLease(checkpoint,now=new Date()) {
  const time=(now instanceof Date?now:new Date(now)).getTime();
  return time<Date.parse(checkpoint.lease_cutoff_at)&&checkpoint.validated_chunks<checkpoint.max_validated_chunks&&checkpoint.candidate_submissions<checkpoint.max_candidate_submissions;
}

export async function readCheckpoint({checkpointRoot,checkpointId,schema,manifestSha256}) {
  if(!safeCheckpointId(checkpointId))throw Error("Invalid native runner checkpoint ID.");
  const file=await assertCanonicalPath(checkpointRoot,path.join(checkpointRoot,`${checkpointId}.json`)),value=await json(file);assertSchemaValid(value,schema,{label:"Native runner checkpoint"});
  if(value.checkpoint_sha256!==checkpointDigest(value)||value.checkpoint_id!==checkpointId||value.runtime_manifest_sha256!==manifestSha256)throw Error("Native runner checkpoint is tampered, stale, or belongs to another runtime release.");
  return {file,value};
}

export async function writeCheckpoint({file,value,schema}) {value=seal(value);assertSchemaValid(value,schema,{label:"Native runner checkpoint"});await assertCanonicalPath(path.dirname(file),file,{allowMissing:true});await atomicJson(file,value);return value;}

export async function withRunnerLock({runtimeRoot},operation) {
  const lock=await assertCanonicalPath(runtimeRoot,path.join(runtimeRoot,"runner.lock"),{allowMissing:true});
  const acquire=async retry=>{try{await mkdir(lock,{mode:0o700});await writeFile(path.join(lock,"owner.json"),`${JSON.stringify({pid:process.pid,created_at:new Date().toISOString()})}\n`,{mode:0o600});}catch(error){if(error.code!=="EEXIST")throw error;let active=true;try{const owner=await json(path.join(lock,"owner.json"));process.kill(owner.pid,0);}catch(check){if(check.code==="ESRCH")active=false;else if(check.code==="EPERM")active=true;else{const stat=await lstat(lock).catch(()=>null);active=Boolean(stat&&Date.now()-stat.mtimeMs<5*60*1000);}}if(active||!retry)throw Error("Another native runner operation is active.");await rm(lock,{recursive:true,force:true});return acquire(false);}};
  await acquire(true);
  try{return await operation();}finally{await rm(lock,{recursive:true,force:true});}
}

export async function findOpenCheckpoint({checkpointRoot,lane,schema,manifestSha256}) {
  let names=[];try{names=await readdir(checkpointRoot);}catch(error){if(error.code!=="ENOENT")throw error;}
  const found=[];for(const name of names){if(!/^MHNR-[a-f0-9]{32}\.json$/.test(name))continue;const file=await assertCanonicalPath(checkpointRoot,path.join(checkpointRoot,name));let raw;try{raw=await json(file);}catch{throw Error("Unreadable native runner checkpoint history.");}assertSchemaValid(raw,schema,{label:"Native runner checkpoint history"});if(raw.checkpoint_sha256!==checkpointDigest(raw))throw Error("Tampered native runner checkpoint history.");if(raw.lane!==lane||['complete','blocked'].includes(raw.state))continue;const id=name.slice(0,-5),current=await readCheckpoint({checkpointRoot,checkpointId:id,schema,manifestSha256});found.push(current);}
  if(found.length>1)throw Error("Multiple active native runner checkpoints exist for one lane.");return found[0]||null;
}

export function runWorker({releaseRoot,projectRoot,args}) {
  const result=spawnSync(process.execPath,[path.join(releaseRoot,"scripts/mhc-native-worker.mjs"),...args],{cwd:projectRoot,encoding:"utf8",windowsHide:true,timeout:120000,env:{...process.env,MHC_NATIVE_VERIFIED_RUNNER:"1",MHC_NATIVE_TRACKED_ROOT:releaseRoot}});
  let report=null;for(const line of String(result.stdout||"").trim().split("\n").reverse()){try{report=JSON.parse(line);break;}catch{}}
  return {ok:result.status===0,report,stderr:String(result.stderr||"").trim()};
}
function runAttemptRecord({releaseRoot,projectRoot,readingId}) {
  const result=spawnSync(process.execPath,[path.join(releaseRoot,"scripts/mhc-backfill-attempt-state.mjs"),"--reading",readingId,"--outcome","model_failure","--stage","validation","--code","NATIVE_CANDIDATE_UNRESOLVED"],{cwd:projectRoot,encoding:"utf8",windowsHide:true,timeout:120000,env:{...process.env,MHC_NATIVE_TRACKED_ROOT:releaseRoot}});
  return {ok:result.status===0,stderr:String(result.stderr||"").trim()};
}

async function itemBinding(projectRoot,relativePath){if(path.isAbsolute(relativePath||""))throw Error("Native runner work-item path must remain project-relative.");const projectReal=await realpath(projectRoot),workRoot=await assertCanonicalPath(projectReal,path.join(projectReal,"private-content/automation/mhc-native-work-items")),absolute=path.resolve(projectReal,relativePath||""),entry=await lstat(absolute);await assertCanonicalPath(workRoot,absolute);if(!entry.isFile()||entry.isSymbolicLink()||!absolute.startsWith(`${workRoot}${path.sep}`)||await realpath(path.dirname(absolute))!==path.dirname(absolute))throw Error("Native runner work-item path escaped its canonical work root.");const item=await json(absolute);return {absolute,item,sha256:item.work_item_sha256,dir:path.dirname(absolute)};}

function publicResult({checkpoint,launcher,report,action,state,code=null,now=new Date()}){return {lane:"henry_backfill",readingId:checkpoint.reading_id,action,state,runtimeRevision:checkpoint.runtime_revision,deadlineAt:checkpoint.deadline_at,leaseCutoffAt:checkpoint.lease_cutoff_at,validatedChunks:checkpoint.validated_chunks,remainingValidatedChunks:Math.max(0,checkpoint.max_validated_chunks-checkpoint.validated_chunks),candidateSubmissions:checkpoint.candidate_submissions,remainingCandidateSubmissions:Math.max(0,checkpoint.max_candidate_submissions-checkpoint.candidate_submissions),elapsedSeconds:Math.max(0,Math.floor(((now instanceof Date?now:new Date(now)).getTime()-Date.parse(checkpoint.started_at))/1000)),...(code?{code}:{}),...(report?.candidatePath?{candidatePath:report.candidatePath,validationPath:report.validationPath,instructionsPath:path.join(path.dirname(report.candidatePath),"instructions.txt")}:{ }),...runnerCommand({launcher,checkpointId:checkpoint.checkpoint_id})};}
function budgetStop(checkpoint,now){if(Date.parse(checkpoint.deadline_at)<=new Date(now).getTime())return "RUNNER_DEADLINE_REACHED";if(checkpoint.candidate_submissions>=checkpoint.max_candidate_submissions)return "RUNNER_SUBMISSION_BUDGET_REACHED";return null;}

async function prepareNext(context,checkpoint,checkpointFile,now){
  now=context.clock?.()??now;
  if(!mayLease(checkpoint,now)){checkpoint={...checkpoint,state:"checkpointed",last_code:"RUNNER_BUDGET_REACHED"};await writeCheckpoint({file:checkpointFile,value:checkpoint,schema:context.checkpointSchema});return publicResult({checkpoint,launcher:context.launcher,action:"none",state:"checkpointed",code:"RUNNER_BUDGET_REACHED"});}
  const args=["prepare-runner","--model",checkpoint.model,"--automation-id",checkpoint.automation_id,"--lease-cutoff",checkpoint.lease_cutoff_at];if(checkpoint.primary_automation_id)args.push("--primary-automation-id",checkpoint.primary_automation_id);if(checkpoint.reading_id)args.push("--reading-id",checkpoint.reading_id);
  const run=context.workerRunner?context.workerRunner(args):runWorker({...context,args});if(!run.ok||!run.report)throw Error(`Native runner prepare failed: ${run.stderr||"missing safe report"}`);
  now=context.clock?.()??now;
  const report=run.report;
  if(report.workItemPath){const binding=await itemBinding(context.projectRoot,report.workItemPath);if(checkpoint.reading_id&&checkpoint.reading_id!==binding.item.reading_id)throw Error("Native runner attempted to change readings during one wake.");checkpoint={...checkpoint,state:report.action==="assemble"?"starting":"author_candidate",reading_id:binding.item.reading_id,work_item_path:report.workItemPath,work_item_sha256:binding.sha256,last_code:null};await writeCheckpoint({file:checkpointFile,value:checkpoint,schema:context.checkpointSchema});if(report.action==="assemble"){const assembled=await reconcileAssembly(context,checkpoint,checkpointFile,now);if(assembled)return assembled;throw Error("Resolved native reading did not produce its review handoff.");}return publicResult({checkpoint,launcher:context.launcher,report,action:"author_candidate",state:report.state,now});}
  const final=await reconcileAssembly(context,checkpoint,checkpointFile,now);
  if(final)return final;
  checkpoint={...checkpoint,state:report.state==="deterministic_block"?"blocked":"checkpointed",last_code:report.code||report.state};await writeCheckpoint({file:checkpointFile,value:checkpoint,schema:context.checkpointSchema});return publicResult({checkpoint,launcher:context.launcher,report,action:"none",state:report.state,code:report.code||null});
}

async function reconcileAssembly(context,checkpoint,checkpointFile,now){
  if(!checkpoint.work_item_path)return null;
  const assembled=context.workerRunner?context.workerRunner(["assemble","--work-item",checkpoint.work_item_path]):runWorker({...context,args:["assemble","--work-item",checkpoint.work_item_path]});
  if(!assembled.ok||!assembled.report)throw Error(`Native runner assembly failed: ${assembled.stderr||"missing safe report"}`);
  if(assembled.report.state==="complete_reading_unreviewed"){checkpoint={...checkpoint,state:"complete",last_code:null};await writeCheckpoint({file:checkpointFile,value:checkpoint,schema:context.checkpointSchema});return publicResult({checkpoint,launcher:context.launcher,action:"review_handoff",state:"complete_reading_unreviewed"});}
  now=context.clock?.()??now;
  if(Date.parse(checkpoint.deadline_at)<=new Date(now).getTime()){checkpoint={...checkpoint,state:"checkpointed",last_code:"RUNNER_DEADLINE_REACHED"};await writeCheckpoint({file:checkpointFile,value:checkpoint,schema:context.checkpointSchema});return publicResult({checkpoint,launcher:context.launcher,action:"none",state:"checkpointed",code:"RUNNER_DEADLINE_REACHED"});}
  return null;
}

export async function startRunner(context,{lane,now}) {
  const fixedTime=now;context={...context,clock:()=>fixedTime??new Date()};now=context.clock();
  await assertCanonicalPath(context.projectRoot,context.checkpointRoot,{allowMissing:true});
  await mkdir(context.checkpointRoot,{recursive:true,mode:0o700});let open=await findOpenCheckpoint({checkpointRoot:context.checkpointRoot,lane,schema:context.checkpointSchema,manifestSha256:context.manifestSha256});
  let checkpoint,file;if(open){checkpoint=latestDetroitSparkSlot(now)!==latestDetroitSparkSlot(open.value.started_at)&&new Date(now).getTime()>=Date.parse(open.value.deadline_at)?refreshCheckpointBudget(open.value,now):open.value;file=open.file;}else{checkpoint=newCheckpoint({lane,config:context.config,manifestSha256:context.manifestSha256,now});file=path.join(context.checkpointRoot,`${checkpoint.checkpoint_id}.json`);}await writeCheckpoint({file,value:checkpoint,schema:context.checkpointSchema});
  if(open&&checkpoint.work_item_path)return advanceRunner(context,{checkpointId:checkpoint.checkpoint_id,now:fixedTime});
  const reconciled=await reconcileAssembly(context,checkpoint,file,now);if(reconciled)return reconciled;return prepareNext(context,checkpoint,file,now);
}

async function terminalize(context,checkpoint,file,now){const failed=context.workerRunner?context.workerRunner(["fail","--work-item",checkpoint.work_item_path,"--code","NATIVE_CANDIDATE_UNRESOLVED"]):runWorker({...context,args:["fail","--work-item",checkpoint.work_item_path,"--code","NATIVE_CANDIDATE_UNRESOLVED"]});if(!failed.ok)throw Error(`Native runner terminalization failed: ${failed.stderr}`);if(checkpoint.lane==="luna"){const recorded=context.attemptRecorder?context.attemptRecorder(checkpoint.reading_id):runAttemptRecord({...context,readingId:checkpoint.reading_id});if(!recorded.ok)throw Error(`Native runner failure accounting failed: ${recorded.stderr}`);}checkpoint={...checkpoint,state:"blocked",last_code:"NATIVE_CANDIDATE_UNRESOLVED"};await writeCheckpoint({file,value:checkpoint,schema:context.checkpointSchema});return publicResult({checkpoint,launcher:context.launcher,action:"none",state:"terminal_model_failure",code:"NATIVE_CANDIDATE_UNRESOLVED",now});}

export async function advanceRunner(context,{checkpointId,now}) {
  const liveClock=now===undefined;const fixedTime=now;context={...context,clock:()=>fixedTime??new Date()};now=context.clock();
  const loaded=await readCheckpoint({checkpointRoot:context.checkpointRoot,checkpointId,schema:context.checkpointSchema,manifestSha256:context.manifestSha256});let checkpoint=loaded.value;const file=loaded.file;
  if(checkpoint.state==="complete")return publicResult({checkpoint,launcher:context.launcher,action:"review_handoff",state:"complete_reading_unreviewed",now});
  if(checkpoint.state==="blocked")return publicResult({checkpoint,launcher:context.launcher,action:"none",state:"blocked",code:checkpoint.last_code,now});
  const binding=await itemBinding(context.projectRoot,checkpoint.work_item_path);if(binding.sha256!==checkpoint.work_item_sha256||binding.item.required_model!==checkpoint.model||binding.item.automation_id!==checkpoint.automation_id||binding.item.reading_id!==checkpoint.reading_id)throw Error("Native runner work-item checkpoint binding is invalid.");
  const inspected=context.workerRunner?context.workerRunner(["inspect","--work-item",checkpoint.work_item_path]):runWorker({...context,args:["inspect","--work-item",checkpoint.work_item_path]});if(!inspected.ok||!inspected.report)throw Error(`Native runner inspection failed: ${inspected.stderr||"missing safe report"}`);const validated=inspected.report.state==="validated";now=context.clock();
  if(inspected.report.state==="superseded"){checkpoint={...checkpoint,state:"blocked",last_code:"NATIVE_LEASE_SUPERSEDED"};await writeCheckpoint({file,value:checkpoint,schema:context.checkpointSchema});return publicResult({checkpoint,launcher:context.launcher,action:"none",state:"blocked",code:checkpoint.last_code,now});}
  if(!validated&&(inspected.report.failedSubmissions===3||inspected.report.state==="terminal_model_failure"))return terminalize(context,checkpoint,file,now);
  if(validated&&["author_candidate","repair_candidate"].includes(checkpoint.state)){checkpoint={...checkpoint,validated_chunks:checkpoint.validated_chunks+1,state:"starting",last_code:null};await writeCheckpoint({file,value:checkpoint,schema:context.checkpointSchema});}
  if(!validated){const stopped=budgetStop(checkpoint,now);if(stopped){checkpoint={...checkpoint,state:"checkpointed",last_code:stopped};await writeCheckpoint({file,value:checkpoint,schema:context.checkpointSchema});return publicResult({checkpoint,launcher:context.launcher,action:"none",state:"checkpointed",code:stopped,now});}const candidate=await lstat(path.join(binding.dir,"candidate.json")).then(s=>s.isFile()&&!s.isSymbolicLink()&&s.size>2).catch(()=>false);if(!candidate){checkpoint={...checkpoint,state:"author_candidate"};await writeCheckpoint({file,value:checkpoint,schema:context.checkpointSchema});return publicResult({checkpoint,launcher:context.launcher,report:{candidatePath:path.join(binding.dir,"candidate.json"),validationPath:path.join(binding.dir,"validation.json")},action:"author_candidate",state:"candidate_missing",now});}
    if(inspected.report.lastRejectedSha256===digest(await readFile(path.join(binding.dir,"candidate.json")))){checkpoint={...checkpoint,state:"repair_candidate"};await writeCheckpoint({file,value:checkpoint,schema:context.checkpointSchema});return publicResult({checkpoint,launcher:context.launcher,report:{candidatePath:path.join(binding.dir,"candidate.json"),validationPath:path.join(binding.dir,"validation.json")},action:"repair_candidate",state:"validation_failed",now});}
    checkpoint={...checkpoint,candidate_submissions:checkpoint.candidate_submissions+1};await writeCheckpoint({file,value:checkpoint,schema:context.checkpointSchema});
    const submitted=context.workerRunner?context.workerRunner(["submit","--work-item",checkpoint.work_item_path]):runWorker({...context,args:["submit","--work-item",checkpoint.work_item_path]});
    if(liveClock)now=new Date();
    if(!submitted.ok){const attempts=await json(path.join(binding.dir,"submit-attempts.json"));const count=Array.isArray(attempts.attempts)?attempts.attempts.length:0;if(count<=(inspected.report.failedSubmissions??0))throw Error("Native admission failed without a new model-candidate rejection; controller repair is required.");if(count>=3){return terminalize(context,checkpoint,file,now);}const stopped=budgetStop(checkpoint,now);if(stopped){checkpoint={...checkpoint,state:"checkpointed",last_code:stopped};await writeCheckpoint({file,value:checkpoint,schema:context.checkpointSchema});return publicResult({checkpoint,launcher:context.launcher,action:"none",state:"checkpointed",code:stopped,now});}let code="NATIVE_CANDIDATE_INVALID";try{code=(await json(path.join(binding.dir,"validation.json"))).code||code;}catch{}checkpoint={...checkpoint,state:"repair_candidate",last_code:code};await writeCheckpoint({file,value:checkpoint,schema:context.checkpointSchema});return publicResult({checkpoint,launcher:context.launcher,report:{candidatePath:path.join(binding.dir,"candidate.json"),validationPath:path.join(binding.dir,"validation.json")},action:"repair_candidate",state:"validation_failed",code,now});}
    checkpoint={...checkpoint,validated_chunks:checkpoint.validated_chunks+1,state:"starting",last_code:null};await writeCheckpoint({file,value:checkpoint,schema:context.checkpointSchema});
  }
  if(liveClock)now=new Date();
  const assembled=await reconcileAssembly(context,checkpoint,file,now);if(assembled)return assembled;
  return prepareNext(context,checkpoint,file,now);
}
