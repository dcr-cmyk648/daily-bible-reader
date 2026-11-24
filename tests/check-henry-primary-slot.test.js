import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPrimarySlot } from '../scripts/check-henry-primary-slot.mjs';

const time = value => Date.parse(`2026-11-24T${value}Z`);
const definition = {
  status: 'ACTIVE', rrule: 'FREQ=DAILY;BYHOUR=1,4;BYMINUTE=5;BYSECOND=0',
  last_run_at: time('09:06:28'), next_run_at: Date.parse('2026-11-25T06:06:39Z')
};
const run = { thread_id: 'FABRICATED-SCHEDULER-THREAD', status: 'IN_PROGRESS', created_at: time('09:06:28') };
const check = (overrides = {}) => checkPrimarySlot({
  now: time('09:48:00'), definition, runs: [run], gate: 'verified', hasLaunchEvidence: () => false, ...overrides
});

test('a stranded scheduler row permits catch-up only without Codex launch evidence', () => {
  assert.equal(check(), 'primary_dispatch_unlaunched');
  assert.equal(check({ hasLaunchEvidence: () => true }), 'primary_launch_not_excluded');
  assert.equal(check({ runs: [{ ...run, status: 'PENDING_REVIEW' }] }), 'primary_launch_not_excluded');
  assert.equal(check({ runs: [run, { ...run, created_at: time('09:46:00') }] }), 'primary_launch_not_excluded');
});

test('a missed wake requires the scheduler to have moved past the primary slot', () => {
  assert.equal(check({ runs: [] }), 'primary_launch_not_excluded');
  assert.equal(check({ runs: [], definition: { ...definition, last_run_at: time('06:06:00') } }), 'primary_slot_missed');
  assert.equal(check({ now: time('06:47:00'), runs: [], definition: {
    ...definition, last_run_at: Date.parse('2026-11-23T09:06:00Z'), next_run_at: time('09:06:00')
  } }), 'primary_slot_missed');
  assert.equal(check({ now: time('09:44:59') }), 'outside_fallback_wake');
  assert.equal(check({ now: time('10:20:00') }), 'outside_fallback_wake');
});

test('approval denial, unresolved activation, or a changed schedule stops catch-up', () => {
  for (const gate of ['approval_denied', 'activation_pending', undefined]) {
    assert.equal(check({ gate }), 'primary_gate_unverified');
  }
  assert.equal(check({ definition: { ...definition, status: 'PAUSED' } }), 'primary_gate_unverified');
  assert.equal(check({ definition: { ...definition, rrule: 'FREQ=DAILY' } }), 'primary_gate_unverified');
});
