# Repair Luna Henry candidate persistence and authoring contract

## Goal

Diagnose and repair the persistent native Matthew Henry Luna generation failure, and prove the repaired path with an actual bounded Luna-low candidate rather than only controller mocks or another scheduled observation.

## Requirements and constraints

- Preserve exact Spark-first / Luna-low fallback provenance, existing lease and attempt accounting, source grounding, editorial review, and publication separation.
- Repair only the existing native Henry generation path. Do not generate a new reading plan or broader daily synthesis.
- Keep all real source atoms, candidate prose, historical transcript material, and private state in ignored local storage. Tracked tests use conspicuously fabricated content.
- Preserve every existing dirty file in the selected checkout, shared live private state, scheduled automations, Drive, production deployments, and Git remote history during diagnosis and proof. A new safe handoff and ignored code-patch artifact may be retained in the selected workspace.
- The user explicitly authorized commit and push in this thread on September 9. No model substitution for Henry prose. An implementation worker may change code but may not author the real Henry candidate.

## Repository state

- Selected checkout `/Users/dustinrowland/Projects/BibleApp` is the dirty historical `agent/pages-pwa-canary` branch at `570dadb`; its August project summary is stale.
- The idle main task `Plan Bible Reader MVP` has been using `/private/tmp/dbr-horizon-incident-xdsLGO/worktree`, clean at `55ea966`.
- This repair uses an independent local shared clone at `/private/tmp/dbr-luna-repair.cLpJsn/worktree`, detached at that exact revision. Existing work remains untouched.
- Existing fixes include direct Luna execution (`2a0a757`) and enforced three-attempt accounting/resumption (`7a0db26`). Both were released before this diagnosis, but the latter has no real follow-up-run proof.

## Evidence and decisions

- The actual September 8 17:25 Luna run prepared the same D086 / Zechariah 14:1–4 chunk as Spark.
- Luna constructed a substantive four-verse candidate. Its `apply_patch` save through the isolated-worktree `private-content` symlink failed with `Failed to write file`, despite an allow decision from automatic approval review.
- A later save to the canonical private-content path succeeded, but the worker replaced the substantive candidate with a 152-byte empty structural shell. It then submitted once and marked terminal failure. Empty output was therefore downstream of a persistence failure, not evidence that Luna was unavailable or unable to draft.
- Earlier D086 Luna output also failed a hidden nested contract: required fact `category` was missing and the obsolete `target_marker` field was present. The worker searched older candidates to infer nested shapes.
- The current D086 source view is 16,538 bytes; historical much larger views are not the cause of this latest failure.
- The focused code audit confirms the packet copies a shallow candidate schema and concatenates mutually conflicting standalone fact/writer prompts. The existing internal guard already accepts canonical real paths, so expose verified candidate/validation targets to tooling without weakening directory confinement.
- An independent ignored snapshot of the private stores is available in this clone. Original unsaved output was recovered as four fact briefs and four verse drafts under `private-content/automation/luna-repair-evidence/`. Three pre-existing recursive self-links in the source stores were excluded from the snapshot and left untouched.
- The September 8 23:15 Spark run on released `main` selected D087, used all required repair passes, validated its first bounded chunk, and correctly stopped at normal multi-chunk progress with the prior manifest unchanged.
- The paired 23:25 Luna run was not blocked by model availability. Before generation, it inherited the stale August `AGENTS.md` from the saved project's dirty historical checkout and stopped with `pre_work_item / BRIDGE_SCOPE_LIMIT` for D087, even though fetched `main` correctly authorizes the complete D054-D092 Celebration calendar and only bounds private preparation to current-through-T+7. The canonical checkout's clean `AGENTS.md` has been reconciled locally to the current tracked instruction so future automation threads do not receive the obsolete pilot prohibition.
- The same run exposed a separate controller defect: after Spark validates one chunk in a scheduled slot, `deriveChapterDecision` immediately treats the next unleased chunk as a missed primary at the Luna grace boundary. A successful bounded Spark chunk must satisfy that slot; the next chunk belongs to the next Spark slot. Luna remains eligible only for an explicit Spark model failure or a genuinely missed/stale Spark slot with no successful Spark progress in that slot.
- Root owns operational history, architecture, acceptance, and release decisions. One Sol worker owns focused code diagnosis and the subsequent bounded implementation. During implementation root will not inspect partial diffs or run overlapping tests.

## Milestones and acceptance

1. Finish focused diagnosis of candidate save paths, self-contained schema/instructions, and missing end-to-end coverage.
2. Delegate the smallest coherent repair: provide usable complete candidate contracts and a reliable resolved output location, preserve nonempty work after save failure, and classify persistence separately from model validation without weakening any admission gate.
3. Worker validates fabricated schema/contract, symlink/canonical-path behavior, lease/retry integrity, and affected native-controller tests. Root reviews actual diff and evidence once.
4. Reproduce the previously failing prepared chunk in isolated ignored state with exact Luna at low effort, directly writing and submitting a complete candidate with bounded repair. Preserve every attempt; no publication or canonical ledger changes. Passing means every requested verse has grounded facts and a prose draft, deterministic submit passes, and staged bytes match what was saved.
5. Run repository safety and full `npm run check` appropriate to this code-only controller change; record actual limitations. Update `PROJECT_STATE.md`, create a reviewable patch, and request any required publication authorization only after the result is concrete.
6. Prevent false Luna transfers after successful same-slot Spark progress, with deterministic tests for success, explicit failure, genuine missed/stale primary, prior-slot partial progress, and multi-chunk continuation. Integrate this with the already validated candidate-persistence/packet repair without weakening the one-chunk generation, review, or publication boundaries.
7. Reconcile the September 9 scheduled evidence with the intended lane split. Daily study preparation must be able to publish a complete non-Henry study with a verified full-commentary link while native Henry condensation remains separate debt; a Spark generation/admission failure must create one eligible Luna-low handoff instead of blocking the daily study or being silently treated as success. Diagnose the 05:15 host-policy stop separately from model availability and preserve all prior-manifest, review, and publication boundaries.

## Progress

- [x] Located current implementation and recent failures without changing existing work.
- [x] Identified original nonempty candidate, failed symlink save, and subsequent empty-shell replacement from the actual run.
- [x] Established independent clone of latest released revision.
- [x] Accept code diagnosis and delegate implementation to the same Sol worker: canonical write targets, complete nested schema, coherent model-neutral packet, and fabricated CLI integration proof.
- [x] Primary accepted the actual implementation diff and 44/44 focused tests, including real CLI staging through a symlinked private store with all four fabricated briefs/drafts, nested-schema drift/error checks, path confinement, and preserved retry/lease coverage.
- [x] The actual prepare command in the isolated private snapshot selected D086 001–004 and issued a new valid lease with canonical paths using the recorded real Spark failure. No clock override, fabricated eligibility, or canonical state mutation was needed.
- [x] Exact Luna-low completed the same real four-verse candidate in three submits. The first two failures were exact-snippet mismatches; both permitted repairs were used successfully. All four fact briefs and four prose drafts were saved, read back, and admitted to staging. Root verified the validated ledger event, exact model, work-item binding, all counts, and byte-equivalent candidate/staged prose.
- [x] Root ran `npm run check`: repository safety, every schema/source/private validator, 332/332 tests, all builds, and exact Pages verification passed. `git diff --check` passed. The private manifest in the isolated snapshot still matches canonical bytes.
- [x] Updated `PROJECT_STATE.md` with the corrected root cause, actual proof, and local-only release state. No whole-chapter readiness, review, or publication is claimed.
- [x] Deterministic `npm run publish:pages`, final repository safety (388 files), exact Pages verification, and whitespace checks passed. Public frontend `c20dfa1a2c7392c9` and PWA `c2681bc6c65b8220` remain byte-identical to the existing release.
- [x] Retained this safe handoff in the selected workspace and a code-only patch plus validation summary in ignored `private-content/automation/luna-repair-evidence/`. The patch contains no private proof candidates or source prose.
- [x] Diagnosed the 23:25 `BRIDGE_SCOPE_LIMIT` as stale saved-project bootstrap instructions rather than Luna failure and reconciled only the clean canonical `AGENTS.md` policy lines to current `main` without touching the dirty application changes.
- [x] Corrected false same-slot missed-primary transfer: one authenticated validated Spark chunk now closes only that Spark slot, leaves the next chunk for the next Spark slot, and reports normal `reading_incomplete` progress without admitting Luna. Fabricated controller coverage proves same-slot suppression, next-slot continuation, genuine missed and stale transfer, explicit model-failure transfer, prior-slot isolation, unknown-chunk fail-closed behavior, and whole-chapter Luna restart. Focused test and whitespace evidence are recorded below.
- [x] Milestone 6 validation: `node --test tests/mhc-native-worker.test.js` passed 45/45 tests, including the exact ten-minute grace boundary; `git diff --check` passed. No private state, generation, review, publication, deployment, automation, or external resource was touched.
- [x] Primary full release gate accepted the combined repair: repository safety inspected 388 files; all schema, source, content, and private validators passed; 333/333 tests passed; every build and exact Pages verification passed; and `git diff --check` passed. `npm run publish:pages` deterministically reproduced unchanged frontend `c20dfa1a2c7392c9` and PWA `c2681bc6c65b8220` artifacts.
- [x] Reconciled the daily-preparation/Henry lane boundary and broad Spark-to-Luna eligibility against the new 03:14/05:15/05:27 operational evidence. Daily preparation no longer invokes or waits for legacy Henry generation: it attaches an already-reviewed layer or records verified-link fallback debt for the independent native lanes and continues the complete non-Henry study. Generated-candidate admission exhaustion now receives a model-bound Spark/Luna admission code, allowing exactly one Luna attempt and then a verified fallback; request/source/security/controller/bootstrap/host-policy failures remain non-fallback. Native prompts explicitly report `NATIVE_AUTOMATION_BLOCKED_BY_HOST_POLICY` as controller failure, create no eligibility event, and never blame an unattempted Luna. Fabricated routing and prompt regressions cover these boundaries; focused validation evidence is recorded below.
- [x] Milestone 7 focused validation: `node --test tests/mhc-pipeline.test.js tests/mhc-backfill-work-order.test.js tests/henry-readiness-contract.test.js tests/mhc-native-worker.test.js` passed 118/118 tests; `node --check scripts/mhc-pipeline.mjs` and `git diff --check` passed. No private content/state, model generation, automation TOML, manifest, review, publication, deployment, Git remote, or external resource was read or changed.
- [x] Primary accepted milestone 7 and reran the complete release gate: repository safety inspected 388 files; all content, source, and private validators passed; 333/333 tests passed; all builds and exact Pages verification passed; deterministic Pages publication reproduced unchanged frontend `c20dfa1a2c7392c9` and PWA `c2681bc6c65b8220`; and `git diff --check` passed.
- [x] Received explicit commit/push approval on September 9; reread current durable state, accepted the later milestone 6/7 additions after focused read-only Sol review, and confirmed remote `main` still equals base `55ea966`.
- [x] Confirmed saved daily, Spark, and Luna automations all fetch the changed tracked prompts from `origin/main`; no automation-definition mutation is required.
- [ ] Commit and push the accepted code, then verify the exact remote revision and both GitHub workflows.

## Acceptance and limits

The original failure is reproduced by evidence and the repaired generation path is demonstrated by an actual exact-model run. The primary accepts the local repair. Four verses constitute the controller's complete bounded work item, not the entire twenty-one-verse chapter. Remaining chapter chunks and the separate complete-source review/publication workflow are independent scheduled work; the prior fallback remains live. The packet manifest records interface-overlay provenance; unchanged source/admission provenance continues through the original work-item and lease contracts.

All real proof artifacts and recovered historical content are ignored. The published app's frontend and PWA bytes remain unchanged. The selected dirty historical checkout and the idle main task's checkout have not been overwritten. The safe code patch is `private-content/automation/luna-repair-evidence/validated-code.patch` in the selected workspace; its companion `validation-summary.json` identifies base revision `55ea966`, exact patch hash, and proof counts. The implementation remains available in the independent repair clone named above.

## Exact next action

Publish the accepted repair once from branch `agent/repair-luna-henry-save-contract` in the isolated repair clone to the existing `main` branch; approval is already present. Stage only the reviewed code/schema/prompt/test changes, `PROJECT_STATE.md`, and this ExecPlan after repository safety. Verify the resulting remote revision, repository safety/test workflow, and Pages deployment; retain their aggregate receipt locally without creating a second documentation-only release. Do not replace the dirty historical checkout or copy private proof state into canonical stores.
