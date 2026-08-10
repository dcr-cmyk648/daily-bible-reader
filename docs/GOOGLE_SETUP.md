# Google and deployment setup

Status: the current `USER_ACCESSING` production deployment and its private Drive/Sheet/Script Properties are operational. The Pages token PWA uses a separate immutable owner-executed web-app deployment as a canary. No Google OAuth client, OAuth consent-screen project, Apps Script API executable, billing account, or new paid service is required.

## Existing private resources

The owner-managed Apps Script project already has:

- `PRIVATE_MANIFEST_FILE_ID`
- `COMMENTS_SPREADSHEET_ID`
- optional `COMMENTS_SHEET_NAME` and `HIGHLIGHTS_SHEET_NAME`
- `AUTHORIZED_USERS_JSON` with Dustin/Shane identities and unique reader-code hashes
- `ESV_API_KEY`

The private manifest points to the configured app, plan, source registry, and reading content/metadata files. The Sheet contains the frozen `comment-events` and `highlight-events` headers. None of these values belongs in Git, Pages, chat, deployment descriptions, or logs.

The token canary is deployed from the existing script project so it can reuse these Script Properties without copying or exposing the ESV key. The active production deployment stays pinned to immutable version 23. Apps Script deployments preserve their referenced version; temporarily pushing the token bundle to project HEAD does not alter version 23 or its production deployment pointer.

## Token configuration

`AUTHORIZED_USERS_JSON` may retain the legacy private email fields, but token authorization ignores them. Exactly two records must remain, with:

```json
[
  {
    "authorId": "dustin",
    "displayName": "Dustin",
    "readerCodeHash": "64 lowercase SHA-256 hex characters"
  },
  {
    "authorId": "shane",
    "displayName": "Shane",
    "readerCodeHash": "a different 64-character hash"
  }
]
```

Do not paste raw codes or hashes into chat. Dustin and Shane keep only their own raw code. The PWA stores the successful code in IndexedDB after first entry.

## Build and inspect

From a trusted maintainer computer:

```sh
npm ci
npm run check
npm run build:token-canary
```

Inspect exactly these generated files before pushing:

- `dist/apps-script-token-canary/Code.gs`
- `dist/apps-script-token-canary/ServerCore.gs`
- `dist/apps-script-token-canary/TokenBridge.gs`
- `dist/apps-script-token-canary/appsscript.json`

The token manifest must be `ANYONE_ANONYMOUS` / `USER_DEPLOYING`, omit `executionApi`, omit `userinfo.email`, and retain only Drive read, Sheets, and external-request scopes. The active authorization function must call `authorizeTokenIdentity`, not `Session.getActiveUser`. `doGet` is status-only; `doPost` exposes only the fixed method map. There is no `Index.html` in this bundle.

The tracked production manifest at `app/apps-script/appsscript.json` must remain `ANYONE` / `USER_ACCESSING` throughout.

## Create the canary deployment without moving production

1. Record `clasp deployments` privately and identify the current production version/deployment for rollback verification.
2. Point a temporary ignored clasp configuration at `dist/apps-script-token-canary/` for the existing script project.
3. `clasp push --force` only after the generated bundle and safety output have been inspected.
4. Create a **new** deployment with a description identifying it as the Pages token canary. Do not update the production deployment.
5. In the deployment UI/metadata, verify **execute as me/deployer** and **who has access: anyone**, including anonymous access. The manifest representation is `USER_DEPLOYING` / `ANYONE_ANONYMOUS`.
6. Record the new `/exec` URL only in `config/pages-pwa-public.json`. It is intentionally public configuration, but must not appear elsewhere.
7. Immediately point clasp back to `dist/apps-script/`, push the inspected stable hybrid source back to project HEAD, and verify the production deployment is still on version 23.

The token deployment remains pinned to its immutable version after project HEAD is restored. Never “update” the production deployment while the owner-executed manifest is at HEAD.

## Owner authorization

The web app executes under Dustin's authority. The existing project authorization normally already covers Drive read, Sheets, and external URL fetch. If Google requests authorization after the token version is pushed, Dustin—not Shane—must grant those three scopes from the Apps Script editor/deployment flow. The backend does not request `userinfo.email` and must never transmit `ScriptApp.getOAuthToken()`.

Google documents that an execute-as-owner web app always runs as the script owner/deployer regardless of the caller: <https://developers.google.com/apps-script/guides/web> (checked 2026-08-10).

## Configure and publish Pages

The only tracked public backend value is:

```json
{
  "schemaVersion": "dbr-pages-public-config/v2",
  "enabled": true,
  "backendWebAppUrl": "https://script.google.com/macros/s/DEPLOYMENT_ID/exec"
}
```

Then run:

```sh
npm run build
npm run publish:pages
npm run check
```

Review `web/pwa-canary/` before committing. It may contain code/style/icon assets, release metadata, and the one public backend URL. It must not contain reader codes/hashes, ESV key/text, account emails, Drive/Sheet/file IDs, commentary, comments, highlights, or API responses. The safety scanner permits the endpoint only in the exact config/generated-client paths.

Commit and push the code-only release to `main`. Wait for GitHub Pages, then verify the release manifest and every referenced asset over HTTPS for status, content type, byte identity, and integrity. Do not delete old `web/releases/` or earlier versioned PWA clients.

The install URL is:

`https://dcr-cmyk648.github.io/daily-bible-reader/web/pwa-canary/`

Open it first in iPhone Safari, then use **Share → Add to Home Screen → Open as Web App**. Keep the current Apps Script-installed app until the canary passes.

## Acceptance gate

On Dustin's iPhone verify, in order:

1. Cold open shows the public shell promptly and the open-Bible icon.
2. First code entry identifies Dustin; Shane's code is never used on Dustin's device.
3. Close and reopen without re-entering the code.
4. Calendar/cached private commentary paints before background synchronization completes.
5. Live ESV loads with exact attribution and remains unavailable rather than substituted on provider failure.
6. Comment create, edit, and retract work and update calendar completion.
7. Highlight add/remove works with immediate optimistic feedback and authoritative reconciliation.
8. Offline reopen shows the shell, cached permitted commentary/calendar, and drafts; Scripture clearly requires a connection.
9. A deployed public-shell update presents the explicit restart control and activates the new version without deleting the rollback cache.
10. Cache inspection shows public assets only; no ESV, comments, private payloads, reader code, or Google response document is in Cache Storage.

Then test Shane's distinct code on a separate browser/device and verify server-provided display identity. Test a deliberately wrong code and a crossed code on disposable state. Do not ask Shane to test until the current content and interface are ready.

## Sheet and Drive sharing

The app no longer requires Shane's Google account to edit the Sheet or read Drive because requests execute as Dustin. Existing direct sharing may remain for audit/convenience, limited to the exact two accounts. Never use domain or “anyone with the link” sharing.

Reader codes do not protect the native Drive or Sheet interfaces. If Shane should lose all access, rotate/remove his reader-code hash and separately revoke his Drive/Sheet sharing.

## Rollback and incident response

- PWA failure: keep using the phone-confirmed Apps Script production URL; do not move its deployment pointer.
- Public-shell regression: restore `web/pwa-canary/` to the last good generated release while retaining immutable assets.
- Backend regression: archive/stop the token canary deployment and create a new immutable version after repair; do not reuse a changed deployment blindly.
- Token leak: replace that reader's hash immediately and deliver a new code privately.
- Backend URL abuse: create a new deployment URL, update the narrow public config, publish a new PWA version, and archive the old deployment.
- GitHub compromise: stop/archive the token endpoint or rotate both codes before restoring a known-good Pages release.
- ESV key leak: rotate in Script Properties/provider controls and review usage.

## Backup and restore

Keep restricted owner-controlled backups of the Drive content tree and both Sheet event tabs outside Git. A restore uses new private file/Sheet IDs, updates Script Properties/manifest privately, rechecks headers and sharing, and runs the same acceptance gate. Never place a backup containing commentary, comments, highlights, ESV responses, or identifiers in the repository.
