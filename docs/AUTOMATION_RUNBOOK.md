# Content automation runbook

Status: deterministic local foundation implemented; no recurring task, private Drive staging area, generation run, or publication automation has been enabled.

The first automation layer is deliberately read-only. It inspects versioned metadata, measures consecutive draft and published buffers, and selects at most one earliest next action. It never opens commentary bodies, invokes a model, writes Drive, changes the live manifest, or deploys the reader.

## Why use a Codex scheduled task

This workflow does not need an OpenAI API key or an AI backend inside the reader. Official OpenAI documentation says desktop scheduled tasks can work with local projects, either in the project directory or an isolated worktree; the computer must remain on and the app must be running when local files are required. Web-scheduled tasks can use connected tools but cannot directly work in a local folder. OpenAI also recommends testing the prompt normally and manually reviewing the first runs. Checked 2026-08-10: <https://learn.chatgpt.com/docs/automations>.

Use an isolated worktree for the eventual scheduled task. The active repository frequently contains private ignored research and unfinished human review, so an unattended task must not share a mutable source worktree with an interactive task.

## Versioned metadata

- `content-automation-policy/v1` sets the Detroit timezone, seven-day draft target, five-day approved-live target, earliest-gap strategy, one-reading ceiling, validation/hash requirements, and permanent initial `autoPublish: false` gate.
- `content-staging-index/v1` records only staging metadata: reading/day identity, state, private artifact reference, workflow/model/source-set versions, review state, hashes, validation result codes, prior hashes, and limitations.
- `content-live-index/v1` records only the metadata needed to prove a reading is live: reading/day identity, publication and review status, live/manifest hashes, manifest presence, and validation state.
- `content-readiness-report/v1` is the output. It contains consecutive horizons and one action; it contains no commentary, ESV wording, source extracts, credentials, identities, comments, or Google resource IDs.

Private working copies belong under ignored `private-content/automation/`. A future Drive staging index may use the same schemas, but creating the folder/files in Drive is a separate external action.

## Read-only status command

The tracked fabricated fixtures exercise the command without private data:

```sh
node scripts/content-automation.mjs status \
  --plan fixtures/automation/plan.json \
  --app-config fixtures/automation/app-config.json \
  --policy config/content-automation.example.json \
  --staging-index fixtures/automation/staging-index.json \
  --live-index fixtures/automation/live-index.json \
  --today 2026-08-10
```

For a real local run, substitute the canonical active plan plus ignored policy/staging/live metadata paths. Never point the command at a public build directory. The command validates all three inputs, fails closed on duplicate/mismatched plan identities, and validates its report before printing it.

## Decision rules

1. Count only consecutive readings from the current shared Detroit plan day. Later work never hides an earlier gap.
2. A live, manifest-bound, hash-matching, validated reading may satisfy the draft buffer without a duplicate staging record.
3. An unreviewed or in-review staging artifact may satisfy only the draft buffer after validation. `changes_requested`, failed validation, missing hashes, and research-only states do not count.
4. Published readiness is strict: the live index must be present, validated, hash-matching, `reviewed` or `published`, and explicitly `approved`.
5. Book introductions count as one reading exactly like chapters.
6. If the draft target is short, select only its earliest missing/invalid reading as `generate_or_repair_one`.
7. If the draft target is satisfied but the published target is short, select only the earliest live gap as `review_or_publish_one`.
8. Nothing auto-publishes. Approval and publication remain separate human-initiated steps.

The active bridge's legacy accepted studies still use `in_review` metadata in Drive. The installed reader has an explicit temporary compatibility rule for those three known readings. This automation contract intentionally does not inherit that exception: new work is not published-ready until its metadata says `approved`.

## Scheduled-task rollout

When Dustin explicitly enables the recurring task:

1. Reconcile and commit the separate Matthew Henry pipeline first.
2. Create ignored real policy, staging-index, and live-index files; validate them without generating content.
3. Test `prompts/daily-study-scheduled-task.md` manually against an already completed reading in dry-run mode.
4. Create a desktop scheduled task in an isolated worktree, provisionally daily at 5:00 a.m. `America/Detroit`.
5. Give it repository and web-research access only. Do not give deployment, Apps Script, Sheet, comment, ESV-key, or live-manifest write authority.
6. Review the first five run reports manually. A run may prepare one ignored draft; it may not publish it.
7. Create a separate phone-initiated approval/publication workflow only after the draft lane has been reliable.

If the Mac may be asleep, the task can miss its scheduled time. The in-reader readiness warning remains the independent signal that the content buffer needs attention; a scheduled task is operational convenience, not a runtime dependency.

## Failure and recovery

- Invalid or inaccessible metadata: fail without choosing a reading.
- Earliest draft fails research/validation: retain an audit, leave it non-ready, and retry the same stable reading ID next run.
- Published buffer is low: report the exact owner-only gap; do not promote a draft.
- Current commentary is missing: Scripture and comments continue independently; the app labels commentary unavailable.
- Dirty/shared worktree: stop. Do not merge, reset, discard, publish, or overwrite another task's work.
- Any suspected secret, ESV wording, private commentary, or source extract in a tracked/public path: stop and run repository safety before doing anything else.
