import {Resolver} from 'node:dns/promises';
import {request} from 'node:https';
import {isIP} from 'node:net';
import {publicSourceUrl,assertChildPrivacy} from './service-supervisor-contracts.mjs';
import {digest,fault} from './service-supervisor-store.mjs';
import {sourceWorkBinding} from './service-supervisor-source-binding.mjs';
import {extractSourcePdf} from './service-supervisor-pdf.mjs';
export {sourceWorkBinding} from './service-supervisor-source-binding.mjs';

export function publicAddress(address) {
  if(isIP(address)===6)return /^[23][0-9a-f]{3}:/i.test(address)&&!/^2001:db8:/i.test(address);
  if(isIP(address)!==4)return false;
  const [a,b]=address.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||
    a===192&&(b===0||b===168)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19));
}
function allowedUrl(value) {
  const url=new URL(publicSourceUrl(value));
  if(url.port&&url.port!=='443'||/^(?:api\.|generativelanguage\.)/i.test(url.hostname)||
    /(?:^|\/)(?:api|v1|graphql)(?:\/|$)/i.test(url.pathname))throw fault('SUPERVISOR_SOURCE_URL_INVALID');
  return url;
}
export function plainSourceText(bytes,mimeType) {
  const text=bytes.toString('utf8');
  if(mimeType==='text/plain')return text.replace(/\s+/g,' ').trim();
  return text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<[^>]+>/g,' ').replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos|nbsp|lsquo|rsquo|ldquo|rdquo|ndash|mdash|hellip));/gi,(_,dec,hex,name)=>{
      if(name)return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',ndash:'–',mdash:'—',hellip:'…'}[name.toLowerCase()];
      const code=dec?Number(dec):parseInt(hex,16);return code>0&&code<=0x10ffff?String.fromCodePoint(code):' ';
    }).replace(/\s+/g,' ').trim();
}
async function publicLookup(host,{signal}) {
  const resolver=new Resolver(),cancel=()=>resolver.cancel();signal.addEventListener('abort',cancel,{once:true});
  try {
    const answers=await Promise.allSettled([resolver.resolve4(host),resolver.resolve6(host)]);
    return answers.flatMap((r,i)=>r.status==='fulfilled'?r.value.map(address=>({address,family:i?6:4})):[]);
  } finally {signal.removeEventListener('abort',cancel);}
}
export async function anonymousRequest(url,address,{timeout,maxBytes,signal}) {
  return new Promise((resolve,reject)=>{
    let count=0,responseMeta=null;
    const failed=error=>{error.sourceStage=responseMeta?'body':'transport';error.sourceObservation=responseMeta?{...responseMeta,bytes:count,bodyComplete:false,contentSha256:null}:null;reject(error);};
    const req=request(url,{method:'GET',agent:false,signal,headers:{Accept:'text/html,text/plain;q=0.9,application/pdf;q=0.8','User-Agent':'DailyBibleReader source verifier'},
      lookup:(_host,options,callback)=>options.all?callback(null,[address]):callback(null,address.address,address.family)},res=>{
      const chunks=[];responseMeta={status:res.statusCode,mimeType:String(res.headers['content-type']||'').split(';')[0].toLowerCase()};
      res.on('data',chunk=>{count+=chunk.length;if(count>maxBytes)res.destroy(fault('SUPERVISOR_SOURCE_SIZE_LIMIT'));else chunks.push(chunk);});
      res.on('error',failed);res.on('end',()=>resolve({status:res.statusCode,mimeType:String(res.headers['content-type']||'').split(';')[0].toLowerCase(),
        location:res.headers.location||null,bytes:Buffer.concat(chunks)}));
    });
    req.setTimeout(timeout,()=>req.destroy(fault('SUPERVISOR_SOURCE_TRANSPORT_TIMEOUT')));req.on('error',failed);req.end();
  });
}
async function bounded(operation,signal) {
  if(signal.aborted)throw fault('SUPERVISOR_SOURCE_TRANSPORT_TIMEOUT');
  let cancel;
  const aborted=new Promise((_,reject)=>{cancel=()=>reject(fault('SUPERVISOR_SOURCE_TRANSPORT_TIMEOUT'));signal.addEventListener('abort',cancel,{once:true});});
  try{return await Promise.race([operation(signal),aborted]);}finally{signal.removeEventListener('abort',cancel);}
}
export async function fetchLawfulSource(value,{deadline=Date.now()+30000,maxBytes=2*1024*1024,resolve=publicLookup,fetch=anonymousRequest,pdfExtractor=null,onHop=async()=>{}}={}) {
  let url=allowedUrl(value);const original=url.href,redirects=[];
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1,deadline-Date.now()));
  try {
  for(let count=0;count<=3;count++) {
    let stage='dns',observation={finalUrl:url.href,redirects:[...redirects]},hopCompleted=false;
    await onHop({phase:'reserved',hop:count+1,url:url.href,stage});
    try {
    const remaining=deadline-Date.now();if(remaining<=0)throw fault('SUPERVISOR_SOURCE_TRANSPORT_TIMEOUT');
    const addresses=await bounded(signal=>resolve(url.hostname,{all:true,signal}),controller.signal);
    if(!Array.isArray(addresses)||!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw fault('SUPERVISOR_SOURCE_PRIVATE_ADDRESS_REFUSED');
    stage='transport';await onHop({phase:'dispatched',hop:count+1,url:url.href,stage});
    const address=addresses.find(a=>a.family===4)||addresses[0],result=await bounded(signal=>fetch(url,address,
      {timeout:Math.min(15000,deadline-Date.now()),maxBytes,signal}),controller.signal);
    stage='response';observation={...observation,status:result.status,mimeType:result.mimeType,bytes:Buffer.isBuffer(result.bytes)?result.bytes.length:null,
      bodyComplete:Buffer.isBuffer(result.bytes),contentSha256:Buffer.isBuffer(result.bytes)?digest(result.bytes):null,accessedAt:new Date().toISOString()};
    await onHop({phase:'outcome',hop:count+1,url:url.href,stage,observation,code:null});hopCompleted=true;
    if([301,302,303,307,308].includes(result.status)&&result.location) {
      if(count===3)throw fault('SUPERVISOR_SOURCE_REDIRECT_LIMIT');
      url=allowedUrl(new URL(result.location,url).href);redirects.push(url.href);continue;
    }
    if(result.status!==200||!['text/html','text/plain',...(pdfExtractor?['application/pdf']:[])].includes(result.mimeType)||!Buffer.isBuffer(result.bytes)||
      !result.bytes.length||result.bytes.length>maxBytes)throw Object.assign(fault('SUPERVISOR_SOURCE_ACCESS_UNAVAILABLE'),{
        sourceFailureClass:result.status!==200?'http_status':!['text/html','text/plain',...(pdfExtractor?['application/pdf']:[])].includes(result.mimeType)?'mime':
          !Buffer.isBuffer(result.bytes)?'invalid_body':!result.bytes.length?'empty_body':'size_limit'});
    stage=result.mimeType==='application/pdf'?'extraction':'normalization';
    const pdf=result.mimeType==='application/pdf'?await bounded(signal=>extractSourcePdf(result.bytes,pdfExtractor,{deadline,signal}),controller.signal):null,
      text=pdf?pdf.text.replace(/\s+/g,' ').trim():plainSourceText(result.bytes,result.mimeType);
    observation={...observation,normalization:pdf?'pypdf-plain-whitespace/v1':'html-text/v1',normalizedTextSha256:digest(Buffer.from(text)),
      ...(pdf?{extraction:pdf.extraction}: {})};
    if(!text)throw Object.assign(fault('SUPERVISOR_SOURCE_ACCESS_UNAVAILABLE'),{sourceFailureClass:'empty_text'});
    return {kind:'bounded_anonymous_https',status:result.status,bodyComplete:true,url:original,finalUrl:url.href,redirects,mimeType:result.mimeType,
      contentSha256:digest(result.bytes),normalizedTextSha256:digest(Buffer.from(text)),normalization:pdf?'pypdf-plain-whitespace/v1':'html-text/v1',
      ...(pdf?{extraction:pdf.extraction}:{}),
      bytes:result.bytes.length,returnedContent:text,accessedAt:new Date().toISOString(),rawBodyStored:false};
    } catch(error) {
      error.sourceStage ||= stage;error.sourceObservation={...observation,...error.sourceObservation,finalUrl:url.href,redirects:[...redirects]};
      if(!hopCompleted)await onHop({phase:'outcome',hop:count+1,url:url.href,stage:error.sourceStage,observation:error.sourceObservation,code:error.code||'SUPERVISOR_SOURCE_TRANSPORT_FAILED'});
      throw error;
    }
  }
  throw fault('SUPERVISOR_SOURCE_REDIRECT_LIMIT');
  } finally {clearTimeout(timer);controller.abort();}
}
export async function verifiedResearchSources(output,eventEvidence,{foundation=null,deadline,fetchSource=fetchLawfulSource,maxSources=64,reserve=async()=>{},checkpoint=async()=>{},matchFailed=async()=>{}}={}) {
  const evidence=[...eventEvidence,...(foundation?[foundation.sourceEvidence]:[])];let fetched=0;
  for(const record of output.records) {
    if(record.source.summaryUseStatus!=='consulted'||foundation&&record.source.sourceId===foundation.sourceId||
      evidence.some(e=>e.url===record.accessedUrl&&e.returnedContent?.includes(record.evidenceExcerpt)))continue;
    if(++fetched>maxSources)throw fault('SUPERVISOR_SOURCE_FETCH_BUDGET_EXHAUSTED');
    const opened=eventEvidence.find(e=>e.url===record.accessedUrl);
    if(!opened)throw fault('SUPERVISOR_SOURCE_NOT_OPENED_BY_RESEARCH');
    await reserve({sourceId:record.source.sourceId,url:record.accessedUrl,eventId:opened.eventId});
    const proof=await fetchSource(record.accessedUrl,{deadline:Math.min(deadline??Date.now()+30000,Date.now()+30000),sourceId:record.source.sourceId});
    const excerpt=record.evidenceExcerpt.replace(/\s+/g,' ').trim();assertChildPrivacy(excerpt);
    if(!excerpt||!proof.returnedContent.includes(excerpt)){await matchFailed(record,'SUPERVISOR_SOURCE_ACCESS_BINDING_FAILED');throw fault('SUPERVISOR_SOURCE_ACCESS_BINDING_FAILED');}
    record.evidenceExcerpt=excerpt;record.source.accessDate=proof.accessedAt.slice(0,10);
    record.source.accessMethod='Bounded anonymous HTTPS verification of the returned page and selected excerpt';
    record.limitations.push('Source access proof covers the returned page and selected excerpt; no full-book consultation is claimed.');
    const boundProof={...proof,eventId:opened.eventId,fetchProofId:`anonymous-https-${proof.contentSha256}`,sourceId:record.source.sourceId};
    await checkpoint(record,boundProof);evidence.push(boundProof);
  }
  return evidence;
}
export async function consultResearchSources(output,{foundation=null,deadline,fetchSource=fetchLawfulSource,maxSources=64,reserve=async()=>{},mappings=[],pdfExtractor=null,
  checkpoint=async()=>{},matchFailed=async()=>{}}={}) {
  const evidence=[],seen=new Set(),map=new Map();let fetched=0;
  const quoteCeiling=output.records.some(r=>r.source.summaryUseStatus==='consulted'&&!['public_domain','open_license'].includes(r.source.rightsStatus))?25:200;
  for(const binding of mappings) {
    if(map.has(binding.sourceId)||!Array.isArray(binding.identityTerms)||binding.identityTerms.length<2||
      new Set(binding.identityTerms).size!==binding.identityTerms.length||
      binding.identityTerms.some(t=>typeof t!=='string'||t.trim().length<4))throw fault('SUPERVISOR_SOURCE_MAPPING_INVALID');
    map.set(binding.sourceId,binding);
  }
  async function fetchPage(record,url,purpose) {
    allowedUrl(url);if(++fetched>maxSources)throw fault('SUPERVISOR_SOURCE_FETCH_BUDGET_EXHAUSTED');
    await reserve({sourceId:record.source.sourceId,url,purpose,eventId:null});
    return fetchSource(url,{deadline:Math.min(deadline??Date.now()+30000,Date.now()+30000),pdfExtractor,sourceId:record.source.sourceId});
  }
  for(const record of output.records) {
    const source=record.source;if(source.summaryUseStatus!=='consulted')continue;
    const excerpt=record.evidenceExcerpt.replace(/\s+/g,' ').trim();assertChildPrivacy(excerpt);
    if(!excerpt||source.rightsStatus==='unknown'||['copyrighted','unknown'].includes(source.rightsStatus)&&source.rawTextStorageAllowed||
      excerpt.split(/\s+/).length>(['public_domain','open_license'].includes(source.rightsStatus)?200:25))throw fault('SUPERVISOR_SOURCE_RIGHTS_OR_ACCESS_FAILED');
    if(foundation&&source.sourceId===foundation.sourceId) {
      const proof=foundation.sourceEvidence;
      if(source.urlOrCitation!==foundation.locator||source.rightsStatus!=='public_domain'||!proof||proof.kind!=='local_verified_henry'||
        record.accessedUrl!==null&&record.accessedUrl!==foundation.sourceUrl||!/public domain/i.test(foundation.license||'')||
        !/^[a-f0-9]{64}$/.test(foundation.archiveSha256||'')||foundation.atoms.some(a=>digest(Buffer.from(a.text))!==a.sha256)||
        proof.sourceId!==source.sourceId||proof.locator!==foundation.locator||!proof.returnedContent.replace(/\s+/g,' ').includes(excerpt))
        throw fault('SUPERVISOR_DAILY_HENRY_SOURCE_CHANGED');
      record.accessedUrl=publicSourceUrl(foundation.sourceUrl);record.evidenceExcerpt=excerpt;
      source.accessDate=foundation.verifiedAt.slice(0,10);source.accessMethod='Code-verified local Henry archive, atoms, locator and literal excerpt';
      const localProof={...proof,returnedContent:proof.returnedContent.replace(/\s+/g,' '),archiveSha256:foundation.archiveSha256,
        atomHashes:foundation.atoms.map(a=>({id:a.id,sha256:a.sha256})),accessKind:'local_verified_henry'};
      await checkpoint(record,localProof,{quoteCeiling});evidence.push(localProof);continue;
    }
    const url=publicSourceUrl(record.accessedUrl),binding=map.get(source.sourceId),workSha256=sourceWorkBinding(source);
    if(binding&&(binding.sourceWorkSha256!==workSha256||binding.urlOrCitation!==source.urlOrCitation||binding.accessedUrl!==url))
      throw fault('SUPERVISOR_SOURCE_MAPPING_INVALID');
    let citationUrl;try{citationUrl=publicSourceUrl(source.urlOrCitation);}catch{if(!binding)throw fault('SUPERVISOR_SOURCE_CITATION_BINDING_FAILED');}
    const proof=await fetchPage(record,url,'selected_source_consultation');
    if(proof.kind!=='bounded_anonymous_https'||proof.url!==url||proof.rawBodyStored!==false||!proof.returnedContent.includes(excerpt)) {
      await matchFailed(record,'SUPERVISOR_SOURCE_ACCESS_BINDING_FAILED');throw fault('SUPERVISOR_SOURCE_ACCESS_BINDING_FAILED');
    }
    let citationKind='exact_url';
    if(citationUrl!==url) {
      if(binding) {
        if(!binding.identityTerms.every(term=>proof.returnedContent.includes(term.replace(/\s+/g,' ').trim())))
          throw fault('SUPERVISOR_SOURCE_IDENTITY_BINDING_FAILED');
        citationKind='manager_mapping';seen.add(source.sourceId);
      } else {
        const citationProof=await fetchPage(record,citationUrl,'citation_redirect_verification');
        if(citationProof.kind!=='bounded_anonymous_https'||citationProof.finalUrl!==proof.finalUrl||
          citationProof.contentSha256!==proof.contentSha256)throw fault('SUPERVISOR_SOURCE_CITATION_BINDING_FAILED');
        citationKind='same_returned_page';
      }
    } else if(binding)throw fault('SUPERVISOR_SOURCE_MAPPING_INVALID');
    record.evidenceExcerpt=excerpt;source.accessDate=proof.accessedAt.slice(0,10);
    source.accessMethod=proof.extraction?'Code consultation: bounded anonymous HTTPS PDF bytes, pinned local pypdf extraction and literal normalized selected excerpt':
      'Code consultation: bounded anonymous HTTPS returned bytes and literal normalized selected excerpt';
    record.limitations.push('CLI activity and selected URLs are discovery only; code consultation verifies this returned page and excerpt, not prior child opens or a full book.');
    const boundProof={...proof,eventId:null,sourceId:source.sourceId,fetchProofId:`anonymous-https-${proof.contentSha256}`,
      citationBinding:{kind:citationKind,sourceWorkSha256:workSha256,urlOrCitation:source.urlOrCitation,accessedUrl:url,
        ...(binding?{identityTerms:binding.identityTerms}: {})}};
    await checkpoint(record,boundProof,{quoteCeiling});evidence.push(boundProof);
  }
  if([...map.keys()].some(id=>!seen.has(id)))throw fault('SUPERVISOR_SOURCE_MAPPING_INVALID');
  return evidence;
}
