# Architecture

Status: operating pilot plus temporary Celebration bridge, 2026-08-08.

## Hosting decision

Use a hybrid delivery model. A Google Apps Script HTML-service web app remains the signed-in top-level launcher and authenticated backend, deployed with `access: ANYONE` and `executeAs: USER_ACCESSING`. GitHub Pages serves content-addressed, code-only JavaScript and CSS. The launcher contains stable semantic HTML plus a small watchdog and fixed-origin loader; the full application core is no longer processed or delivered inline by HTML Service.

The app requires all three:

1. a server-side two-account allowlist stored in Script Properties; and
2. a per-reader code whose SHA-256 hash is bound to that exact allowlist record; and
3. successful access, under the active user's identity, to the configured private Drive manifest and its allowlisted files.

Any failure returns only a generic closed state. A code is a second factor and display-name selector, not a replacement for Google authentication or Drive permissions: Dustin's code cannot authorize Shane's account and vice versa. The owner-executed/anonymous deployment used by Fractured Fate is explicitly rejected for private reads. Pages is not an authorization boundary and never receives the Apps Script deployment URL. Keeping the top-level document in Apps Script preserves `google.script.run` and user-accessing execution without cross-origin application tokens, third-party authentication cookies, or an owner-executed public endpoint. A Pages-top-level PWA remains a later fallback only if the thin Apps Script launcher is itself unreliable.

Google documents both execution modes and notes that user-accessing deployments run under the active user's identity: <https://developers.google.com/apps-script/guides/web>. The Apps Script manifest values are documented at <https://developers.google.com/apps-script/manifest/web-app-api-executable>.

## Minimal stack

- Plain semantic HTML, CSS, and JavaScript.
- A single browser application shared by local mocks and the code-only Pages release.
- `google.script.run` for authenticated same-app RPC in production.
- Node built-ins for validation, safety, local serving, and tests, plus exact-version esbuild for Safari-targeted production minification.
- No framework, package install, runtime database, service worker, or runtime AI.
- GitHub Pages publishes `web/release.json` and immutable `web/releases/<releaseId>/` assets from `main`. `clasp` pushes only the small inspected launcher plus server code from a trusted maintainer environment. GitHub Actions verifies that the published Pages release exactly matches the current source build; it has no Google deployment credential.

## Data ownership and flow

```text
Git source ──build──> GitHub Pages code-only assets
     │                         │
     └──────────> tiny Apps Script launcher + server code
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

The Apps Script `/exec` URL remains the iPhone Home Screen target. Apps Script HTML Service runs in an iframe and does not provide a stable same-origin asset endpoint suitable for a conventional service worker. The thin launcher instead retrieves a code-only release manifest from one exact GitHub Pages origin and loads immutable JavaScript/CSS paths with SHA-384 integrity. A unique no-store manifest request discovers updates; a remembered last-valid manifest permits a prior immutable release to be requested when the current manifest is temporarily unavailable. That record contains no private data.

Frontend and backend now have separate deterministic identities. The Pages release ID covers frontend sources and appears in the immutable asset path; the Apps Script build ID covers the launcher and backend. Routine frontend updates change `web/release.json` and add a new immutable directory without redeploying Apps Script. Backend/RPC or launcher changes still require an immutable Apps Script version and preserve the bootstrap signature across one transition.

The August 2026 incidents contain two failure classes. Versions 16–18 reached or plausibly entered application startup and motivated bounded IndexedDB/RPC behavior plus version 19's local-first path. Versions 20–22 failed before the core reached its first marker even after version 22 reduced every line below 817 characters. Commentary schema, Drive, ESV, authorization, IndexedDB, total HTML size, and long generated lines are therefore not sufficient explanations. The hybrid removes the 73 KB core from HTML Service's inline delivery path rather than relying on another undocumented size heuristic; see `docs/RELEASE_STABILITY.md`.

The hybrid is not yet a service-worker-controlled PWA, so iOS may still require a connection for a cold launcher load and ESV always requires one. Already retrieved commentary, comment snapshots, drafts, and the outbox keep their existing offline behavior. If the thin launcher remains unreliable or unacceptably slow, the next design is a Pages-top-level PWA with Google Identity Services and server-side identity validation—not a public owner-executed Apps Script endpoint.

Apps Script can set an outer-document favicon but has no API for an outer Web App Manifest or `apple-touch-icon`. Because iOS requires one of those Home Screen icon declarations, the phone-tested Apps Script URL receives WebKit's generated **D** monogram even though the intended PNG is valid and publicly reachable. This cannot be corrected by another frontend Pages release: the Pages document is not the installed top-level document. The two technically sound alternatives are an explicitly user-approved, removable iOS Web Clip configuration profile that names the production URL and embeds the icon, or the larger Pages-top-level/GIS migration. A cross-origin Pages redirect is not used because out-of-scope navigation opens Safari UI and would weaken the installed-app experience.

Relevant platform behavior is documented by Google for [HTML-service restrictions](https://developers.google.com/apps-script/guides/html/restrictions), [supported HtmlOutput meta tags](https://developers.google.com/apps-script/reference/html/html-output), and [Content Service redirects](https://developers.google.com/apps-script/guides/content).

## Pages-top-level PWA candidate

Moving the installed top-level document to GitHub Pages would be a meaningful user-experience improvement, but it is an authentication migration rather than a hosting toggle. The current hybrid already serves the large JavaScript and CSS payloads from Pages, so most code-delivery stability has been captured. A Pages-top-level document would additionally remove the Apps Script HTML-service navigation, Google iframe, and release-manifest hop from the critical rendering path. It could own a Web App Manifest, the intended icon, and a tightly scoped service worker that serves the code shell and cached calendar/commentary state immediately after the first successful install. GitHub describes Pages as static HTML/CSS/JavaScript hosting, and service workers can provide origin-scoped offline asset caching: <https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages> and <https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API> (checked 2026-08-10).

This would improve cold-shell consistency, repeat-launch latency, offline shell availability, icon control, and version replacement. It would not make live ESV retrieval, Drive reads, Sheet materialization, or writes intrinsically faster; those remain Google/ESV network operations. The reader should continue painting an identity-bound IndexedDB snapshot first and synchronizing in the background. The service worker must cache only public code/style/icon assets. It must explicitly bypass Apps Script/Google API traffic and must never cache ESV responses, private commentary, comments, highlights, OAuth responses, or credentials. Updates retain content-addressed releases, install the new cache completely before activation, keep the last valid release for rollback, and delete only caches bearing this app's exact prefix. Service-worker lifecycle complexity is itself an old-version risk and therefore requires explicit tests rather than a blanket cache-first rule: <https://web.dev/articles/service-worker-lifecycle> (checked 2026-08-10).

The preferred no-paid-backend prototype is a separate Pages canary using Google Identity Services' browser token model and an Apps Script API-executable deployment. Google documents that browser access tokens can call Google APIs through REST/CORS, while `scripts.run` requires a properly scoped OAuth token, an API-executable deployment, the Apps Script API enabled, and a shared standard Cloud project: <https://developers.google.com/identity/oauth2/web/guides/use-token-model> and <https://developers.google.com/apps-script/api/how-tos/execute> (checked 2026-08-10). This route is promising because the official execution example operates on the authorized user's Drive, but the project must not assume equivalence with the proven web-app deployment. A canary must establish on both personal accounts that active and effective identity match, Drive permission remains the content gate, User Properties remain user-scoped, and Sheet/ESV calls behave correctly.

The tradeoffs are material:

- `google.script.run` is available only to HTML-service pages, so the frontend RPC adapter must change to the Apps Script REST execution API.
- Google Identity Services access tokens are short-lived, returned to browser memory, and require a user-triggered authorization flow when a new token is needed. The installed-iPhone reauthorization experience must be acceptable before migration.
- A standard Cloud project, OAuth consent configuration, web client ID, authorized Pages origin, enabled Apps Script API, and API-executable deployment are required. These external resources are not created without explicit approval.
- The Pages client must necessarily contain the non-secret OAuth client ID and API deployment identifier. This requires an explicit, narrow exception to the current rule excluding all Google identifiers from `web/`; secrets, Drive/Sheet/file IDs, account emails, ESV credentials, and private content remain forbidden.
- Browser-held OAuth access raises the consequence of XSS. Tokens remain memory-only, the CSP must be narrowed to the exact Google endpoints, untrusted content remains text-only, and no analytics or third-party scripts enter the page.

Production remains on the phone-confirmed hybrid while a separate canary proves: installed iPhone cold/warm/offline shell launch; correct icon; Dustin/Shane authorization; crossed-code, anonymous, and third-account denial; active/effective identity; Drive denial; ESV; comment and highlight writes; access-token expiry/recovery; service-worker update and rollback; and complete exclusion of ESV/private/API responses from Cache Storage. Client-only phase timings should compare the hybrid and canary without logging identities, bodies, references, or credentials. Only a clearly better phone result justifies changing the installed URL.

### Implemented canary boundary

The local canary now reuses the exact phone-confirmed frontend release rather than forking reader behavior. A small Pages launcher installs a concurrency-safe `google.script.run` compatibility transport over the official `scripts.run` REST endpoint, then loads the existing core and optional highlight client by their immutable paths and SHA-384 values. Only the eleven named reader RPCs are callable; tokens live in memory, request bodies are bounded, cross-origin redirects are rejected, and token expiry closes network access until Google authorization is renewed. The existing server still derives identity, repeats the reader-code/enrollment and Drive gates, and owns ESV/Sheet access.

The PWA has a first-party manifest and the open-Bible icons. Its service worker precaches an exact generated list of public HTML, JavaScript, CSS, icon, and release-metadata URLs. Navigation and the release manifest are network-first; immutable assets are cache-first; `config.json` is never cached; all non-GET, cross-origin, Google/API, ESV, and unlisted requests bypass it. A complete new cache installs before it is offered, activation is explicit, and the current plus newest prior app-prefixed cache are retained for rollback. The service worker never reads IndexedDB.

The build is isolated under `web/pwa-canary/` and leaves `web/release.json`, `web/releases/`, and the production Apps Script deployment unchanged. `config/pages-pwa-public.json` remains disabled until a separate standard Cloud project, OAuth web client, and API-executable Apps Script deployment exist. Google currently requires the calling OAuth client and API executable to share one standard Cloud project, with the Apps Script API enabled; the default Apps Script project is insufficient ([official execution guide](https://developers.google.com/apps-script/api/how-tos/execute), checked 2026-08-10). The existing command-line connection confirmed that the production script is not currently deployed as an API executable. Production is not modified to work around that requirement.

## Fractured Fate findings

Patterns retained: a plain-JS mobile shell, local draft preservation, stable client request IDs, Apps Script Properties, clasp-managed source, explicit sync status, and server-side deduplication. Fractured Fate's export/import flow was reviewed but is not carried into the pilot: an unrestricted browser export would create a new leakage path for private commentary, comments, or ESV cache data.

Patterns replaced: hard-coded bearer reader codes, owner-executed anonymous access, frontend-controlled display names, all-comment `localStorage`, submit-only sync, row deduplication without a lock, no edit/delete revisions, JSONP status exposure, broad Drive write scope, and missing payload/rate validation. Fractured Fate was inspected read-only and remains unchanged.

The Sheet event log is append-only through the app, not cryptographically immutable. Because `USER_ACCESSING` requires the friend to have Sheet edit permission, either user could alter rows directly outside the app. Google version history provides an operational audit, but stronger tamper resistance would require a separately mediated write service with validated Google identity; this is a deployment decision, not a hidden guarantee.

## Deployment checkpoint

Before production, deploy a test version and prove with two personal Google accounts that active/effective identities match, both users can read only when Drive-shared, both can write the Sheet, a third signed-in account is rejected, and missing granular scopes fail closed. If cross-account `USER_ACCESSING` proves unreliable, stop. The documented fallback is Google Identity Services with server-side token validation, a two-account allowlist, file-level permission checks, and short-lived application tokens—not an owner-executed public endpoint.
