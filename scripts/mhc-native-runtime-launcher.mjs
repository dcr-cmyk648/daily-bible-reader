#!/usr/bin/env node
import {createHash} from "node:crypto";
import {lstat,readFile,realpath} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const sha=value=>createHash("sha256").update(value).digest("hex"),json=async file=>JSON.parse(await readFile(file,"utf8"));
const fail=message=>{throw Error(`Installed native runtime verification failed: ${message}`);};
async function main(){
  const runtimeRoot=path.dirname(fileURLToPath(import.meta.url)),pointerBytes=await readFile(path.join(runtimeRoot,"current.json")),pointer=JSON.parse(pointerBytes),releaseRoot=path.join(runtimeRoot,"releases",pointer.release);
  if(pointer.schema_version!=="mhc-native-runtime-pointer/v1"||!/^[a-f0-9]{40}-[a-f0-9]{16}$/.test(String(pointer.release||""))||!/^[a-f0-9]{64}$/.test(String(pointer.manifest_sha256||""))||!/^[a-f0-9]{64}$/.test(String(pointer.config_sha256||""))||path.dirname(releaseRoot)!==path.join(runtimeRoot,"releases"))fail("invalid runtime pointer");
  const [manifestBytes,configBytes]=await Promise.all([readFile(path.join(releaseRoot,"manifest.json")),readFile(path.join(runtimeRoot,`config-${pointer.config_sha256}.json`))]);
  if(sha(manifestBytes)!==pointer.manifest_sha256||sha(configBytes)!==pointer.config_sha256)fail("pointer digest mismatch");
  const manifest=JSON.parse(manifestBytes),config=JSON.parse(configBytes);if(manifest.schema_version!=="mhc-native-runtime-manifest/v1"||config.schema_version!=="mhc-native-runtime-config/v1"||manifest.source_revision!==pointer.source_revision||config.source_revision!==pointer.source_revision||config.runtime_root!==runtimeRoot)fail("source revision or runtime configuration mismatch");
  const names=new Set();
  for(const entry of manifest.files){if((!/^(scripts|schemas|prompts|fixtures)\/[A-Za-z0-9._/-]+$/.test(entry.path)&&entry.path!=="config/active-calendar/celebration-bridge-long-term-active.json")||entry.path.split("/").some(p=>p===".."||p==="")||names.has(entry.path))fail("invalid manifest file path");names.add(entry.path);const file=path.join(releaseRoot,entry.path);if(!file.startsWith(`${releaseRoot}${path.sep}`))fail("file escaped release");if(await realpath(file)!==file)fail("redirected release file");const bytes=await readFile(file),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)fail(`release file mismatch: ${entry.path}`);}
  if(!names.has("scripts/mhc-native-runner.mjs")||!names.has("scripts/mhc-native-runtime-launcher.mjs"))fail("missing runtime entry");
  if(sha(await readFile(fileURLToPath(import.meta.url)))!==manifest.files.find(e=>e.path==="scripts/mhc-native-runtime-launcher.mjs").sha256)fail("launcher mismatch");
  const projectRoot=await realpath(config.project_root);if(projectRoot!==config.project_root)fail("canonical project root changed");
  for(const relative of ["private-content","private-commentary","research/raw","research/working"]){const target=path.join(projectRoot,relative),stat=await lstat(target),resolved=await realpath(target);if(!stat.isDirectory()||stat.isSymbolicLink()||resolved!==target||!target.startsWith(`${projectRoot}${path.sep}`))fail(`unsafe canonical root: ${relative}`);}
  for(const relative of ["private-content/automation","private-content/automation/mhc-native-work-items","private-content/automation/mhc-runtime","research"]){const target=path.join(projectRoot,relative);const stat=await lstat(target).catch(e=>{if(e.code==="ENOENT")return null;throw e;});if(stat&&(stat.isSymbolicLink()||await realpath(target)!==target))fail("redirected canonical ancestor");}
  const child=spawnSync(process.execPath,[path.join(releaseRoot,"scripts/mhc-native-runner.mjs"),...process.argv.slice(2)],{cwd:projectRoot,encoding:"utf8",windowsHide:true,env:{...process.env,MHC_NATIVE_RUNTIME_CONFIG:path.join(runtimeRoot,`config-${pointer.config_sha256}.json`),MHC_NATIVE_RELEASE_ROOT:releaseRoot,MHC_NATIVE_LAUNCHER:path.join(runtimeRoot,"launcher.mjs"),MHC_NATIVE_MANIFEST_SHA256:pointer.manifest_sha256}});
  process.stdout.write(child.stdout||"");process.stderr.write(child.stderr||"");process.exitCode=child.status??1;
}
main().catch(error=>{process.stderr.write(`${error.message}\n`);process.exitCode=1;});
