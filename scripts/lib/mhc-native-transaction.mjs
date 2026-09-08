import {mkdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import {assertSchemaValid} from "./schema-validator.mjs";
import {sha256} from "./mhc-pipeline.mjs";

const json = value => `${JSON.stringify(value, null, 2)}\n`;
async function atomic(file, bytes) { const temp=`${file}.tmp-${process.pid}`; await writeFile(temp,bytes,{mode:0o600}); await rename(temp,file); }
async function lock(dir, staleMs) { const lockPath=path.join(dir,"lock"); try { await mkdir(lockPath,{mode:0o700}); } catch (error) { if(error.code!=="EEXIST")throw error; if(Date.now()-(await stat(lockPath)).mtimeMs<=staleMs)throw Error("Native transaction lock is active."); await rm(lockPath,{recursive:true,force:true}); await mkdir(lockPath,{mode:0o700}); } return lockPath; }
export async function applyNativeTransaction({root, canonicalRoot, manifest, entries, transactionSchema, progressSchema, failAfter=Infinity, afterWrite=async()=>{}, staleLockMs=120000}) {
  assertSchemaValid(manifest,transactionSchema,{label:"Native review transaction"});
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(manifest.reading_id) || entries.length!==manifest.destinations.length) throw Error("Native transaction manifest identity or entry count is invalid.");
  const destinations=new Set(), stagedFiles=new Set(); for(let i=0;i<manifest.destinations.length;i++){const d=manifest.destinations[i], entry=entries[i], bytes=Buffer.from(json(entry?.value));if(destinations.has(d.destination)||stagedFiles.has(d.staged_file)||entry?.destination!==d.destination||sha256(bytes)!==d.sha256)throw Error("Native transaction destinations or staged entries are not exact and unique.");destinations.add(d.destination);stagedFiles.add(d.staged_file);}
  const tx=path.join(root,`${manifest.reading_id}-${manifest.review_sha256.slice(0,16)}`), staged=path.join(tx,"staged");
  await mkdir(staged,{recursive:true,mode:0o700});
  const manifestPath=path.join(tx,"manifest.json");
  try { const existing=JSON.parse(await readFile(manifestPath,"utf8")); if(JSON.stringify(existing)!==JSON.stringify(manifest))throw Error("Native transaction manifest differs from its deterministic prior transaction."); } catch(e) { if(e.code==="ENOENT")await atomic(manifestPath,json(manifest));else throw e; }
  for(let i=0;i<entries.length;i++){const file=path.join(staged,`${i}.json`),bytes=Buffer.from(json(entries[i].value)); try { const prior=await readFile(file); if(sha256(prior)!==manifest.destinations[i].sha256)throw Error("Native transaction staged bytes are mismatched."); } catch(e) { if(e.code==="ENOENT")await atomic(file,bytes);else throw e; }}
  const lockPath=await lock(tx,staleLockMs); try {
    const progressPath=path.join(tx,"progress.json"); let progress; try {progress=JSON.parse(await readFile(progressPath,"utf8"));} catch(e){if(e.code!=="ENOENT")throw e;progress={schema_version:"mhc-native-review-progress/v1",reading_id:manifest.reading_id,plan_version:manifest.plan_version,review_sha256:manifest.review_sha256,applied:[]};}
    assertSchemaValid(progress,progressSchema,{label:"Native transaction progress"});
    if(progress.reading_id!==manifest.reading_id||progress.plan_version!==manifest.plan_version||progress.review_sha256!==manifest.review_sha256||new Set(progress.applied.map(x=>x.destination)).size!==progress.applied.length||progress.applied.some(x=>!manifest.destinations.some(d=>d.destination===x.destination&&d.sha256===x.sha256)))throw Error("Native transaction progress does not exactly bind its manifest.");
    for(const done of progress.applied){const bytes=await readFile(path.join(canonicalRoot,done.destination));if(sha256(bytes)!==done.sha256)throw Error("Native transaction applied destination was tampered.");}
    let writes=0; for(const d of manifest.destinations){if(progress.applied.some(x=>x.destination===d.destination))continue;const stagedBytes=await readFile(path.join(tx,d.staged_file));if(sha256(stagedBytes)!==d.sha256)throw Error("Native transaction staged digest mismatch.");const destination=path.join(canonicalRoot,d.destination);await mkdir(path.dirname(destination),{recursive:true});await atomic(destination,stagedBytes);if(sha256(await readFile(destination))!==d.sha256)throw Error("Native transaction destination digest mismatch.");progress.applied.push({destination:d.destination,sha256:d.sha256});assertSchemaValid(progress,progressSchema,{label:"Native transaction progress"});await atomic(progressPath,json(progress));writes+=1;await afterWrite({writes,destination});if(writes>=failAfter)throw Error("Native transaction failure injection.");}
    for(const d of manifest.destinations){const bytes=await readFile(path.join(canonicalRoot,d.destination));if(sha256(bytes)!==d.sha256)throw Error("Native transaction post-apply verification failed.");}
    const committed={...manifest,state:"committed"}, committedPath=path.join(tx,"committed.json"); try {const prior=await readFile(committedPath,"utf8");if(JSON.stringify(JSON.parse(prior))!==JSON.stringify(committed))throw Error("Native transaction committed marker mismatch.");}catch(e){if(e.code==="ENOENT")await atomic(committedPath,json(committed));else throw e;} return {tx,committed:true};
  } finally { await rm(lockPath,{recursive:true,force:true}); }
}
