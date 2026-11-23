import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const day = 24 * 60 * 60 * 1000;
const authors = [
  ['primary author', 'backfill-daily-bible-reader-henry'],
  ['Luna fallback', 'backfill-daily-bible-reader-henry-luna-fallback']
];
const marker = /^HENRY_AUTHOR_GATE (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z) (activation_pending|approval_denied|verified)\r?$/gm;

export function overdueAuthorGate(memory, now) {
  const events = [...memory.matchAll(marker)]
    .map(([, stamp, state]) => ({ at: Date.parse(stamp), state }))
    .filter(({ at }) => Number.isFinite(at) && at <= now)
    .sort((a, b) => a.at - b.at);

  let since = null;
  for (const { at, state } of events) {
    if (state === 'verified') since = null;
    else since ??= at;
  }
  if (since === null || now - since <= day) return null;
  return { since: new Date(since).toISOString(), reason: events.at(-1).state };
}

async function main() {
  const now = Date.now();
  const automationRoot = path.join(homedir(), '.codex', 'automations');
  for (const [label, id] of authors) {
    let memory;
    try {
      memory = await readFile(path.join(automationRoot, id, 'memory.md'), 'utf8');
    } catch (error) {
      console.error(`STATUS FOR USER: Henry ${label} gate history could not be read (${error.code}).`);
      process.exitCode = 1;
      continue;
    }
    const gate = overdueAuthorGate(memory, now);
    if (gate) {
      console.log(`STATUS FOR USER: Henry ${label} has been deferred at the manager gate since ${gate.since} (${gate.reason}).`);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
