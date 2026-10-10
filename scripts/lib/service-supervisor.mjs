import {readFile, readdir, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadHenryPlan} from './mhc-priority.mjs';
import {loadJob} from './mhc-v2-store.mjs';
import {liveHealthCredentialsFromStores, verifyLiveHorizon} from './live-horizon-health.mjs';
import {assertCanonicalPath} from './mhc-native-paths.mjs';
import {openJournal, confined, readPrivate, durableWrite, jsonBytes, digest, fault} from './service-supervisor-store.mjs';
import {ROLES, inspectAutomations, selectEDF, failureClass, safeCode} from './service-supervisor-policy.mjs';
import {assertSchemaValid} from './schema-validator.mjs';

async function defaultHealth(ctx, now) {
  const config = JSON.parse(await readFile(path.join(ctx.releaseRoot, 'config/pages-pwa-public.json'), 'utf8'));
  const codes = await readPrivate(ctx.projectRoot, 'private-content/reader-codes.json');
  // Authenticated bootstrap + private payload health only. No Scripture or
  // comments RPC, model call, credential log, Drive mutation or API billing.
  return verifyLiveHorizon(liveHealthCredentialsFromStores(config, codes), {now,
    fetchImpl: (...args) => fetch(args[0], {...args[1], signal: AbortSignal.timeout(45000)})});
}
async function defaultJobs(ctx, health) {
  const root = await confined(ctx.projectRoot, 'private-content/automation/mhc-v2');
  const names = await readdir(root).catch(e => {if (e.code === 'ENOENT') return []; throw e;});
  const jobs = [];
  for (const name of names) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(name)) throw fault('SUPERVISOR_JOB_INVALID');
    if (!health.readingIds.includes(name)) continue;
    const job = await loadJob(await confined(root, name, false));
    jobs.push({readingId: job.input.reading_id, component: 'henry', phase: job.state.phase,
      blocker: job.state.blocker, basisSha256: job.state.review?.approved_sha256 || job.input.input_sha256});
  }
  return jobs;
}
async function defaultStatus(ctx, previous, options) {
  let helper;
  try {helper = await import(pathToFileURL(path.join(ctx.releaseRoot, 'scripts/lib/preparation-status.mjs')).href);} catch {
    throw fault('SUPERVISOR_STATUS_HELPER_UNAVAILABLE');
  }
  return helper.preparationStatusCandidate(previous, options);
}
export async function supervisorContext(config, releaseRoot) {
  assertSchemaValid(config, JSON.parse(await readFile(path.join(releaseRoot, 'schemas/service-supervisor-config.schema.json'), 'utf8')),
    {label: 'Installed supervisor config'});
  if (config.schemaVersion !== 'service-supervisor-config/v1' || !['A','B'].includes(config.stage) || !path.isAbsolute(config.projectRoot) ||
      !path.isAbsolute(config.runtimeRoot) || !Array.isArray(config.automations) || !/^[a-f0-9]{40}$/.test(config.sourceRevision)) throw fault('SUPERVISOR_CONFIG_INVALID');
  if (config.stage==='B' && (!config.publicationResources || !['text/plain','application/json'].includes(config.publicationResources.manifest.mimeType) ||
    config.publicationResources.folder.mimeType!=='application/vnd.google-apps.folder')) throw fault('SUPERVISOR_PUBLICATION_CONFIG_INVALID');
  const projectRoot = path.resolve(config.projectRoot);
  await assertCanonicalPath(projectRoot, projectRoot);
  for (const relative of ['private-content', 'private-commentary', 'research/raw', 'research/working']) {
    await confined(projectRoot, relative, false);
  }
  const runtimeRoot = await confined(projectRoot, 'private-content/automation/service-supervisor/runtime', false);
  if (runtimeRoot !== config.runtimeRoot) throw fault('SUPERVISOR_CONFIG_INVALID');
  const stateRoot = await confined(projectRoot, 'private-content/automation/service-supervisor/state');
  let publicationInputRoot=projectRoot;
  if(config.publicationInputRoot) {
    if(!path.isAbsolute(config.publicationInputRoot))throw fault('SUPERVISOR_PUBLICATION_INPUT_ROOT_INVALID');
    publicationInputRoot=path.resolve(config.publicationInputRoot);await assertCanonicalPath(publicationInputRoot,publicationInputRoot);
    for(const relative of ['private-content','research/working'])await confined(publicationInputRoot,relative,false);
  }
  return {config, projectRoot, runtimeRoot, stateRoot, publicationInputRoot, releaseRoot: path.resolve(releaseRoot)};
}
export async function runSupervisor(ctx, {role, now = new Date(), runId} = {}, dependencies = {}) {
  if (!ROLES.includes(role)) throw fault('SUPERVISOR_ROLE_INVALID');
  const journal = await openJournal(ctx.stateRoot, dependencies.journalOptions);
  const lease = await journal.acquire(role, {now, runId, durationMs: 90 * 60 * 1000});
  const clock = dependencies.clock || (() => new Date());
  const logicalLane = role === 'preparation' ? 'daily' : 'review';
  let result, statusPath = null;
  try {
    await journal.append('run_started', {runId: lease.runId, role, sourceRevision: ctx.config.sourceRevision, stage: ctx.config.stage}, now, lease);
    let observation, code = null;
    try {
      const inventory = await inspectAutomations(ctx.config.automations, dependencies.automations);
      const {plan, appConfig} = await (dependencies.plan || (() => loadHenryPlan(ctx.releaseRoot)))();
      const health = await (dependencies.health || defaultHealth)(ctx, now);
      const jobs = await (dependencies.jobs || defaultJobs)(ctx, health);
      const selection = selectEDF({plan, appConfig, health, jobs, role, now});
      const publications=new Map();
      if(ctx.config.stage==='B')for(const event of await journal.load())if(event.kind==='publication_state') {
        const t=event.data.transaction;
        publications.set(t.kind==='reading'?`${t.readingId}:${t.component}`:`status:${t.role}`,t);
      }
      const publicationDebt=[...publications.values()].find(t=>['blocked','reconciliation_required','health_pending'].includes(t.phase)&&t.code);
      const configurationDebt = selection.debts.find(v => failureClass(v.code).scope === 'capability');
      code = inventory.findings[0]?.code || publicationDebt?.code || configurationDebt?.code || selection.debts.find(v => v.terminal)?.code || null;
      observation = {inventory, selection, measuredAt: new Date(now).toISOString()};
      await journal.append('observation', {runId: lease.runId, role, ...observation}, now, lease);
      const pending = Boolean(selection.next || selection.debts.length || !selection.forwardComplete);
      result = {schemaVersion: 'service-supervisor-result/v1', stage: ctx.config.stage, role,
        action: 'observed', outcome: code ? 'blocked' : pending ? 'handoff_pending' : 'healthy_noop',
        code, published: false, forwardComplete: selection.forwardComplete, selectedReadingId: selection.next?.readingId || null,
        nextAction: selection.next?.action || null, buffer: selection.buffer};
    } catch (e) {
      code = safeCode(e.code);
      result = {schemaVersion: 'service-supervisor-result/v1', stage: ctx.config.stage, role, action: 'observed',
        outcome: 'blocked', code, published: false, forwardComplete: false, selectedReadingId: null, nextAction: null, buffer: null};
      await journal.append('observation_failed', {runId: lease.runId, role, code}, now, lease);
    }
    try {
      const manifestBytes = await readFile(await confined(ctx.projectRoot, 'private-content/private-manifest.json', false));
      const manifest = JSON.parse(manifestBytes), buffer = result.buffer;
      const retained = ['blocked', 'approval_required'].includes(manifest.preparationStatus?.state);
      const state = retained ? manifest.preparationStatus.state : result.outcome === 'blocked' ? failureClass(result.code).state : result.forwardComplete ? 'ready' : 'running';
      if (retained && result.outcome !== 'blocked') result = {...result, outcome: 'blocked', code: 'SUPERVISOR_RETAINED_SERVICE_BLOCK'};
      const status = await (dependencies.status || defaultStatus)(ctx, manifest.preparationStatus, {state,
        now: new Date(now).toISOString(), summary: retained ? manifest.preparationStatus.summary : result.outcome === 'blocked' ? `Preparation blocked: ${result.code}` :
          result.forwardComplete ? 'Complete forward buffer verified' : 'Forward devotional or Henry work remains',
        action: retained ? manifest.preparationStatus.action : result.outcome === 'blocked' ? 'Open BibleApp Manager in Codex' : '',
        heartbeat: {lane: logicalLane, lastOutcome: result.outcome === 'blocked' ? 'blocked' : result.outcome === 'healthy_noop' ? 'no_op' : 'running',
          lastErrorCode: result.code || '', ...(buffer ? {buffer} : {})}});
      if (['blocked', 'approval_required'].includes(status.state) && result.outcome !== 'blocked') {
        result = {...result, outcome: 'blocked', code: 'SUPERVISOR_RETAINED_SERVICE_BLOCK'};
      }
      const relative = `runs/${lease.runId}/status-candidate.json`;
      await journal.assertLease(lease, clock());
      statusPath = await durableWrite(ctx.stateRoot, relative, jsonBytes({...manifest, preparationStatus: status}));
      await journal.append('status_staged', {runId: lease.runId, role, candidate: relative, baseSha256: digest(manifestBytes),
        candidateSha256: digest(await readFile(statusPath)), published: false}, clock(), lease);
    } catch (e) {
      result = {...result, outcome: 'blocked', code: safeCode(e.code || 'SUPERVISOR_STATUS_STAGING_FAILED')};
      await journal.append('status_staging_failed', {runId: lease.runId, role, code: result.code, published: false}, clock(), lease);
    }
    const privateResult = {...result, statusCandidatePath: statusPath};
    await durableWrite(ctx.stateRoot, `runs/${lease.runId}/result.json`, jsonBytes(privateResult));
    await journal.append('run_finished', {runId: lease.runId, role, outcome: result.outcome, code: result.code,
      published: false, resultSha256: digest(jsonBytes(privateResult))}, clock(), lease);
    return result; // Paths, Google IDs, raw model logs and private prose stay private.
  } finally {await journal.release(lease, clock());}
}
export async function supervisorStatus(ctx) {
  const journal = await openJournal(ctx.stateRoot), events = await journal.load();
  const last = events.findLast(e => e.kind === 'run_finished');
  return {schemaVersion: 'service-supervisor-status/v1', stage: ctx.config.stage, events: events.length,
    lastRunAt: last?.at || null, lastOutcome: last?.data.outcome || null, lastErrorCode: last?.data.code || null,
    published: false};
}
