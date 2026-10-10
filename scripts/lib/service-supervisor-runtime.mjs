import {mkdir, readFile, lstat, readdir} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {assertCanonicalPath} from './mhc-native-paths.mjs';
import {assertSchemaValid} from './schema-validator.mjs';
import {loadJob} from './mhc-v2-store.mjs';
import {openJournal, digest, jsonBytes, confined, readPrivate, durableWrite, fault, processAbsent} from './service-supervisor-store.mjs';
import {LANES, automationDefinition} from './service-supervisor-policy.mjs';

const scopes = ['scripts', 'schemas', 'prompts', 'fixtures', 'config', 'app', 'docs', '.agents', 'package.json', 'package-lock.json', 'web'];
const allowed = name => /^(scripts|schemas|prompts|fixtures|config|app|docs|\.agents|web)\/[A-Za-z0-9._/-]+$/.test(name) || ['package.json', 'package-lock.json'].includes(name);
function git(root, args, input) {
  const result = spawnSync('git', args, {cwd: root, input, windowsHide: true, maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) throw fault('SUPERVISOR_COMMITTED_SOURCE_UNAVAILABLE');
  return result.stdout;
}
// One batch process preserves exact binary committed blobs and avoids hundreds
// of Windows Git launches. Never copy mutable source or executable tree entries.
export function committedFiles(sourceRoot, revision) {
  if (!/^[a-f0-9]{40}$/.test(revision) || git(sourceRoot, ['rev-parse', 'HEAD']).toString().trim() !== revision ||
      git(sourceRoot, ['status', '--porcelain', '--untracked-files=all', '--', ...scopes]).toString().trim()) throw fault('SUPERVISOR_SOURCE_NOT_CLEAN_COMMIT');
  const entries = git(sourceRoot, ['ls-tree', '-rz', revision, '--', ...scopes]).toString().split('\0').filter(Boolean).map(line => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
    if (!match || !allowed(match[3]) || match[3].split('/').some(p => !p || p === '..')) throw fault('SUPERVISOR_SOURCE_PATH_INVALID');
    return {path: match[3], object: match[2]};
  });
  const output = git(sourceRoot, ['cat-file', '--batch'], Buffer.from(entries.map(v => v.object).join('\n') + '\n'));
  let offset = 0;
  for (const entry of entries) {
    const end = output.indexOf(10, offset), header = output.subarray(offset, end).toString();
    const match = /^([a-f0-9]{40}) blob ([0-9]+)$/.exec(header);
    if (end < offset || !match || match[1] !== entry.object) throw fault('SUPERVISOR_SOURCE_BLOB_INVALID');
    const size = Number(match[2]); offset = end + 1;
    if (!Number.isSafeInteger(size) || output.length < offset + size + 1 || output[offset + size] !== 10) throw fault('SUPERVISOR_SOURCE_BLOB_INVALID');
    entry.bytes = Buffer.from(output.subarray(offset, offset + size)); offset += size + 1;
  }
  if (offset !== output.length) throw fault('SUPERVISOR_SOURCE_BLOB_INVALID');
  return entries;
}
export async function captureInventory(mapping) {
  if (!Array.isArray(mapping) || mapping.length !== 4 || new Set(mapping.map(v => v.lane)).size !== 4 ||
      new Set(mapping.map(v => v.file)).size !== 4 || mapping.some(v => !LANES.includes(v.lane) || !path.isAbsolute(v.file))) throw fault('SUPERVISOR_AUTOMATION_INVENTORY_INVALID');
  const inventory = [];
  for (const value of mapping) {
    await assertCanonicalPath(path.dirname(value.file), value.file);
    const definition = automationDefinition(await readFile(value.file, 'utf8'));
    inventory.push({lane: value.lane, file: value.file, ...definition});
  }
  return inventory;
}
export async function assertNoWriters(projectRoot, stateRoot, {now = new Date(), absent = processAbsent} = {}) {
  const journal = await openJournal(stateRoot, {absent}), events = await journal.load(), latest = new Map();
  for (const event of events) if (['lease_acquired', 'lease_released'].includes(event.kind)) latest.set(event.data.resource, event);
  const publications=new Map();
  for (const event of events) if(event.kind==='publication_state')publications.set(event.data.transaction.id,event.data.transaction);
  if([...publications.values()].some(t=>!['complete','blocked'].includes(t.phase)))throw fault('SUPERVISOR_INSTALL_PUBLICATION_PENDING');
  const children=new Map();for(const event of events)if(event.kind==='execution_state')children.set(event.data.execution.id,event.data.execution);
  if([...children.values()].some(e=>['reserved','uncertain'].includes(e.phase)))throw fault('SUPERVISOR_INSTALL_CHILD_PENDING');
  if ([...latest.values()].some(e => e.kind === 'lease_acquired' && !absent(e.data.pid))) throw fault('SUPERVISOR_INSTALL_WRITER_ACTIVE');
  const jobRoot = await confined(projectRoot, 'private-content/automation/mhc-v2');
  for (const name of await readdir(jobRoot).catch(e => {if (e.code === 'ENOENT') return []; throw e;})) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(name)) throw fault('SUPERVISOR_JOB_INVALID');
    const job = await loadJob(await confined(jobRoot, name, false));
    if (job.state.phase === 'generating' && Date.parse(job.state.session?.deadline_at) > new Date(now).getTime()) throw fault('SUPERVISOR_INSTALL_WRITER_ACTIVE');
  }
  const legacy = await confined(projectRoot, 'private-content/automation/mhc-native-work-items/ledger');
  for (const name of await readdir(legacy).catch(e => {if (e.code === 'ENOENT') return []; throw e;})) {
    const value = await readPrivate(legacy, name), latestEvents = new Map();
    if (!Array.isArray(value.events)) throw fault('SUPERVISOR_LEGACY_LEDGER_INVALID');
    for (const event of value.events) latestEvents.set(event.work_item_id, event);
    if ([...latestEvents.values()].some(e => e.outcome === 'leased')) throw fault('SUPERVISOR_INSTALL_WRITER_ACTIVE');
  }
}
export async function installRuntime({projectRoot, sourceRevision, files, inventory, stage='A', publicationResources, publicationInputRoot, children, henryRuntime, now = new Date()}) {
  projectRoot = path.resolve(projectRoot);
  await assertCanonicalPath(projectRoot, projectRoot);
  for (const name of ['private-content', 'private-commentary', 'research/raw', 'research/working']) {
    const target = await confined(projectRoot, name, false);
    if (!(await lstat(target)).isDirectory()) throw fault('SUPERVISOR_PRIVATE_STORE_INVALID');
  }
  if (!/^[a-f0-9]{40}$/.test(sourceRevision) || new Set(files.map(v => v.path)).size !== files.length || files.some(v => !allowed(v.path) || !Buffer.isBuffer(v.bytes))) throw fault('SUPERVISOR_SOURCE_BLOB_INVALID');
  for (const name of ['scripts/service-supervisor.mjs', 'scripts/service-supervisor-launcher.mjs',
    'schemas/service-supervisor-config.schema.json', 'scripts/lib/preparation-status.mjs']) {
    if (!files.some(v => v.path === name)) throw fault('SUPERVISOR_RELEASE_DEPENDENCY_MISSING');
  }
  const runtimeRoot = await confined(projectRoot, 'private-content/automation/service-supervisor/runtime');
  const stateRoot = await confined(projectRoot, 'private-content/automation/service-supervisor/state');
  await mkdir(runtimeRoot, {recursive: true, mode: 0o700});
  await assertNoWriters(projectRoot, stateRoot, {now});
  const journal = await openJournal(stateRoot), lease = await journal.acquire('installation', {now, durationMs: 10 * 60 * 1000});
  try {
    if (!['A','B','C','D'].includes(stage) || ['B','C','D'].includes(stage) && (!publicationResources || !['text/plain','application/json'].includes(publicationResources.manifest?.mimeType) ||
      publicationResources.folder?.mimeType!=='application/vnd.google-apps.folder') || stage==='A' && publicationResources) throw fault('SUPERVISOR_INSTALL_ARGUMENTS_INVALID');
    if(publicationInputRoot) {
      if(!['B','C','D'].includes(stage)||!path.isAbsolute(publicationInputRoot))throw fault('SUPERVISOR_PUBLICATION_INPUT_ROOT_INVALID');
      publicationInputRoot=path.resolve(publicationInputRoot);await assertCanonicalPath(publicationInputRoot,publicationInputRoot);
      for(const relative of ['private-content','research/working'])await confined(publicationInputRoot,relative,false);
    }
    if (['B','C','D'].includes(stage)) for(const name of ['scripts/lib/service-supervisor-publication.mjs','scripts/lib/service-supervisor-publication-gates.mjs','scripts/lib/service-supervisor-connector.mjs','scripts/lib/service-supervisor-scope.mjs','scripts/lib/service-supervisor-approval.mjs',
      'schemas/service-supervisor-editorial-approval.schema.json']) if(!files.some(v=>v.path===name)) throw fault('SUPERVISOR_RELEASE_DEPENDENCY_MISSING');
    if(['C','D'].includes(stage)) {
      if(!children||!henryRuntime||publicationInputRoot&&publicationInputRoot!==projectRoot)throw fault('SUPERVISOR_CHILD_CONFIGURATION_INVALID');
      if(inventory.some(a=>a.status!==(['daily','review'].includes(a.lane)||stage==='C'?'ACTIVE':'PAUSED')))
        throw fault('SUPERVISOR_AUTOMATION_DRIFT');
      for(const name of ['exec','contracts','daily','henry','source-fetch','work','compatibility'])
        if(!files.some(v=>v.path===`scripts/lib/service-supervisor-${name}.mjs`))throw fault('SUPERVISOR_RELEASE_DEPENDENCY_MISSING');
    } else if(children||henryRuntime)throw fault('SUPERVISOR_CHILD_CONFIGURATION_INVALID');
    const config = {schemaVersion: 'service-supervisor-config/v1', stage, sourceRevision, projectRoot, runtimeRoot, automations: inventory,
      ...(publicationResources?{publicationResources}:{}),...(publicationInputRoot?{publicationInputRoot}:{}),
      ...(['C','D'].includes(stage)?{children,henryRuntime,maxReadingsPerWake:stage==='C'?1:3}:{})};
    assertSchemaValid(config, JSON.parse(files.find(v => v.path === 'schemas/service-supervisor-config.schema.json').bytes), {label: 'Supervisor install config'});
    const configBytes = jsonBytes(config), configSha256 = digest(configBytes);
    const manifest = {schemaVersion: 'service-supervisor-release/v1', sourceRevision,
      files: files.map(v => ({path: v.path, sha256: digest(v.bytes), bytes: v.bytes.length}))};
    const manifestBytes = jsonBytes(manifest), manifestSha256 = digest(manifestBytes), release = `${sourceRevision}-${manifestSha256.slice(0, 16)}`;
    const prior = await readFile(path.join(runtimeRoot, 'current.json')).catch(e => {if (e.code === 'ENOENT') return null; throw e;});
    for (const file of files) await durableWrite(runtimeRoot, `releases/${release}/${file.path}`, file.bytes);
    await durableWrite(runtimeRoot, `releases/${release}/manifest.json`, manifestBytes);
    await durableWrite(runtimeRoot, `config-${configSha256}.json`, configBytes);
    if(['C','D'].includes(stage)) {
      const releaseRoot=await confined(runtimeRoot,`releases/${release}`,false),ctx={projectRoot,stateRoot,runtimeRoot,releaseRoot,config};
      const [executor,henry]=await Promise.all(['exec','henry'].map(name=>import(pathToFileURL(path.join(releaseRoot,`scripts/lib/service-supervisor-${name}.mjs`)).href)));
      // Read-only CLI login/version/isolation checks and immutable native pin
      // verification. This never runs an availability/model probe.
      await executor.verifyChildTransport(ctx);await henry.verifiedHenryContext(ctx);
      await journal.append('installation_capabilities_verified',{sourceRevision,executableSha256:children.executableSha256,
        henrySourceRevision:henryRuntime.sourceRevision,henryManifestSha256:henryRuntime.manifestSha256},now,lease);
    }
    await durableWrite(runtimeRoot, 'launcher.mjs', files.find(v => v.path === 'scripts/service-supervisor-launcher.mjs').bytes, {immutable: false});
    const pointer = {schemaVersion: 'service-supervisor-pointer/v1', sourceRevision, release, manifestSha256, configSha256};
    await journal.append('installation_prepared', {sourceRevision, release, configSha256, previousPointerSha256: prior ? digest(prior) : null}, now, lease);
    if (prior) await durableWrite(runtimeRoot, `pointer-history/${digest(prior)}.json`, prior);
    await durableWrite(runtimeRoot, 'current.json', jsonBytes(pointer), {immutable: false});
    await journal.append('installation_activated', {sourceRevision, release, manifestSha256, configSha256}, now, lease);
    return {action: 'installed', stage, sourceRevision, manifestSha256, configSha256, launcher: path.join(runtimeRoot, 'launcher.mjs')};
  } finally {await journal.release(lease, now);}
}
export async function verifyRuntime(runtimeRoot, launcherBytes, pointerBytes = null) {
  const pointer = pointerBytes ? JSON.parse(pointerBytes) : await readPrivate(runtimeRoot, 'current.json');
  if (pointer.schemaVersion !== 'service-supervisor-pointer/v1' || !/^[a-f0-9]{40}-[a-f0-9]{16}$/.test(pointer.release) ||
      !/^[a-f0-9]{40}$/.test(pointer.sourceRevision) || !/^[a-f0-9]{64}$/.test(pointer.configSha256) ||
      !/^[a-f0-9]{64}$/.test(pointer.manifestSha256)) throw fault('SUPERVISOR_POINTER_INVALID');
  const releaseRoot = await confined(runtimeRoot, `releases/${pointer.release}`, false);
  const manifestBytes = await readFile(await confined(releaseRoot, 'manifest.json', false));
  const configPath = await confined(runtimeRoot, `config-${pointer.configSha256}.json`, false), configBytes = await readFile(configPath);
  if (digest(manifestBytes) !== pointer.manifestSha256 || digest(configBytes) !== pointer.configSha256) throw fault('SUPERVISOR_POINTER_HASH_INVALID');
  const manifest = JSON.parse(manifestBytes), config = JSON.parse(configBytes);
  if (manifest.schemaVersion !== 'service-supervisor-release/v1' || config.sourceRevision !== pointer.sourceRevision ||
      manifest.sourceRevision !== pointer.sourceRevision || config.runtimeRoot !== runtimeRoot ||
      !Array.isArray(manifest.files) || new Set(manifest.files.map(v => v.path)).size !== manifest.files.length) throw fault('SUPERVISOR_RELEASE_INVALID');
  for (const entry of manifest.files) {
    if (!allowed(entry.path) || entry.path.split('/').some(p => !p || p === '..') || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw fault('SUPERVISOR_RELEASE_INVALID');
    const file = await confined(releaseRoot, entry.path, false), stat = await lstat(file), bytes = await readFile(file);
    if (!stat.isFile() || bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) throw fault('SUPERVISOR_RELEASE_HASH_INVALID');
  }
  const launcher = manifest.files.find(v => v.path === 'scripts/service-supervisor-launcher.mjs');
  if (!launcher || digest(launcherBytes) !== launcher.sha256) throw fault('SUPERVISOR_LAUNCHER_HASH_INVALID');
  return {config, configPath, releaseRoot, pointer};
}
