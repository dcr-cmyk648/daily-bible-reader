# Repair installed-iPhone false-offline recovery

## Goal

Make the installed Pages reader recover its authenticated Apps Script connection and authoritative current-study payload when iOS reports a stale `navigator.onLine === false` value despite working cellular/Wi-Fi connectivity.

The first published repair removed the false reachability veto and the second hardened the WebKit named-frame POST transport, but the installed-phone gate still failed. The authoritative goal is now to keep valid cached data usable while accurately surfacing backend content-publication failures, and to prevent an incomplete private plan/manifest promotion from masquerading as an offline or authentication problem.

## Requirements

- Keep the retained calendar/commentary first paint immediate and usable.
- Treat `navigator.onLine` only as a presentation hint; backend request success/failure is the connectivity authority.
- Startup, `pageshow`/visible resume, returning to Home, and the visible Sync controls must be able to attempt one deduplicated access confirmation even when `navigator.onLine` is false.
- A successful confirmation must revalidate the open/current study and calendar/discussion state so a newer commentary version/hash rerenders without clearing downloaded data.
- A genuine transport failure must retain cached data, drafts, and queued idempotent writes, expose a retryable state, and avoid a request storm.
- An explicit reader-code/access denial must preserve its backend error code and fail closed rather than being mislabeled as an ordinary network failure.
- Harden the form/iframe transport if needed so a newly inserted target is ready before submission and the core timeout cannot fire before the transport's own timeout.
- Preserve the token backend, deployment identity, Drive/Sheet/ESV contracts, IndexedDB schema, and service-worker private-data boundary unless direct evidence proves a backend change is necessary.
- After a successful access confirmation, preserve and classify downstream RPC error codes. A private publication/configuration failure must not be reported as network offline, must not clear cached content or queued writes, and must not trigger a storm of calls that are known to depend on the same invalid private state.
- A private reading publication is not complete until its rolling plan and manifest contain the same contiguous prefix and a real authenticated `getBootstrapData` read succeeds after manifest-last promotion.

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
- [x] Pages release deployed and verified live.
- [x] Reopened WebKit transport repair implemented, accepted, fully validated, published, and verified live; pending installed-phone gate.
- [x] Real Dustin-authenticated direct-backend diagnostic isolated the actual failure as `CONTENT_INVALID` after successful `confirmReaderAccess`.
- [x] Drive mismatch identified: manifest through D081 (28 records), active rolling plan only through D079 (26 records).
- [x] Validated 28-entry plan restored in place; raw Drive readback matches the manifest prefix and all read-only backend routes now succeed.
- [x] Client classification/storm-control regression milestone implemented and fully validated as an immutable release candidate.
- [x] Publication workflow and the active daily automation require exact plan-prefix readback plus authenticated bootstrap health before declaring success.
- [ ] Publish the validated code-only release and pass the installed-iPhone Sync gate.

## Exact next action

Publish the validated code-only release, verify GitHub workflows and exact live bytes/MIME, then repeat the installed-iPhone Sync check without clearing downloaded data.

## Discoveries

- The first broken boundary was client-side reachability gating: several recovery paths treated `navigator.onLine === false` as authoritative, so a stale iOS hint suppressed confirmation before any authenticated bridge request could run.
- Recovery remains deduplicated by `authorizationPromise`; a 15-second retryable-failure cooldown bounds resume/page-show storms, while visible Sync and a verse-sheet highlight tap explicitly bypass that cooldown for one manual retry.
- Successful confirmation already starts the existing bootstrap/calendar background refresh. Open-reading revalidation then persists the authoritative payload and lets the revision-aware persistence path rerender only a changed study; discussion/outbox refresh follows through the confirmed shared path.
- The Pages compatibility runner was discarding `error.code`. It now passes the bridge error through intact, and the core wrapper retains that code so explicit reader-code/access denial reaches the existing fail-closed gate.
- The form bridge now defers submit one event turn after inserting its iframe target. The core RPC timeout is 50 seconds, after the bridge's 45-second bounded timeout, so core cannot preempt the transport error.
- The phone's later sequence, `Sync paused · retry available` followed by `Offline · saved calendar available`, could not be produced by a failed initial confirmation: `flushOutbox()` reaches that state only after server access is considered confirmed and a downstream write fails. The calendar catch then discarded the error code and mislabeled every failure as offline.
- A read-only direct POST to the intended Apps Script backend, using the locally retained Dustin credential without exposing it or private response data, proved `confirmReaderAccess` succeeded while `getBootstrapData` returned `CONTENT_INVALID`.
- The canonical Drive manifest had 28 records through D081 while its referenced rolling plan had only 26 entries through D079. `dbrValidatePrivateConfig_()` correctly rejected the non-identical prefix; every comment/highlight/calendar route rereads that private state, so the one publication mismatch disabled all shared operations.
- D080 and D081 publication-result records asserted payload and manifest readback but contained no assertion that the rolling plan was updated/read back or that authenticated bootstrap succeeded. That missing release gate allowed both publications to be marked successful while leaving the backend unusable.
- Replacing the referenced plan with the repository's validated 28-entry fixture restored a matching D054–D081 prefix. Raw Drive readback reported 28 entries and the live backend then succeeded for confirmation, 39-entry bootstrap with 28 prepared records, calendar activity, comments, highlights, and reading payload; an intentionally invalid empty comment stopped at `COMMENT_EMPTY` before any write.

## Authoritative repair decision

- Keep token authentication, owner-executed deployment identity, reader hashes, Sheet permissions, and Apps Script version 29 unchanged; direct evidence shows all are valid.
- Treat `CONTENT_INVALID` and other durable backend publication/configuration failures as a retained-data service fault, not as offline reachability. Preserve cached studies, drafts, and the outbox; show a concise actionable state and do not continue dependent background calls during the same failed refresh cycle.
- Preserve explicit authentication failures as fail-closed reader-code gates. Preserve genuinely transient transport errors as offline/retryable states.
- Require future publication records and the scheduled workflow to verify rolling-plan readback before manifest promotion and a real authenticated bootstrap read after promotion. A manifest-only assertion is insufficient.

## Focused validation

- `node --check app/frontend/app.js && node --check app/frontend/highlights.js && node --check app/pages-pwa/client.js`
- `node --test tests/outbox-and-frontend.test.js tests/pages-pwa.test.js` — 69 passing, 0 failing.
- `git diff --check` — passed.

## Full local validation

- `npm run safety` before generation — passed over 309 files.
- `npm run build && npm run publish:pages && npm run check` — passed; repository safety covered 313 files, all validators passed, 251/251 tests passed, and the generated Pages artifacts verified exactly.
- New immutable artifacts: frontend `f08fa5a23afa3ea2`; PWA `2968fc2194622313`.
- Fabricated 390×844 browser smoke forced `navigator.onLine === false` while leaving a successful private-bridge adapter available. The reader made exactly one confirmation attempt, set confirmed access, reported `Calendar synchronized`, had no page error, and had no horizontal overflow.

## Publication

- Code commit `a52322b` passed GitHub safety/test run `33397633499` and Pages deployment `33397632371`.
- All 12 live shell/release files returned HTTPS 200, matched the committed bytes exactly, and had the expected MIME types on the first verification attempt.
- Live immutable artifacts: frontend `f08fa5a23afa3ea2`; PWA `2968fc2194622313`.
- Apps Script version 29, both version-23 rollback deployments, Drive/Sheet state, private content, and authentication configuration were not changed.

## Reopened phone-gate evidence

- Dustin accepted PWA `2968fc2194622313`; synchronization still failed and returned to the offline retained-data state. This disproves the stale-`navigator.onLine` gate as the complete cause.
- A live 390×844 Chromium probe used only a fabricated invalid reader code. It completed the real Apps Script form bridge in about 2.4 seconds and received the expected `READER_CODE_INVALID` envelope, proving the public deployment and current nonce/origin response contract are alive.
- The response target is currently `iframe.hidden = true`, which maps to `display:none`. WebKit bug 3581 documents named iframes hidden with `display:none` disappearing from the frame collection, including a form-target scenario. That is materially consistent with an iPhone-only named-target failure while Chromium succeeds.
- The Pages CSP permits `form-action https://script.google.com` but not the generated `https://*.googleusercontent.com` response host. The CSP specification and cross-browser web-platform redirect test treat a redirected POST destination as part of the `form-action` boundary. `frame-src` already permits both hosts.
- The downloaded Playwright WebKit build cannot launch on this host's newer macOS version, so it cannot honestly substitute for the installed-phone gate. The implementation must add a regression contract for a rendered, non-focusable, offscreen frame and both Google form-action hosts, then rely on the actual iPhone as final acceptance.

## Reopened implementation decision

- Keep the per-request nonce-bound POST bridge, bearer-code body transport, exact origin, rate limits, and backend unchanged.
- Replace the display-none target iframe with a one-pixel, opacity-zero, pointer-inert, non-focusable offscreen iframe that remains in WebKit's rendered frame tree. Keep the form itself noninteractive and remove both nodes on settlement.
- Permit only `https://script.google.com` and `https://*.googleusercontent.com` in the Pages `form-action`, matching the already-approved `frame-src` hosts; do not broaden any other CSP directive.
- Preserve the one-turn post-insertion submit deferral and bounded timeout unless the focused implementation proves a narrower readiness step is required.

## Reopened implementation result

- The target iframe no longer uses `hidden`/`display:none`. It is fixed-position, one pixel, offscreen, opacity-zero, clipped, pointer-inert, `aria-hidden`, and `tabIndex=-1`, preserving a rendered named browsing context while remaining noninteractive.
- `form-action` now permits only `https://script.google.com`, the bare `https://script.googleusercontent.com` response host, and generated `https://*.googleusercontent.com` response hosts. `frame-src` carries the same exact set, matching the client's existing response-origin validator; no other CSP directive changed.
- Focused tests assert the rendered/inert properties, nonce-bound cleanup after submission, submit deferral, timeout ordering, exact CSP hosts, and explicit error-code propagation.

## Reopened focused validation

- `node --check app/pages-pwa/client.js && node --check scripts/build-pages-pwa.mjs`
- `node --test tests/pages-pwa.test.js` — 13 passing, 0 failing.
- `npm run build:pwa` — built local canary `ff1e8a6ddead3094` against frontend `f08fa5a23afa3ea2`.
- `git diff --check` — passed.
- `npm run verify:pwa` intentionally not run: it asserts the unpublished `web/pwa-canary/` matches this new local build, which would require forbidden publication/generated-artifact mutation.

## Reopened full local validation

- `npm run safety` before generation passed over 313 files.
- `npm run build && npm run publish:pages && npm run check` passed; repository safety covered 314 files, all validators passed, 252/252 tests passed, and the generated Pages artifacts verified exactly.
- New PWA artifact: `ff1e8a6ddead3094`; the unchanged frontend remains `f08fa5a23afa3ea2`.
- A fabricated 390×844 generated-PWA smoke exercised the actual form creation/submission/nonce-response cleanup path. The named target had `display:block`, fixed 1×1 geometry, opacity zero, pointer events disabled, `inert`, `aria-hidden`, and `tabIndex=-1`; all three exact Google request/response host patterns were present in `frame-src` and `form-action`; horizontal overflow was zero and no page error occurred.

## Reopened publication

- Code commit `4a147c6` passed GitHub safety/test run `33399811628` and Pages deployment `33399810254`.
- All 12 live shell/release files returned HTTPS 200 on the first verification attempt, matched the committed bytes exactly, and had expected MIME types.
- A live 390×844 Chromium probe with a fabricated invalid reader code completed the real Apps Script bridge in 2.6 seconds, returned the expected denial envelope, and reported no CSP violation.
- Live artifacts: unchanged frontend `f08fa5a23afa3ea2`; PWA `ff1e8a6ddead3094`.
- Apps Script version 29, rollback deployments, Drive/Sheet state, private content, reader codes/hashes, and device cache were not changed.

## Authoritative private-state repair and client result

- A direct authenticated diagnostic proved that the Dustin reader code, token hashing, reader identity, and Apps Script request bridge succeeded. The next call, `getBootstrapData`, failed with `CONTENT_INVALID`; this was a downstream private-state validation fault rather than an authentication or transport failure.
- The manifest contained the contiguous D054–D081 prepared prefix while its referenced active rolling plan stopped at D079. The referenced plan was repaired in place from the already validated 28-entry local plan. Exact raw Drive readback now contains D054–D081 in the manifest's order, and authenticated bootstrap, calendar activity, comments, highlights, and reading-payload reads all succeed. An empty invalid comment probe stopped at `COMMENT_EMPTY` before any write.
- Cached-shell confirmation now remains provisional until authoritative bootstrap succeeds. A durable content/publication failure retains the cached plan, studies, drafts, and outbox, reports **Study service update is incomplete** rather than **Offline**, and starts none of the dependent calendar/comment/highlight/background calls. Explicit access failures still invalidate confirmed access and fail closed; genuine transport failures retain the offline wording.
- The commentary/publication workflow and the active **Prepare Daily Bible Reader T+7** automation now require exact rolling-plan bytes, exact ordered plan/manifest-prefix equality, and a successful real authenticated bootstrap after manifest-last promotion. A failed post-promotion health check restores and verifies the prior manifest or reports an explicit incident.

## Authoritative repair validation

- Focused frontend checks passed: `node --check app/frontend/app.js`, 59/59 outbox/frontend tests, and `git diff --check`.
- The complete local release gate passed: repository safety over 318 files, all content/source/private validators, 254/254 tests, every build, and exact tracked Pages verification.
- Immutable release candidate: frontend `3e0281c1ba2d501c`; PWA `41ea61216d032f66`.
- A fabricated 390×844 browser smoke exercised both boundaries. Confirmation plus healthy bootstrap set confirmed access and started 13 downstream calls; confirmation plus `CONTENT_INVALID` retained the plan/session, started zero downstream calls, displayed the precise incomplete-service state, produced no horizontal overflow, and logged no application error.
