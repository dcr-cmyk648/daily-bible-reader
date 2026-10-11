import {createHash} from 'node:crypto';

// October 11 user-approved GEN19 rescue treatment. IDs/hashes are public source
// metadata; source wording and archived/indexed ranges remain unchanged.
const archive='6bcb936873ca144e317805e5c1677940fd86e2403f7c14517752e44f25c8882b';
const unitId='crosswire-mhc-2.2:GEN:019:024-025';
const rescueHashes=[
  'f6797cb4a6f88b00eab67aa2974c7e21b1a474f196c3a262746d49a47635fc44',
  '2949ebf41aa015d1d8856ed69e438ae5624455e426708abeeff17f1ebd6ceced',
  '6a06d2cc24e72afaa00c32fc4b5fcec58c39b032b91c16a31bd54eb5161b1f93',
  '54f93d7f63d51699f771434d70dc5c4e36d681de348a1d500052c09dd0db5532'
];

export function approvedSourceCoverage(units,verse,coverage,{readingId,sourceArchiveSha256}={}) {
  if(readingId!=='LTP-0032-GEN-019'||verse<15||verse>18||
      !units.some(u=>u.book_id==='GEN'&&u.chapter===19))return coverage;
  const context=coverage.sourceUnits,unit=units.find(u=>u.source_unit_id===unitId);
  if(sourceArchiveSha256!==archive||coverage.coverageType!=='no-distinct-comment'||
      context.length!==1||context[0].source_unit_id!=='crosswire-mhc-2.2:GEN:019:012-014'||
      !unit||unit.source_id!=='crosswire-mhc-2.2'||unit.book_id!=='GEN'||unit.chapter!==19||
      unit.verse_start!==24||unit.verse_end!==25||unit.reference_label!=='Genesis 19:24–25')throw Error('MHC_APPROVED_SOURCE_SCOPE_CHANGED');
  const atoms=rescueHashes.map((hash,i)=>{
    const atom=unit.source_atoms.find(a=>a.source_atom_id===`${unitId}:a${String(i+2).padStart(3,'0')}`);
    if(!atom||atom.atom_type!=='commentary'||atom.text_sha256!==hash||
        createHash('sha256').update(atom.text).digest('hex')!==hash)throw Error('MHC_APPROVED_SOURCE_ATOM_CHANGED');
    return atom;
  });
  return {...coverage,sourceUnits:[...context,{...unit,source_atoms:atoms}]};
}
