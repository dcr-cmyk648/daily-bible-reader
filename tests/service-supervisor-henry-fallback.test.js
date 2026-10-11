const test=require('node:test'),assert=require('node:assert/strict');
const modulePromise=import('../scripts/lib/service-supervisor-henry-fallback.mjs');
function fixture() {
  const entry={kind:'chapter',readingId:'FABRICATED-reading',passages:[{bookId:'GEN',chapter:16}]},
    source={sourceId:'FABRICATED-source',title:'FABRICATED Matthew Henry Complete Commentary',authorOrOrganization:'Matthew Henry (FABRICATED)',
      edition:'FABRICATED complete edition',urlOrCitation:'https://example.invalid/FABRICATED-complete-chapter',rightsStatus:'public_domain',
      license:'FABRICATED public domain',summaryUseStatus:'consulted'},
    metadata={henrySourceLink:{sourceId:source.sourceId,title:'FABRICATED full chapter',url:source.urlOrCitation,note:'FABRICATED no real source or Scripture.'}},
    registry={sources:[{...source,summaryUseStatus:'included',includedReadings:[entry.readingId]}]},
    research={readingId:entry.readingId,records:[{source,accessedUrl:source.urlOrCitation}],
      evidence:[{sourceId:source.sourceId,url:source.urlOrCitation,eventId:'FABRICATED-open',accessKind:'cli_returned_page',contentSha256:'f'.repeat(64)}]};
  return {entry,metadata,registry,research};
}
test('full-link attachment copies an exact admitted, included public-domain Henry record',async()=>{
  const {verifiedDailyHenryFallback}=await modulePromise,f=fixture(),attachment=verifiedDailyHenryFallback(f);
  assert.deepEqual(attachment,{henrySourceLink:f.metadata.henrySourceLink});assert.notEqual(attachment.henrySourceLink,f.metadata.henrySourceLink);
});
const invalidCases={
  invented:f=>{f.metadata.henrySourceLink.url+='-invented';},
  local_only:f=>{f.research.evidence[0].accessKind='local_verified_henry';},
  discovered:f=>{f.research.records[0].source.summaryUseStatus='discovered';},
  missing_evidence:f=>{f.research.evidence=[];},
  wrong_reading:f=>{f.research.readingId='FABRICATED-other';},
  registry_changed:f=>{f.registry.sources[0].edition='FABRICATED altered';},
  not_included:f=>{f.registry.sources[0].includedReadings=[];},
  copyrighted:f=>{f.research.records[0].source.rightsStatus='copyrighted';},
  concise:f=>{f.research.records[0].source.edition='FABRICATED concise edition';},
  other_author:f=>{f.research.records[0].source.authorOrOrganization='FABRICATED different author';},
  unsafe_url:f=>{f.metadata.henrySourceLink.url='https://user:pass@example.invalid/FABRICATED';},
  ambiguous_attachment:f=>{f.metadata.verseCommentaries=[];},
  extra_field:f=>{f.metadata.henrySourceLink.claim='FABRICATED extra';},
  no_hash:f=>{delete f.research.evidence[0].contentSha256;}
};
for(const [name,mutate] of Object.entries(invalidCases))test(`full-link fallback refuses ${name} instead of fabricating or authoring`,async()=>{
  const {verifiedDailyHenryFallback}=await modulePromise,f=fixture();mutate(f);
  assert.throws(()=>verifiedDailyHenryFallback(f),/SUPERVISOR_DAILY_HENRY_FALLBACK_UNVERIFIED/);
});
