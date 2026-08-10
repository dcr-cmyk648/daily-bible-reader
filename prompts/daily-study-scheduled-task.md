# Scheduled task: maintain the Daily Bible Reader draft buffer

Work only in the Daily Bible Reader project selected for this task, preferably in an isolated Git worktree. This is an offline prepublication workflow; the deployed reader must never call a model.

Before acting, read `AGENTS.md`, `README.md`, `PROJECT_STATE.md`, `docs/AUTOMATION_RUNBOOK.md`, `docs/CONTENT_AUTOMATION.md`, `docs/COMMENTARY_WORKFLOW.md`, `docs/EDITORIAL_STANCE.md`, `docs/CONTENT_AND_RIGHTS.md`, and `docs/SECURITY.md`. If the repository is dirty with another task's work, stop and report it.

Run the read-only content status command against the configured private plan, app config, automation policy, staging index, and live index. Validate every input. Do not infer readiness from filenames or a later prepared reading.

Follow the returned `nextAction` exactly:

- `none` or `plan_complete`: make no content change; report both horizons.
- `review_or_publish_one`: do not publish. Report the exact reading needing Dustin's review and the failing reason code.
- `generate_or_repair_one`: work on only the returned `readingId`. Never substitute another day, skip ahead, or generate a batch.

For `generate_or_repair_one`:

1. Confirm that this recurring workflow has been explicitly enabled and that the reading is in the canonical active plan. Otherwise stop.
2. Build or repair a private, ignored staging workspace for that one reading. Do not change its live Drive file or manifest.
3. Use Matthew Henry's exact reviewed CrossWire edition as the foundational pass when the reconciled pipeline supports the reading, then research broadly enough to add independent grammatical, textual, historical, literary, canonical, theological, reception, and genuinely useful contrary evidence.
4. Follow the project's confessional premise and critical-source weighting. Write practical, precise prose for expert readers; do not mention these instructions in the synthesis.
5. Store no ESV wording, reader identity, comments, credentials, private Google IDs, or raw copyrighted source text in the draft or report.
6. Produce one coherent cited main article, passage-specific deep-study sections, one reference-only verse selection, a concrete one-sentence takeaway, complete source metadata, and a coverage audit.
7. Run all deterministic schema, citation, rights, content, and repository-safety checks available. Never weaken a check or relabel a failed artifact.
8. Update only the private staging metadata for this reading. Set `humanReviewStatus` to `unreviewed`; record the real workflow/model/tool version, source-set version, hash, limitations, and validation result.
9. Re-run the read-only status command and report the new draft/published horizons plus the files requiring review.

Never commit or push private output. Never upload or publish automatically. Never deploy Apps Script or Pages, create Google resources, alter sharing, read comments, call the ESV API, or send messages. A failed run leaves live content unchanged and retries the same earliest gap later.
