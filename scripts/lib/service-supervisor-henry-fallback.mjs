import {publicSourceUrl} from './service-supervisor-contracts.mjs';
import {sourceWorkBinding} from './service-supervisor-source-binding.mjs';
import {fault} from './service-supervisor-store.mjs';

// This admits an already consulted full-text source, never constructs a URL or
// converts a local archive citation, discovered URL or model assertion to proof.
// Exact chapter coverage is part of the ordinary independent editorial review.
export function verifiedDailyHenryFallback({entry,metadata,registry,research}) {
  const link=metadata?.henrySourceLink,invalid=()=>{throw fault('SUPERVISOR_DAILY_HENRY_FALLBACK_UNVERIFIED');};
  if(entry?.kind!=='chapter'||!link||Object.keys(link).sort().join(',')!=='note,sourceId,title,url'||
    !['sourceId','title','url','note'].every(k=>typeof link[k]==='string'&&link[k].trim())||
    link.sourceId.length>200||link.title.length>200||link.url.length>1000||link.note.length>500||
    metadata.verseCommentary||metadata.verseCommentaries)invalid();
  let url;try{url=publicSourceUrl(link.url);}catch{invalid();}
  const record=research?.records?.find(r=>r.source?.sourceId===link.sourceId),source=record?.source,
    registered=registry?.sources?.find(s=>s.sourceId===link.sourceId),
    proof=research?.evidence?.find(e=>e.sourceId===link.sourceId&&e.url===url);
  if(research?.readingId!==entry.readingId||!source||!registered||source.summaryUseStatus!=='consulted'||
    registered.summaryUseStatus!=='included'||!registered.includedReadings.includes(entry.readingId)||
    sourceWorkBinding(source)!==sourceWorkBinding(registered)||source.rightsStatus!=='public_domain'||
    !/\bMatthew\s+Henry\b/i.test(source.authorOrOrganization)||!/\b(?:complete|full)\b/i.test(`${source.title} ${source.edition}`)||
    /\bconcise\b/i.test(`${source.title} ${source.edition}`)||!proof||!proof.eventId||
    !['cli_returned_page','bounded_anonymous_https','native_web_returned_text'].includes(proof.accessKind)||
    !/^[a-f0-9]{64}$/.test(proof.contentSha256||proof.nativeCapture?.returnedTextSha256||''))invalid();
  try{if(publicSourceUrl(source.urlOrCitation)!==url||publicSourceUrl(record.accessedUrl)!==url)invalid();}catch{invalid();}
  return {henrySourceLink:structuredClone(link)};
}
