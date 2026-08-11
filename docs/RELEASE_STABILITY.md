# Installed-reader release stability

Status: phone-confirmed Pages/token PWA primary plus immutable Apps Script version-23 rollback, 2026-08-10.

## What the deployed artifacts show

The immutable Apps Script versions were downloaded back from Google and measured directly. These are the stored deployment artifacts, not reconstructed local estimates.

| Version | Phone observation | HTML bytes | Inline script bytes | Longest JavaScript line |
|---:|---|---:|---:|---:|
| 15 | Loaded | 143,455 | 105,918 | 519 |
| 16 | Stalled | 150,298 | 110,593 | 519 |
| 17 | Stalled | 153,034 | 113,329 | 519 |
| 18 | Reached **Authorizing…**, then stalled | 98,373 | 62,887 | 41,524 |
| 19 | Loaded; current production control | 106,260 | 70,662 | 49,022 |
| 20 | Main application never started | 119,153 | 80,377 | 56,444 |
| 21 | Watchdog ran; main application never started | 119,412 | 1,537 + 73,394 + 5,660 | 50,482 in the core |
| 22 | Reflow-only A/B canary; failed on first iPhone open | 119,556 | 1,539 + 73,506 + 5,668 | 817 maximum |
| 23 | Hybrid loaded, reopened, read ESV, and wrote highlights; current production | 23,837 | 1,757 + 4,074 | 807 maximum |

There are at least two failure classes. Versions 16–18 reached or plausibly entered application startup and motivated bounded IndexedDB/RPC behavior plus version 19's local-first shell. Versions 20–22 fail earlier: the independent watchdog executes, but the core does not reach its first marker. That excludes commentary schema, Drive, ESV, authorization, and IndexedDB for the latest failure.

Versions 19–21 initially suggested a sharp line-length boundary: the working core's longest minified line is 49,022 characters, while both pre-core failures exceeded 50,000. Version 22 disproved that as a sufficient explanation by failing on its first iPhone open with an 817-character maximum. Total HTML size also does not correlate: the much larger version 15 loaded. The responsible HTML Service/iPhone failure remains unspecified; commentary schema, Drive, ESV, authorization, IndexedDB, total shell size, and generated line length are not sufficient explanations.

Version 22 was a decisive one-variable test. After parsing and reminifying versions 21 and 22, their three scripts were identical except for the injected build ID; only line wrapping differed. Its failure rejects the long-line hypothesis and activates the external code-only asset architecture below.

## Permanent build controls

- Every JavaScript and CSS transform uses esbuild's official `lineLimit` option at 800 bytes.
- The build independently rejects any generated inline JavaScript line over 1,200 characters. A feature cannot silently cross the observed boundary.
- The build reports HTML bytes plus per-script bytes and maximum line length.
- Each inline script is parsed independently after final HTML insertion.
- Optional features load after the core and cannot perform an installed-reader IndexedDB migration.
- A tiny independent watchdog distinguishes “core did not execute” from “secure loading did not finish.”
- Google-stored immutable artifacts are read back and byte-compared for diagnostic releases.

The line ceiling is deliberately far below the observed failure and close to the known-good unminified releases. The small newline cost is preferable to a cliff where a minor feature changes whether the entire app executes. esbuild documents `lineLimit` as an approximate output-wrapping control: <https://esbuild.github.io/api/#line-limit> (checked 2026-08-10).

## Release policy

1. Production stays on the last phone-confirmed immutable version until a canary passes.
2. A stability canary changes one delivery variable at a time.
3. `npm run check`, generated-line enforcement, repository safety, exact artifact inspection, and public-backend status/denial probing must pass before canary. A commentary-rendering release also verifies at mobile width that no internal citation marker is visible, every numbered link reaches a source note, and citation text creates no horizontal overflow.
4. A new shell architecture or storage/RPC migration requires an installed-iPhone cold launch, close/reopen, calendar open, one Scripture open, and one write test before promotion.
5. Ordinary content publication does not redeploy the shell. After the hybrid's initial phone gate, routine frontend changes publish a verified immutable Pages release; phone testing is reserved for launcher, storage, authentication, backend-contract, and deployment changes instead of every small UI edit.
6. Failed releases are never promoted. The stable production deployment stays pinned to version 23; a Pages/token rollback restores the last good immutable Pages/PWA release or reopens the retained version-23 installation.
7. An unexpired private-content cache may paint immediately but is never version authority for the current and next reading. After authorization, both records must be re-fetched, validated, persisted over older revisions, and used to rerender readiness. An opened placeholder must wait for the fresh payload; an open prepared page must rerender when a different commentary version/hash arrives. A content-status or attached-commentary update may not require users to clear downloaded data manually.

## Stable hybrid control

The bounded-line build was unreliable, so production version 23 uses a small Apps Script launcher and code-only Pages assets. Its immutable server build `c57d948db8fbf838` and initial frontend release `73da95f8a9ec3bb3` passed exact artifact comparison and installed-iPhone open/reopen, ESV, comment, and highlight checks. The later frontend release `ced732908c22c3de` remains the phone-confirmed public-code control.

The stable launcher still uses `google.script.run`, `USER_ACCESSING`, Google identity, Drive gating, and User Properties. It remains installed and available as rollback. No token-backend build, push, or deployment may update this production deployment pointer.

Its **D** Home Screen monogram is a confirmed Apps Script hosting limitation: Apps Script provides an outer favicon but no Web App Manifest or Apple touch icon for the installed top-level document. Reinstalling the same Apps Script URL cannot fix it.

## Pages/token primary boundary

The user approved a lower-friction bearer-token model for this two-person personal app. The isolated-path `web/pwa-canary/` is the installed top-level PWA: it owns the manifest/open-Bible icon, public-only service worker, immediate shell, and update lifecycle. It replaces the discarded GIS/API-executable prototype and requires no OAuth web client, Cloud billing setup, or Shane consent screen. The historical path name remains unchanged to preserve the installed URL.

The Pages client sends one bounded hidden-form POST per RPC to a separate public owner-executed Apps Script web-app deployment. The response is confined by fixed Pages origin, Google response-origin validation, request ID, and a 192-bit nonce. Only eleven methods and exact argument counts are accepted. Reader codes remain in POST bodies/IndexedDB and server-side hashes; no private data or ESV response enters Pages or Cache Storage.

The token backend is built into `dist/apps-script-token-canary/`. It is derived from the common server but has a status-only `doGet`, allowlisted `doPost`, token-derived identity, script-cache rate buckets, and `ANYONE_ANONYMOUS` / `USER_DEPLOYING` manifest without `userinfo.email`. `app/apps-script/appsscript.json` remains the stable `USER_ACCESSING` source manifest. The token deployment is an immutable separate deployment; project HEAD is restored to the stable bundle immediately afterward.

Publishing never deletes `web/releases/` or older versioned PWA clients. The service worker controls only `/web/pwa-canary/`, skips config and every non-GET/cross-origin request, installs a complete enumerated public cache before activation, and retains one prior app cache for rollback.

Dustin confirmed the installed Pages reader works after the live browser gate, so the Pages URL is now recommended. Every routine UI release still requires repository safety, the full check, immutable release generation, exact tracked-artifact verification, live HTTPS byte/MIME verification, and a browser smoke. A shell, service-worker, storage, authentication, backend-contract, or deployment change additionally requires a fresh installed-iPhone gate. Shane and crossed/wrong-token tests remain outstanding. A failure changes nothing about Apps Script production version 23.

The Nahum readiness incident exposed a separate stale-data class rather than an Apps Script startup failure: D057 first remained `unreviewed`, and the priority warmer then replaced the valid seven-day IndexedDB placeholder without rerendering an already opened page. D057 is now `in_review` with its complete reviewed Henry layer attached. The client regression-tests unconditional post-authorization revalidation for current and next, blocking refresh for an opened placeholder, and in-place rerender when a different commentary version/hash arrives. The readiness contract now audits every requested end-to-end component and starts its advance horizon with tomorrow, so D058 can be identified as a later gap without implying that D057 is incomplete. The public release changes no service-worker storage schema, token transport, Apps Script backend, or ESV persistence rule, but the installed-iPhone update/reopen check remains required because priority-cache behavior changed.
