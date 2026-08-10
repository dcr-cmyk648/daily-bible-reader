# Schedule and chronology

## Temporary Celebration bridge

The active app schedule is a seven-day excerpt from Celebration Church's 92-day *Reading the Bible in 3 Years — Year 3 Quarter 4* plan:

| Bridge day | Date | Source-plan day | Reading ID | Scripture |
|---:|---|---:|---|---|
| 1 | 2026-08-08 | 54 | `CC-Y3Q4-D054` | Micah 3–4 |
| 2 | 2026-08-09 | 55 | `CC-Y3Q4-D055` | Micah 5–7 |
| 3 | 2026-08-10 | 56 | `CC-Y3Q4-D056` | 1 Peter 5 |
| 4 | 2026-08-11 | 57 | `CC-Y3Q4-D057` | Nahum 1 |
| 5 | 2026-08-12 | 58 | `CC-Y3Q4-D058` | Nahum 2 |
| 6 | 2026-08-13 | 59 | `CC-Y3Q4-D059` | Nahum 3 |
| 7 | 2026-08-14 | 60 | `CC-Y3Q4-D060` | Proverbs 31 |

Days with multiple chapters remain one scheduled reading, one Scripture page, and one discussion keyed to the daily reading ID. The server requests each chapter separately from ESV and combines the returned chapters only in memory for the page.

The complete 92-day sequence is stored as factual reference metadata in `config/reference-plans/celebration-y3q4.json` and a private Drive reference file. It contains passage assignments and provenance, not Celebration's devotional prose, ESV text, commentary, or 92 generated reading payloads. Only days 54–60 are active. Only days 54–56 have substantive synthesis; days 57–60 are explicit preparation placeholders.

## Shared calendar model

The bridge uses a fixed `sharedStartDate` of 2026-08-08 interpreted in `America/Detroit`. Date comparison uses civil calendar days, so 23/25-hour daylight-saving days do not shift the reading. `dayIndex` selects a stable reading; changing the start date changes dates, never reading IDs or comment associations.

The bridge permits six days of lookahead so all seven entries can be tested immediately. Past readings remain available. The internal development override is restricted to the same seven IDs but is not exposed as a reader-facing control. The home calendar starts weeks on Sunday and shows one complete month. A date click selects it and updates the passage/progress card below; opening requires the separate date-specific action. Completion is per reader and derives from an active comment, including a queued offline create; two colored dots make Dustin’s and Shane’s independent progress visible without exposing either account email.

The seven-reading offline target applies to private commentary payloads and comment drafts. ESV is network-only under the current provider policy, so “offline week” does not mean seven persisted Scripture passages.

## Preserved Genesis calibration

The previous `intro-GEN` and `GEN-001` private drafts remain preserved in local ignored storage and Drive history/files, but they are no longer entries in the active manifest or plan. Existing comments retain their stable reading IDs and are not deleted or reassigned.

## Long-term principle

The new launch plan remains separate from this bridge. Its intended model is one book-introduction day before each biblical book, then contiguous chapters. Primary placement is approximate event chronology; where that is unclear or unsuitable, composition, traditional placement, or a pragmatic decision may be used and labeled. Each entry records rationale, basis, confidence, notes, and sources. This is a transparent editorial model, not a claim that one undisputed chronology exists.

The provisional default is a configurable 66-book Protestant canon. Canon, start date, full ordering, disputed placements, and introduction days still require confirmation before the complete new plan is generated.
