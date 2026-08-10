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
| 22 | Reflow-only A/B canary | 119,556 | 1,539 + 73,506 + 5,668 | 817 maximum |

There are at least two failure classes. Versions 16–18 reached or plausibly entered application startup and motivated bounded IndexedDB/RPC behavior plus version 19's local-first shell. Versions 20–21 fail earlier: version 21's independent watchdog executed, but the core did not reach its first marker. That excludes commentary schema, Drive, ESV, authorization, and IndexedDB for the latest failure.

Versions 19–21 create a sharp empirical boundary: the working core's longest minified line is 49,022 characters, while both pre-core failures exceed 50,000. Total HTML size does not correlate: the much larger version 15 loaded. Google and WebKit do not document a 50,000-character application limit, so the responsible internal layer remains unspecified; it may be HTML Service sanitization/delivery, iframe handling, or iPhone WebKit compilation. The project treats the deployed behavior—not an undocumented vendor promise—as the compatibility contract.

Version 22 is the decisive one-variable test. After parsing and reminifying versions 21 and 22, their three scripts are identical except for the injected build ID; the application logic is unchanged. Only generated line wrapping differs. A successful phone launch therefore establishes long-line delivery as causal for the version 20–21 failure in this deployment.

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
5. Ordinary content publication does not redeploy the shell. Once version 22's mechanism is confirmed and the build ceiling is permanent, routine code changes use automated artifact gates; phone testing is reserved for shell, storage, authentication, and deployment changes instead of every small UI edit.
6. Failed canaries are never promoted. Rollback changes only the deployment's immutable version pointer.

## If the bounded-line build is still unreliable

Do not resume feature work. The next architecture candidate is a nearly frozen Apps Script HTML/authentication shell that loads versioned, code-only JavaScript and CSS from a stable HTTPS static host. Apps Script would retain `google.script.run`, user-executed authorization, Drive gating, Sheet writes, and the server-held ESV key; public assets would contain no content, comments, credentials, Google IDs, or ESV text. This removes large application code from HTML Service's inline transformation path without making the private backend public. It requires a separate CSP, cache, availability, and iPhone authentication test before adoption.
