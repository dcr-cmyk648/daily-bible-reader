# Repair automation state drift after the September 8 runs

## Goal

Restore deterministic agreement between the daily T+7 publication lane, the tracked prepared-prefix fixtures, and the paired native Henry Spark/Luna lanes. A private reading that is already manifest-backed must not leave the next daily run blocked on stale tracked admission state, and Luna must never select a different reading merely because Spark's deterministic preflight failure rotated the historical backfill queue.

## Requirements

- Preserve the live private manifest and all existing reviewed/fallback Henry data on every failure.
- Reconcile tracked `fixtures/pilot-content/plan.json` and `fixtures/pilot-content/app-config.json` only from an exact contiguous manifest-backed prefix that matches the active calendar; never infer readiness from loose files.
- Keep the daily preparation unit atomic: one reading, content first, manifest last, exact-reading live health, then reevaluation; use full-horizon health only after no gap remains.
- Bind each Spark/Luna quarter-hour pair to one deterministic selected reading and source/chunk state. A Spark deterministic/source/schema failure blocks that selected reading and is not Luna-eligible. A Spark model failure or authenticated missed/stale Spark execution may transfer that same reading/chapter to Luna.
- Do not allow the historical cooldown queue to make Luna silently switch to a different reading within the same paired slot.
- Generation lanes may stage only. Review, durable-library finalization, attachment, and manifest-last publication remain separate.
- Diagnostics expose only safe lane, reading/date, action/state/stage/code, and prior-manifest state. No private prose, source atoms, Scripture, comments, credentials, reader identities, URLs, hashes, or Google resource identifiers enter Git or logs.
- Use fabricated fixtures for regressions. Do not modify or publish private study prose in this code repair.

## Relevant repository and live state

- `origin/main` is `cc67463`; the isolated repair worktree is clean and links the existing ignored stores read-only except when an explicitly validated recovery step requires otherwise.
- The private manifest contains the exact contiguous prefix through `CC-Y3Q4-D090`, and authenticated exact-reading health for D090 is ready. The tracked plan and testing allowlist still end at D089.
- The 03:00 daily run selected D091 but stopped before any model or publication at `ensure_admission / prepared_prefix_next_mismatch` because the Henry controller treated D090 as the exact next tracked entry.
- The 05:15 Spark lane selected D085 and failed deterministically before leasing a work item with `NATIVE_WORKER_VIEW_VERSE_CEILING`; the prior manifest remained live.
- The 05:25 Luna lane then re-ran the cooldown-aware selector, chose D086 rather than D085, synthesized a missed-primary transfer for that different reading, and ended with `NATIVE_CANDIDATE_UNRESOLVED`. No review or publication occurred.
- The 05:45 reviewer correctly classified the already completed D084 handoff as a manifest-backed no-op, confirming the previous review completion repair.

## Decisions

- The exact manifest-backed prefix is the recovery authority for tracked prefix reconciliation, subject to active-calendar equality and local private-content validation.
- Pair-level Henry selection must be durable before model-specific work-item construction. The Luna lane consumes the Spark pair's exact selected reading/state rather than independently consulting a queue that Spark may have just mutated.
- Evidence-size handling may compact the worker-visible snippet subset deterministically if it preserves bound source IDs and required terms within the existing private full source view. It must never clip silently in a way that invalidates evidence or conceal a source/schema defect.
- If a safe bounded worker view cannot be constructed, record a deterministic blocking outcome for the selected pair so Luna cannot reinterpret it as a missed Spark run.

## Milestones

1. Add an exact, idempotent manifest-to-tracked-prefix reconciliation path and regressions for D090-live/D089-tracked, mismatch, gap, tamper, and no-op cases; update the daily scheduled workflow to run it before issuing the next Henry ensure request.
2. Make native Henry pair selection durable and shared across Spark/Luna, record pre-work-item deterministic failures in the native state boundary, and prevent Luna from choosing another cooldown candidate in the same slot.
3. Repair the bounded worker-view evidence-ceiling behavior for legitimate large shared ranges, with fabricated tests proving required-term coverage, deterministic hashes, strict total/per-verse bounds, tamper detection, and fail-closed behavior when coverage cannot fit.
4. Reconcile tracked fixtures through D090, verify D090 exact live health, confirm D091 is the admitted next work order, and run the safe Henry controller/work-order checks without generating or publishing private content.
5. Run focused tests, full `npm test`, repository safety, build/check gates, diff review, then release safe tracked code/metadata to `main` under the standing project authorization. Confirm GitHub checks and leave private publication to the scheduled content lane.

## Acceptance criteria

- The tracked plan/testing allowlist and live manifest identify the same exact D054–D090 prefix.
- A fresh daily evaluator selects D091 and its one-reading Henry ensure request passes admission rather than `prepared_prefix_next_mismatch`.
- A deterministic Spark preflight failure for one reading yields no Luna work for another reading in the paired slot.
- Eligible Spark model failure/staleness still transfers the same reading and chapter to Luna exactly once.
- The real D085 worker view either builds within policy bounds or produces a durable deterministic block; it cannot strand the lane before selected-attempt recording.
- D084 remains completed/no-op; D090 remains ready; no private manifest, Drive file, deployment, comment, highlight, ESV secret/text, or sharing state is changed by the tracked repair.

## Validation

- Focused prefix, rolling-work-order, native-state, native-worker, and Henry-controller tests.
- `npm test`
- `npm run safety`
- `npm run build`
- `npm run publish:pages`
- `npm run check` (record any pre-existing ignored-private inventory mismatch separately; do not weaken it).
- Read-only `npm run study:live-reading-health -- CC-Y3Q4-D090` outside the network sandbox when necessary.
- Safe work-order outputs only; never print private content.

## Progress

- [x] Confirmed D090 is manifest-backed and passes exact authenticated live health while tracked plan/config end at D089.
- [x] Confirmed the daily run stopped before model execution or mutation on that exact prefix mismatch.
- [x] Confirmed Spark selected D085 but failed before leasing, while Luna independently selected and failed D086; neither generation lane published.
- [x] Confirmed the repaired reviewer no-op'd D084 without opening private source material.
- [x] Implemented milestones 1–3 with fabricated regression coverage: exact manifest-prefix reconciliation plus scheduled-task ordering; checksum-bound pair selection/block state shared by Spark/Luna; and deterministic evidence-preserving worker-view compaction with strict ceilings.
- [x] Reconciled the tracked plan and testing allowlist through manifest-backed D090, required full private validation, confirmed exact D054–D090 prefix equality, admitted D091 as the next daily work order, and proved D091 passes the Henry ensure admission boundary in a no-write dry run.
- [x] Completed milestone 5 validation: aggregate `npm run check` passed repository safety, every validator, 322/322 tests, all builds, and exact Pages verification. The fresh authenticated D090-ready probe remains the external evidence owner; no private content or live manifest was changed by this repair.
- [x] Released commit `dbb0895` to `main`; GitHub repository safety/test run `34218908909` and Pages deployment `34218907916` both passed.

Implementation validation so far: the original focused prefix/work-order/native tests passed 56/56; after the primary-review corrections, the focused native-worker suite passed 34/34 and full `npm test` passed 322/322. Repository safety passed over 383 files, content/schema validation passed with 37 schemas, source validation passed, all three builds passed, and `git diff --check` passed. The aggregate `npm run check` stopped at the expected pre-existing milestone-4 boundary because the ignored private bridge contains D090 while the tracked 36-reading plan still expects exactly 72 D054–D089 files; the gate was not weakened. No private manifest, ignored content, model worker, deployment, or external resource was changed.

Discovery: the prior worker view copied every snippet from each target atom into every verse view. Legitimate shared ranges could therefore exceed the ceiling before a lease existed. The repaired view keeps whole checksum-bound snippets, chooses a deterministic minimum that covers each selected target atom, every required identity/relation, and every anchor that resolves to canonical evidence, and records a durable pair block if required coverage is absent or the safe view still cannot fit.

Read-only real-state verification rebuilt D085's worker views in memory without creating a pair, lease, work item, candidate, ledger event, or private write. All three chunks are now buildable within the bounded-view contract; only the safe reading/state/chunk-count report was emitted.

Primary-review follow-up closed two reliability/provenance gaps. Pair-state locks now reject a live owner but recover after the same bounded stale interval used by the ledger, so a crashed process cannot strand later paired slots. Candidate admission now checks every verse-level source-unit/atom citation and every fact snippet/evidence quote against that verse's exact compact worker view before hydrating from the retained full private source; hidden atoms or snippets cannot become admissible through the unabridged validation source. Fabricated active/stale lock, visible evidence, hidden-atom, and hidden-snippet regressions pass.

Milestone 4 completed locally without model execution or private-state mutation. `prefix:reconcile` advanced only `fixtures/pilot-content/plan.json` and `fixtures/pilot-content/app-config.json` from D089 to D090, and its immediate dry rerun reported the manifest-backed D090 prefix current. Full private validation passed with 34 end-to-end studies, 37 syntheses, 0 placeholders, and 282 registered sources. An independent ordered comparison proved that the 37-entry tracked plan, testing allowlist, manifest keys, and active-calendar prefix are identical from D054 through D090. `study:next` admitted only D091. A fabricated stdin-backed `mhc:ensure --dry-run` accepted D091 as the exact next active entry, reported it missing, and explicitly performed no Spark invocation or store/result writes. The read-only historical Henry work-order selector remained healthy and selected one manifest-backed fallback. Focused prefix, rolling-work-order, backfill, and controller tests passed 94/94 after updating the D089-stale CLI regression to fabricate its stale prefix independently of the now-current tracked fixture. Repository safety passed over 383 files and `git diff --check` passed after the tracked update. Per the primary's boundary, no authenticated health request was repeated; its fresh D090-ready result remains the external evidence owner.

## Exact next action

Let the next scheduled daily run retry D091 and require the next Spark/Luna pair to report one shared reading selection. The supervisory lane must report either confirmation or the next normalized failure; it must not infer success from elapsed time.
