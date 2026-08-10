# Apps Script source

`Code.gs` is the authenticated server. `npm run build` copies it and the shared server core into `dist/apps-script/`, then generates an Apps Script-compatible `Index.html` from the single frontend source. The build computes one deterministic source hash and injects it as the client/server build ID so installed clients can detect a stale shell and offer restricted, versioned top-level navigation. `dist/` is ignored and must pass repository-safety inspection before clasp use.

A standalone script project, immutable version 1, and a signed-in/user-executed audit deployment have been created after explicit approval. The reviewed four-file bundle is uploaded. The real repository-root `.clasp.json` is ignored. The comments Sheet, pilot-file sharing, four non-secret Script Properties, and owner-entered ESV key are configured. Dustin confirmed the reader opens and is installed on the iPhone Home Screen. The temporary setup deployment has been removed and its logic is absent from project HEAD. Current external status is recorded only in ignored `private-content/external-state.json`.

The manifest intentionally uses `ANYONE` (signed-in Google accounts) plus `USER_ACCESSING`. Server code additionally requires matching active/effective identities, the private two-user allowlist, that user's reader-code hash, and Drive access. Do not change this to `ANYONE_ANONYMOUS` or `USER_DEPLOYING`.

Generate Dustin's and Shane's codes with `npm run reader-codes` only in a trusted terminal. Put only their hashes in `AUTHORIZED_USERS_JSON`; never copy raw codes into this repository, build output, logs, or chat. Keep `getBootstrapData(readerCode)` backward-compatible for at least one deployment transition so an old installed shell can retrieve the new build ID.
