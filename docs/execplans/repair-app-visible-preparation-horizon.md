# Repair app-visible preparation horizon

Status: release candidate validated, 2026-09-04 (America/Detroit).

## Goal

Make the scheduled preparation workflow and the installed reader agree on one
authoritative end-to-end current-through-T+7 readiness result. A run must not
report success when the exact data consumed by the reader's warning exposes a
shorter prepared horizon.

## Requirements

- Independently inspect the current private manifest, its referenced rolling
  plan/configuration, and the authenticated backend bootstrap rather than
  trusting automation prose or local state.
- Compare the backend's prepared prefix and readiness fields with the precise
  client calculation/rendering that produces the in-app warning.
- Preserve the definition of prepared: complete, validated private study
  payload plus an approved Matthew Henry layer or verified full-source fallback;
  ESV wording remains outside private content and is not part of this repair.
- Preserve the contiguous-prefix, content-first/manifest-last, exact-readback,
  narrow-sharing, and fail-closed authorization rules.
- Make the recurring task verify the same app-visible invariant before claiming
  completion.
- Backfill only a genuinely missing current-through-T+7 entry; do not
  regenerate valid studies or move beyond T+7.

## Constraints and non-goals

- Work from an isolated worktree based on current origin/main; do not modify
  the dirty canonical checkout.
- Do not expose reader codes, hashes, private Google IDs, commentary bodies,
  comments, ESV wording, or source extracts in diagnostics.
- Do not change Google sharing, reader identity, ESV policy, the immutable
  USER_ACCESSING rollback deployment, or the full calendar.
- Do not treat device cache presence as canonical publication readiness.

## Relevant repository state

- Current Detroit day: 2026-09-04; the required horizon is D081 through D088,
  ending with CC-Y3Q4-D088 / Malachi 1 on 2026-09-11.
- PROJECT_STATE.md and the latest automation memory claim a 35-reading
  manifest-backed prefix through D088, but the user reports that the app's own
  warning indicates only today and tomorrow are prepared.
- The preparation evaluator, Apps Script bootstrap, Pages client, IndexedDB
  refresh, and scheduled-task completion report are separate possible truth
  boundaries and must be reconciled.

## Decisions

- The reader's warning is the incident signal. The repair will first determine
  whether Drive/backend state is actually short or whether the client is
  calculating/displaying readiness from stale or incomplete inputs.
- Publication is unnecessary if exact live readback proves all eight records
  already exist. In that case the fix belongs to readiness delivery/cache/UI
  and the scheduled task's verification.
- A code release will remain code-only and follow the immutable Pages release
  gate. A backend deployment is required only if backend bytes change.

## Milestones

1. **Authoritative diagnosis** — safely compare local ignored state, exact Drive
   manifest/plan state, authenticated bootstrap prepared prefix/readiness, and
   the app warning algorithm. Record the first point of disagreement.
2. **Truth-boundary repair** — implement the smallest fix and regression tests
   so backend/client readiness and scheduled completion use the same exact
   current-through-T+7 invariant.
3. **Live reconciliation** — if the live prefix is genuinely short, publish
   only the missing authorized reading(s), one at a time, with exact readback.
4. **Release and automation gate** — run the full release ladder, publish any
   code-only change, update the existing recurring task without changing its
   schedule/model/project, and verify the live app-facing result.

## Acceptance criteria

- An authenticated diagnostic reports the exact eight expected reading IDs
  from today through T+7 as prepared and app-ready, with no earlier gap.
- The installed app's warning source uses that same result and cannot silently
  reduce it to the hot-path today/tomorrow subset or a stale cached subset.
- The scheduled task refuses to record success unless the app-facing
  diagnostic passes after the final Drive state.
- Tests reproduce the prior false-success/short-visible-horizon condition and
  pass after the repair.
- Repository safety, private validation where applicable, npm run check,
  deterministic builds, and exact Pages verification pass.
- PROJECT_STATE.md records the root cause, live state, validation, deployment,
  and remaining installed-phone check.

## Validation

Start narrow with evaluator/bootstrap/readiness tests, then run repository
safety and npm run check. If public code changes, run npm run build,
npm run publish:pages, and exact artifact verification before push. If private
state changes, require exact Drive byte/hash readback, unchanged permissions,
ordered plan/manifest-prefix equality, and authenticated bootstrap verification.

## Progress

- [x] Created an isolated worktree at current origin/main and linked only the
  verified ignored private stores.
- [x] Read current repository instructions and the linked architecture,
  security, content, automation, testing, and release documents.
- [x] Complete authoritative diagnosis (code path).
- [x] Implement and validate the code-side repair.
- [x] Reconcile live state and implement the recurring-task completion gate.
- [ ] Publish the validated release and record live evidence.

## Discoveries

- The latest automation run and PROJECT_STATE.md both claim D054–D088 are
  live, but those claims currently rely on the workflow's own verification and
  have not yet been compared with the exact readiness object/rendering used by
  the installed app.
- The backend reads the private rolling plan and manifest, verifies that the
  manifest is its contiguous prefix, expands the plan to the compiled active
  calendar, and exposes `preparedReadingIds` from that same manifest. No local
  code path reduced that prefix to the today/tomorrow hot window.
- The Pages priority warmer intentionally fetches only today and tomorrow, but
  previously rendered `currentContentReadiness` from that partial in-memory
  map. Because the warning evaluates tomorrow through T+7, it could falsely
  describe the first un-warmed entry as a preparation gap before the full
  authenticated offline-window batch completed. The full-window batch may
  contain up to all eight current-through-T+7 entries and was already the
  correct client-side data path.
- The repair prevents the priority warmer and retained-cache fallback from
  rendering preparation status. The warning now renders only after a complete
  authenticated prepared-window batch has been accepted. Focused frontend and
  server-core tests pass (86 tests total); live/private state remains to be
  independently reconciled.
- Independent read-only live verification found a 35-entry D054–D088 manifest
  and private-plan prefix, 35 bootstrap `preparedReadingIds`, and eight
  prepared D081–D088 payloads under the frontend preparation validator. No
  Drive repair was required.
- `npm run study:live-health` is now the recurring task's final gate. It reads
  credentials only from ignored private storage, derives the Detroit horizon
  from authenticated bootstrap, requests exactly that batch through the
  nonce-bound token bridge, and reports only status/count/date/reading-ID/
  component-ID data. It uses the exported frontend `readingPreparationReport`
  rather than duplicating readiness semantics. Fabricated tests cover a full
  ready horizon, a missing payload/component failure, and the two exact bridge
  calls without network access.
- The real authenticated gate returned all eight D081–D088 payloads and the
  frontend validator reported every component ready. `study:next` independently
  returned `horizon_ready`; no content or Drive repair was necessary.
- Repository safety passed, all private/content/source validators passed,
  270/270 tests passed, deterministic builds passed, and exact Pages verification
  passed for frontend `aa4ff7bbcd2dc4c1` and PWA `c34528a216b98fe9`.

## Exact next action

Commit and push the code-only release, verify GitHub safety/Pages deployment and
exact HTTPS artifacts, synchronize the existing scheduled task prompt, then ask
for the installed-reader update/reopen warning check.
