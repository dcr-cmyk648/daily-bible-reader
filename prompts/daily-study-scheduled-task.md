# Scheduled task: maintain the Daily Bible Reader draft buffer

Work only in the Daily Bible Reader project selected for this task, preferably in an isolated Git worktree. This is an offline prepublication workflow; the deployed reader must never call a model.

Before acting, read `AGENTS.md`, `README.md`, `PROJECT_STATE.md`, `docs/AUTOMATION_RUNBOOK.md`, `docs/CONTENT_AUTOMATION.md`, `docs/COMMENTARY_WORKFLOW.md`, `docs/EDITORIAL_STANCE.md`, `docs/CONTENT_AND_RIGHTS.md`, and `docs/SECURITY.md`. If the repository is dirty with another task's work, stop and report it.

Run the read-only content status command against the configured private plan, app config, automation policy, staging index, and live index. Validate every input. Do not infer readiness from filenames or a later prepared reading.

Follow the returned `nextAction` exactly:

- `none` or `plan_complete`: make no content change; report both horizons.
- `review_or_publish_one`: do not publish. Report the exact reading needing Dustin's review and the failing reason code.
- `generate_or_repair_one`: work on only the returned `readingId`. Never substitute another day, skip ahead, or generate a batch.

For `generate_or_repair_one`:

1. Run the same command as `work-order`. This must fail when the private policy has not explicitly set `generationEnabled: true`.
2. Validate the returned `commentary-work-order/v1` packet and verify that it names the same one reading as the readiness action.
3. Explicitly invoke `$draft-daily-commentary` with that exact packet. Do not paraphrase it into a broader request or add another reading.
4. Let the skill build or repair only the ignored private staging workspace and return its source, validation, limitation, and review report.
   The main article must be an executive synthesis with one governing through-line and connected paragraphs; move secondary questions into custom deep-study sections instead of compressing source coverage into the daily path.
5. Re-run the read-only status command and report the new draft/published horizons plus the exact files requiring review.

Never commit or push private output. Never upload or publish automatically. Never deploy Apps Script or Pages, create Google resources, alter sharing, read comments, call the ESV API, or send messages. A failed run leaves live content unchanged and retries the same earliest gap later.
