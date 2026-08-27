# Permanent study library and Psalm/Proverbs plan v2

## Goal

Record the approved long-term personal-study-library model and replace the inactive v1 schedule review candidate with an inactive v2 candidate that pairs sequential Proverbs ranges with short Psalms while keeping long Psalms alone and preserving the plan's depth-first daily cadence.

## Approved product decisions

- Google Drive becomes the canonical permanent library for every reviewed, lawfully storable study layer: orientation, book overview, executive synthesis, practical takeaway metadata, archaeological/historical preview and expanded dossier, comprehensive synthesis, source/coverage metadata, content hashes, review history, and reviewed Matthew Henry derivatives. ESV wording remains outside that library.
- A stable canonical resource identity such as `intro-GEN` or `GEN-001` is distinct from a dated plan occurrence/`readingId`. Schedule changes and future rereads must not orphan content, discussion, or verse-level history.
- Existing reading-level discussion remains attached to its dated occurrence and can be surfaced from a chapter library chronologically. Permanent chapter notes support both `private` and `shared` visibility, with an explicit user choice rather than an inferred default.
- Highlights use canonical book/chapter/verse identity plus their originating reading occurrence. They remain attributable and revision-aware across future plans.
- The Google Sheet remains canonical for append-only comment, note, and highlight events; restricted Drive exports provide backups rather than a competing live store.
- The future reader header gains accessible Book and Chapter/Overview selectors. Unprepared resources are disabled; partially prepared Proverbs chapters are selectable with explicit coverage; prepared resources open the existing reader in library mode. Library browsing alone does not mark a day complete.
- The phone automatically retains the current-through-T+7 private pack and a bounded recent-resource cache. Whole-library offline persistence is not automatic. ESV continues to obey its independent provider-policy cache.
- Combined Psalm/Proverbs days use one orientation, two clearly labeled exegetical movements within one daily article, and one takeaway. A thematic connection is stated only when the texts actually support it.

## Schedule v2 requirements

- Keep the confirmed start date `2026-09-16`, timezone `America/Detroit`, 66-book Protestant canon, approximate OT chronology, NT order, book contiguity preference, and every introduction immediately followed by chapter 1.
- Keep the candidate review-only and inactive. Do not prepare commentary, alter the bridge, or publish anything to private Drive.
- Preserve 785 OT daily slots and 287 NT daily slots.
- Keep a Psalms introduction plus Psalms 1–150 in canonical order.
- Give Proverbs its own introduction day, immediately followed by a combined Psalm/Proverbs day containing Proverbs 1's first range.
- Cover all 915 Proverbs verses exactly once, in canonical order, without crossing chapter boundaries inside a stored Proverbs passage range. Pair Proverbs only with a Psalm shorter than the ordinary load target; a Psalm at or above that target stands alone.
- Use a deterministic ordinary raw-verse target of 20. A paired range consumes at most `20 - psalmVerseCount` verses; finish the current Proverbs chapter before beginning another chapter on a later eligible Psalm day. This produces bounded, phone-readable ranges, keeps ordinary combined days at or below 20 verses, and leaves exceptional long Psalms honest rather than padding them.
- Record Proverbs' denser interpretive load and the pragmatic nature of mechanical range boundaries. The candidate remains subject to an editorial range-boundary review before activation; exact arithmetic must not be presented as a claim that every boundary is a literary pericope.
- A daily entry may advance both Psalm and Proverbs logical streams. Extend the schema/model explicitly rather than hiding the second contribution in prose or miscounting stream completion.
- The expected unique daily-slot count is 1,224: 785 OT + 287 NT + 151 Psalm units + one Proverbs introduction. Regenerate the exact end date, stream-finish metrics, schedule fingerprint, complete month-grouped review report, and all tests from the deterministic candidate.
- Prefer the 150 Psalm chapter days on Sundays, proportionally spread across the plan so all logical streams finish within the smallest feasible window. Disclose every non-Sunday wisdom exception and every Sunday used by another stream.

## Constraints and non-goals

- Do not change the installed app, frontend, Apps Script, authentication, private manifest, Drive/Sheet data, sharing, ESV adapter, service worker, or current T+7 workflow in this milestone.
- Do not create a Google folder, Sheet tab, Drive backup, content resource, or external deployment.
- Do not add ESV wording, private commentary, source extracts, reader identities/codes, private IDs, comments, highlights, or notes to Git or Pages.
- Do not activate or lock v2. The generated schedule and library contract are review artifacts only.
- Preserve v1's facts in Git history and clearly identify v2 as superseding it for review; do not imply that v1 was ever active.

## Relevant repository state

- `main` is `188fd6d` at milestone start and clean.
- The inactive v1 candidate is `four-stream-protestant-66-candidate-2026-09-16-v1`, 1,255 days through 2030-02-21, SHA-256 `d209d9067b677ffb161ae62c8f3d31b7c00c6d3b0772fe115eaf45abe289d057`.
- `scripts/lib/long-term-schedule.mjs` owns the deterministic 66-book structural metrics, candidate interleaver, validations, design report, and daily report.
- `reading.schema.json` currently exposes one primary `streamId`/`streamSequence` even though `passages` can already contain multiple books.
- Comments are occurrence-keyed; highlights already carry occurrence plus canonical verse coordinates. The permanent note/resource contracts are documented design work for a later implementation milestone.

## Milestones

1. Document the permanent library, event visibility, library-selector, caching, rights, and backup decisions in the canonical architecture/chronology/backlog/project-state documents without changing runtime behavior.
2. Extend the schedule schema and deterministic generator for explicit multi-stream contributions; generate the inactive v2 candidate and both human review reports.
3. Add focused regression tests for exact Psalm/Proverbs coverage, target load, introduction adjacency, dates, logical stream completion, no duplicate/gap, deterministic hashes/reports, and inactive status.
4. Run focused checks and `npm run check`, inspect the actual diff, publish code-only review artifacts to `main`, and verify Pages without activating the plan.

## Acceptance criteria

- The permanent library has a documented canonical-resource/reading-occurrence split, both note visibility modes, chapter-level history behavior, partial Proverbs availability, restricted backups, bounded phone caching, and ESV exclusion.
- Candidate v2 starts 2026-09-16; contains exactly 1,224 daily entries unless a validator proves a necessary, documented adjustment; and remains inactive.
- Every OT/NT/Psalm chapter and every required book introduction occurs exactly once in its intended stream.
- Proverbs introduction is immediately followed by the first Proverbs range; Proverbs 1:1 through 31:31 appear exactly once and in order.
- Every paired Psalm/Proverbs entry stays at or below 20 raw verses; every Psalm of 20 or more verses has no Proverbs; no Proverbs range crosses a chapter boundary.
- Logical Psalm and Proverbs stream contributions are machine-readable rather than inferred from labels.
- The generated report lists every day and clearly labels status, combined readings, load, and review limitations.
- Repository safety, generator check, focused tests, and the full repository check pass. Frontend/PWA bytes and all external private state remain unchanged.

## Progress

- [x] Dustin approved all recommended storage, library, note-visibility, partial-coverage, combined-commentary, and Psalm/Proverbs balancing decisions.
- [x] Current repository state and canonical architecture/schedule/security/rights documents inspected.
- [x] Implement and validate documentation plus candidate v2.
- [x] Generate v2 review candidate/reports and pass focused schedule tests, generator check, and repository safety.
- [x] Correct v2 Sunday-policy truthfulness, combined-day authoring contract, history decision, report wording, and primary/contribution validation.
- [x] Primary review, code-only review-artifact packaging, and handoff preparation for schedule review.

## Exact next action

Dustin reviews the inactive v2 daily schedule and especially its pragmatic Proverbs cut points. A later, separate implementation milestone may add the approved permanent-resource schema, Drive library, Sheet event extensions, library selectors, and bounded resource cache. Do not activate v2 or alter Drive, Sheet, private content, or runtime state without that milestone's explicit scope and release gates.
