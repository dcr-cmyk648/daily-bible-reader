# Architecture

Status: operating pilot plus temporary Celebration bridge, 2026-08-08.

## Hosting decision

Use a Google Apps Script HTML-service web app, deployed for signed-in Google accounts and configured to execute as the user accessing the app (`access: ANYONE`, `executeAs: USER_ACCESSING`). This is the only current primary hosting design. A private GitHub repository stores reviewed source, schemas, tests, release history, and code-only CI results; it is not a runtime dependency. GitHub Pages remains disabled, so the phone does not contact GitHub and no public shell is created.

The app requires all three:

1. a server-side two-account allowlist stored in Script Properties; and
2. a per-reader code whose SHA-256 hash is bound to that exact allowlist record; and
3. successful access, under the active user's identity, to the configured private Drive manifest and its allowlisted files.

Any failure returns only a generic closed state. A code is a second factor and display-name selector, not a replacement for Google authentication or Drive permissions: Dustin's code cannot authorize Shane's account and vice versa. The owner-executed/anonymous deployment used by Fractured Fate is explicitly rejected for private reads. A GitHub Pages shell is not justified because Apps Script currently supports the required execution identity and HTML service. Revisit Pages only after a concrete Apps Script limitation is reproduced across both accounts; a fallback shell would contain code only and would still require validated Google authentication and server-side authorization.

Google documents both execution modes and notes that user-accessing deployments run under the active user's identity: <https://developers.google.com/apps-script/guides/web>. The Apps Script manifest values are documented at <https://developers.google.com/apps-script/manifest/web-app-api-executable>.

## Minimal stack

- Plain semantic HTML, CSS, and JavaScript.
- A single browser application shared by local mocks and the Apps Script bundle.
- `google.script.run` for authenticated same-app RPC in production.
- Node built-ins for validation, safety, local serving, and tests, plus exact-version esbuild for Safari-targeted production minification.
- No framework, package install, runtime database, service worker, or runtime AI.
- `clasp` pushes only the inspected generated code bundle from a trusted maintainer environment. GitHub Actions validates a clean checkout but has no Google deployment credential and cannot deploy by itself.

## Data ownership and flow

```text
Git (code/schemas/tests) ──build──> Apps Script HTML + server code
                                           │ runs as accessing user
                                           ├── configured Drive file IDs (private content)
                                           ├── configured Google Sheet (comment + highlight events)
                                           └── ESV API (server-held key)

Browser memory  <── live policy-checked ESV response (never persisted)
Browser IndexedDB <── private content cache / comment state
       │
       ├── device fallback for the raw reader code
       └── offline comment drafts + idempotent comment outbox

Apps Script User Properties ── verified reader-code hash + author binding only
```

Git never receives real ESV passages, private commentary, comments, source extracts, credentials, user emails, Drive IDs, or Sheet IDs. Drive is canonical after publication. Local private working folders are ignored and scanned by the safety tooling before build or commit.

## Private Drive manifest

Script Property `PRIVATE_MANIFEST_FILE_ID` is the only client-independent entry point. The manifest maps stable logical names and reading IDs to exact file IDs:

```json
{
  "schemaVersion": "private-manifest/v1",
  "appConfigFileId": "...",
  "planFileId": "...",
  "sourceRegistryFileId": "...",
  "readings": {
    "CC-Y3Q4-D054": {"contentFileId": "...", "metadataFileId": "..."},
    "CC-Y3Q4-D055": {"contentFileId": "...", "metadataFileId": "..."},
    "CC-Y3Q4-D056": {"contentFileId": "...", "metadataFileId": "..."},
    "CC-Y3Q4-D057": {"contentFileId": "...", "metadataFileId": "..."},
    "CC-Y3Q4-D058": {"contentFileId": "...", "metadataFileId": "..."},
    "CC-Y3Q4-D059": {"contentFileId": "...", "metadataFileId": "..."},
    "CC-Y3Q4-D060": {"contentFileId": "...", "metadataFileId": "..."}
  }
}
```

The browser supplies only a reading ID. It can never supply an arbitrary Drive ID or redirect. The server reads the manifest first, resolves the configured ID, confirms it belongs to that manifest, and then calls `DriveApp.getFileById`. Google documents that this throws when the active user lacks permission: <https://developers.google.com/apps-script/reference/drive/drive-app#getFileById(String)>.

Portable commentary remains Markdown plus separate JSON metadata. The frontend renders a deliberately small Markdown subset as DOM text; raw HTML is never rendered. ESV text is absent from all content files.

## OAuth scopes

The pilot manifest requests only:

- `drive.readonly` — reading configured private files by ID. It still grants read access across the user's Drive; Apps Script has no narrower configured-file-only scope suitable for this server flow. The code does not scan Drive.
- `spreadsheets` — read/write access is required because a standalone script opens a configured Sheet by ID and appends revisions. This is broader than one Sheet; code never accepts a Sheet ID from the browser.
- `script.external_request` — server-side ESV requests.
- `userinfo.email` — server-only active/effective identity checks and the two-account allowlist.

Granular OAuth denial is checked before private operations and fails closed. Google recommends explicit least-permissive scopes and permission checks for web apps: <https://developers.google.com/apps-script/concepts/scopes>.

## Shared comments and verse highlights

One Sheet row is one immutable event (`create`, `edit`, or `delete`). The latest revision is materialized for display; older rows remain history. Server identity, display name, IDs, revision, and timestamps are authoritative. The client supplies a unique `clientRequestId`; retries return the already-recorded event. A script lock covers idempotency lookup, conflict validation, and append.

The same spreadsheet has a separate `highlight-events` tab. One row records an immutable `create` or `delete` event for one stable reading, book, chapter, verse, and author. The server derives the author and timestamp, validates the verse against the reading's exact passage bounds, and permits deletion only by the author who created that highlight. Dustin and Shane may independently highlight the same verse; materialization retains both events, and the client renders their configured colors together. Highlight retries use the same idempotent request-ID pattern and script lock as comments.

The friend needs viewer access to the content folder and editor access to the separate comments Sheet. The owner may keep the content folder read-only for the friend. Email addresses are stored only in private Script Properties and are never sent to the browser or Sheet.

Direct Sheet editing is a separate Google interface. Native Sheet access is controlled by Google's sharing list, not by the reader code, so the Sheet must be shared only with Dustin's and Shane's exact Google accounts. Reader codes gate application RPCs; they cannot make “anyone with the link” or an otherwise over-shared Sheet safe.

## Browser storage

- `localStorage`: the selected test reading and future lightweight, non-sensitive preferences only.
- IndexedDB `deviceCredentials`: the successful raw reader code as a device fallback. It is never placed in `localStorage`, URLs, logs, or exports. The client requests persistent browser storage where supported, but iOS remains free to evict site data.
- Apps Script User Properties: after a successful code check, a versioned record containing only the verified SHA-256 hash and server-derived `authorId`. It is scoped to the accessing Google user, so loss of iPhone web-app storage does not normally require re-entry. A configured-hash rotation or author mismatch invalidates it.
- IndexedDB `privateContent`: cache-first, plan-versioned private reading payloads plus one sanitized bootstrap snapshot, expiring after at most seven days. The bootstrap record is bound to the locally saved server-derived `authorId`; mock-fixture, ignored private-preview, and production records use separate cache contexts.
- IndexedDB `scriptureCache`: retained as a policy-enforcement store, but the current ESV policy disables writes and deletes legacy records; never a service-worker cache.
- IndexedDB `commentDrafts` and `commentOutbox`: offline drafts/events with unique request IDs.
- IndexedDB `commentSnapshot`: last server materialization for offline context.
- Shared-highlight state is network-only and held in memory for the open Scripture page. The optional highlight client loads after the core reader, performs no IndexedDB schema migration, and may fail without blocking the calendar, Scripture, commentary, or comments. Production history remains in the Sheet.
- IndexedDB `calendarCompletion`: one plan-versioned record per reading containing body-free completion booleans for the two configured `authorId` values plus a synchronization timestamp; no comment body or email address is duplicated here.
- IndexedDB `commentEvents`: local-mock revision history only; production history remains in the Sheet.

The app targets the next seven available readings for offline private-content use. Missing private records are retrieved through one authorization and one batched Apps Script response; the source registry and plan are not reread seven times. The current bridge has seven. ESV remains network-only even when private commentary is downloaded; this is an explicit provider-policy decision, not an accidental cache miss. Explicit authentication, authorization, reader-code, or manifest-permission failures clear and close the local private interface. Transient network/server failures may use the identity-bound snapshot, while comment writes remain in their local outbox until the current Google/Drive check succeeds. Highlights require a confirmed connection and never queue locally. A fully offline device cannot observe a later revocation until it reconnects; revocation therefore includes asking the user to clear downloaded data.

## Local-first daily startup

After one confirmed launch, the installed app stores a sanitized bootstrap snapshot containing the plan, schedule configuration, provider policy, two display identities, and no email, credential, Google ID, comment body, ESV text, or API key. On a later launch the app validates the record's age and saved `authorId`, renders the month and saved progress immediately, and begins a lightweight `confirmReaderAccess` RPC. That RPC repeats Google identity, allowlist, reader enrollment/code, scopes, and a real read of the configured Drive manifest under the accessing user's identity. Only then are network writes and synchronization enabled.

The full bootstrap refresh, shared-comment activity, and seven-reading preparation run after the visible shell is usable. Apps Script reuses a 30-second per-user parsed manifest/config/plan cache during that burst but still checks access to all three Drive files; the cache is an optimization, never an authorization source. Opening a downloaded reading renders commentary first, refreshes it in the background, and retrieves ESV independently. A deterministic readiness line distinguishes downloaded placeholders from substantive study content and warns when fewer than three consecutive studies are prepared from the current plan day.

The pilot registers no service worker, so HTTP caching cannot silently become an ESV corpus. “Clear downloaded data” removes any legacy Scripture-cache records plus private content, comment drafts/outbox, and snapshots while preserving reader access. A separate two-step “Forget reader code” action deletes both the account enrollment and the local fallback. Debug status reports counts, build IDs, policy dates, and whether a credential exists, never bodies or the code itself.

## Shared calendar and bridge navigation

The active bridge uses fixed start date 2026-08-08 in `America/Detroit` and six days of lookahead so the complete August 8–14 week is auditable. An audit/development override can switch only among `CC-Y3Q4-D054` through `CC-Y3Q4-D060`. Multi-chapter entries store an ordered `passages` array but still have one reading ID and discussion. The full 92-day Celebration sequence is separate reference metadata; it is not loaded as 92 active readings. Comments remain keyed to stable reading IDs, so a later start-date change cannot orphan them.

The authorized home view is a compact Sunday–Saturday grid for one complete calendar month, including muted adjoining dates needed to complete the first and last weeks. Calendar dates use Detroit civil-day arithmetic rather than elapsed 24-hour periods. Clicking an in-month date selects it; it does not navigate. A card below the calendar shows the selected passage, plan position, and separate Dustin/Shane status, followed by a date-specific open button. Every calendar date displays two stable, color-coded reader dots. A reader’s dot is filled when that server-derived `authorId` has at least one active comment for the stable `readingId`; an offline queued create updates the current reader immediately, and retracting that reader's last active comment removes it. One reader's comment never completes the other reader’s day. Completion is a study-participation marker, not proof that every page was viewed.

The home view retrieves both authorized readers’ completion IDs through one authorization-gated `listCommentActivity` RPC for at most 42 visible calendar cells. The server validates every scheduled reading ID against the private plan, materializes the append-only Sheet events, and returns a sanitized two-reader roster (`authorId`, `displayName`) plus body-free completion arrays by `readingId` and the plan version. It never returns email addresses, accepts frontend-supplied identity, or exposes comment bodies in this batch. This authoritative check runs before offline-content preparation, on every return home, on manual refresh, and when an installed app becomes visible again; it includes scheduled cells whether or not the reading is open or currently navigable. Duplicate simultaneous lifecycle requests are coalesced. The result is cached separately for offline calendar rendering. Opening a day renders cached discussion immediately and starts one full `listComments(readingId)` synchronization in the background.

Each available day opens at page 1 and uses one shared reading-level discussion form below whichever page is visible:

1. orientation / pre-text;
2. ESV Scripture for a chapter, or the book overview on a scheduled book-introduction day; and
3. one coherent inline-cited commentary article, concrete takeaway, passage-specific expandable deep-study sections, and source audit.

The final-page **Finished** action returns to the calendar but does not invent a completion event; posting an active comment from any page is what marks the day. The optional comprehensive synthesis appears below both the shared discussion and page navigation as passage-specific collapsed sections, followed by a separately collapsed source audit. This preserves the append-only comment model, avoids a second behavioral-tracking Sheet, and keeps long-form material from separating the user from the comment box.

## Installed web app and version replacement

The Apps Script `/exec` URL is the initial iPhone Home Screen target. Apps Script HTML Service runs in an iframe and does not provide a stable same-origin asset endpoint suitable for a conventional service-worker-controlled shell; Content Service responses also redirect through one-time `script.googleusercontent.com` URLs. The pilot therefore does not pretend to guarantee a cold offline launch. Already retrieved private content, comment snapshots, drafts, and the outbox can work offline while the installed shell remains resident; ESV always requires a connection under the current policy, and iOS may still require a connection to relaunch the shell.

Every local build computes a deterministic content hash across the frontend and server sources and injects it into both sides. Bootstrap returns the current server build ID. When an installed old client detects a mismatch, it exposes a user-initiated `_top` navigation to the allowlisted Apps Script deployment URL with an `appBuild=<hash>` query parameter. This escapes the HTML-service iframe and defeats ordinary URL-cache reuse without permitting open redirects. Deployments must preserve the bootstrap signature across one transition when an RPC contract changes, so an older shell can still learn that it is stale.

The August 2026 incidents contain two distinct failure classes. Versions 16–18 reached or plausibly entered application startup and motivated bounded IndexedDB/RPC behavior plus version 19's local-first path. Versions 20–21 failed earlier: version 21's independent watchdog executed, but the core never reached its first marker. Exact Google-stored artifact measurements show the working version-19 core's longest minified line at 49,022 characters and both pre-core failures above 50,000, while total HTML size does not correlate. Version 22 is a one-variable A/B canary with identical parsed application logic and a maximum generated line of 817 characters. The build now uses esbuild's supported line wrapping and hard-rejects lines over 1,200; see `docs/RELEASE_STABILITY.md` for the evidence and release matrix. Startup also handles an already-fired `DOMContentLoaded`, exposes pre-storage/core-started phases, bounds IndexedDB operations, and times out Apps Script RPCs rather than waiting forever.

This is robust update recovery, not a promise of invisible background replacement. If bounded-line canaries remain unreliable, the first fallback is a nearly frozen Apps Script authentication shell loading versioned code-only assets from stable HTTPS hosting while retaining same-app `google.script.run`; only if that cannot meet the authentication/cache contract does the design advance to a public code-only PWA shell with Google Identity Services and server-side identity validation. No private content, comments, ESV text, or credentials may enter either public artifact.

Relevant platform behavior is documented by Google for [HTML-service restrictions](https://developers.google.com/apps-script/guides/html/restrictions), [supported HtmlOutput meta tags](https://developers.google.com/apps-script/reference/html/html-output), and [Content Service redirects](https://developers.google.com/apps-script/guides/content).

## Fractured Fate findings

Patterns retained: a plain-JS mobile shell, local draft preservation, stable client request IDs, Apps Script Properties, clasp-managed source, explicit sync status, and server-side deduplication. Fractured Fate's export/import flow was reviewed but is not carried into the pilot: an unrestricted browser export would create a new leakage path for private commentary, comments, or ESV cache data.

Patterns replaced: hard-coded bearer reader codes, owner-executed anonymous access, frontend-controlled display names, all-comment `localStorage`, submit-only sync, row deduplication without a lock, no edit/delete revisions, JSONP status exposure, broad Drive write scope, and missing payload/rate validation. Fractured Fate was inspected read-only and remains unchanged.

The Sheet event log is append-only through the app, not cryptographically immutable. Because `USER_ACCESSING` requires the friend to have Sheet edit permission, either user could alter rows directly outside the app. Google version history provides an operational audit, but stronger tamper resistance would require a separately mediated write service with validated Google identity; this is a deployment decision, not a hidden guarantee.

## Deployment checkpoint

Before production, deploy a test version and prove with two personal Google accounts that active/effective identities match, both users can read only when Drive-shared, both can write the Sheet, a third signed-in account is rejected, and missing granular scopes fail closed. If cross-account `USER_ACCESSING` proves unreliable, stop. The documented fallback is Google Identity Services with server-side token validation, a two-account allowlist, file-level permission checks, and short-lived application tokens—not an owner-executed public endpoint.
