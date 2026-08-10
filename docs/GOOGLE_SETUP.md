# Approval-gated Google and ESV setup

External setup was approved on 2026-08-08. The private Drive hierarchy/content, native comments Sheet, Script Properties, owner-entered ESV key, and signed-in/user-executed Apps Script deployment exist. The active private config now selects the seven-day Celebration bridge; the full 92-day source schedule is stored separately as factual reference metadata; only days 54–56 have synthesis, while days 57–60 are explicit placeholders. The fourteen active reading files are exact-byte verified and individually shared with Shane as Viewer; a post-write audit found only the owner and Shane, with no link or domain access. Existing shared config/plan/registry/manifest files were updated in place without deleting the preserved Genesis files. The 92-day reference file remains owner-only because the app does not retrieve it. Shane's authenticated access, reader-code binding, and comment creation have passed; his live ESV and Home Screen installation checks remain pending.

The unchanged production URL currently serves confirmed-working immutable version 19. Versions 20–22 failed the iPhone canary before the application core started; version 22 failed despite a maximum generated line of 817 characters, disproving the prior line-length hypothesis. The replacement architecture keeps production on version 19 while GitHub Pages publishes a code-only frontend and an Apps Script canary is reduced to the authenticated launcher/backend. Initial hybrid build `c57d948db8fbf838` uses frontend release `73da95f8a9ec3bb3`; it is not promoted until Pages readback plus the installed-iPhone gate pass. Server enrollment, private Drive content, ESV retrieval, comments, scopes, execution identity, deployment access, and sharing remain unchanged. The complete incident record is in `docs/RELEASE_STABILITY.md`.

## Phone-only setup handoff

The owner-only Google Sheet named `Daily Bible Reader Setup Inputs` was the temporary phone-friendly handoff for Shane's exact account. Its input cell was cleared after setup while formatting and email validation were preserved; the Sheet now records completion status and remains unshared.

Never put the ESV API key, reader codes or hashes, passwords, tokens, or Google file IDs in that Sheet or in chat. The ESV key was entered directly into Apps Script Script Properties from the authenticated owner-only setup page.

For the computer-free handoff, a separate 24-hour Apps Script setup deployment may be created after the account is read. It must:

- run as the accessing user and require the active/effective identity to be the owner of the standalone script file;
- require a high-entropy expiring setup token in addition to that Google/Drive owner check;
- install only the four generated non-secret deployment properties;
- accept the ESV key in a password field and send it directly to Script Properties through `google.script.run`;
- carry only AES-GCM ciphertext for the raw Dustin/Shane reader-code handoff, with decryption performed in the owner's browser from the expiring setup token;
- contain no raw reader code or ESV key in source, Drive, chat, URL, logs, or Script Properties; and
- be undeployed after the owner confirms setup, while the normal project HEAD remains the clean code-only bundle.

This one-time flow completed successfully. The initial setup-page link attempted iframe navigation on iPhone; opening the normal deployment URL directly bypassed it. Any future setup-page builder must emit a top-level target. The temporary deployment and local setup-token/helper files were removed after the installed reader was verified.

## 1. Prepare private Drive content

Create a private owner-controlled folder. Do not use “anyone with the link.” Share the content folder directly with the friend as Viewer. Create portable Markdown/JSON files and a private manifest using the topology in `docs/ARCHITECTURE.md`. Confirm the friend can open the manifest/content through inherited Drive permissions but cannot edit the folder.

The Celebration bridge uses `sharedStartDateMode: "fixed"`, start date 2026-08-08, `futureLookaheadDays: 6`, and a seven-ID testing override so every bridge reading can be audited now. The later new plan receives its own agreed start date and may reduce or disable the override. Reading IDs and comments do not change when dates change.

The separate comments Sheet has been created with `comment-events` and `highlight-events` tabs and shared directly with Shane's exact account as Editor. The permission and absence of link/domain sharing were read back after the write. The Sheet is not the content permission gate.

The prior eight manifest/config/plan/source/Genesis files and all fourteen active bridge reading/metadata files are individually shared with Shane as Viewer. The bridge files remain in their original private parent folder; the post-share audit confirmed exactly one owner plus Shane as reader on every file and no broad permission. The 92-day factual reference file remains owner-only and is not requested by the runtime. Do not use link sharing. A future move to an inherited dedicated-folder ACL requires a separate migration and a fresh manifest, parent, and permission audit.

Its exact header row in columns A–O is:

```text
event_id | comment_id | client_request_id | plan_version | reading_id | event_type | author_id | display_name | body_json | base_revision | revision | created_at | updated_at | deleted_at | received_at
```

Freeze the header and leave appended rows under application control. The app writes each row as plain text and JSON-encodes the comment body to prevent spreadsheet formula interpretation. Because Shane must be a Sheet Editor for a `USER_ACCESSING` deployment, app-level revision history does not prevent either user from editing rows directly; review the tradeoff in `docs/ARCHITECTURE.md` before production. Reader codes protect the app RPCs but cannot gate Google's native Sheet editor. Direct Sheet access is limited by the Sheet's Google-account sharing list, so “valid code” must never be treated as permission to link-share it.

The exact `highlight-events` header row in columns A–Q is:

```text
event_id | highlight_id | client_request_id | plan_version | reading_id | event_type | author_id | display_name | book_id | chapter | verse | base_revision | revision | created_at | updated_at | deleted_at | received_at
```

Freeze this header too. Preserve both event tabs during backup and restore; the app never accepts a tab name from the browser.

## 2. Create the standalone Apps Script project

After building locally (`npm run build`), create a standalone Apps Script project and associate it with a standard Cloud project if needed for the consent configuration. Use clasp only after reviewing `dist/apps-script/`. Do not give the friend edit access to the script project because Script Properties include the ESV key.

First generate separate high-entropy codes on a trusted local terminal:

```sh
npm run reader-codes
```

Give Dustin only Dustin's raw code and Shane only Shane's. Do not paste the output into chat, store it in a tracked file, or place raw codes in Script Properties. Preserve only the SHA-256 hashes long enough to enter the configuration below.

Set these Script Properties in the Apps Script UI:

- `PRIVATE_MANIFEST_FILE_ID` — private manifest Drive file ID
- `COMMENTS_SPREADSHEET_ID` — separately shared comment Sheet ID
- `COMMENTS_SHEET_NAME` — `comment-events`
- `HIGHLIGHTS_SHEET_NAME` — optional; defaults to `highlight-events`
- `AUTHORIZED_USERS_JSON` — exactly two records. Replace the example emails and hash placeholders in the Apps Script UI only:

  ```json
  [
    {
      "email": "dustin@example.com",
      "authorId": "dustin",
      "displayName": "Dustin",
      "readerCodeHash": "<64-lowercase-hex-characters>"
    },
    {
      "email": "shane@example.com",
      "authorId": "shane",
      "displayName": "Shane",
      "readerCodeHash": "<64-lowercase-hex-characters>"
    }
  ]
  ```
- `ESV_API_KEY` — official key obtained by the owner; never store it locally in tracked config

Use the narrow explicit scopes in `app/apps-script/appsscript.json`. Google documents the personal-use verification exception for fewer than 100 users, while warning that limited users may click through an unverified-app screen: <https://support.google.com/cloud/answer/13464323> (checked 2026-08-08). This does not waive Google API user-data policy obligations.

## 3. Deploy securely

Deploy as a Web app:

- Execute as: **User accessing the web app**
- Who has access: **Anyone with a Google account** (not anonymous)

The source manifest encodes `USER_ACCESSING` / `ANYONE`; verify the deployment UI agrees. A leaked URL is not considered authorization.

## 4. Two-account acceptance test

In clean browser profiles:

1. Dustin grants all required scopes, enters Dustin's code, sees `Dustin`, reads all seven bridge entries, gets each live ESV chapter group, creates/edits/deletes a comment, and highlights/unhighlights a verse.
2. Shane grants scopes, enters Shane's code, sees `Shane`, reads only because the Drive folder is shared, and writes only because the Sheet is shared. Confirm both readers can highlight the same verse in their distinct colors, see both server timestamps, and remove only their own mark.
3. Confirm Shane's code fails while Dustin is signed in and Dustin's code fails while Shane is signed in.
4. A third signed-in account is denied before any private metadata is returned, even if it has a copied reader code.
5. Anonymous/incognito-without-login is denied by Google.
6. Remove Shane's folder permission and confirm reads fail closed.
7. Restore folder permission but remove Sheet edit permission and confirm reads work while writes fail safely.
8. Temporarily deploy an owner-executed test and confirm the server's active/effective identity guard rejects Shane; never publish that deployment.
9. Deny one granular scope and confirm the app shows authorization-required without content.
10. Disconnect the phone after both readings have loaded: commentary, snapshots, drafts, and the outbox should remain usable; ESV is available only when admitted by the current provider policy.

If `USER_ACCESSING` is unreliable across the two personal accounts, stop. Evaluate the documented GIS/server-validation fallback; do not deploy an owner-executed public content endpoint.

## 5. Install on iPhone for the audit

After the acceptance deployment exists:

1. Open the exact deployed `/exec` URL in Safari on the iPhone; do not use a copied iframe or `script.googleusercontent.com` redirect URL.
2. Sign in to the intended Google account and grant only the scopes listed in the consent screen.
3. Enter that person's assigned reader code. The raw code remains only in that device's IndexedDB as a fallback; Apps Script stores only the verified hash and author binding in that user's private User Properties so future browser-storage loss does not normally require re-entry.
4. Test Micah 3–4 and Micah 5–7 as single daily Scripture pages, a placeholder day, a comment draft, a verse highlight, synchronization, and “Clear downloaded data.”
5. In Safari, choose Share → Add to Home Screen, enable **Open as Web App**, choose the name, and add it. Apple documents this flow at <https://support.apple.com/en-ie/guide/iphone/iphea86e5236/ios>.
6. Launch the new Home Screen icon and repeat the bridge and comment tests at least once before relying on offline private commentary.

The local/conventional shell declares a dedicated 180-pixel Apple touch icon and 192-/512-pixel manifest icons. Google documents that favicon link tags included directly in Apps Script HTML are ignored; production therefore calls `HtmlOutput.setFaviconUrl` with the exact HTTPS Pages URL of the tracked 180-pixel PNG. That call is isolated from startup. Apple documents `apple-touch-icon` as the Web Clip mechanism, while Apps Script exposes only a favicon setter, so the installed icon remains an on-device check. References checked 2026-08-10: <https://developers.google.com/apps-script/reference/html/html-output> and <https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html>.

Apps Script supplies the viewport and the supported Apple/mobile-web-app capability settings through `HtmlOutput.addMetaTag`; placing them only in raw HTML is not sufficient in HTML Service. Google currently permits only `viewport`, `apple-mobile-web-app-capable`, `mobile-web-app-capable`, and `google-site-verification` through that method. Theme and status-bar styling remain in the local HTML/CSS but must not be passed to `addMetaTag`, which throws before the page is served. No service worker is registered under this hosting model, so cold offline launch is not guaranteed. The app's seven-reading target applies to fetched private payloads and policy-admitted Scripture, not to the executable shell.

## 6. Publish an update without trapping an old installed version

1. Run `npm run build`, `npm run publish:pages`, and `npm run check`. Inspect `dist/apps-script/`, `dist/pages/`, and tracked `web/`; the verifier must prove the current public manifest and assets exactly match source.
2. Commit and push the code-only release to `main`. Wait for Pages deployment, then retrieve `web/release.json` and all three assets over HTTPS. Confirm release ID, byte counts, SHA-384 values, `Access-Control-Allow-Origin`, JavaScript content type, and absence of private indicators.
3. A frontend-only release stops here: the fixed loader discovers the new manifest and immutable asset path. Do not redeploy Apps Script merely to change UI JavaScript or CSS.
4. For a backend, RPC, semantic-HTML, loader, scope, or deployment change, create a new immutable Apps Script version on canary. Preserve `getBootstrapData(readerCode)` for at least one transition. Production remains on the last phone-confirmed version.
5. Launch canary on the installed iPhone, close/reopen it, verify the month appears, open live ESV, and perform one comment or highlight write. Cache details must show `clientDeliveryMode: pages-assets`, the expected frontend release ID, and current/saved release source.
6. Only after that gate should the existing production deployment pointer move to the same immutable version. Record the prior version for immediate rollback. Released `web/releases/<releaseId>/` directories are immutable and remain available because a device may retain their last-valid manifest.

The manifest request uses no-store plus a unique query and every asset path contains the deterministic release ID, so routine updates no longer depend on replacing an Apps Script HTML document. This still cannot guarantee cold offline launch under the Apps Script origin. If the thin launcher remains unreliable, pause and review the Pages-top-level PWA/GIS fallback in `docs/ARCHITECTURE.md`.

## 7. Revocation and backup

Follow `docs/SECURITY.md`. Audit Drive and Sheet sharing periodically. Keep encrypted/private exports of content and comments outside Git, and test restore with new IDs before treating a backup as usable.
