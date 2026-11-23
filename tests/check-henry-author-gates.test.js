const assert = require('node:assert/strict');
const test = require('node:test');

const modulePromise = import('../scripts/check-henry-author-gates.mjs');
const started = '2026-01-02T05:00:00.000Z';
const deferred = `HENRY_AUTHOR_GATE ${started} activation_pending`;

test('repeated Henry deferrals keep their first blocked time and latest reason', async () => {
  const { overdueAuthorGate } = await modulePromise;
  const memory = [deferred, 'HENRY_AUTHOR_GATE 2026-01-03T04:05:00Z approval_denied'].join('\r\n');
  assert.equal(overdueAuthorGate(memory, Date.parse('2026-01-03T05:00:00.000Z')), null);
  assert.deepEqual(overdueAuthorGate(memory, Date.parse('2026-01-03T05:00:00.001Z')), {
    since: started, reason: 'approval_denied'
  });
});

test('a verified gate clears the prior waiting time and a later deferral starts a new one', async () => {
  const { overdueAuthorGate } = await modulePromise;
  const verified = `${deferred}\nHENRY_AUTHOR_GATE 2026-01-04T06:00:00.000Z verified`;
  const again = `${verified}\nHENRY_AUTHOR_GATE 2026-01-05T06:00:00.000Z activation_pending`;
  assert.equal(overdueAuthorGate(verified, Date.parse('2026-01-05T08:00:00Z')), null);
  assert.equal(overdueAuthorGate(again, Date.parse('2026-01-06T05:59:59Z')), null);
  assert.deepEqual(overdueAuthorGate(again, Date.parse('2026-01-06T06:00:01Z')), {
    since: '2026-01-05T06:00:00.000Z', reason: 'activation_pending'
  });
});

test('ordinary no-work notes and future timestamps do not change a gate', async () => {
  const { overdueAuthorGate } = await modulePromise;
  const now = Date.parse('2026-01-04T06:00:00Z');
  assert.equal(overdueAuthorGate('No eligible reading. activation_pending is historical.', now), null);
  assert.deepEqual(overdueAuthorGate(`${deferred}\nHENRY_AUTHOR_GATE 2026-01-05T06:00:00Z verified`, now), {
    since: started, reason: 'activation_pending'
  });
});
