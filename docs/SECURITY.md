# Security and privacy

## Invariants

- No reader code/hash, ESV key/text, private Google resource ID, email, private commentary, comment/highlight export, or raw copyrighted source enters Git or public artifacts.
- The Pages token canary's Apps Script `/exec` URL is the sole narrow endpoint exception. It is public configuration and is confined to exact config/generated-client paths.
- Every private RPC requires a valid high-entropy reader code. The server hashes it and maps it to exactly one configured Dustin/Shane identity; frontend identity fields are never trusted.
- The browser cannot choose display name, author ID, timestamp, server ID, Drive/Sheet/file ID, ESV reference, revision, callable backend function, or response origin.
- Methods, argument counts, request sizes, reading IDs, verse ranges, and writes are validated server-side. Public errors omit private data and stacks.
- Comments and Markdown render through text nodes/allowlisted elements, never arbitrary HTML.
- ESV text is network-only. The service worker caches an exact public-code allowlist and never handles cross-origin/private traffic.
- The stable `USER_ACCESSING` deployment remains unchanged until the separate owner-executed token PWA passes its installed-iPhone gate.

## Threat model

| Threat | Primary controls | Residual/operational risk |
|---|---|---|
| Unauthenticated outsider without a code | 128-bit-or-stronger private codes; only hashes in Script Properties; all private operations authenticate first; generic errors | The public endpoint can receive blind traffic and consume quota |
| Outsider with a stolen code | Separate code per reader; constant-time-style comparison; server-mapped identity; rotation; bounded methods/resources | A stolen code is sufficient to impersonate that reader until rotation; this is the accepted bearer-token tradeoff |
| Leaked Apps Script URL | URL contains no data or credential; POST response goes only to the fixed Pages origin; method/payload/global rate controls | URL leakage permits quota noise and blind calls; Apps Script cannot expose a reliable source IP for strong IP throttling |
| Malicious website framing/submitting | Response has no interactive UI, exact `postMessage` destination, 192-bit request nonce, fixed transport/method allowlist | `ALLOWALL` removes Google's default frame protection; nonce/origin controls must not be weakened |
| Leaked ESV key | Script Properties only; never browser/log/build; key rotation and provider review | Anyone with script-project edit access could change code/config; Shane must not be a script editor |
| Malicious comment/Markdown | length/type/control validation; text-only/allowlisted rendering; escaped JSON response | A valid reader can intentionally post objectionable plain text |
| Identity spoofing | First argument is authenticated token; author/display/time/IDs are derived server-side; exact two-record configuration | Anyone holding a reader's code is intentionally treated as that reader |
| Comment/highlight collision or retry | Script lock; append-only revisions; base revision; idempotent client request IDs | A native Sheet editor can still alter rows outside the app |
| Arbitrary Drive/Sheet access | IDs exist only in Script Properties/manifest; browser sends stable reading IDs; compiled RPC allowlist | Owner-executed code has Dustin's declared scope authority; a server bug has more consequence than under per-user Drive gating |
| Accidental Git/Pages publication | ignore rules; staged hook; safety scanner; exact public-path exception; build inspection | Heuristic Scripture/secret detection is not a proof; human diff review remains required |
| Browser-cache persistence | seven-day private-content ceiling; reader-bound bootstrap; explicit-denial purge; clear/forget controls; no ESV persistence | Offline revocation is delayed; device/OS backups are outside app control |
| Stale or substituted shell | immutable content-addressed assets; SHA-384; network-first navigation/manifest; complete service-worker install; explicit activation; prior cache retained | GitHub account/repository security is part of the trust boundary |
| Drive/Sheet sharing mistake | app never relies on link sharing; audit exact accounts; private IDs never public | Token PWA reads as owner even if Shane's Drive share is removed; token rotation is the application revocation action |

## Bearer-token authorization

`AUTHORIZED_USERS_JSON` must contain exactly two records with unique valid SHA-256 hashes, stable unique author IDs, and safe display names. Raw codes are generated locally and delivered separately. They are not administrative tokens and cannot select a different identity.

Every RPC hashes the presented code with SHA-256 on Apps Script and compares it with both configured hashes before accessing Drive, Sheets, or ESV. The matching record supplies the identity. Missing, malformed, wrong, duplicated, or ambiguous configuration fails closed. A token-derived prefix scopes per-reader request counters without storing the raw token.

The PWA stores a successfully verified raw code only in IndexedDB. It is sent in an HTTPS POST body, not a URL, and is absent from `localStorage`, Cache Storage, Git, Pages metadata, service-worker messages, exports, and logs. The user-facing **Forget reader code** clears local storage. Rotation replaces the relevant configured hash; no deployment or client update is required.

This design intentionally does not authenticate Dustin or Shane through Google on the Pages path. The Apps Script deployment executes as Dustin and mediates access. The security boundary is therefore equivalent in spirit to a small private site protected by two long random API tokens. This is acceptable only because the owner explicitly selected it for a low-exposure two-person personal app.

## Transport and abuse controls

- HTTPS form POST only; reader code never appears in query parameters.
- One exact Pages response origin compiled server-side; browser-supplied origin is not treated as authentication.
- Random 128-bit request ID and 192-bit response nonce per call.
- Browser accepts responses only from `script.google.com` or an HTTPS `script.googleusercontent.com` host and only for a live ID/nonce pair.
- Eleven explicit public methods with exact argument counts; no dynamic function lookup/evaluation from request text.
- 150 KB request ceiling plus existing response/file/comment limits.
- Global approximate request limit and per-token operation buckets.
- Script locks around event idempotency/conflict checks/appends.
- No `Logger`, `console`, analytics, or intentional request-body logging.

Apps Script quotas remain the final abuse ceiling. The global cache counter is a practical throttle, not a DDoS control or billing firewall; Apps Script has no application charge in this design, but quota exhaustion could make the reader temporarily unavailable.

## CSP, framing, and rendering

The Pages CSP permits scripts/styles/images from self only, frames and form submissions only to Google Apps Script response hosts, no plugins, no base URL, and no embedding of the Pages shell. There are no inline executable scripts or third-party analytics.

The hidden Apps Script response must opt out of the default `X-Frame-Options` header. It contains no controls and emits one escaped `postMessage` to the fixed Pages origin. The nonce prevents an unrelated framed response from satisfying a live request. Important: do not turn the backend status page into an interactive framed administration interface.

Untrusted commentary/comment data is rendered as text or through the existing restricted Markdown renderer. JSON embedded in the response page escapes `<`, `>`, `&`, and JavaScript line separators, preventing a comment such as `</script>` from terminating the response script.

## Resource and scope boundary

Only the deployer authorizes `drive.readonly`, `spreadsheets`, and `script.external_request`. The token bundle removes `userinfo.email`, does not call `Session.getActiveUser()` for identity, and never obtains or sends the owner's OAuth token.

The browser supplies only plan reading IDs and validated event payloads. Drive file IDs are resolved through the private manifest; Sheet ID/tab names and the ESV key come only from Script Properties. Server code never scans Drive and never accepts an arbitrary file, spreadsheet, callback origin, or redirect from the client.

Direct Drive/Sheet access remains governed by Google sharing. A reader code cannot protect a Sheet shared as “anyone with the link.” Native sharing should remain restricted to the exact intended accounts even though the token app itself does not depend on Shane's Google permissions.

## Revocation, rotation, and recovery

To revoke or replace Shane's application access:

1. Generate a replacement token locally if access will continue, or remove/disable Shane's record if it will not.
2. Update only the stored hash in `AUTHORIZED_USERS_JSON`.
3. Remove Google Drive/Sheet sharing separately if native access should also end.
4. Ask Shane to clear downloaded data on a retained device; rotate immediately if a device is lost.

To rotate the ESV key, replace `ESV_API_KEY` in Script Properties, revoke the old provider key, and inspect provider usage. Never paste either key or reader codes into chat.

If the public backend is abused, create a new token deployment URL, update only the narrow public config, publish a new PWA release, and archive the old deployment. If GitHub Pages is compromised, stop the token deployment or rotate both codes before restoring a known-good immutable release.

Back up Drive content and Sheet event tabs with owner-controlled restricted exports outside Git. Test restore with new private IDs before treating a backup as usable. The append-only event log is revision-aware but not cryptographically immutable.
