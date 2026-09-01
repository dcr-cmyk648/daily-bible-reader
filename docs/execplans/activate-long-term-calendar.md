# Activate the approved long-term calendar

## Goal

Make the installed reader's calendar continue seamlessly from Celebration Day 92 / Malachi 4 on 2026-09-15 into the approved four-stream plan on 2026-09-16, beginning with the Genesis book introduction. The complete locked schedule must be available for calendar navigation without treating unprepared studies as prepared or generating any commentary.

## Requirements

- Preserve every existing bridge date, stable reading ID, comment, highlight, completion record, and reader-code session.
- Map 2026-09-15 to `CC-Y3Q4-D092` / Malachi 4, 2026-09-16 to the Genesis introduction, and 2026-09-17 to Genesis 1.
- Use the already generated and user-approved `four-stream-protestant-66-candidate-2026-09-16-v2` schedule exactly; do not reorder, regenerate, or editorially alter its 1,224 entries.
- Keep unprepared long-term entries visible but disabled. Prepared membership remains the exact manifest-backed contiguous prefix and does not advance in this milestone.
- Keep the currently stored event `planVersion` namespace for compatibility so existing discussion and highlight history is not orphaned. Record the activated source-plan version and SHA-256 separately in machine-readable activation metadata.
- Keep bootstrap payload and installed-phone startup bounded. Do not send the candidate's one-megabyte research rationale payload to the browser; use a validated compact schedule transport and expand it locally.
- Generalize the private-prefix and rolling T+7 boundary so the existing daily workflow can cross from D092 into the Genesis introduction without a second calendar migration.
- Preserve all authentication, sharing, ESV, private-content, and runtime-AI boundaries.
- Deploy the validated code-only Pages/frontend update and a new immutable token Apps Script backend version without moving either accessing-user rollback deployment.

## Constraints and non-goals

- Do not generate or publish Genesis introduction, Genesis 1, or any other new commentary in this milestone.
- Do not modify the locked v2 candidate or its review reports.
- Do not change reader codes/hashes, deployment identity/access, Drive/Sheet IDs, sharing, comments, highlights, ESV text, or secrets.
- Do not put private content, ESV wording, or Google resource identifiers in Git or Pages.
- Do not invalidate the installed PWA's retained reader code or clear IndexedDB.
- The canonical selected checkout is a dirty historical feature branch and must remain untouched; work only in the clean isolated clone at `/private/tmp/dbr-calendar-activation.hvxjPz/repo`.

## Relevant repository state

- Clean implementation base: `868bdbf` on `main`.
- The deployed factual calendar currently contains 39 bridge entries, D054–D092, from 2026-08-08 through 2026-09-15.
- The approved inactive source candidate contains 1,224 entries from 2026-09-16 through 2030-01-21 and has schedule SHA-256 `79b9dfd88851fdf4e852490cae8ff9e9605af7c3a081309d96a94077a44d0be8`.
- The backend currently embeds only `config/bridge-schedules/celebration-y3q4-bridge-full.json` and validates the private Drive plan as a bridge-only prefix.
- Client and server plan validation require one top-level `planVersion`; existing Sheet events use `celebration-y3q4-bridge-2026-v1`.
- The full candidate entry JSON is about one megabyte. A compact calendar representation is required for a stable phone bootstrap.

## Decisions

- Create a deterministic active-calendar artifact by concatenating the unchanged bridge with an exact transformed copy of the approved candidate. Shift candidate day indices by 39 and use the existing compatibility plan namespace for every active occurrence; preserve the candidate plan version/fingerprint in activation metadata.
- Keep the verbose active calendar server-side for authorization, passage metrics, preparation, and deterministic audits. Bootstrap returns a versioned compact transport containing only the schedule fields required by the reader; the client accepts both the compact current backend and standard legacy backends.
- Generalize private-plan validation from bridge-specific IDs/source-day arithmetic to exact prefix equality against the compiled active calendar, bounded by shared Detroit day plus seven.
- Generalize the T+7 evaluator and prepared-plan extension around active `dayIndex`, while retaining the existing bridge-only generator for historical/reference-plan maintenance.
- Improve plan validation to maintain an incremental set of earlier IDs rather than rebuilding it for every entry, avoiding quadratic work on 1,263 entries.

## Milestones

1. Add the deterministic active-calendar builder/artifact, activation metadata schema, compact transport/expansion, backend prefix validation, and September-transition UI labeling with focused tests.
2. Generalize rolling T+7 evaluation and exact next-prefix extension across the September 15/16 boundary; update workflow documentation and tests.
3. Primary diff/security review, mobile fabricated-data smoke, repository safety/full check, immutable Pages and token-backend deployment, exact live verification, and installed-iPhone handoff.

## Acceptance criteria

- The active schedule has exactly 1,263 unique sequential entries: the 39 unchanged bridge entries plus all 1,224 approved v2 entries.
- September 15, 16, and 17 display Malachi 4, Genesis introduction, and Genesis 1 respectively.
- The calendar can show September 16 onward before content is prepared, but opening remains disabled until the manifest-backed prepared prefix reaches that occurrence.
- Existing bridge comments/highlights/completion remain associated with their unchanged reading IDs and plan-version namespace.
- Compact transport round-trips to the validated active plan fields needed by the client, remains under the bounded response target, and supports old standard-plan bootstraps.
- Private Drive plan/manifest through the existing prefix remains valid under the new backend; an out-of-order or over-horizon prefix fails closed.
- A September 9 T+7 work order can name the Genesis introduction, and the generic extension admits only the exact next active-calendar entry.
- No private content, ESV text, credentials, comments, highlights, or private IDs enter Git/Pages or test output.
- Focused tests, `npm run check`, 390×844 transition smoke, immutable deployment, GitHub workflows, and exact live byte/MIME/backend comparison pass.

## Progress

- [x] User identified the missing September 16 continuation and implicitly requested activation of the previously approved schedule.
- [x] Dirty selected checkout isolated; current `main`, candidate fingerprint, backend boundary, event-version compatibility, and bootstrap-size risk inspected.
- [x] Implement and validate the active-calendar/runtime milestone; pending primary review.
- [x] Implement and validate the cross-boundary T+7/private-prefix milestone; pending primary review.
- [x] Complete remaining release-gate corrections: canonical 66-book Apps Script names, generated-source validator coverage, and schema-valid active-prefix extension coverage.
- [x] Complete primary diff/security review, full repository gate, and fabricated 390×844 transition smoke.
- [ ] Commit/push, publish immutable Pages/backend artifacts, verify live bytes/workflows, and hand off the installed-iPhone contract check.

## Exact next action

Primary: stage only the accepted final release artifacts, rerun repository safety, commit/push, wait for GitHub safety/test and Pages publication, deploy one new immutable token backend while preserving both version-23 rollback deployments, and complete exact live verification. Then request the installed-iPhone update/reopen/Sync check. Do not generate commentary or advance the private Drive prefix in this calendar-only release.

## Implementation discoveries

- The locked v2 candidate can be transformed without mutating its bytes by retaining its reading IDs/content fields, shifting only active `dayIndex` by the 39 bridge entries, and placing the candidate version/fingerprint in separate activation metadata.
- The compact browser transport omits candidate rationale, stream-analysis, notes, and source payloads while retaining the fields needed for plan validation, calendar labels, preparation membership, and passage display.
- The rolling evaluator's real shared boundary is active `dayIndex`, not bridge-only `sourcePlanDay`; the September 9 T+7 target is the Genesis introduction at active day 40.

## Focused validation

- `npm run calendar:active:check` passed.
- `node --test tests/schedule.test.js tests/long-term-schedule.test.js tests/rolling-study-work-order.test.js tests/server-core.test.js` — 65 passing. This includes a VM execution of the generated Apps Script `dbrValidatePrivateConfig_` against the active calendar/current private prefix and fail-closed mutations; it also validates consecutive Genesis intro/Genesis 1 prefix extensions against both plan and reading schemas.
- Apps Script VM parsing plus `node --check scripts/lib/active-calendar.mjs` and `node --check scripts/extend-active-prefix.mjs` passed.
- `npm run calendar:active:check` passed: active calendar has 1,263 entries.
- `npm run safety` — passed (337 files).
- `git diff --check` — passed.
- `npm run check` passed: 27 schemas, 28 private-prefix readings, 39 bridge reference readings, 261/261 tests, all builds, and exact Pages artifact verification.
- Accepted build IDs are server `6c9af1e55eea498f`, frontend `ed7334640c4374d5`, and PWA `dcbfe042ccb37dd0`.
- A fabricated 390×844 local browser smoke rendered the full September month without horizontal overflow; September 15/16/17 resolved to Malachi 4, Genesis introduction, and Genesis 1. Selecting both long-term entries showed four-stream days 1 and 2 and kept Open disabled until preparation.
