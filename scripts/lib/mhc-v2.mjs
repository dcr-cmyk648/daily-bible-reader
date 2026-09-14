import {buildChapterJobSpec, exportChapterRuntime, sha256, stableJson, validateSourceCopyRisk} from './mhc-pipeline.mjs';
import {validateAgainstSchema} from './schema-validator.mjs';

export const VERSION = 'mhc-evidence-author/v2';
export const MODELS = {spark:'gpt-5.3-codex-spark', luna:'gpt-5.6-luna'};
export const MAX_PACKET_BYTES = 96 * 1024;
export const MAX_BATCH_VERSES = 8;
export const MAX_SUBMISSIONS = 2;
export const REVIEW_ASSERTIONS = [
  'every_sentence_supported_by_cited_evidence', 'material_identities_and_relationships_preserved',
  'qualifications_and_alternatives_preserved', 'verse_scope_is_honest',
  'no_outside_material_or_invented_distinction', 'direct_readable_contemporary_prose',
  'no_extended_source_copying', 'every_requested_verse_reviewed'
];

export const candidateSchema = {
  type:'object', required:['schema_version','packet_id','records'], additionalProperties:false,
  properties:{schema_version:{const:'mhc-evidence-candidate/v2'},packet_id:{type:'string',pattern:'^MHP2-[a-f0-9]{32}$'},records:{type:'array',minItems:1,maxItems:MAX_BATCH_VERSES,items:{
    type:'object',required:['verse_id','sentences'],additionalProperties:false,properties:{
      verse_id:{type:'string',pattern:'^[A-Z0-9]{2,8}\\.[1-9][0-9]{0,2}\\.[1-9][0-9]{0,2}$'},
      sentences:{type:'array',minItems:1,maxItems:6,items:{type:'object',required:['text','evidence_ids'],additionalProperties:false,properties:{
        text:{type:'string',minLength:10,maxLength:700},evidence_ids:{type:'array',minItems:1,maxItems:12,uniqueItems:true,items:{type:'string',minLength:3,maxLength:200}}
      }}}
    }
  }}}
};

const includesTerm = (text,term) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:$|[^\\p{L}\\p{N}])`,'iu').test(text.normalize('NFKC'));
export const digestObject = value => sha256(stableJson(value));

// Inputs contain commentary atoms only. Never expose normalized source_text,
// which also accounts for the source module's excluded Scripture transcription.
export function compileReading({entry,planVersion,scheduleDate,sourceManifest,chapters}) {
  const output=[];
  for(const passage of entry.passages) {
    const units=chapters.find(c=>c.bookId===passage.bookId&&c.chapter===passage.chapter)?.units;
    if(!units)throw new Error('V2_SOURCE_MISSING');
    const spec=buildChapterJobSpec({units,sourceManifest,model:MODELS.spark,bookId:passage.bookId,chapter:passage.chapter,verseCount:passage.verseCount,generatedAt:'1970-01-01T00:00:00.000Z',promptVersion:VERSION});
    const evidence=spec.sourceUnits.flatMap(u=>u.source_atoms.map(a=>({evidence_id:a.source_atom_id,source_unit_id:u.source_unit_id,reference_label:u.reference_label,text:a.text,text_sha256:a.text_sha256})));
    if(new Set(evidence.map(e=>e.evidence_id)).size!==evidence.length||evidence.some(e=>!e.text||sha256(e.text)!==e.text_sha256))throw new Error('V2_SOURCE_INTEGRITY');
    const byId=new Map(evidence.map(e=>[e.evidence_id,e]));
    const requests=spec.requestedRecords.map(r=>{
      const visible=r.allowed_source_atom_ids;
      if(visible.some(id=>!byId.has(id)))throw new Error('V2_SOURCE_COVERAGE');
      const requirements=[
        ...r.required_explicit_identity_terms.map(term=>({kind:'identity',terms:[term]})),
        ...r.required_explicit_relations.map(relation=>({kind:'relationship',terms:[relation.term,relation.relation]}))
      ].map(requirement=>({...requirement,evidence_ids:visible.filter(id=>requirement.terms.every(term=>includesTerm(byId.get(id).text,term)))}));
      if(requirements.some(r=>!r.evidence_ids.length))throw new Error('V2_REQUIREMENT_EVIDENCE_MISSING');
      return {verse_id:r.verse_id,coverage_type:r.required_coverage_type,source_unit_ids:r.allowed_source_unit_ids,source_reference_label:r.source_reference_labels.join('; '),evidence_ids:visible,target_evidence_ids:r.target_marked_source_atom_ids,requirements};
    });
    const chapter={book_id:passage.bookId,chapter:passage.chapter,verse_count:passage.verseCount,source_hash:spec.metadata.source_hash,normalized_hash:digestObject(units),batches:[]};
    const packetFor=records=>{
      const wanted=new Set(records.flatMap(r=>r.evidence_ids));
      const payload={schema_version:'mhc-evidence-packet/v2',author_version:VERSION,reading_id:entry.readingId,plan_version:planVersion,book_id:passage.bookId,chapter:passage.chapter,source_hash:chapter.source_hash,requests:records,evidence:evidence.filter(e=>wanted.has(e.evidence_id))};
      return {...payload,packet_id:`MHP2-${digestObject(payload).slice(0,32)}`};
    };
    let pending=[];
    const flush=()=>{if(pending.length){chapter.batches.push(packetFor(pending));pending=[];}};
    for(const request of requests) {
      // Do not cross a natural source-range boundary. Split large treatments by
      // verse count; do not truncate evidence to force a packet under the limit.
      if(pending.length&&(stableJson(pending[0].source_unit_ids)!==stableJson(request.source_unit_ids)||pending.length>=MAX_BATCH_VERSES||Buffer.byteLength(stableJson(packetFor([...pending,request])))>MAX_PACKET_BYTES))flush();
      if(Buffer.byteLength(stableJson(packetFor([request])))>MAX_PACKET_BYTES)throw new Error('V2_SOURCE_PACKET_TOO_LARGE');
      pending.push(request);
    }
    flush();output.push(chapter);
  }
  const input={schema_version:'mhc-reading-input/v2',author_version:VERSION,reading_id:entry.readingId,plan_version:planVersion,schedule_date:scheduleDate,source_archive_sha256:sourceManifest.archive_sha256,chapters:output};
  return {...input,input_sha256:digestObject(input)};
}

export function validateCandidate(candidate,packet) {
  const diagnostics=validateAgainstSchema(candidate,candidateSchema).map(message=>({code:'V2_CANDIDATE_SCHEMA',message}));
  if(diagnostics.length)return {valid:false,diagnostics,records:[],reviewConcerns:[]};
  if(candidate.packet_id!==packet.packet_id)diagnostics.push({code:'V2_PACKET_MISMATCH',message:'Use the exact packet_id supplied with this assignment.'});
  if(candidate.records.length!==packet.requests.length||candidate.records.some((r,i)=>r.verse_id!==packet.requests[i]?.verse_id))diagnostics.push({code:'V2_VERSE_COVERAGE',message:'Return every requested verse exactly once, in the supplied order.'});
  const evidence=new Map(packet.evidence.map(e=>[e.evidence_id,e])),records=[],reviewConcerns=[];
  for(const record of candidate.records) {
    const request=packet.requests.find(r=>r.verse_id===record.verse_id);if(!request)continue;
    const ids=[...new Set(record.sentences.flatMap(s=>s.evidence_ids))];
    const unknown=ids.filter(id=>!request.evidence_ids.includes(id)||!evidence.has(id));
    if(unknown.length)diagnostics.push({code:'V2_EVIDENCE_SCOPE',verse_id:record.verse_id,message:'Cite only evidence IDs allowed for this verse.',allowed_evidence_ids:request.evidence_ids});
    const blurb=record.sentences.map(s=>s.text.trim()).join(' ');
    if(record.sentences.some(s=>s.text.trim().length<10))diagnostics.push({code:'V2_EMPTY_PROSE',verse_id:record.verse_id,message:'Every sentence must contain substantive prose, not whitespace.'});
    if(blurb.length>1200)diagnostics.push({code:'V2_PROSE_LENGTH',verse_id:record.verse_id,message:'Shorten the combined prose to at most 1200 characters.'});
    if(ids.length>12)diagnostics.push({code:'V2_CITATION_LIMIT',verse_id:record.verse_id,message:'Use at most twelve distinct evidence IDs for this verse.'});
    for(const requirement of request.requirements) {
      if(!ids.some(id=>requirement.evidence_ids.includes(id)))diagnostics.push({code:'V2_REQUIRED_EVIDENCE',verse_id:record.verse_id,message:'The required identity or relationship needs supporting evidence, not just its name inserted into prose.',requirement,evidence_ids:requirement.evidence_ids});
      // Ordinary vocabulary is never an authoring gate. Explicit names and
      // relationships are visible review tasks, with their source evidence.
      if(!requirement.terms.every(term=>includesTerm(blurb,term)))reviewConcerns.push({code:'V2_MATERIAL_DETAIL_REVIEW',verse_id:record.verse_id,requirement});
    }
    if(request.target_evidence_ids.some(id=>!ids.includes(id)))reviewConcerns.push({code:'V2_TARGET_TREATMENT_REVIEW',verse_id:record.verse_id,evidence_ids:request.target_evidence_ids});
    const compiled={verse_id:record.verse_id,blurb,coverage_type:request.coverage_type,scope_note:request.coverage_type==='direct'?request.source_reference_label:`${request.source_reference_label} (shared treatment)`,source_unit_ids:request.source_unit_ids,source_atom_ids:ids,source_reference_label:request.source_reference_label};
    if(!unknown.length){const copy=validateSourceCopyRisk({records:[compiled],sourceAtoms:Object.fromEntries(packet.evidence.map(e=>[e.evidence_id,{text:e.text}])),requireCitedSource:true});for(const message of copy.errors)diagnostics.push({code:'V2_SOURCE_COPY',verse_id:record.verse_id,message});}
    records.push(compiled);
  }
  return {valid:diagnostics.length===0,diagnostics,records,reviewConcerns};
}

export function chapterRuntime({chapter,records,units,sourceManifest,model,createdAt}) {
  if(!Object.values(MODELS).includes(model))throw new Error('V2_MODEL_NOT_ALLOWED');
  const wanted=Array.from({length:chapter.verse_count},(_,i)=>`${chapter.book_id}.${chapter.chapter}.${i+1}`);
  if(records.length!==wanted.length||records.some((r,i)=>r.verse_id!==wanted[i]))throw new Error('V2_CHAPTER_INCOMPLETE');
  const spec=buildChapterJobSpec({units,sourceManifest,model,bookId:chapter.book_id,chapter:chapter.chapter,verseCount:chapter.verse_count,generatedAt:createdAt,promptVersion:VERSION});
  if(spec.metadata.source_hash!==chapter.source_hash||digestObject(units)!==chapter.normalized_hash)throw new Error('V2_SOURCE_CHANGED');
  return exportChapterRuntime({...spec.metadata,records},sourceManifest,{valid:true},spec.sourceUnits);
}
