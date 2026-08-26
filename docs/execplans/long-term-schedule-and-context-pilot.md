# Long-term schedule and historical-context pilot

## Goal

Produce a complete, deterministic, review-only schedule for the confirmed long-term four-stream Bible plan, then add and privately publish a representative archaeological/historical-context section for the current and next bridge readings so Dustin can evaluate the feature before it becomes routine.

## Confirmed requirements

- The current Celebration bridge ends with `CC-Y3Q4-D092` / Malachi 4 on 2026-09-15. The candidate plan begins 2026-09-16 in `America/Detroit`.
- Use the configurable 66-book Protestant canon.
- Assign exactly one focused reading unit per civil day.
- Maintain four internally ordered streams: OT excluding Psalms/Proverbs, NT, Psalms, and Proverbs.
- Pace OT and NT proportionally so they finish together or as close together as the constraints allow. Consecutive OT days are expected; consecutive NT days should normally occur only for a mandatory book-introduction/chapter-1 pair or a demonstrable balancing need.
- Every biblical book has one `book_intro` day, immediately followed on the next calendar day by chapter 1 (or the first Proverbs range). No other stream may interrupt that pair.
- Books remain ordered within their stream and normally remain contiguous within that stream. Whole-book chronology is approximate, disputed, source-grounded, and labeled rather than presented as certain.
- Every Sunday supplies one Psalm or Proverbs content unit. Use well-supported historical Psalm placement where useful and canonical order otherwise. Proverbs uses coherent bounded ranges.
- Design the Psalms/Proverbs unit count and intro placement so Sunday pacing and the four-stream finish target work without empty calendar days. Any exceptional non-Sunday Psalm/Proverbs unit or consecutive NT day must be explicit in the review report.
- Book-introduction Page 2 is the portable overview; Page 3's main synthesis centers historical, canonical, and contextual fit. Its verse-of-the-day field uses a famous or representative verse reference from that book; ESV wording remains provider-delivered.
- The schedule is a candidate for review, not an active plan. Do not change the deployed plan, Drive manifest, app configuration, comments, or existing stable reading IDs.
- The schedule contains references and factual metadata only: no ESV wording, commentary prose, private IDs, credentials, or private content.

## Milestone 1 — deterministic review schedule

Create a checked-in candidate input/order file, deterministic generator, generated candidate schedule, and human-readable review report. Reuse the existing plan/reading schemas and chapter metrics where possible rather than creating a parallel model.

The candidate must include:

- a stable candidate `planVersion` and stable reading IDs;
- `dayIndex`, civil date, `readingId`, `kind`, `bookId`, chapter or exact verse range, stream identity/order, ordering rationale, chronology basis, confidence, notes, and supporting source IDs;
- every canonical chapter/range exactly once, plus exactly one introduction per book;
- no gaps, duplicates, overlapping Proverbs ranges, missing verses, or out-of-order stream entries;
- introduction/chapter-1 next-day adjacency;
- exact start/end dates and finish date per stream;
- cadence statistics: total days, readings per stream, Sunday allocation, maximum stream finish spread, consecutive OT/NT runs, and all exceptions;
- a content hash or equivalent immutable fingerprint over canonical schedule bytes so later approval can lock the exact reviewed schedule;
- tests that regenerate the same bytes and fail on repetition, omission, drift, invalid dates, broken adjacency, non-Sunday Psalm/Proverbs placement not disclosed by policy, or unacceptable finish spread.

The review report should be optimized for human inspection: proposed OT and NT book order with rationale/confidence, Psalm placement policy and exceptions, every Proverbs range, monthly/yearly cadence summary, and the final scheduling metrics. Do not activate the candidate.

## Milestone 2 — James 1 and Zechariah 4 context pilot

The Detroit readings are:

- 2026-08-26: `CC-Y3Q4-D072` / James 1.
- 2026-08-27: `CC-Y3Q4-D073` / Zechariah 4.

Preserve the existing orientation, executive synthesis, practical takeaway, verse-of-the-day selection, Henry layer/link, and other deep-study prose unless a factual correction is necessary. Add one scan-visible `### Archaeological and historical context` section to each existing comprehensive synthesis only if direct research finds meaningful reading-specific material.

For each section:

- consult traceable, lawful sources directly;
- use Wikipedia only for orientation/discovery, not as the preferred final basis when stronger accessible sources exist;
- distinguish what artifacts, texts, geography, chronology, or social evidence directly establish from interpretive reconstruction;
- include a dispute only when it materially helps the reader understand the passage;
- do not import methodological naturalism, skeptical authorship assumptions, or routine modern-critical objections as neutral facts;
- use original, concise prose with claim-level source IDs and update coverage/provenance honestly;
- add no ESV wording or raw copyrighted source text.

Version and hash each changed private artifact, validate locally, update existing Drive files in place content-first and manifest-last, verify exact-byte readback and unchanged sharing, and confirm the app's background version refresh will replace the retained record. No app-code deployment is expected unless actual rendering evidence shows the new heading cannot already use the existing collapsed-section UI.

## Validation

Milestone 1:

- focused schedule-generator and schema tests;
- deterministic regeneration/byte comparison;
- exact canonical coverage and duplicate/overlap audit;
- `npm run safety` and `npm run check`.

Milestone 2:

- source-registry, commentary citation, metadata/hash, and private-content validators;
- exact comparison proving protected existing fields are unchanged;
- private bundle and repository-safety checks;
- `npm run check` when tracked code/schema/docs change, otherwise the narrow private validation ladder plus still-applicable full-suite evidence;
- Drive metadata read before write, payloads first, manifest last, exact-byte readback, and permission/parent audit.

## Progress

- [x] User confirmed design constraints and requested the review schedule plus two-reading context pilot.
- [x] Confirmed the bridge ends 2026-09-15 and the new plan starts 2026-09-16.
- [x] Generate and validate the deterministic review-only schedule (`four-stream-protestant-66-candidate-2026-09-16-v1`; 1,255 units; 2026-09-16 through 2030-02-21; SHA-256 `d209d9067b677ffb161ae62c8f3d31b7c00c6d3b0772fe115eaf45abe289d057`). It starts with `intro-GEN` then Genesis 1; has 66 book introductions immediately before chapter 1; allocates OT/NT/Psalms/Proverbs as 785/287/151/32; has maximum OT/NT runs of 6/2; and permits every NT pair only as the exact introduction/chapter-1 pair. Sundays allocate 149 Psalms and 30 Proverbs, with four explicit non-Sunday minor exceptions; the maximum stream finish spread is 11 days. Psalms remain canonical rather than speculatively relocated. The candidate remains inactive pending user review; see `docs/reports/long-term-four-stream-candidate.md`.
- [x] Research, validate, and privately publish the James 1 and Zechariah 4 context pilot. D072 and D073 advanced to `draft-v2` under `commentary-workflow-v13-historical-context-pilot`; registry `celebration-bridge-2026-08-26-v15` has 180 sources. Existing devotional/Henry layers remained unchanged; direct Yale, *Encyclopaedia Iranica*, and Metropolitan Museum material was used only for bounded context.
- [x] Primary integrated check passed: repository safety inspected 254 files; content validation covered 24 schemas; private validation found 23 end-to-end studies, 26 syntheses, 180 registered sources, and no stored Scripture; all 235 tests and code-only builds/Pages verification passed.
- [x] Verified tracked schedule artifacts committed and pushed to `main`; private reading content and the private source registry remained outside Git.
- [ ] Dustin reviews the inactive candidate report and the live context sections.

## Exact next action

Dustin reviews the inactive candidate JSON/report and the live James 1 and Zechariah 4 context sections. Do not activate or lock the candidate without explicit approval.
