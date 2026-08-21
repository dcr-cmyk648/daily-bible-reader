# Load the complete Celebration bridge schedule

## Goal

Make Celebration Church Year 3 Quarter 4 source Days 54–92 visible as the app's complete temporary bridge schedule, ending on September 15, 2026, while keeping private study preparation, ESV retrieval, and offline retention bounded to the existing current-through-T+7 workflow.

## Requirements

- Preserve stable reading IDs `CC-Y3Q4-D054` through `CC-Y3Q4-D092` and the fixed August 8, 2026 Detroit start date.
- Generate schedule entries only from the already-audited factual reference plan and chapter metrics.
- Keep multi-chapter assignments grouped as one daily reading and discussion.
- Let the calendar show the entire remaining schedule, including locked future dates and their assigned passages.
- Distinguish scheduled readings from privately prepared readings. A schedule entry with no manifest-backed commentary must not open as if it were complete.
- Keep the existing Drive plan and manifest as the contiguous prepared prefix so immutable rollback deployments remain compatible; reject unknown, gapped, or out-of-order prepared readings.
- Keep the daily automation focused on the one study entering T+7; it must no longer need to append that schedule entry.
- Do not generate commentary for Days 70–92, persist ESV text, broaden the offline window, or publish private content in Git.
- Preserve plan version and stable comment/highlight associations.

## Constraints and non-goals

- No runtime AI.
- No ESV text, private commentary, reader codes/hashes, Google IDs, comments, or highlights in Git or Pages.
- The seven-day future lock and eight-reading private-device window remain unchanged.
- This does not create the later four-stream chronological plan.
- The existing immutable rollback deployment is not moved.

## Relevant repository state

- `config/reference-plans/celebration-y3q4.json` already contains all 92 factual assignments.
- `fixtures/pilot-content/plan.json` currently stops at source Day 69.
- `app/apps-script/Code.gs` currently returns the rolling private plan as the visible schedule; the immutable rollback deployments require that private plan and manifest to match exactly and stop at T+7.
- `scripts/validate-private-content.mjs` and `scripts/build-private-content-bundle.mjs` currently assume every schedule entry has local private content.
- The frontend calendar can display locked entries, but bootstrap does not identify which scheduled readings are actually manifest-backed.
- The private preparation automation already calculates the reading entering T+7 from the schedule date and can select an existing full-plan entry.

## Decisions

- The full factual schedule becomes the visible active plan in the new backend, while preparation remains the existing rolling private Drive plan/manifest.
- Build output will embed the tracked, validated D054–D092 factual schedule as code-only backend metadata. The existing Drive plan/config/manifest stay unchanged, preserving compatibility with immutable backend v27 and hybrid v23.
- Bootstrap will expose the full schedule plus only the IDs of manifest-backed readings. The client will show every scheduled date but enable **Open** only when the date is schedule-accessible and its private reading payload is configured.
- Missing future content is an expected preparation state, not a malformed visible schedule. The private plan/manifest retain their strict legacy equality and T+7 boundary.
- The active `planVersion` remains `celebration-y3q4-bridge-2026-v1` so extending the known schedule cannot orphan existing comments, highlights, or cached records.

## Milestones

1. Extend the tracked active plan/config through D092 from audited reference metadata and update schedule/content validation.
2. Embed the validated full schedule in new Apps Script builds, separate it from prepared-manifest membership in Apps Script and the frontend, and add focused tests for full-plan dates, locked dates, prepared/unprepared selection, and rollback-compatible private-state validation.
3. Update private validation/bundling and automation documentation only where needed so the tracked full schedule coexists with the unchanged rolling private content lane.
4. Run repository safety, build/publish generated Pages assets, full checks, inspect the diff, and publish the code-only update through the existing authorized workflow. Leave the rollback-compatible private Drive plan/config/manifest unchanged.

## Acceptance criteria

- D054–D092 are contiguous and factually match the 92-day reference plan.
- September 15, 2026 maps to `CC-Y3Q4-D092` / Malachi 4.
- Locked future dates display their reading titles on the calendar/selected-day card.
- An unlocked but not-yet-prepared schedule entry cannot trigger a private-payload failure from the Open button.
- The existing private Drive plan/manifest bytes do not need to change, and immutable v27/v23 remain compatible with them.
- Current-through-T+7 preparation/readiness and device caching remain seven days/eight readings.
- `npm run safety`, `npm run build`, `npm run publish:pages`, and `npm run check` pass.
- Generated Pages output contains code/assets only.

## Validation

- Focused schedule, server-core/frontend, bridge, automation, and private-content tests.
- Repository-wide `npm run check` after `npm run publish:pages`.
- Git diff/status inspection before staging; explicit path staging only.
- Live/private publication verification without printing private IDs or content.

## Progress

- [x] Repository and deployment architecture inspected.
- [x] Full factual reference schedule confirmed locally.
- [x] Schedule-versus-preparation boundary selected and refined for rollback compatibility.
- [x] Implementation and focused tests.
- [x] Repository-wide validation and generated release.
- [x] Code deployment; no private Drive mutation was required.
- [x] Commit, push, and live verification.

## Discoveries

- The server's exact plan/manifest equality—not the calendar itself—is the primary reason the full schedule could not be activated without also fabricating future commentary files.
- The local private validator and review-bundle builder share the same all-entries-have-content assumption and must be updated together.
- Full schedule visibility does not change ESV storage: Scripture remains requested only for an opened/preloaded eligible study and stays under the existing provider policy.
- Replacing the Drive plan in place would break both immutable rollback backends; embedding the already-public factual schedule in new backend code avoids that failure while leaving private preparation canonical for commentary availability.
- The complete calendar and the private prepared-prefix plan are different operational objects. The daily work order now reports when that private prefix must advance even though the calendar entry already exists.

## Exact next action

Complete the installed-iPhone gate: accept/restart the PWA, confirm September reaches D092/Malachi 4, confirm an unprepared date is labeled pending, and open one currently prepared reading. The first subsequent private-content action is D070/Zechariah 2.
