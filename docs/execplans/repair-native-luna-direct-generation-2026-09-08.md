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
- The 17:25 recovery run no longer launched nested Codex and stayed on the paired reading, but it wrote a structurally shaped candidate with zero fact briefs and zero verse drafts. Submit rejected it with two minimum-item schema errors. The lane then skipped both permitted repairs and marked the work item terminal after one submit.

## Milestones

1. Harden the tracked Luna scheduled and worker prompts so the assigned Luna agent generates `candidate.json` directly and cannot nest or substitute a model.
2. Add deterministic regression coverage that rejects nested Codex invocation guidance and verifies the direct-worker contract remains bound to one prepared work item.
3. Run focused tests, full `npm run check`, repository safety, build/Pages publication verification, primary diff review, and release to `main`.
4. Confirm the next paired run either creates a valid same-reading candidate/handoff or reports a genuine model-output validation failure; it must not report nested-worker unavailability.
5. Make the retry budget enforceable rather than advisory: persist content-free validation-attempt metadata for the exact lease/candidate digest, reject an unchanged retry, and refuse `NATIVE_CANDIDATE_UNRESOLVED` until three distinct failed submit attempts have occurred. Update the Luna contract so an empty or incomplete candidate is never described as generated and every available repair is mandatory before terminal failure.

## Acceptance criteria

- No tracked native Luna prompt instructs or permits nested `codex exec`, child delegation, or a fallback model.
- The Luna lane still consumes only the durable Spark pair and does not independently select a reading.
- A generated candidate is written directly before submit and never contains private content in logs or Git.
- The prior fallback and manifest remain live unless the separate reviewer later approves and publishes a completed handoff.
- A Luna worker cannot terminally close a lease after one invalid or empty candidate, and cannot spend retries by resubmitting identical bytes.

## Progress

- [x] Diagnosed the 11:25 failure from the automation record and isolated it from model capacity, pair selection, review, and publication.
- [x] Implemented and validated the direct-generation contract: the assigned exact Luna-low worker writes one candidate directly with its existing file-editing capability, may not launch nested Codex/model work or delegate further, and may not substitute Terra, Sol, Spark, or another model.
- [x] Primary review accepted the prompt/test diff. Aggregate validation passed repository safety, every schema/content/source check, 323/323 tests, all builds, exact Pages verification, `npm run publish:pages`, and `git diff --check`.
- [x] Released commit `2a0a757` to `main`; GitHub repository safety/test run `34250985497` and Pages deployment `34250984078` passed.
- [x] Observed the next paired run: direct Luna execution recovered, but the candidate was empty and the lane incorrectly skipped its two repair attempts.
- [x] Implemented deterministic submit-attempt accounting and terminal-failure admission with exact work-item, deterministic lease, and current ledger-lease bindings; content-free candidate/diagnostics fingerprints; distinct-byte enforcement; a hard three-failure terminal gate; later-cycle reset only after an authenticated prior terminal; and cross-slot resumption of an interrupted active lease before any new selection or lease.
- [x] Primary review accepted the retry/resumption diff. Aggregate validation passed repository safety, all 38 schemas and private/source/content validators, 328/328 tests, every build, exact Pages verification, Pages publication preparation, post-publication safety, and `git diff --check`.
- [x] Released commit `7a0db26` to `main`; GitHub repository safety/test run `34287979753` and Pages deployment `34287978883` passed.
- [ ] Observe a later paired run.

Milestones 1–2 changed only the tracked Luna scheduled/worker prompts and their narrow automation-contract regression. Same-pair selection, one prepared work item, the same lease, at most two repairs/three submits, terminal typed failure plus cooldown, and all no-review/no-publication boundaries remain explicit. The regression removes the one permitted prohibition sentence and then rejects any remaining `codex exec` or nested-model guidance, so an affirmative nested-worker instruction cannot coexist unnoticed. Focused native-worker tests passed 35/35; no live model, ignored private artifact, review, publication, deployment, or external resource was touched.

Milestone 5 adds an ignored work-item-local `mhc-native-submit-attempts/v1` record. It stores only the exact work-item ID/hash, plan and deterministic lease IDs, current ledger lease event ID, and up to three ordered entries containing candidate SHA-256, normalized validation code, and sanitized-diagnostics SHA-256. It stores no candidate prose or validation errors. Recording is atomic under the same bounded stale-lock policy as other native state. A repeated candidate digest is rejected without spending an attempt, a fourth distinct failure is rejected as exhausted, and `fail --code NATIVE_CANDIDATE_UNRESOLVED` now requires exactly three distinct failed attempts bound to the still-current lease before it may append a terminal ledger event. A later successful validation remains a separate `validated` ledger transition, which supersedes the lease and therefore obsoletes its failure record without reinterpreting it. Because work-item and deterministic lease IDs remain stable across scheduled slots, a schema-valid completed three-attempt record may reset only when supplied validated ledger history uniquely proves its exact prior lease was followed by one matching unresolved terminal event and then by the later currently active lease. Active, missing, forged, cross-item, intervening-lease, duplicate-prior, and ambiguous-terminal histories fail closed. An interrupted one- or two-attempt cycle is instead resumed: before cooldown selection or any new lease, prepare scans for exactly one active work item compatible with the current plan, source definitions, exact model, and automation. It creates or validates the current slot's durable pair against that resumed reading and source, then returns the original work item and ledger lease without appending an event; conflicting pair state or multiple compatible active work fails closed. Terminal, transferred, stale-source, forged, mismatched-model/automation/plan, and ambiguous leases are never adopted. Both Spark and Luna prompt contracts require a complete nonempty candidate, materially different repairs after every failed submit, and both remaining attempts before unresolved terminal failure. Fabricated focused native-worker tests passed 40/40, including one- and two-attempt resumption with retained accounting, binding drift, duplicate bytes, early terminal refusal, three-attempt admission, exhausted fourth-attempt, valid later-slot reset, and invalid active/reset histories. Content/schema validation passed with 38 schemas. No ignored private artifact or live generation was inspected or changed.

## Exact next action

Observe the next scheduled Spark/Luna pair. It must resume any still-active authenticated lease, reject empty output, require up to three materially distinct submit attempts, and retain the prior manifest/fallback unless the separate reviewer later admits a complete candidate.
