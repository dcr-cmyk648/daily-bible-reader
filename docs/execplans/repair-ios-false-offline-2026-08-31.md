# Repair installed-iPhone false-offline recovery

## Goal

Make the installed Pages reader recover its authenticated Apps Script connection and authoritative current-study payload when iOS reports a stale `navigator.onLine === false` value despite working cellular/Wi-Fi connectivity.

## Requirements

- Keep the retained calendar/commentary first paint immediate and usable.
- Treat `navigator.onLine` only as a presentation hint; backend request success/failure is the connectivity authority.
- Startup, `pageshow`/visible resume, returning to Home, and the visible Sync controls must be able to attempt one deduplicated access confirmation even when `navigator.onLine` is false.
- A successful confirmation must revalidate the open/current study and calendar/discussion state so a newer commentary version/hash rerenders without clearing downloaded data.
- A genuine transport failure must retain cached data, drafts, and queued idempotent writes, expose a retryable state, and avoid a request storm.
- An explicit reader-code/access denial must preserve its backend error code and fail closed rather than being mislabeled as an ordinary network failure.
- Harden the form/iframe transport if needed so a newly inserted target is ready before submission and the core timeout cannot fire before the transport's own timeout.
- Preserve the token backend, deployment identity, Drive/Sheet/ESV contracts, IndexedDB schema, and service-worker private-data boundary unless direct evidence proves a backend change is necessary.

## Evidence and repository state

- Base: `3c2b64e` on `main`; the prior release is frontend `81e02dcc477061b4`, PWA `3d946af577c6bd19`, token backend version 29, and rollback version 23.
- Dustin's installed iPhone accepted that release but still shows **Offline · saved calendar available** on working 5G and retains stale D077/Zechariah 7 content.
- Read-only live probes on 2026-08-31 returned HTTP 200 from the configured token deployment. A fabricated invalid-code form POST executed the current `confirmReaderAccess` route and returned the expected nonce-bound `READER_CODE_INVALID` result from Google's current generated sandbox host. No private credential or response content was used.
- Canonical D077 Drive content was previously verified current with distinct concise and expanded historical-context layers. The issue remains client recovery/transport, not content generation.
- Current client code hard-stops `recoverServerAccess()`, open-reading revalidation, Home/resume work, outbox flushing, and some highlight retry paths when `navigator.onLine === false`.
- The Pages form bridge appends a `hidden` target iframe and submits immediately. Its transport timeout is 45 seconds while the core RPC wrapper gives up after 30 seconds, and `createRunner()` currently drops backend error codes when invoking its failure handler.

## Decisions

- Reverse the earlier assumption that `navigator.onLine === false` proves the Apps Script bridge is unreachable. It may inform wording but cannot suppress a user-initiated or bounded recovery attempt.
- Prefer a small code-only client/PWA transport repair. Do not redeploy Apps Script merely to compensate for a browser-side reachability decision.
- Deduplicate access and per-reading refresh attempts; add a bounded cooldown or equivalent only if needed to prevent genuine-offline resume storms.
- Keep all automated/local browser data fabricated. Never inspect a real browser profile, reader code, private response, or ESV text.

## Milestones

1. Add focused regression coverage for false-offline-but-successful access, genuine failure retention, explicit denial code propagation, and any transport readiness/timeout invariant selected by the implementation.
2. Implement the smallest client/PWA transport change that passes those cases and preserves existing comment/highlight/idempotency behavior.
3. Primary review, mobile fabricated-data smoke, repository safety/full check, immutable Pages publication, GitHub workflow and live byte/MIME verification, then installed-iPhone handoff.

## Acceptance criteria

- With a cached shell and `navigator.onLine === false`, a successful mocked confirmation is actually attempted once, sets confirmed access, refreshes the authoritative open/current payload, and clears the stale offline state.
- The visible Sync control also attempts recovery under the same false-offline condition.
- A nonresponding/failed bridge leaves cached content and drafts intact with retry available and no unbounded loop.
- `READER_CODE_INVALID`, `AUTH_REQUIRED`, and other explicit access codes survive the Pages shim and reach the fail-closed reader gate.
- The Pages bridge never starts the core timeout before its own request can settle; any frame-readiness hardening is regression-tested.
- `npm run check`, a 390×844 fabricated mobile smoke, immutable Pages publication, GitHub workflows, and exact live HTTPS byte/MIME comparison pass.

## Progress

- [x] Installed-phone failure confirmed after the previous update.
- [x] Live token deployment and nonce-bound response route verified read-only with a fabricated invalid credential.
- [x] False-offline hard gates and transport timeout/error-propagation weaknesses identified.
- [x] Focused implementation milestone implemented and accepted after primary diff review.
- [x] Full local release gate passed.
- [ ] Pages release deployed and verified live.

## Exact next action

Commit and publish the immutable Pages release, verify GitHub workflows and exact live bytes/MIME, then request the installed-iPhone recovery check.

## Discoveries

- The first broken boundary was client-side reachability gating: several recovery paths treated `navigator.onLine === false` as authoritative, so a stale iOS hint suppressed confirmation before any authenticated bridge request could run.
- Recovery remains deduplicated by `authorizationPromise`; a 15-second retryable-failure cooldown bounds resume/page-show storms, while visible Sync and a verse-sheet highlight tap explicitly bypass that cooldown for one manual retry.
- Successful confirmation already starts the existing bootstrap/calendar background refresh. Open-reading revalidation then persists the authoritative payload and lets the revision-aware persistence path rerender only a changed study; discussion/outbox refresh follows through the confirmed shared path.
- The Pages compatibility runner was discarding `error.code`. It now passes the bridge error through intact, and the core wrapper retains that code so explicit reader-code/access denial reaches the existing fail-closed gate.
- The form bridge now defers submit one event turn after inserting its iframe target. The core RPC timeout is 50 seconds, after the bridge's 45-second bounded timeout, so core cannot preempt the transport error.

## Focused validation

- `node --check app/frontend/app.js && node --check app/frontend/highlights.js && node --check app/pages-pwa/client.js`
- `node --test tests/outbox-and-frontend.test.js tests/pages-pwa.test.js` — 69 passing, 0 failing.
- `git diff --check` — passed.

## Full local validation

- `npm run safety` before generation — passed over 309 files.
- `npm run build && npm run publish:pages && npm run check` — passed; repository safety covered 313 files, all validators passed, 251/251 tests passed, and the generated Pages artifacts verified exactly.
- New immutable artifacts: frontend `f08fa5a23afa3ea2`; PWA `2968fc2194622313`.
- Fabricated 390×844 browser smoke forced `navigator.onLine === false` while leaving a successful private-bridge adapter available. The reader made exactly one confirmation attempt, set confirmed access, reported `Calendar synchronized`, had no page error, and had no horizontal overflow.
