import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,mkdtemp,readFile,readdir,rm,writeFile,cp} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {nativeReviewWorkOrder} from '../scripts/lib/mhc-native-review-work-order.mjs';

const code=fileURLToPath(new URL('..',import.meta.url));
const readingId='FAB-FALLBACK',planVersion='fabricated-fallback-review';
const schema=async name=>JSON.parse(await readFile(path.join(code,'schemas',name),'utf8'));
const schemas={handoffSchema:await schema('mhc-native-review-handoff.schema.json'),transactionSchema:await schema('mhc-native-review-transaction.schema.json'),approvalSchema:await schema('mhc-native-review-approval.schema.json'),candidateSchema:await schema('mhc-native-review-candidate.schema.json'),reviewSchema:await schema('mhc-schedule-review.schema.json')};
async function put(file,value){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(value,null,2)+'\n');}
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),'mhc-fallback-review-')),privateRoot=path.join(root,'private-content'),canonicalRoot=path.join(root,'private-commentary/mhc'),workRoot=path.join(privateRoot,'automation/mhc-native-work-items'),transactionRoot=path.join(workRoot,'transactions');
 const passages=[1,2].map(chapter=>({bookId:'TST',chapter,verseCount:1})),plan={planVersion,entries:[{readingId,planVersion,dayIndex:1,passages}]};
 const handoff={schema_version:'mhc-native-review-handoff/v1',reading_id:readingId,plan_version:planVersion,prompt_version:'fabricated',status:'unreviewed',publication_status:'not_published',review_instruction:'FABRICATED TEST: independent review required',chapters:passages.map(p=>({book_id:p.bookId,chapter:p.chapter,verse_count:p.verseCount,model:'gpt-5.6-luna',automation_id:'fabricated-luna',chunks:[{work_item_id:'MHNWI-'+'a'.repeat(32),work_item_sha256:'a'.repeat(64),lease_id:'b'.repeat(64),model:'gpt-5.6-luna',automation_id:'fabricated-luna',source_hash:'c'.repeat(64),normalized_hash:'d'.repeat(64),job_id:'fabricated-job',fingerprint:'e'.repeat(64),records:[{blurb:'FABRICATED TEST COMMENTARY'}],ledger_event_id:'fabricated-event'}]}))};
 const audit={schema_version:'mhc-schedule-audit/v1',reading_id:readingId,plan_version:planVersion,audit_status:'verified_link_required',review_status:'unreviewed',publication_status:'not_published',main_commentary_unchanged:true,henry_link_fallback_required:true,human_review:{status:'required',approval:null,reviewed_at:null},passages:passages.map(p=>({book_id:p.bookId,chapter:p.chapter,verse_count:p.verseCount,generation_status:'verified_link_required',henry_fallback_required:true,worker_model:null,review_applied:false,corrected_verse_ids:[],runtime_path:null,record_count:0,source_atom_count:0}))};
 const auditPath=path.join(canonicalRoot,'schedule',readingId,'audit.json');
 await put(auditPath,audit);await put(path.join(workRoot,'review-staging',readingId,'review-handoff.json'),handoff);await put(path.join(privateRoot,'private-manifest.json'),{readings:{[readingId]:{}}});
 const args={root,privateRoot,canonicalRoot,workRoot,transactionRoot,libraryRoot:path.join(canonicalRoot,'stores/library'),plan,appConfig:{sharedStartDate:'2026-09-01'},...schemas,runtimeSchemaPath:path.join(code,'schemas/mhc-runtime.schema.json')};
 return {root,audit,auditPath,args};
}
async function snapshot(root,relative=''){const out={};for(const e of await readdir(path.join(root,relative),{withFileTypes:true})){const name=path.join(relative,e.name);if(e.isDirectory())Object.assign(out,await snapshot(root,name));else out[name]=createHash('sha256').update(await readFile(path.join(root,name))).digest('hex');}return out;}

test('actual reviewer CLI discovers new work behind an exact retained fallback audit without writes',async()=>{
 const f=await fixture();try{
  await cp(path.join(code,'schemas'),path.join(f.root,'schemas'),{recursive:true});await put(path.join(f.root,'fixtures/pilot-content/plan.json'),f.args.plan);await put(path.join(f.root,'fixtures/pilot-content/app-config.json'),f.args.appConfig);
  const before=await snapshot(f.root),run=spawnSync(process.execPath,[path.join(code,'scripts/mhc-native-review-work-order.mjs')],{cwd:f.root,encoding:'utf8',env:{...process.env,MHC_NATIVE_TRACKED_ROOT:f.root}});assert.equal(run.status,0,run.stderr);
  const result=JSON.parse(run.stdout);assert.equal(result.action,'review');assert.equal(result.state,'pending_review');assert.equal(result.priorManifestState,'manifest_backed');assert.deepEqual(await snapshot(f.root),before);
 }finally{await rm(f.root,{recursive:true,force:true});}
});

test('fallback recognition preserves fail-closed identity, review, partial-output and transaction boundaries',async t=>{
 const cases=[
  ['wrong reading',a=>a.reading_id='FAB-OTHER'],['wrong plan',a=>a.plan_version='other'],
  ['unknown audit version',a=>a.schema_version='other'],['approved audit',a=>a.audit_status='approved'],
  ['approved review',a=>a.review_status='approved'],['approved human review',a=>a.human_review.approval='approved'],
  ['review timestamp',a=>a.human_review.reviewed_at='2026-09-01T00:00:00Z'],['publication claim',a=>a.publication_status='published'],
  ['missing fallback flag',a=>delete a.henry_link_fallback_required],['missing passage',a=>a.passages.pop()],
  ['reordered passages',a=>a.passages.reverse()],['wrong verse count',a=>a.passages[0].verse_count=2],
  ['null passage',a=>a.passages[0]=null],['partial generated chapter',a=>a.passages[0].generation_status='completed'],
  ['runtime path',a=>a.passages[0].runtime_path='runtime/TST/001.json'],['embedded runtime',a=>a.passages[0].runtime={fabricated:true}],
  ['generated records',a=>a.passages[0].record_count=1],['source atoms',a=>a.passages[0].source_atom_count=1],
  ['applied review',a=>a.passages[0].review_applied=true],['review corrections',a=>a.passages[0].corrected_verse_ids=['TST.1.1']],
  ['native transaction',()=>{},f=>put(path.join(f.args.transactionRoot,readingId+'-fabricated','manifest.json'),{})],
  ['existing runtime',()=>{},f=>put(path.join(f.args.canonicalRoot,'runtime/TST/001.json'),{fabricated:true})],
  ['existing review record',()=>{},f=>put(path.join(f.args.canonicalRoot,'schedule',readingId,'review.json'),{fabricated:true})]
 ];
 for(const [name,mutate,setup] of cases)await t.test(name,async()=>{const f=await fixture();try{mutate(f.audit);await put(f.auditPath,f.audit);if(setup)await setup(f);const before=await snapshot(f.root),result=await nativeReviewWorkOrder(f.args);assert.equal(result.state,'blocked');assert.equal(result.action,'none');assert.deepEqual(await snapshot(f.root),before);}finally{await rm(f.root,{recursive:true,force:true});}});
});
