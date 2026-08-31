# Rolling seven-day study preparation

Status: authorized for the private Celebration bridge. The live device window is the current Detroit reading plus seven future readings. On each daily run, the content workflow checks every scheduled reading in that bounded window. It prepares/publishes the earliest missing or stale reading under one work order, verifies exact Drive readback, and reevaluates until the horizon is complete. In ordinary caught-up operation this is still only the one newly entering T+7 reading. The new long-term plan remains out of scope.

This is offline prepublication automation, not runtime AI. The installed reader never calls a model. A local Codex scheduled task performs research and generation in an isolated checkout, Spark performs only the Matthew Henry verse layer, and Google Drive remains canonical for private studies. The device keeps the validated private current-plus-seven batch in IndexedDB. ESV wording remains server-fetched and may persist only in the separate bounded provider-policy store; provider limits, not convenience, determine which chapters fit.

## Daily invariant

At `America/Detroit` day D, every scheduled reading from D through D+7 must be end-to-end ready:

- a stable active-plan entry and Scripture reference(s), but no stored ESV wording;
- one- or two-paragraph orientation;
- coherent expert-level main synthesis in practical prose;
- one verse-of-the-day reference and one concrete practical takeaway;
- custom, cited deep-study sections plus source registry and coverage record;
- newest hash-bound, primary-reviewed Matthew Henry verse shard for every chapter, or—only after the narrow Spark-first/Luna-low route is unavailable—a verified link to the complete public-domain chapter commentary;
- commentary/v3 metadata whose hash matches the Markdown bytes;
- presence in the private Drive manifest, with exact-byte readback verified.

The deterministic `npm run study:next` command emits a `rolling-study-work-order/v1` for only the earliest missing or stale reading from today through T+7. It returns `none` only when every record in that horizon has a matching local copy, reviewed Henry layer or valid quota fallback, exact content hash, and manifest entry. It returns `prepare_publish` when any component is absent or stale. The factual D054–D092 schedule is already compiled into the current backend; the daily lane never invents calendar entries. For rollback compatibility, the separate private Drive prefix-plan file still grows contiguously with each newly published manifest reading, using `npm run bridge:extend -- --source-day N` immediately before manifest promotion. A missing earlier prefix entry is selected first, never skipped.

Once that primary work order is verified complete, `npm run mhc:backfill:next` may emit one lower-priority `mhc-backfill-work-order/v1`. It selects the earliest live chapter still using the full-commentary fallback and either requests a Spark-first/Luna-low artifact, routes an existing artifact through primary review, or attaches an already approved artifact. Sol, Terra, and every other model remain forbidden; this queue never rewrites the multi-source study or blocks the next day's preparation. A failed narrow route leaves the fallback and manifest unchanged for another daily attempt.

## Publication boundary

The user has authorized this narrow recurring publication lane. It does not authorize bulk generation or unrelated external changes.

1. Stage ignored private files and preserve the previous version/hash.
2. Research broadly. Record a source as consulted only after accessing the work itself. Use Matthew Henry as a foundational historical/pastoral pass, then test and extend it with independent grammatical, historical, literary, canonical, theological, reception, and genuinely useful counterposition sources.
3. The primary Codex task drafts and edits the orientation, main article, takeaway, deep sections, citations, registry, and coverage. Spark may generate only the verse-by-verse Henry layer. If Spark is unavailable, the task links the complete public-domain Henry chapter and does not move that work to another model.
4. Compare every Henry condensation with every cited exact atom. `npm run mhc:review` creates and applies a hash-bound review record; altered generation bytes invalidate it.
5. Mark the study `in_review` only after direct content/source review. Machine validation alone is insufficient.
6. Run private-content validation, source validation, repository safety, tests, builds, and release checks.
7. Upload new/versioned private plan, config, registry, Markdown, and metadata first. Read back the rolling plan and verify it is the exact contiguous prefix represented by the staged manifest; only then update the single private manifest pointer last. Verify exact bytes and sharing after write, then require an authenticated `getBootstrapData` health check before recording publication success.
8. Commit and push only code, schemas, factual plan metadata, tests, and documentation. Publish the existing code-only Pages/Apps Script path only when code or plan delivery requires it.

A failed reading never advances the private manifest. The same gap is returned on the next evaluation. A successful recovery reevaluates only after exact readback and stops when the bounded horizon is complete. No ESV text, private commentary, source extract, reader code/hash, comment body, Google resource ID, or secret enters Git or Pages.

## Health signal and device retention

The reader asks for a batch of eight validated private records: today plus seven future readings. It writes that private commentary batch to IndexedDB under the plan/version/identity cache boundary and keeps it until age, identity, plan, or content version invalidates it. Cached records paint immediately, but successful authorization revalidates the complete eight-record batch so a new review or Henry revision cannot remain hidden behind the retention window. It separately attempts ESV passage retention for the same horizon under total/per-book/age eviction, warms today's and tomorrow's verse path first, and streams any missing or ineligible chapter when opened.

The calendar warning is computed from complete end-to-end records, not merely filenames. It shows the first consecutive gap. This is independent of the scheduled task and remains the visible alarm if the Mac was asleep, Codex was not running, research failed, Drive publication failed, or a version mismatch invalidated local content.

## Scheduling

The desktop Codex task **Prepare Daily Bible Reader T+7** is documented to run daily at 3:00 a.m. Detroit time as a new chat bound to the BibleApp project. The current desktop build could not bind a new task to an app-managed worktree or starting branch, so isolation is enforced by the checked prompt itself: each run leaves the shared checkout untouched, fetches `origin/main`, and creates and verifies a temporary worktree from that ref before editing. The Mac must remain powered on and the app must be running for local-project work. The canonical prompt is `prompts/daily-study-scheduled-task.md`; it deliberately re-reads repository policy and the repo-local drafting skill, drains the bounded current-through-T+7 gap queue one atomic reading at a time, then may process at most one separate Henry-only fallback backfill. The repository prompt and skill were updated on 2026-08-26 with the paired historical-context contract. The saved task UI still needs synchronization from a signed-in Scheduled interface, but its existing repository-first prompt will read those updated files after fetching `origin/main`. Scheduled-task behavior was rechecked against the official OpenAI documentation on 2026-08-26: <https://learn.chatgpt.com/docs/automations>.

Review recovery reports carefully. Each work order remains one reading; the run-level recovery loop is capped by the current-plus-seven horizon and cannot authorize later content.
