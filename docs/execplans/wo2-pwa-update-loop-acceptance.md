# WO-2 installed-PWA update loop — October 13, 2026

## October 14 content-service recovery addendum

Current local candidate is `bc807348628702da`, frontend `d2331e5f07272b57`, source
PWA `e17da696d5c31341`; use `config/unselected-reader-canary.json`. Its prepared
[URL](https://dcr-cmyk648.github.io/daily-bible-reader/web/pwa-canary/canaries/bc807348628702da/)
is not published yet. GitHub push/publication, Google deployment
and promotion are held for the manager's overnight release window. All private
publication must finish before 06:30 Eastern; 06:30–23:30 publication is reserved
only for a missing devotional today/tomorrow. The recovered reader has no exception.

The 08:31 and 08:38 iPhone reports showed a generic fatal banner with confirmed
access, eight cached entries and disabled Open/comments. Production assets were
unchanged. The GEN21 manifest switch was 08:34:15.765 Eastern; success heartbeat
was 08:37:48.093. First failure therefore precedes the pointer switch. Only GEN21's
pointer changed; immutable candidate/readback matched. There is no retained device
exception. Review/publication overlap and recovery after completion are timing
evidence, not proof of a particular error or an inconsistent manifest interval.

Exact Oct 1 production source was already cache-first, restored typed drafts,
and used background revalidation. It did not validate every saved payload's
reading/prepared state, mapped content-service refresh faults to failed refresh,
and could fatally close the whole reader when an uncached open failed. The new
client rejects expired/context/plan/reading mismatches and unprepared placeholders,
validates incoming content before cache acceptance, and retains a validated saved
study on explicitly recognized content/transport faults. Existing bounded retries
and manual Retry commentary remain visible independently of discussion sync.
Without usable content, it clears the previous study and Scripture, preserves the
draft, disables only that reading's discussion controls, and keeps Home/other
saved readings usable. A validated retry restores the study. Explicit denial stays
denial; programming/storage errors remain fatal with a safe code and a finite
operation label. No raw message/stack, reading IDs, comments, credentials or
identity enter the retained public fatal diagnostic.

Independent review reproduced four blockers before acceptance: a pending open
returning after Home, a null summary paragraph replacing a good cache, a delayed
A draft reaching B and autosaving under B, and stale Scripture heading/tabs.
The repair validates renderable shapes before replacement, scopes awaited reading,
draft, discussion and Scripture UI by reading/load generation/reader session,
captures draft-save and submit reading keys, and clears old Scripture headings,
tabs and highlight/verse-sheet context. Deferred DOM regressions cover A→B and
A→Home→A, actual draft writes, submission after navigation, obsolete refreshes
and replacement sessions. Validated legacy v1/v2 summaries, book introductions,
complete Henry and full-source fallbacks remain supported. Focused checks pass
92/92 with no skips; final full-repository acceptance is recorded separately below.

Final October 14 local check: **965 total, 962 passed, zero failed, three existing
PDF skips**. The PDF runtime/security pin is unchanged; ignored private drafts are
absent in this worker. The manager's published private-content gate remains
separate (475/475). Log: ignored `tmp/wo2-content-recovery-final-check.log`, SHA-256
`07fcfb7e4f49a5e3bb366b74334bffb77b6b6ac1c9b23ecfed085f64a89bc7fe`.
All 201 previously tracked public assets match HEAD byte-for-byte; all four frozen
approved backend files match their retained hashes. Source-backed canary verification
passes. No live browser/phone pass, GitHub push, Google upload or promotion is claimed.

Batch/rate inspection: priority warming requests two hot readings, full-window
warming requests up to eight, and health splits its eight-reading request into
four-reading groups. They consume the same reading-batch allowance for Dustin
when using Dustin's credential; overlap does not prove exhaustion. Generic legacy
server source uses UserProperties; the Oct 1/current token builder replaces this
with ScriptCache keyed by reader hash and bucket. The frozen approved 5d backend
is per-reader, so shared owner properties must not be inferred as its behavior.
Google's [property scopes](https://developers.google.com/apps-script/reference/properties/properties-service#getuserproperties)
and [execution identity](https://developers.google.com/apps-script/guides/web#permissions)
explain the legacy concern. Actual deployed variant/incident error remains
unverified. No identity, rate limit, warming policy or health cadence was changed;
no live hammer test or diagnostic account was used.

TokenBridge response generation embeds JSON in an unbounded inline postMessage
script line. Node health parsing does not exercise WebKit execution of it. This
is an unproven live-only candidate, not an established line-limit cause; retained
release history rejects line length as sufficient. The healthy 19.3-second Node
response is below 45 seconds but does not prove iPhone transport health. Frozen
approved backend 5d is unchanged. Any future backend transport change needs a
separate concrete proposal and gate, not silent substitution.

For the ONE manager-owned combined phone gate, after overnight publication and
matching backend verification: install the exact FINAL candidate, confirm its
frontend/server IDs, cold-launch and reopen twice without clearing data, open a
prepared reading and inspect the separate commentary refresh status, confirm
the existing draft remains correct when switching prepared dates and returning
Home, verify no previous passage heading or tabs remain, save/remove one reversible highlight or
comment, and confirm the original production icon still opens. A real content
failure must retain a valid saved study with Retry commentary; an uncached failure
must not display another reading or disable Home. If a fatal occurs, report only
its visible code plus lastFatal time/phase/operation from build details. Do not
provoke live failures or copy private text/codes into evidence. Fabricated DOM
tests cover failure/denial cases; they are not a phone pass. The manager refreshes
actual buffer/heartbeat expectations and retains all earlier shell/backend gates.

## Previous October 13 acceptance

Status: bounded full-window warning follow-up checked; production and phone gate
held. Final follow-up check: 931 tests, 928 passed, zero failed, three existing
PDF tests skipped because their exact pinned bundled Python is unavailable.
The PDF security pin is unchanged. Focused PWA tests: 27/27, zero skipped.
Ignored private-draft validation is absent in this worker; private publications
and their validation remain manager-owned.
The manager owns the overnight push/publication slot, backend staging, refreshed
live health, combined human request and promotion. WO-2 updates PROJECT_STATE.md.

Released SW candidate: `db2a843f2ed0b875`, frontend `d860b9cb39f4f2b8`, source PWA build
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

## Final full-window warning guard

The manager's fabricated seven-of-eight complete window exposed an inherited
five-future-day green threshold. That could hide the newly entering T+7 gap.
The amber threshold now compares complete future days with the actual future
target. Existing red thresholds and fallback warnings stay unchanged. Regression
tests prove a missing published reading stays amber despite complete cached
payloads, and fully complete terminal windows of one, two, three and seven total
readings stay green without requiring nonexistent days. The focused preparation
tests pass 15/15 with no skips.
The compiled final frontend also passes an isolated fabricated VM smoke:
seven-of-eight with full cached payloads renders amber with a missing-study notice;
a fully complete three-reading terminal window is green with no notice. This is
not a live browser or installed-phone pass.

**Use the new phone candidate `2b4524cd5635c307`, frontend `e6fb72a5afa9b6a3`,
source PWA build `ff651cf2614bf2c3`:**
[exact candidate URL](https://dcr-cmyk648.github.io/daily-bible-reader/web/pwa-canary/canaries/2b4524cd5635c307/).
The previously published db2 directory, client and frontend remain immutable.
The approved frozen heartbeat backend remains `5d9dd7e6b06df851`.

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
