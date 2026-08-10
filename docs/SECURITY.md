# Security and privacy

## Invariants

- No secret, API key, Google ID, user email, private commentary, comment body export, ESV passage, or raw copyrighted source in Git or public artifacts.
- Signed-in access alone is insufficient: active/effective identity must match, the account must be allowlisted, a freshly presented code or a versioned per-user enrollment must match the server-held hash, and the account must be able to read the configured Drive manifest.
- The browser cannot choose identity, display name, timestamps, author ID, Drive IDs, Sheet ID, ESV reference, revision number, or redirect target.
- Every private RPC repeats authorization. Errors reveal no private file names, IDs, emails, comment bodies, or provider response bodies.
- Comments and Markdown are rendered as text/allowlisted elements, never arbitrary HTML.
- The current ESV policy forbids persistent Scripture storage. Private content and a sanitized reader-bound bootstrap have a separate seven-day IndexedDB store, and no service worker caches either category.
- The temporary owner-only phone setup Sheet may contain Shane's exact Google account and no other input. It must never contain API keys, reader codes or hashes, passwords, tokens, or Google file IDs.

## Threat model

| Threat | Primary controls | Residual/operational risk |
|---|---|---|
| Unauthenticated outsider | Apps Script signed-in access, non-anonymous manifest, empty allowlist default, fail-closed RPC | Deployment settings must be checked after every redeploy |
| Signed-in third Google user | Server email allowlist plus Drive permission check on every private flow | Misconfigured allowlist or Drive sharing; two-account setup audit is mandatory |
| Leaked reader code | SHA-256 hashes only in Script/User Properties; code or enrollment must match the signed-in user's allowlist record and Drive access; separate codes for Dustin and Shane | A code on an unlocked authorized device can be reused; rotate its configured hash, revoke access if needed, and use **Forget reader code** on a retained device |
| Leaked temporary setup URL | 24-hour token plus active/effective owner identity and access to the standalone script file; anonymous access redirects to Google sign-in; setup version is undeployed after use | The link remains sensitive until expiry even though it is not sufficient without the owner Google account |
| Leaked Apps Script URL | URL is not a credential; all RPCs reauthorize and never accept arbitrary IDs | Authorization prompts may reveal the owner's support identity as Google documents |
| Leaked ESV key | Script Properties only, never browser/log/build; rotate immediately and review provider usage | Script editors can access project configuration; do not grant friend script edit access |
| Malicious comment/Markdown | length/type validation, control-character rejection, text-only DOM rendering, no raw HTML | Plain-text links are not automatically activated in the pilot |
| Highlight identity spoof or collision | Server-derived author/time, reading-and-verse validation, immutable events, owner-only removal, idempotent request IDs, and script lock | Both readers may intentionally highlight the same verse; a Sheet Editor can still alter rows outside the app |
| Accidental Git publication | ignore rules, staged-content hook, safety scanner, code-only build inspection | Heuristic ESV detection cannot prove absence; human diff review remains required |
| Browser persistence | Seven-day private-content ceiling, reader-bound bootstrap record, separate mock/production cache contexts, writes gated on current server confirmation, explicit-denial purge, total ESV persistence refusal, plan-versioned reading/completion caches, no service worker, clear-data control, inspectable counts | Offline revocation is not instantaneous; anyone with an unlocked authorized device and its browser storage can read the saved copy; completion reveals whether either reader commented; browser/OS backups are outside application control; use device passcodes and clear site data on loss/revocation |
| Comment collision/retry | script lock, append-only revisions, base revision, server timestamps, idempotent request ID | Conflicting edit is rejected and requires refresh/manual merge; a Sheet Editor can still alter rows outside the app |
| Calendar activity inference | Server-derived author ID, maximum 42 plan-validated IDs, active-event materialization, body-free response, and plan-versioned local state | A device holder can see which days either authorized reader completed until downloaded data is cleared |
| Drive sharing error | configured-ID-only access, active-user execution, explicit allowlist, no “anyone with link” | Owner must periodically audit folder and Sheet sharing |
| Stale installed client | Deterministic client/server build IDs, restricted versioned deployment URL, user-initiated top navigation | iOS may retain the old shell until the user accepts the update; RPC migrations must preserve the bootstrap handshake for one version |

## Identity and authorization

`Session.getActiveUser().getEmail()` and `Session.getEffectiveUser().getEmail()` are read server-side. Both must be nonempty and equal. The normalized email must exactly match one of two `AUTHORIZED_USERS_JSON` entries in Script Properties. That record contains a configured SHA-256 `readerCodeHash`; a constant-time comparison binds the presented code to the same email, `authorId`, and `displayName`. Swapping Dustin's and Shane's codes fails. The server returns only configured `authorId` and `displayName`. Google documents that user email is unavailable in owner-executed unauthorizing contexts, which makes a wrong deployment fail closed: <https://developers.google.com/apps-script/reference/base/session>.

The raw code is generated locally, given directly to its reader, and stored only in that reader's IndexedDB after successful verification. It is not an administrative token and cannot choose identity. It never enters Git, tracked config, the Sheet, a URL, logs, or an export. The configured hash goes in Script Properties.

After successful verification, Apps Script writes a versioned enrollment to `PropertiesService.getUserProperties()` containing only the verified hash, server-derived `authorId`, and enrollment time. Google documents User Properties as persistent key-value storage scoped to the current user of the script ([reference](https://developers.google.com/apps-script/reference/properties/properties-service), [guide](https://developers.google.com/apps-script/guides/properties)); no new OAuth scope is required. Every RPC still repeats active/effective identity, allowlist, enrollment/hash, scope, and Drive checks. This is persistent account enrollment, not an owner-executed public session. A hash rotation, author mismatch, deleted User Property, allowlist removal, identity mismatch, or lost Drive access fails closed. **Forget reader code** removes the User Property and the browser fallback.

For a computer-free initial handoff, the temporary owner setup version may embed AES-GCM ciphertext of both raw reader codes. The encryption key is derived from the expiring setup token, which is not embedded in source; decryption happens only in the owner's browser after the independent Google/Drive owner check. The normal project HEAD, immutable reader deployment, Drive files, Script Properties, and chat never contain either raw code. Remove the temporary deployment immediately after handoff.

Before online private reads/writes, `ScriptApp.getAuthorizationInfo` confirms all explicit scopes. Missing consent returns an authorization-required state before accessing content. Drive access to the manifest is then exercised as the content gate. A later installed-app launch may paint an unexpired, locally reader-bound offline copy first, but no write leaves the device until the current server check succeeds; an explicit identity, allowlist, code, or Drive denial clears the cached private state and hides the interface.

## Input and abuse controls

- JSON-shaped objects only; unknown fields are ignored server-side.
- Reading IDs: 1–80 safe identifier characters and must exist in the private plan.
- Comment body: 1–8,000 Unicode characters after newline normalization; NUL and unsupported controls rejected.
- Display name/identity: server configuration only.
- Client request ID: UUID-like, 16–100 safe characters.
- Comment and highlight writes: rate-limited per Google user and serialized with a script lock.
- Highlight references: the reading must exist in the private plan and the exact book/chapter/verse must fall inside one of its allowlisted passage ranges.
- Content files and response sizes have explicit maxima.
- No private bodies are sent to `console`, Apps Script logs, Stackdriver messages, analytics, or AI services.

## CSP and rendering

The local server sends a restrictive CSP (`default-src 'self'`, no objects, no frames, no form submissions). The generated Apps Script HTML uses a best-effort meta policy limited to Google script origins and the inline code required by HTML service. Apps Script's iframe sandbox remains part of the boundary. Deployment testing must confirm compatibility; XSS safety does not depend on CSP because all untrusted material is rendered through `textContent` and an allowlisted Markdown renderer.

## Revocation, rotation, backup

To revoke the friend: remove their allowlist entry, remove Drive folder and Sheet sharing, create a new deployment version if deployment access changed, and ask them to clear downloaded data. Their remembered enrollment cannot override any of those server-side gates. Removing only one layer is incomplete.

To rotate a reader code: generate a new pair locally (or generate only the affected reader's equivalent high-entropy value), update that user's `readerCodeHash` in `AUTHORIZED_USERS_JSON`, and give the raw replacement only to that person. The old per-user enrollment no longer matches and is rejected automatically; the next successful entry replaces it. Use **Forget reader code** on any retained device to remove the local fallback. Never paste either raw codes or their hashes into chat; even hashes are deployment configuration and user-linkage metadata.

To rotate the ESV key: replace `ESV_API_KEY` in Script Properties, revoke the old key with the provider, and inspect provider usage. Never paste it into chat or a local tracked file.

Back up Drive content and both event tabs in the comments Sheet with owner-controlled, access-restricted exports. Restore into new private files, update only the manifest/Script Properties IDs, re-audit sharing, and test authorization with all three account classes. Backups containing commentary, comments, or highlights stay outside Git.

The comment log is revision-aware, not tamper-proof. In the preferred `USER_ACCESSING` model the friend needs direct Sheet edit permission, so Google Sheet version history and sharing audit are the available operational evidence. If direct row modification is outside the accepted trust model, deployment must pause for the GIS/server-validated mediated-write fallback described in `docs/ARCHITECTURE.md`.

The native Google Sheet does not know about application reader codes. Its direct editors must therefore be limited by Google sharing to Dustin's and Shane's exact accounts. A valid code never justifies link sharing or a third editor.

The temporary phone setup Sheet is not an application data store or credential store. Once Shane's account has been transferred into ignored deployment state and sharing is configured, clear or remove the temporary Sheet so the extra copy of the account identifier does not persist unnecessarily.
