import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const primary = 'backfill-daily-bible-reader-henry';
const schedule = 'FREQ=DAILY;BYHOUR=1,4;BYMINUTE=5;BYSECOND=0';
const eastern = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function civilTime(timestamp) {
  const { year, month, day, hour, minute } = Object.fromEntries(
    eastern.formatToParts(timestamp).map(({ type, value }) => [type, value])
  );
  return { date: `${year}-${month}-${day}`, minutes: Number(hour) * 60 + Number(minute) };
}

export function checkPrimarySlot({ now, definition, runs, gate, hasLaunchEvidence }) {
  const { date, minutes } = civilTime(now);
  const slot = [65, 245].find(start => minutes >= start + 40 && minutes < start + 75);
  if (slot === undefined) return 'outside_fallback_wake';
  if (definition?.status !== 'ACTIVE' || definition.rrule !== schedule || gate !== 'verified') {
    return 'primary_gate_unverified';
  }
  const inSlot = timestamp => {
    if (!Number.isSafeInteger(timestamp)) return false;
    const local = civilTime(timestamp);
    return local.date === date && local.minutes >= slot && local.minutes < slot + 40;
  };
  const { last_run_at: last, next_run_at: next } = definition;
  if (!Number.isSafeInteger(last) || last > now || !Number.isSafeInteger(next) || next <= now || inSlot(next)) {
    return 'primary_launch_not_excluded';
  }
  const claimed = runs.filter(({ created_at: at }) => {
    const local = civilTime(at);
    return local.date === date && local.minutes >= slot;
  });
  const lastLocal = civilTime(last);
  if (claimed.length === 0 && (lastLocal.date !== date || lastLocal.minutes < slot)) {
    return 'primary_slot_missed';
  }
  if (claimed.length === 1 && inSlot(last) && inSlot(claimed[0].created_at) &&
      claimed[0].status === 'IN_PROGRESS' && !hasLaunchEvidence(claimed[0].thread_id, date)) {
    return 'primary_dispatch_unlaunched';
  }
  return 'primary_launch_not_excluded';
}

function inspectPrimarySlot(now) {
  const root = path.join(homedir(), '.codex');
  const open = file => new DatabaseSync(path.join(root, file), { readOnly: true });
  const scheduler = open('sqlite/codex-dev.db');
  try {
    const definition = scheduler.prepare('SELECT status, rrule, last_run_at, next_run_at FROM automations WHERE id = ?').get(primary);
    const runs = scheduler.prepare('SELECT thread_id, status, created_at FROM automation_runs WHERE automation_id = ? AND created_at >= ?')
      .all(primary, now - 8 * 60 * 60 * 1000);
    const memory = readFileSync(path.join(root, 'automations', primary, 'memory.md'), 'utf8');
    const gates = [...memory.matchAll(/^HENRY_AUTHOR_GATE (\S+) (activation_pending|approval_denied|verified)\r?$/gm)]
      .map(([, at, state]) => ({ at: Date.parse(at), state }))
      .filter(({ at }) => Number.isFinite(at) && at <= now).sort((a, b) => a.at - b.at);
    return checkPrimarySlot({ now, definition, runs, gate: gates.at(-1)?.state, hasLaunchEvidence(id, date) {
      if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/.test(id)) return true;
      const threads = open('state_5.sqlite');
      try {
        if (threads.prepare('SELECT 1 FROM threads WHERE id = ?').get(id)) return true;
      } finally { threads.close(); }
      const queue = open('queue_1.sqlite');
      try {
        if (queue.prepare('SELECT 1 FROM queued_items WHERE thread_id = ?').get(id)) return true;
      } finally { queue.close(); }
      const day = path.join(root, 'sessions', ...date.split('-'));
      return [day, path.join(root, 'archived_sessions')].some(folder => {
        try { return readdirSync(folder).some(name => name.endsWith(`-${id}.jsonl`)); }
        catch (error) { if (error.code !== 'ENOENT') throw error; return false; }
      });
    } });
  } finally { scheduler.close(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    console.log(JSON.stringify({ state: inspectPrimarySlot(Date.now()) }));
  } catch (error) {
    console.log(JSON.stringify({ state: 'primary_evidence_unavailable', code: error.code ?? error.name }));
    process.exitCode = 1;
  }
}
