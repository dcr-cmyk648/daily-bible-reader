#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {realpath} from 'node:fs/promises';
import {committedFiles, captureInventory, installRuntime} from './lib/service-supervisor-runtime.mjs';
import {fault} from './lib/service-supervisor-store.mjs';
import {safeCode} from './lib/service-supervisor-policy.mjs';

async function main() {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--project-root', '--revision', '--inventory', '--stage', '--resources','--publication-input-root','--children','--henry-runtime'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw fault('SUPERVISOR_INSTALL_ARGUMENTS_INVALID');
    options[args[i]] = args[i + 1];
  }
  if (!['--project-root','--revision','--inventory'].every(k=>options[k]) ||
    options['--resources']&&!['B','C','D'].includes(options['--stage']) || ['B','C','D'].includes(options['--stage'])&&!options['--resources']) throw fault('SUPERVISOR_INSTALL_ARGUMENTS_INVALID');
  const sourceRoot = await realpath(process.cwd()), sourceRevision = options['--revision'];
  const files = committedFiles(sourceRoot, sourceRevision);
  const inventory = await captureInventory(JSON.parse(await readFile(options['--inventory'], 'utf8')));
  const publicationResources=options['--resources']?JSON.parse(await readFile(options['--resources'],'utf8')):undefined;
  const result = await installRuntime({projectRoot: await realpath(options['--project-root']), sourceRevision, files, inventory,
    stage:options['--stage']||'A',publicationResources,publicationInputRoot:options['--publication-input-root'],
    children:options['--children']?JSON.parse(await readFile(options['--children'],'utf8')):undefined,
    henryRuntime:options['--henry-runtime']?JSON.parse(await readFile(options['--henry-runtime'],'utf8')):undefined});
  process.stdout.write(JSON.stringify(result) + '\n');
}
main().catch(e => {process.stdout.write(JSON.stringify({code: safeCode(e.code), outcome: 'blocked', installed: false}) + '\n'); process.exitCode = 1;});
