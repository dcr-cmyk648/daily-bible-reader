# Daily Bible Reader

A private, mobile-first daily Bible reader for two people. The active pre-launch bridge contains exactly seven stable daily readings from Celebration Church's *Reading the Bible in 3 Years — Year 3 Quarter 4*:

1. `CC-Y3Q4-D054` — Micah 3–4
2. `CC-Y3Q4-D055` — Micah 5–7
3. `CC-Y3Q4-D056` — 1 Peter 5
4. `CC-Y3Q4-D057` — Nahum 1
5. `CC-Y3Q4-D058` — Nahum 2
6. `CC-Y3Q4-D059` — Nahum 3
7. `CC-Y3Q4-D060` — Proverbs 31

The deployed reader opens to an always-dark, compact full-month calendar. Selecting a date shows that day’s passage, the bridge position, and separate Dustin/Shane completion states below the month; a date-specific button then opens the reading. Each calendar cell has two color-coded completion dots. An available day opens as three pages—a brief orientation, Scripture or book overview, then one source-grounded commentary article with a representative verse and concrete daily takeaway—with the same reading-level comment form beneath each page. The verse is stored only as a validated reference; its exact ESV wording is isolated from the already-loaded live Scripture response and is never added to commentary metadata. Main claims use numerical citations at the exact point they are supported, resolving to one numbered source list. Passage-specific deep-study headings appear below the discussion and **Finished** controls; each section and the research audit is independently collapsed so optional depth never blocks the comment box. The writing assumes experienced readers but uses plain, practical prose; every displayed unit must make sense on its own within that day’s reading. Each reader's active comment marks that reader’s day complete; both readers’ body-free progress is synchronized in one batch before offline preparation and whenever the calendar opens or the installed app resumes, then retained locally for offline use.

The tracked local app uses fabricated mock Scripture and a non-substantive commentary fixture. Private Drive contains source-grounded draft syntheses only for the first three bridge days; the last four days are conspicuous preparation placeholders, so their live ESV readings and comments work without pretending commentary exists. A separate factual reference file records all 92 source-plan assignments without devotional prose or generated study content. The prior Genesis calibration drafts remain preserved but are no longer active. In production, an Apps Script web app runs as the accessing Google user, retrieves private commentary from allowlisted Drive files, retrieves every requested ESV chapter through the official API with a server-side key, and stores append-only comment events in a separately shared Google Sheet.

The bridge starts on 2026-08-08 in `America/Detroit` and permits six days of lookahead so the full week can be audited immediately. Multi-chapter days remain one stable daily reading, one Scripture page, and one shared discussion. Private commentary may be prepared for a seven-reading window. ESV is deliberately network-only: chapters are requested separately and combined only for display, never persisted in IndexedDB, Drive, Git, or a service-worker cache.

## Local development

Requirements: Node 22 or newer. There are no runtime or test dependencies to install.

```sh
npm run check
npm run dev
```

Then open `http://127.0.0.1:4173/app/frontend/`. Select any date in the month, review the passage and two-reader completion card, then use the date-specific button to open an available bridge day.

If that port is occupied, use a task-specific override such as `DBR_PORT=4174 npm run dev` and open the matching URL.

When the ignored private drafts and research registry are present, append `?privateDraft=1` to preview the three syntheses and four explicit placeholders locally. Those routes bind only to `127.0.0.1`, accept only `CC-Y3Q4-D054` through `CC-Y3Q4-D060`, send `no-store` headers, and are stripped from the production Apps Script bundle.

The local mock is Dustin. Production initially prompts for a per-reader code that is cryptographically bound on the server to the signed-in Google account and configured display name (`Dustin` or `Shane`). After a successful check, the raw code remains only in IndexedDB as a device fallback and Apps Script remembers only its verified hash in that Google user's private User Properties. Closing the iPhone web app or losing its browser storage should therefore not require the code again. Rotation of the configured hash invalidates the enrollment, and **Forget reader code** removes both the account enrollment and local fallback. Generate the two codes only on a trusted local terminal:

```sh
npm run reader-codes
```

Give each person only their own code and place only its SHA-256 hash in Apps Script Properties. Do not paste the command output into chat or save it in the repository.

## Research workspace

The bridge inventory is deliberately kept in ignored `research/working/` because it can contain private research metadata. Validate it explicitly with:

```sh
npm run validate:sources -- research/working/bridge-source-registry.json
```

The bridge inventory contains 36 records: 27 actually consulted and included, one official schedule source consulted for placement only, and eight major copyrighted works inventoried as inaccessible. Micah 3–4 uses nine commentary/context resources, Micah 5–7 uses fourteen, and 1 Peter 5 uses twelve. `research/working/BRIDGE_SOURCE_COVERAGE.md` records represented and missing categories, disagreements, inaccessible candidates, single-source claims, and rights controls. Source totals exclude mirrors, snippets, and works known only through another bibliography.

Validate the ignored drafts and build an auditable local review bundle with:

```sh
node scripts/validate-private-content.mjs --require
npm run bundle:private
```

The ignored bundle contains seven Markdown files, their metadata, the source registry, coverage report, and a hash manifest. Only three files contain syntheses. Its manifest explicitly records that Scripture, credentials, and raw source text are absent. Building it does not upload or deploy anything.

## iPhone installation and updates

The intended audit deployment is the authenticated Apps Script `/exec` URL opened in iPhone Safari and added with Share → Add to Home Screen → Open as Web App. Conventional/local hosting declares Apple touch and manifest icons. Apps Script ignores favicon link tags written directly in an HTML file, so the production `HtmlOutput` applies the embedded PNG through `setFaviconUrl`; an icon failure is isolated so it can never prevent the reader from opening. The app does not use a service worker under Apps Script hosting. Every build receives a deterministic content hash; an old installed client compares its hash with the server and offers a user-initiated, versioned **Load latest version** navigation. Production CSS/JavaScript is minified for Safari 15. The August startup incident ultimately reproduced in a 98 KB minified shell at the first authenticated server call, so bundle size is recorded for diagnosis but is not treated as an undocumented platform limit. Deployment permissions and the exact acceptance test are in `docs/GOOGLE_SETUP.md`.

## Safety boundary

Git contains code, schemas, documentation, tests, and fabricated fixtures only. Real commentary drafts belong in ignored local working directories until reviewed and uploaded to private Drive. ESV passage text must never be written into this repository, including temporarily.

The tracked pre-commit hook can be enabled with:

```sh
git config core.hooksPath .githooks
```

It is enabled in the current local repository. The private GitHub repository is source and release history only; GitHub Pages is deliberately disabled, and the phone never retrieves private data or executable code from GitHub.

## Project map

- `app/frontend/` — dependency-free mobile web client and local mock adapter
- `app/apps-script/` — Apps Script backend source; production bundle is generated into ignored `dist/`
- `app/shared/` — pure server-domain logic shared with tests
- `schemas/` — versioned plan, reading, source, commentary, comment, and provider-policy schemas
- `fixtures/` — fabricated mock Scripture and non-substantive pilot placeholders
- `scripts/` — build, validation, safety, and local server tools
- `tests/` — risk-focused tests
- `docs/ARCHITECTURE.md` — hosting and data-flow decision
- `docs/ESV_INTEGRATION.md` — verified ESV terms and cache policy
- `docs/GOOGLE_SETUP.md` — approval-gated external setup instructions
- `docs/SECURITY.md` — controls and threat model
- `docs/CONTENT_AND_RIGHTS.md` — conservative source-handling rules
- `docs/COMMENTARY_WORKFLOW.md` — one-reading research and publication pipeline
- `docs/CONTENT_AUTOMATION.md` — proposed scheduled drafting and deterministic readiness-buffer workflow
- `docs/EDITORIAL_STANCE.md` — confessional premise, supernatural evidentiary weighting, fair-engagement method, and concise daily hierarchy
- `docs/CHRONOLOGY.md` — schedule model and chronology limits
- `docs/TESTING.md` — validation strategy
- `PROJECT_STATE.md` — current handoff and next action
