import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, mkdir, readFile, writeFile, copyFile, rm, access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {sha256, fingerprintWorkspace, fingerprintTree, startValidation, runValidation, validationStatus,
  inspectBindings, atomicJson, processIdentity, readLinuxProcessIdentity, terminateTree, validationCommands, DEFAULT_POLICY} from '../scripts/lib/publication-validation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bytes = v => JSON.stringify(v, null, 2) + '\n';
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(read, predicate, deadline = 30000) {
  const until = Date.now() + deadline;
  let value;
  while (Date.now() < until) {value = await read(); if (predicate(value)) return value; await sleep(75);}
  throw Error('FABRICATED regression polling deadline exceeded: ' + JSON.stringify(value));
}
async function fixture(t, {delay = 0, failGate = '', signalGate = '', mutateBundle = false, orphan = false, realNpm = false, holdSource = false} = {}) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'dbr-offline-validation-test-'));
  const workspace = path.join(temp, 'workspace'), helperRoot = path.join(temp, 'helper'), runsRoot = path.join(temp, 'runs');
  // Test controls are siblings of the workspace/helper, outside every bound input.
  const releaseGatePath = path.join(temp, 'release-source-gate'), heldGatePath = path.join(temp, 'source-gate-held');
  const active = [];
  t.after(async () => {
    for (const run of active) {const receipt = await json(path.join(run, 'receipt.json')).catch(() => null);
      for (const identity of [receipt?.steps.at(-1)?.child, receipt?.worker].filter(Boolean)) {
        if (identity.pid !== process.pid) await terminateTree(identity).catch(() => {});
      }
    }
    assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('dbr-offline-validation-test-'));
    await rm(temp, {recursive: true, force: true});
  });
  const save = async (file, value) => {await mkdir(path.dirname(file), {recursive: true}); await writeFile(file, typeof value === 'string' ? value : bytes(value));};
  await mkdir(workspace); await mkdir(helperRoot);
  for (const file of ['scripts/publication-validation.mjs', 'scripts/lib/publication-validation.mjs']) {
    await mkdir(path.dirname(path.join(helperRoot, file)), {recursive: true}); await copyFile(path.join(root, file), path.join(helperRoot, file));
  }
  const helperManifest = path.join(helperRoot, 'manifest.json');
  await save(helperManifest, {schemaVersion: 'publication-validation-helper/v1', sourceRevision: 'a'.repeat(40),
    files: await Promise.all(['scripts/publication-validation.mjs', 'scripts/lib/publication-validation.mjs'].map(async file => ({path: file, sha256: sha256(await readFile(path.join(helperRoot, file)))})))});
  const helper = {helperRoot, helperManifest, helperSha256: sha256(await readFile(helperManifest))};
  const readingId = 'FABRICATED-READING';
  const contents = 'CONSPICUOUSLY FABRICATED TEST STUDY. No real Scripture or commentary.';
  const rolePaths = {content: `private-content/bridge/celebration-y3q4/${readingId}.md`, candidate: `private-content/bridge/celebration-y3q4/${readingId}.metadata.json`,
    manifest: 'private-content/private-manifest.json', registry: 'research/working/bridge-source-registry.json', coverage: 'research/working/BRIDGE_SOURCE_COVERAGE.md',
    approval: 'private-content/approval.json', evidence: 'private-content/fabricated-evidence.json'};
  const manifest = {schemaVersion: 'private-manifest/v1', readings: {[readingId]: {contentFileId: 'fabricated-content', metadataFileId: 'fabricated-metadata'}}};
  await save(path.join(workspace, rolePaths.content), contents);
  await save(path.join(workspace, rolePaths.candidate), {readingId, label: 'FABRICATED TEST METADATA', generation: {humanReviewStatus: 'approved', contentHash: sha256(contents)}});
  await save(path.join(workspace, rolePaths.manifest), manifest);
  for (const role of ['registry', 'coverage', 'approval', 'evidence']) await save(path.join(workspace, rolePaths[role]), {label: 'FABRICATED TEST INPUT', role,
    ...(['approval', 'evidence'].includes(role) ? {readingId, status: 'approved'} : {})});
  await save(path.join(workspace, 'fixtures/pilot-content/plan.json'), {entries: [{readingId}]});
  await save(path.join(workspace, 'fixtures/pilot-content/app-config.json'), {label: 'FABRICATED TEST CONFIG'});
  await save(path.join(workspace, 'schemas/fake.json'), {label: 'FABRICATED TEST SCHEMA'});
  const library = path.join(workspace, 'private-commentary/mhc/stores/library');
  await save(path.join(library, 'current.json'), {label: 'FABRICATED LIBRARY POINTER'});
  // A fabricated npm CLI launches the same six fixed gate names. No network or
  // real publication path exists. It keeps a nested process for tree-kill tests.
  const npmCli = realNpm ? (process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')) : path.join(temp, 'fabricated-npm.mjs');
  if (!realNpm) await save(npmCli, `// FABRICATED TEST npm CLI, no network\nimport {spawn} from 'node:child_process';\nimport {readFile} from 'node:fs/promises';\nimport path from 'node:path';\nconst gate=process.argv[3];const pkg=JSON.parse(await readFile('package.json','utf8'));if(!pkg.scripts[gate])throw Error('FABRICATED npm script absent');\nconst child=spawn(process.execPath,[path.join(process.cwd(),'scripts/fabricated-gate.mjs'),gate],{stdio:'inherit'});\nchild.on('close',(code,signal)=>{if(signal)process.kill(process.pid,signal);else process.exitCode=code??1;});\n`);
  await save(path.join(workspace, 'scripts/fabricated-gate.mjs'), `// CONSPICUOUSLY FABRICATED VALIDATION GATE\nimport {mkdir,writeFile,readFile,access} from 'node:fs/promises';\nimport {spawn} from 'node:child_process';\nconst gate=process.argv[2];\nconsole.log('FABRICATED gate '+gate);\n${orphan ? `if(gate==='validate:sources') spawn(process.execPath,['-e',${JSON.stringify(`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(path.join(temp, 'orphan-marker'))},'FABRICATED ORPHAN SURVIVED'),3500)`)}],{stdio:'ignore'});` : ''}\n${holdSource ? `if(gate==='validate:sources'){await writeFile(${JSON.stringify(heldGatePath)},'FABRICATED GATE HELD');const deadline=Date.now()+45000;while(!await access(${JSON.stringify(releaseGatePath)}).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;})){if(Date.now()>=deadline)throw Error('FABRICATED gate release deadline exceeded');await new Promise(r=>setTimeout(r,100));}}` : ''}\nawait new Promise(r=>setTimeout(r,gate==='validate:sources'?${delay}:5));\nif(gate===${JSON.stringify(signalGate)})process.kill(process.pid,'SIGTERM');\nelse if(gate===${JSON.stringify(failGate)})process.exitCode=7;\nelse if(gate==='bundle:private'){\n${mutateBundle ? `await writeFile(${JSON.stringify(rolePaths.candidate)},'FABRICATED MUTATED ATTACHMENT');` : ''}\nconst out='private-content/bundles/celebration-bridge-review';await mkdir(out,{recursive:true});\nawait writeFile(out+'/manifest.json',JSON.stringify({safety:{approvedForPublication:false},readings:[{readingId:${JSON.stringify(readingId)}}]}));\n}\n`);
  await save(path.join(workspace, 'package.json'), {name: 'fabricated-validation-test', scripts: Object.fromEntries(['validate:sources', 'validate:private', 'validate', 'safety', 'check:published', 'bundle:private'].map(gate => [gate, 'node scripts/fabricated-gate.mjs ' + gate]))});
  await save(path.join(workspace, 'package-lock.json'), {label: 'FABRICATED LOCKFILE'});
  const request = {schemaVersion: 'publication-validation-request/v1', readingId, workspace,
    workspaceCodeSha256: await fingerprintWorkspace(workspace), npmCli, nodeSha256: sha256(await readFile(process.execPath)), npmSha256: sha256(await readFile(npmCli)),
    manifestReadingMapSha256: sha256(bytes(manifest.readings)),
    artifacts: await Promise.all(Object.entries(rolePaths).map(async ([role, relative]) => ({role, path: path.join(workspace, relative), sha256: sha256(await readFile(path.join(workspace, relative)))}))),
    privateTrees: [{role: 'henryLibrary', path: library, sha256: await fingerprintTree(library)}]};
  const requestFile = path.join(temp, 'request.json'); await save(requestFile, request);
  const requestSha256 = sha256(await readFile(requestFile));
  const start = async () => {const result = await startValidation({...helper, requestFile, requestSha256, runsRoot}); active.push(result.run); return result;};
  const status = run => validationStatus(run, {...helper, requestSha256});
  const localRun = async policy => {
    const run = path.join(temp, 'local-run'); await mkdir(run); active.push(run);
    await copyFile(requestFile, path.join(run, 'request.json'));
    const context = {...helper, requestSha256, token: 'FABRICATED-RUN-TOKEN'};
    await atomicJson(path.join(run, 'context.json'), context);
    await atomicJson(path.join(run, 'receipt.json'), {schemaVersion: 'publication-validation-receipt/v1', readingId, state: 'queued', token: context.token,
      publicationHeld: true, validationReady: false, requestSha256, helperSha256: helper.helperSha256, updatedAt: new Date().toISOString(), steps: []});
    const receipt = await runValidation(run, {policy}); return {run, receipt};
  };
  return {temp, workspace, helper, request, requestFile, requestSha256, start, status, localRun, save, rolePaths, releaseGatePath, heldGatePath, track: run => active.push(run)};
}

test('detached start returns before gate release, heartbeats and passes only all six durable gates', {timeout: 60000}, async t => {
  const f = await fixture(t, {holdSource: true});
  assert.equal(path.dirname(f.releaseGatePath), f.temp);
  assert.ok(!f.request.artifacts.some(a => a.path === f.releaseGatePath));
  assert.ok(!f.request.privateTrees.some(tree => !path.relative(tree.path, f.releaseGatePath).startsWith('..')));
  await assert.rejects(access(f.releaseGatePath), {code: 'ENOENT'});
  const launched = await f.start();
  // The gate cannot finish until this caller creates its release file.
  await assert.rejects(access(path.join(launched.run, 'completion.json')), {code: 'ENOENT'});
  const progress = await waitFor(() => json(path.join(launched.run, 'receipt.json')), r => r.steps.length === 1 && r.steps[0].child);
  await waitFor(() => access(f.heldGatePath).then(() => true, e => {if (e.code === 'ENOENT') return false; throw e;}), Boolean);
  const first = await f.status(launched.run); assert.equal(first.state, 'running'); assert.equal(first.validationReady, false); assert.equal(first.publicationHeld, true);
  assert.ok(progress.worker.pid !== process.pid); assert.ok(progress.steps[0].child.pid > 0);
  const heartbeating = await waitFor(() => json(path.join(launched.run, 'receipt.json')), r => Date.parse(r.updatedAt) > Date.parse(progress.updatedAt));
  assert.equal(heartbeating.steps.length, 1); assert.ok(Date.parse(heartbeating.updatedAt) > Date.parse(progress.updatedAt), 'heartbeat progresses independently of gate completion');
  assert.equal(heartbeating.steps[0].state, 'running');
  await assert.rejects(access(path.join(launched.run, 'completion.json')), {code: 'ENOENT'});
  await writeFile(f.releaseGatePath, 'FABRICATED GATE RELEASED', {flag: 'wx'});
  await waitFor(() => json(path.join(launched.run, 'receipt.json')), r => ['passed', 'blocked'].includes(r.state));
  const final = await f.status(launched.run); assert.equal(final.state, 'passed', JSON.stringify(final));
  assert.equal(final.validationReady, true); assert.equal(final.publicationHeld, true);
  assert.deepEqual(final.steps.map(s => s.gate), ['source', 'private', 'content', 'safety', 'check:published', 'bundle']);
  assert.ok(final.steps.every(s => s.exitCode === 0 && s.logSha256));
  assert.equal((await f.status(launched.run)).state, 'passed', 'exact inputs can reuse the receipt');
});

test('absolute real npm CLI runs fabricated gates including the copied bundle package', async t => {
  const f = await fixture(t, {realNpm: true}), {run, receipt} = await f.localRun(DEFAULT_POLICY);
  assert.equal(receipt.state, 'passed', receipt.statusForUser);
  assert.equal((await f.status(run)).state, 'passed');
});

test('CLI detached start exits before the long nested check and status uses exit 2 while running', async t => {
  const f = await fixture(t, {delay: 1800});
  const call = async args => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(f.helper.helperRoot, 'scripts/publication-validation.mjs'), ...args], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let output = ''; child.stdout.on('data', data => {output += data;}); child.on('error', reject); child.on('close', code => resolve({code, value: JSON.parse(output)}));
  });
  const pins = ['--helper-manifest', f.helper.helperManifest, '--helper-sha256', f.helper.helperSha256];
  const started = await call(['start', '--request', f.requestFile, '--request-sha256', f.requestSha256, '--runs-root', path.join(f.temp, 'runs'), ...pins]);
  assert.equal(started.code, 0); const run = started.value.run;
  f.track(run);
  const progress = await call(['status', '--run', run, '--request-sha256', f.requestSha256, ...pins]);
  assert.equal(progress.code, 2); assert.equal(progress.value.publicationHeld, true);
  await waitFor(() => json(path.join(run, 'receipt.json')), r => ['passed', 'blocked'].includes(r.state));
  assert.equal((await f.status(run)).state, 'passed');
});

test('gate failure stops the sequence and never yields a passed or published receipt', async t => {
  const f = await fixture(t, {failGate: 'validate:private'}), {run, receipt} = await f.localRun(DEFAULT_POLICY);
  assert.equal(receipt.state, 'blocked'); assert.equal(receipt.steps.length, 2); assert.equal(receipt.steps[1].exitCode, 7);
  const status = await f.status(run); assert.equal(status.validationReady, false); assert.equal(status.publicationHeld, true); assert.equal(status.blockerCode, 'GATE_FAILED');
  await assert.rejects(access(path.join(run, 'completion.json')));
});

test('signal/null exit cannot pass and explicit step timeout kills the nested check', async t => {
  const signalled = await fixture(t, {signalGate: 'validate'});
  const s = await signalled.localRun(DEFAULT_POLICY); assert.equal(s.receipt.state, 'blocked'); assert.equal(s.receipt.steps.length, 3);
  assert.notEqual(s.receipt.steps[2].exitCode, 0);
  const timeout = await fixture(t, {delay: 3000});
  const result = await timeout.localRun({...DEFAULT_POLICY, heartbeatMs: 100, stepMs: [600, 1000, 1000, 1000, 1000, 1000]});
  assert.equal(result.receipt.state, 'blocked'); assert.equal((await timeout.status(result.run)).blockerCode, 'STEP_TIMEOUT');
  assert.equal(await processIdentity(result.receipt.steps[0].child.pid), null);
});

test('total deadline is independent of a generously bounded gate', async t => {
  const f = await fixture(t, {delay: 3000});
  const result = await f.localRun({...DEFAULT_POLICY, totalMs: 1100, heartbeatMs: 100});
  assert.equal(result.receipt.state, 'blocked'); assert.equal((await f.status(result.run)).blockerCode, 'TOTAL_TIMEOUT');
});

test('Linux proc identity distinguishes absent tasks from permission, I/O and unknown read failures', async () => {
  const pid = 4242, stat = state => `${pid} (FABRICATED task with a ) in its name) ${[state, ...Array(18).fill('0'), '123456789'].join(' ')}`;
  const reader = async (file, encoding) => {assert.equal(file, `/proc/${pid}/stat`); assert.equal(encoding, 'utf8'); return stat('S');};
  assert.deepEqual(await readLinuxProcessIdentity(pid, reader), {pid, birth: '123456789'});
  assert.equal(await readLinuxProcessIdentity(pid, async () => stat('Z')), null);
  for (const code of ['ENOENT', 'ESRCH']) assert.equal(await readLinuxProcessIdentity(pid, async () => {throw Object.assign(new Error('FABRICATED absent task'), {code});}), null);
  for (const code of ['EACCES', 'EPERM', 'EIO', 'EINVAL', 'FABRICATED_UNKNOWN']) {
    const error = Object.assign(new Error('FABRICATED proc read failure'), {code});
    await assert.rejects(readLinuxProcessIdentity(pid, async () => {throw error;}), actual => actual === error);
  }
  await assert.rejects(readLinuxProcessIdentity(pid, async () => {throw new Error('FABRICATED untyped read failure');}), /FABRICATED untyped/);
});

test('proc ESRCH after observed worker absence still records WORKER_KILLED and cleans the orphan tree', async t => {
  const f = await fixture(t, {delay: 15000}), launched = await f.start();
  const receipt = await waitFor(() => json(path.join(launched.run, 'receipt.json')), r => r.steps[0]?.child);
  process.kill(receipt.worker.pid, 'SIGKILL');
  await waitFor(() => processIdentity(receipt.worker.pid), identity => identity === null);
  let procReads = 0;
  const identity = pid => pid === receipt.worker.pid ? readLinuxProcessIdentity(pid, async (file, encoding) => {
    assert.equal(file, `/proc/${pid}/stat`); assert.equal(encoding, 'utf8'); procReads++;
    throw Object.assign(new Error('ESRCH: FABRICATED task reaped between open and read'), {code: 'ESRCH', syscall: 'read'});
  }) : processIdentity(pid);
  const cleaned = [];
  const status = await validationStatus(launched.run, {...f.helper, requestSha256: f.requestSha256}, {identity, kill: async target => {cleaned.push(target); return terminateTree(target);}});
  assert.equal(procReads, 1); assert.equal(status.blockerCode, 'WORKER_KILLED'); assert.equal(status.state, 'blocked');
  assert.equal(status.validationReady, false); assert.equal(status.publicationHeld, true); assert.match(status.statusForUser, /^STATUS FOR USER:/);
  assert.ok(cleaned.some(target => target.pid === receipt.steps[0].child.pid && target.birth === receipt.steps[0].child.birth));
  assert.equal(await processIdentity(receipt.steps[0].child.pid), null);
  assert.equal((await json(path.join(launched.run, 'blocker.json'))).code, 'WORKER_KILLED');
  await assert.rejects(access(path.join(launched.run, 'completion.json')), {code: 'ENOENT'});
});

test('unknown proc identity read errors remain durable evidence blockers and never validate publication', async t => {
  for (const code of ['EACCES', 'EIO', 'FABRICATED_UNKNOWN']) {
    const f = await fixture(t, {delay: 15000}), launched = await f.start();
    const receipt = await waitFor(() => json(path.join(launched.run, 'receipt.json')), r => r.steps[0]?.child);
    let procReads = 0;
    const identity = pid => pid === receipt.worker.pid ? readLinuxProcessIdentity(pid, async () => {
      procReads++; throw Object.assign(new Error('FABRICATED unknown proc read error'), {code});
    }) : processIdentity(pid);
    const status = await validationStatus(launched.run, {...f.helper, requestSha256: f.requestSha256}, {identity});
    assert.equal(procReads, 1); assert.equal(status.blockerCode, 'STATUS_EVIDENCE_MISSING'); assert.equal(status.state, 'blocked');
    assert.equal(status.validationReady, false); assert.equal(status.publicationHeld, true);
    await assert.rejects(access(path.join(launched.run, 'completion.json')), {code: 'ENOENT'});
  }
});

test('killed detached worker becomes a durable user blocker and status terminates its orphan tree', async t => {
  const f = await fixture(t, {delay: 15000, orphan: true}), launched = await f.start();
  const receipt = await waitFor(() => json(path.join(launched.run, 'receipt.json')), r => r.steps[0]?.child);
  process.kill(receipt.worker.pid, 'SIGKILL');
  await waitFor(() => processIdentity(receipt.worker.pid), identity => identity === null);
  const status = await f.status(launched.run); assert.equal(status.state, 'blocked'); assert.equal(status.blockerCode, 'WORKER_KILLED');
  assert.match(status.statusForUser, /^STATUS FOR USER:/); assert.equal(status.publicationHeld, true);
  await sleep(3800); await assert.rejects(access(path.join(f.temp, 'orphan-marker')));
  assert.equal((await json(path.join(launched.run, 'status.json'))).state, 'blocked');
});

test('stale live worker is blocked, a reused PID identity is never killed, and late completion cannot erase the blocker', async t => {
  const f = await fixture(t, {delay: 15000}), launched = await f.start();
  const receipt = await waitFor(() => json(path.join(launched.run, 'receipt.json')), r => r.steps[0]?.child);
  const status = await validationStatus(launched.run, {...f.helper, requestSha256: f.requestSha256}, {now: Date.now() + 60000});
  assert.equal(status.blockerCode, 'WORKER_STALE'); assert.equal(status.validationReady, false);
  assert.equal(await terminateTree({pid: process.pid, birth: 'FABRICATED WRONG PROCESS BIRTH'}), false);
  await atomicJson(path.join(launched.run, 'receipt.json'), {...receipt, state: 'passed', validationReady: true});
  assert.equal((await f.status(launched.run)).state, 'blocked');
});

test('mutated approval, candidate, full mapping, code or library rejects reuse of passed validation', async t => {
  for (const mutation of ['approval', 'candidate', 'manifest', 'code', 'library']) {
    const f = await fixture(t), {run, receipt} = await f.localRun(DEFAULT_POLICY);
    assert.equal(receipt.state, 'passed'); assert.equal((await f.status(run)).state, 'passed');
    const target = mutation === 'code' ? path.join(f.workspace, 'scripts/fabricated-gate.mjs') : mutation === 'library' ? path.join(f.workspace, 'private-commentary/mhc/stores/library/current.json') : path.join(f.workspace, f.rolePaths[mutation]);
    await f.save(target, 'FABRICATED INPUT MUTATION');
    const status = await f.status(run); assert.equal(status.state, 'blocked', mutation); assert.equal(status.validationReady, false); assert.equal(status.publicationHeld, true);
  }
});

test('mutated inputs during a long gate hold publication even if its command exits zero', async t => {
  const f = await fixture(t, {delay: 2000}), launched = await f.start();
  await waitFor(() => json(path.join(launched.run, 'receipt.json')), r => r.steps[0]?.child);
  await f.save(path.join(f.workspace, f.rolePaths.approval), 'FABRICATED REPLACED APPROVAL');
  const receipt = await waitFor(() => json(path.join(launched.run, 'receipt.json')), r => ['passed', 'blocked'].includes(r.state));
  assert.equal(receipt.state, 'blocked'); assert.equal(receipt.steps.length, 1); assert.equal((await f.status(launched.run)).validationReady, false);
});

test('bundle synchronization only affects the private copy and a changed attachment blocks success', async t => {
  const f = await fixture(t, {mutateBundle: true}); const before = await readFile(path.join(f.workspace, f.rolePaths.candidate));
  const {run, receipt} = await f.localRun(DEFAULT_POLICY);
  assert.equal(receipt.state, 'blocked'); assert.ok(['BUNDLE_INPUT_CHANGED', 'BUNDLE_ATTACHMENT_CHANGED'].includes((await f.status(run)).blockerCode));
  assert.deepEqual(await readFile(path.join(f.workspace, f.rolePaths.candidate)), before);
});

test('missing completion, null/negative exit, tampered log, copied code or bundle fail closed', async t => {
  for (const mutation of ['completion', 'null-exit', 'negative-exit', 'log', 'bundle-input', 'bundle']) {
    const f = await fixture(t), {run, receipt} = await f.localRun(DEFAULT_POLICY); assert.equal(receipt.state, 'passed');
    if (mutation === 'completion') await rm(path.join(run, 'completion.json'));
    if (['null-exit', 'negative-exit'].includes(mutation)) {
      receipt.steps[0].exitCode = mutation === 'null-exit' ? null : -1;
      await atomicJson(path.join(run, 'receipt.json'), receipt);
      const completion = await json(path.join(run, 'completion.json'));
      completion.receiptSha256 = sha256(await readFile(path.join(run, 'receipt.json')));
      await atomicJson(path.join(run, 'completion.json'), completion);
    }
    if (mutation === 'log') await f.save(path.join(run, receipt.steps[0].log), 'FABRICATED TAMPERED LOG');
    if (mutation === 'bundle-input') await f.save(path.join(receipt.bundleInputs.root, 'scripts/fabricated-gate.mjs'), '// FABRICATED MUTATED COPIED CODE');
    if (mutation === 'bundle') await f.save(path.join(receipt.bundle.root, 'manifest.json'), 'FABRICATED TAMPERED BUNDLE');
    const status = await f.status(run); assert.equal(status.state, 'blocked'); assert.equal(status.publicationHeld, true); assert.equal(status.validationReady, false);
  }
});

test('helper/request pin changes are refused and default deadlines allow checks exceeding 100 seconds', async t => {
  const f = await fixture(t);
  assert.ok(DEFAULT_POLICY.stepMs[4] >= 900000); assert.ok(DEFAULT_POLICY.totalMs >= 1800000);
  const commands = validationCommands(f.request, 'FABRICATED-BUNDLE-WORKSPACE');
  assert.equal(commands[4].command, process.execPath); assert.equal(commands[4].args[0], f.request.npmCli); assert.deepEqual(commands[4].args.slice(1), ['run', 'check:published']);
  await assert.rejects(startValidation({...f.helper, requestFile: f.requestFile, requestSha256: 'b'.repeat(64), runsRoot: path.join(f.temp, 'runs')}), /REQUEST_CHANGED/);
  await f.save(path.join(f.helper.helperRoot, 'scripts/publication-validation.mjs'), '// FABRICATED altered helper');
  await assert.rejects(f.start(), /HELPER_FILE_CHANGED/);
  await assert.rejects(inspectBindings({...f.request, candidateModel: 'FABRICATED unauthorized field'}), /VALIDATION_REQUEST_INVALID/);
});

test('a correctly hashed approval for another reading or a detached native candidate still fails admission', async t => {
  const f = await fixture(t), approval = f.request.artifacts.find(a => a.role === 'approval');
  await f.save(approval.path, {label: 'FABRICATED WRONG READING APPROVAL', readingId: 'FABRICATED-OTHER', status: 'approved'});
  approval.sha256 = sha256(await readFile(approval.path));
  await assert.rejects(inspectBindings(f.request), /APPROVAL_READING_BINDING_INVALID/);
  await f.save(approval.path, {label: 'FABRICATED NATIVE APPROVAL', schema_version: 'mhc-evidence-approved/v2', reading_id: f.request.readingId,
    review: {status: 'approved'}, results: [{runtime: {label: 'FABRICATED UNATTACHED RUNTIME'}}]});
  approval.sha256 = sha256(await readFile(approval.path));
  await assert.rejects(inspectBindings(f.request), /APPROVED_HENRY_ATTACHMENT_CHANGED/);
});
