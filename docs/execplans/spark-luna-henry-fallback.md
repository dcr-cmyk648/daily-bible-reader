# Spark-to-Luna Matthew Henry fallback

## Goal

Make the offline Matthew Henry condensation pipeline try the exact Spark model first and, only when Spark reports quota exhaustion or model unavailability, retry with the exact Luna model at low reasoning. Sol must never generate this layer. Preserve every validated reading artifact in the private content-addressed Henry library, and replace every Henry-link fallback in the current today-through-T+7 study horizon with a reviewed embedded layer.

## Requirements

- Preferred worker: `gpt-5.3-codex-spark`.
- Allowed fallback worker: `gpt-5.6-luna` with `model_reasoning_effort=low`.
- Luna is used only for coded Spark quota/model-unavailable failures. Validation defects, source failures, malformed output, and generic controller failures remain fail-closed.
- Each independent run tries Spark first. A confirmed Spark availability failure may switch the remaining missing work in that run to Luna.
- `gpt-5.6-sol`, Terra, and every unspecified model are prohibited for Henry generation.
- All Codex worker invocations remain ephemeral, read-only, noninteractive, standard-speed, and have internal multi-agent features disabled.
- Model provenance is retained per generated fact brief, writer output, runtime shard, reading object, catalog descriptor, activation/ensure result, and review record.
- Mixed Spark/Luna artifacts can coexist in the immutable private library. Catalog updates merge new descriptors without dropping older readings.
- The current eight-day horizon is audited and all published readings still using `henrySourceLink` are backfilled, reviewed, attached, published content-first/manifest-last, and read back exactly.
- No ESV text, raw Henry source text, private content, secrets, Google IDs, reader codes, or comments enter Git or Pages.

## Constraints and non-goals

- This changes only the Henry verse-by-verse condensation lane. The primary daily orientation and all-sources synthesis remain in the established primary workflow.
- Runtime AI remains disabled.
- Full-corpus generation is still incremental. The durable library is capable of accumulating the whole Bible, but this task generates only missing readings in the current preparation horizon.
- Do not change Google resource identity/access, deployment identity, sharing, or secrets.
- Keep existing request contracts backward-compatible where practical so the saved scheduled task does not break before its canonical prompt is synchronized.

## Relevant repository state

- Clean implementation checkout: `/private/tmp/dbr-full-plan.ooVTzq/repo`, based on `origin/main` at `514b383`.
- Private stores are ignored symlinks to the canonical checkout and already contain the accumulated reviewed Henry library.
- Current prepared prefix ends at D076 / James 2 / 2026-08-30.
- D057-D076 have embedded reviewed Henry layers; D070-D076 are durable Luna-low artifacts produced only after a coded Spark availability failure and primary review.
- The controller currently classifies `SPARK_QUOTA_UNAVAILABLE` and `SPARK_MODEL_UNAVAILABLE`, but autonomous generation and several schemas are hard-coded to Spark and the backfill guard forbids substitutes.

## Decisions

- Add a small explicit routing policy rather than accepting arbitrary `--model` substitution.
- Preserve Spark as the preferred/requested model in backward-compatible requests; record the actual worker model on every produced artifact.
- Treat a confirmed Spark availability error as the only automatic fallback trigger.
- Use a single-run Spark-unavailable latch so the controller does not waste repeated Spark quota calls across one batch, while a later invocation probes Spark again.
- Keep content-addressed paths model/fingerprint-specific so a future Spark rerun cannot overwrite a Luna artifact.
- Keep primary review mandatory before attaching or publishing either model's output.

## Milestones

### 1. Routing, contracts, tests, and documentation — complete

- Implement exact Spark-to-Luna routing with low Luna reasoning and explicit Sol prohibition.
- Generalize actual-model schemas/catalogs to accept only the two allowed worker slugs while retaining backward-compatible request defaults.
- Update backfill work orders and canonical scheduled-task instructions.
- Add focused tests for routing, failure boundaries, invocation flags, mixed-model persistence, and no-Sol guarantees.

Acceptance:

- Spark success never invokes Luna.
- Spark quota/model-unavailable invokes Luna exactly as specified.
- Other failures do not invoke Luna.
- Luna command uses exact model, low reasoning, and disabled multi-agent features.
- Catalog merge tests preserve older mixed-model entries.
- Focused tests and schema validation pass.

### 2. Current-horizon generation and review — complete

- Audit today through T+7 for verified Henry-link fallbacks.
- Drain D070-D076 in schedule order through the new controller.
- Validate source attribution, atom mapping, verse coverage, wording, and all deterministic admission checks.
- Apply the existing human-review gate and save approved immutable reading artifacts in the private library.

Acceptance:

- Every chapter in D070-D076 has a validated, reviewed Henry runtime shard.
- No reading in the current horizon depends only on `henrySourceLink`.
- Catalog and pointer checksums verify and prior library readings remain present.

### 3. Private publication and runtime verification — complete

- Attach the approved Henry layers to the matching private daily readings.
- Publish reading bytes first and manifest last; perform exact readback.
- Verify the app bootstrap and each horizon reading exposes the embedded Henry layer, without printing private content in logs.

Acceptance:

- Private manifest/readback matches local bytes and hashes.
- The current horizon has no missing Henry layers.
- Existing comments and unrelated reading content are unchanged.

### 4. Release and durable task state — durable-state update complete; commit/push and task synchronization pending

- Run repository safety, focused tests, and `npm run check`.
- Update `PROJECT_STATE.md` and this ExecPlan with exact evidence.
- Commit and push the validated code/docs under the project's existing authorization; deploy only if changed runtime code requires it.
- Synchronize the saved scheduled task if the existing authenticated browser session permits; otherwise leave one exact manual step.

Acceptance:

- The released revision is identified and remote verification passes.
- The canonical prompt describes Spark-first/Luna-low fallback and current-horizon backfill.
- The next scheduled run can continue accumulating reviewed Henry readings without Sol.

## Validation ladder

1. Focused Node tests for MHC routing, backfill work orders, activation/ensure, and portable-library persistence.
2. Schema/content validators for mixed Spark/Luna artifacts.
3. Private-library integrity and current-horizon dry-run/audit.
4. `npm run safety`.
5. `npm run check`.
6. Private Drive publish/readback verification if publication occurs.

## Progress

- 2026-08-23: Repository and current private state inspected. Official/local Codex model metadata confirms `gpt-5.6-luna` supports low reasoning. Architecture chosen; implementation not started.
- 2026-08-23: Milestone 1 implementation added Spark-first routing with narrow coded availability fallback to Luna-low, per-batch Luna latching, strict worker allowlisting, actual-model provenance arrays, mixed-library catalog retention, and updated backfill/scheduled-task/skill/runbook contracts. The Luna chapter route now uses the same autonomous two-stage controller as Spark; book introductions retain legacy behavior. Ensure receipts now include only requested-window generated/reused provenance, not unrelated catalog models. `node --test tests/mhc-pipeline.test.js tests/mhc-library-sync.test.js tests/mhc-backfill-work-order.test.js` passed (53/53); `npm run validate` passed (24 schemas, 23 private-prefix readings, 39 scheduled bridge readings, 92-day reference schedule, fabricated Scripture only); `git diff --check` passed.
- 2026-08-23: Primary review accepted Milestone 1 after catching and correcting the initial Luna-to-legacy routing defect and the overbroad ensure provenance union. A live read-only backfill evaluation selected D070 / Zechariah 2 as the earliest missing current-horizon Henry layer with the new Spark-first/Luna-low guard and explicit no-Sol rule.
- 2026-08-23: Corrected a deterministic false positive exposed by Luna backfill: citation-like abbreviated OSIS book names such as `called Isa.` no longer become required person identities, while named-person and relationship protection remains intact. Existing valid Luna chunk fingerprints and cache reuse behavior are unchanged; only the failed chunk reruns under its existing fingerprint. Focused MHC tests passed (54/54) and `git diff --check` passed.
- 2026-08-23: Added a bounded per-invocation Codex timeout (120 seconds by default; `MHC_CODEX_TIMEOUT_MS` accepts 15–600 seconds) with SIGTERM, a five-second SIGKILL grace fallback, model-neutral timeout logging, and single-settlement timer/process handling. Timeout errors remain transient for normal bounded retry and never trigger Spark→Luna routing. Fabricated-child timeout coverage passed with the focused MHC suite (55/55); `git diff --check` passed.
- 2026-08-23: Tightened fact-brief repair guidance for low-reasoning Luna retries: named target-marked atoms need a required fact, and qualification-cue repairs must either select evidence/anchors containing the cue or use `qualification: none` without unsupported hedging. Validation and admission behavior remain unchanged. Focused fabricated prompt coverage passed with the MHC suite (56/56); `git diff --check` passed.
- 2026-08-23: Added a one-level atom-specific fact fallback for an otherwise-valid single-verse fact chunk that fails only because a target-marked atom lacks a required fact. Each missing atom receives a same-model, atom-restricted child request in a fingerprinted private subpath; only normally validated child facts are merged, deduplicated, deterministically renumbered, and revalidated against the original verse contract. The fallback never recurses, does not synthesize facts, and fails closed on any remaining validation error or schema fact-count overflow.
- 2026-08-23: Corrected fact hydration for the atom fallback: a required fact whose source atom is explicitly listed in that verse request's `target_marked_source_atom_ids` now survives direct-target shared-range pruning. Unrelated shared-range facts remain pruned and the three-fact cap remains in force; fabricated coverage exercises a direct target plus a second target-marked shared-range atom.
- 2026-08-23: Added conservative qualification hydration for a pure worker-metadata mismatch: a non-`none` qualification becomes `none` only when its controller-selected evidence, fact statement, and writer anchors all lack the corresponding cue. Statement-level or anchor-level uncertainty remains unchanged and therefore fails deterministic validation when unsupported by evidence.
- 2026-08-23: Added a separate bounded, same-model qualification-cue atom fallback for remaining statement-level unsupported hedging. It activates only for exclusive indexed qualification evidence/anchor errors in a single-verse chunk, regenerates each offending fact's permitted source atom under a fingerprinted private child path, replaces only an exact-importance child fact, then hydrates and revalidates the full original verse. Ambiguity, unrelated errors, missing replacements, overflow, or invalid merged output fail closed.
- 2026-08-23: Added a bounded same-model explicit identity/relation omission fallback. It parses only exact requested omission errors, requires a unique target-marked atom containing each omitted identity or relation pair, scopes the child request to those requirements, and replaces one deterministic required fact per atom only when the validated child carries every needed term in both statement and anchors. All other errors, ambiguous atoms, invalid child output, or failed full-verse validation remain fail-closed.
- 2026-08-24: Primary completed the required every-condensation/every-cited-atom review for D070–D076. Hash-bound candidates were approved with all assertions true and applied once each through the private review CLI: D070/D071 needed no corrections; exact supplied replacements were applied to D072 (3), D073 (3), D074 (4), D075 (1), and D076 (4). Each corrected runtime and canonical `review.json` was produced; no publication occurred. Added controller-level generated-prose rejection for `upbraideth`, `bridleth`, `knowest`, and `whosoever` (not `waked`, which the existing lexical policy does not classify as safely archaic). `node --test tests/mhc-review.test.js tests/mhc-pipeline.test.js tests/mhc-library-sync.test.js tests/mhc-backfill-work-order.test.js` passed (68/68); `git diff --check` passed.
- 2026-08-24: Synced D070–D076 local metadata to the newest approved `mhc-autonomous-writer/v5` layers and passed source, private-content, safety, and bundle gates (20 end-to-end studies; 23 syntheses; 159 sources; 49-file bundle). Existing private Drive metadata files were updated as `text/plain`, then independently confirmed byte-for-byte against their local counterparts. After that gate passed, the existing private manifest was promoted in place as `text/plain` without changing its identity or sharing; remote raw base64 bytes and byte count exactly match the local manifest. Post-promotion `mhc:sync-latest --check` confirms all seven D070–D076 records resolve their newest reviewed layer, the prepared prefix/catalog are contiguous D056–D076 (21 readings), and catalog descriptor provenance retains the mixed exact worker set `gpt-5.3-codex-spark` / `gpt-5.6-luna`. `npm run study:next -- --today 2026-08-23` reports `horizon_ready` for D076 with no gap. No frontend/backend deployment, commit, or push occurred.
- 2026-08-24: Final durable-state record: Spark remains first, with exact low-reasoning Luna allowed only after coded Spark quota/model-unavailable failure; Sol, Terra, and arbitrary models remain forbidden. The actual availability failure triggered same-run Luna-low generation for D070–D076, whose every-condensation/every-cited-atom primary review applied 15 isolated corrections before durable approval. Full `npm run check` passed (safety 244 files, content/private/source validation, 231 tests, hybrid/token/PWA builds, and Pages verification). No application deployment was required for the private-content publication; tracked routing and documentation changes await commit/push.

## Discoveries

- Existing artifact fingerprints already include `worker_model`, so immutable Spark and Luna products naturally separate.
- Existing catalog writes merge by stable `reading_id` and retain prior descriptors, but top-level/catalog schemas and summary fields assume one Spark model and must be generalized without losing per-reading provenance.
- Existing quota classification provides a narrow, testable fallback boundary.

## Exact next action

Commit and push the reviewed routing/code/docs, synchronize the saved scheduled-task prompt if reachable, then let the normal daily task maintain T+7 and accumulate the whole-Bible library incrementally.
