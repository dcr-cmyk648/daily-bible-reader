import {createHash, randomBytes} from 'node:crypto';
import {mkdir, open, readFile, readdir, rename, unlink, link} from 'node:fs/promises';
import path from 'node:path';
import {assertCanonicalPath} from './mhc-native-paths.mjs';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
export const fault = code => Object.assign(new Error(code), {code});
const nonce = () => randomBytes(16).toString('hex');
export async function confined(root, relative, missing = true) {
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw fault('SUPERVISOR_PATH_INVALID');
  return assertCanonicalPath(root, path.join(root, relative), {allowMissing: missing});
}
export async function readPrivate(root, relative) {
  return JSON.parse(await readFile(await confined(root, relative, false), 'utf8'));
}
export async function durableWrite(root, relative, bytes, {immutable = true} = {}) {
  const file = await confined(root, relative);
  await mkdir(path.dirname(file), {recursive: true, mode: 0o700});
  await confined(root, relative);
  if (immutable) {
    const prior = await readFile(file).catch(e => {if (e.code === 'ENOENT') return null; throw e;});
    if (prior) {if (!prior.equals(bytes)) throw fault('SUPERVISOR_IMMUTABLE_CHANGED'); return file;}
  }
  const temporary = `${file}.tmp-${nonce()}`;
  const handle = await open(temporary, 'wx', 0o600);
  try {await handle.writeFile(bytes); await handle.sync();} finally {await handle.close();}
  if (immutable) {
    try {await link(temporary, file);} catch (e) {
      if (e.code !== 'EEXIST' || !(await readFile(file)).equals(bytes)) throw fault('SUPERVISOR_IMMUTABLE_CHANGED');
    } finally {await unlink(temporary);}
  } else await rename(temporary, file);
  return file;
}
export function processAbsent(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {process.kill(pid, 0); return false;} catch (e) {return e.code === 'ESRCH';}
}
// A dead process is required before reclaiming an abandoned operation lock. A
// living/reused/unknown PID is conservative: never delete someone else's lock.
async function mutex(root, callback, absent) {
  const file = await confined(root, 'journal.lock');
  const owner = {pid: process.pid, token: nonce()};
  let handle;
  for (let attempt = 0; attempt < 100 && !handle; attempt++) {
    try {handle = await open(file, 'wx', 0o600);} catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let old;
      try {old = await readPrivate(root, 'journal.lock');} catch {
        await new Promise(resolve => setTimeout(resolve, 20)); continue;
      }
      if (!absent(old.pid)) {await new Promise(resolve => setTimeout(resolve, 20)); continue;}
      // A recovery lock prevents two reclaimers deleting a newer owner's lock.
      const recovery = await confined(root, 'journal-recovery.lock');
      let claim;
      try {claim = await open(recovery, 'wx', 0o600);} catch {await new Promise(resolve => setTimeout(resolve, 20)); continue;}
      try {
        const current = await readPrivate(root, 'journal.lock').catch(e => {if (e.code === 'ENOENT') return null; throw e;});
        if (!current || current.token !== old.token || !absent(current.pid)) continue;
        await unlink(file); handle = await open(file, 'wx', 0o600);
      } finally {await claim.close(); await unlink(recovery);}
    }
  }
  if (!handle) throw fault('SUPERVISOR_JOURNAL_BUSY');
  try {
    await handle.writeFile(jsonBytes(owner)); await handle.sync();
    return await callback();
  } finally {
    await handle.close();
    const current = await readPrivate(root, 'journal.lock');
    if (current.token !== owner.token) throw fault('SUPERVISOR_LOCK_CHANGED');
    await unlink(file);
  }
}
export async function openJournal(root, {absent = processAbsent} = {}) {
  root = path.resolve(root);
  await assertCanonicalPath(root, root, {allowMissing: true});
  await mkdir(root, {recursive: true, mode: 0o700});
  const eventsRoot = await confined(root, 'events');
  await mkdir(eventsRoot, {recursive: true, mode: 0o700});
  async function load() {
    const names = await readdir(eventsRoot);
    if (names.some(n => !/^\d{9}\.json(?:\.tmp-[a-f0-9]{32})?$/.test(n))) throw fault('SUPERVISOR_EVENT_FILE_INVALID');
    const files = names.filter(n => /^\d{9}\.json$/.test(n)).sort();
    let previous = '0'.repeat(64);
    const events = [];
    for (const [index, name] of files.entries()) {
      const event = await readPrivate(root, `events/${name}`), {sha256, ...basis} = event;
      if (name !== `${String(index + 1).padStart(9, '0')}.json` || basis.schemaVersion !== 'service-supervisor-event/v1' ||
          basis.sequence !== index + 1 || basis.previous !== previous || digest(jsonBytes(basis)) !== sha256 ||
          !/^[a-z][a-z_]{1,63}$/.test(basis.kind) || !Number.isFinite(Date.parse(basis.at)) ||
          !basis.data || typeof basis.data !== 'object' || Array.isArray(basis.data)) throw fault('SUPERVISOR_EVENT_INVALID');
      events.push(event); previous = sha256;
    }
    return events;
  }
  async function appendUnlocked(events, kind, data, now) {
    if (!/^[a-z][a-z_]{1,63}$/.test(kind) || !data || Array.isArray(data)) throw fault('SUPERVISOR_EVENT_INVALID');
    const body = {schemaVersion: 'service-supervisor-event/v1', sequence: events.length + 1,
      previous: events.at(-1)?.sha256 || '0'.repeat(64), kind, at: new Date(now).toISOString(), data};
    const event = {...body, sha256: digest(jsonBytes(body))};
    await durableWrite(root, `events/${String(body.sequence).padStart(9, '0')}.json`, jsonBytes(event));
    return event;
  }
  const lastLease = (events, resource) => events.findLast(e => e.data.resource === resource && ['lease_acquired', 'lease_released'].includes(e.kind));
  function assertCurrent(events, lease, now) {
    const last = lastLease(events, lease.resource);
    if (!last || last.kind !== 'lease_acquired' || last.data.token !== lease.token || last.data.epoch !== lease.epoch ||
        Date.parse(last.data.expiresAt) <= new Date(now).getTime()) throw fault('SUPERVISOR_LEASE_FENCED');
  }
  return {
    root, load,
    append: (kind, data, now = new Date(), lease = null) => mutex(root, async () => {
      const events = await load(); if (lease) assertCurrent(events, lease, now);
      return appendUnlocked(events, kind, data, now);
    }, absent),
    acquire: (resource, {now = new Date(), durationMs = 90 * 60 * 1000, runId = nonce()} = {}) => mutex(root, async () => {
      if (!['preparation', 'review-audit', 'publication', 'installation'].includes(resource) ||
          !Number.isSafeInteger(durationMs) || durationMs < 1000 || durationMs > 24 * 60 * 60 * 1000) throw fault('SUPERVISOR_LEASE_INVALID');
      const events = await load(), prior = lastLease(events, resource);
      const installation = lastLease(events, 'installation');
      if (resource !== 'installation' && installation?.kind === 'lease_acquired' && !absent(installation.data.pid)) throw fault('SUPERVISOR_INSTALL_WRITER_ACTIVE');
      if (resource === 'installation' && ['preparation', 'review-audit', 'publication'].some(name => {
        const active = lastLease(events, name); return active?.kind === 'lease_acquired' && !absent(active.data.pid);
      })) throw fault('SUPERVISOR_INSTALL_WRITER_ACTIVE');
      if (prior?.kind === 'lease_acquired' && !absent(prior.data.pid)) throw fault('SUPERVISOR_LEASE_BUSY');
      if (!/^[a-f0-9]{32}$/.test(runId)) throw fault('SUPERVISOR_LEASE_INVALID');
      const lease = {resource, runId, token: nonce(), pid: process.pid, epoch: (prior?.data.epoch || 0) + 1,
        expiresAt: new Date(new Date(now).getTime() + durationMs).toISOString()};
      await appendUnlocked(events, 'lease_acquired', lease, now); return lease;
    }, absent),
    release: (lease, now = new Date()) => mutex(root, async () => {
      const events = await load(); assertCurrent(events, lease, now);
      return appendUnlocked(events, 'lease_released', {resource: lease.resource, token: lease.token, epoch: lease.epoch}, now);
    }, absent),
    assertLease: async (lease, now = new Date()) => assertCurrent(await load(), lease, now)
  };
}
