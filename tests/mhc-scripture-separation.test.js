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
