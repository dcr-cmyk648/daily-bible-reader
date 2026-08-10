# Project state

Updated 2026-08-10 (`America/Detroit`).

## Current phase

The private reader is operating as a seven-day pre-launch bridge based on Celebration Church's *Reading the Bible in 3 Years — Year 3 Quarter 4*. After version 20 remained at the literal HTML **Starting…** state on Dustin's installed iPhone, the unchanged production URL was rolled back to confirmed-working immutable version 19. Recovery build `898d9f53923bd23a` is immutable version 21 on the separate canary URL pending an installed-iPhone smoke.

The app has local-first startup, a dark full-month calendar, authoritative two-reader completion, three reading pages, live network-only ESV, source-grounded private commentary, append-only shared comments, and append-only shared verse highlights. Dustin and Shane have distinct highlight colors, may both mark the same verse, see server timestamps, and may remove only their own marks.

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

- Hosting is an Apps Script HTML-service web app executing as the accessing user. Google identity, the exact two-user server allowlist, reader enrollment/code, and Drive permission must all succeed; failures close access.
- The private GitHub repository stores source and code-only CI history. GitHub Pages is disabled and GitHub is not a runtime dependency.
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
- Added and verified the frozen 17-column `highlight-events` tab in the existing event spreadsheet without changing sharing.
- Extended plan/reading schemas with stream IDs/sequences, context reading IDs, unit labels, and partial-passage bounds. Validation enforces four unique streams, contiguous schedule/stream order, earlier-only context, exact ranges, and introduction immediately followed by chapter 1.
- Documented the four-stream scheduling model without generating the complete plan.
- Built recovery bundle `898d9f53923bd23a`, created immutable Apps Script version 21, and deployed it only to canary. Production remains on version 19. Both deployment URLs return no-store Google sign-in redirects to anonymous requests.

## Validation status

- `npm run check` passes: repository safety over 68 files, seven schemas, seven active readings, the independent 92-day reference schedule, private validation of three v3 syntheses plus four v2 placeholders and 36 sources, 98/98 tests, and parsed/inspected 119,412-byte code-only recovery build `898d9f53923bd23a`.
- Schedule coverage includes stable IDs, grouped/partial passages, Detroit civil dates and DST, start-date changes, lookahead/locking, four-stream invariants, earlier-reading context, and introduction/chapter-1 adjacency.
- Authorization, comment, and highlight coverage includes two server-derived users, anonymous/third-user denial, Drive denial, code spoofing, arbitrary-ID rejection, create/edit/retract, highlight add/remove/overlap, owner-only removal, exact verse bounds, idempotent retry, collisions, XSS, and payload limits.
- ESV coverage includes server-only keys, exact attribution, no translation fallback, exact requested boundaries, and total persistent-storage refusal under the active provider policy.
- At iPhone-class width, the local browser smoke used only fabricated Scripture and verified immediate startup, the month, three-page reader, shared-highlight add/remove, timestamps, no horizontal overflow, and no console warnings/errors. Each generated inline script also parsed independently, and the source scripts executed successfully in macOS JavaScriptCore.
- Private validation and the review-bundle build pass after the source-registry and 1 Peter updates. The registry was replaced in Drive and its restricted permissions were re-read.

## Known risks and external checks

- Version 21 still needs a brief installed-phone canary smoke. Local and anonymous checks cannot reproduce iOS Apps Script shell execution or prove an authenticated `google.script.run` path. Production therefore remains on version 19 until the canary opens, reopens, and completes one live highlight add/remove.
- Shane's account/code binding and app-mediated comment creation are verified. His live ESV, Home Screen installation, and highlight overlap remain manual checks for later.
- An editor of the underlying Sheet could alter rows directly. Google sharing is restricted to the two exact accounts, but the event logs are operationally auditable rather than cryptographically immutable.
- Offline revocation is not instantaneous. Removing access requires allowlist, Drive, and Sheet revocation plus clearing downloaded data on a retained device.
- No service worker runs under Apps Script hosting; warm local-first startup is supported, but iOS controls cold shell retention and ESV always needs a network.
- The three substantive syntheses remain `in_review`. D057–D060 remain placeholders. No later commentary or full chronological plan has been generated.

## Next concrete action

Open canary version 21 on Dustin's iPhone, confirm that **Starting…** changes immediately, open a reading, add/remove a highlight, close it, and reopen it. Promote the same immutable version to the unchanged production deployment only after that gate passes. When Shane later tests, confirm his color can coexist on the same verse and that neither reader can remove the other's mark. After that smoke, convert `docs/CONTENT_AUTOMATION.md` into the agreed remote prepublication automation and readiness-alert workflow without adding runtime AI to the reader.
