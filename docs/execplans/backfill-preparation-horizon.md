# Backfill the rolling preparation horizon

## Goal

Keep every scheduled Daily Bible Reader date from the current Detroit day through seven days ahead end-to-end prepared, including dates whose factual schedule entries were added after earlier automation runs. Repair the current D070–D075 gap without generating beyond the authorized horizon.

## Requirements

- Treat the complete D054–D092 factual schedule as the calendar source and the private plan/manifest as the contiguous prepared prefix.
- When any reading from today through T+7 is missing or stale, select the earliest missing reading in schedule order, not merely the reading exactly at T+7.
- Preserve one-reading work orders and one-reading atomic publication. A recovery run may reevaluate after each successful publication and continue sequentially until the current-through-T+7 horizon is complete.
- When the horizon is already complete, the daily run remains the ordinary one-reading append for the newly entering T+7 date.
- Never skip an earlier private-prefix gap, publish a partial study, generate beyond T+7, store ESV wording, read comments, use runtime AI, or use Spark outside the Matthew Henry verse layer.
- Prepare and privately publish the currently missing D070–D075 studies in order. Each must include the orientation, Scripture references, verse-of-the-day reference, coherent synthesis, practical takeaway, custom cited deep study, source provenance/coverage, and either a reviewed Henry layer or the documented quota-only full-commentary link.
- Update the saved scheduled-task prompt as well as repository automation documentation. If direct Scheduled-task mutation is unavailable, leave the canonical prompt ready and report the exact remaining UI action rather than claiming it was updated.

## Constraints and non-goals

- Private commentary, source notes, Google IDs, reader codes, ESV wording, and Matthew Henry source atoms remain outside Git and Pages.
- The complete long-term reading plan remains out of scope.
- Do not change either accessing-user rollback deployment.
- Publication stays content-first and manifest-last with exact Drive readback and unchanged restricted sharing.
- Main synthesis research and editorial judgment remain in the primary task; Spark is only for the verse-by-verse Henry layer.

## Relevant repository state

- `origin/main` at task start is `68c94f4`.
- The compiled schedule contains D054–D092.
- The canonical private manifest is contiguous through D069/Zechariah 1.
- On 2026-08-22 in `America/Detroit`, the required current-through-T+7 window is D068–D075. D068–D069 are prepared; D070–D075 are missing.
- The existing evaluator in `scripts/lib/rolling-study-work-order.mjs` resolves only the reading exactly seven days ahead, causing it to target D075 while the rollback-compatible prefix still requires D070 first.
- The active desktop task is documented as **Prepare Daily Bible Reader T+7**, daily at 3:00 a.m. Detroit time.

## Decisions

- Recovery selection is earliest missing/stale within the current-through-T+7 window.
- The work-order schema continues to authorize exactly one reading. The scheduled prompt loops by requesting a new validated work order only after the prior reading has passed review, validation, manifest-last publication, and exact Drive readback.
- A recovery loop is bounded by the eight-reading horizon and stops on the first failure, preserving the prior manifest.
- Normal operation remains one newly entering T+7 reading per day because no earlier gap exists.

## Milestones

1. **Automation correctness** — update evaluator, schema/tests as needed, prompt, runbook, and state so late-added schedule entries are backfilled in order.
2. **Private horizon repair** — sequentially prepare, review, validate, and publish D070–D075, reevaluating after every manifest promotion.
3. **Release and automation synchronization** — run repository gates, publish only required code/factual metadata, update the existing scheduled task where supported, and verify the live ready-through date.

## Acceptance criteria

- Tests prove an exact-T+7 target cannot leap over an earlier missing/stale reading in the active horizon.
- Tests prove the evaluator advances to the next gap only after the prior one becomes ready and returns no work when all dates through T+7 are ready.
- The scheduled prompt explicitly drains bounded backfill gaps sequentially and retains one-reading atomicity.
- D070–D075 are present in the private prepared prefix/manifest with complete validated content and exact Drive readback.
- The app reports ready through 2026-08-29 with no preparation gap in the current-through-T+7 window.
- No private content, ESV text, secrets, source atoms, or Google IDs enter tracked/public artifacts.

## Validation

- Focused rolling-work-order and bridge-extension tests first.
- Source registry, private-content, commentary/citation/hash, rights, and repository-safety validation for each reading.
- Full `npm run build`, `npm run publish:pages` when tracked delivery changes, and `npm run check` before release.
- Exact private Drive byte/hash readback, manifest binding, and restricted-sharing verification after each publication.

## Progress

- 2026-08-22: Root cause confirmed. The complete schedule reaches D092, the private prefix reaches D069, and the current evaluator targets D075 rather than the earliest missing D070.
- 2026-08-22: Milestone 1 complete. The evaluator scans the configured current-through-T+7 horizon, treats absent evidence as stale, selects the earliest gap, handles before-start/near-end/post-plan dates, and retains one-reading work orders. Focused tests cover ordered D070→D071 recovery, stale-prefix priority, full-horizon no-op, and final-plan boundaries.
- 2026-08-22: Milestone 2 complete. D070–D075 were prepared and privately published in order. Each content/configuration file passed exact-byte Drive readback before manifest-last promotion, and restricted sharing remained unchanged. Spark failed during the authorized Henry attempt, so each reading uses the verified complete public-domain Henry link fallback without a substitute model.
- 2026-08-22: Milestone 3 code/content gates complete. Repository safety inspected 243 files; validators accepted the 22-reading private prefix, 39-reading schedule, 19 end-to-end studies, 22 syntheses, and 151 sources with no stored Scripture; 216/216 tests and all builds passed. Exact Pages publication reproduced existing bytes. Authenticated live bootstrap/batch probes confirmed a 22-reading prefix through D075 and six complete new payloads. The saved ChatGPT scheduled-task UI remains unsynchronized because the connected external Chrome profile was not signed in.

## Discoveries

- The prepared-prefix compatibility rule is behaving correctly; the selection policy is wrong for a schedule expansion/backfill event.
- Official OpenAI documentation confirms local scheduled tasks require the computer on, the desktop app running, and the selected project available; the in-app readiness warning remains the independent failure signal.
- The Google Drive connector produced empty bytes for raw JSON uploads labeled `application/json`. Exact readback prevented manifest promotion; uploading the same JSON bytes as `text/plain` succeeded, and Apps Script continues to parse those allowlisted files by bytes rather than trusting transport MIME.
- The generated Pages assets are byte-identical to the current release, so this scheduler/content repair does not require a new shell or service-worker deployment.

## Exact next action

Commit and push the validated code-only scheduler, factual-prefix fixture, prompt, tests, and documentation. Then synchronize the existing **Prepare Daily Bible Reader T+7** task from `prompts/daily-study-scheduled-task.md` in a signed-in task UI; the evaluator should remain `none` / `horizon_ready` through August 29 until D076 enters the window.
