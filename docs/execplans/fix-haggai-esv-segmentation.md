# Fix short-book ESV display segmentation

## Goal

Allow Haggai 2 and any future chapter that is longer than half of its biblical book to open in the reader without violating the current ESV per-page display or local-storage limits, and make every Scripture-unavailable warning itself open the exact selected passage on ESV.org.

## Requirements

- Preserve the ESV-only application and server-side API-key boundary.
- Distinguish the ESV API's explicit request exception for one- and two-chapter books from the current page-display and local-storage language, which does not state that exception.
- Divide an individually over-limit chapter into complete, contiguous, non-overlapping verse ranges, each within the per-book display ceiling.
- Show those ranges as readable Scripture tabs on the existing single Scripture page.
- Keep exact passage URLs for the active range and for any failure fallback.
- Make the full warning banner a real, keyboard-accessible link when Scripture is unavailable.
- Preserve caching, verse-of-the-day lookup, highlighting, mock mode, older client compatibility, and immutable rollback deployments.
- Publish the validated code-only update to the existing Pages and token-backend deployments; do not move rollback deployments or write private Drive content.

## Constraints and non-goals

- Do not store ESV text in Git or private commentary files.
- Do not broaden the 500-verse, half-book, age, or offline-retention policy.
- Do not claim that the official API refuses Haggai 2; the restriction being handled is the conservative display/storage boundary.
- Do not alter the factual reading plan, stable reading IDs, private content, comments, highlights, or reader identities.
- Do not introduce runtime AI or another Bible translation.

## Relevant repository state

- `app/shared/server-core.js` currently partitions only at configured-passage/chapter boundaries and rejects a selected chapter that itself exceeds half its book.
- Haggai contains 38 verses; Haggai 2 contains 23, so the current half-book display ceiling is 19 verses.
- `app/apps-script/Code.gs` already supports verse-range ESV references and exact ESV.org URLs.
- `app/frontend/app.js` currently derives Scripture tabs and cache keys directly from plan passages, so it must use the same deterministic display segments as the server.
- `app/frontend/index.html` renders the error as plain status text beside a separate exact-passage link.
- The complete Celebration D054–D092 schedule implementation is already present in this clean checkout and must be retained.

## Decisions

- Add one deterministic display-segmentation helper to shared server core and consume the same segment shape in the browser.
- Split over-limit configured passages into balanced contiguous ranges no larger than the per-book limit. For Haggai 2 this yields two short range tabs rather than an arbitrary hard cut followed by a tiny remainder.
- Continue using the existing `passageIndex` wire field as the display-option index for backward compatibility. For readings that never need within-chapter splitting, indices remain unchanged.
- Cache display segments under their display-option index; the policy engine remains authoritative before every write.
- Use a block-level anchor for `scriptureState`, removing its `href` during non-error states and assigning the exact active ESV URL only for unavailable states.

## Milestones

1. Implement and test deterministic within-chapter display segments in shared core and Apps Script responses.
2. Update browser selection, tabs, exact URLs, mock mode, cache lookup/write, verse selection, and the clickable warning.
3. Update ESV integration documentation and project state.
4. Run focused tests, repository safety, build, Pages publication, full checks, diff review, backend deployment, commit/push, and live verification.

## Acceptance criteria

- Opening Haggai 2 produces selectable verse-range tabs and no `PROVIDER_DISPLAY_LIMIT` failure.
- Every emitted range is contiguous, exhaustive, non-overlapping, at most 19 Haggai verses, and no more than 500 verses.
- The active range's ESV.org URL is exact.
- An unavailable/policy warning is a visible link whose entire banner opens that exact URL.
- Cache writes and reads use the active segment and cannot bypass provider limits.
- Existing ordinary and multi-chapter reading behavior remains covered by tests.
- `npm run safety`, `npm run build`, `npm run publish:pages`, and `npm run check` pass.
- Only the active token backend is advanced; immutable rollback deployments remain unchanged.

## Validation

- Focused shared-core/frontend tests for Haggai segmentation, exact URLs, caching, and linked warning semantics.
- Repository-wide `npm run check` after generated Pages assets are published.
- Explicit diff/status and generated-artifact inspection before staging.
- Live exact-passage and deployed-build checks without logging Scripture or secrets.

## Progress

- [x] Official ESV request/display/storage wording checked on 2026-08-21.
- [x] Failure path and affected browser/server/cache layers identified.
- [x] Shared segmentation and backend integration.
- [x] Frontend integration and linked warning.
- [x] Documentation and project-state update.
- [x] Full validation, publication, and live verification.

## Discoveries

- The official 2023 API change explicitly permits a response containing more than half of a two-chapter book such as Haggai, but the current display and local-storage conditions separately retain the half-book ceiling without stating that exception.
- The present failure is generated by this application's conservative post-fetch display gate, not by the ESV passage API.
- Focused shared-core/frontend validation passed 77/77 after adding Haggai 2's balanced 1–12 and 13–23 display ranges, flat cache-key selection, exact range URLs, and the full warning-link behavior.
- Repository-wide validation passed 210/210 tests; immutable token version 29, frontend `d04e8089f8baf34f`, and PWA `c0d71d2e81f89997` passed exact Google/HTTPS byte readback. The local Haggai interaction smoke and live unauthenticated shell smoke passed at 390×844. Only the installed-iPhone authenticated Haggai check remains external.

## Exact next action

Accept/restart the installed Pages PWA, switch through Haggai 1, 2:1–12, and 2:13–23, and confirm that a deliberately unavailable state opens the exact selected ESV.org range.
