# Restore verse highlighting

## Goal

Find and fix the regression that prevents verse highlighting in the installed GitHub Pages reader, then publish a verified code-only Pages release without changing the Apps Script backend contract or private data.

## Requirements

- Tapping an ESV verse at iPhone width opens the combined verse-details/highlight sheet.
- Dustin can add and remove his highlight with immediate optimistic visual feedback.
- The authoritative write response reconciles the visible state; failures restore the prior state and remain understandable.
- Existing Dustin/Shane colors, overlap behavior, timestamps, owner-only removal, exact verse association, and Matthew Henry details remain intact.
- The optional highlight client must continue to be isolated from core startup and must not introduce an IndexedDB schema migration.

## Constraints and non-goals

- Use only fabricated Scripture and mock adapters in local tests.
- Do not read browser storage, expose reader codes, or use private commentary/ESV data.
- Do not change authentication, storage schemas, Apps Script deployment identity, private Drive/Sheet resources, or the version-23 rollback deployment.
- Preserve unrelated work in the selected workspace; this milestone runs in a fresh clean clone.
- Do not delete prior immutable `web/releases/` or versioned PWA clients.

## Relevant repository state

- Base commit: `c3a03f0` (`Fix mobile header and reading controls`).
- Live code releases before this repair: frontend `558fd5b0820789d5`, PWA `a70ee80b19780072`.
- Highlight behavior is split between `app/frontend/app.js` and the optional `app/frontend/highlights.js`; server behavior is covered by `app/shared/server-core.js` and the token bridge.
- The last release changed only responsive CSS and generated immutable Pages assets, so the investigation must not assume that CSS is the cause.

## Decisions

- Reproduce the interaction with the local mock at 390×844 before selecting a fix.
- Prefer the smallest client-side correction consistent with the evidence.
- A backend change is out of scope unless local evidence proves the public method contract itself is wrong; return that ambiguity to the primary agent instead of improvising.

## Milestones

1. Reproduce and identify the first broken boundary: verse event, sheet rendering, optimistic update, adapter dispatch, or reconciliation.
2. Add a regression test that fails for the observed cause, implement the bounded fix, and pass focused tests.
3. Primary review, iPhone-width browser smoke, full repository release gate, immutable Pages publication, GitHub workflow verification, and live byte/MIME verification.

## Acceptance criteria

- A fabricated iPhone-width browser smoke opens a verse, adds a highlight, observes the immediate saving/selected state, receives the mock authoritative state, removes the highlight, and sees the unselected state.
- The test also confirms the sheet remains tappable, focus returns correctly, and no horizontal overflow or application console error occurs.
- Focused highlight/frontend tests and `npm run check` pass.
- Repository safety passes before staging and publication.
- The new live Pages shell/client/release files match the committed bytes and expected MIME types.
- `PROJECT_STATE.md` records the cause, fix, validation, release IDs, and unchanged backend boundaries.

## Progress

- [x] Fresh clone created from `c3a03f0`; selected dirty workspace left untouched.
- [x] Root cause reproduced and documented.
- [x] Regression test and implementation accepted; `node --test tests/outbox-and-frontend.test.js` passed (54/54), including fabricated add/remove behavior with the unavailable DOM APIs and focus-options fallback.
- [x] Follow-up 2b: added shared cached-shell reconfirmation before calendar, discussion/outbox, and highlight RPC paths; explicit failures route to the fail-closed UI and stop local fallback, online verse sheets support manual retry, and `node --test tests/outbox-and-frontend.test.js` passed (55/55).
- [x] Full release gate passed: repository safety inspected 303 files; 247/247 tests, all validators/builds, and exact Pages verification passed.
- [ ] Pages release deployed and verified live.

## Discoveries

- The `c3a03f0` Pages release changed responsive CSS but retained byte-identical core and optional highlight assets from the prior release, so the CSS change did not alter highlight event, adapter, or reconciliation logic.
- The optional client is built for Safari 12 but used `replaceChildren()` and `replaceWith()` while rendering the verse-details sheet. Those DOM APIs are not provided by Safari 12; this is a real defensive compatibility defect, but it is not proven to be the current user's root cause. The repair uses local `removeChild`/`replaceChild` helpers and falls back to ordinary `focus()` when the focus-options dictionary is not accepted.
- The token deployment and generated response-origin boundary were independently probed by the primary and are healthy. The evidence-backed cause of the general sync symptom is stale cached-shell authorization readiness: after a transient confirmation failure, `serverAccessConfirmed` remains false, and calendar/comment/outbox/highlight paths previously stopped at cached local state despite the browser being online. `recoverServerAccess()` reuses the existing `authorizationPromise`, refuses all network calls when `navigator.onLine === false`, returns a distinct handled outcome after routing explicit authorization failures to the fail-closed UI, and otherwise retries the cached-shell confirmation before explicit shared RPCs. The calendar/comment/outbox callers stop on that handled outcome; only transient failures retain the local fallback. The verse sheet keeps a visibly retryable action only when the browser is online and guards its state after awaited recovery.

## Exact next action

Commit and push the prepared frontend `dada2adad57f8a21` / PWA `30035a84a8584888` release, wait for GitHub safety and Pages completion, and verify the live files byte-for-byte with expected MIME types.
