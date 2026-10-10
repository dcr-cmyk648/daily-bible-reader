#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {supervisorContext, runSupervisor, supervisorStatus} from './lib/service-supervisor.mjs';
import {safeCode} from './lib/service-supervisor-policy.mjs';
import {fault} from './lib/service-supervisor-store.mjs';

async function main() {
  const args = process.argv.slice(2), command = args.shift();
  let role;
  if (command === 'tick' && args.length === 2 && args[0] === '--role') role = args[1];
  else if (command !== 'status' || args.length) throw fault('SUPERVISOR_ARGUMENTS_INVALID');
  const configPath = process.env.BIBLEAPP_SUPERVISOR_CONFIG, releaseRoot = process.env.BIBLEAPP_SUPERVISOR_RELEASE;
  if (!configPath || !releaseRoot || !path.isAbsolute(configPath) || !path.isAbsolute(releaseRoot)) throw fault('SUPERVISOR_INSTALLED_LAUNCHER_REQUIRED');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const ctx = await supervisorContext(config, releaseRoot);
  const result = command === 'status' ? await supervisorStatus(ctx) : await runSupervisor(ctx, {role});
  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.outcome === 'blocked') process.exitCode = 1;
}
main().catch(e => {process.stdout.write(JSON.stringify({schemaVersion: 'service-supervisor-error/v1', code: safeCode(e.code),
  outcome: 'blocked', published: false}) + '\n'); process.exitCode = 1;});
