#!/usr/bin/env node
import {createHash} from "node:crypto";
import {chmod,lstat,mkdir,mkdtemp,readFile,realpath,readdir,rename,rm,writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {spawnSync} from "node:child_process";
import {assertCanonicalPath} from "./lib/mhc-native-paths.mjs";
import {readCheckpoint,withRunnerLock} from "./lib/mhc-native-runner.mjs";

const sha=value=>createHash("sha256").update(value).digest("hex");
const scopes=["scripts","schemas","prompts","fixtures/pilot-content/plan.json","fixtures/pilot-content/app-config.json","config/active-calendar/celebration-bridge-long-term-active.json"];
const usage="Usage: node scripts/install-mhc-native-runtime.mjs --project-root PATH --revision 40HEX --spark-automation-id ID --luna-automation-id ID";
function options(args){const value={};for(let i=0;i<args.length;i+=2){if(!["--project-root","--revision","--spark-automation-id","--luna-automation-id"].includes(args[i])||!args[i+1])throw Error(usage);value[args[i].slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=args[i+1];}return value;}
function git(root,args){const result=spawnSync("git",args,{cwd:root,windowsHide:true,maxBuffer:32*1024*1024});if(result.status!==0)throw Error("Cannot verify committed runtime source.");return result.stdout;}
async function atomic(file,bytes){const temp=`${file}.tmp-${process.pid}`;await writeFile(temp,bytes,{mode:0o600});await rename(temp,file);}
async function assertNoActiveWake(runtimeRoot,schema){
  const checkpointRoot=path.join(runtimeRoot,"checkpoints");let names=[];
  try{names=await readdir(checkpointRoot);}catch(error){if(error.code!=="ENOENT")throw error;return;}
  for(const name of names){
    if(!/^MHNR-[a-f0-9]{32}\.json$/.test(name))throw Error("Runtime installation refused unknown checkpoint history.");
    const raw=JSON.parse(await readFile(path.join(checkpointRoot,name),"utf8"));
    const {value}=await readCheckpoint({checkpointRoot,checkpointId:name.slice(0,-5),schema,manifestSha256:raw.runtime_manifest_sha256});
    if(!["complete","blocked"].includes(value.state))throw Error("Runtime installation refused while a native runner wake is active.");
  }
}
async function main(){
  const opts=options(process.argv.slice(2)),sourceRoot=await realpath(process.cwd());
  if(!opts.projectRoot||!/^[a-f0-9]{40}$/.test(opts.revision||"")||!opts.sparkAutomationId||!opts.lunaAutomationId||opts.sparkAutomationId===opts.lunaAutomationId)throw Error(usage);
  const projectRoot=await realpath(opts.projectRoot);
  if(git(sourceRoot,["rev-parse","HEAD"]).toString().trim()!==opts.revision||git(sourceRoot,["status","--porcelain","--untracked-files=all","--",...scopes]).toString().trim())throw Error("Runtime release requires the exact clean source commit named by --revision.");
  // Read committed blobs, never label a mutable working copy with a revision.
  const entries=git(sourceRoot,["ls-tree","-r","-z",opts.revision,"--",...scopes]).toString().split("\0").filter(Boolean).map(line=>{
    const match=/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
    if(!match||! /^(scripts|schemas|prompts|fixtures|config)\/[A-Za-z0-9._/-]+$/.test(match[3])||match[3].split("/").includes(".."))throw Error("Runtime source has an unsafe tree entry.");
    return {path:match[3],bytes:git(sourceRoot,["cat-file","blob",match[2]])};
  });
  if(!entries.some(e=>e.path==="scripts/mhc-native-runner.mjs"))throw Error("Source commit has no native runner.");
  for(const relative of ["private-content","private-commentary","research/raw","research/working"]){const target=await assertCanonicalPath(projectRoot,path.join(projectRoot,relative));if(!(await lstat(target)).isDirectory())throw Error("Canonical runtime root is not a directory.");}
  const runtimeRoot=await assertCanonicalPath(projectRoot,path.join(projectRoot,"private-content/automation/mhc-runtime"),{allowMissing:true});await mkdir(runtimeRoot,{recursive:true,mode:0o700});
  await withRunnerLock({runtimeRoot},async()=>{
    await assertNoActiveWake(runtimeRoot,JSON.parse(entries.find(e=>e.path==="schemas/mhc-native-runner-checkpoint.schema.json").bytes));
    const config={schema_version:"mhc-native-runtime-config/v1",source_revision:opts.revision,project_root:projectRoot,runtime_root:runtimeRoot,spark_automation_id:opts.sparkAutomationId,luna_automation_id:opts.lunaAutomationId};
    const configBytes=Buffer.from(`${JSON.stringify(config,null,2)}\n`);
    const manifest={schema_version:"mhc-native-runtime-manifest/v1",source_revision:opts.revision,created_at:git(sourceRoot,["show","-s","--format=%cI",opts.revision]).toString().trim(),files:entries.map(e=>({path:e.path,sha256:sha(e.bytes),bytes:e.bytes.length}))};
    const manifestBytes=Buffer.from(`${JSON.stringify(manifest,null,2)}\n`),manifestSha=sha(manifestBytes),release=`${opts.revision}-${manifestSha.slice(0,16)}`;
    const releasesRoot=await assertCanonicalPath(runtimeRoot,path.join(runtimeRoot,"releases"),{allowMissing:true});await mkdir(releasesRoot,{recursive:true,mode:0o700});
    const releaseRoot=await assertCanonicalPath(releasesRoot,path.join(releasesRoot,release),{allowMissing:true}),temp=await mkdtemp(path.join(releasesRoot,".install-"));
    try{
      for(const entry of entries){const target=path.join(temp,entry.path);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,entry.bytes,{mode:0o444});}
      await writeFile(path.join(temp,"manifest.json"),manifestBytes,{mode:0o444});
      try{await rename(temp,releaseRoot);}catch(error){if(!["EEXIST","ENOTEMPTY","EPERM"].includes(error.code))throw error;for(const entry of [...entries,{path:"manifest.json",bytes:manifestBytes}]){const target=await assertCanonicalPath(releaseRoot,path.join(releaseRoot,entry.path));if(!entry.bytes.equals(await readFile(target)))throw Error("Existing runtime release differs from committed bytes.");}}
      // Configs are immutable and separately addressed so pointer-last activation
      // cannot pair an old release with a newly replaced configuration.
      const configSha=sha(configBytes),configFile=path.join(runtimeRoot,`config-${configSha}.json`);await assertCanonicalPath(runtimeRoot,configFile,{allowMissing:true});
      try{await writeFile(configFile,configBytes,{flag:"wx",mode:0o444});}catch(error){if(error.code!=="EEXIST"||!(await readFile(configFile)).equals(configBytes))throw error;}
      const launcher=path.join(runtimeRoot,"launcher.mjs"),launcherBytes=entries.find(e=>e.path==="scripts/mhc-native-runtime-launcher.mjs").bytes;
      await assertCanonicalPath(runtimeRoot,launcher,{allowMissing:true});
      // Windows readonly attributes prevent replacement; the bootstrap remains
      // writable by its owner, while every executed release is hash verified.
      await chmod(launcher,0o600).catch(error=>{if(error.code!=="ENOENT")throw error;});await atomic(launcher,launcherBytes);
      await assertCanonicalPath(runtimeRoot,path.join(runtimeRoot,"current.json"),{allowMissing:true});
      await atomic(path.join(runtimeRoot,"current.json"),Buffer.from(`${JSON.stringify({schema_version:"mhc-native-runtime-pointer/v1",source_revision:opts.revision,release,manifest_sha256:manifestSha,config_sha256:configSha},null,2)}\n`));
      process.stdout.write(`${JSON.stringify({action:"installed",sourceRevision:opts.revision,node:process.execPath,launcher,manifestSha256:manifestSha})}\n`);
    }finally{await rm(temp,{recursive:true,force:true}).catch(()=>{});}
  });
}
main().catch(error=>{process.stderr.write(`Native runtime install failed: ${error.message}\n`);process.exitCode=1;});
