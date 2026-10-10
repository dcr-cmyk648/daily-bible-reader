import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {henryPriorityWindow} from './mhc-priority.mjs';
import {serviceBufferReport} from './service-buffer.mjs';
import {digest, fault} from './service-supervisor-store.mjs';
import {assertCanonicalPath} from './mhc-native-paths.mjs';

export const LANES = ['daily', 'henry_primary', 'henry_recovery', 'review'];
export const ROLES = ['preparation', 'review-audit'];
const rank = {recover_publication: 0, publish: 1, review: 2, daily_author: 3, henry_author: 4};
const phaseAction = {publishing: 'recover_publication', verification_pending: 'recover_publication', approved: 'publish',
  review_pending: 'review', reviewing: 'review', editorial_attention: 'review'};
const dateFor = (config, day) => new Date(Date.parse(`${config.sharedStartDate}T00:00:00Z`) + (day - 1) * 86400000).toISOString().slice(0, 10);

export function forwardWindow(plan, appConfig, now) {
  const window = henryPriorityWindow(appConfig, now);
  if (!Array.isArray(plan.entries) || new Set(plan.entries.map(e => e.readingId)).size !== plan.entries.length ||
      plan.entries.some((e, i) => e.dayIndex !== i + 1 || e.planVersion !== plan.planVersion ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(e.readingId))) throw fault('SUPERVISOR_PLAN_INVALID');
  return {...window, entries: plan.entries.filter(e => e.dayIndex >= Math.max(1, window.currentDay) && e.dayIndex <= window.horizonDay)
    .map(e => ({...e, scheduleDate: dateFor(appConfig, e.dayIndex)}))};
}
export function measuredBuffer(plan, appConfig, health, now) {
  const window = forwardWindow(plan, appConfig, now), expected = window.entries.map(e => e.readingId);
  const report = serviceBufferReport(health);
  if (!report.measurementComplete || health.effectiveDate !== window.today ||
      JSON.stringify(health.readingIds) !== JSON.stringify(expected)) throw fault('SUPERVISOR_HEALTH_SCOPE_INVALID');
  // These additive fields are produced natively by the accepted WO-2 version;
  // retaining them here also permits Stage A's adapter before that dependency lands.
  return {...report, readingIds: expected, fallbackReadingIds: health.currentHorizonHenryLayer.fallbackReadingIds || []};
}
export function selectEDF({plan, appConfig, health, jobs = [], role, now,includeReview=false}) {
  if (!ROLES.includes(role)) throw fault('SUPERVISOR_ROLE_INVALID');
  const window = forwardWindow(plan, appConfig, now), buffer = measuredBuffer(plan, appConfig, health, now);
  const allowed = new Map(window.entries.map(e => [e.readingId, e])), ids = new Set();
  const nodes = [], debts = [];
  for (const job of jobs) {
    if (!allowed.has(job.readingId)) {
      // A verified supervisor terminal debt remains a global warning after its
      // date leaves the window; its artifact never enters forward dispatch.
      if(job.component==='henry'&&job.blocker?.scope==='reading'&&job.blocker.terminal===true&&
        /^[a-f0-9]{64}$/.test(job.blocker.proof?.sha256||''))debts.push({readingId:job.readingId,component:'henry',terminal:true,
          code:safeCode(job.blocker.code),outsideForwardWindow:true});
      continue;
    }
    if (!['daily', 'henry'].includes(job.component) || ids.has(`${job.readingId}:${job.component}`) ||
        !['queued', 'authoring', 'generating', 'fallback_pending', 'editorial_attention', 'review_pending', 'reviewing',
          'approved', 'publishing', 'verification_pending', 'published', 'blocked', 'debt'].includes(job.phase)) throw fault('SUPERVISOR_JOB_INVALID');
    ids.add(`${job.readingId}:${job.component}`);
    const entry = allowed.get(job.readingId);
    if (job.phase === 'blocked' || job.phase === 'debt' || job.phase === 'editorial_attention' || job.blocker) {
      debts.push({readingId: job.readingId, component: job.component, terminal: job.blocker?.terminal===true||['blocked', 'editorial_attention'].includes(job.phase),
        code: safeCode(job.blocker?.code || 'SUPERVISOR_RETAINED_DEBT')});
      if (job.phase !== 'editorial_attention'&&job.operatorReviewEligible!==true) continue;
    }
    const publishedButMissing = job.phase === 'published' && (job.component === 'daily' ? buffer.devotionalGaps : buffer.henryGaps).includes(job.readingId);
    const action = publishedButMissing ? 'recover_publication' : phaseAction[job.phase];
    if (action && (job.component !== 'henry' || !buffer.devotionalGaps.includes(job.readingId))) nodes.push({
      readingId: job.readingId, component: job.component, scheduleDate: entry.scheduleDate, action, basisSha256: job.basisSha256 || null});
  }
  for (const entry of window.entries) {
    for (const [component, action, missing] of [['daily', 'daily_author', buffer.devotionalGaps.includes(entry.readingId)],
      ['henry', 'henry_author', entry.kind === 'chapter' && buffer.henryGaps.includes(entry.readingId)]]) {
      if (!missing || jobs.some(j => j.readingId === entry.readingId && j.component === component &&
        !['queued', 'generating', 'authoring', 'fallback_pending'].includes(j.phase))) continue;
      if (jobs.some(j => j.readingId === entry.readingId && j.component === component && j.blocker)) continue;
      // Stage A never dispatches either action. This dependency ensures the later
      // author adapters cannot publish Henry ahead of the daily prefix.
      if (component === 'henry' && buffer.devotionalGaps.includes(entry.readingId)) continue;
      nodes.push({readingId: entry.readingId, component, scheduleDate: entry.scheduleDate, action, basisSha256: null});
    }
  }
  const runnable = nodes.filter(n => role === 'review-audit' ? ['review', 'publish', 'recover_publication'].includes(n.action) : includeReview||n.action !== 'review')
    .sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate) || rank[a.action] - rank[b.action] || a.readingId.localeCompare(b.readingId));
  return {effectiveDate: window.today, buffer, work: runnable, debts,
    next: runnable[0] || null, forwardComplete: buffer.status === 'ready'};
}
export function safeCode(code) {return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(code) ? code : 'SUPERVISOR_FAILED';}
export function failureClass(code) {
  code = safeCode(code);
  const configuration = code === 'V2_AUTHOR_MODEL_UNAVAILABLE' || /CONFIG|EXECUTABLE|MODEL_UNAVAILABLE|CLI|HELPER|ROUTE|LOGIN/.test(code);
  const permission = /DENIED|APPROVAL/.test(code);
  return {code, state: permission ? 'approval_required' : 'blocked', retryable: !configuration &&
    ['V2_TRANSPORT_FAILED', 'LIVE_HEALTH_TRANSPORT_UNAVAILABLE'].includes(code), scope: configuration ? 'capability' : 'action'};
}
// Only the saved scalar/array fields used by the inventory are read. Reject
// duplicate/multiline/unsupported encodings instead of pretending to parse TOML.
export function automationDefinition(text) {
  const values = {};
  for (const key of ['name', 'kind', 'status', 'rrule', 'model', 'reasoning_effort', 'execution_environment', 'prompt', 'cwds']) {
    const matches = [...text.matchAll(new RegExp(`^${key}[ \\t]*=[ \\t]*(.*)$`, 'gm'))];
    if (matches.length !== 1) throw fault('SUPERVISOR_AUTOMATION_FORMAT_INVALID');
    try {values[key] = JSON.parse(matches[0][1].trim());} catch {throw fault('SUPERVISOR_AUTOMATION_FORMAT_INVALID');}
    if (key === 'cwds' ? !Array.isArray(values[key]) || values[key].some(v => typeof v !== 'string') : typeof values[key] !== 'string') throw fault('SUPERVISOR_AUTOMATION_FORMAT_INVALID');
  }
  const targets = [...text.matchAll(/^target[ \t]*=[ \t]*(.*)$/gm)];
  if (targets.length !== 1 || /^\[target\]|^target\./m.test(text)) throw fault('SUPERVISOR_AUTOMATION_TARGET_INVALID');
  // Saved v1 definitions use one inline project table. Do not evaluate TOML or
  // silently ignore another target shape, duplicate key, or trailing statement.
  const quoted = '"(?:[^"\\\\]|\\\\.)*"';
  const typeFirst = new RegExp(`^\\{\\s*type\\s*=\\s*(${quoted})\\s*,\\s*project_id\\s*=\\s*(${quoted})\\s*\\}$`);
  const idFirst = new RegExp(`^\\{\\s*project_id\\s*=\\s*(${quoted})\\s*,\\s*type\\s*=\\s*(${quoted})\\s*\\}$`);
  const forward = typeFirst.exec(targets[0][1].trim()), reverse = idFirst.exec(targets[0][1].trim());
  if (!forward && !reverse) throw fault('SUPERVISOR_AUTOMATION_TARGET_INVALID');
  try {
    values.target = {type: JSON.parse(forward ? forward[1] : reverse[2]), project_id: JSON.parse(forward ? forward[2] : reverse[1])};
  } catch {throw fault('SUPERVISOR_AUTOMATION_TARGET_INVALID');}
  if (values.target.type !== 'project' || !/^[A-Za-z0-9_-]{1,200}$/.test(values.target.project_id)) throw fault('SUPERVISOR_AUTOMATION_TARGET_INVALID');
  if (!['ACTIVE', 'PAUSED'].includes(values.status) || values.kind !== 'cron' || values.execution_environment !== 'local') throw fault('SUPERVISOR_AUTOMATION_FORMAT_INVALID');
  const {prompt, ...rest} = values;
  return {...rest, promptSha256: digest(Buffer.from(prompt))};
}
export async function inspectAutomations(inventory, {read = async file => {
  await assertCanonicalPath(path.dirname(file), file); return readFile(file, 'utf8');
}} = {}) {
  if (!Array.isArray(inventory) || inventory.length !== 4 || new Set(inventory.map(v => v.lane)).size !== 4 ||
      new Set(inventory.map(v => v.file)).size !== 4 ||
      inventory.some(v => !LANES.includes(v.lane) || !path.isAbsolute(v.file))) throw fault('SUPERVISOR_AUTOMATION_INVENTORY_INVALID');
  const findings = [], observed = [];
  for (const expected of inventory) {
    let actual;
    try {actual = automationDefinition(await read(expected.file));} catch {
      findings.push({lane: expected.lane, code: 'SUPERVISOR_AUTOMATION_UNREADABLE'}); continue;
    }
    observed.push({lane: expected.lane, ...actual});
    if (expected.status === 'ACTIVE' && actual.status === 'PAUSED') findings.push({lane: expected.lane, code: 'AUTOMATION_UNEXPECTEDLY_PAUSED'});
    else if (Object.keys(actual).some(key => JSON.stringify(actual[key]) !== JSON.stringify(expected[key]))) findings.push({lane: expected.lane, code: 'SUPERVISOR_AUTOMATION_DRIFT'});
  }
  return {observed, findings};
}
