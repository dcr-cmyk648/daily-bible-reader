#!/usr/bin/env node
import {readFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {advanceRunner,startRunner,withRunnerLock} from "./lib/mhc-native-runner.mjs";

const json=async file=>JSON.parse(await readFile(file,"utf8"));
const usage=()=>"Usage: mhc-native <spark|luna|advance|reviewer> [--checkpoint ID] [reviewer arguments]";
function option(args,name){const at=args.indexOf(name);if(at<0||!args[at+1])throw Error(usage());return args[at+1];}

async function context(){
  const configPath=process.env.MHC_NATIVE_RUNTIME_CONFIG,releaseRoot=process.env.MHC_NATIVE_RELEASE_ROOT,launcher=process.env.MHC_NATIVE_LAUNCHER,manifestSha256=process.env.MHC_NATIVE_MANIFEST_SHA256;
  if(!configPath||!releaseRoot||!launcher||!/^[a-f0-9]{64}$/.test(String(manifestSha256||"")))throw Error("Native runner must be entered through the verified installed launcher.");
  const config=await json(configPath),projectRoot=config.project_root;
  return {config,projectRoot,releaseRoot,launcher,manifestSha256,runtimeRoot:config.runtime_root,checkpointRoot:path.join(config.runtime_root,"checkpoints"),checkpointSchema:await json(path.join(releaseRoot,"schemas/mhc-native-runner-checkpoint.schema.json"))};
}

async function main(){
  const [command,...args]=process.argv.slice(2),ctx=await context();let result;
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
main().catch(error=>{process.stderr.write(`Native runner failed: ${error.message}\n`);process.exitCode=1;});
