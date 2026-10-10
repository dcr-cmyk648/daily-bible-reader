import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {loadHenryPlan} from './mhc-priority.mjs';
import {forwardWindow,measuredBuffer} from './service-supervisor-policy.mjs';
import {confined,readPrivate,digest,fault} from './service-supervisor-store.mjs';
import {assertSchemaValid} from './schema-validator.mjs';
import {loadJob} from './mhc-v2-store.mjs';
import {liveHealthCredentialsFromStores,verifyLiveHorizon} from './live-horizon-health.mjs';

export async function authenticatedForwardHealth(ctx,now) {
  const credentials=liveHealthCredentialsFromStores(await readPrivate(ctx.releaseRoot,'config/pages-pwa-public.json'),
    await readPrivate(ctx.projectRoot,'private-content/reader-codes.json'));
  return verifyLiveHorizon(credentials,{now,fetchImpl:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(45000)})});
}
export async function authorizePublicationScope(ctx,request,now,{health=authenticatedForwardHealth}={}) {
  const {plan,appConfig}=await loadHenryPlan(ctx.releaseRoot),window=forwardWindow(plan,appConfig,now);
  const entry=plan.entries.find(e=>e.readingId===request.readingId);
  if(!entry||entry.dayIndex>window.horizonDay)throw fault('SUPERVISOR_PUBLICATION_SCOPE_CHANGED');
  if(window.entries.some(e=>e.readingId===entry.readingId))return {kind:'forward'};
  const buffer=measuredBuffer(plan,appConfig,await health(ctx,now),now);
  if(buffer.status!=='ready')throw fault('SUPERVISOR_HISTORICAL_DEFERRED');
  const manifest=await readPrivate(ctx.projectRoot,'private-content/private-manifest.json');
  if(!manifest.readings?.[entry.readingId]||entry.dayIndex>=window.currentDay)throw fault('SUPERVISOR_HISTORICAL_SCOPE_INVALID');
  if(request.component==='henry') {
    // Continuation of an already authorized, independently approved native job.
    // New historical generation remains the retained selector's responsibility;
    // this publication adapter never opens/replenishes its attempts or leases.
    const job=await loadJob(await confined(ctx.projectRoot,`private-content/automation/mhc-v2/${entry.readingId}`,false));
    if(job.input.reading_id!==entry.readingId||job.input.plan_version!==plan.planVersion||
      job.input.schedule_date>=window.today||job.state.phase!=='publishing'||!job.state.review?.approved_sha256)
      throw fault('SUPERVISOR_HISTORICAL_HENRY_UNAPPROVED');
    return {kind:'retained_henry',inputSha256:job.input.input_sha256,approvedSha256:job.state.review.approved_sha256};
  }
  if(request.component!=='daily'||!request.workOrderPath?.startsWith(`private-content/automation/staging/${entry.readingId}/`)||
    !/^[a-f0-9]{64}$/.test(request.workOrderSha256||''))throw fault('SUPERVISOR_HISTORICAL_PROTOCOL_ORDER_REQUIRED');
  const bytes=await readFile(await confined(ctx.projectRoot,request.workOrderPath,false));
  if(digest(bytes)!==request.workOrderSha256)throw fault('SUPERVISOR_WORK_ORDER_CHANGED');
  const order=JSON.parse(bytes);
  assertSchemaValid(order,await readPrivate(ctx.releaseRoot,'schemas/protocol-backfill-work-order.schema.json'),{label:'Historical protocol order'});
  if(order.planVersion!==plan.planVersion||order.action!=='refresh_review_publish'||
    !isDeepStrictEqual(order.reading,entry)||new Date(now)-Date.parse(order.issuedAt)>24*60*60*1000||Date.parse(order.issuedAt)>new Date(now).getTime())
    throw fault('SUPERVISOR_HISTORICAL_PROTOCOL_ORDER_INVALID');
  return {kind:'protocol_refresh',workOrderPath:request.workOrderPath,workOrderSha256:request.workOrderSha256};
}
