# Repair native Luna direct candidate generation

## Goal

Make the scheduled Luna fallback complete its one bounded Matthew Henry work item directly, without launching a nested Codex process or substituting another model. Preserve the durable Spark/Luna pair, all fail-closed review/publication boundaries, and the prior live manifest on every failure.

## Requirements

- The scheduled root may delegate the bounded work once to exact `gpt-5.6-luna` at low reasoning, as required by repository orchestration.
- The assigned Luna worker is itself the generation model. It must read only the prepared work-item inputs and write `candidate.json` directly with its normal file-editing capability.
- Never call `codex exec`, spawn another child, or substitute Terra, Sol, or another model from inside the assigned Luna worker.
- Preserve at most three submit attempts against the same work-item lease, followed by the existing typed terminal failure and cooldown record when unresolved.
- Generation still cannot review, attach, publish, deploy, push, or change the private manifest.
- Diagnostics remain limited to safe reading/date, lane, stage/code, and prior-manifest state.

## Evidence

- The 11:15 Spark run selected D086 and reached `terminal_model_failure / NATIVE_CANDIDATE_UNRESOLVED`; the prior manifest stayed live.
- The paired 11:25 Luna controller consumed the same selected reading and leased one bounded chunk, confirming the durable pair repair works.
- The assigned Luna child then invoked nested `codex exec`; that process failed before candidate generation because its local Codex state database was read-only. The run ended `generation / WORKER_UNAVAILABLE` with no candidate and no publication.
- The 11:45 reviewer correctly returned `no_review_handoffs` and made no change.

## Milestones

1. Harden the tracked Luna scheduled and worker prompts so the assigned Luna agent generates `candidate.json` directly and cannot nest or substitute a model.
2. Add deterministic regression coverage that rejects nested Codex invocation guidance and verifies the direct-worker contract remains bound to one prepared work item.
3. Run focused tests, full `npm run check`, repository safety, build/Pages publication verification, primary diff review, and release to `main`.
4. Confirm the next paired run either creates a valid same-reading candidate/handoff or reports a genuine model-output validation failure; it must not report nested-worker unavailability.

## Acceptance criteria

- No tracked native Luna prompt instructs or permits nested `codex exec`, child delegation, or a fallback model.
- The Luna lane still consumes only the durable Spark pair and does not independently select a reading.
- A generated candidate is written directly before submit and never contains private content in logs or Git.
- The prior fallback and manifest remain live unless the separate reviewer later approves and publishes a completed handoff.

## Progress

- [x] Diagnosed the 11:25 failure from the automation record and isolated it from model capacity, pair selection, review, and publication.
- [x] Implemented and validated the direct-generation contract: the assigned exact Luna-low worker writes one candidate directly with its existing file-editing capability, may not launch nested Codex/model work or delegate further, and may not substitute Terra, Sol, Spark, or another model.
- [x] Primary review accepted the prompt/test diff. Aggregate validation passed repository safety, every schema/content/source check, 323/323 tests, all builds, exact Pages verification, `npm run publish:pages`, and `git diff --check`.
- [ ] Release and observe the next paired run.

Milestones 1–2 changed only the tracked Luna scheduled/worker prompts and their narrow automation-contract regression. Same-pair selection, one prepared work item, the same lease, at most two repairs/three submits, terminal typed failure plus cooldown, and all no-review/no-publication boundaries remain explicit. The regression removes the one permitted prohibition sentence and then rejects any remaining `codex exec` or nested-model guidance, so an affirmative nested-worker instruction cannot coexist unnoticed. Focused native-worker tests passed 35/35; no live model, ignored private artifact, review, publication, deployment, or external resource was touched.

## Exact next action

Release the reviewed tracked contract to `main`, confirm GitHub checks, and observe the next Spark/Luna pair. Success means the paired Luna worker either submits a valid candidate for the same reading or reports a genuine candidate-validation failure; nested-process `WORKER_UNAVAILABLE` is no longer acceptable.
