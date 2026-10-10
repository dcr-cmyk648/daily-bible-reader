#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {realpath} from 'node:fs/promises';
import {committedFiles, captureInventory, installRuntime} from './lib/service-supervisor-runtime.mjs';
import {fault} from './lib/service-supervisor-store.mjs';
import {safeCode} from './lib/service-supervisor-policy.mjs';

async function main() {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--project-root', '--revision', '--inventory'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw fault('SUPERVISOR_INSTALL_ARGUMENTS_INVALID');
    options[args[i]] = args[i + 1];
  }
  if (Object.keys(options).length !== 3) throw fault('SUPERVISOR_INSTALL_ARGUMENTS_INVALID');
  const sourceRoot = await realpath(process.cwd()), sourceRevision = options['--revision'];
  const files = committedFiles(sourceRoot, sourceRevision);
  const inventory = await captureInventory(JSON.parse(await readFile(options['--inventory'], 'utf8')));
  const result = await installRuntime({projectRoot: await realpath(options['--project-root']), sourceRevision, files, inventory});
  process.stdout.write(JSON.stringify(result) + '\n');
}
main().catch(e => {process.stdout.write(JSON.stringify({code: safeCode(e.code), outcome: 'blocked', installed: false}) + '\n'); process.exitCode = 1;});
