# Repair per-reading live-health recovery loop

## Goal

Stop the daily T+7 automation from rolling back a valid one-reading publication merely because a later reading in the same horizon is still missing, while preserving the full authenticated horizon gate before the lane reports success.

## Requirements

- Keep one validated work order and one manifest-last publication at a time.
- After each reading publication, authenticate through the existing public bridge and validate that exact reading's app-visible payload with the frontend's production component validator.
- Reevaluate `study:next` only after that exact-reading live check passes.
- Run the existing full `study:live-health` gate only after `study:next` returns `none` or `plan_complete` for the bounded current-through-T+7 horizon.
- Preserve safe diagnostics: no credentials, endpoint URLs, private prose, source atoms, ESV wording, comments, reader identities, or Google resource IDs.
- Preserve rollback on a genuine failure of the reading just promoted or the final complete-horizon check.

## Evidence

- The 2026-09-07 daily lane prepared and uploaded D090, promoted the manifest, then called the all-horizon health command before reevaluating.
- The backend returned `READING_NOT_FOUND` for the batch because the next horizon entry was still absent. The lane interpreted that expected later gap as a failure of D090 and restored the prior D089 manifest.
- The rolling work-order evaluator correctly selects the earliest stale reading and is designed to drain multiple recovery gaps sequentially. The current runbook ordering prevents that loop whenever more than one horizon record is missing.

## Milestone

1. Add a bounded authenticated single-reading live-health command and library function that fetches only the named active-plan reading and applies the existing preparation/Henry validators.
2. Reject arbitrary or inaccessible reading IDs, plan mismatches, missing payloads, and backend errors; emit only safe status/component data.
3. Add fabricated tests proving exact one-reading fetch, failure handling, and the unchanged final horizon behavior.
4. Update the scheduled prompt, automation runbook, and content workflow so exact-reading health gates each atomic promotion and full horizon health gates only completion.
5. Run focused tests, full tests, repository safety, build/check gates, and diff review.

## Acceptance criteria

- A newly promoted reading passes its own live check even while the next horizon reading is absent.
- The automation then receives and processes the next work order rather than rolling back the first.
- The lane cannot report ready until the full current-through-T+7 health command succeeds.
- A bad or missing just-published reading still stops and rolls back immediately.
- D090 can be promoted and retained, followed by D091 if it is inside the current horizon.

## Progress

- [x] Reproduced the live failure and safely identified backend code `READING_NOT_FOUND` on the batch payload request.
- [x] Identified the workflow ordering defect; no private data or sharing state was changed.
- [x] Implemented and validated the single-reading live-health gate and workflow changes; final horizon health remains the completion gate.
- [x] Released the tracked fix in `39d7828`; both GitHub safety/test and Pages workflows passed.
- [x] Restored D090 manifest-last after exact payload/ACL checks; its exact-reading live gate reports ready and the prior rollback state was not needed.
- [ ] Prepare D091, the newly exposed September 14 T+7 gap, through the same atomic gate; run the final full-horizon check only after no gap remains.

## Exact next action

Prepare and review only D091, publish it content-first and manifest-last, pass `study:live-reading-health -- CC-Y3Q4-D091`, then reevaluate. Run `study:live-health` only when the bounded work order reports no remaining gap.
