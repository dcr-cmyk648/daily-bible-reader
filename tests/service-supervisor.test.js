const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const modules = Promise.all(['store', 'policy', '', 'runtime'].map(name => import(`../scripts/lib/service-supervisor${name ? '-' + name : ''}.mjs`)));
const sourceRoot = path.resolve(__dirname, '..');
const now = new Date('2026-10-10T14:00:00Z');
const revision = 'a'.repeat(40);
const plan = () => ({planVersion: 'FABRICATED-PLAN', entries: Array.from({length: 8}, (_, i) => ({
  readingId: `FABRICATED-${i}`, dayIndex: i + 1, planVersion: 'FABRICATED-PLAN', kind: 'chapter'}))});
const appConfig = () => ({sharedStartDate: '2026-10-10', futureLookaheadDays: 7});
const health = () => ({status: 'ready', effectiveDate: '2026-10-10', target: 8, readingIds: plan().entries.map(e => e.readingId),
  missingPreparedReadingIds: [], missingPayloadReadingIds: [], componentFailures: [],
  currentHorizonHenryLayer: {status: 'complete', completeCount: 8, fallbackReadingIds: [], unavailableReadingIds: []}});
const toml = (lane, status = ['daily', 'review'].includes(lane) ? 'ACTIVE' : 'PAUSED') => Object.entries({
  name: `FABRICATED ${lane}`, kind: 'cron', status, rrule: 'FREQ=DAILY;BYHOUR=3', model: 'gpt-6.1-sol',
  reasoning_effort: 'high', execution_environment: 'local', prompt: 'FABRICATED thin prompt', cwds: ['FABRICATED-PROJECT']
}).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n') + '\ntarget = { type = "project", project_id = "FABRICATED-PROJECT" }\n';

async function fixture(t) {
  const [store, policy, supervisor, runtime] = await modules;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dbr-supervisor-fabricated-'));
  t.after(async () => {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('dbr-supervisor-fabricated-'));
    await fs.rm(resolved, {recursive: true, force: true});
  });
  for (const dir of ['private-content', 'private-commentary', 'research/raw', 'research/working', 'automations']) await fs.mkdir(path.join(root, dir), {recursive: true});
  await fs.writeFile(path.join(root, 'private-content/private-manifest.json'), JSON.stringify({readings: {}, preparationStatus: {
    schemaVersion: 'preparation-status/v1', state: 'running', lanes: {review: {lastOutcome: 'running'}}}}));
  const mapping = [];
  for (const lane of policy.LANES) {
    const file = path.join(root, 'automations', `${lane}.toml`); await fs.writeFile(file, toml(lane)); mapping.push({lane, file});
  }
  const inventory = await runtime.captureInventory(mapping);
  const ctx = {projectRoot: root, stateRoot: path.join(root, 'private-content/automation/service-supervisor/state'),
    releaseRoot: sourceRoot, config: {sourceRevision: revision, automations: inventory}};
  const dependencies = {clock: () => now, plan: async () => ({plan: plan(), appConfig: appConfig()}),
    health: async () => health(), jobs: async () => [], status: async (_, previous, options) => ({
      ...previous, state: options.state, summary: options.summary, action: options.action, lastRunAt: options.now,
      ...(options.heartbeat.lastOutcome === 'no_op' ? {lastSuccessAt: options.now} : {}),
      lanes: {...previous?.lanes, [options.heartbeat.lane]: {lastOutcome: options.heartbeat.lastOutcome}},
      buffer: options.heartbeat.buffer})};
  return {root, store, policy, supervisor, runtime, inventory, mapping, ctx, dependencies};
}
test('journal commits hash-linked events, rejects mutation and never replays a fenced owner', async t => {
  const f = await fixture(t); let dead = false;
  const journal = await f.store.openJournal(f.ctx.stateRoot, {absent: () => dead});
  const lease = await journal.acquire('preparation', {now});
  await journal.append('run_started', {role: 'preparation'}, now, lease);
  await assert.rejects(journal.acquire('preparation', {now: new Date(now.getTime() + 86400000)}), /LEASE_BUSY/);
  dead = true;
  const next = await journal.acquire('preparation', {now});
  assert.equal(next.epoch, lease.epoch + 1);
  await assert.rejects(journal.append('run_finished', {}, now, lease), /LEASE_FENCED/);
  await journal.release(next, now);
  const file = path.join(f.ctx.stateRoot, 'events/000000002.json');
  const event = JSON.parse(await fs.readFile(file)); event.data.role = 'review-audit';
  await fs.writeFile(file, JSON.stringify(event));
  await assert.rejects(journal.load(), /EVENT_INVALID/);
});
test('installation and role leases fence each other before any writer starts', async t => {
  const f = await fixture(t), journal = await f.store.openJournal(f.ctx.stateRoot);
  const lease = await journal.acquire('installation', {now});
  await assert.rejects(journal.acquire('review-audit', {now}), /INSTALL_WRITER_ACTIVE/);
  await journal.release(lease, now);
  const role = await journal.acquire('preparation', {now});
  await assert.rejects(journal.acquire('installation', {now}), /INSTALL_WRITER_ACTIVE/);
  await journal.release(role, now);
});
test('concurrent journal appends serialize and abandoned temporary bytes cannot become committed state', async t => {
  const f = await fixture(t), journal = await f.store.openJournal(f.ctx.stateRoot);
  await Promise.all(Array.from({length: 6}, (_, index) => journal.append('fixture_observed', {index}, now)));
  const events = await journal.load(); assert.equal(events.length, 6);
  assert.equal(new Set(events.map(v => v.data.index)).size, 6);
  await fs.writeFile(path.join(f.ctx.stateRoot, 'events/000000007.json.tmp-' + 'c'.repeat(32)), 'FABRICATED interrupted bytes');
  assert.equal((await journal.load()).length, 6);
  await journal.append('fixture_resumed', {index: 6}, now);
  assert.equal((await journal.load()).length, 7);
});
test('artifacts are immutable, confined, and reject a redirected ancestor', async t => {
  const f = await fixture(t); await fs.mkdir(f.ctx.stateRoot, {recursive: true});
  await f.store.durableWrite(f.ctx.stateRoot, 'results/fabricated.json', Buffer.from('FABRICATED'));
  await assert.rejects(f.store.durableWrite(f.ctx.stateRoot, 'results/fabricated.json', Buffer.from('changed')), /IMMUTABLE_CHANGED/);
  await assert.rejects(f.store.durableWrite(f.ctx.stateRoot, '../escape', Buffer.from('bad')), /PATH_INVALID/);
  await fs.symlink(path.join(f.root, 'automations'), path.join(f.ctx.stateRoot, 'redirect'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.store.durableWrite(f.ctx.stateRoot, 'redirect/bad', Buffer.from('bad')), /redirects/);
  const raced = await Promise.allSettled(['FABRICATED one', 'FABRICATED two'].map(value =>
    f.store.durableWrite(f.ctx.stateRoot, 'results/race.json', Buffer.from(value))));
  assert.equal(raced.filter(v => v.status === 'fulfilled').length, 1);
  assert.equal(raced.filter(v => v.status === 'rejected').length, 1);
});
test('EDF unifies daily/Henry deadlines, dependencies and independent-review selection', async () => {
  const [, policy] = await modules, h = health();
  h.status = 'not_ready'; h.missingPreparedReadingIds = ['FABRICATED-7'];
  h.currentHorizonHenryLayer = {status: 'debt', fallbackReadingIds: ['FABRICATED-0', 'FABRICATED-2'], unavailableReadingIds: ['FABRICATED-7']};
  const options = {plan: plan(), appConfig: appConfig(), health: h, role: 'preparation', now, jobs: []};
  assert.equal(policy.selectEDF(options).next.readingId, 'FABRICATED-0');
  assert.equal(policy.selectEDF(options).next.action, 'henry_author');
  options.jobs = [{readingId: 'FABRICATED-0', component: 'henry', phase: 'review_pending'}];
  assert.equal(policy.selectEDF(options).next.readingId, 'FABRICATED-2');
  assert.equal(policy.selectEDF({...options, role: 'review-audit'}).next.action, 'review');
  assert.equal(policy.selectEDF(options).work.some(v => v.readingId === 'FABRICATED-7' && v.component === 'henry'), false);
  options.jobs.push({readingId: 'FABRICATED-2', component: 'henry', phase: 'publishing'});
  assert.equal(policy.selectEDF(options).next.action, 'recover_publication');
});
test('Detroit civil date scope rejects yesterday health and T+8 after midnight/DST', async () => {
  const [, policy] = await modules;
  assert.equal(policy.forwardWindow(plan(), appConfig(), new Date('2026-10-11T03:59:00Z')).today, '2026-10-10');
  assert.equal(policy.forwardWindow(plan(), appConfig(), new Date('2026-10-11T04:01:00Z')).today, '2026-10-11');
  assert.throws(() => policy.selectEDF({plan: plan(), appConfig: appConfig(), health: health(), role: 'preparation', now: new Date('2026-10-11T04:01:00Z')}), /HEALTH_SCOPE_INVALID/);
  const spring = {sharedStartDate: '2026-03-07', futureLookaheadDays: 7};
  assert.equal(policy.forwardWindow(plan(), spring, new Date('2026-03-08T06:59:00Z')).currentDay, 2);
  assert.equal(policy.forwardWindow(plan(), spring, new Date('2026-03-08T07:01:00Z')).currentDay, 2);
  const h = health(); h.readingIds.push('FABRICATED-8'); h.target = 9;
  assert.throws(() => policy.selectEDF({plan: plan(), appConfig: appConfig(), health: h, role: 'preparation', now}), /HEALTH_SCOPE_INVALID/);
});
test('intentional Henry pauses are normal; an unexpectedly paused daily role is red-blocked', async t => {
  const f = await fixture(t);
  assert.deepEqual((await f.policy.inspectAutomations(f.inventory)).findings, []);
  await fs.writeFile(f.mapping[0].file, toml('daily', 'PAUSED'));
  assert.equal((await f.policy.inspectAutomations(f.inventory)).findings[0].code, 'AUTOMATION_UNEXPECTEDLY_PAUSED');
  const before = await fs.readFile(path.join(f.root, 'private-content/private-manifest.json'));
  const result = await f.supervisor.runSupervisor(f.ctx, {role: 'preparation', now}, f.dependencies);
  assert.equal(result.outcome, 'blocked'); assert.equal(result.code, 'AUTOMATION_UNEXPECTEDLY_PAUSED');
  assert.equal(result.published, false);
  assert.ok(before.equals(await fs.readFile(path.join(f.root, 'private-content/private-manifest.json'))));
  const journal = await f.store.openJournal(f.ctx.stateRoot), events = await journal.load();
  const staged = events.find(e => e.kind === 'status_staged');
  const candidate = await f.store.readPrivate(f.ctx.stateRoot, staged.data.candidate);
  assert.equal(candidate.preparationStatus.state, 'blocked');
});
test('model-unavailable fixture ends blocked within one wake while healthy audit is a true no-op heartbeat', async t => {
  const f = await fixture(t), h = health(); h.currentHorizonHenryLayer = {status: 'debt', fallbackReadingIds: ['FABRICATED-0'], unavailableReadingIds: []};
  const blocked = await f.supervisor.runSupervisor(f.ctx, {role: 'preparation', now}, {...f.dependencies,
    health: async () => h, jobs: async () => [{readingId: 'FABRICATED-0', component: 'henry', phase: 'blocked', blocker: {code: 'V2_AUTHOR_MODEL_UNAVAILABLE'}}]});
  assert.equal(blocked.code, 'V2_AUTHOR_MODEL_UNAVAILABLE'); assert.equal(blocked.outcome, 'blocked'); assert.equal(blocked.forwardComplete, false);
  const result = await f.supervisor.runSupervisor(f.ctx, {role: 'review-audit', now}, f.dependencies);
  assert.equal(result.outcome, 'healthy_noop');
  const events = await (await f.store.openJournal(f.ctx.stateRoot)).load(), staged = events.findLast(e => e.kind === 'status_staged');
  const candidate = await f.store.readPrivate(f.ctx.stateRoot, staged.data.candidate);
  assert.equal(candidate.preparationStatus.lastRunAt, now.toISOString());
  assert.equal(candidate.preparationStatus.lastSuccessAt, now.toISOString());
  assert.equal(candidate.preparationStatus.buffer.completeFutureDays, 7);
  const exhausted = await f.supervisor.runSupervisor(f.ctx, {role: 'preparation', now}, {...f.dependencies,
    health: async () => h, jobs: async () => [{readingId: 'FABRICATED-0', component: 'henry', phase: 'blocked', blocker: {code: 'V2_TRANSPORT_RETRY_EXHAUSTED'}}]});
  assert.equal(exhausted.outcome, 'blocked'); assert.equal(exhausted.code, 'V2_TRANSPORT_RETRY_EXHAUSTED');
});
test('status-helper failure is delivered as a real block without false publication proof', async t => {
  const f = await fixture(t);
  const result = await f.supervisor.runSupervisor(f.ctx, {role: 'review-audit', now}, {...f.dependencies,
    status: async () => {throw f.store.fault('SUPERVISOR_STATUS_HELPER_UNAVAILABLE');}});
  assert.equal(result.outcome, 'blocked'); assert.equal(result.code, 'SUPERVISOR_STATUS_HELPER_UNAVAILABLE');
  const events = await (await f.store.openJournal(f.ctx.stateRoot)).load();
  assert.equal(events.some(e => e.kind === 'status_staged'), false);
  assert.equal(events.find(e => e.kind === 'status_staging_failed').data.published, false);
});
test('a retained independent approval block survives a healthy observation', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, 'private-content/private-manifest.json'), JSON.stringify({readings: {}, preparationStatus: {
    state: 'approval_required', summary: 'FABRICATED outstanding reviewer decision', action: 'FABRICATED owner action'}}));
  const result = await f.supervisor.runSupervisor(f.ctx, {role: 'preparation', now}, f.dependencies);
  assert.equal(result.code, 'SUPERVISOR_RETAINED_SERVICE_BLOCK');
  const events = await (await f.store.openJournal(f.ctx.stateRoot)).load(), staged = events.find(e => e.kind === 'status_staged');
  const candidate = await f.store.readPrivate(f.ctx.stateRoot, staged.data.candidate);
  assert.equal(candidate.preparationStatus.state, 'approval_required');
  assert.equal(candidate.preparationStatus.summary, 'FABRICATED outstanding reviewer decision');
  await fs.writeFile(path.join(f.root, 'private-content/private-manifest.json'), JSON.stringify({readings: {}, preparationStatus: {
    schemaVersion: 'preparation-status/v1', state: 'running', updatedAt: now.toISOString(), lanes: {review: {lastOutcome: 'error',
      lastErrorCode: 'FABRICATED_REVIEW_FAILURE', lastAttemptAt: now.toISOString()}}}}));
  const helper = await import('../scripts/lib/preparation-status.mjs');
  const retainedLane = await f.supervisor.runSupervisor(f.ctx, {role: 'preparation', now}, {...f.dependencies,
    status: async (_, previous, options) => helper.preparationStatusCandidate(previous, options)});
  assert.equal(retainedLane.outcome, 'blocked'); assert.equal(retainedLane.code, 'SUPERVISOR_RETAINED_SERVICE_BLOCK');
});
test('automation drift/duplicate fields and corrupt health do not imply readiness', async t => {
  const f = await fixture(t);
  assert.throws(() => f.policy.automationDefinition(toml('daily') + 'status = "ACTIVE"\n'), /FORMAT_INVALID/);
  const targetOnlyDrift = toml('daily').replace('project_id = "FABRICATED-PROJECT"', 'project_id = "FABRICATED-OTHER"');
  await fs.writeFile(f.mapping[0].file, targetOnlyDrift);
  assert.equal((await f.policy.inspectAutomations(f.inventory)).findings[0].code, 'SUPERVISOR_AUTOMATION_DRIFT');
  await fs.writeFile(f.mapping[0].file, toml('daily'));
  for (const badTarget of ['{ type = "project" }', '{ type = "project", project_id = "FABRICATED", project_id = "DUPLICATE" }',
    '{ type = "project", project_id = "FABRICATED" }; execute()', '{ type = "projectless", project_id = "FABRICATED" }']) {
    assert.throws(() => f.policy.automationDefinition(toml('daily').replace(/target = .*/, `target = ${badTarget}`)), /TARGET_INVALID/);
  }
  assert.throws(() => f.policy.automationDefinition(toml('daily') + 'target = { type = "project", project_id = "FABRICATED" }\n'), /TARGET_INVALID/);
  assert.throws(() => f.policy.automationDefinition(toml('daily').replace(/target = .*/, '[target]\ntype = "project"\nproject_id = "FABRICATED"')), /TARGET_INVALID/);
  assert.equal(f.policy.automationDefinition(toml('daily').replace(/target = .*/, 'target = { project_id = "FABRICATED-PROJECT", type = "project" }')).target.project_id, 'FABRICATED-PROJECT');
  await fs.writeFile(f.mapping[1].file, toml('henry_primary').replace('FABRICATED thin prompt', 'FABRICATED changed prompt'));
  assert.equal((await f.policy.inspectAutomations(f.inventory)).findings[0].code, 'SUPERVISOR_AUTOMATION_DRIFT');
  const h = health(); delete h.currentHorizonHenryLayer;
  const result = await f.supervisor.runSupervisor(f.ctx, {role: 'review-audit', now}, {...f.dependencies, health: async () => h});
  assert.equal(result.forwardComplete, false); assert.equal(result.code, 'SUPERVISOR_HEALTH_SCOPE_INVALID');
});

async function runtimeFiles() {
  const files = [];
  for (const dir of ['scripts', 'schemas', 'app']) {
    async function collect(relative) {
      for (const entry of await fs.readdir(path.join(sourceRoot, relative), {withFileTypes: true})) {
        const name = `${relative}/${entry.name}`;
        if (entry.isDirectory()) await collect(name);
        else if (entry.isFile()) files.push({path: name, bytes: await fs.readFile(path.join(sourceRoot, name))});
      }
    }
    await collect(dir);
  }
  if (!files.some(v => v.path === 'scripts/lib/preparation-status.mjs')) files.push({path: 'scripts/lib/preparation-status.mjs',
    bytes: Buffer.from('// FABRICATED WO-2 compatibility fixture; never a production helper.\nexport const preparationStatusCandidate = (previous, options) => ({...previous, ...options});\n')});
  return files;
}
test('immutable installed launcher works from arbitrary CWD and detects exact code/config tampering', async t => {
  const f = await fixture(t), files = await runtimeFiles();
  const installed = await f.runtime.installRuntime({projectRoot: f.root, sourceRevision: revision, files, inventory: f.inventory});
  const options = {cwd: os.tmpdir(), windowsHide: true, encoding: 'utf8', timeout: 15000};
  const first = spawnSync(process.execPath, [installed.launcher, 'status'], options);
  assert.equal(first.status, 0, first.stdout + first.stderr); assert.equal(JSON.parse(first.stdout).stage, 'A');
  const runtimeRoot = path.dirname(installed.launcher), pointer = await f.store.readPrivate(runtimeRoot, 'current.json');
  const file = path.join(runtimeRoot, 'releases', pointer.release, 'scripts/lib/service-supervisor-policy.mjs');
  const prior = await fs.readFile(file); await fs.writeFile(file, '// FABRICATED tampering');
  const changed = spawnSync(process.execPath, [installed.launcher, 'status'], options);
  assert.equal(changed.status, 1); assert.match(changed.stdout, /INSTALLED_VERIFICATION_FAILED/);
  await fs.writeFile(file, prior);
  const config = path.join(runtimeRoot, `config-${pointer.configSha256}.json`);
  await fs.appendFile(config, ' ');
  assert.equal(spawnSync(process.execPath, [installed.launcher, 'status'], options).status, 1);
});
test('side-by-side installation retains prior pointer and rollback preserves journal/budgets and automations', async t => {
  const f = await fixture(t), files = await runtimeFiles();
  const first = await f.runtime.installRuntime({projectRoot: f.root, sourceRevision: revision, files, inventory: f.inventory});
  const root = path.dirname(first.launcher), old = await fs.readFile(path.join(root, 'current.json'));
  await f.runtime.installRuntime({projectRoot: f.root, sourceRevision: 'b'.repeat(40), files, inventory: f.inventory});
  const before = await Promise.all(f.mapping.map(v => fs.readFile(v.file)));
  const result = spawnSync(process.execPath, [path.join(sourceRoot, 'scripts/rollback-service-supervisor.mjs'),
    '--project-root', f.root, '--pointer-sha256', f.store.digest(old)], {cwd: os.tmpdir(), encoding: 'utf8', windowsHide: true, timeout: 15000});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(old.equals(await fs.readFile(path.join(root, 'current.json'))));
  for (const [index, value] of before.entries()) assert.ok(value.equals(await fs.readFile(f.mapping[index].file)));
  const events = await (await f.store.openJournal(f.ctx.stateRoot)).load();
  assert.equal(events.filter(v => v.kind === 'installation_activated').length, 2);
  assert.equal(events.some(v => v.kind === 'rollback_activated'), true);
});
test('installer reads exact clean committed blobs in one batch and rejects a dirty source', async t => {
  const f = await fixture(t), files = await runtimeFiles(), source = path.join(f.root, 'source');
  await fs.mkdir(source);
  for (const file of files) {
    const target = path.join(source, file.path); await fs.mkdir(path.dirname(target), {recursive: true}); await fs.writeFile(target, file.bytes);
  }
  function git(args) {
    const run = spawnSync('git', args, {cwd: source, encoding: 'utf8', windowsHide: true, timeout: 15000});
    assert.equal(run.status, 0, run.stderr); return run.stdout.trim();
  }
  git(['init', '-q']); git(['config', 'user.name', 'Fabricated Supervisor Test']);
  git(['config', 'user.email', 'fabricated@example.invalid']); git(['config', 'core.autocrlf', 'false']);
  git(['add', 'scripts', 'schemas', 'app']); git(['commit', '-qm', 'Fabricated accepted supervisor runtime']);
  const accepted = git(['rev-parse', 'HEAD']), committed = f.runtime.committedFiles(source, accepted);
  assert.equal(committed.length, files.length);
  for (const file of files) assert.ok(file.bytes.equals(committed.find(v => v.path === file.path).bytes));
  const mapping = path.join(f.root, 'fabricated-private-mapping.json'); await fs.writeFile(mapping, JSON.stringify(f.mapping));
  const install = spawnSync(process.execPath, [path.join(sourceRoot, 'scripts/install-service-supervisor.mjs'),
    '--project-root', f.root, '--revision', accepted, '--inventory', mapping], {cwd: source, encoding: 'utf8', windowsHide: true, timeout: 15000});
  assert.equal(install.status, 0, install.stdout + install.stderr); assert.equal(JSON.parse(install.stdout).action, 'installed');
  await fs.appendFile(path.join(source, 'scripts/service-supervisor.mjs'), '// FABRICATED dirty overlay\n');
  assert.throws(() => f.runtime.committedFiles(source, accepted), /SOURCE_NOT_CLEAN_COMMIT/);
});
