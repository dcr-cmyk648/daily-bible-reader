import {Resolver} from 'node:dns/promises';
import {request} from 'node:https';
import {isIP} from 'node:net';
import {publicSourceUrl,assertChildPrivacy} from './service-supervisor-contracts.mjs';
import {digest,fault} from './service-supervisor-store.mjs';

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
    .replace(/<[^>]+>/g,' ').replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos|nbsp));/gi,(_,dec,hex,name)=>{
      if(name)return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[name.toLowerCase()];
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
    const req=request(url,{method:'GET',agent:false,signal,headers:{Accept:'text/html,text/plain;q=0.9','User-Agent':'DailyBibleReader source verifier'},
      lookup:(_host,options,callback)=>options.all?callback(null,[address]):callback(null,address.address,address.family)},res=>{
      const chunks=[];let count=0;
      res.on('data',chunk=>{count+=chunk.length;if(count>maxBytes)res.destroy(fault('SUPERVISOR_SOURCE_SIZE_LIMIT'));else chunks.push(chunk);});
      res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,mimeType:String(res.headers['content-type']||'').split(';')[0].toLowerCase(),
        location:res.headers.location||null,bytes:Buffer.concat(chunks)}));
    });
    req.setTimeout(timeout,()=>req.destroy(fault('SUPERVISOR_SOURCE_TRANSPORT_TIMEOUT')));req.on('error',reject);req.end();
  });
}
async function bounded(operation,signal) {
  if(signal.aborted)throw fault('SUPERVISOR_SOURCE_TRANSPORT_TIMEOUT');
  let cancel;
  const aborted=new Promise((_,reject)=>{cancel=()=>reject(fault('SUPERVISOR_SOURCE_TRANSPORT_TIMEOUT'));signal.addEventListener('abort',cancel,{once:true});});
  try{return await Promise.race([operation(signal),aborted]);}finally{signal.removeEventListener('abort',cancel);}
}
export async function fetchLawfulSource(value,{deadline=Date.now()+30000,maxBytes=2*1024*1024,resolve=publicLookup,fetch=anonymousRequest}={}) {
  let url=allowedUrl(value);const original=url.href,redirects=[];
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1,deadline-Date.now()));
  try {
  for(let count=0;count<=3;count++) {
    const remaining=deadline-Date.now();if(remaining<=0)throw fault('SUPERVISOR_SOURCE_TRANSPORT_TIMEOUT');
    const addresses=await bounded(signal=>resolve(url.hostname,{all:true,signal}),controller.signal);
    if(!Array.isArray(addresses)||!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw fault('SUPERVISOR_SOURCE_PRIVATE_ADDRESS_REFUSED');
    const address=addresses.find(a=>a.family===4)||addresses[0],result=await bounded(signal=>fetch(url,address,
      {timeout:Math.min(15000,deadline-Date.now()),maxBytes,signal}),controller.signal);
    if([301,302,303,307,308].includes(result.status)&&result.location) {
      if(count===3)throw fault('SUPERVISOR_SOURCE_REDIRECT_LIMIT');
      url=allowedUrl(new URL(result.location,url).href);redirects.push(url.href);continue;
    }
    if(result.status!==200||!['text/html','text/plain'].includes(result.mimeType)||!Buffer.isBuffer(result.bytes)||
      !result.bytes.length||result.bytes.length>maxBytes)throw fault('SUPERVISOR_SOURCE_ACCESS_UNAVAILABLE');
    const text=plainSourceText(result.bytes,result.mimeType);
    if(!text)throw fault('SUPERVISOR_SOURCE_ACCESS_UNAVAILABLE');
    return {kind:'bounded_anonymous_https',url:original,finalUrl:url.href,redirects,mimeType:result.mimeType,
      contentSha256:digest(result.bytes),normalizedTextSha256:digest(Buffer.from(text)),normalization:'html-text/v1',
      bytes:result.bytes.length,returnedContent:text,accessedAt:new Date().toISOString(),rawBodyStored:false};
  }
  throw fault('SUPERVISOR_SOURCE_REDIRECT_LIMIT');
  } finally {clearTimeout(timer);controller.abort();}
}
export async function verifiedResearchSources(output,eventEvidence,{foundation=null,deadline,fetchSource=fetchLawfulSource,maxSources=64,reserve=async()=>{}}={}) {
  const evidence=[...eventEvidence,...(foundation?[foundation.sourceEvidence]:[])];let fetched=0;
  for(const record of output.records) {
    if(record.source.summaryUseStatus!=='consulted'||foundation&&record.source.sourceId===foundation.sourceId||
      evidence.some(e=>e.url===record.accessedUrl&&e.returnedContent?.includes(record.evidenceExcerpt)))continue;
    if(++fetched>maxSources)throw fault('SUPERVISOR_SOURCE_FETCH_BUDGET_EXHAUSTED');
    const opened=eventEvidence.find(e=>e.url===record.accessedUrl);
    if(!opened)throw fault('SUPERVISOR_SOURCE_NOT_OPENED_BY_RESEARCH');
    await reserve({sourceId:record.source.sourceId,url:record.accessedUrl,eventId:opened.eventId});
    const proof=await fetchSource(record.accessedUrl,{deadline:Math.min(deadline??Date.now()+30000,Date.now()+30000)});
    const excerpt=record.evidenceExcerpt.replace(/\s+/g,' ').trim();assertChildPrivacy(excerpt);
    if(!excerpt||!proof.returnedContent.includes(excerpt))throw fault('SUPERVISOR_SOURCE_ACCESS_BINDING_FAILED');
    record.evidenceExcerpt=excerpt;record.source.accessDate=proof.accessedAt.slice(0,10);
    record.source.accessMethod='Bounded anonymous HTTPS verification of the returned page and selected excerpt';
    record.limitations.push('Source access proof covers the returned page and selected excerpt; no full-book consultation is claimed.');
    evidence.push({...proof,eventId:opened.eventId,fetchProofId:`anonymous-https-${proof.contentSha256}`,sourceId:record.source.sourceId});
  }
  return evidence;
}
