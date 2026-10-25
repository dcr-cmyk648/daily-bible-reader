import test from 'node:test';
import assert from 'node:assert/strict';
import {safeV2ErrorCode} from '../scripts/lib/mhc-v2-error-code.mjs';

for(const code of ['V2_GEN24_RECOVERY_OWNER_UNVERIFIABLE','V2_GEN24_RECOVERY_ACTIVE_OWNER','V2_GEN24_RECOVERY_HISTORY_CHANGED','V2_GEN24_RECOVERY_WINDOW_CLOSED','V2_GEN24_RECOVERY_LOCK_REQUIRED','V2_GEN24_RECOVERY_CAPABILITY_INVALID','V2_GEN24_RECOVERY_TRANSPORT_UNQUALIFIED','V2_AUTHOR_LEASE_EXPIRED','V2_TRANSPORT_UNCERTAIN','V2_NATIVE_SOURCE_TRANSACTION_PENDING','V2_CONTROLLER_FAILURE'])test(`safe runner code preserves ${code}`,()=>assert.equal(safeV2ErrorCode(Error(code)),code));
for(const message of ['V2_GEN24_RECOVERY_WINDOW_CLOSED: FABRICATED private detail','V2_AUTHOR_FAILED\nFABRICATED stack','V2_AUTHOR_FAILED\n','V2_AUTHOR_FAILED\r\n','V2_BAD/FABRICATED/private/path','V2_BAD\\FABRICATED\\private\\path','FABRICATED V2_AUTHOR_FAILED','V2_mixed_case','V2_',null,42])test(`unsafe runner message falls back: ${JSON.stringify(message)}`,()=>assert.equal(safeV2ErrorCode({message}),'V2_CONTROLLER_FAILURE'));
test('absent runner error falls back without exposing an object',()=>assert.equal(safeV2ErrorCode(null),'V2_CONTROLLER_FAILURE'));
