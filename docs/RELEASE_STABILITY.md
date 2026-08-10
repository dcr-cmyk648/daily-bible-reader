# Installed-reader release stability

Status: release-blocking investigation, 2026-08-10.

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
3. `npm run check`, generated-line enforcement, exact artifact inspection, and anonymous no-store/sign-in probing must pass before canary.
4. A new shell architecture or storage/RPC migration requires an installed-iPhone cold launch, close/reopen, calendar open, one Scripture open, and one write test before promotion.
5. Ordinary content publication does not redeploy the shell. After the hybrid's initial phone gate, routine frontend changes publish a verified immutable Pages release; phone testing is reserved for launcher, storage, authentication, backend-contract, and deployment changes instead of every small UI edit.
6. Failed canaries are never promoted. Rollback changes only the deployment's immutable version pointer.

## External code-only asset architecture

The bounded-line build was unreliable, so the fallback is active. GitHub Pages serves only content-addressed JavaScript and CSS. A small Apps Script HTML document remains the signed-in top-level launcher, which preserves `google.script.run`, user-executed authorization, Drive gating, Sheet writes, User Properties, and the server-held ESV key. No commentary, comments, ESV wording, credentials, Google resource IDs, account emails, or deployment URL enters Pages.

The launcher fetches a fixed-origin `release.json` with `no-store` and a unique query, validates its schema, release path, byte bounds, and exact Pages origin, and loads each immutable asset with SHA-384 Subresource Integrity. It remembers only the last validated code-release manifest in `localStorage`; if the current manifest is temporarily unavailable, it may request that previously successful immutable release. Old release directories remain available. Arbitrary URLs supplied by a manifest are rejected.

Build `c57d948db8fbf838` paired the initial launcher/server with frontend release `73da95f8a9ec3bb3`. Its Apps Script HTML is 23,837 bytes and contains only the 1,757-byte watchdog and 4,074-byte loader inline; the 73,635-byte application core, 21,566-byte stylesheet, and 5,666-byte optional highlight client are Pages assets. The release manifest and every immutable asset passed live HTTPS status, content-type, CORS, size, and exact-byte readback. Immutable Apps Script version 23 was also downloaded from Google and exactly matched the inspected build. Dustin then confirmed installed-iPhone open/reopen, live ESV, and highlight add/remove; that exact artifact was promoted to production.

The phone gate also resolved the icon question. The intended open-Bible PNG is valid and reachable, and Apps Script's favicon setter receives its exact URL, but the installed icon is still WebKit's **D** monogram. Apps Script provides no outer-document manifest or Apple touch-icon API, while iOS uses those declarations for Home Screen artwork. The icon is therefore a documented hosting limitation rather than stale Pages content. Do not churn launcher versions to retry the same unsupported metadata path.

This is not yet a service-worker-controlled PWA because the installed top-level origin remains Apps Script. It should make routine UI releases deterministic and fast without weakening Google identity. If the thin launcher itself remains unreliable or slow, the next boundary is a Pages-top-level PWA using Google Identity Services and server-side token validation; that larger authentication migration is not assumed safe without a separate prototype and two-account authorization test.
