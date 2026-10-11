const test = require('node:test');
const assert = require('node:assert/strict');
const scripture = '<div type="x-p" sID="FABRICATED-scripture"/>' +
  '<hi type="super">15</hi>FABRICATED SCRIPTURE ONLY ONE.' +
  '<hi type="super">16</hi>FABRICATED SCRIPTURE ONLY TWO.' +
  '<div type="x-p" eID="FABRICATED-scripture"/>';
const commentary = '<div type="x-p" sID="FABRICATED-comment"/>' +
  'FABRICATED COMMENTARY EXPLAINS A BOUNDED ACTION.' +
  '<div type="x-p" eID="FABRICATED-comment"/>';

test('Scripture-only milestone ranges cannot reenter commentary fallback', async () => {
  const {extractCommentaryAtoms} = await import('../scripts/lib/mhc-pipeline.mjs');
  assert.throws(() => extractCommentaryAtoms(scripture, 'FABRICATED:015-016', 'verse_range'),
    /contains no commentary prose after Scripture-transcription removal/);
});

test('mixed milestone ranges retain commentary and exclude Scripture', async () => {
  const {extractCommentaryAtoms} = await import('../scripts/lib/mhc-pipeline.mjs');
  const result = extractCommentaryAtoms(scripture + commentary, 'FABRICATED:mixed', 'verse_range');
  assert.equal(result.atoms.length, 1);
  assert.equal(result.atoms[0].atom_type, 'commentary');
  assert.doesNotMatch(result.atoms[0].text, /FABRICATED SCRIPTURE/);
  assert.match(result.excludedScriptureSha256, /^[a-f0-9]{64}$/);
});

test('unmarked commentary keeps the existing fallback', async () => {
  const {extractCommentaryAtoms} = await import('../scripts/lib/mhc-pipeline.mjs');
  const result = extractCommentaryAtoms('<div>FABRICATED UNMARKED COMMENTARY.</div>', 'FABRICATED:unmarked', 'verse_range');
  assert.equal(result.atoms.length, 1);
});

async function compileAtoms(result) {
  const {compileReading} = await import('../scripts/lib/mhc-v2.mjs');
  return compileReading({entry:{readingId:'FABRICATED-COMPILER',passages:[{bookId:'TST',chapter:1,verseCount:2}]},
    planVersion:'FABRICATED-PLAN',scheduleDate:'2026-10-11',sourceManifest:{source_id:'fabricated',archive_sha256:'a'.repeat(64)},
    chapters:[{bookId:'TST',chapter:1,units:[{schema_version:'mhc-normalized-source/v3',source_id:'fabricated',
      source_unit_id:'FABRICATED:015-016',work_title:'FABRICATED TEST COMMENTARY',book_id:'TST',chapter:1,verse_start:1,verse_end:2,
      reference_label:'FABRICATED 1:1–2',unit_type:'verse_range',source_atoms:result.atoms,
      worker_source_sha256:result.workerSourceSha256,excluded_scripture_sha256:result.excludedScriptureSha256,verse_anchors:[]}]}]});
}

test('compiler rejects a commentary-labelled atom matching the excluded Scripture hash', async () => {
  const {sha256} = await import('../scripts/lib/mhc-pipeline.mjs');
  const text='FABRICATED SCRIPTURE TRANSCRIPTION ONLY';
  await assert.rejects(compileAtoms({atoms:[{source_atom_id:'FABRICATED:015-016:a001',sequence:1,atom_type:'commentary',text,text_sha256:sha256(text)}],
    workerSourceSha256:sha256(text),excludedScriptureSha256:sha256(text)}),/MHC_SCRIPTURE_ATOM_EXCLUDED/);
});

test('compiler retains genuine commentary from a mixed Scripture/commentary range', async () => {
  const {extractCommentaryAtoms} = await import('../scripts/lib/mhc-pipeline.mjs');
  const input=await compileAtoms(extractCommentaryAtoms(scripture+commentary,'FABRICATED:015-016','verse_range'));
  const evidence=input.chapters[0].batches.flatMap(p=>p.evidence);
  assert.ok(evidence.length);assert.ok(evidence.every(e=>!e.text.includes('FABRICATED SCRIPTURE')));
});

test('compiler retains genuine unmarked commentary without an excluded hash', async () => {
  const {extractCommentaryAtoms} = await import('../scripts/lib/mhc-pipeline.mjs');
  const input=await compileAtoms(extractCommentaryAtoms('<div>FABRICATED UNMARKED COMMENTARY.</div>','FABRICATED:015-016','verse_range'));
  assert.equal(input.chapters[0].batches[0].requests.length,2);
  assert.match(input.chapters[0].batches[0].evidence[0].text,/FABRICATED UNMARKED/);
});
