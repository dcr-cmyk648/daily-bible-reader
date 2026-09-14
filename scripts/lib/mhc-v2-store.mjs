import {mkdir,readFile,readdir,rename,writeFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {assertCanonicalPath} from './mhc-native-paths.mjs';
import {digestObject} from './mhc-v2.mjs';

export const bytesFor = value => `${JSON.stringify(value,null,2)}\n`;
export async function readJson(file) {return JSON.parse(await readFile(file,'utf8'));}
export async function maybeJson(file) {try{return await readJson(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export async function confined(root,relative,{missing=true}={}) {
  const target=path.resolve(root,relative);
  if(!target.startsWith(`${path.resolve(root)}${path.sep}`))throw new Error('V2_PATH_OUTSIDE_ROOT');
  return assertCanonicalPath(root,target,{allowMissing:missing});
}
export async function atomicJson(root,relative,value,{immutable=false}={}) {
  const target=await confined(root,relative),bytes=bytesFor(value);
  await mkdir(path.dirname(target),{recursive:true,mode:0o700});
  const existing=await lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(existing){if(!existing.isFile()||existing.isSymbolicLink())throw new Error('V2_UNSAFE_ARTIFACT');if(immutable){if(await readFile(target,'utf8')!==bytes)throw new Error('V2_IMMUTABLE_ARTIFACT_CHANGED');return target;}}
  const temporary=`${target}.tmp-${randomBytes(8).toString('hex')}`;
  await writeFile(temporary,bytes,{mode:0o600,flag:'wx'});await rename(temporary,target);return target;
}

const phases=new Set(['queued','generating','fallback_pending','review_pending','editorial_attention','approved','publishing','published','blocked']);
export function assertJobState(state,input) {
  if(!state||!phases.has(state.phase)||state.reading_id!==input.reading_id||state.input_sha256!==input.input_sha256||!state.accepted||!state.rejected||!state.owners||!state.sessions||!Array.isArray(state.history)||!Number.isInteger(state.total_submissions)||state.total_submissions<0)throw new Error('V2_JOB_STATE_INVALID');
  if(Object.values(state.owners).some(lane=>!['spark','luna'].includes(lane)))throw new Error('V2_JOB_MODEL_INVALID');
  const hash=value=>/^[a-f0-9]{64}$/.test(String(value||'')),key=value=>/^MHP2-[a-f0-9]{32}:(spark|luna)$/.test(value);
  if(Object.entries(state.accepted).some(([k,v])=>!key(k)||!hash(v?.candidate_sha256))||Object.entries(state.rejected).some(([k,v])=>!key(k)||!Array.isArray(v)||v.length>2||v.some(h=>!hash(h))))throw new Error('V2_JOB_ATTEMPTS_INVALID');
  if(state.pending_attempt&&(!key(state.pending_attempt.key)||!hash(state.pending_attempt.hash)))throw new Error('V2_JOB_RESERVATION_INVALID');
  if(state.review&&!hash(state.review.approved_sha256))throw new Error('V2_JOB_APPROVAL_INVALID');
  if(state.phase==='published'&&!state.publication)throw new Error('V2_PUBLICATION_PROOF_REQUIRED');
}

// The event chain is the one authoritative lifecycle. There is no second mutable
// checkpoint/status pointer to reconcile. An atomic event append is the commit.
export async function loadJob(directory) {
  const input=await readJson(await confined(directory,'input.json',{missing:false}));
  const {input_sha256,...basis}=input;
  if(digestObject(basis)!==input_sha256)throw new Error('V2_INPUT_HASH_MISMATCH');
  const names=await readdir(await confined(directory,'events',{missing:false}));
  const committed=names.filter(n=>/^\d{6}\.json$/.test(n)).sort();
  if(names.some(n=>!/^\d{6}\.json(?:\.tmp-[a-f0-9]+)?$/.test(n)))throw new Error('V2_EVENT_FILE_INVALID');
  let previous=input_sha256,state=null;
  for(const [index,name] of committed.entries()) {
    if(name!==`${String(index+1).padStart(6,'0')}.json`)throw new Error('V2_EVENT_SEQUENCE_GAP');
    const event=await readJson(await confined(directory,`events/${name}`,{missing:false})),{event_sha256,...body}=event;
    if(event.sequence!==index+1||event.previous_sha256!==previous||digestObject(body)!==event_sha256)throw new Error('V2_EVENT_HASH_MISMATCH');
    assertJobState(event.state,input);state=event.state;previous=event_sha256;
  }
  return {directory,input,state,sequence:committed.length,previous};
}
export async function appendState(job,kind,state,now=new Date()) {
  assertJobState(state,job.input);
  const body={sequence:job.sequence+1,previous_sha256:job.previous,kind,at:new Date(now).toISOString(),state};
  const event={...body,event_sha256:digestObject(body)};
  await atomicJson(job.directory,`events/${String(body.sequence).padStart(6,'0')}.json`,event,{immutable:true});
  return {...job,state,sequence:body.sequence,previous:event.event_sha256};
}
export async function createJob(root,input,now) {
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(input.reading_id))throw new Error('V2_READING_ID_INVALID');
  const directory=await confined(root,input.reading_id);await mkdir(directory,{recursive:true,mode:0o700});
  await atomicJson(directory,'input.json',input,{immutable:true});
  await mkdir(await confined(directory,'events'),{recursive:true,mode:0o700});
  const job=await loadJob(directory);if(job.state)return job;
  const state={reading_id:input.reading_id,input_sha256:input.input_sha256,phase:'generating',owners:Object.fromEntries(input.chapters.map(c=>[`${c.book_id}.${c.chapter}`,'spark'])),accepted:{},rejected:{},history:[],total_submissions:0,pending_attempt:null,session:null,sessions:{},blocker:null,review:null,publication:null,created_at:new Date(now).toISOString()};
  return appendState(job,'created',state,now);
}
