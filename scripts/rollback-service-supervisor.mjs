#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {assertNoWriters, verifyRuntime} from './lib/service-supervisor-runtime.mjs';
import {readPrivate, confined, durableWrite, digest, jsonBytes, openJournal, fault} from './lib/service-supervisor-store.mjs';
import {safeCode} from './lib/service-supervisor-policy.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--project-root' || args[2] !== '--pointer-sha256' || !/^[a-f0-9]{64}$/.test(args[3])) throw fault('SUPERVISOR_ROLLBACK_ARGUMENTS_INVALID');
  const projectRoot = path.resolve(args[1]), runtimeRoot = await confined(projectRoot, 'private-content/automation/service-supervisor/runtime', false);
  const stateRoot = await confined(projectRoot, 'private-content/automation/service-supervisor/state', false);
  await assertNoWriters(projectRoot, stateRoot);
  const journal = await openJournal(stateRoot), lease = await journal.acquire('installation', {durationMs: 10 * 60 * 1000});
  try {
    const saved = await readFile(await confined(runtimeRoot, `pointer-history/${args[3]}.json`, false));
    if (digest(saved) !== args[3]) throw fault('SUPERVISOR_ROLLBACK_HASH_INVALID');
    const pointer = JSON.parse(saved);
    if (!/^[a-f0-9]{40}-[a-f0-9]{16}$/.test(pointer.release)) throw fault('SUPERVISOR_POINTER_INVALID');
    const launcher = await readFile(await confined(runtimeRoot, `releases/${pointer.release}/scripts/service-supervisor-launcher.mjs`, false));
    // Validate the retained target without exposing it as current before proof.
    await verifyRuntime(runtimeRoot, launcher, saved);
    const current = await readFile(await confined(runtimeRoot, 'current.json', false));
    const config = await readPrivate(runtimeRoot, `config-${pointer.configSha256}.json`);
    const manifestBytes = await readFile(await confined(runtimeRoot, `releases/${pointer.release}/manifest.json`, false));
    if (digest(manifestBytes) !== pointer.manifestSha256 || digest(jsonBytes(config)) !== pointer.configSha256 || config.stage !== 'A') throw fault('SUPERVISOR_ROLLBACK_HASH_INVALID');
    const manifest = JSON.parse(manifestBytes);
    for (const entry of manifest.files) {
      if (digest(await readFile(await confined(runtimeRoot, `releases/${pointer.release}/${entry.path}`, false))) !== entry.sha256) throw fault('SUPERVISOR_ROLLBACK_HASH_INVALID');
    }
    await durableWrite(runtimeRoot, `pointer-history/${digest(current)}.json`, current);
    await journal.append('rollback_prepared', {targetPointerSha256: args[3], priorPointerSha256: digest(current)}, new Date(), lease);
    await durableWrite(runtimeRoot, 'launcher.mjs', launcher, {immutable: false});
    await durableWrite(runtimeRoot, 'current.json', saved, {immutable: false});
    await verifyRuntime(runtimeRoot, launcher);
    await journal.append('rollback_activated', {targetPointerSha256: args[3]}, new Date(), lease);
    process.stdout.write(JSON.stringify({action: 'rolled_back', stage: 'A', sourceRevision: config.sourceRevision, automationsChanged: false}) + '\n');
  } finally {await journal.release(lease);}
}
main().catch(e => {process.stdout.write(JSON.stringify({code: safeCode(e.code), outcome: 'blocked', rolledBack: false}) + '\n'); process.exitCode = 1;});
