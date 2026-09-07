# Separate Matthew Henry backfill automation

## Goal

Make Matthew Henry debt an independently scheduled, durable lane so daily-study publication failures cannot suppress it, and make every scheduled failure visible in the supervisory Codex thread instead of relying on the user to notice missing material.

## Requirements

- Keep the existing daily T+7 study task responsible for end-to-end daily studies and the Henry layer/fallback for each newly prepared study.
- Remove historical Henry debt processing from that daily task.
- Add a separate saved automation for historical Henry backfill.
- The Henry lane tries exact Spark once, then exact Luna at low reasoning once after an eligible Spark model-execution failure. Sol, Terra, and other models must never generate the Henry prose.
- Process at most one reading per run and never let a repeatedly failing early reading permanently block later debt.
- Preserve every existing verified public-domain link fallback until a reviewed verse layer is successfully published.
- Report safe, actionable failures to this supervisory thread: lane, reading ID/date when known, failed stage/code, whether the prior manifest remains live, and the exact retry/diagnostic action. Never include private prose, source atoms, credentials, URLs containing secrets, reader identities, or Google resource IDs.
- Keep private content and artifacts outside Git.

## Constraints and non-goals

- Do not change runtime AI policy, app authentication, Google sharing, ESV storage, or deployment identity.
- Do not create Google resources or publish private content merely to test the scheduler.
- The canonical checkout is dirty; implementation must stay in this isolated worktree based on `origin/main`.
- Automation definitions have their own saved prompts. Updating a prompt file in Git is not sufficient; the live automation records must be updated after the tracked implementation is accepted.

## Relevant repository state

- `origin/main` is `364d2e1` and already separates app-visible Henry readiness from study readiness.
- `prompts/daily-study-scheduled-task.md` currently runs one historical Henry attempt only after the whole T+7 lane, so an earlier daily-study failure suppresses that attempt.
- The live `prepare-daily-bible-reader-t-7` automation still has an older saved prompt that runs protocol refresh before Henry backfill.
- `selectMhcBackfillCandidate` currently always chooses the first eligible fallback in plan order; a persistent failure can starve all later readings.
- The 2026-09-07 daily run stopped on D090 publication health before either historical backfill lane.

## Decisions

- Use two independent project cron tasks: the existing daily-study task and a new Henry-backfill task.
- Use a short live automation bootstrap that fetches `origin/main`, opens an isolated worktree, and then follows the versioned tracked prompt. This makes Git the durable workflow definition while the automation record remains the scheduler entry point.
- Add a separate supervisory heartbeat attached to the current Codex thread. It inspects the two task run records and live readiness state, reports new failures here, and remains silent when healthy.
- Rotate Henry candidates by oldest/least-recent eligible attempt with a cooldown, rather than retrying the same plan-first failure forever. Store attempt state only in ignored private storage.
- Keep one reading per Henry run. A failed model attempt records the failure, retains the fallback, and permits a later run to select another eligible debt item.

## Milestones

1. Implement the tracked Henry task prompt, queue fairness/cooldown state, schemas/tests as needed, and remove historical Henry debt from the daily prompt.
2. Run focused tests, repository safety, build, and `npm run check`; review the complete diff.
3. Commit/push the safe tracked revision and publish code-only artifacts only if the implementation changes them.
4. Update the existing daily automation's saved prompt, create the independent Henry automation, and create the supervisory heartbeat.
5. Verify all automation records and record IDs/schedules without exposing secrets.

## Acceptance criteria

- A failed daily study cannot prevent the Henry task from running.
- A failed D079 Henry attempt cannot cause D080+ to starve indefinitely.
- The controller remains Spark-once then Luna-low-once and rejects Sol/Terra generation.
- The task retains verified link fallback and prior manifest on failure.
- A new automation-level or content-pipeline failure produces a concise diagnostic turn in this supervisory thread.
- Healthy runs do not create noisy supervisory messages.
- All tracked tests and safety checks pass.

## Validation

- Focused work-order and scheduled-prompt tests.
- Failure/cooldown/rotation tests across at least three readings.
- Schema validation for emitted work orders and private attempt state.
- `npm run safety`
- `npm run build`
- `npm run check`

## Progress

- [x] Identified saved-prompt drift and daily-lane coupling.
- [x] Confirmed the current plan-order selector can head-of-line block the backlog.
- [x] Tracked implementation and focused tests: independent Henry prompt, ignored schema-validated attempt state, 24-hour cooldown/least-recent rotation, and safe work-order diagnostics.
- [x] Primary review, 273-test suite, repository safety, tracked commit `6d8c2cb`, and push to `main`.
- [x] Saved daily automation updated; independent Henry automation and supervisory-thread heartbeat created and their on-disk records verified.
- [x] First scheduled Henry run and supervisory heartbeat reported the normalized shared state-runtime failure without changing fallback or manifest.
- [x] Primary review and release of the SQLite-home controller repair in commit `780363f` on `main`; 274 tests, safety, build, and diff checks passed.
- [ ] Observe the next scheduled Henry run and subsequent heartbeat after the accepted release.

## Exact next action

Complete primary review and release of the SQLite-home controller repair, then observe the next scheduled Henry run and following supervisory heartbeat for end-to-end delivery.

## Discoveries

- The existing `mhc:backfill:next` command already validated the private Henry catalog and produced a one-reading order, but its plan-order selector would retry the same first fallback forever.
- The new private attempt state is ignored at `private-content/automation/mhc-backfill-attempt-state.json`; it contains only reading IDs, timestamps, normalized outcome/stage/code, and the invariant that the prior manifest remains live.
- The daily T+7 prompt no longer inspects historical Henry debt. Its own failure report and the independent Henry prompt's failure report use safe lane, reading/date, normalized stage/code, manifest, and retry fields for later supervision.
- The first live independent run selected D079 and correctly preserved its fallback/manifest and rotated the queue, but both permitted child invocations failed for the same host reason: the scheduled task's workspace-write sandbox could not initialize Codex's SQLite state under the read-only user Codex directory. This was misreported as a model-generation failure rather than a worker-runtime/bootstrap failure.
- `codex exec --ephemeral` still initializes SQLite. A safe local probe with the documented/configured `sqlite_home` override created the state databases under an explicit writable temporary directory and passed initialization, so the controller should supply a unique per-run writable SQLite home without changing `HOME` or `CODEX_HOME`.

## Live failure repair milestone

- Give every child `codex exec` invocation a unique, controller-created writable temporary `sqlite_home`, remove only that exact temporary directory after completion, and keep authentication/config reads in the normal Codex home.
- Add a regression that reproduces the scheduled-task permission boundary and proves the worker arguments never target the user Codex directory.
- Normalize SQLite/state-runtime initialization failures as controller/runtime failures. They must not masquerade as Spark quota/model failures or waste the Luna retry when the shared execution environment is unusable.
- Re-run the smallest real isolated worker probe plus focused/full tests, safety, build, and diff checks before publication.

### Progress

- [x] Controller repair: every `codex exec` child receives a unique controller-created SQLite home under the system temporary directory through `-c sqlite_home=…`; cleanup is limited to that exact directory after child collection completes.
- [x] SQLite/state-runtime initialization errors normalize to `CODEX_STATE_RUNTIME_UNAVAILABLE` with controller/runtime classification and stop routing before a Luna retry.
- [x] Focused regression coverage verifies temporary-home arguments, no HOME/CODEX_HOME override, cleanup, timeout-close ordering, and no Luna retry for state-runtime failures.
- [ ] A primary-authorized isolated fabricated Luna probe remains optional acceptance evidence. It was not run in this implementation milestone because it is an external authenticated model invocation; the supplied successful local probe and deterministic controller regressions cover the non-private SQLite-home boundary.

### Discoveries

- `--ephemeral` does not avoid the Codex state database. The supported `sqlite_home` config isolates only that writable state while preserving normal authentication/config reads from the existing Codex home.
- A state-runtime failure is environmental rather than a model execution or quota signal, so treating it as a model failure would incorrectly consume the only Luna retry.
