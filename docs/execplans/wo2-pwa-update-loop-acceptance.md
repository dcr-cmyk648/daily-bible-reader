# WO-2 installed-PWA update loop — October 13, 2026

Status: immutable candidate prepared; final full check passed; production and
phone gate held. Full check: 929 tests, 926 passed, zero failed, three existing
PDF tests skipped because their exact pinned bundled Python is unavailable.
The PDF security pin is unchanged. Focused PWA tests: 27/27, zero skipped.
Ignored private-draft validation is absent in this worker; private publications
and their validation remain manager-owned.
The manager owns the final commit/push slot, backend staging, refreshed live
health, combined human request, promotion and PROJECT_STATE.md update.

Candidate: `db2a843f2ed0b875`, frontend `d860b9cb39f4f2b8`, source PWA build
`0215ec22e0320d30`. [Exact canary URL](https://dcr-cmyk648.github.io/daily-bible-reader/web/pwa-canary/canaries/db2a843f2ed0b875/).
The installed canary's shell/worker ID is `db2a843f2ed0b875`; the source PWA build
ID is a separate artifact. Required heartbeat backend stays **`5d9dd7e6b06df851`**:
this SW fix changes no backend contract. The common build emits `eae99b89de758120`
only because its build digest includes the modified HTML template. All frozen
Oct 11 server inputs are unchanged except that template, and token Code differs
only in DBR_BUILD_ID. Recompiling the approved inputs at `466058d` reproduces
`5d9dd7e6b06df851`; all four token files match their approved SHA-256 hashes.
They are preserved separately in ignored `tmp/wo2-approved-heartbeat-5d9/dist/apps-script-token-canary/`.
The manager verifies that actual backend before the combined phone gate; neither
bundle is cloud-staged by this worker. Production remains frontend `844ce06fb805f5f4` and PWA
`8fcefb5ae56b5def`.

## Evidence and limits

The user reports the installed root PWA repeatedly shows **A newer reader is
ready**, and **Restart with update** immediately reloads and restores that panel,
including after force-close. The manager verified unchanged October 1 production
SW `8fcefb5ae56b5def`, stable served worker bytes and no waiting worker in clean
Chromium. This worker has no installed-iPhone inspection evidence.

Before this change, the client exposed every waiting worker as a new release,
without identifying it, and reloaded on every controllerchange. Its reload guard
existed only in page memory. The worker chained cache pruning before claim, so
a cleanup rejection skipped claim. CacheStorage lookups were origin-wide and
root navigation handling encompassed nested canaries. These are verified code
defects. Whether WebKit repeats a same-release waiting worker, fails activation,
or involves the parent registration on the user's phone remains an inference.

The fix follows the documented distinction between requesting activation and
claiming clients: [skipWaiting](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting)
and [waitUntil](https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil).
It does not assert a specific WebKit defect or clear reader data.

## Resulting lifecycle

- A bounded MessageChannel handshake identifies the worker's actual release and
  registration scope. A matching loaded-shell release activates silently without
  a reload. Legacy workers use a SHA-256 of the fetched public script to identify
  a bounded attempt; those network bytes are not claimed as the installed release.
- An explicit update writes a scope-specific public-only localStorage marker
  before activation and before its one allowed reload. Reopening suppresses the
  same attempted identity; a genuinely different target can be offered. Storage
  denial disables automatic restart. First install, unrelated claims and silent
  same-release activation never cause an automatic reload.
- Public diagnostics in **Cache, policy, and build details** expose shell,
  controller and waiting releases, a legacy fingerprint, attempt/reload state,
  storage availability and bounded cleanup/claim codes. No identity, credential,
  private payload, backend URL or arbitrary exception text enters this marker
  or diagnostic.
- Cleanup failure cannot skip claim or reject activation. Claim failure remains
  visible. Cleanup preserves one prior own cache and any foreign/unidentified
  cache. Fetch fallback uses only the current registration's cache. The parent
  worker does not intercept nested-canary navigation. Existing IndexedDB names,
  reader credentials, transport and content/event identities are unchanged.

## Automated acceptance

`tests/pwa-update-lifecycle.test.js` uses fabricated workers, network, storage and
public shell responses. It covers same-release waiting, first install, repeated
controllerchange, one explicit restart, force-close recovery, a different later
release, legacy identity limits, storage denial, activation failure, parent claims,
scope-specific markers, cleanup/claim failures, message-event lifetime, own-cache
retention, nested navigation and private/unallowlisted request exclusion.

Run repository safety before build/staging. Generate an immutable unselected
canary, run canary-only `publish:pages`, then `DBR_RELEASE_MODE=unselected npm run
check`. Preserve every published release and the selected production hashes.
The final artifact record is `config/unselected-reader-canary.json`; its IDs and
URL must be copied from the final successful build, not an intermediate run.

## One combined installed-iPhone gate, routed by the manager

The existing Google sign-in/backend request stays with the manager. No duplicate
question is issued by this worker. When the matching backend has been staged and
verified, the manager combines its phone gate with this shell check in one sitting.

1. Open the exact final canary URL in Safari, Share → Add to Home Screen, name it
   **Reader canary**. Preserve the original installed production icon and its data.
2. Cold launch the canary. Confirm the final frontend ID from the artifact record,
   the manager's verified backend ID, correct reader identity and current calendar.
   Expand **Downloaded data → Cache, policy, and build details** and note the
   public shell update diagnostic's shell/controller IDs, state and claim/cleanup.
3. The same-release/first-install case must not offer **A newer reader is ready**
   or restart automatically. If a genuinely different waiting release appears,
   report its diagnostic first. An accepted restart must occur at most once; the
   same identity must not prompt again after reopening. An activation failure is
   reported, not turned into an indefinite restart loop.
4. Force-close and reopen twice. Confirm the calendar and saved reader identity
   survive, no update loop appears, and the diagnostic is stable. Do not clear
   downloaded data, remove enrollment, unregister workers or delete caches.
5. Open a prepared date → **Open selected reading → Scripture**. Confirm Scripture
   and the ESV notice. Make one reversible highlight, wait for saving to finish,
   reopen to verify it, remove it and verify removal.
6. Check preparation notice placement after the calendar. Compare its counts and
   heartbeat to the manager's fresh authenticated test-time health. October 13's
   last reported health was seven prepared/complete readings and Genesis 20
   unprepared; it is not a fixed expectation for a later test. Resolved Genesis 19
   approval must never be presented as still pending. Missing heartbeat fails the
   new backend-delivery gate. Fabricated offline tests prove the 30-hour stale
   branch; the phone proves actual fresh delivery without a fake clock or wait.
7. Reopen original production. Confirm normal operation and its retained frontend
   `844ce06fb805f5f4` / PWA `8fcefb5ae56b5def`. Its old update prompt may remain
   before promotion: testing a nested canary does not patch that installed root.
   Immutable USER_ACCESSING version 23 remains available and untouched.

Record exact PASS/FAIL step, frontend/server IDs and public update diagnostic.
A clean-browser or mocked-worker pass does not substitute for this phone gate.
An immutable nested canary with no waiting worker proves cold/reopen behavior;
the fabricated regressions separately exercise the waiting/update chain. Do not
claim that the user's original root loop is resolved before a gated production
release and subsequent root-install verification. Stop on failure; promote nothing.
