import {digest,jsonBytes,fault} from './service-supervisor-store.mjs';
import {assertSchemaValid} from './schema-validator.mjs';
import {isDeepStrictEqual} from 'node:util';
import {DAILY_REVIEW_ASSERTIONS} from './service-supervisor-publication-gates.mjs';

const text=(maximum=4000,minimum=1)=>({type:'string',minLength:minimum,maxLength:maximum});
const array=(items,maximum=256,minimum=0)=>({type:'array',items,maxItems:maximum,minItems:minimum});
const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const constant=value=>({type:value===null?'null':typeof value,const:value});
const common=(packet,version)=>({schemaVersion:constant(version),readingId:constant(packet.readingId),inputSha256:constant(digest(jsonBytes(packet)))});
export function researchContract(packet,sourceSchema) {
  return object({...common(packet,'daily-research/v1'),status:{type:'string',enum:['complete','blocked']},
    records:array(object({sourceJson:text(30000),eventId:constant(null),
      accessedUrl:{type:['string','null']},evidenceExcerpt:text(12000,0),claimNotes:array(text(4000),128),
      inclusionReason:text(),independenceKey:text(500),limitations:array(text())}),256),
    claims:array(object({claimId:text(100),claim:text(),sourceIds:array(text(100),256,1)}),512),
    representedCategories:array(text(100)),missingCategories:array(text(100)),
    stoppingReason:text(),limitations:array(text())});
}
export function synthesisContract(packet) {
  // The child returns a bounded JSON string for the full existing metadata
  // schema. Code parses and validates it locally; no free-form paths or commands.
  return object({...common(packet,'daily-synthesis/v1'),metadataJson:text(1024*1024),markdown:text(1024*1024),
    includedSourceIds:array(text(100),256,2),coverageLimits:array(text())});
}
export function independentReviewContract(packet,{henryAssertions=null}={}) {
  const assertions=henryAssertions||DAILY_REVIEW_ASSERTIONS;
  return object({...common(packet,'independent-review/v1'),verdict:{type:'string',enum:['approved','changes_requested','blocked']},
    assertions:object(Object.fromEntries(assertions.map(k=>[k,{type:'boolean'}]))),findings:array(text(3000),100,1),
    // Henry prose corrections are separately validated by the native controller.
    corrections:array(object({verseId:text(100),replacement:text(1200,20),reason:text(3000,3)}),512),
    repairPacketId:{type:['string','null']},coverageLimits:array(text())});
}
export function henryRepairContract(packet) {
  return object({...common(packet,'henry-editorial-repair/v1'),verdict:{type:'string',enum:['repaired','blocked']},
    candidateJson:text(128*1024),findings:array(text(3000),100,1)});
}
export function publicSourceUrl(value) {
  let url;try{url=new URL(value);}catch{throw fault('SUPERVISOR_SOURCE_URL_INVALID');}
  if(url.protocol!=='https:'||url.username||url.password||
    /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(url.hostname)||
    /^(?:drive|docs|script)\.google\.com$/i.test(url.hostname)||/token|api[_-]?key|secret|credential/i.test(url.search))
    throw fault('SUPERVISOR_SOURCE_URL_INVALID');
  return url.href;
}
const privateText=/https?:\/\/(?:drive|docs|script)\.google\.com\b|\bsk-[A-Za-z0-9_-]{20,}|\bBearer\s+[A-Za-z0-9_.-]{20,}|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i;
const providerCopyright=/(?:copyright|©)[^\n]{0,120}(?:ESV|Crossway)/i;
const numberedPassage=/(?:^|\n)\s*\d{1,3}\s+[^\n]{20,}\n\s*\d{1,3}\s+[^\n]{20,}\n\s*\d{1,3}\s+[^\n]{20,}/i;
const scriptureAttribution=/\b(?:Scripture quotations?|Bible text|Scripture text)\b[^\n]{0,180}\b(?:ESV|Crossway|English Standard Version)\b|\b(?:ESV|English Standard Version)(?:®|\s+Bible)?\s*(?:[.;,:()®-]\s*)*(?:(?:text|translation)\s*)?(?:copyright|©)|(?:copyright|©)\s*(?:©\s*)?2001\b[^\n]{0,120}\b(?:ESV|Crossway)\b/i;
function inspectPrivacy(value,{bibliographic=false}={},depth=0) {
  if(depth>32)throw fault('SUPERVISOR_CHILD_PRIVATE_DATA_REFUSED');
  if(typeof value==='string') {
    if(privateText.test(value))throw fault('SUPERVISOR_CHILD_PRIVATE_DATA_REFUSED');
    // Decode JSON envelopes and nested sourceJson/metadataJson. Serialization
    // must not hide real line breaks, escaped email addresses or attribution.
    if(/^\s*[\[{"]/.test(value)) {
      let decoded;try{decoded=JSON.parse(value);}catch{}
      if(decoded!==undefined&&decoded!==value){inspectPrivacy(decoded,{bibliographic},depth+1);return;}
    }
    if(numberedPassage.test(value)||scriptureAttribution.test(value)||!bibliographic&&providerCopyright.test(value))
      throw fault('SUPERVISOR_CHILD_SCRIPTURE_REFUSED');
  } else if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)) {
    inspectPrivacy(key,{},depth+1);
    if(/^(?:esvText|scriptureText|passageText|verseText)$/i.test(key)&&typeof item==='string'&&item.trim())
      throw fault('SUPERVISOR_CHILD_SCRIPTURE_REFUSED');
    inspectPrivacy(item,{bibliographic},depth+1);
  }
}
export function assertChildPrivacy(value) {inspectPrivacy(value);}
export function assertResearchPacketPrivacy(packet) {
  const {existingSourceInventory,...prose}=packet;assertChildPrivacy(prose);
  if(!Array.isArray(existingSourceInventory))throw fault('SUPERVISOR_RESEARCH_INVENTORY_INVALID');
  const fields=['sourceId','title','authorOrOrganization','edition','urlOrCitation','includedReadings'];
  for(const record of existingSourceInventory) {
    if(!record||Object.keys(record).length!==fields.length||fields.some(k=>!Object.hasOwn(record,k))||
      fields.slice(0,-1).some(k=>typeof record[k]!=='string')||!Array.isArray(record.includedReadings)||
      record.includedReadings.some(v=>typeof v!=='string'))throw fault('SUPERVISOR_RESEARCH_INVENTORY_INVALID');
    // Only this code-selected bibliographic projection may describe a work's
    // copyright. Actual translation attribution, passage/secret content and
    // every other packet field retain their refusal gates. Outputs use the
    // ordinary strict prose guard; arbitrary edition keys convey no exemption.
    inspectPrivacy(record,{bibliographic:true});
  }
}
export function assertDailyReviewPacketPrivacy(packet,priorRegistry) {
  const {registry,...prose}=packet;assertChildPrivacy(prose);
  const {sources,...header}=registry;assertChildPrivacy(header);
  if(!Array.isArray(sources)||!Array.isArray(priorRegistry.sources))throw fault('SUPERVISOR_RESEARCH_INVENTORY_INVALID');
  const prior=new Map(priorRegistry.sources.map(s=>[s.sourceId,s])),seen=new Set();
  for(const source of sources) {
    if(seen.has(source.sourceId))throw fault('SUPERVISOR_REGISTRY_EXISTING_SOURCE_CHANGED');seen.add(source.sourceId);
    const retained=prior.get(source.sourceId);
    if(!retained){assertChildPrivacy(source);continue;}
    if(!isDeepStrictEqual(source,retained))throw fault('SUPERVISOR_REGISTRY_EXISTING_SOURCE_CHANGED');
    const {sourceId,title,authorOrOrganization,edition,urlOrCitation,includedReadings,...other}=source;
    assertChildPrivacy(other);
    assertResearchPacketPrivacy({existingSourceInventory:[{sourceId,title,authorOrOrganization,edition,urlOrCitation,includedReadings}]});
  }
  if([...prior.keys()].some(id=>!seen.has(id)))throw fault('SUPERVISOR_REGISTRY_EXISTING_SOURCE_CHANGED');
}
export function decodeResearch(output,{packet,sourceSchema}) {
  assertSchemaValid(output,researchContract(packet,sourceSchema),{label:'Research output'});assertChildPrivacy(output);
  return {...output,records:output.records.map(({sourceJson,...record})=>{
    const source=JSON.parse(sourceJson);
    assertSchemaValid(source,sourceSchema.$defs.source,{label:'Research source record'});
    return {...record,source};
  })};
}
export function admitResearch(output,{packet,sourceSchema,sourceEvidence,decoded=false}) {
  if(!decoded)output=decodeResearch(output,{packet,sourceSchema});assertChildPrivacy(output);
  if(output.status!=='complete')throw fault('SUPERVISOR_RESEARCH_EDITORIAL_BLOCK');
  const ids=new Set(),consulted=new Set(),independent=new Set(),evidence=[],quoteTotals=new Map();
  for(const record of output.records) {
    const source=record.source;if(ids.has(source.sourceId))throw fault('SUPERVISOR_SOURCE_ID_DUPLICATE');ids.add(source.sourceId);
    if(source.summaryUseStatus==='included'||source.includedReadings.length)throw fault('SUPERVISOR_RESEARCH_CANNOT_SELF_INCLUDE');
    if(source.summaryUseStatus!=='consulted')continue;
    const url=publicSourceUrl(record.accessedUrl),proof=sourceEvidence.findLast(p=>p.url===url&&
      (!p.sourceId||p.sourceId===source.sourceId));
    const local=proof?.kind==='local_verified_henry'&&source.urlOrCitation===proof.locator;
    if(!proof||!local&&publicSourceUrl(source.urlOrCitation)!==url||!record.evidenceExcerpt||
      !proof.returnedContent.includes(record.evidenceExcerpt))throw fault('SUPERVISOR_SOURCE_ACCESS_BINDING_FAILED');
    const wordCount=record.evidenceExcerpt.trim().split(/\s+/).length;
    const workKey=JSON.stringify([source.authorOrOrganization.trim().toLowerCase(),source.title.trim().toLowerCase(),source.edition.trim().toLowerCase()]),
      quoteKey=proof.finalUrl||url,total=(quoteTotals.get(quoteKey)||0)+wordCount;quoteTotals.set(quoteKey,total);
    if(total>(['public_domain','open_license'].includes(source.rightsStatus)?200:25)||
      ['unknown'].includes(source.rightsStatus)||!source.accessDate||!source.accessMethod||
      ['copyrighted','unknown'].includes(source.rightsStatus)&&source.rawTextStorageAllowed)
      throw fault('SUPERVISOR_SOURCE_RIGHTS_OR_ACCESS_FAILED');
    assertChildPrivacy(record.evidenceExcerpt);consulted.add(source.sourceId);independent.add(workKey);
    evidence.push({sourceId:source.sourceId,eventId:proof.eventId,url,contentSha256:proof.contentSha256,
      accessKind:proof.kind||'cli_returned_page',accessMethod:source.accessMethod,accessDate:source.accessDate,
      ...(proof.normalizedTextSha256?{normalizedTextSha256:proof.normalizedTextSha256,normalization:proof.normalization,
        finalUrl:proof.finalUrl,redirects:proof.redirects,rawBodyStored:false}:{}),
      excerpt:record.evidenceExcerpt,excerptSha256:digest(Buffer.from(record.evidenceExcerpt)),
      claimNotes:record.claimNotes,limitations:record.limitations,rightsStatus:source.rightsStatus});
  }
  if(independent.size<2||output.claims.some(c=>c.sourceIds.some(id=>!consulted.has(id))))throw fault('SUPERVISOR_SOURCE_COVERAGE_FAILED');
  return {schemaVersion:'supervisor-research-evidence/v1',readingId:packet.readingId,inputSha256:digest(jsonBytes(packet)),
    records:output.records,claims:output.claims,evidence,representedCategories:output.representedCategories,
    missingCategories:output.missingCategories,stoppingReason:output.stoppingReason,limitations:output.limitations};
}
