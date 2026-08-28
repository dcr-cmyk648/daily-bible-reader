# Compact prepared-resource picker

## Goal

Add the approved Book and Chapter/Overview picker to the installed Pages reader as a compact control at the top of the app, allowing Dustin or Shane to reopen any currently prepared study resource without changing the calendar selection or falsely completing a day.

## Requirements

- Place a compact, accessible picker in the sticky app header so it is available from both Home and a reading without displacing the selected-day card from the top of Home content.
- Use two native controls labeled for screen readers: Book and Chapter/Overview. A small explicit Open action may accompany them if that produces safer iPhone behavior than opening on selection.
- Build availability only from the validated active plan plus the server-provided `preparedReadingIds`; do not add a public content index, private IDs outside the authorized bootstrap, or a new backend call.
- List books in first-occurrence plan order. Include all chapters declared by each plan `bookMetrics` record and an Overview option. Disable books with no prepared resource and disable unprepared Overview/chapter choices.
- A full prepared chapter is selectable. A multi-chapter daily entry may map each constituent chapter to the same stable reading occurrence. A partial Proverbs or other verse-range contribution must expose its exact coverage in the option label, and multiple prepared ranges in one chapter must remain independently selectable.
- Opening from the picker uses the existing three-page reader, private payload/cache, ESV adapter, comments, highlights, and occurrence-keyed history. It starts on Orientation.
- Library navigation may open an authorized prepared occurrence independently of its calendar date. The client must never offer that mode for an unprepared occurrence, and existing server/manifest validation remains authoritative.
- Merely browsing must not create a comment, completion, note, or highlight event. If the user later comments or highlights, the normal occurrence-keyed behavior remains unchanged.
- Clearly but compactly identify library mode in the reading position; do not add a large banner.
- Preserve dark mode, 44px touch targets, iPhone safe areas, keyboard navigation, screen-reader labels, no horizontal overflow, and current startup/caching behavior.

## Constraints and non-goals

- No Apps Script/backend, authentication, token transport, Drive, Sheet, manifest, sharing, IndexedDB schema, ESV policy, service-worker policy, or private-content changes.
- Do not activate the long-term v2 plan or expose its review candidate to the live reader.
- Do not add ESV text, commentary, reader identities/codes, private Google IDs, or private content to Git/Pages.
- Do not implement the future permanent Drive resource schema, permanent note events, or whole-library caching in this milestone. This picker is the prepared active-plan surface that those later contracts can extend.
- Preserve immutable prior Pages releases and the stable Apps Script rollback.

## Relevant repository state

- `main` is `7a53f98` at milestone start.
- `app/frontend/index.html`, `styles.css`, and `app.js` are the shared source for the Pages PWA and rollback-compatible frontend build.
- The active bootstrap already includes a validated plan, `bookMetrics`, and a contiguous `preparedReadingIds` prefix. `hasPreparedReading` is the current client membership gate.
- `openReading` and `loadReading` already reuse cached private content, stream policy-compliant ESV, and load occurrence-level discussion.
- Frontend release `0ddb985f7d7adef0` and PWA `2cdc4cede6ed8fde` are the current phone-confirmed code artifacts.

## Milestones

1. Add pure catalog/availability helpers and focused tests covering full chapters, multi-chapter occurrences, unavailable resources, introductions, partial ranges, duplicate chapter ranges, and library-mode schedule behavior.
2. Add the compact semantic header controls, render/wire them from bootstrap state, and integrate prepared library-mode opening with the existing reader.
3. Add restrained responsive styling and update architecture/backlog/project state to distinguish this active-plan picker from the later permanent Drive library.
4. Run focused frontend tests and `npm run check`; inspect the final diff; build and publish a new immutable Pages/PWA release; verify exact public bytes and an iPhone-width browser smoke before handoff.

## Acceptance criteria

- The header visibly contains compact Book and Chapter/Overview controls plus an explicit usable Open action at 390px width, with no horizontal overflow.
- The catalog is deterministic and derived only from the active plan and prepared membership.
- Unprepared resources cannot be opened through the picker; partially prepared ranges are labeled exactly.
- Picker-opened studies start on page 1 and use their original `readingId`; opening alone cannot mark completion.
- Calendar selection, future-lock behavior outside library mode, daily completion, comments, highlights, offline startup, hot-path ESV caching, and prepared-prefix validation remain unchanged.
- Repository safety, focused tests, full `npm run check`, release build/publish verification, and mobile smoke pass.

## Progress

- [x] Product behavior and safety boundary derived from the approved permanent-library design and current active-plan constraints.
- [x] Implement and test the catalog and UI.
- [x] Complete primary review, immutable release packaging, repository-wide validation, and iPhone-width smoke.

## Exact next action

Publish the validated code-only release to `main`, verify the GitHub safety and Pages workflows plus exact live release metadata, and then have the installed iPhone PWA apply the update. No backend or private-data migration is required.
