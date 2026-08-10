# Advance-content automation proposal

Status: proposed, not enabled. Checked against the official OpenAI scheduled-tasks documentation on 2026-08-09: <https://learn.chatgpt.com/docs/automations?surface=app>.

## Recommendation

Use a two-layer buffer system. A scheduled Codex/ChatGPT task prepares private commentary drafts outside the reader, while the existing Apps Script backend performs a deterministic readiness check. This keeps runtime AI out of the deployed app and requires no OpenAI API key, model endpoint, paid application backend, or AI credentials in Apps Script.

For the phone-first workflow, the preferred generator is a recurring scheduled task in a dedicated project chat with the Google Drive connector, web research, and a purpose-built content skill. Official documentation says web scheduled tasks can use connected tools, skills, and plugins, but cannot work directly in a folder on the computer. A local-project scheduled task is the stronger validation option when the Mac can remain powered on with the ChatGPT desktop app running; it can work in this repository and run the real validators. The cloud/Drive task is therefore the continuity path, and the local task is an optional stricter second pass.

Scheduled-task availability and run limits depend on the ChatGPT account/workspace and must be confirmed in the **Scheduled** interface before relying on the workflow. The first several runs should be reviewed manually, as OpenAI's documentation recommends.

## Buffer contract

Use two independent horizons rather than treating an unreviewed model draft as ready to read:

| Measure | Target | Warning | Critical | Meaning |
|---|---:|---:|---:|---|
| Draft buffer | 7 consecutive days | fewer than 5 | fewer than 3 | A source-grounded draft exists in private staging and passes structural checks. |
| Published buffer | 5 consecutive days | fewer than 3 | today or tomorrow missing | Human-reviewed content is in the live manifest and passes runtime validation. |

The count is consecutive from the current shared-plan date in `America/Detroit`; a later prepared day cannot hide a gap tomorrow. Book-introduction days count exactly like chapter days. A placeholder, an inaccessible file, a hash mismatch, a missing source ID, or `humanReviewStatus` other than an approved value does not count as published-ready.

The values should become private configuration rather than hard-coded policy:

```json
{
  "draftTargetDays": 7,
  "draftWarningBelowDays": 5,
  "publishedTargetDays": 5,
  "publishedWarningBelowDays": 3,
  "maxReadingsGeneratedPerRun": 1,
  "generationTimezone": "America/Detroit"
}
```

## Scheduled generation run

Run once each morning, provisionally at 5:00 a.m. Detroit time. Each run should:

1. Read the canonical active plan, live manifest, source registry, and staging index from the private Drive folder.
2. Calculate both buffer horizons and identify the earliest missing or invalid reading.
3. Stop without generating if the seven-day draft target is already met.
4. Research and draft **exactly one** earliest missing reading. Do not skip ahead, bulk-generate, or alter any other reading.
5. Follow `COMMENTARY_WORKFLOW.md` and `EDITORIAL_STANCE.md`: broad independent source inventory, honest access status, confessional evidentiary weighting, a concise continuous main article, custom deep-study sections, one reference-only verse selection, and no ESV wording.
6. Write only to a private staging area. Record workflow/model/tool version, generation time, source-set version, limitations, content hash, and `humanReviewStatus: unreviewed`.
7. Run every deterministic check available in that environment. Never weaken a failed check or mark a file reviewed to make the buffer look healthy.
8. Report what changed, which sources were consulted/inaccessible, the resulting draft and published horizons, and anything that needs Dustin's judgment.

The scheduled task must never change the live manifest, deploy Apps Script, expose private content, or publish an unreviewed draft. Its permissions should be limited to the private content/staging files and research it actually needs. The prompt should explicitly invoke the future project content skill so tool choice and editorial policy do not depend on conversational memory.

## Phone review and publication

Each successful run appears in **Scheduled**, whose unread state provides the first operational signal. The run should link to the private draft and present a short review checklist suitable for the phone:

- Is the main article accurate, practical, coherent, and appropriately concise?
- Are major claims traceable to sources actually consulted?
- Are substantial alternative readings represented fairly without treating anti-supernatural assumptions as neutral evidence?
- Is the selected verse genuinely representative of the day's reading?
- Does the practical takeaway name a concrete action or diagnostic for today?

Approval should be a separate, explicit action. A one-off Codex run can then re-read the exact staged bytes, validate them, publish only that reading to the existing Drive files/manifest, verify exact-byte readback and sharing, and leave Apps Script code untouched unless the schema changed. This supports review and publication entirely from the phone without putting an AI model in the reader.

After several weeks of clean runs, auto-publication could be reconsidered, but it should not be the initial design. Generating ahead is low-risk and reversible; presenting an unreviewed synthesis as today's study material is not.

## Deterministic health signal in the reader

Apps Script should compute content readiness during authenticated bootstrap from the active plan, allowlisted manifest, and metadata it already reads. No AI call or scheduled trigger is needed for this check. Return only:

- `publishedReadyDays`
- `publishedReadyThrough`
- `draftReadyDays` for Dustin only, if staging is intentionally exposed to the owner check
- `nextGapReadingId` for Dustin only
- a `green`, `warning`, or `critical` state

The calendar should show a compact, non-dismissable warning when the published buffer falls below three days. Dustin may see the exact gap and a link to the review workflow; Shane should see only that upcoming study notes are delayed, without internal file or generation details. If today's commentary is missing, the reading must still show its ESV Scripture and comments while labeling commentary unavailable; it must not substitute generated text at runtime.

The same pure readiness function should have tests for missing manifest entries, placeholders, unreviewed drafts, invalid source IDs, hash mismatches, nonconsecutive prepared dates, book-introduction days, timezone boundaries, and a plan start-date change. A later optional Apps Script time trigger could send a proactive owner alert, but the in-app calculation plus the scheduled task's unread result is enough for the first implementation and adds no new OAuth scope.

## Failure behavior

- A failed scheduled run leaves the last reviewed live content unchanged.
- A research or validation failure creates an audit record, not a partial live reading.
- The next run retries the same earliest gap with the same stable `readingId`.
- If the published buffer is below three days, generation continues one reading per run but the task reports a warning prominently.
- If today is missing, the reader fails only the commentary portion; ESV and comments remain independently available.
- No generated draft, source extract, ESV text, credential, reader identity, or comment body enters Git or a public artifact.

## Setup sequence requiring approval

1. Add a versioned private staging index and readiness schema plus deterministic tests.
2. Add the authenticated Apps Script readiness calculation and calendar warning.
3. Create and test a dedicated content-generation skill and prompt against one already-completed reading without publishing it.
4. Create a daily scheduled task from ChatGPT/Codex **Scheduled**, with Google Drive and web research access but no deployment authority.
5. Review the first five runs manually before deciding whether the cadence or buffer thresholds should change.

Creating the scheduled task, a new Drive staging area, or an Apps Script trigger remains an external action and requires Dustin's approval at implementation time.
