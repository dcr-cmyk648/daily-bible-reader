# Repair Spark-to-Luna fallback and refresh Zechariah 9

## Goal

Make the Matthew Henry controller retry one low-reasoning Luna worker when the preferred Spark worker fails during model execution or generation, then refresh and privately publish today's stale `CC-Y3Q4-D079` / Zechariah 9 study under `daily-study-protocol/v1`, including the required historical-context assessment and layers when material.

## Requirements

- Preserve Spark as the first and preferred Matthew Henry worker.
- Permit exactly one `gpt-5.6-luna` low-reasoning fallback after any failed Spark attempt, including availability/quota, process, malformed-output, and chunked fact-extraction failures.
- Never send the Henry lane to Sol, Terra, or another model.
- Do not use Luna to conceal deterministic request, source, checksum, schema, security, repository, or publication failures.
- If both Spark and Luna fail, retain or attach the already verified credential-free Matthew Henry full-commentary link and continue the independently researched daily study. A model-only Henry failure must not suppress orientation, historical context, main synthesis, takeaway, or other non-Henry components.
- Preserve raw failed attempts, error classification, worker identity, fingerprints, review candidates, and correction history.
- Update tests and durable workflow instructions so the code, drafting skill, scheduled prompt, and documentation describe the same boundary.
- Refresh only `CC-Y3Q4-D079` under the schema-validated rolling work order. Do not generate a second reading until D079 passes direct review, validation, content-first/manifest-last Drive publication, exact readback, and authenticated bootstrap health.
- D079 must record `generation.contentProtocolVersion: daily-study-protocol/v1` and exactly one `componentAssessments.historicalContext` result. If context is included, publish both the concise Page 1 preview and materially fuller expanded dossier; if genuinely not material, record the required rationale and omit both.
- Preserve the stable reading ID, comments, highlights, newest reviewed Henry data or verified fallback, prior versions, ESV/server-secret boundaries, and narrow Drive sharing.

## Constraints and non-goals

- Work only in the isolated clone at `/private/tmp/dbr-spark-luna-fallback.IM2dtz/repo`; the selected checkout is dirty and must remain untouched.
- Private content, source extracts, model output, credentials, Google IDs, comments, and ESV text remain in ignored canonical stores and never enter Git or Pages.
- No runtime AI, no new Google resources, no sharing changes, no reader-code/hash changes, and no accessing-user rollback deployment movement.
- A successful Luna generation is still unreviewed until the primary task compares the complete Henry result with its cited exact atoms and accepts the full daily study.

## Relevant repository state

- Base commit: `e006fbe4ea5af077ddf2c19c7ce6f15f7ec343eb` on `main`.
- September 2, 2026 maps to active day 26, source day 79, `CC-Y3Q4-D079`, Zechariah 9.
- Published D079 metadata is `CC-Y3Q4-D079-draft-v1`, generated 2026-08-26, with no content protocol version and no historical-context assessment.
- D077 and D078 are protocol-current; D079 is the current evaluator's earliest `horizon_content_missing_or_stale` reading.
- The August 31, September 1, and September 2 scheduled runs attempted exact Spark for D079 and failed during chunked fact extraction. Because the controller did not classify that as quota/model unavailable, Luna was prohibited and no publication occurred. An August 30 quota failure did reach Luna, whose output then failed deterministic admission; the verified full-commentary link remained available.
- `npm run study:next -- --today 2026-09-02` returns work order `RSWO-93e9d752840345c34fa7f6c3` for D079. The protocol-backfill lane remains deferred until this primary horizon gap is repaired.

## Decisions

- User explicitly approved on 2026-09-02: after any failed Spark attempt, try Luna-low once. Deterministic input, source, integrity, schema, safety, review, and publication failures remain fail-closed.
- One Spark attempt may trigger at most one Luna-low attempt for the same request/fingerprint; every attempt and classification remains auditable.
- A second model failure degrades only the optional generated Henry layer to the verified full-text link. It does not fail the main study package; non-model gates still apply to every published component.
- `scheduleReading` must consume the controller's typed `henryFallbackRequired` result explicitly. It must write an auditable per-passage link-fallback outcome, return a successful Henry-lane result that contains no fabricated runtime records, and let the daily-study workflow continue. Portable Henry stores and `mhc:ensure` must not claim a reviewed verse layer or write a catalog entry for that fallback outcome.
- Generated-output admission failures remain fail-closed under the repository safety boundary. They are not converted into a link fallback and they do not admit invalid Henry prose.
- Correct the controller and workflow first, validate it, then rerun the unchanged D079 rolling work order. Do not edit the published D079 record merely to add a context panel.

## Milestones

1. Inspect the current controller taxonomy and implement the narrow Spark-generation-to-Luna fallback with focused regression tests and synchronized tracked instructions.
2. Primary review, focused tests, full `npm run check`, repository safety, commit/push, and any required saved-automation prompt synchronization.
3. Re-run D079 through the repaired controller and daily-commentary workflow, research/review its historical context and full study, validate, publish privately content-first/manifest-last, and verify exact Drive/bootstrap health.
4. Confirm the installed reader receives the refreshed D079 revision and context section without clearing downloaded data.

## Acceptance criteria

- Every Spark failure becomes eligible for one Luna-low retry, including the exact observed fact-extraction/generation failure.
- Deterministic non-model failures remain ineligible, and a double model failure produces the verified Henry-link fallback without suppressing other study components.
- Tests prove Spark-first order, one Luna retry, no Sol/Terra route, attempt preservation, and fail-closed non-model errors.
- Code and all authoritative prompts/docs agree on the fallback boundary.
- D079 is protocol-current and no longer the earliest rolling-horizon gap.
- The live D079 payload contains either both distinct historical-context layers or a valid `not_material` assessment; omission cannot be silent.
- All source/private/schema/citation/rights/safety/tests/build/release gates pass, followed by exact private Drive readback and authenticated bootstrap confirmation.

## Validation

- Narrow controller and work-order tests first.
- `npm run safety`, relevant validators, and `npm run check` after implementation.
- D079-specific private-content, source, Henry atom/candidate, manifest-prefix, Drive-readback, and authenticated-bootstrap checks before publication is reported successful.

## Progress

- [x] Diagnosed the stale D079 record and September 1 Spark failure.
- [x] Confirmed the current evaluator still selects D079 as the earliest horizon gap.
- [x] Implement and validate the safety-constrained fallback boundary: one Spark model-execution/no-output failure routes once to Luna-low; the repository guard keeps generated-output schema/admission failures fail-closed rather than Luna-eligible or direct-link continuations.
- [x] Add the explicit `scheduleReading` consumer for a double-model link fallback, including audit/report behavior and regression coverage that prevents portable-store/catalog claims for missing generated runtime data.
- [x] Primary integration review completed: fallback reports name both typed attempts, review promotion rejects null-runtime outcomes, the canonical prompt contract test matches the new boundary, and `npm run check` passes all 263 tests plus builds and exact Pages verification.
- [ ] Refresh, review, and publish D079.
- [ ] Verify the refreshed live payload on the installed reader.

## Exact next action

Commit and push the validated controller/workflow repair so the scheduled checkout can use it, synchronize the existing saved automation prompt if its stored text is stale, then rerun the unchanged D079 work order through the repaired Henry lane and independently refresh/review/publish its protocol-current study.
