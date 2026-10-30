import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

// Exercise the actual CLI parser with copied source and wholly fabricated
// dependencies. No installed runtime, provider binary or author is invoked.
for(const lane of ['spark','luna'])test(`fabricated ${lane} CLI rejects ambiguous receipt flags before lock or author entry`,async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'mhc-reuse-cli-fabricated-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(path.join(root,'lib'));await mkdir(path.join(root,'schemas'));
  const runner=await readFile(fileURLToPath(new URL('../scripts/mhc-native-runner.mjs',import.meta.url)));await writeFile(path.join(root,'runner.mjs'),runner);
  const modules={
    'mhc-native-runner.mjs':"import {writeFileSync} from 'node:fs';export const startRunner=()=>{},advanceRunner=()=>{},withRunnerLock=async(ctx,fn)=>{writeFileSync(process.env.FABRICATED_EFFECT+'.lock','FABRICATED');return fn();};",
    'mhc-v2-service.mjs':"export const serviceContext=async ctx=>ctx,startV2=()=>{},advanceV2=()=>{},reviewWorkOrderV2=()=>{},applyReviewV2=()=>{},statusV2=()=>{},editorialRepairV2=()=>{},requestEditorialV2=()=>{},migrateCurrentV2=()=>{},reopenReviewV2=()=>{};",
    'mhc-v2-author-session.mjs':"import {writeFileSync} from 'node:fs';export const runAuthorSession=async(ctx,options)=>{writeFileSync(process.env.FABRICATED_EFFECT+'.author','FABRICATED');return {action:'none',state:'FABRICATED_WIRING_ONLY',options};},authorPreflight=()=>{throw Error('FABRICATED no provider allowed');};",
    'mhc-v2-client-upgrade.mjs':"export const recoverClientUpgrade=()=>{};",
    'mhc-native-supervisor-guard.mjs':"export const assertNativeWriterAllowed=async()=>{};",
    'mhc-gen24-recovery.mjs':"export const inspectGen24Recovery=()=>{},prepareGen24Recovery=()=>{},runGen24Recovery=()=>{},diagnoseGen24Recovery=()=>{};",
    'mhc-v2-error-code.mjs':"export const safeV2ErrorCode=e=>e.message;"
  };for(const [name,source]of Object.entries(modules))await writeFile(path.join(root,'lib',name),source+'\n');
  const configPath=path.join(root,'config.json');await writeFile(configPath,JSON.stringify({pipeline_version:'mhc-evidence-author/v2',project_root:root,runtime_root:path.join(root,'runtime')}));await writeFile(path.join(root,'schemas/mhc-native-runner-checkpoint.schema.json'),'{}\n');
  const id='a'.repeat(64),raw='b'.repeat(64),pair=['--preflight-receipt',id,'--preflight-receipt-sha256',raw],cases=[
    ['valid',pair,true],['default',[],true],
    ['duplicate_identity_conflict',[...pair,'--preflight-receipt','c'.repeat(64)],false],['duplicate_identity_same',[...pair,'--preflight-receipt',id],false],
    ['duplicate_raw_conflict',[...pair,'--preflight-receipt-sha256','d'.repeat(64)],false],['duplicate_raw_same',[...pair,'--preflight-receipt-sha256',raw],false],
    ['missing_identity',['--preflight-receipt-sha256',raw],false],['missing_raw',['--preflight-receipt',id],false],
    ['missing_identity_value',['--preflight-receipt-sha256',raw,'--preflight-receipt'],false],['missing_raw_value',['--preflight-receipt',id,'--preflight-receipt-sha256'],false],
    ['invalid_identity',['--preflight-receipt','FABRICATED',...pair.slice(2)],false],['invalid_raw',[...pair.slice(0,2),'--preflight-receipt-sha256','FABRICATED'],false],
    ['equals_identity',[`--preflight-receipt=${id}`,...pair.slice(2)],false],['equals_both',[`--preflight-receipt=${id}`,`--preflight-receipt-sha256=${raw}`],false],['unknown_receipt_flag',['--preflight-receipt-typo',id],false]
  ];
  const exists=async file=>!!await lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  for(const [name,flags,valid]of cases)await t.test(name,async()=>{
    const effect=path.join(root,name),executable=path.join(root,'FABRICATED-NOT-EXECUTED.exe'),child=spawnSync(process.execPath,[path.join(root,'runner.mjs'),'author-run','--lane',lane,'--max-readings','3','--codex-executable',executable,...flags],{encoding:'utf8',windowsHide:true,timeout:10000,env:{...process.env,FABRICATED_EFFECT:effect,MHC_NATIVE_RUNTIME_CONFIG:configPath,MHC_NATIVE_RELEASE_ROOT:root,MHC_NATIVE_LAUNCHER:path.join(root,'FABRICATED-LAUNCHER'),MHC_NATIVE_MANIFEST_SHA256:'e'.repeat(64)}});
    assert.equal(child.error,undefined);assert.equal(child.stderr,'');assert.equal(child.status,valid?0:1);const result=JSON.parse(child.stdout);
    assert.equal(await exists(effect+'.lock'),valid);assert.equal(await exists(effect+'.author'),valid);
    if(valid){assert.equal(result.state,'FABRICATED_WIRING_ONLY');assert.equal(result.options.preflightReceipt,name==='default'?undefined:id);assert.equal(result.options.preflightReceiptSha256,name==='default'?undefined:raw);}
    else assert.equal(result.code,'V2_TRANSPORT_PREFLIGHT_RECEIPT_ARGUMENTS_INVALID');
  });
});
