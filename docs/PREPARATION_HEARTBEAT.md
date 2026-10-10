# Preparation heartbeat and complete-buffer contract

WO-2, October 10, 2026. Additive to `preparation-status/v1`; activation is owned
by BibleApp Manager. This is the shared contract for WO-1 blocked receipts and
WO-3's future supervisor. No backend trigger, email, new resource, credential,
sharing change, runtime model call, or out-of-band alert is introduced.

## Private manifest and authenticated bootstrap

`preparationStatus` retains `state`, `summary`, `action`, and `updatedAt`. It adds:

- `lastRunAt`: ISO timestamp of the latest supervisor/service heartbeat, including
  failed and no-op wakes. `updatedAt` alone is never a liveness signal.
- `lastSuccessAt`: ISO timestamp of the latest successful or no-op tick. Success
  describes that tick, not a fully prepared buffer; coverage remains independent.
- `lanes`: allowlisted `daily`, `henry_primary`, `henry_recovery`, and `review`.
  Each has `lastAttemptAt`, `lastOutcome` (`running`, `success`, `no_op`, `blocked`,
  `error`), and `lastErrorCode` (empty or a bounded uppercase machine code).
  WO-1 uses `henry_primary`/`henry_recovery` regardless of historical Spark/Luna
  automation names; unavailable models use `V2_AUTHOR_MODEL_UNAVAILABLE`.
- `hasUnresolvedLaneError`: server-derived shared boolean when a sanitized lane
  remains blocked or errored. It carries no owner diagnostics. Fresh global
  timestamps/full content cannot hide it from either reader.
- `blockerRequiresResolution`: retains an existing legacy global blocker whose
  owning lane is unknown. Normal heartbeats cannot clear it on later wakes.
- `buffer`: `service-buffer/v1` from authenticated `service:live-health`, including
  `effectiveDate`, `readingIds` (at most eight in schedule order),
  `measurementComplete`, `devotionalGaps`, `henryGaps`, `fallbackReadingIds`, and
  derived devotional/complete consecutive-reading and future-day counts.

Bootstrap sanitizes all fields. It recomputes counts from the gap sets rather
than trusting supplied totals. Dustin receives summary, action and lane details;
Shane receives only state, timestamps and safe buffer measurements. Unknown
fields, private pointers and raw provider stderr are never exposed. Legacy v1
receipts remain readable; absence of `lastRunAt` produces an honest unknown-
heartbeat red notice rather than borrowing an old status timestamp.

`scripts/prepare-service-status.mjs` stages a private candidate only. The existing
publisher must fetch the live manifest immediately before mutation, merge only
the status into that exact baseline, preserve concurrent reading pointers, verify
exact bytes and unchanged restricted sharing, and verify authenticated bootstrap.
Failure to publish must be reported as failure; local staging is not a heartbeat
delivery claim.

Use the existing three positional arguments plus `--heartbeat <private JSON>`:

```text
node scripts/prepare-service-status.mjs running "Safe status summary" "" --heartbeat <private receipt path>
```

The receipt has `{lane, lastOutcome, lastErrorCode, buffer}`; `buffer` is optional
for a blocked receipt with no available health measurement. Both start and finish
receipts preserve other lanes and prior successful timestamps. No-op runs must
publish their heartbeat too. `ready` is rejected unless the sanitized measurement
is complete and its entire measured horizon is ready. A transport error must not
reuse an old measurement to assert a successful new health check.

State merging preserves blocked/error receipts from every other lane and their
summary/action even when a daily no-op requests `running` or `ready`. A same-lane
no-op or retry-start receipt also cannot erase that lane's recorded error. A successful, actual repaired
lane receipt may resolve its own error; it cannot resolve another lane's error.
Legacy global blockers require explicit `--resolve-blocker` only after the manager
has verified their correction/approval. That flag cannot clear unresolved lane
receipts. A heartbeat without lane attribution never clears an existing blocker.

## One reader decision

`evaluatePreparationReadiness` always considers today's scheduled reading through
T+7, independent of the selected calendar date. It intersects manifest membership,
the latest safe buffer measurement, and available payload component checks.
Downloaded content can reveal another failure but cannot hide an unpublished
manifest entry or a measured Henry gap. An unknown/unmeasured Henry layer cannot
count as complete. Buffer reading IDs remain useful as the horizon moves; the
new entering day stays unknown until it has real evidence.

Complete future days are the contiguous complete prefix after today, consistent
with `service-buffer/v1`. Complete means devotional plus full reviewed Henry
layer (book overview on introduction days), never a fallback link. Green requires
at least five such future days and heartbeat age below 30 hours. Three or four
future days, or any measured fallback in the window, is amber. Zero to two future
days, missing today/tomorrow, stale or unknown heartbeat, and explicit operational
blocks are red. Thresholds cap at the actual remaining plan length for its terminal
window. A `ready` label cannot suppress an independently measured shortfall.

Both calendar and payload-download renders call this evaluator. Resume/reopen
recalculates heartbeat age even when the calendar date is unchanged. The notice
stays below the calendar and above Downloaded data. Dustin gets counts, fallback
explanation and bounded lane codes; Shane gets the short condition without
operational details. Explicit blocked/approval status stays red until updated.

## Manager activation requirements

The tested source/bootstrap contract and tracked runner instructions are proposed
changes until the manager installs the accepted revision. Install the status
helper and align the active daily/review runtime/prompts together. Leave Henry
author lanes paused until WO-1's separate release and model preflight acceptance.
Publish an honest initial heartbeat/buffer with the existing Drive connector;
deploy the new immutable token-backend contract only through the existing release
procedure and required phone gate. Preserve version 23 and original project HEAD.
The old backend cannot expose the new fields merely because a candidate is local.

The manager must verify one real daily no-op or preparation wake and one review
wake each leave exact-readback heartbeat evidence. Fabricated tests prove the
contract and copy; they do not prove unattended heartbeat publication.
