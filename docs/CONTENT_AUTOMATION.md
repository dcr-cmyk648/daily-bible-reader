# Rolling seven-day study preparation

Status: authorized for the private Celebration bridge. The live device window is the current Detroit reading plus seven future readings. On each daily run, the content workflow checks the reading exactly seven civil days ahead and prepares/publishes only that one reading if it is absent or stale. The first fill is D059–D065; subsequent runs append one reference-plan day at a time through D092. The new long-term plan remains out of scope.

This is offline prepublication automation, not runtime AI. The installed reader never calls a model. A local Codex scheduled task performs research and generation in an isolated checkout, Spark performs only the Matthew Henry verse layer, and Google Drive remains canonical for private studies. The device keeps the validated private current-plus-seven batch in IndexedDB. ESV wording remains server-fetched and session-memory-only because provider policy, not convenience, controls Scripture persistence.

## Daily invariant

At `America/Detroit` day D, exactly D+7 must be end-to-end ready:

- a stable active-plan entry and Scripture reference(s), but no stored ESV wording;
- one- or two-paragraph orientation;
- coherent expert-level main synthesis in practical prose;
- one verse-of-the-day reference and one concrete practical takeaway;
- custom, cited deep-study sections plus source registry and coverage record;
- newest hash-bound, primary-reviewed Matthew Henry verse shard for every chapter, or—only when Spark is unavailable/quota-limited—a verified link to the complete public-domain chapter commentary with no substitute AI condensation;
- commentary/v3 metadata whose hash matches the Markdown bytes;
- presence in the private Drive manifest, with exact-byte readback verified.

The deterministic `npm run study:next` command emits a `rolling-study-work-order/v1` for only that T+7 reading. It returns `none` when the local canonical copy, reviewed Henry layer or valid quota fallback, exact content hash, and manifest entry already agree. It returns `prepare_publish` when any component is absent or stale. Tomorrow's order may require appending exactly one plan entry; `npm run bridge:extend -- --source-day N` refuses gaps and anything beyond the current T+7 authorization.

## Publication boundary

The user has authorized this narrow recurring publication lane. It does not authorize bulk generation or unrelated external changes.

1. Stage ignored private files and preserve the previous version/hash.
2. Research broadly. Record a source as consulted only after accessing the work itself. Use Matthew Henry as a foundational historical/pastoral pass, then test and extend it with independent grammatical, historical, literary, canonical, theological, reception, and genuinely useful counterposition sources.
3. The primary Codex task drafts and edits the orientation, main article, takeaway, deep sections, citations, registry, and coverage. Spark may generate only the verse-by-verse Henry layer. If Spark is unavailable, the task links the complete public-domain Henry chapter and does not move that work to another model.
4. Compare every Henry condensation with every cited exact atom. `npm run mhc:review` creates and applies a hash-bound review record; altered generation bytes invalidate it.
5. Mark the study `in_review` only after direct content/source review. Machine validation alone is insufficient.
6. Run private-content validation, source validation, repository safety, tests, builds, and release checks.
7. Upload new/versioned private plan, config, registry, Markdown, and metadata first. Update the single private manifest pointer last. Verify exact bytes and sharing after write.
8. Commit and push only code, schemas, factual plan metadata, tests, and documentation. Publish the existing code-only Pages/Apps Script path only when code or plan delivery requires it.

A failed run never advances the private manifest. The next run returns the same T+7 reading. No ESV text, private commentary, source extract, reader code/hash, comment body, Google resource ID, or secret enters Git or Pages.

## Health signal and device retention

The reader asks for a batch of eight validated private records: today plus seven future readings. It writes that private commentary batch to IndexedDB under the plan/version/identity cache boundary and keeps it until age, identity, plan, or content version invalidates it. It warms today's and tomorrow's ESV responses into memory without writing them to persistent browser/service-worker storage. Other days stream Scripture when opened.

The calendar warning is computed from complete end-to-end records, not merely filenames. It shows the first consecutive gap. This is independent of the scheduled task and remains the visible alarm if the Mac was asleep, Codex was not running, research failed, Drive publication failed, or a version mismatch invalidated local content.

## Scheduling

Use the desktop Codex scheduled task daily at 3:00 a.m. Detroit time in an isolated worktree. The Mac must remain powered on and the app must be running for local-project work. The checked prompt is `prompts/daily-study-scheduled-task.md`; it deliberately re-reads repository policy, emits the exact work order, operates on at most one reading, and reports a no-op when T+7 is already complete. Scheduled-task behavior was checked against the official OpenAI documentation on 2026-08-12: <https://learn.chatgpt.com/docs/automations>.

Review the first several run reports. The scope remains one T+7 reading even after the workflow proves reliable.
