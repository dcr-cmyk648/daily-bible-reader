# Service recovery and architecture work orders — October 10, 2026

## Findings (verified October 10)

Authenticated `service:live-health` on October 10: 3 of 8 devotionals prepared
(October 10–12), 0 of 8 complete Henry verse layers, 2 devotional future days,
0 complete future days. October 13–17 (Genesis 16, Matthew 6, Genesis 17–19) are
missing entirely. Genesis 14, Psalm 3/Proverbs and Genesis 15 are fallback-link only.

1. **Every Codex automation was paused at 17:41 Eastern on October 5.** A DCC-project
   Codex thread carried out a "pause all timed tasks" request and paused all
   automations on the machine, including the four BibleApp lanes. Nothing has run
   since. October 5 15:00 was the last daily run, and it prepared through October 12.
   With no runs, the buffer drained by one day per day. Nothing in the system checks
   whether the automations are actually running.
2. **The Henry author models were unavailable from October 3.** Stderr for every
   Genesis 14 attempt shows provider HTTP 400 errors. `gpt-5.3-codex-spark` returns
   "not supported when using Codex with a ChatGPT account". `gpt-5.6-luna` returns
   "requires a newer version of Codex", because the installed CLI is 0.141.0 and
   0.154.0 is current.
3. **The controller misclassified that as a transient transport failure and livelocked.**
   In `scripts/lib/mhc-v2-author-session.mjs`, `checkpointTransport` returns the job to
   `queued`. It consumes no budget and keeps Luna as lane owner. Spark then gets
   `V2_OTHER_MODEL_OWNS_CHAPTER` from `mhc-v2-service.mjs:179/181` and stops. The
   October 3–5 receipts call this a "normal completed coordinator outcome" six times.
   There is no retry ceiling, no lease expiry and no escalation to a visible blocker.
4. **The in-app warning cannot show this kind of failure.** `publicationReadiness` and
   `evaluateContentReadiness` in `app/frontend/app.js` count only devotional-prefix
   membership. A Henry fallback link counts as prepared, and nothing measures
   staleness. The amber copy ("a later reading is still being prepared") reads the
   same as the routine overnight gap that appears before each 03:00 run. Red appears
   only when fewer than 2 days remain. The `approval_required`/`blocked` override
   depends on an LLM run publishing a status, and the paused lanes could not.
5. **The Henry runtime pin is missing the status helper.** The Henry lanes run
   `3a438e5`, which predates `scripts/prepare-service-status.mjs`. The Luna lane
   recorded "helper absent, no in-app notice" on October 3–5. The daily lanes pin
   `63283db`. The canonical checkout sits at `c960e12`, about 130 files behind
   `origin/main`, with uncommitted edits.
6. **Structural cause: the orchestration is written in LLM prompts, not code.** Each
   lane is a 12–17 KB natural-language prompt. An agent runs npm commands one by one,
   reads the output, uploads through the Drive connector and writes memory notes.
   Every command goes through automatic approval review and can be denied (one was on
   October 5). Throughput is about one reading per lane per run, with no margin, so
   any stall drains the buffer.

## Target architecture

- **Deterministic supervisor, LLMs only for authoring; Codex owns the schedule.** The
  user wants maximum automation, owned by Codex. Codex automations stay the scheduler
  and owner, but each automation prompt shrinks to a short contract: run the
  supervisor, perform the authoring/review steps it hands back, publish through the
  existing Drive connector, report. Keeping publication inside a Codex automation
  means no new credential or access path. One Node supervisor, invoked by those
  automations, owns: the
  deadline-ordered work list (daily and Henry together, earliest date first),
  dispatch, retry/lease policy, validation, bundling, publication, readback, health
  and heartbeat. LLM calls become bounded `codex exec` subprocesses with schema-typed
  output: research and synthesis, Henry condensation, review. Gates stay in code.
- **Fail fast and visibly on deterministic errors.** Provider 4xx, an unsupported
  model, an outdated CLI, or a missing helper or executable each become a
  `blocked`/`approval_required` status the first time they happen. They are not
  retried and not reported as normal.
- **Liveness and heartbeat.** Every supervisor run writes `lastRunAt`,
  `lastSuccessAt`, per-lane `lastAttemptAt`/`lastError` and buffer counts into the
  manifest `preparationStatus`. A clean no-op run writes them too.
- **Warnings that see the real buffer.** The app measures complete future days,
  meaning devotional plus Henry verse layer, and the heartbeat age.
  Green: ≥5 complete future days and heartbeat <30 h. Amber: 3–4 complete future
  days, or any Henry fallback in the window. Red: ≤2 complete future days, or a
  heartbeat older than 30 h ("Preparation has not run since …").
- **No out-of-band alert (user decision, October 10).** The in-app warning is the
  only alert channel. The heartbeat staleness check is therefore mandatory, because
  it is the only signal when the PC or the Codex automations stop. Do not add
  email, MailApp scopes or backend triggers.
- **Slack in throughput.** When behind, a run drains up to N readings within budget.
  It no longer handles one per wake.

## Work orders

Every thread must first read `AGENTS.md`, `docs/SERVICE_AUTHORITY.md`, the latest
`PROJECT_STATE.md` checkpoint and this file. Work in an isolated worktree from
`origin/main`, not the dirty canonical checkout. Keep every privacy, source-review,
release and rollback gate. Run `npm run check` before committing.

### WO-1: Henry model availability and livelock repair (Sol 6.1, high)

Scope: `scripts/lib/mhc-v2-author-session.mjs`, `scripts/lib/mhc-v2-service.mjs`,
the author launcher/preflight and tests.

1. Add an author preflight. Before claiming a reading, run one trivial `codex exec`
   probe per configured author model with the configured executable. Parse stderr
   for provider 4xx and `requires a newer version` / `not supported`. On failure
   return `V2_AUTHOR_MODEL_UNAVAILABLE`, a deterministic configuration failure. Claim
   nothing and stage a `blocked` service status naming the model and the reason.
2. Classify the same signatures inside `checkpointTransport` callers as
   `V2_AUTHOR_MODEL_UNAVAILABLE`, not `V2_TRANSPORT_FAILED`.
3. Bound transport retries. After 2 consecutive transport checkpoints on one lease,
   release lane ownership. The other lane may take it, or the reading moves to
   fallback-retained debt and the next reading is selected. Add lease expiry, at most
   24 h. `V2_OTHER_MODEL_OWNS_CHAPTER` must never repeat across more than 2 wakes
   without escalating.
4. Make the author model configurable from one config value instead of hardcoded
   `MODELS[lane]`. Per the user's October 10 decision, the primary Henry author is
   now `gpt-6-luna`, replacing `gpt-5.3-codex-spark`. Update the AGENTS.md Spark
   reservation sentence and `docs/MATTHEW_HENRY_PIPELINE.md` to match. Update the
   Codex CLI the author launcher uses (0.141.0 is installed; 0.154.0+ is current),
   and prove `gpt-6-luna` runs through the new preflight before any real dispatch.
   Changing the author model, or adding a second fallback model, still needs the
   user's approval.
5. Catch-up throughput: when the forward window has Henry debt, one author run may
   take further readings, earliest date first, within the existing per-reading
   budgets and a per-run cap (default 3). Independent review stays mandatory for
   each reading.
6. Tests with fabricated stderr fixtures: Spark ChatGPT-account 400, Luna
   newer-version 400, transport timeout ×3, and lease expiry.

Acceptance: the October 3–5 Genesis 14 sequence replayed as a fixture ends in a
visible `blocked` status within one wake, not a queued livelock.

### WO-2: Buffer-aware warning and heartbeat (Sol 6.1, high)

Scope: `app/frontend/app.js` readiness functions, the bootstrap
`preparationStatus` contract, `scripts/prepare-service-status.mjs` and tests.

1. Extend `preparationStatus` with a heartbeat: `lastRunAt`, `lastSuccessAt`,
   per-lane `{lastAttemptAt, lastOutcome, lastErrorCode}` and buffer counts. Every
   daily run writes it, including no-op runs.
2. Replace the publication-only and payload-batch readiness renders with one
   evaluator that counts complete future days, Henry verse layer included, plus
   heartbeat age, using the thresholds in Target architecture. Render one decision,
   so a later render cannot hide an earlier warning.
3. Copy: name the actual condition, such as "Preparation hasn't run since Oct 5" or
   "Verse-by-verse commentary missing for 3 of the next 8 days". Shane sees the
   short version and Dustin sees the operational details.
4. Follow `docs/RELEASE_STABILITY.md`. This is a shell-visible change, so the
   immutable canary/rollback discipline and the installed-iPhone check apply.

Acceptance: fixture-driven tests for the October 6, 8 and 10 states (fabricated
IDs) render amber, red and red with the staleness copy.

### WO-3: Deterministic supervisor ExecPlan (Sol 6.1, high — design first)

Write `docs/execplans/deterministic-service-supervisor.md`. Do not implement in this
work order. It must cover:

- the supervisor state machine and EDF work list;
- the `codex exec` contracts for each authoring step;
- the gates kept in code;
- consolidating the four Codex automations into two Codex-owned automations with
  thin prompts. (a) Preparation: a supervisor tick, then daily and Henry authoring
  in earliest-date order, drained up to a per-run budget while behind, then
  publication. (b) Review/audit: independent review, publication, and the heartbeat
  and buffer report;
- publication stays in Codex through the existing Drive connector, so no new
  credential is needed;
- what the supervisor does when an automation finds another BibleApp automation
  unexpectedly paused (report it in `preparationStatus` as red);
- a rollback path back to the current four automations.

Size it for staged delivery, with each stage releasable on its own.

### WO-4: Runtime and documentation hygiene (Luna 6, low)

1. Repin the Henry lanes to the same accepted revision as the daily lanes, at least
   `63283db` or newer, so `prepare-service-status.mjs` resolves. Verify through the
   existing bootstrap.
2. Report the canonical checkout's uncommitted diff (AGENTS.md, PROJECT_STATE.md,
   CORTAN docs, test edits) to the manager. Do not discard or commit it unreviewed.
3. Move PROJECT_STATE incident narrative from before October 1 into
   `docs/reports/state-archive-2026-09.md`. Leave a current-state header of at most
   60 lines. Remove resolved historical blocks from the automation prompt headers.
4. Propose (do not apply) a global Codex instruction: "Never pause, resume or edit
   automations that belong to another project unless the user names them."

## User decisions — October 10, 2026

- **Resume:** daily preparation and the review/audit lane only. The Spark and Luna
  Henry author lanes stay paused until WO-1 is released and the preflight passes.
  Leave every non-BibleApp automation exactly as the user left it.
- **Henry author model:** `gpt-6-luna` replaces `gpt-5.3-codex-spark` (see WO-1).
- **Alerting:** in-app warning only. No email, MailApp scope or backend trigger.

## Handoff to BibleApp Manager (Codex)

Paste this into the BibleApp Manager thread in Codex:

> Read `C:\Users\rowla\Projects\BibleApp\docs\execplans\service-recovery-2026-10-10.md`
> and execute it as manager under standing authority. As of October 10 the daily
> preparation and review automations are resumed. Leave the two Henry author lanes
> and all non-BibleApp automations paused. Spawn worker threads now: WO-1, WO-2 and
> WO-3 on Sol 6.1 (high), WO-4 on Luna 6 (low). Each works in its own worktree from
> `origin/main`, rebases before a fast-forward-only push, and reruns `npm run check`.
> WO-1 owns the Henry runtime repin. When WO-1 is released and its preflight proves
> `gpt-6-luna` runs, switch the two Henry author automations to the new
> configuration and resume them yourself. Stop WO-2 before production promotion
> and ask me for the installed-iPhone check. After WO-3's plan is accepted, deliver
> its stages and consolidate the automations it specifies. Run `service:live-health`
> after each release and after the next scheduled daily run, then report the
> buffer to me.
