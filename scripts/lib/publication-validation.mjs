// Offline validation only. No authoring, native job writes, Drive or publication.
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {open, readFile, readdir, realpath, lstat, mkdir, rename, copyFile, link, unlink} from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const digest = value => sha256(bytes(value));
const hashPattern = /^[a-f0-9]{64}$/;
export const CODE_SCOPES = ['scripts', 'schemas', 'app', 'config', 'fixtures', 'prompts', 'tests', 'web', 'node_modules', 'package.json', 'package-lock.json'];
export const GATES = ['source', 'private', 'content', 'safety', 'check:published', 'bundle'];
export const DEFAULT_POLICY = {heartbeatMs: 5000, staleMs: 45000, launchMs: 45000,
  totalMs: 2100000, stepMs: [180000, 300000, 180000, 180000, 900000, 300000]};
const helperFiles = ['scripts/publication-validation.mjs', 'scripts/lib/publication-validation.mjs'];
const bundleInputScopes = ['scripts', 'schemas', 'config', 'fixtures', 'app', 'prompts', 'package.json', 'package-lock.json',
  'private-content/bridge', 'private-content/private-manifest.json', 'research/working', 'private-commentary/mhc/stores/library'];
const terminal = state => ['passed', 'blocked'].includes(state);
const fail = code => {throw new Error(code);};
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const exists = async file => lstat(file).then(() => true, e => {if (e.code === 'ENOENT') return false; throw e;});
function inside(root, target) {const relative = path.relative(root, target); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));}
function relativePath(value) {if (typeof value !== 'string' || !value || value.includes('\\') || value.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(value)) fail('UNSAFE_RELATIVE_PATH'); return value;}
async function regular(file) {if (!(await lstat(file)).isFile() || (await lstat(file)).isSymbolicLink()) fail('INPUT_NOT_REGULAR'); return readFile(file);}
export async function atomicJson(file, value, {exclusive = false} = {}) {
  const temporary = file + '.tmp-' + randomUUID();
  const handle = await open(temporary, 'wx', 0o600);
  try {await handle.writeFile(bytes(value)); await handle.sync();} finally {await handle.close();}
  try {
    // Antivirus/readers can briefly deny replacement on Windows. Retry the
    // atomic operation itself; never unlink the previous authoritative file.
    for (let attempt = 0; ; attempt++) {
      try {if (exclusive) await link(temporary, file); else await rename(temporary, file); break;}
      catch (error) {
        if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 7) throw error;
        await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
      }
    }
  }
  finally {await unlink(temporary).catch(error => {if (error.code !== 'ENOENT') throw error;});}
}
// Root junctions are explicit inputs; redirects below those roots are refused.
async function inventory(root, scopes = ['']) {
  root = await realpath(root);
  const files = [];
  async function visit(relative) {
    const file = path.join(root, relative), stat = await lstat(file);
    if (stat.isSymbolicLink()) fail('INPUT_TREE_REDIRECT');
    if (stat.isDirectory()) {
      for (const name of (await readdir(file)).sort()) await visit(relative ? relative + '/' + name : name);
    } else if (stat.isFile()) files.push({path: relative, sha256: sha256(await readFile(file)), bytes: stat.size});
    else fail('INPUT_TREE_NOT_REGULAR');
  }
  for (const scope of scopes) {
    const target = path.join(root, scope);
    if (!(await exists(target))) {files.push({path: scope, missing: true}); continue;}
    // The workspace's dependency root may be an explicitly installed junction.
    if ((await lstat(target)).isSymbolicLink() && scope === 'node_modules') {
      const dependencyRoot = await realpath(target);
      const entries = await inventory(dependencyRoot);
      files.push(...entries.map(e => ({...e, path: 'node_modules/' + e.path, dependencyRoot})));
    } else await visit(scope);
  }
  return files;
}
export async function fingerprintWorkspace(workspace) {return digest(await inventory(workspace, CODE_SCOPES));}
export async function fingerprintTree(root) {return digest(await inventory(root));}
export async function verifyHelper({helperRoot, helperManifest, helperSha256}) {
  if (!hashPattern.test(helperSha256 || '')) fail('HELPER_PIN_REQUIRED');
  const raw = await regular(helperManifest);
  if (sha256(raw) !== helperSha256) fail('HELPER_MANIFEST_CHANGED');
  const manifest = JSON.parse(raw);
  if (manifest.schemaVersion !== 'publication-validation-helper/v1' || !/^[a-f0-9]{40}$/.test(manifest.sourceRevision || '') ||
      !Array.isArray(manifest.files) || manifest.files.length !== helperFiles.length) fail('HELPER_MANIFEST_INVALID');
  for (const file of helperFiles) {
    const entry = manifest.files.find(e => e.path === file);
    if (!entry || !hashPattern.test(entry.sha256 || '') || sha256(await regular(path.join(helperRoot, file))) !== entry.sha256) fail('HELPER_FILE_CHANGED');
  }
  return manifest;
}
function requestShape(request) {
  const allowed = ['schemaVersion', 'readingId', 'workspace', 'workspaceCodeSha256', 'npmCli', 'nodeSha256', 'npmSha256', 'artifacts', 'privateTrees', 'manifestReadingMapSha256'];
  if (!request || Object.keys(request).some(k => !allowed.includes(k)) || request.schemaVersion !== 'publication-validation-request/v1' ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/.test(request.readingId || '') || !path.isAbsolute(request.workspace || '') || !path.isAbsolute(request.npmCli || '') ||
      ![request.workspaceCodeSha256, request.nodeSha256, request.npmSha256, request.manifestReadingMapSha256].every(v => hashPattern.test(v || '')) ||
      !Array.isArray(request.artifacts) || !Array.isArray(request.privateTrees)) fail('VALIDATION_REQUEST_INVALID');
  const roles = ['approval', 'candidate', 'content', 'manifest', 'registry', 'coverage', 'evidence'];
  for (const role of roles) if (request.artifacts.filter(a => a.role === role).length !== 1) fail('REQUIRED_BINDING_MISSING');
  if (new Set(request.artifacts.map(a => a.role)).size !== request.artifacts.length) fail('DUPLICATE_BINDING');
  for (const item of [...request.artifacts, ...request.privateTrees]) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(item.role || '') || !path.isAbsolute(item.path || '') || !hashPattern.test(item.sha256 || '')) fail('BINDING_INVALID');
  }
  if (request.privateTrees.filter(t => t.role === 'henryLibrary').length !== 1) fail('HENRY_LIBRARY_BINDING_REQUIRED');
  if (new Set(request.privateTrees.map(t => t.role)).size !== request.privateTrees.length) fail('DUPLICATE_TREE_BINDING');
  const fileFor = role => request.artifacts.find(a => a.role === role).path;
  const fixed = {candidate: `private-content/bridge/celebration-y3q4/${request.readingId}.metadata.json`,
    content: `private-content/bridge/celebration-y3q4/${request.readingId}.md`, manifest: 'private-content/private-manifest.json',
    registry: 'research/working/bridge-source-registry.json', coverage: 'research/working/BRIDGE_SOURCE_COVERAGE.md'};
  for (const [role, relative] of Object.entries(fixed)) if (path.resolve(fileFor(role)) !== path.resolve(request.workspace, relative)) fail('WORKSPACE_BINDING_MISMATCH');
}
export async function inspectBindings(request) {
  requestShape(request);
  const workspace = await realpath(request.workspace);
  if (sha256(await regular(process.execPath)) !== request.nodeSha256 || sha256(await regular(request.npmCli)) !== request.npmSha256) fail('EXECUTABLE_CHANGED');
  if (await fingerprintWorkspace(workspace) !== request.workspaceCodeSha256) fail('WORKSPACE_CODE_CHANGED');
  for (const artifact of request.artifacts) if (sha256(await regular(artifact.path)) !== artifact.sha256) fail('APPROVED_INPUT_CHANGED');
  for (const tree of request.privateTrees) if (await fingerprintTree(tree.path) !== tree.sha256) fail('PRIVATE_TREE_CHANGED');
  const artifact = role => request.artifacts.find(a => a.role === role);
  const manifest = await json(artifact('manifest').path);
  if (manifest.schemaVersion !== 'private-manifest/v1' || !manifest.readings || Array.isArray(manifest.readings) ||
      digest(manifest.readings) !== request.manifestReadingMapSha256 || !manifest.readings[request.readingId]) fail('MANIFEST_READING_MAP_CHANGED');
  const metadata = await json(artifact('candidate').path);
  if (metadata.readingId !== request.readingId || metadata.generation?.contentHash !== artifact('content').sha256 ||
      !['in_review', 'approved'].includes(metadata.generation?.humanReviewStatus)) fail('CANDIDATE_REVIEW_BINDING_INVALID');
  const approval = await json(artifact('approval').path), evidence = await json(artifact('evidence').path);
  if ((approval.reading_id ?? approval.readingId) !== request.readingId || (approval.review?.status ?? approval.status) !== 'approved' ||
      (evidence.reading_id ?? evidence.readingId) !== request.readingId) fail('APPROVAL_READING_BINDING_INVALID');
  if (approval.contentSha256 && approval.contentSha256 !== artifact('content').sha256 ||
      approval.metadataSha256 && approval.metadataSha256 !== artifact('candidate').sha256) fail('APPROVAL_CANDIDATE_CHANGED');
  if (approval.schema_version === 'mhc-evidence-approved/v2') {
    const attached = metadata.verseCommentaries || (metadata.verseCommentary ? [metadata.verseCommentary] : []);
    if (!Array.isArray(approval.results) || !approval.results.length || attached.length !== approval.results.length ||
        !approval.results.every(r => attached.some(a => isDeepStrictEqual(a, r.runtime)))) fail('APPROVED_HENRY_ATTACHMENT_CHANGED');
    if (approval.input_sha256 !== evidence.input_sha256 || approval.review_basis_sha256 !== evidence.review_basis_sha256) fail('APPROVED_HENRY_EVIDENCE_CHANGED');
  }
  const plan = await json(path.join(workspace, 'fixtures/pilot-content/plan.json'));
  if (!Array.isArray(plan.entries) || !plan.entries.some(e => e.readingId === request.readingId) ||
      new Set(plan.entries.map(e => e.readingId)).size !== plan.entries.length ||
      plan.entries.some(e => !/^[A-Za-z0-9_-]+$/.test(e.readingId) || !manifest.readings[e.readingId])) fail('PUBLISHED_PLAN_BINDING_INVALID');
  // Bind the complete validated prefix, including unrelated prepared readings.
  const prefix = [];
  for (const {readingId} of plan.entries) for (const suffix of ['md', 'metadata.json']) {
    const file = `private-content/bridge/celebration-y3q4/${readingId}.${suffix}`;
    prefix.push({path: file, sha256: sha256(await regular(path.join(workspace, file)))});
  }
  return {readingId: request.readingId, requestSha256: digest(request), workspaceCodeSha256: request.workspaceCodeSha256,
    artifacts: request.artifacts, privateTrees: request.privateTrees, manifestReadingMapSha256: request.manifestReadingMapSha256,
    prefix, fingerprint: digest({request, prefix})};
}
function safeEnv() {
  const env = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'COMSPEC', 'PATHEXT']) if (process.env[name]) env[name] = process.env[name];
  return {...env, DBR_PRIVATE_VALIDATION_SCOPE: 'manifest', npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false'};
}
async function collect(command, args, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {windowsHide: true, env: safeEnv(), stdio: ['ignore', 'pipe', 'pipe']});
    let output = ''; const timer = setTimeout(() => {child.kill(); reject(new Error('PROCESS_QUERY_TIMEOUT'));}, timeout);
    child.stdout.on('data', data => {output += data;});
    child.on('error', error => {clearTimeout(timer); reject(error);});
    child.on('close', code => {clearTimeout(timer); if (code !== 0) reject(new Error('PROCESS_QUERY_FAILED')); else resolve(output);});
  });
}
export async function readLinuxProcessIdentity(pid, readStat = readFile) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  try {const raw = await readStat(`/proc/${pid}/stat`, 'utf8'); const fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
    return fields[0] === 'Z' ? null : {pid, birth: fields[19]};
  } catch (error) {
    // procfs can lose the task after open and return ESRCH during read.
    // Both absence codes mean gone; permission, I/O and other errors still throw.
    if (error.code === 'ENOENT' || error.code === 'ESRCH') return null;
    throw error;
  }
}
export async function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  if (process.platform === 'win32') {
    const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const output = await collect(shell, ['-NoProfile', '-NonInteractive', '-Command',
      `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if($p){[Console]::Write($p.CreationDate.ToUniversalTime().Ticks.ToString())}`]);
    return output.trim() ? {pid, birth: output.trim()} : null;
  }
  if (process.platform === 'linux') return readLinuxProcessIdentity(pid);
  fail('PROCESS_IDENTITY_UNSUPPORTED');
}
async function alive(identity) {return identity && JSON.stringify(await processIdentity(identity.pid)) === JSON.stringify(identity);}
export async function terminateTree(identity) {
  if (!(await alive(identity))) return false; // Never kill a reused PID.
  if (process.platform === 'win32') {
    const taskkill = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe');
    await collect(taskkill, ['/PID', String(identity.pid), '/T', '/F']).catch(async error => {if (await alive(identity)) throw error;});
  } else {
    try {process.kill(-identity.pid, 'SIGKILL');} catch (error) {
      if (error.code !== 'ESRCH') throw error;
      if (await alive(identity)) process.kill(identity.pid, 'SIGKILL');
    }
  }
  return true;
}
async function setBlocker(run, code, detail = {}) {
  const file = path.join(run, 'blocker.json');
  // First blocker is retained; concurrent observations cannot erase it.
  try {await atomicJson(file, {schemaVersion: 'publication-validation-blocker/v1', code, at: new Date().toISOString(),
    statusForUser: `STATUS FOR USER: Offline publication validation blocked (${code}); publication remains held.`, publicationHeld: true, ...detail}, {exclusive: true});}
  catch (error) {if (error.code !== 'EEXIST') throw error;}
}
export async function startValidation({requestFile, requestSha256, runsRoot, ...helper}) {
  await verifyHelper(helper);
  if (!hashPattern.test(requestSha256 || '')) fail('REQUEST_PIN_REQUIRED');
  const raw = await regular(requestFile);
  if (sha256(raw) !== requestSha256) fail('REQUEST_CHANGED');
  const request = JSON.parse(raw); requestShape(request);
  const root = path.resolve(runsRoot);
  if (inside(request.workspace, root) && CODE_SCOPES.some(scope => inside(path.join(request.workspace, scope), root))) fail('RECEIPT_ROOT_IN_EXECUTABLE_TREE');
  await mkdir(root, {recursive: true, mode: 0o700});
  const run = path.join(await realpath(root), 'PV-' + randomUUID()); await mkdir(run, {mode: 0o700});
  await copyFile(requestFile, path.join(run, 'request.json'));
  const token = randomUUID();
  const context = {...helper, requestSha256, token};
  await atomicJson(path.join(run, 'context.json'), context);
  await atomicJson(path.join(run, 'receipt.json'), {schemaVersion: 'publication-validation-receipt/v1', readingId: request.readingId,
    state: 'queued', publicationHeld: true, validationReady: false, requestSha256, helperSha256: helper.helperSha256,
    token, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), worker: null, steps: []});
  const out = await open(path.join(run, 'worker.log'), 'wx', 0o600);
  let child;
  try {
    child = spawn(process.execPath, [path.join(helper.helperRoot, helperFiles[0]), 'worker', '--run', run, '--token', token,
      '--helper-manifest', helper.helperManifest, '--helper-sha256', helper.helperSha256],
    {cwd: helper.helperRoot, detached: true, windowsHide: true, stdio: ['ignore', out.fd, out.fd], env: safeEnv()});
    await new Promise((resolve, reject) => {child.once('spawn', resolve); child.once('error', reject);});
    await atomicJson(path.join(run, 'launch.json'), {pid: child.pid, worker: await processIdentity(child.pid), token, launchedAt: new Date().toISOString()});
    child.unref();
  } catch (error) {await setBlocker(run, 'WORKER_LAUNCH_FAILED'); throw error;}
  finally {child?.unref(); await out.close();}
  return {run, pid: child.pid, state: 'queued', publicationHeld: true,
    statusForUser: 'STATUS FOR USER: Offline publication validation started; publication remains held pending durable completion.'};
}
async function bundleSnapshot(request, run, binding) {
  const destination = path.join(run, 'bundle-workspace'); await mkdir(destination);
  const copy = async (from, relative, expectedSha256) => {
    const file = path.join(destination, relativePath(relative)); await mkdir(path.dirname(file), {recursive: true}); await copyFile(from, file);
    if (sha256(await regular(file)) !== expectedSha256) fail('BUNDLE_COPY_CHANGED');
  };
  for (const entry of await inventory(request.workspace, bundleInputScopes.slice(0, 8))) if (!entry.missing) await copy(path.join(request.workspace, entry.path), entry.path, entry.sha256);
  for (const entry of binding.prefix) await copy(path.join(request.workspace, entry.path), entry.path, entry.sha256);
  for (const role of ['manifest', 'registry', 'coverage']) {
    const artifact = request.artifacts.find(a => a.role === role);
    await copy(artifact.path, path.relative(request.workspace, artifact.path).split(path.sep).join('/'), artifact.sha256);
  }
  // bundle:private can synchronize attachments. Run it only against private copies,
  // never the canonical junctions. A changed copy invalidates the completion.
  const library = request.privateTrees.find(t => t.role === 'henryLibrary');
  for (const entry of await inventory(library.path)) await copy(path.join(library.path, entry.path), 'private-commentary/mhc/stores/library/' + entry.path, entry.sha256);
  return destination;
}
export function validationCommands(request, bundleWorkspace) {
  const npm = (...args) => ({command: process.execPath, args: [request.npmCli, 'run', ...args], cwd: request.workspace});
  return [npm('validate:sources', '--', 'research/working/bridge-source-registry.json'),
    npm('validate:private', '--', '--require', '--manifest-backed'), npm('validate'), npm('safety'), npm('check:published'),
    {...npm('bundle:private', '--', '--manifest-backed'), cwd: bundleWorkspace}];
}
export async function runValidation(run, {policy = DEFAULT_POLICY, commands, inspect = inspectBindings, identity = processIdentity, kill = terminateTree, helperCheck = verifyHelper} = {}) {
  const context = await json(path.join(run, 'context.json')), requestRaw = await regular(path.join(run, 'request.json'));
  let state = await json(path.join(run, 'receipt.json')), current = null, abortCode = null, heartbeat, totalTimer, forceExit, queue = Promise.resolve();
  const persist = () => {queue = queue.catch(() => {}).then(async () => {state.updatedAt = new Date().toISOString(); await atomicJson(path.join(run, 'receipt.json'), state);}); return queue;};
  const interrupted = () => {abortCode = 'WORKER_INTERRUPTED';};
  process.on('SIGTERM', interrupted); process.on('SIGINT', interrupted);
  const deadline = Date.now() + policy.totalMs;
  async function assertCurrent(binding) {
    if (abortCode) fail(abortCode);
    if (Date.now() >= deadline) fail('TOTAL_TIMEOUT');
    if (await exists(path.join(run, 'blocker.json'))) fail('EXTERNAL_BLOCKER');
    if (sha256(await regular(path.join(run, 'request.json'))) !== context.requestSha256) fail('REQUEST_CHANGED');
    await helperCheck(context);
    const actual = await inspect(JSON.parse(requestRaw));
    if (binding && actual.fingerprint !== binding.fingerprint) fail('VALIDATION_INPUT_CHANGED');
    return actual;
  }
  try {
    if (state.state !== 'queued' || state.token !== context.token || sha256(requestRaw) !== context.requestSha256) fail('WORKER_REQUEST_INVALID');
    try {await atomicJson(path.join(run, 'worker-claim.json'), {pid: process.pid, token: context.token}, {exclusive: true});}
    catch (error) {if (error.code === 'EEXIST') fail('DUPLICATE_WORKER'); throw error;}
    state.worker = await identity(process.pid); if (!state.worker) fail('WORKER_IDENTITY_UNAVAILABLE');
    state.state = 'running'; state.startedAt = new Date().toISOString(); state.deadlineAt = new Date(deadline).toISOString();
    state.policy = policy; await persist();
    heartbeat = setInterval(() => {persist().catch(error => {abortCode = 'RECEIPT_WRITE_FAILED'; state.receiptErrorCode = error.code || 'WRITE_FAILED';});}, policy.heartbeatMs);
    totalTimer = setTimeout(() => {
      abortCode ||= 'TOTAL_TIMEOUT';
      // A total deadline also covers input hashing/snapshot creation. The durable
      // blocker survives a stuck local operation which cannot finish its receipt.
      setBlocker(run, abortCode).then(async () => {
        if (state.steps.at(-1)?.child) await kill(state.steps.at(-1).child);
      }).catch(() => {});
      forceExit = setTimeout(() => process.exit(1), 15000);
    }, policy.totalMs);
    const request = JSON.parse(requestRaw), binding = await assertCurrent(); state.binding = binding; await persist();
    const bundleWorkspace = commands ? null : await bundleSnapshot(request, run, binding);
    if (bundleWorkspace) state.bundleInputs = {root: bundleWorkspace, sha256: digest(await inventory(bundleWorkspace, bundleInputScopes))};
    const gates = commands || validationCommands(request, bundleWorkspace);
    if (gates.length !== GATES.length) fail('GATE_SEQUENCE_INVALID');
    for (let index = 0; index < gates.length; index++) {
      await assertCurrent(binding);
      if (index === GATES.length - 1 && state.bundleInputs && digest(await inventory(bundleWorkspace, bundleInputScopes)) !== state.bundleInputs.sha256) fail('BUNDLE_INPUT_CHANGED');
      const gate = gates[index], step = {gate: GATES[index], state: 'running', startedAt: new Date().toISOString(), timeoutMs: policy.stepMs[index], exitCode: null, signal: null, child: null, log: `${index + 1}-${GATES[index].replace(':', '-')}.log`};
      state.steps.push(step); await persist();
      const log = await open(path.join(run, step.log), 'wx', 0o600);
      let timer, monitor, settled;
      try {
        const started = Date.now();
        current = spawn(gate.command, gate.args, {cwd: gate.cwd, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', log.fd, log.fd], env: safeEnv()});
        step.pid = current.pid;
        settled = new Promise(resolve => {current.once('error', error => resolve({error: error.code || 'SPAWN_FAILED', exitCode: null, signal: null}));
          current.once('close', (exitCode, signal) => resolve({exitCode, signal}));});
        step.child = await identity(current.pid); await persist();
        let stopPromise;
        const stop = code => {
          if (!stopPromise) {abortCode ||= code; stopPromise = (async () => {await setBlocker(run, abortCode); if (step.child) await kill(step.child); else current.kill();})();}
          return stopPromise;
        };
        timer = setTimeout(() => {stop('STEP_TIMEOUT').catch(() => {abortCode = 'TREE_TERMINATION_FAILED';});}, Math.max(1, policy.stepMs[index] - (Date.now() - started)));
        monitor = setInterval(() => {
          if (abortCode || Date.now() >= deadline) stop(abortCode || 'TOTAL_TIMEOUT').catch(() => {abortCode = 'TREE_TERMINATION_FAILED';});
          else exists(path.join(run, 'blocker.json')).then(found => {if (found) return stop('EXTERNAL_BLOCKER');}).catch(() => {abortCode = 'BLOCKER_READ_FAILED';});
        }, Math.min(policy.heartbeatMs, 1000));
        // Missing close after termination is itself a blocker, not a successful exit.
        const watchdog = new Promise(resolve => {const duration = Math.max(1, Math.min(policy.stepMs[index] - (Date.now() - started), deadline - Date.now())) + 15000;
          settled.finally(() => clearTimeout(setTimeoutId)); const setTimeoutId = setTimeout(() => resolve({error: 'CHILD_COMPLETION_MISSING', exitCode: null, signal: null}), duration);});
        const result = await Promise.race([settled, watchdog]); if (stopPromise) await stopPromise;
        step.exitCode = result.exitCode; step.signal = result.signal; step.errorCode = result.error || null; step.elapsedMs = Date.now() - started;
        if (result.error || result.exitCode !== 0 || result.signal || abortCode) fail(abortCode || 'GATE_FAILED');
        step.state = 'passed'; step.completedAt = new Date().toISOString();
      } finally {
        clearTimeout(timer); clearInterval(monitor); await log.sync(); await log.close();
        step.logSha256 = sha256(await regular(path.join(run, step.log))); await persist();
      }
      current = null; await assertCurrent(binding);
    }
    if (!commands) {
      if (digest(await inventory(bundleWorkspace, bundleInputScopes)) !== state.bundleInputs.sha256) fail('BUNDLE_INPUT_CHANGED');
      for (const entry of binding.prefix) if (sha256(await regular(path.join(bundleWorkspace, entry.path))) !== entry.sha256) fail('BUNDLE_ATTACHMENT_CHANGED');
      const bundleRoot = path.join(bundleWorkspace, 'private-content/bundles/celebration-bridge-review');
      state.bundle = {root: bundleRoot, sha256: await fingerprintTree(bundleRoot)};
      const manifest = await json(path.join(bundleRoot, 'manifest.json'));
      if (manifest.safety?.approvedForPublication !== false || !manifest.readings?.some(r => r.readingId === request.readingId)) fail('BUNDLE_RESULT_INVALID');
    }
    await assertCurrent(binding);
    clearInterval(heartbeat); await queue;
    state.state = 'passed'; state.validationReady = true; state.completedAt = new Date().toISOString();
    state.statusForUser = `STATUS FOR USER: Offline validation passed for ${request.readingId}; publication remains held for the existing publisher and exact readback.`;
    state.updatedAt = new Date().toISOString();
    await atomicJson(path.join(run, 'completion.json'), {schemaVersion: 'publication-validation-completion/v1', requestSha256: context.requestSha256,
      receiptSha256: sha256(bytes(state)), fingerprint: binding.fingerprint});
    // Completion is durable before the terminal receipt becomes visible.
    await atomicJson(path.join(run, 'receipt.json'), state);
  } catch (error) {
    await setBlocker(run, /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'VALIDATION_EXECUTION_FAILED');
    if (current && state.steps.at(-1)?.child) await kill(state.steps.at(-1).child).catch(() => {});
    clearInterval(heartbeat); await queue.catch(() => {});
    state.state = 'blocked'; state.validationReady = false; state.completedAt = new Date().toISOString();
    if (state.steps.at(-1)?.state === 'running') state.steps.at(-1).state = 'blocked';
    state.statusForUser = (await json(path.join(run, 'blocker.json'))).statusForUser; await persist();
  } finally {clearInterval(heartbeat); clearTimeout(totalTimer); clearTimeout(forceExit); process.off('SIGTERM', interrupted); process.off('SIGINT', interrupted);}
  return state;
}
export async function validationStatus(run, {requestSha256, ...helper}, {now = Date.now(), inspect = inspectBindings, identity = processIdentity, kill = terminateTree, helperCheck = verifyHelper} = {}) {
  let receipt, blocker; const cleanup = [];
  try {
    await helperCheck(helper);
    const context = await json(path.join(run, 'context.json'));
    if (!hashPattern.test(requestSha256 || '') || context.requestSha256 !== requestSha256 || context.helperSha256 !== helper.helperSha256 ||
        sha256(await regular(path.join(run, 'request.json'))) !== requestSha256) fail('STATUS_BINDING_CHANGED');
    receipt = await json(path.join(run, 'receipt.json'));
    if (receipt.schemaVersion !== 'publication-validation-receipt/v1' || receipt.requestSha256 !== requestSha256 || receipt.helperSha256 !== helper.helperSha256 ||
        receipt.token !== context.token || receipt.publicationHeld !== true || !['queued', 'running', 'blocked', 'passed'].includes(receipt.state)) fail('RECEIPT_INVALID');
    if (!terminal(receipt.state)) {
      const staleMs = receipt.state === 'queued' ? DEFAULT_POLICY.launchMs : (receipt.policy?.staleMs || DEFAULT_POLICY.staleMs);
      if (!Number.isFinite(Date.parse(receipt.updatedAt)) || now - Date.parse(receipt.updatedAt) > staleMs) fail('WORKER_STALE');
      if (receipt.state === 'running' && (!receipt.worker || JSON.stringify(await identity(receipt.worker.pid)) !== JSON.stringify(receipt.worker))) fail('WORKER_KILLED');
      if (receipt.state === 'queued' && await exists(path.join(run, 'launch.json'))) {
        const launch = await json(path.join(run, 'launch.json'));
        if (launch.token !== context.token || !launch.worker || JSON.stringify(await identity(launch.pid)) !== JSON.stringify(launch.worker)) fail('WORKER_KILLED');
      }
      if (receipt.deadlineAt && now >= Date.parse(receipt.deadlineAt)) fail('TOTAL_TIMEOUT');
    } else if (receipt.state === 'passed') {
      const completion = await json(path.join(run, 'completion.json'));
      if (completion.schemaVersion !== 'publication-validation-completion/v1' || completion.receiptSha256 !== sha256(await regular(path.join(run, 'receipt.json'))) ||
          completion.requestSha256 !== requestSha256 || completion.fingerprint !== receipt.binding?.fingerprint || receipt.validationReady !== true ||
          receipt.steps.length !== GATES.length || receipt.steps.some((s, i) => s.gate !== GATES[i] || s.state !== 'passed' || s.exitCode !== 0 || s.signal || s.errorCode || !s.completedAt)) fail('COMPLETION_INVALID');
      const actual = await inspect(await json(path.join(run, 'request.json')));
      if (actual.fingerprint !== completion.fingerprint) fail('VALIDATION_INPUT_CHANGED');
      for (const step of receipt.steps) if (sha256(await regular(path.join(run, relativePath(step.log)))) !== step.logSha256) fail('GATE_LOG_CHANGED');
      if (!receipt.bundleInputs || !inside(run, receipt.bundleInputs.root) || digest(await inventory(receipt.bundleInputs.root, bundleInputScopes)) !== receipt.bundleInputs.sha256) fail('BUNDLE_INPUT_CHANGED');
      if (!receipt.bundle || !inside(run, receipt.bundle.root) || await fingerprintTree(receipt.bundle.root) !== receipt.bundle.sha256) fail('BUNDLE_CHANGED');
    }
  } catch (error) {
    await setBlocker(run, /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'STATUS_EVIDENCE_MISSING');
  }
  if (await exists(path.join(run, 'blocker.json'))) {
    blocker = await json(path.join(run, 'blocker.json'));
    // Only identity-verified worker/step processes can be terminated.
    if (receipt) {
      const targets = [receipt.steps?.at(-1)?.child, ...(!terminal(receipt.state) ? [receipt.worker] : [])];
      for (const target of targets.filter(Boolean)) {
        try {cleanup.push({pid: target.pid, result: await kill(target) ? 'terminated' : 'already_gone'});}
        catch {cleanup.push({pid: target.pid, result: 'failed'});}
      }
    }
  }
  const status = {schemaVersion: 'publication-validation-status/v1', run, readingId: receipt?.readingId || null,
    state: blocker ? 'blocked' : receipt.state, publicationHeld: true, validationReady: !blocker && receipt.validationReady === true,
    worker: receipt?.worker || null, observedAt: new Date(now).toISOString(), heartbeatAt: receipt?.updatedAt || null,
    steps: receipt?.steps || [], blockerCode: blocker?.code || null,
    cleanup,
    statusForUser: blocker?.statusForUser || receipt.statusForUser || 'STATUS FOR USER: Offline publication validation is running; publication remains held.'};
  await atomicJson(path.join(run, 'status.json'), status); return status;
}
