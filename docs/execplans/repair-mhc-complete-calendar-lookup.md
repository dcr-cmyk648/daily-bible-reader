# Repair Henry lookup at the prepared-prefix boundary

## Goal

Remove the circular dependency that prevents the daily T+7 workflow from generating the Matthew Henry layer for the first scheduled reading beyond the private prepared prefix. The bounded `mhc:ensure` request must resolve its reading from the complete active calendar while the private prepared plan and manifest remain the publication authority.

## Requirements

- Reproduce and fix the exact D082 failure: a schema-valid one-reading request for `CC-Y3Q4-D082` must resolve Zechariah 11 even though the private prepared plan currently ends at D081.
- Keep the complete active calendar read-only. Resolving a generation target must not extend the private prefix, mutate a manifest, publish content, or imply readiness.
- Verify that the private prepared plan is an exact ordered prefix of the complete active calendar and that both use the request's plan version before accepting a target.
- Preserve the existing ability to reuse or regenerate readings already inside the prepared prefix.
- Permit generation beyond the prefix only for the single exact next active-calendar entry. Reject a request that skips ahead, asks for multiple not-yet-prepared readings, crosses more than one prefix boundary, uses a mismatched plan, or names an unknown reading.
- Keep Spark-first/Luna-low routing, source/checksum/admission failures, review, private-library storage, and content-first/manifest-last publication policy unchanged.
- Do not store or request ESV wording, touch comments/highlights, expose private identifiers, alter sharing, or change either Apps Script deployment.
- Add direct regression coverage for the prepared-prefix boundary and retain all existing Henry pipeline tests.

## Relevant repository state

- `scripts/mhc-pipeline.mjs` currently defines `ACTIVE_PLAN_PATH` as `fixtures/pilot-content/plan.json`, the 28-entry private prefix ending at D081.
- `config/active-calendar/celebration-bridge-long-term-active.json` is the complete 1,263-entry calendar. It has the same compatibility `planVersion`, starts with the same entries, and contains D082 plus the approved long-term continuation.
- `ensureSchedule()` resolves `request.start_reading_id` through the 28-entry file. The current schema-valid D082 request therefore fails before any worker attempt with `No unique active reading matches CC-Y3Q4-D082.`
- The September 3 automation did run, repaired D080 and D081 with exact private publication/readback, then stopped at this deterministic D082 lookup failure. The authoritative manifest remains healthy through September 4.
- Implementation occurs only in `/private/tmp/dbr-fix-mhc-calendar.2DwoM5/worktree`; the dirty canonical checkout remains untouched. Ignored private stores are linked only for validation/reproduction.

## Decisions

- Treat the complete calendar as the generation lookup domain and the private plan as the bounded readiness/publication prefix.
- Enforce the boundary inside the controller rather than relying only on the scheduled prompt. A request wholly within the prefix retains its existing bounded-count behavior; a request that reaches outside it may name only the exact next entry and exactly one reading.
- Do not extend the prefix early merely to make generation succeed. The existing workflow still extends it immediately before an otherwise complete atomic publication.
- This milestone fixes code/tests/docs only. Retrying and privately publishing D082 is a separate post-fix content milestone because it requires source research, editorial review, worker execution or verified Henry fallback, Drive writes, and manifest promotion.

## Milestones

1. Implement complete-calendar lookup plus explicit prepared-prefix compatibility/boundary guards in the Henry ensure path.
2. Add focused regression tests for in-prefix reuse/generation, exact-next success, skip-ahead rejection, multi-reading boundary rejection, unknown reading, and plan/prefix mismatch.
3. Review the implementation, run focused tests and the full repository gate, publish the code-only Pages artifacts only if their deterministic bytes change, commit/push safe tracked files, and verify CI.
4. Run the unchanged D082 work order through the separately authorized daily-content workflow and restore the T+7 horizon sequentially, stopping on the first genuine generation/review/publication failure.

## Acceptance criteria

- The current D082 request reaches the dry-run target partition rather than failing lookup.
- No request can use the complete calendar to skip the private-prefix boundary or generate a future batch outside the authorized one-reading step.
- Existing prepared-prefix, Spark/Luna, durable-library, schema, and fail-closed tests remain green.
- `npm run check` and repository safety pass with no private content or ESV text in tracked/public artifacts.
- After the code release, D082 may be prepared without extending the prefix until the established pre-publication point.

## Progress

- [x] Confirmed the scheduled task is active and ran on September 3.
- [x] Reproduced the exact D082 lookup failure with the current schema-valid ignored request.
- [x] Implement and test the bounded complete-calendar lookup: ensure verifies the fixture plan as the exact ordered prepared prefix, resolves the complete active calendar, and permits only the single immediate next entry beyond that prefix.
- [x] Add direct helper and isolated CLI regressions. The CLI test reaches `generate CC-Y3Q4-D082` with no private store and confirms the dry run performs no worker or write.
- [x] Complete release validation: safety inspected 336 files; all validators, 265/265 tests, every build, and exact Pages verification passed. Public release bytes and Apps Script bundles are unchanged.
- [ ] Commit and push the safe tracked repair, then verify GitHub CI.
- [ ] Retry D082 through the end-to-end private-content lane.

## Discoveries

- The failure occurred before routing, so neither Spark nor Luna was attempted. It was unrelated to quotas and could not legitimately enter the model fallback path.
- The exact active-calendar entries and private-prefix entries are byte-equivalent through D081. This permits a strict prefix proof without weakening the existing manifest/publication boundary.
- A helper-only unit test would not prove that the CLI actually used the new plan. The isolated CLI regression provides a fabricated request and only symlinks tracked code/config/schema inputs into its temporary root, so it cannot see private storage or invoke a model during `--dry-run`.

## Exact next action

Stage only the controller, focused tests, synchronized documentation, ExecPlan, and project state; run the staged safety check, commit/push, and verify GitHub CI before beginning the separate D082 content milestone.
