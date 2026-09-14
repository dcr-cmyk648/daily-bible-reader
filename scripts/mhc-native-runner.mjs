#!/usr/bin/env node
import {readFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {advanceRunner,startRunner,withRunnerLock} from "./lib/mhc-native-runner.mjs";
import {serviceContext,startV2,advanceV2,reviewWorkOrderV2,applyReviewV2,statusV2,editorialRepairV2,requestEditorialV2,migrateCurrentV2,reopenReviewV2} from "./lib/mhc-v2-service.mjs";

const json=async file=>JSON.parse(await readFile(file,"utf8"));
let activePipeline=null;
const usage=()=>"Usage: mhc-native <spark|luna|advance|reviewer> [--checkpoint ID] [reviewer arguments]";
function option(args,name){const at=args.indexOf(name);if(at<0||!args[at+1])throw Error(usage());return args[at+1];}

async function context(){
  const configPath=process.env.MHC_NATIVE_RUNTIME_CONFIG,releaseRoot=process.env.MHC_NATIVE_RELEASE_ROOT,launcher=process.env.MHC_NATIVE_LAUNCHER,manifestSha256=process.env.MHC_NATIVE_MANIFEST_SHA256;
  if(!configPath||!releaseRoot||!launcher||!/^[a-f0-9]{64}$/.test(String(manifestSha256||"")))throw Error("Native runner must be entered through the verified installed launcher.");
  const config=await json(configPath),projectRoot=config.project_root;
  return {config,projectRoot,releaseRoot,launcher,manifestSha256,runtimeRoot:config.runtime_root,checkpointRoot:path.join(config.runtime_root,"checkpoints"),checkpointSchema:await json(path.join(releaseRoot,"schemas/mhc-native-runner-checkpoint.schema.json"))};
}
async function legacyReview(ctx,reviewCommand,reviewArgs){
  const mapping={"work-order":[path.join(ctx.releaseRoot,"scripts/mhc-native-review-work-order.mjs")],prepare:[path.join(ctx.releaseRoot,"scripts/mhc-native-worker.mjs"),"review-prepare"],apply:[path.join(ctx.releaseRoot,"scripts/mhc-native-worker.mjs"),"review-apply"],finalize:[path.join(ctx.releaseRoot,"scripts/mhc-native-worker.mjs"),"review-finalize"]};
  if(!mapping[reviewCommand])throw Error(usage());
  const {spawnSync}=await import('node:child_process'),child=spawnSync(process.execPath,[...mapping[reviewCommand],...reviewArgs],{cwd:ctx.projectRoot,encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,MHC_NATIVE_VERIFIED_RUNNER:'1',MHC_NATIVE_TRACKED_ROOT:ctx.releaseRoot}});
  if(child.status!==0)throw Error(`Native legacy review recovery failed: ${String(child.stderr||'').trim()}`);
  return {...JSON.parse(child.stdout.trim()),pipeline:'legacy-review-recovery',instructionsPath:path.join(ctx.releaseRoot,'prompts/mhc-native-review-runner-v1.md')};
}

async function main(){
  const [command,...args]=process.argv.slice(2),ctx=await context();let result;
  activePipeline=ctx.config.pipeline_version;
  if(ctx.config.pipeline_version==='mhc-evidence-author/v2'){
    result=await withRunnerLock(ctx,async()=>{
      const service=await serviceContext(ctx);
      if(command==='spark'||command==='luna')return startV2(service,command);
      if(command==='advance')return advanceV2(service,option(args,'--reading'),option(args,'--session'));
      if(command==='status')return statusV2(service);
      if(command==='migrate-current')return migrateCurrentV2(service,option(args,'--reading'),option(args,'--legacy-attempt-sha256'),option(args,'--reason'));
      if(command==='reviewer'&&args[0]==='work-order'){const order=await reviewWorkOrderV2(service);return order.state==='no_review_work'?legacyReview(ctx,'work-order',[]):order;}
      if(command==='reviewer'&&(args.includes('--work-item')||args[0]==='finalize'))return legacyReview(ctx,args[0],args.slice(1));
      if(command==='reviewer'&&args[0]==='apply')return applyReviewV2(service,option(args,'--reading'));
      if(command==='reviewer'&&args[0]==='reopen')return reopenReviewV2(service,option(args,'--reading'),option(args,'--approved-sha256'),option(args,'--reviewer'),option(args,'--reason'));
      if(command==='reviewer'&&args[0]==='repair')return editorialRepairV2(service,option(args,'--reading'));
      if(command==='reviewer'&&args[0]==='request-repair')return requestEditorialV2(service,option(args,'--reading'));
      throw Error('V2 supports spark, luna, advance, status, reviewer work-order/apply/repair. Legacy commands cannot mutate a v2 job.');
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);return;
  }
  if(command==="spark"||command==="luna")result=await withRunnerLock(ctx,()=>startRunner(ctx,{lane:command}));
  else if(command==="advance")result=await withRunnerLock(ctx,()=>advanceRunner(ctx,{checkpointId:option(args,"--checkpoint")}));
  else if(command==="reviewer"){
    const [reviewCommand,...reviewArgs]=args,mapping={"work-order":[path.join(ctx.releaseRoot,"scripts/mhc-native-review-work-order.mjs")],prepare:[path.join(ctx.releaseRoot,"scripts/mhc-native-worker.mjs"),"review-prepare"],apply:[path.join(ctx.releaseRoot,"scripts/mhc-native-worker.mjs"),"review-apply"],finalize:[path.join(ctx.releaseRoot,"scripts/mhc-native-worker.mjs"),"review-finalize"]};
    if(!mapping[reviewCommand])throw Error(usage());
    const {spawnSync}=await import("node:child_process"),child=spawnSync(process.execPath,[...mapping[reviewCommand],...reviewArgs],{cwd:ctx.projectRoot,encoding:"utf8",windowsHide:true,timeout:120000,env:{...process.env,MHC_NATIVE_VERIFIED_RUNNER:"1",MHC_NATIVE_TRACKED_ROOT:ctx.releaseRoot}});
    if(child.status!==0)throw Error(`Native reviewer command failed: ${String(child.stderr||"").trim()}`);process.stdout.write(child.stdout);return;
  } else throw Error(usage());
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
main().catch(error=>{
  if(activePipeline==='mhc-evidence-author/v2'){
    const code=/^V2_[A-Z_]+/.exec(String(error.message))?.[0]||'V2_CONTROLLER_FAILURE';
    process.stdout.write(`${JSON.stringify({pipeline:activePipeline,action:'none',state:'blocked',stage:error.stage||'controller',code,readingId:error.readingId||null})}\n`);
  }else process.stderr.write(`Native runner failed: ${error.message}\n`);
  process.exitCode=1;
});
