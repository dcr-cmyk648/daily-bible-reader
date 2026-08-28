# Architecture

Status: Pages-top-level token PWA is the phone-confirmed primary reader; Apps Script version 23 remains rollback, 2026-08-10.

## Hosting decision

The intended installed app is a GitHub Pages PWA backed by a public Google Apps Script web app that executes as Dustin, the deployer. GitHub contains and serves only code, styles, icons, the web manifest, release metadata, and the necessarily public Apps Script `/exec` URL. Apps Script holds the ESV key and private Google resource IDs in Script Properties, reads private Drive content as Dustin, and mediates Sheet reads/writes. Possession of one high-entropy private reader code authorizes the request and selects the server-configured identity `Dustin` or `Shane`.

This is a deliberate two-person personal-app tradeoff approved by Dustin on 2026-08-10. It replaces the proposed Google Identity Services/API-executable flow. It does not require a Google OAuth web client, Apps Script API execution, a standard Cloud project association, a consent screen for Shane, or a paid backend. Google documents that a web app may handle `doPost`, execute as the deployer, and be available anonymously; it also cautions developers to handle owner authority carefully: <https://developers.google.com/apps-script/guides/web> (checked 2026-08-10). Manifest values are documented at <https://developers.google.com/apps-script/manifest/web-app-api-executable>.

The phone-confirmed Apps Script version 23 remains an unchanged rollback. It still uses `USER_ACCESSING` and Google/Drive authorization. The token PWA is compiled as a separate immutable artifact and uses a separate deployment URL. Routine Pages UI releases do not move the production Apps Script deployment pointer.

### Accepted tradeoffs

- The reader code is a bearer credential. Anyone who obtains Dustin's or Shane's code can act as that reader until its hash is rotated.
- The Pages path no longer proves a Google account or the friend's Drive permission on each request. Apps Script reads Drive and Sheets with the deployer's authority.
- A leaked backend URL is not sufficient to read data, but an outsider may still send blind requests and consume Apps Script quota. Global and per-token rate limits reduce ordinary abuse; they cannot make a public server immune to denial of service.
- Revocation is code-hash rotation. Removing Shane's Google sharing remains prudent for direct Drive/Sheet access but is not the app's token revocation mechanism.
- The endpoint URL is public configuration, not a secret. Reader codes, hashes, ESV key, Drive/Sheet/file IDs, emails, comments, commentary, and Scripture remain private.

For this scope, the reduced setup and launch latency outweigh those residual risks. This conclusion is specific to a personal two-reader app and is not a general recommendation for public or higher-impact systems.

## Minimal stack

- Plain semantic HTML, CSS, and JavaScript; no runtime framework.
- GitHub Pages as the top-level installable PWA and immutable public-code host.
- A narrowly compiled Apps Script owner-executed web-app backend.
- Google Drive as canonical private commentary/source storage plus the rollback-compatible rolling prepared-prefix plan.
- A Google Sheet as the append-only comment and highlight event store.
- Official ESV API access from Apps Script only.
- IndexedDB for the saved reader code, current-plus-seven private-content snapshot, bounded ESV passage cache, calendar state, comment drafts, and comment outbox.
- A service worker for an exact public-asset allowlist only.
- No runtime AI, analytics, third-party scripts, conventional backend, or paid hosting dependency.

## Data flow

```text
Git source ──build──> GitHub Pages PWA (public code/icons only)
                              │
                              │ bounded POST; reader code in body
                              v
                    public Apps Script /exec
                       executes as deployer
                         │          │
                         │          ├── Google Sheet event tabs
                         │          └── ESV API with server-held key
                         v
                 allowlisted Drive file IDs

Browser memory   <── active ESV chapter + extracted verse-of-day hot copy
Browser IndexedDB <── private snapshot + policy-bounded ESV passage records
        │
        ├── raw reader code, after successful verification
        └── offline comment drafts + idempotent outbox
```

Git never receives real ESV passages, private commentary, comments, source extracts, credentials, user emails, Drive IDs, Sheet IDs, or code hashes. It does contain the non-sensitive factual D054–D092 passage schedule, which the backend compiles for calendar display. Drive remains canonical for private study content after publication. Ignored local working folders may contain drafts during preparation and are inspected before upload. The offline Henry pipeline may also export a checksum-addressed, app-neutral current-window store in ignored local storage; it explicitly contains no Scripture, remains `not_published`, and reaches the reader or another local consumer only through localhost-only adapters removed from production builds.

## Token identity

`AUTHORIZED_USERS_JSON` remains private Script Properties configuration. Exactly two records are required. Each record contains a unique SHA-256 `readerCodeHash`, stable `authorId`, and configured `displayName`; legacy email fields may remain during migration but are ignored by token authorization.

Every callable operation receives the raw reader code as its first argument. Apps Script validates its format, hashes it server-side, compares it against both configured hashes, and derives the identity from the single matching record. The browser cannot submit an author ID or display name that overrides this mapping. Missing, malformed, unknown, duplicate, or ambiguously configured credentials fail closed.

The successful raw code is stored in the PWA's IndexedDB, not `localStorage`, so closing and reopening normally does not require another entry. It never appears in a URL, tracked file, Cache Storage, error text, analytics, or application logging. **Forget reader code** clears the browser credential; on the token deployment it does not mutate shared Apps Script User Properties. Rotation replaces the affected configured hash and invalidates that reader's old code immediately for online requests.

## Cross-origin RPC transport

Pages cannot use `google.script.run`, and a normal cross-origin `fetch` to an Apps Script web app is not a dependable CORS API. The PWA therefore uses one form POST per RPC:

1. The browser creates a hidden response frame and form targeted to it.
2. The form posts only a fixed transport version, allowlisted method, bounded JSON arguments, random request ID, 192-bit response nonce, and the Pages origin. The reader code is inside `args_json` in the POST body.
3. `doPost` accepts only the eleven explicit reader methods and their exact argument counts. It never dynamically evaluates a requested function name.
4. Apps Script returns a minimal `HtmlOutput` that posts the result to the one compiled Pages origin. JSON is escaped against script termination/XSS.
5. The Pages client accepts the message only from a Google Apps Script response origin and only when request ID plus nonce match a live request. It times out and removes the frame after 45 seconds.

`HtmlOutput.setXFrameOptionsMode(ALLOWALL)` is necessary for the response frame. Google warns that this disables its default framing protection, so the response page contains no interactive UI, sends only to the fixed Pages origin, reflects no arbitrary destination, and requires a high-entropy nonce: <https://developers.google.com/apps-script/reference/html/html-output#setXFrameOptionsMode(XFrameOptionsMode)> (checked 2026-08-10).

The transport allowlist covers only `getBootstrapData`, `confirmReaderAccess`, single/batched reading retrieval, ESV retrieval, comment reads/activity/write, highlight read/write, and local-access forgetting. Payloads are capped at 150 KB. Public errors omit IDs, bodies, credentials, stack traces, and provider payloads. No request fields are logged.

## Private Drive and configuration

Script Property `PRIVATE_MANIFEST_FILE_ID` is the only private-content entry point. The private manifest maps stable reading IDs to exact commentary and metadata file IDs plus exact config, rolling prefix-plan, and registry IDs. The browser sends only a stable reading ID. The server resolves it through the manifest and never accepts an arbitrary Drive ID or redirect.

The new backend separately embeds the deterministic code-only D054–D092 schedule generated from the reviewed reference plan and chapter metrics. Bootstrap returns that full schedule plus a server-validated `preparedReadingIds` prefix derived from the manifest. The calendar may therefore show every remaining assignment, but the client opens, preloads, or retains only an unlocked manifest-backed reading. The Drive plan and manifest continue to match exactly and advance one prepared entry at a time, so immutable backend 27 and hybrid 23 remain usable without changing their private inputs.

Under the token deployment, Drive permission is exercised as the deployer. Shane may retain Viewer access for independent audit/backup, but his Drive permission is not the application's authorization gate. Files must still never be shared as “anyone with the link.” Portable commentary remains Markdown plus separate JSON metadata, and ESV text is absent from every content file.

## Owner OAuth scopes

Only Dustin authorizes the backend project. The token bundle requests:

- `drive.readonly` — read configured private files by ID; code never scans Drive.
- `spreadsheets` — append and materialize the configured comments/highlights Sheet.
- `script.external_request` — retrieve ESV server-side.

The token bundle removes `userinfo.email`; it does not use Google account identity. It never obtains or transmits `ScriptApp.getOAuthToken()`. Shane receives no Google OAuth consent flow through the PWA.

## Comments and highlights

One Sheet row is one immutable event. Comments use `create`, `edit`, or `delete`; highlights use `create` or `delete`. The latest revision is materialized for display while prior rows remain history. Server identity, display name, IDs, revisions, and timestamps are authoritative. A client request ID makes retries idempotent. Script locks cover lookup, conflict validation, and append.

The current server validates each reading and verse against the compiled full schedule; private payload resolution additionally requires manifest membership. Only the author derived from the current token may edit/retract that author's comment or remove that author's highlight. Dustin and Shane may independently highlight the same verse.

Direct native Sheet access is separate from the app. Google sharing—not reader codes—controls who can open the Sheet UI. It may remain limited to Dustin's and Shane's exact accounts, but “valid codes” cannot secure link-shared Sheet access. The owner-executed app itself does not require Shane to be a Sheet editor.

## Browser storage and offline behavior

- `localStorage`: lightweight non-sensitive preferences only.
- IndexedDB `deviceCredentials`: the raw reader code after successful verification, bound to the cached server-derived author ID.
- IndexedDB `privateContent`: plan-versioned private reading payloads and a sanitized bootstrap snapshot for no more than fourteen days. This prevents a T+7 payload from expiring just as it becomes today's offline study.
- IndexedDB `calendarCompletion`: body-free two-reader completion state.
- IndexedDB `commentDrafts`, `commentOutbox`, and `commentSnapshot`: offline composition and idempotent synchronization.
- Shared highlights: network-only, memory-resident for the open Scripture page.
- IndexedDB `scriptureCache`: one record per displayed ESV chapter or verse range, at most 500 verses total and half of any book, with eight-day expiry, policy-version invalidation, and eviction before writes. Opened passages are network-first; a valid retained record paints immediately and is the fallback on failure. A daily assignment that exceeds half a book uses chapter or verse-range tabs and can have only partial offline coverage. ESV remains forbidden from Cache Storage/service-worker handling, private content, Git, Drive, logs, and exports.

The PWA paints a valid cached shell/calendar/commentary snapshot immediately, then confirms the stored code in the background. After confirmation, it always requests fresh current-and-next private payloads even when their cached records are unexpired; validated responses replace IndexedDB and immediately recalculate study readiness. If an opened cached record is still a placeholder, the reader blocks on that fresh request before displaying the study. If a prepared cached record paints first and a different commentary version or hash arrives later, the open page is rerendered in place. This makes the cache a fast/offline display layer rather than version authority, so a revised current/next Drive record cannot remain hidden behind the retention window or be saved without becoming visible. Explicit code denial clears private local state. Transient network failure may retain the unexpired snapshot and queued comment drafts. Offline revocation cannot be instantaneous; a lost device must have its token rotated, and the user should clear site data or remotely protect the device.

Calendar selection reads the verse-of-the-day reference from the already validated private reading payload. For current and next, it resolves exact wording from a live or valid policy-bounded Scripture response and keeps only the isolated verse in volatile hot memory when its full chapter is replaced. The selected-day card shows ESV identity, an exact passage link, and the required notice. No wording enters plan/commentary metadata, Cache Storage, a public build, Git, or Drive. The eight-reading private-payload target drives the seven-day-ahead operational readiness check. A chapter is prepared only when its reviewed/hash-bearing metadata, orientation, configured ESV passage, coherent main synthesis, verse selection, practical takeaway, comprehensive synthesis, traceable source records, and either a complete reviewed Matthew Henry verse layer with every cited public-domain atom or the quota-only verified full-commentary link all pass. The notice reports the first gap: Dustin receives the exact missing components and date, while Shane sees only a generic delay state.

The service worker caches only generated public HTML, JavaScript, CSS, icons, and immutable release metadata. It bypasses all non-GET, cross-origin, config, Apps Script, ESV, and private traffic. A complete new public cache installs before activation; the user receives an explicit restart control; the current and newest prior app cache remain for rollback.

## Permanent study library and active-plan picker

Google Drive will be the canonical permanent library for every reviewed, lawfully storable study layer: orientation, book overview, executive and comprehensive syntheses, takeaway/verse-reference metadata, archaeological/historical preview and dossier, source/coverage metadata, hashes, review history, and reviewed Matthew Henry derivatives. ESV wording remains exclusively in its independent provider path and never enters the library.

A canonical resource identity (for example `GEN-001` or `intro-GEN`) is distinct from a dated plan occurrence/`readingId`. The occurrence retains daily discussion and completion history; the resource retains reusable study material and chapter history across schedule changes and rereads. Highlights carry both canonical book/chapter/verse coordinates and their originating occurrence, with append-only revision-aware attribution. The Sheet remains canonical for append-only comment, permanent-note, and highlight events; restricted Drive exports are backups, not a competing live store.

The installed reader now has a compact sticky-header **Book** and **Chapter/Overview** picker for the already authorized active-plan prepared prefix. Its catalog is derived only from the validated active plan, its `bookMetrics`, and the bootstrap's prepared-reading membership; it is not a Drive index. Books follow first plan occurrence order. Unprepared books and resources are disabled; grouped entries retain their original occurrence-keyed `readingId`, and partial ranges remain separate options labeled with exact verse coverage. A picker open starts on Orientation, identifies the compact library mode in the position line, and does not create completion or activity by itself. Library mode may reopen a prepared occurrence outside the calendar's ordinary future lock; normal calendar selection and its lock rules are unchanged.

The future permanent-library layer will extend rather than replace this picker with reusable canonical resources, explicit permanent-note visibility, and a bounded recent-resource cache. The phone will retain the current-through-T+7 private pack plus bounded recent resources, not the whole library automatically. These remaining contracts do not yet create a Drive migration, permanent note events, or whole-library persistence.

## Versioning and release stability

The Pages document owns the manifest, correct open-Bible icon, standalone display mode, and service-worker scope. This removes Apps Script HTML Service from cold shell startup and should materially improve repeat-launch latency and version determinism. It does not eliminate network time for fresh ESV, Drive, or Sheet operations; cached private content and background synchronization keep those operations off the initial paint where possible.

The cache/build inspector also exposes a field-allowlisted, session-only startup timeline: shell visible, application code loaded, cached or fresh calendar visible, authorization confirmed, fresh calendar data synchronized, and Scripture visible. The values use the browser's monotonic navigation clock, reset on every launch, and are never persisted, transmitted, or written to logs. No identity, passage reference, commentary, comment, token, or private resource ID enters the timeline.

All public assets are content-addressed and integrity-checked. Published release directories are immutable and never deleted. `config.json` is not service-worker cached. A configuration/code change creates a new PWA release ID; installation finishes before the update prompt appears. The repository safety scanner confines the public backend URL to the canary config and generated client/config paths.

The token backend is derived from the same tested server logic but compiled into `dist/apps-script-token-canary/` with a different manifest, authorization function, rate limiter, response transport, status-only `doGet`, and no frontend HTML. Production source remains `USER_ACCESSING`; an immutable token deployment is tested separately. See `docs/RELEASE_STABILITY.md` for the release gate and incident history.

## Fractured Fate findings

Retained patterns: plain-JS mobile shell, bearer reader codes in local browser storage, owner-executed Apps Script, private Script Properties, clasp-managed source, stable client request IDs, explicit sync state, and server-side deduplication.

Strengthened patterns: codes are unique per reader and stored as hashes server-side; display identity is server-mapped; methods and payloads are allowlisted/bounded; responses use per-request nonces rather than public JSONP status records; writes use locks, idempotency, and append-only revisions; private content and ESV are not bundled into the public site; CSP and service-worker cache scope are explicit.

Not retained: frontend-selected display names, all-comment `localStorage`, unrestricted exports, row replacement, shared administrative secrets, broad Drive writes, or raw source/ESV persistence. Fractured Fate was inspected read-only and remains unchanged.

## Promotion checkpoint

Dustin has confirmed the installed Pages PWA works, including retained code access and the live reader flow, so it is now the recommended installation. The older Apps Script installation remains available as rollback; promotion did not move its production deployment pointer.

Shane's install, live ESV, and overlapping-highlight check remain intentionally deferred until the reader is closer to launch. Cross-token denial, token rotation, offline outbox recovery, downloaded-data clearing, and revocation behavior remain manual security checks rather than reasons to return the primary UI to Apps Script hosting.
