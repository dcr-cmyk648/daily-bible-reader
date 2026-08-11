# Daily Bible Reader

A private, mobile-first daily Bible reader for two people. The active pre-launch bridge contains exactly seven stable daily readings from Celebration Church's *Reading the Bible in 3 Years — Year 3 Quarter 4*:

1. `CC-Y3Q4-D054` — Micah 3–4
2. `CC-Y3Q4-D055` — Micah 5–7
3. `CC-Y3Q4-D056` — 1 Peter 5
4. `CC-Y3Q4-D057` — Nahum 1
5. `CC-Y3Q4-D058` — Nahum 2
6. `CC-Y3Q4-D059` — Nahum 3
7. `CC-Y3Q4-D060` — Proverbs 31

The deployed reader opens to an always-dark, compact full-month calendar. Selecting a date shows that day’s passage, bridge position, separate Dustin/Shane completion states, and its verse-of-the-day reference; for today and tomorrow, the exact ESV wording appears as soon as the two-reading volatile window is warm. A date-specific button then opens the reading. Each calendar cell has two color-coded completion dots. An available day opens as three pages—a brief orientation, Scripture or book overview, then one source-grounded commentary article with a representative verse and concrete daily takeaway—with the same reading-level comment form beneath each page. On the Scripture page, tapping a verse opens one verse-details sheet: optional precomputed Matthew Henry commentary is looked up from the already-loaded private payload, while Dustin and Shane retain independent highlight colors and may both mark the same verse. A reviewed Henry record can expose the exact cited public-domain commentary atoms under **Read Henry**; embedded source-module Scripture transcription is omitted. No click invokes AI or fetches a separate commentary record. The verse of the day is stored only as a validated reference; its exact ESV wording comes from live Scripture held in memory and is never added to commentary metadata. Main claims use numerical citations at the exact point they are supported, resolving to one numbered source list. Passage-specific deep-study headings appear below the discussion and **Finished** controls; each section and the research audit is independently collapsed so optional depth never blocks the comment box. The writing assumes experienced readers but uses plain, practical prose; every displayed unit must make sense on its own within that day’s reading. Each reader's active comment marks that reader’s day complete. A valid seven-day, reader-bound local snapshot paints the calendar and cached commentary immediately; the stored reader code is reconfirmed in the background. Once authorization succeeds, the current and next private records are always re-fetched and replace older cached revisions, so a seven-day cache cannot hide newly published study material. The calendar warns when fewer than three consecutive full studies remain, with exact preparation details only for Dustin. Comment drafts retain an authorization-gated offline outbox. Highlights synchronize only while online and remain isolated from the core startup path.

The tracked local app uses fabricated mock Scripture and a non-substantive commentary fixture. Private Drive contains source-grounded draft syntheses for D054–D057. D057 is now `in_review` and includes a copy-edited, exact-source-linked 15-verse Matthew Henry layer in the same private payload; D058–D060 remain conspicuous main-study placeholders. The ignored Spark window also retains private D056 and D058 Henry audits, but those two are not attached or published; D059 and D060 have no generated Henry layer. A separate factual reference file records all 92 source-plan assignments without devotional prose or generated study content. The prior Genesis calibration drafts remain preserved but inactive. The primary Pages PWA sends nonce-bound requests to a separate owner-executed Apps Script backend, which derives Dustin/Shane identity from high-entropy reader codes, reads only allowlisted private Drive files, retrieves every requested ESV chapter with a server-side key, and stores append-only comment/highlight revisions in the configured Sheet. The older accessing-user Apps Script installation remains an immutable rollback.

The bridge starts on 2026-08-08 in `America/Detroit` and permits six days of lookahead so the full week can be audited immediately. Multi-chapter days remain one stable daily reading, one Scripture page, and one shared discussion. Private commentary may be prepared for a seven-reading window, with current and next prepared first. ESV is never persisted: after authorization the current and next daily responses are warmed into JavaScript memory for the home verse/open path, while other days stream on open; chapters are requested separately and combined only for display, never written to IndexedDB, Drive, Git, or a service-worker cache.

## Local development

Requirements: Node 22 or newer. The browser app has no runtime framework; the exact build dependency is installed from the lockfile.

```sh
npm ci
npm run check
npm run dev
```

Then open `http://127.0.0.1:4173/app/frontend/`. Select any date in the month, review the passage and two-reader completion card, then use the date-specific button to open an available bridge day.

If that port is occupied, use a task-specific override such as `DBR_PORT=4174 npm run dev` and open the matching URL.

When the ignored private drafts and research registry are present, append `?privateDraft=1` to preview the currently promoted bridge syntheses and explicit placeholders locally. A validated scheduler draft remains under `private-content/automation/staging/<readingId>/` until separately promoted, so local preview cannot silently expose model output. The adapter first reads the checksum-verified private current-window store and attaches a matching Henry verse shard for troubleshooting; a legacy per-reading audit remains a fallback. Those routes bind only to `127.0.0.1`, accept only `CC-Y3Q4-D054` through `CC-Y3Q4-D060`, send `no-store` headers, and are stripped from the production Apps Script bundle. Another local tool can discover the same portable store at `/__mhc/window/manifest.json` and fetch an included reading at `/__mhc/window/readings/<readingId>.json`; neither route is built or deployed.

Append `?mhcPilot=1` for the separate localhost-only Genesis book-opener/Genesis 1 calibration. It loads validated ignored runtime shards when present and otherwise uses conspicuously fabricated UI-test summaries. This does not reactivate Genesis or alter the seven-day bridge. Source acquisition, atomization, bounded Spark generation, storage boundaries, audit files, and full-corpus locks are documented in `docs/MATTHEW_HENRY_PIPELINE.md`.

To inspect or run the rolling today-plus-two-days Spark lane:

```sh
npm run mhc:window:dry-run
npm run mhc:window:spark
```

The second command may invoke the exact authenticated `gpt-5.3-codex-spark` worker. It resolves only the active Detroit schedule from today through two days ahead, processes those readings sequentially, and replaces the private store manifest only after every reading succeeds. It produces ignored, private, unreviewed artifacts and never publishes or changes the main schedule commentary. The narrower `mhc:next:*` commands remain available for a single today/tomorrow audit.

Spark is reserved for that high-volume, verse-by-verse Matthew Henry lane. The broader `$draft-daily-commentary` workflow stays in the primary Codex task: it conducts source research, weighs evidence, writes and edits the synthesis, verifies citations, validates the package, and performs any separately approved publication. The preserved D057 Spark-assisted run is a one-off calibration, not the future workflow.

The local mock is Dustin. The primary Pages PWA initially prompts for one of two high-entropy reader codes; the backend hashes it and derives the fixed display identity (`Dustin` or `Shane`) without trusting a browser-supplied name. After successful verification, the raw code remains only in IndexedDB on that device. Closing and reopening normally does not require it again. Rotating the configured hash invalidates that code, and **Forget reader code** removes the local copy. The accessing-user Apps Script rollback additionally binds its enrollment to the signed-in Google account. Generate the two codes only on a trusted local terminal:

```sh
npm run reader-codes
```

Give each person only their own code and place only its SHA-256 hash in Apps Script Properties. Do not paste the command output into chat or save it in the repository.

## Research workspace

The bridge inventory is deliberately kept in ignored `research/working/` because it can contain private research metadata. Validate it explicitly with:

```sh
npm run validate:sources -- research/working/bridge-source-registry.json
```

The bridge inventory now contains 54 records: 38 consulted and included in a synthesis, one additional historical work consulted but not used for a claim, one official schedule source consulted for placement only, 13 major works inventoried as inaccessible, and one rights-uncertain aggregation excluded. Micah 3–4 uses nine commentary/context resources, Micah 5–7 uses fourteen, 1 Peter 5 uses twelve, and staged Nahum 1 uses eleven of twelve consulted commentary resources. `research/working/BRIDGE_SOURCE_COVERAGE.md` records represented and missing categories, disagreements, inaccessible candidates, single-source claims, and rights controls. Source totals exclude mirrors, snippets, and works known only through another bibliography.

Validate the ignored drafts and build an auditable local review bundle with:

```sh
node scripts/validate-private-content.mjs --require
npm run bundle:private
```

The ignored bundle contains seven Markdown files, their metadata, the source registry, coverage report, and a hash manifest. Four files contain syntheses and three remain placeholders. Its manifest explicitly records that Scripture, credentials, and raw source text are absent. Building it does not upload or deploy anything.

## iPhone installation and updates

The phone-confirmed primary installation is the Pages PWA under `web/pwa-canary/`. The historical path remains stable so installed Home Screen links do not move. Open the published Pages site in iPhone Safari and use Share → Add to Home Screen → Open as Web App. It owns the open-Bible icon, manifest, immediate public shell, and narrowly scoped service worker; private commentary, comments, highlights, ESV, credentials, and backend responses never enter Cache Storage.

Public code is content-addressed and integrity-checked. A complete update installs before the reader offers a restart, and one prior public release remains cached for rollback. A valid reader-bound seven-day bootstrap/commentary snapshot paints the calendar before background token confirmation and Drive/Sheet synchronization; after confirmation, current and next private records are always refreshed from Drive and replace cached revisions, while their volatile ESV responses are warmed first. The cache/build details include session-only phase timings and the count of ESV readings currently in memory. Those values reset on launch and are never persisted or transmitted.

The phone-confirmed Apps Script version-23 installation remains available as rollback. Its outer HTML host cannot supply an Apple touch icon and therefore retains the tested **D** monogram, but routine Pages UI releases do not redeploy or repoint it. Deployment permissions and release gates are in `docs/GOOGLE_SETUP.md` and `docs/RELEASE_STABILITY.md`.

## Safety boundary

Git contains code, schemas, documentation, tests, and fabricated fixtures only. Real commentary drafts belong in ignored local working directories until reviewed and uploaded to private Drive. ESV passage text must never be written into this repository, including temporarily.

The tracked pre-commit hook can be enabled with:

```sh
git config core.hooksPath .githooks
```

It is enabled in the current local repository. GitHub Pages builds from `main`. `web/release.json` plus immutable releases provide the shared code, while `web/pwa-canary/` provides the installed public shell, manifest/icons, update client, and narrowly scoped service worker. These artifacts never receive private content, comments, highlights, ESV wording, credentials, Drive/Sheet/file IDs, account emails, or reader-code hashes. The repository safety scanner permits the one public backend endpoint only in the PWA's exact generated/configuration paths and rejects it everywhere else.

The PWA does not use OAuth/GIS, a Google API-executable deployment, or Cloud billing. It does not change the version-23 rollback deployment. Generate and verify both public delivery paths before a commit:

```sh
npm run build
npm run publish:pages
npm run check
```

## Project map

- `app/frontend/` — dependency-free mobile web client and local mock adapter
- `app/apps-script/` — Apps Script backend source; production bundle is generated into ignored `dist/`
- `app/pages-pwa/` — installed Pages launcher, nonce-bound token transport, and public-only service worker
- `app/apps-script-token-canary/` — owner-executed bearer-token response bridge compiled only for the separate canary deployment
- `web/` — code-only, content-addressed GitHub Pages release assets plus the isolated `pwa-canary/`
- `app/shared/` — pure server-domain logic shared with tests
- `schemas/` — versioned plan, reading, source, commentary, comment, highlight, and provider-policy schemas
- `fixtures/` — fabricated mock Scripture and non-substantive pilot placeholders
- `scripts/` — build, validation, safety, and local server tools
- `tests/` — risk-focused tests
- `docs/ARCHITECTURE.md` — hosting and data-flow decision
- `docs/ESV_INTEGRATION.md` — verified ESV terms and cache policy
- `docs/GOOGLE_SETUP.md` — approval-gated external setup instructions
- `docs/SECURITY.md` — controls and threat model
- `docs/CONTENT_AND_RIGHTS.md` — conservative source-handling rules
- `docs/COMMENTARY_WORKFLOW.md` — one-reading research and publication pipeline
- `docs/MATTHEW_HENRY_PIPELINE.md` — public-domain source atomization, bounded offline worker controller, exact-source disclosure, validation, and calibration/audit history
- `docs/CONTENT_AUTOMATION.md` — proposed scheduled drafting, deterministic readiness buffers, and the disabled-by-default one-reading worker handoff
- `docs/AUTOMATION_RUNBOOK.md` — implemented evaluator/work-order controller, `$draft-daily-commentary` skill, rollout gates, and saved scheduled-task workflow
- `docs/BACKLOG.md` — prioritized index of requested features, decisions, manual checks, and accepted behavior
- `docs/EDITORIAL_STANCE.md` — confessional premise, supernatural evidentiary weighting, fair-engagement method, and concise daily hierarchy
- `docs/CHRONOLOGY.md` — schedule model and chronology limits
- `docs/TESTING.md` — validation strategy
- `docs/RELEASE_STABILITY.md` — immutable artifact matrix, current root-cause evidence, and release gates
- `PROJECT_STATE.md` — current handoff and next action
