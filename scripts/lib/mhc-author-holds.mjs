import path from 'node:path';
import {confined,maybeJson,readJson} from './mhc-v2-store.mjs';
import {assertSchemaValid} from './schema-validator.mjs';

// A hold removes author eligibility; it grants no source/model authority and
// never changes a job, lease, cooldown, attempt or publication receipt.
export async function authorHeldReadingIds(ctx) {
  const value=await maybeJson(await confined(ctx.privateRoot,'automation/mhc-author-holds.json'));
  if(value===null)return new Set();
  try{assertSchemaValid(value,await readJson(path.join(ctx.releaseRoot,'schemas/mhc-author-holds.schema.json')),{label:'Native author holds'});}
  catch{throw Error('V2_AUTHOR_HOLDS_INVALID');}
  if(value.plan_version!==ctx.plan.planVersion||Object.keys(value.held_readings).some(id=>!ctx.plan.entries.some(e=>e.readingId===id)))throw Error('V2_AUTHOR_HOLDS_PLAN_INVALID');
  return new Set(Object.keys(value.held_readings));
}

export const authorHeldWork=readingId=>({pipeline:'mhc-evidence-author/v2',action:'none',state:'author_held',code:'V2_AUTHOR_HELD',readingId,published:false});
