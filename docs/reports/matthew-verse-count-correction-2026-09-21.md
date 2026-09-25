# Matthew chapter metrics correction

Status: prepared for separate code-release approval on September 21, 2026. Not deployed; the daily service remains pinned to its previously accepted revision.

The September 21 daily evaluator correctly selected Matthew 2 for September 28, but its complete-chapter assignment contained 22 verses. Authenticated live bootstrap independently confirmed the same numeric value. A fabricated provider response for the complete 23-verse range reproduces `ESV_RANGE_MISMATCH`; verse 23 also falls outside `passageContainsVerse`. No ESV request or Scripture storage was used in diagnosis.

The imported KJV JSON array lengths are not a trustworthy chapter-boundary authority. Their original numeric lengths match this repository's table, but the upstream project reports a missing Matthew 2 verse and merged-verse defects: [issue 21](https://github.com/thiagobodruk/bible/issues/21), [issue 29](https://github.com/thiagobodruk/bible/issues/29). This is a source-data problem, not a new transport failure. Deterministic generation tests had only established agreement with the same bad input.

Independent numbered WEB responses, consulted September 21, establish the following complete ranges. Only verse numbers/counts were retained; no source passage was stored or printed.

| Chapter | Previous count | Correct count | Verification |
| --- | ---: | ---: | --- |
| Matthew 2 | 22 | 23 | [Numbered chapter](https://bible-api.com/data/web/MAT/2); [CCEL chapter](https://www.ccel.org/study/Matt_2) |
| Matthew 22 | 45 | 46 | [Numbered chapter](https://bible-api.com/data/web/MAT/22) |
| Matthew 26 | 74 | 75 | [Numbered chapter](https://bible-api.com/data/web/MAT/26) |

The proposed patch changes these three numeric source values, regenerates the existing factual candidate/active calendar and reports, and replaces the exact accepted-candidate hash with the newly generated exact hash. Matthew's summed metric becomes 1,071. Reading IDs, dates, order, chapter assignments, pairing boundaries and all other chapter metrics remain unchanged. The strict candidate lock and provider-range checks remain intact. Regressions accept each complete fabricated provider range, reject a shortened range, and verify final-verse selection. This is not a claim that every other chapter has been independently audited against the ESV provider.

## Delivery requirements

Apply this narrowly selected patch onto the latest accepted reader source, preserving the September 20 commentary-refresh release. Do not deploy the older frontend from the daily runtime's checkout. Run the full checks, perform the ordinary immutable token-backend release/readback/rollback procedure, and install the accepted numeric correction in both preparation and Henry publication runtimes before resuming Matthew 2. Preserve the production version-23 rollback and existing identity/access. The recurring daily assignment does not authorize this code commit, push or deployment.

After installation, obtain a fresh schema-valid work order and prepare/review/publish Matthew 2 normally; do not claim the September 28 study is ready from this correction alone. Refresh the factual private plan's Matthew book metric to the accepted active metric during its authorized publication, preserving all prior entries and versions. Keep the seven-day horizon non-green until the exact reading and full live-horizon gates pass. Today and tomorrow were verified ready; the previous private manifest remains unchanged.

## Completed local validation

All 449 tests passed, together with source/private/schema/repository safety, complete builds and exact existing Pages verification. Three new range regressions cover the confirmed Matthew counts. A separate comparison proves all 1,263 reading IDs, dates, order and assignments unchanged; only the three confirmed chapter counts, their duplicated factual contributions, derived Matthew total and generated hashes differ. No commit, push, deployment, runtime repinning or private publication occurred. The September 20 frontend remains live.
