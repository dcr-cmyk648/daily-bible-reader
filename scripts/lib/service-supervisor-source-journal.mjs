import {digest,jsonBytes,durableWrite,fault} from './service-supervisor-store.mjs';
import {assertChildPrivacy,publicSourceUrl} from './service-supervisor-contracts.mjs';
import {sourceWorkBinding} from './service-supervisor-source-binding.mjs';
import {fetchLawfulSource} from './service-supervisor-source-fetch.mjs';
import {readFile} from 'node:fs/promises';
import {verifyRuntime} from './service-supervisor-runtime.mjs';
import {confined} from './service-supervisor-store.mjs';
import {isDeepStrictEqual} from 'node:util';

const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)?value:null;
const integer=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const safeUrl=value=>{try{assertChildPrivacy(decodeURIComponent(value));return publicSourceUrl(value);}catch{return null;}};
const safeMime=value=>['text/html','text/plain','application/pdf','application/octet-stream','application/json','application/xml','text/xml','image/png','image/jpeg'].includes(value)?value:null;
const safeStage=value=>['dns','transport','body','response','normalization','extraction','returned','journal'].includes(value)?value:'transport';
const safeCode=value=>typeof value==='string'&&/^(?:SUPERVISOR_[A-Z0-9_]{1,80}|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ABORT_ERR|ERR_TLS_CERT_ALTNAME_INVALID|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE)$/.test(value)?value:'SUPERVISOR_SOURCE_TRANSPORT_FAILED';
const safeFailure=value=>['http_status','mime','invalid_body','empty_body','size_limit','empty_text'].includes(value)?value:'stage_error';
export function safeSourceOutcome(value={}) {
  const extraction=value.extraction?Object.fromEntries(['method','version','packageSha256','pythonExecutableSha256','extractorSha256',
    'extractedTextSha256','pages','decodedBytes'].map(key=>[key,/Sha256$/.test(key)?hash(value.extraction[key]):
      ['pages','decodedBytes'].includes(key)?integer(value.extraction[key]):['pypdf-plain/v1','6.10.0'].includes(value.extraction[key])?value.extraction[key]:null])):null;
  return {status:Number.isInteger(value.status)&&value.status>=100&&value.status<=599?value.status:null,
    mimeType:safeMime(value.mimeType),bytes:integer(value.bytes),bodyComplete:typeof value.bodyComplete==='boolean'?value.bodyComplete:null,contentSha256:hash(value.contentSha256),
    finalUrl:safeUrl(value.finalUrl),redirects:Array.isArray(value.redirects)?value.redirects.slice(0,3).map(safeUrl).filter(Boolean):[],
    normalization:['html-text/v1','pypdf-plain-whitespace/v1'].includes(value.normalization)?value.normalization:null,
    normalizedTextSha256:hash(value.normalizedTextSha256),extraction,
    accessedAt:typeof value.accessedAt==='string'&&Number.isFinite(Date.parse(value.accessedAt))?new Date(value.accessedAt).toISOString():null};
}
export async function checkedSourceRuntime(ctx,verify=null) {
  const installed=await (verify||(async()=>verifyRuntime(ctx.runtimeRoot,await readFileAwaited(ctx))))();
  if(installed.releaseRoot!==ctx.releaseRoot||!isDeepStrictEqual(installed.config,ctx.config)||installed.pointer.sourceRevision!==ctx.config.sourceRevision||
    installed.pointer.configSha256!==digest(jsonBytes(ctx.config)))throw fault('SUPERVISOR_SOURCE_RUNTIME_BINDING_INVALID');
  return installed.pointer;
}
async function readFileAwaited(ctx) {return readFile(await confined(ctx.runtimeRoot,'launcher.mjs',false));}
export function sourceAttemptRecorder(ctx,{journal,lease,jobId,executionId=null,inputSha256=null,outputSha256=null,runtime,authoritySha256=null,wakeId=null,clock=()=>new Date(),fetchSource=fetchLawfulSource}={}) {
  if(!runtime||runtime.sourceRevision!==ctx.config.sourceRevision||runtime.configSha256!==digest(jsonBytes(ctx.config))||!hash(runtime.manifestSha256)||
    !hash(inputSha256)||!hash(outputSha256)||!executionId)throw fault('SUPERVISOR_SOURCE_RUNTIME_BINDING_INVALID');
  const binding={jobId,executionId,inputSha256,outputSha256,authoritySha256,wakeId,
    runtime:{sourceRevision:runtime.sourceRevision,manifestSha256:runtime.manifestSha256,configSha256:runtime.configSha256}};
  let current=null,lastOutcome=null;
  return {
    get outcome(){return lastOutcome;},
    async fetchSource(url,options={}) {
      const events=await journal.load(),reservation=events.findLast(e=>e.kind==='source_fetch_reserved'&&e.data.jobId===jobId&&e.data.url===url&&e.data.sourceId===options.sourceId);
      if(!reservation)throw fault('SUPERVISOR_SOURCE_RESERVATION_REQUIRED');
      const attemptId=reservation.sha256;
      if(events.some(e=>e.kind==='source_attempt_reserved'&&e.data.attemptId===attemptId))throw fault('SUPERVISOR_SOURCE_ATTEMPT_UNCERTAIN_OR_USED');
      if(!safeUrl(url))throw fault('SUPERVISOR_SOURCE_URL_INVALID');
      current={...binding,attemptId,sourceId:options.sourceId,url:safeUrl(url)};lastOutcome=null;
      await journal.append('source_attempt_reserved',current,clock(),lease);
      const onHop=async hop=>{
        if(!['reserved','dispatched','outcome'].includes(hop.phase)||!Number.isInteger(hop.hop)||hop.hop<1||hop.hop>4)throw fault('SUPERVISOR_SOURCE_HOP_INVALID');
        const data={...current,hop:hop.hop,url:safeUrl(hop.url),stage:safeStage(hop.stage),
          ...(hop.phase==='outcome'?{observation:safeSourceOutcome(hop.observation),code:hop.code?safeCode(hop.code):null}: {})};
        assertChildPrivacy(data);try{await journal.append(`source_hop_${hop.phase}`,data,clock(),lease);}
        catch{throw Object.assign(fault('SUPERVISOR_SOURCE_JOURNAL_FAILED'),{sourceStage:'journal'});}
      };
      try {
        const proof=await fetchSource(url,{...options,onHop});
        lastOutcome={...current,outcome:'returned',stage:'returned',failureClass:null,code:null,observation:safeSourceOutcome(proof),excerptMatched:null};
        await journal.append('source_attempt_outcome',lastOutcome,clock(),lease);return {...proof,sourceAttemptId:attemptId};
      } catch(error) {
        lastOutcome={...current,outcome:'failed',stage:safeStage(error.sourceStage),failureClass:safeFailure(error.sourceFailureClass),code:safeCode(error.code),
          observation:safeSourceOutcome(error.sourceObservation),excerptMatched:null};
        await journal.append('source_attempt_outcome',lastOutcome,clock(),lease);throw error;
      }
    },
    async checkpoint(record,proof,{quoteCeiling=25}={}) {
      assertChildPrivacy(record.evidenceExcerpt);
      const maximum=['public_domain','open_license'].includes(record.source.rightsStatus)?200:25;
      if(!record.evidenceExcerpt||record.evidenceExcerpt.trim().split(/\s+/).length>maximum)throw fault('SUPERVISOR_SOURCE_RIGHTS_OR_ACCESS_FAILED');
      const originalWords=record.evidenceExcerpt.trim().split(/\s+/).length,
        workKey=digest(jsonBytes([record.source.authorOrOrganization.trim().toLowerCase(),record.source.title.trim().toLowerCase(),record.source.edition.trim().toLowerCase()])),
        pageKey=proof.finalUrl||record.accessedUrl,events=await journal.load();
      let workWords=0,pageWords=0,duplicate=false;
      for(const event of events.filter(e=>e.kind==='source_checkpoint_written'&&e.data.jobId===jobId&&e.data.outputSha256===outputSha256)) {
        const bytes=await readFile(await confined(ctx.stateRoot,event.data.checkpoint.path,false));
        if(digest(bytes)!==event.data.checkpoint.sha256)throw fault('SUPERVISOR_SOURCE_CHECKPOINT_CHANGED');
        const saved=JSON.parse(bytes);
        if(saved.sourceId===record.source.sourceId&&saved.originalExcerptSha256===digest(Buffer.from(record.evidenceExcerpt)))duplicate=true;
        if(saved.workKey===workKey)workWords+=saved.quotedWords;
        if(saved.pageKey===pageKey)pageWords+=saved.quotedWords;
      }
      // Mixed-rights pages can converge through redirects that are not yet
      // known. Their private checkpoints use a conservative 25-word ceiling.
      // If the original selection cannot fit, retain hashes/match only, never
      // trim/substitute its excerpt or weaken final 25/200-word admission.
      const retainQuote=!duplicate&&Math.max(workWords,pageWords)+originalWords<=Math.min(maximum,quoteCeiling);
      const checkpoint={schemaVersion:'source-consultation-checkpoint/v1',...binding,attemptId:proof.kind==='local_verified_henry'?null:proof.sourceAttemptId||current?.attemptId,
        sourceId:record.source.sourceId,sourceWorkSha256:sourceWorkBinding(record.source),urlOrCitation:record.source.urlOrCitation,accessedUrl:record.accessedUrl,
        rightsStatus:record.source.rightsStatus,accessKind:proof.kind,observation:safeSourceOutcome(proof),
        ...(proof.citationBinding?{citationBinding:proof.citationBinding}:{}),
        ...(proof.kind==='local_verified_henry'?{archiveSha256:proof.archiveSha256,atomHashes:proof.atomHashes}:{}),
        workKey,pageKey,quotedWords:retainQuote?originalWords:0,quoteCeiling:Math.min(maximum,quoteCeiling),
        excerpt:retainQuote?record.evidenceExcerpt:null,originalExcerptSha256:digest(Buffer.from(record.evidenceExcerpt)),originalExcerptWords:originalWords,
        quoteOmitted:!retainQuote,excerptMatched:true,approval:false,published:false};
      assertChildPrivacy(checkpoint);const bytes=jsonBytes(checkpoint),sha256=digest(bytes),ref={path:`source-checkpoints/${sha256}.json`,sha256};
      await durableWrite(ctx.stateRoot,ref.path,bytes);
      await journal.append('source_checkpoint_written',{...binding,attemptId:checkpoint.attemptId,sourceId:checkpoint.sourceId,checkpoint:ref},clock(),lease);
      return ref;
    },
    async matchFailed(record,code) {
      await journal.append('source_excerpt_outcome',{...binding,attemptId:current?.attemptId,sourceId:record.source.sourceId,
        excerptMatched:false,code},clock(),lease);
    }
  };
}
