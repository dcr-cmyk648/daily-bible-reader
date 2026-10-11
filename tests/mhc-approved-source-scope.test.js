import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedSourceCoverage} from '../scripts/lib/mhc-approved-source-scope.mjs';

const readingId='LTP-0032-GEN-019',sourceArchiveSha256='6bcb936873ca144e317805e5c1677940fd86e2403f7c14517752e44f25c8882b';
const coverage={coverageType:'no-distinct-comment',sourceUnits:[{source_unit_id:'crosswire-mhc-2.2:GEN:019:012-014'}]};
const units=[{source_id:'crosswire-mhc-2.2',source_unit_id:'crosswire-mhc-2.2:GEN:019:024-025',book_id:'GEN',chapter:19,
  verse_start:24,verse_end:25,reference_label:'Genesis 19:24–25',source_atoms:[{source_atom_id:'crosswire-mhc-2.2:GEN:019:024-025:a002',
    atom_type:'commentary',text:'FABRICATED SOURCE CLAIMING AN APPROVED ID MUST BE REJECTED',text_sha256:'a'.repeat(64)}]}];

test('approved GEN19 scope rejects fabricated atoms claiming real source IDs',()=>{
  assert.throws(()=>approvedSourceCoverage(units,15,coverage,{readingId,sourceArchiveSha256}),/MHC_APPROVED_SOURCE_ATOM_CHANGED/);
});
test('approved GEN19 scope fails closed on archive or indexed-coverage drift',()=>{
  assert.throws(()=>approvedSourceCoverage(units,15,coverage,{readingId,sourceArchiveSha256:'b'.repeat(64)}),/MHC_APPROVED_SOURCE_SCOPE_CHANGED/);
  assert.throws(()=>approvedSourceCoverage(units,15,{...coverage,coverageType:'range-derived'},{readingId,sourceArchiveSha256}),/MHC_APPROVED_SOURCE_SCOPE_CHANGED/);
});
test('scope policy grants nothing to another reading, book, or verse',()=>{
  for(const [sourceUnits,verse,scope] of [[units,15,{readingId:'OTHER',sourceArchiveSha256}],[units,19,{readingId,sourceArchiveSha256}],
    [[{book_id:'TST',chapter:19}],15,{readingId,sourceArchiveSha256}]])assert.equal(approvedSourceCoverage(sourceUnits,verse,coverage,scope),coverage);
});
