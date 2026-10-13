#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {startValidation, runValidation, validationStatus, verifyHelper, fingerprintWorkspace, fingerprintTree, sha256} from './lib/publication-validation.mjs';

const helperRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--request', '--request-sha256', '--runs-root', '--run', '--token', '--helper-manifest', '--helper-sha256', '--workspace', '--tree'].includes(args[i]) || !args[i + 1] || result[args[i]]) throw Error('CLI_ARGUMENT_INVALID');
    result[args[i]] = args[i + 1];
  }
  return result;
}
async function main() {
  const [command, ...args] = process.argv.slice(2), opts = options(args);
  const helper = {helperRoot, helperManifest: opts['--helper-manifest'], helperSha256: opts['--helper-sha256']};
  let result;
  if (command === 'fingerprint') {
    result = opts['--tree'] ? {sha256: await fingerprintTree(opts['--tree'])} : {workspaceCodeSha256: await fingerprintWorkspace(opts['--workspace'])};
  } else if (command === 'start') {
    result = await startValidation({...helper, requestFile: opts['--request'], requestSha256: opts['--request-sha256'], runsRoot: opts['--runs-root']});
  } else if (command === 'status') {
    result = await validationStatus(opts['--run'], {...helper, requestSha256: opts['--request-sha256']});
    if (result.state === 'blocked') process.exitCode = 1;
    else if (result.state !== 'passed') process.exitCode = 2;
  } else if (command === 'worker') {
    await verifyHelper(helper);
    const context = JSON.parse(await readFile(path.join(opts['--run'], 'context.json'), 'utf8'));
    if (context.token !== opts['--token'] || context.helperSha256 !== helper.helperSha256 || context.helperRoot !== helperRoot) throw Error('WORKER_CONTEXT_CHANGED');
    result = await runValidation(opts['--run']);
    if (result.state !== 'passed') process.exitCode = 1;
  } else throw Error('Use start, status or fingerprint with explicit paths and SHA-256 pins.');
  process.stdout.write(JSON.stringify(result) + '\n');
}
main().catch(error => {process.stderr.write(`STATUS FOR USER: Offline validation launcher blocked (${/^[A-Z_]+$/.test(error.message) ? error.message : 'LAUNCHER_EXECUTION_FAILED'}); publication remains held.\n`); process.exitCode = 1;});
