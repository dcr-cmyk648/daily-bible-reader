import path from 'node:path';
import {atomicJson,readJson} from './mhc-v2-store.mjs';

// Candidate only. Existing publisher must re-fetch/compare, merge pointers and
// perform exact readback. A local stage never claims an in-app notice delivered.
export async function stageAuthorBlock(ctx,failure,now=new Date()) {
  let manifest;try{manifest=await readJson(path.join(ctx.privateRoot,'private-manifest.json'));}catch(error){
    if(error.code==='ENOENT')return {statusCandidatePath:null,statusPublished:false,statusStageError:'V2_STATUS_MANIFEST_MISSING'};
    throw error;
  }
  manifest.preparationStatus={...manifest.preparationStatus,schemaVersion:'preparation-status/v1',state:'blocked',
    summary:`Henry author ${failure.model||'configuration'}: ${failure.reason||failure.code}`.slice(0,240),
    action:'Open BibleApp Manager in Codex to repair the author service.',updatedAt:now.toISOString()};
  const statusCandidatePath=await atomicJson(ctx.privateRoot,'automation/staging/service-status/manifest-candidate.json',manifest);
  return {statusCandidatePath,statusPublished:false};
}
