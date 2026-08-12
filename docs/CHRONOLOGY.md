# Schedule and chronology

## Temporary Celebration bridge

The active app schedule is a bounded rolling excerpt from Celebration Church's 92-day *Reading the Bible in 3 Years — Year 3 Quarter 4* plan. As of 2026-08-12 it is prepared through T+7:

| Bridge day | Date | Source-plan day | Reading ID | Scripture |
|---:|---|---:|---|---|
| 1 | 2026-08-08 | 54 | `CC-Y3Q4-D054` | Micah 3–4 |
| 2 | 2026-08-09 | 55 | `CC-Y3Q4-D055` | Micah 5–7 |
| 3 | 2026-08-10 | 56 | `CC-Y3Q4-D056` | 1 Peter 5 |
| 4 | 2026-08-11 | 57 | `CC-Y3Q4-D057` | Nahum 1 |
| 5 | 2026-08-12 | 58 | `CC-Y3Q4-D058` | Nahum 2 |
| 6 | 2026-08-13 | 59 | `CC-Y3Q4-D059` | Nahum 3 |
| 7 | 2026-08-14 | 60 | `CC-Y3Q4-D060` | Proverbs 31 |
| 8 | 2026-08-15 | 61 | `CC-Y3Q4-D061` | Habakkuk 1–3 |
| 9 | 2026-08-16 | 62 | `CC-Y3Q4-D062` | 2 Peter 1 |
| 10 | 2026-08-17 | 63 | `CC-Y3Q4-D063` | Zephaniah 1 |
| 11 | 2026-08-18 | 64 | `CC-Y3Q4-D064` | Zephaniah 2 |
| 12 | 2026-08-19 | 65 | `CC-Y3Q4-D065` | Zephaniah 3 |

Days with multiple chapters remain one scheduled reading, one Scripture page, and one discussion keyed to the daily reading ID. The server requests each chapter separately from ESV and combines the returned chapters only in memory for the page.

The complete 92-day sequence is stored as factual reference metadata in `config/reference-plans/celebration-y3q4.json` and a private Drive reference file. It contains passage assignments and provenance, not Celebration's devotional prose, ESV text, commentary, or 92 generated reading payloads. The active plan grows by at most one contiguous source-plan day when that reading enters T+7. No later devotional content is generated in advance.

## Shared calendar model

The bridge uses a fixed `sharedStartDate` of 2026-08-08 interpreted in `America/Detroit`. Date comparison uses civil calendar days, so 23/25-hour daylight-saving days do not shift the reading. `dayIndex` selects a stable reading; changing the start date changes dates, never reading IDs or comment associations.

The bridge permits seven days of lookahead. Past readings remain available. The internal development override is restricted to active-plan IDs and is not exposed as a reader-facing control. The home calendar starts weeks on Sunday and shows one complete month. A date click selects it and updates the passage/progress card below; opening requires the separate date-specific action. Completion is per reader and derives from an active comment, including a queued offline create; two colored dots make Dustin’s and Shane’s independent progress visible without exposing either account email.

The eight-reading local target is today plus seven future private commentary payloads and comment drafts. ESV and shared highlights are network-only; today's and tomorrow's Scripture are warmed only in volatile memory, so “offline week” does not mean persisted Scripture passages or offline highlight changes.

## Preserved Genesis calibration

The previous `intro-GEN` and `GEN-001` private drafts remain preserved in local ignored storage and Drive history/files, but they are no longer entries in the active manifest or plan. Existing comments retain their stable reading IDs and are not deleted or reassigned.

## Long-term four-stream principle

The new launch plan remains separate from this bridge and is not generated yet. Its default design has four internally ordered streams: Old Testament narrative/prophets, New Testament, Psalms, and Proverbs. The calendar still assigns exactly one reading unit per day. Interweaving changes which stream supplies that day; it never creates a four-part daily assignment.

Within the Old and New Testament streams, books retain an approximate chronological sequence and normally remain contiguous once begun. Primary placement is event chronology; where that is unclear or unsuitable, composition, traditional placement, or a pragmatic decision may be used and labeled. Psalms form their own stream so they can be paced across the complete plan; strong historical associations may inform placement, but disputed superscriptions are not converted into false certainty. Proverbs forms a fourth stream of deliberately sized verse chunks so its dense material receives the same commentary depth as a narrative chapter.

Every biblical book receives a stable `book_intro` unit. That unit occupies the normal daily slot, places the portable book overview on page 2, and reserves page 3 for the book's purpose, structure, theology, interpretive questions, and sources. The next calendar day must be that book's chapter 1 (or Proverbs' first configured chapter-1 chunk). No other stream may be inserted between the introduction and its opening text.

Each stream records its complete unit count before interleaving. The scheduler compares each stream's completed fraction with the plan's overall completed fraction and normally chooses the stream furthest behind, subject to book contiguity and the mandatory introduction–chapter-1 pair. This proportional pacing is preferable to a rigid weekly rotation because the streams have very different lengths. The target is for Old Testament, New Testament, Psalms, and Proverbs to reach their final units together or within the smallest feasible final window, while preserving one substantial reading and commentary per day.

`streamId` and `streamSequence` preserve each stream's internal order. `contextReadingIds` may identify up to five earlier readings that materially illuminate the current unit; commentary may restate and build on those links without making today's writing dependent on memory. Partial Proverbs units use `verseStart`, `verseEnd`, and an exact `verseCount`; other entries continue to request complete chapters. Each entry still records rationale, chronology basis, confidence, notes, and supporting sources. This is a transparent editorial model, not a claim that one undisputed chronology exists.

The provisional default remains a configurable 66-book Protestant canon. Canon, launch date, exact OT/NT book ordering, Psalm order, Proverbs chunk boundaries, and the final stream-balancing tolerance still require confirmation before the complete plan is generated.
