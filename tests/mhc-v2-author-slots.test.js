import test from 'node:test';
import assert from 'node:assert/strict';
import {latestDetroitAuthorSlot,latestDetroitSparkSlot} from '../scripts/lib/mhc-native-state.mjs';

for(const [lane,at,expected] of [
  ['spark','2026-10-19T05:06:00Z','2026-10-19T05:05:00.000Z'],
  ['spark','2026-10-19T08:06:00Z','2026-10-19T08:05:00.000Z'],
  ['luna','2026-10-19T05:46:00Z','2026-10-19T05:45:00.000Z'],
  ['luna','2026-10-19T08:46:00Z','2026-10-19T08:45:00.000Z'],
  ['spark','2026-10-19T04:30:00Z','2026-10-18T08:05:00.000Z'],
  ['luna','2026-10-19T04:30:00Z','2026-10-18T08:45:00.000Z'],
  ['spark','2026-03-08T06:06:00Z','2026-03-08T06:05:00.000Z'],
  ['spark','2026-03-08T08:06:00Z','2026-03-08T08:05:00.000Z'],
  ['luna','2026-03-08T08:46:00Z','2026-03-08T08:45:00.000Z'],
  ['spark','2026-11-01T05:06:00Z','2026-11-01T05:05:00.000Z'],
  ['spark','2026-11-01T06:06:00Z','2026-11-01T05:05:00.000Z'],
  ['luna','2026-11-01T06:46:00Z','2026-11-01T05:45:00.000Z'],
  ['spark','2026-11-01T09:06:00Z','2026-11-01T09:05:00.000Z'],
  ['luna','2026-11-01T09:46:00Z','2026-11-01T09:45:00.000Z']
])test(`overnight ${lane} slot at ${at}`,()=>assert.equal(latestDetroitAuthorSlot(new Date(at),lane),expected));

test('v2 slots leave the legacy default calculation and invalid-lane gate intact',()=>{
  assert.equal(latestDetroitSparkSlot(new Date('2026-10-19T05:06:00Z')),'2026-10-19T03:15:00.000Z');
  assert.throws(()=>latestDetroitAuthorSlot(new Date(),'FABRICATED'),/V2_MODEL_NOT_ALLOWED/);
});
