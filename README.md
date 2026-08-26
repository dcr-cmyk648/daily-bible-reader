# Daily Bible Reader

A private, mobile-first daily Bible reader for two people. The active pre-launch bridge uses Celebration Church's *Reading the Bible in 3 Years — Year 3 Quarter 4*. The current backend compiles the complete factual remaining schedule, `CC-Y3Q4-D054` through `CC-Y3Q4-D092` (August 8–September 15, 2026), for calendar display. Private Drive content remains a separate contiguous prepared prefix, maintained only through the current Detroit day plus seven days so unprepared future studies never open as complete.

The complete source-day mapping is generated from the reviewed reference plan and factual chapter metrics; it includes the grouped multi-chapter days while storing neither ESV wording nor devotional content.

The deployed reader opens with the selected day’s date, passage, bridge position, separate Dustin/Shane completion states, verse of the day, and date-specific open button. The always-dark full-month calendar follows immediately below for changing dates and reviewing progress; each cell has two color-coded completion dots. For today and tomorrow, the exact ESV verse wording appears as soon as the priority window is warm. An available day opens as three pages—a brief orientation, Scripture or book overview, then one source-grounded commentary article with a representative verse and concrete daily takeaway—with the same reading-level comment form beneath each page. When a prepared comprehensive synthesis contains a meaningful **Archaeological and historical context** H3 section, Page 1 shows it twice by design: a compact closed preview immediately below orientation sources with direct links, and a Page 1-only optional-depth panel after the shared Discussion and navigation with numbered citations and an auditable bibliography. Both surfaces draw from the same extracted context and remain omitted from Page 3. Successful ESV retrieval goes directly from the Scripture heading to the reading text; loading and failure notices remain visible, and required ESV attribution remains below the passage. A daily assignment that crosses the half-book display limit remains one reading and discussion but exposes chapter or verse-range tabs, fetching and displaying only one compliant option at a time. On the Scripture page, tapping a verse opens one verse-details sheet: optional precomputed Matthew Henry commentary is looked up from the already-loaded private payload, while Dustin and Shane retain independent highlight colors and may both mark the same verse. A reviewed Henry record can expose the exact cited public-domain commentary atoms under **Read Henry**; if Spark is quota-limited, the reading may instead expose an honestly labeled verified link to the complete public-domain chapter commentary, never a substitute-model condensation. Embedded source-module Scripture transcription is omitted. No click invokes AI or fetches a generated commentary record. The verse of the day is stored only as a validated reference in commentary; its exact ESV wording comes from a policy-bounded provider response and is never added to commentary metadata. The short daily commentary is an uninterrupted executive synthesis with one governing through-line and a collapsed source bibliography; the optional detailed synthesis retains claim-level numbered citations and its own nearby source list. Passage-specific deep-study headings appear below the discussion and **Finished** controls; each section and the research audit is independently collapsed so optional depth never blocks the comment box. The writing assumes experienced readers but uses plain, practical prose; every displayed unit must make sense on its own within that day’s reading. Each reader's active comment marks that reader’s day complete. A valid eight-reading, reader-bound local snapshot (today through seven days ahead) paints the selected day, calendar, and cached private study material immediately; the stored reader code is reconfirmed in the background. Once authorization succeeds, today and tomorrow refresh first, then the complete current-through-T+7 private pack is revalidated from Drive in the background so a newly reviewed study or Henry layer replaces a retained placeholder without waiting for cache expiry. The calendar warns when the full seven-day-ahead preparation buffer has a gap, with exact preparation details only for Dustin. Comment drafts retain an authorization-gated offline outbox. Highlights synchronize only while online and remain isolated from the core startup path.

The tracked local app uses fabricated mock Scripture and a non-substantive commentary fixture. Private Drive is the canonical home for the source-grounded studies; Git contains neither those studies nor ESV text. Every private publication bundle follows the Henry library's checksum-bound current pointer, so a newer reviewed background artifact replaces a stale attachment before validation; a corrupt or unreviewed newest artifact fails closed. The ignored Spark workspace remains a private review aid rather than public app content. A separate factual reference file records all 92 source-plan assignments without devotional prose or generated study content. The prior Genesis calibration drafts remain preserved but inactive. The primary Pages PWA sends nonce-bound requests to a separate owner-executed Apps Script backend, which derives Dustin/Shane identity from high-entropy reader codes, reads only allowlisted private Drive files, retrieves every requested ESV chapter with a server-side key, and stores append-only comment/highlight revisions in the configured Sheet. The older accessing-user Apps Script installation remains an immutable rollback.

The bridge starts on 2026-08-08 in `America/Detroit` and permits seven days of lookahead. Multi-chapter days remain one stable daily reading, one Scripture page, and one shared discussion. The calendar shows all scheduled dates, while only an unlocked, manifest-backed prepared prefix can be opened. The device prepares the current private study plus seven days ahead in IndexedDB; records have a fourteen-day fallback lifetime so the T+7 copy cannot expire just as it becomes today's offline reading, while plan identity and content revisions remain authoritative. Eligible ESV chapters may remain in IndexedDB for eight days under automatic 500-total-verse, half-book, age, and policy-version enforcement. A whole-short-book assignment such as Habakkuk 1–3 cannot be retained or displayed as one payload: its first chapter is the retained fast-open target, later chapter tabs stream on demand, and the policy engine replaces the retained chapter when necessary. A transient first request is retried once automatically before the reader asks for manual action. ESV never enters Drive, Git, builds, exports, logs, or the service-worker cache.

## Local development

Requirements: Node 22 or newer. The browser app has no runtime framework; the exact build dependency is installed from the lockfile.

```sh
npm ci
npm run check
npm run dev
```

Then open `http://127.0.0.1:4173/app/frontend/`. Select any date in the month, review the passage and two-reader completion card, then use the date-specific button to open an available bridge day.

If that port is occupied, use a task-specific override such as `DBR_PORT=4174 npm run dev` and open the matching URL.

When the ignored private drafts and research registry are present, append `?privateDraft=1` to preview the currently promoted bridge syntheses and explicit placeholders locally. A validated scheduler draft remains under `private-content/automation/staging/<readingId>/` until separately promoted, so local preview cannot silently expose model output. The adapter first reads the checksum-verified private current-window store and attaches a matching Henry verse shard for troubleshooting; a legacy per-reading audit remains a fallback. Those routes bind only to `127.0.0.1`, accept only reading IDs in the validated active plan, send `no-store` headers, and are stripped from the production Apps Script bundle. Another local tool can discover the same portable store at `/__mhc/window/manifest.json` and fetch an included reading at `/__mhc/window/readings/<readingId>.json`; neither route is built or deployed.

Append `?mhcPilot=1` for the separate localhost-only Genesis book-opener/Genesis 1 calibration. It loads validated ignored runtime shards when present and otherwise uses conspicuously fabricated UI-test summaries. This does not reactivate Genesis or alter the seven-day bridge. Source acquisition, atomization, bounded Spark generation, storage boundaries, audit files, and full-corpus locks are documented in `docs/MATTHEW_HENRY_PIPELINE.md`.

To inspect or run the narrower current-plus-two-days Spark troubleshooting lane:

```sh
npm run mhc:window:dry-run
npm run mhc:window:spark
```

The second command may invoke the exact authenticated `gpt-5.3-codex-spark` worker. It resolves only the active Detroit schedule from today through two days ahead, processes those readings sequentially, and replaces the private store manifest only after every reading succeeds. It produces ignored, private, unreviewed artifacts and never publishes or changes the main schedule commentary. The narrower `mhc:next:*` commands remain available for a single today/tomorrow audit. The daily end-to-end T+7 lane begins with `npm run study:next`; Spark is only one bounded source-specific component of that larger workflow.

Spark is reserved for that high-volume, verse-by-verse Matthew Henry lane. The broader `$draft-daily-commentary` workflow stays in the primary Codex task: it conducts source research, weighs evidence, writes and edits the synthesis, verifies citations, validates the package, and performs any separately approved publication. The preserved D057 Spark-assisted run is a one-off calibration, not the future workflow.

After the daily T+7 study is verified ready, `npm run mhc:backfill:next` may select one earlier published reading that used the full-Henry link during a Spark quota outage. The active scheduled task tries one exact Spark conversion, retains the link unchanged if capacity is still unavailable, and replaces it only after complete source-atom review, validation, and atomic private republication. This backfill never calls AI from the reader and never rewrites the broader daily synthesis.

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

The bridge inventory now contains 92 records: 76 consulted and included in at least one synthesis, two consulted for schedule/background purposes without supporting a synthesis claim, 13 major works inventoried as inaccessible, and one rights-uncertain aggregation excluded. `research/working/BRIDGE_SOURCE_COVERAGE.md` records represented and missing categories, disagreements, inaccessible candidates, single-source claims, and rights controls. Source totals exclude mirrors, snippets, and works known only through another bibliography.

Validate the ignored drafts and build an auditable local review bundle with:

```sh
node scripts/validate-private-content.mjs --require
npm run bundle:private
```

The ignored bundle contains one Markdown/metadata pair for every entry in the validated private rolling-prefix plan, plus the source registry, coverage report, and a hash manifest. Its manifest explicitly records that Scripture, credentials, and raw source text are absent. Building it does not upload or deploy anything.

## iPhone installation and updates

The phone-confirmed primary installation is the Pages PWA under `web/pwa-canary/`. The historical path remains stable so installed Home Screen links do not move. Open the published Pages site in iPhone Safari and use Share → Add to Home Screen → Open as Web App. It owns the open-Bible icon, manifest, immediate public shell, and narrowly scoped service worker; private commentary, comments, highlights, ESV, credentials, and backend responses never enter Cache Storage.

Public code is content-addressed and integrity-checked. A complete update installs before the reader offers a restart, and one prior public release remains cached for rollback. A valid reader-bound eight-reading bootstrap/commentary snapshot paints the calendar before background token confirmation and Drive/Sheet synchronization; after confirmation, the current-through-T+7 private records are refreshed from Drive and replace cached revisions, while the first displayable ESV chapter for current/tomorrow warms first. If a selected verse lies in another short-book chapter, only that extracted verse remains in volatile memory; the full second chapter is not retained until its tab is opened. The cache/build details include session-only phase timings plus bounded ESV memory/persistence counts; the timings reset on launch and are never persisted or transmitted.

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
