#!/usr/bin/env node
// Read-only source compilation for the published forward window. No job creation,
// author calls, leases, review, normalization writes, or publication.
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadHenryPlan,henryPriorityWindow} from './lib/mhc-priority.mjs';
import {sourceInput} from './lib/mhc-v2-service.mjs';
async function main() {
  if(process.argv.length!==2)throw Error('PREFLIGHT_ARGUMENTS_INVALID');
  const root=process.cwd(),{plan,appConfig}=await loadHenryPlan(root);
  const window=henryPriorityWindow(appConfig),privateRoot=path.join(root,'private-content');
  const manifest=JSON.parse(await fs.readFile(path.join(privateRoot,'private-manifest.json'),'utf8'));
  const projectRoot=path.dirname(await fs.realpath(privateRoot));
  const ctx={projectRoot,releaseRoot:root,plan,appConfig,mhcRoot:await fs.realpath(path.join(root,'private-commentary/mhc'))};
  const readings=[];
  for(const entry of plan.entries.filter(e=>e.kind==='chapter'&&e.dayIndex>=window.currentDay&&e.dayIndex<=window.horizonDay)) {
    if(!manifest.readings?.[entry.readingId]){readings.push({readingId:entry.readingId,status:'awaiting_devotional'});continue;}
    try{const {input}=await sourceInput(ctx,entry);readings.push({readingId:entry.readingId,status:'valid',packets:input.chapters.reduce((n,c)=>n+c.batches.length,0)});}
    catch(error){readings.push({readingId:entry.readingId,status:'blocked',code:/^V2_[A-Z_]+$/.test(error.message)?error.message:'SOURCE_PREFLIGHT_FAILED'});}
  }
  const blocked=readings.some(r=>r.status==='blocked');
  console.log(JSON.stringify({schemaVersion:'mhc-window-preflight/v1',effectiveDate:window.today,status:blocked?'blocked':'valid',readings}));
  if(blocked)process.exitCode=1;
}
main().catch(()=>{console.log(JSON.stringify({status:'error',code:'SOURCE_PREFLIGHT_FAILED'}));process.exitCode=1;});
