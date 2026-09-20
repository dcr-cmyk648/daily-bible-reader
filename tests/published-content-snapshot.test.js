import assert from "node:assert/strict";
import test from "node:test";
import {access, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import os from "node:os";
import path from "node:path";
import {withPublishedContentSnapshot} from "../scripts/lib/published-content-snapshot.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dbr-publication-test-"));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("dbr-publication-test-"));
    await rm(root, {recursive:true, force:true});
  });
  const save = async (file, value) => {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), {recursive:true});
    await writeFile(target, typeof value === "string" ? value : JSON.stringify(value));
  };
  const entries = ["FAKE-A", "FAKE-B", "FAKE-C"].map((readingId, index) => ({
    readingId, dayIndex:index + 1, planVersion:"fabricated"
  }));
  const plan = {planVersion:"fabricated", entries:entries.slice(0,2)};
  const manifest = {schemaVersion:"private-manifest/v1",readings:Object.fromEntries(
    entries.slice(0,2).map(({readingId}) => [readingId,{contentFileId:"fabricated-content",metadataFileId:"fabricated-metadata"}])
  )};
  await save("config/active-calendar/celebration-bridge-long-term-active.json", {...plan,entries});
  await save("fixtures/pilot-content/plan.json",plan);
  await save("fixtures/pilot-content/app-config.json",{testingReadingIds:["FAKE-A","FAKE-B"]});
  await save("private-content/private-manifest.json",manifest);
  for(const id of ["FAKE-A","FAKE-B","FAKE-C"]) {
    await save("private-content/bridge/celebration-y3q4/"+id+".md","FABRICATED TEST CONTENT "+id);
    await save("private-content/bridge/celebration-y3q4/"+id+".metadata.json",{label:"FABRICATED TEST METADATA",readingId:id});
  }
  return {root,save,plan,manifest,entries};
}

test("published validation isolates an interrupted future draft without deleting or admitting it", async t => {
  const f=await fixture(t);
  let snapshot;
  const value=await withPublishedContentSnapshot({root:f.root,consume:async ({contentDir,excludedCount,readingCount})=>{
    snapshot=contentDir;
    assert.equal(excludedCount,2);
    assert.equal(readingCount,2);
    assert.deepEqual((await readdir(contentDir)).sort(),["FAKE-A.md","FAKE-A.metadata.json","FAKE-B.md","FAKE-B.metadata.json"]);
    assert.equal(await readFile(path.join(contentDir,"FAKE-A.md"),"utf8"),"FABRICATED TEST CONTENT FAKE-A");
    return "validated";
  }});
  assert.equal(value,"validated");
  assert.equal(await readFile(path.join(f.root,"private-content/bridge/celebration-y3q4/FAKE-C.md"),"utf8"),"FABRICATED TEST CONTENT FAKE-C");
  await assert.rejects(access(snapshot));
});

test("missing or nonregular published input fails before publication validation can succeed", async t => {
  const f=await fixture(t);
  const file=path.join(f.root,"private-content/bridge/celebration-y3q4/FAKE-B.md");
  await rm(file);
  let called=false;
  await assert.rejects(withPublishedContentSnapshot({root:f.root,consume:()=>{called=true;}}),/ENOENT/);
  assert.equal(called,false);
  await mkdir(file);
  await assert.rejects(withPublishedContentSnapshot({root:f.root,consume:()=>{called=true;}}),/NOT_REGULAR/);
});

test("manifest gaps and an unpublished plan extension cannot masquerade as the published prefix",async t=>{
  const f=await fixture(t);
  delete f.manifest.readings["FAKE-A"];
  await f.save("private-content/private-manifest.json",f.manifest);
  await assert.rejects(withPublishedContentSnapshot({root:f.root,consume:()=>assert.fail("must not consume")}),/contiguous/);
  f.manifest.readings["FAKE-A"]={contentFileId:"fabricated",metadataFileId:"fabricated"};
  await f.save("private-content/private-manifest.json",f.manifest);
  await f.save("fixtures/pilot-content/plan.json",{...f.plan,entries:f.entries});
  await assert.rejects(withPublishedContentSnapshot({root:f.root,consume:()=>assert.fail("must not consume")}),/shorter prefix/);
});

test("published corruption reaches the strict validator and its failure propagates with snapshot cleanup",async t=>{
  const f=await fixture(t);
  await f.save("private-content/bridge/celebration-y3q4/FAKE-B.metadata.json","FABRICATED CORRUPT JSON");
  let snapshot;
  await assert.rejects(withPublishedContentSnapshot({root:f.root,consume:async ({contentDir})=>{
    snapshot=contentDir;
    JSON.parse(await readFile(path.join(contentDir,"FAKE-B.metadata.json"),"utf8"));
  }}),SyntaxError);
  await assert.rejects(access(snapshot));
});

test("the published wrapper runs the unchanged full check with a narrowly scoped validation mode",async()=>{
  const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
  const wrapper=await readFile(new URL("../scripts/check-published-content.mjs",import.meta.url),"utf8");
  assert.equal(pkg.scripts["check:published"],"node scripts/check-published-content.mjs");
  assert.match(wrapper,/\[npmCli, "run", "check"\]/);
  assert.match(wrapper,/DBR_PRIVATE_VALIDATION_SCOPE: "manifest"/);
  assert.match(pkg.scripts.check,/npm run safety.*npm run validate:private.*npm test.*npm run build.*npm run verify:pages/);
});

test("the real strict validator rejects admitted corruption even with an unrelated interrupted draft",async t=>{
  const f=await fixture(t);
  await mkdir(path.join(f.root,"schemas"),{recursive:true});
  for (const name of ["commentary.schema.json","source.schema.json","mhc-runtime.schema.json"]) {
    await copyFile(new URL("../schemas/"+name,import.meta.url),path.join(f.root,"schemas",name));
  }
  await f.save("research/working/bridge-source-registry.json",{schemaVersion:"source-registry/v1",registryVersion:"fabricated",updatedAt:null,sources:[]});
  const script=fileURLToPath(new URL("../scripts/validate-private-content.mjs",import.meta.url));
  const run=(args)=>spawnSync(process.execPath,[script,"--require",...args],{cwd:f.root,encoding:"utf8",windowsHide:true,env:{...process.env,DBR_PRIVATE_VALIDATION_SCOPE:""}});
  const strict=run([]);
  assert.equal(strict.status,1);
  assert.match(strict.stderr,/directory must contain exactly 4 files/);
  const published=run(["--manifest-backed"]);
  assert.equal(published.status,1);
  assert.match(published.stderr,/FAKE-A private commentary/);
  assert.doesNotMatch(published.stderr,/directory must contain exactly/);
  assert.equal((await readdir(path.join(f.root,"private-content/bridge/celebration-y3q4"))).length,6);
});
