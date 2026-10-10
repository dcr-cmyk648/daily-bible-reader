#!/usr/bin/env node
// Standalone bootstrap: verify every executed blob before importing release code.
import {readFile, realpath, lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = () => {throw new Error('SUPERVISOR_INSTALLED_VERIFICATION_FAILED');};
async function bytes(root, relative) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).some(p => p === '..' || !p)) fail();
  const file = path.join(root, relative), stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || await realpath(file) !== file) fail();
  return readFile(file);
}
async function main() {
  const ownFile = fileURLToPath(import.meta.url), runtimeRoot = path.dirname(ownFile);
  if (await realpath(runtimeRoot) !== runtimeRoot) fail();
  const pointer = JSON.parse(await bytes(runtimeRoot, 'current.json'));
  if (pointer.schemaVersion !== 'service-supervisor-pointer/v1' || !/^[a-f0-9]{40}-[a-f0-9]{16}$/.test(pointer.release) ||
      !/^[a-f0-9]{40}$/.test(pointer.sourceRevision) || !/^[a-f0-9]{64}$/.test(pointer.manifestSha256) || !/^[a-f0-9]{64}$/.test(pointer.configSha256)) fail();
  const releaseRoot = path.join(runtimeRoot, 'releases', pointer.release);
  const manifestBytes = await bytes(releaseRoot, 'manifest.json'), configBytes = await bytes(runtimeRoot, `config-${pointer.configSha256}.json`);
  if (sha(manifestBytes) !== pointer.manifestSha256 || sha(configBytes) !== pointer.configSha256) fail();
  const manifest = JSON.parse(manifestBytes), config = JSON.parse(configBytes), seen = new Set();
  if (manifest.schemaVersion !== 'service-supervisor-release/v1' || manifest.sourceRevision !== pointer.sourceRevision ||
      config.sourceRevision !== pointer.sourceRevision || config.runtimeRoot !== runtimeRoot || !Array.isArray(manifest.files)) fail();
  for (const entry of manifest.files) {
    if (!/^(scripts|schemas|prompts|fixtures|config|app|docs|\.agents|web)\/[A-Za-z0-9._/-]+$/.test(entry.path) && !['package.json', 'package-lock.json'].includes(entry.path)) fail();
    if (seen.has(entry.path)) fail(); seen.add(entry.path);
    const value = await bytes(releaseRoot, entry.path);
    if (value.length !== entry.bytes || sha(value) !== entry.sha256) fail();
  }
  const launcher = manifest.files.find(v => v.path === 'scripts/service-supervisor-launcher.mjs');
  if (!launcher || sha(await bytes(runtimeRoot, path.basename(ownFile))) !== launcher.sha256 || !seen.has('scripts/service-supervisor.mjs')) fail();
  process.env.BIBLEAPP_SUPERVISOR_CONFIG = path.join(runtimeRoot, `config-${pointer.configSha256}.json`);
  process.env.BIBLEAPP_SUPERVISOR_RELEASE = releaseRoot;
  await import(pathToFileURL(path.join(releaseRoot, 'scripts/service-supervisor.mjs')).href);
}
main().catch(() => {process.stdout.write(JSON.stringify({code: 'SUPERVISOR_INSTALLED_VERIFICATION_FAILED', outcome: 'blocked', published: false}) + '\n'); process.exitCode = 1;});
