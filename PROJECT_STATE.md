# Project state

Updated 2026-08-10 (`America/Detroit`).

## Current phase

The private reader is operating as a seven-day pre-launch bridge based on Celebration Church's *Reading the Bible in 3 Years — Year 3 Quarter 4*. The installed GitHub Pages PWA is now the phone-confirmed primary reader. Its separate immutable Apps Script version-24 bridge executes as the owner and authenticates Dustin/Shane through the existing long reader codes; it does not use Google OAuth/GIS. Apps Script version 23 remains unchanged as the accessing-user rollback launcher/backend.

The app has local-first startup, a dark full-month calendar, authoritative two-reader completion, selected-day verse references, a three-day commentary-readiness warning, three reading pages, live network-only ESV, source-grounded private commentary, append-only shared comments, and append-only shared verse highlights. Dustin and Shane have distinct highlight colors, may both mark the same verse, see server timestamps, and may remove only their own marks. Startup milestones are visible only in the local cache/build inspector and never leave the browser.

A local content-automation foundation now models separate seven-day draft and five-day explicitly approved live buffers. Its read-only evaluator selects at most one earliest consecutive gap, validates staging/live metadata and hashes, treats book introductions as normal readings, and cannot invoke a model, write content, publish, or deploy. The recurring Codex task and Drive staging area have not been created.

The long-term plan has not been generated. Its schema and validator now support four interwoven streams, book-introduction days, prior-reading context, and bounded partial passages.

## Active schedule

The fixed shared start date is 2026-08-08 in `America/Detroit`; all six following days are available for the audit window.

| Bridge date | Stable reading ID | Source day | Passage | Content state |
|---|---|---:|---|---|
| Aug 8 | `CC-Y3Q4-D054` | 54 | Micah 3–4 | Full synthesis, `draft-v7`, in review |
| Aug 9 | `CC-Y3Q4-D055` | 55 | Micah 5–7 | Full synthesis, `draft-v7`, in review |
| Aug 10 | `CC-Y3Q4-D056` | 56 | 1 Peter 5 | Full synthesis, `draft-v8`, in review |
| Aug 11 | `CC-Y3Q4-D057` | 57 | Nahum 1 | Explicit preparation placeholder |
| Aug 12 | `CC-Y3Q4-D058` | 58 | Nahum 2 | Explicit preparation placeholder |
| Aug 13 | `CC-Y3Q4-D059` | 59 | Nahum 3 | Explicit preparation placeholder |
| Aug 14 | `CC-Y3Q4-D060` | 60 | Proverbs 31 | Explicit preparation placeholder |

The full 92-day Celebration chapter assignment is factual reference metadata only. Days outside 54–60 are not active and have no generated study content. The preserved Genesis calibration drafts are inactive.

## Decisions in force

- The phone-confirmed rollback remains an Apps Script HTML-service web app executing as the accessing user. Google identity, the exact two-user server allowlist, reader enrollment/code, and Drive permission must all succeed on that path; failures close access.
- GitHub Pages is enabled from `main`. The Pages PWA contains only public shell code, icons, release metadata, and one necessarily public Apps Script web-app URL. Its owner-executed backend hashes the presented high-entropy reader code and derives exactly one of two fixed identities. Pages is never authorization, reader codes never enter Git or URLs, and OAuth/GIS is intentionally absent from this owner-approved two-person path.
- Drive is canonical for private plans, commentary, and source metadata. The restricted event spreadsheet has separate append-only `comment-events` and `highlight-events` tabs.
- Reader identity, display name, IDs, timestamps, and revisions are server-derived. The client cannot select another user, Sheet, Drive file, passage, or redirect.
- ESV is the only displayed translation. Each chapter is fetched server-side through the official API and is never persisted in Git, Drive, IndexedDB, or a service-worker cache.
- Private commentary, source metadata, comment state, drafts, and the comment outbox may remain in IndexedDB for up to seven days. Comment writes cannot leave the device until current authorization succeeds. Highlight state is network-only and memory-resident for the open Scripture page.
- Runtime AI remains disabled. Research, drafting, validation, review, and publication happen offline one reading at a time.
- Commentary treats Scripture as true and divinely inspired, receives prophecy, miracle, divine action, and explicit attribution as the working presumption, and does not treat methodological naturalism as a neutral baseline.
- Non-Christian critical work enters the synthesis only for a genuinely influential or materially important claim. Included counterpositions name traceable sources and state the evidence, strongest traditional explanation, and assessment concisely. Published prose never mentions prompts or editorial rules.
- Prior-day continuity is useful when a reading strongly depends on its immediate context, but every displayed unit must still make sense within that day's Scripture.
- The long-term plan will interweave four streams: OT outside Psalms/Proverbs, NT, Psalms, and Proverbs. Remaining units are scheduled proportionally so all four finish together while preserving chronology as far as practical. Every book introduction is its own daily unit and must be followed immediately by that book's chapter 1. The introduction's middle page contains the book overview instead of ESV text. One day remains one focused unit; Proverbs may use bounded verse ranges.
- The final canon, launch date, future-lock behavior, browsing horizon, and recurring commentary length still require confirmation before the full plan is generated.

## Approved backlog and design candidates

`docs/BACKLOG.md` is the canonical cross-feature index; this section records the immediate decisions that materially affect current implementation.

- The selected-date card now shows the validated **verse of the day** reference and ESV.org link above the open button. It uses private commentary metadata only; exact ESV wording remains on the opened reading page and is never copied into plan/commentary metadata or IndexedDB.
- Use Matthew Henry's *Complete Commentary on the Whole Bible* as the default foundational commentary pass, then build outward with independent sources suited to the passage. The preferred exact research edition is CrossWire `MHC` version 2.2, explicitly marked public domain; preserve the normal edition, provenance, independence, and claim-level citation controls.
- The installed Pages PWA passed Dustin's phone check and is the recommended path. It supplies deterministic shell launch, exact public-asset offline caching, the correct iOS icon/manifest, and explicit version updates; live Drive, Sheets, ESV, and writes still cross the Apps Script bridge. The discarded OAuth/API-executable prototype has been replaced by the approved reader-token bridge, so no Cloud project, OAuth client, consent screen, or billing setup remains.

## Completed work

- Inspected this repository and Fractured Fate read-only; Fractured Fate remains unchanged.
- Recorded the complete 92-day Celebration chapter assignment while activating only D054–D060 and generating substantive work only for D054–D056.
- Built secure Apps Script/Drive/Sheet/ESV adapters, server-derived reader enrollment, append-only comment revisions, offline drafts/outbox, calendar-wide completion, and network-only ESV handling.
- Built the three-page mobile reader, full-month calendar, selected-date card, two-reader dots, comments on every page, verse of the day, custom collapsed deep studies, source audit, and deterministic old-build recovery.
- Built a 36-record ignored source registry: 27 included sources, one consulted placement source, and eight inaccessible copyrighted candidates. Mirrors and snippet-only discoveries do not count as consulted.
- Added critical-source `affiliationContext` and `synthesisPriority` metadata. Validators reject unbounded or anonymous critical-source use and prevent inaccessible sources from being presented as consulted.
- Revised the 1 Peter 5 deep study to name the major modern authorship case and present the traditional Silvanus explanation tightly. Uploaded `draft-v8` and the revised source registry in place; file identity and owner-plus-Shane permissions were preserved.
- Added shared highlights end to end: immutable create/delete events, idempotency, locking, exact passage-bound validation, server identity/time, owner-only removal, two-reader overlap, accessible verse buttons, and color/timestamp UI.
- Isolated highlights into an optional post-core client after the version-20 phone stall. The core reader now starts immediately, installed readers stay on IndexedDB schema version 4, highlights never migrate or persist in IndexedDB, and independent 8/45-second startup watchdogs replace an infinite **Starting…** state with a visible recovery path.
- Downloaded immutable Apps Script versions 15–22 from Google and built a release matrix. The working version-19 core's longest minified line is 49,022 characters; both pre-core failures exceed 50,000. Version 22 preserves version-21 logic but reduces every inline script line to at most 817 characters.
- Added a permanent 800-byte esbuild line target, a hard 1,200-character generated-script ceiling, per-script build diagnostics, and the release policy in `docs/RELEASE_STABILITY.md`.
- Recorded version 22's first-open iPhone failure and rejected line length as a sufficient cause instead of weakening the phone gate.
- Built the external code-only delivery path. The launcher validates one fixed Pages origin/prefix, retrieves a no-store release manifest, applies SHA-384 integrity, keeps a last-valid immutable-release fallback, and rejects hostile paths. Frontend/server releases are independently versioned so routine UI changes do not redeploy Apps Script.
- Published frontend release `73da95f8a9ec3bb3` from `main` to GitHub Pages. The manifest, core, stylesheet, and optional highlight client returned HTTPS 200 with CORS enabled and matched the tracked bytes exactly.
- Created immutable Apps Script version 23 from server build `c57d948db8fbf838`, moved only the existing canary deployment to it, and downloaded the Google-stored files back for an exact byte comparison.
- Passed version 23 on Dustin's installed iPhone, including close/reopen, calendar, live ESV, and reversible highlight write; promoted that exact immutable artifact to the unchanged production deployment.
- Reworked highlight writes so add/remove paints immediately, shows a saving state, reconciles from the authoritative write response, and rolls back on failure. This removes the second serial Sheet read from every toggle. Frontend release `ced732908c22c3de` is live on Pages; the Apps Script build remains `c57d948db8fbf838`.
- Confirmed the intended open-Bible PNG is valid and reachable but cannot become the Home Screen icon under the current top-level Apps Script host. Apps Script can set only a favicon, while iOS needs a manifest icon or Apple touch icon and therefore generates the observed **D** monogram.
- Added and verified the frozen 17-column `highlight-events` tab in the existing event spreadsheet without changing sharing.
- Extended plan/reading schemas with stream IDs/sequences, context reading IDs, unit labels, and partial-passage bounds. Validation enforces four unique streams, contiguous schedule/stream order, earlier-only context, exact ranges, and introduction immediately followed by chapter 1.
- Documented the four-stream scheduling model without generating the complete plan.
- Added the canonical `docs/BACKLOG.md` so all requested deployment, calendar, commentary, automation, plan, offline, and manual-check work survives conversation history and is prioritized independently of the current task.
- Replaced the unused OAuth/API-executable canary with an eleven-method HTTPS form bridge. It keeps the reader code in POST bodies, binds replies to random request IDs/nonces, accepts only Google's actual Apps Script response origins, enforces exact methods/arity/size limits, and retains the code only in IndexedDB after server verification.
- Created immutable owner-executed Apps Script version 24 as a separate token-canary deployment while leaving both version-23 deployments unchanged. After publishing to `main`, a real-browser test found that Google serves HtmlService from generated `n-…-script.googleusercontent.com` sandbox hosts; release `d9bcecb7f5b1d5fa` contains the narrowly constrained origin fix and a regression test.
- Dustin confirmed the installed Pages reader works. It is now the primary installation; the historical `pwa-canary` path remains stable, and Apps Script version 23 remains an untouched rollback.
- Added a selected-day verse reference to the calendar detail card. It is validated against the reading, sourced from private commentary metadata, linked to ESV.org, and never downloads or persists ESV wording from the calendar.
- Added deterministic commentary readiness across the next three consecutive studies. The current seven-reading batch treats substantive legacy `in_review` or `approved` records with valid reading/hash metadata as ready, rejects placeholders/requested changes/mismatches/gaps, shows Dustin the first gap, and gives Shane only a generic delay message.
- Added field-allowlisted startup milestones for shell, application code, cached/fresh calendar, authorization, fresh sync, and Scripture. The inspector keeps only monotonic millisecond values in memory; it stores or transmits no identity, content, references, comments, credentials, or private IDs.
- Added versioned automation policy, private staging-index, live-metadata-index, and readiness-report schemas; a read-only earliest-gap CLI; fabricated fixtures; and a scheduled-task runbook/prompt. The strict publication horizon requires explicit `approved` metadata and does not inherit the bridge UI's temporary legacy `in_review` compatibility.
- Built A/B bundle `aa5f629de676c1b3`, created immutable Apps Script version 22, deployed it only to canary, and cloned it back from Google to confirm an exact byte match with the inspected bundle. Its phone failure was preserved as diagnostic evidence rather than promoted. Both deployment URLs return no-store Google sign-in redirects to anonymous requests.

## Validation status

- The local content-automation foundation passed `npm run check`: repository safety over 127 files, 11 schemas, 132/132 tests, all builds, and exact Pages verification. Its fixtures contain only fabricated plan metadata, its evaluator emitted exactly one earliest-gap action, and no recurring task, private-content write, model run, publication, deployment, or Google-resource change occurred.
- The selected-day/readiness/diagnostics batch passed a clean isolated `npm run check`: repository safety over 113 files, seven schemas, 121/121 tests, all builds, and exact tracked Pages artifact verification. Ignored private content separately passed its full three-synthesis/four-placeholder/36-source validation. Commit `93d0812` is live on Pages with frontend `16d564a50f763ab3` and PWA `644cc0275a7264c0`; both GitHub workflows passed and the live manifest, shell, service worker, bridge client, and application core matched the committed bytes exactly. An authenticated 390-pixel browser smoke confirmed cached calendar launch, selected-day verse, the readiness warning, live ESV with attribution, zero horizontal overflow, no console errors, and a timing inspector free of credentials, identities, comments, Scripture, and private content. Apps Script version 23 was not redeployed.
- The exact committed Pages-token release passed a clean-clone `npm run check`: repository safety over 105 files, seven schemas, all content/source/private validators, 118/118 tests, all builds, and exact tracked-artifact verification. The stable backend is server `6306f476dd5c9920`, the shared frontend is `01e0dce691dd3cc9`, and the corrected PWA is `d9bcecb7f5b1d5fa`. GitHub Actions passed on `main` commit `1cc0a1e`.
- Hybrid server build `c57d948db8fbf838` has 23,837 bytes of Apps Script HTML with only 1,757-byte and 4,074-byte watchdog/loader scripts inline. Live Pages frontend `ced732908c22c3de` contains the integrity-checked 73,635-byte core, 21,566-byte CSS, and 6,501-byte optional highlight client; exact HTTPS readback, content types, and permissive asset CORS were verified after publication. Tracked `web/` exactly matches the live release, and prior `73da95f8a9ec3bb3` remains available for fallback.
- GitHub Pages HTTPS readback passed for the release manifest and all three immutable assets: status, content type, CORS, byte length, and complete bytes were verified. Apps Script version 23 also matches the inspected local build exactly; its anonymous probe correctly redirects to Google sign-in with no-store headers.
- At iPhone-class width, the optimistic add/remove smoke used fabricated Scripture, updated accessible verse state correctly, produced no horizontal overflow or console errors, and left the server/launcher build unchanged.
- Schedule coverage includes stable IDs, grouped/partial passages, Detroit civil dates and DST, start-date changes, lookahead/locking, four-stream invariants, earlier-reading context, and introduction/chapter-1 adjacency.
- Authorization, comment, and highlight coverage includes two server-derived users, anonymous/third-user denial, Drive denial, code spoofing, arbitrary-ID rejection, create/edit/retract, highlight add/remove/overlap, owner-only removal, exact verse bounds, idempotent retry, collisions, XSS, and payload limits.
- ESV coverage includes server-only keys, exact attribution, no translation fallback, exact requested boundaries, and total persistent-storage refusal under the active provider policy.
- At iPhone-class width, the local browser smoke used only fabricated Scripture and verified immediate startup, the month, three-page reader, shared-highlight add/remove, timestamps, no horizontal overflow, and no console warnings/errors. Each generated inline script also parsed independently, and the source scripts executed successfully in macOS JavaScriptCore.
- Private validation and the review-bundle build pass after the source-registry and 1 Peter updates. The registry was replaced in Drive and its restricted permissions were re-read.

## Known risks and external checks

- The hybrid has passed Pages HTTPS readback, local execution, immutable Google artifact comparison, anonymous sign-in probing, and the installed-phone gate. Version 23 is production.
- The Apps Script rollback installation retains WebKit's **D** monogram. The installed Pages PWA supplies the intended open-Bible Apple touch icon and manifest icons.
- Shane's account/code binding and app-mediated comment creation are verified. His live ESV, Home Screen installation, and highlight overlap remain manual checks for later.
- An editor of the underlying Sheet could alter rows directly. Google sharing is restricted to the two exact accounts, but the event logs are operationally auditable rather than cryptographically immutable.
- Offline revocation is not instantaneous. Removing access requires allowlist, Drive, and Sheet revocation plus clearing downloaded data on a retained device.
- No service worker runs under Apps Script hosting; warm local-first startup is supported, but iOS controls cold shell retention and ESV always needs a network.
- The Pages PWA uses bearer codes rather than Google account identity. A leaked Dustin or Shane code grants that reader's app access until its configured hash is rotated; this is the explicit low-exposure tradeoff accepted for the two-person app. The isolated backend URL and approximate rate limits reduce accidental/automated abuse but are not substitutes for code secrecy.
- The Pages PWA is the primary Home Screen installation after Dustin's confirmation. Version 23 remains the tested rollback; Shane's later install/live-ESV/overlapping-highlight check is still outstanding.
- The three substantive syntheses remain `in_review`. D057–D060 remain placeholders. No later commentary or full chronological plan has been generated.
- No recurring task is enabled. A local-project scheduled task will require the Mac and ChatGPT desktop app to be running; a web-scheduled task cannot run the repository validators directly. The in-reader warning remains independent of scheduling.

## Next concrete action

Reconcile the separate Matthew Henry verse-by-verse work with this automation branch, then create ignored real staging/live metadata and manually dry-run the saved scheduled-task prompt against an already completed reading. Only after that review should a recurring Codex task or Drive staging area be created. D057–D060 remain placeholders until individually requested or reached by an explicitly approved generation workflow.
