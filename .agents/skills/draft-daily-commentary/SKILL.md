---
name: draft-daily-commentary
description: Prepare or repair exactly one Daily Bible Reader study from a schema-validated work order. Use for private source inventory, cited synthesis, custom deep study, coverage audit, and staging validation. Only a rolling-study-work-order/v1 may authorize hash-validated publication of its one current-through-T+7 reading.
---

# Draft Daily Commentary

Accept either one legacy `commentary-work-order/v1` produced by `scripts/content-automation.mjs work-order`, or one `rolling-study-work-order/v1` produced by `scripts/rolling-study-work-order.mjs`. Both authorize one reading only. The legacy order is draft-only. A rolling order with `action: prepare_publish` authorizes private publication only after the primary task completes source review, content review, Henry review, validation, and content-first/manifest-last promotion.

## 1. Verify the gate

1. Read repository `AGENTS.md`, `README.md`, and `PROJECT_STATE.md`.
2. Validate the packet against its exact schema and confirm its `reading` still matches the canonical active plan. A rolling order may name the one immediately appendable reference-plan entry when `planExtensionRequired` is true; run the bounded bridge-extension command and then revalidate the match.
3. For a legacy order, require its draft-only guards. For a rolling order, require `daysAhead: 7`, one reading, private-only content, primary review before publication, content-first/manifest-last promotion, `in_review` status, no stored ESV wording, no runtime AI, no comment access, and Spark limited to the Matthew Henry verse layer.
4. Stop if the packet is absent, stale, names more than one reading, conflicts with the plan, or asks for a reading outside the currently authorized generation scope.
5. Stop on a dirty shared worktree. Use the task's isolated worktree or dedicated clean automation checkout. Never reset or discard another task's files.

## 2. Load the exact workflow

For a legacy packet, read every file named in `pipeline.workflowDocuments`. For a rolling packet, read the workflow documents listed in `prompts/daily-study-scheduled-task.md`. In both modes also read `schemas/commentary.schema.json`, `schemas/source.schema.json`, and the applicable work-order schema. These repository files are authoritative. Do not reconstruct editorial or rights rules from memory.

Use `context.configuredReadingIds` when the plan explicitly identifies relevant prior material. Treat `context.immediatePreviousReadingId` only as a candidate: consult and mention it only when it materially clarifies the current reading, and restate enough context for today's prose to stand alone.

## 3. Prepare private staging

Work only under the ignored path `private-content/automation/staging/<readingId>/` and the configured ignored research registry. Preserve any prior version and its hash. Never place generated prose, source extracts, access notes, ESV wording, or private identifiers in a tracked path.

Prepare these artifacts for the one reading:

- `commentary.json` using `commentary/v3`, publication status `draft`, initially unreviewed and promoted to `in_review` only after direct primary-task review;
- `synthesis.md`, with passage-specific level-three headings;
- a validated reading-specific source-registry working copy or delta that retains honest access and rights states;
- `coverage-report.json`, containing represented and missing categories, consulted/included counts, major disagreements, single-source claims, inaccessible candidates, exclusions, and limitations;
- `validation-report.json`, containing commands run, pass/fail results, hashes, limitations, and files requiring review.

Do not copy Scripture into any artifact. `verseOfTheDay` is a reference only.

## 4. Research and draft

Run the Matthew Henry preflight for the named passages. When exact reviewed atoms exist, use that source as the foundational confessional/pastoral pass and record its exact CrossWire edition. The controller tries exact Spark first; if and only if it returns a coded availability or account-quota failure, it may retry exact Luna at low reasoning. Sol, Terra, and all other models are forbidden; validation, source, controller, and generic failures never fall back. Only after the narrow route is unavailable, attach a verified credential-free HTTPS link to the complete public-domain chapter commentary, bound to its real source-registry record. Label that fallback honestly; absence is never permission to invent a condensation. Build outward with independent grammatical, textual, historical, literary, canonical, theological, reception, and useful counterposition sources.

Do not delegate the main daily synthesis to Spark. The primary task must perform the broad source research, evidentiary weighting, drafting, editing, citation verification, validation, and publication handoff itself. The exact authenticated `gpt-5.3-codex-spark` model is reserved for the separate high-volume, verse-by-verse Matthew Henry condensation pipeline described in `docs/MATTHEW_HENRY_PIPELINE.md`. Preserve the D057 Spark-assisted draft as a one-off historical calibration; it is not a precedent for subsequent work orders.

Record a source as consulted only after accessing the work itself. Separate inaccessible, rights-excluded, duplicate, low-quality, consulted, and included sources. Do not rely on snippets, mirrors, fabricated bibliography, paywall bypass, or stored copyrighted source prose.

Write for expert Christian readers under the repository's confessional stance. Produce an executive main synthesis with one governing thesis and connected paragraphs, rather than serial commentary notes or compressed source coverage. Let the passage determine the movement, but normally establish the situation, explain its theological logic, identify its interpretive center, and land in the resulting response. Move secondary textual, historical, and reception questions into custom deep-study sections unless they materially change that central argument. Retain private claim markers and an auditable source set; the reader hides those markers from the short daily surface while the detailed synthesis displays its own numbered citations. Also supply a one- or two-paragraph orientation and one practical sentence. The takeaway should normally give the reader a specific attitude, temptation, motive, habit of attention, or response to watch in oneself that day. Use an outward action only when it is realistically achievable that day and directly warranted by the passage; reject vague assignments such as “fix an injustice.” Present major contrary views only when influential and relevant, distinguish evidence from anti-supernatural premises, and assess them concisely.

## 5. Validate and hand back

Run source provenance, commentary schema/citation/hash/rights checks, repository safety, and every reading-specific validator available. A failed check must leave the staging record non-ready and list stable error codes. A passing machine check still leaves the draft `unreviewed`.

Update only this reading's private staging record. Re-run the applicable status/work-order command and return:

- work-order ID and reading ID;
- artifacts created or changed;
- sources consulted, included, inaccessible, and excluded by category;
- validation results and known limitations;
- resulting draft and published horizons;
- the exact files reviewed or still requiring judgment.

For a legacy order, never publish, upload, deploy, commit private output, alter the live manifest, call the ESV API, read comments, or generate another reading.

For a rolling `prepare_publish` order, the primary task must directly review and mark only the named study `in_review`, attach the newest hash-bound reviewed Henry artifact or the verified full-commentary link described above, run all private and repository gates, upload versioned private content first, update the single private manifest pointer last, and verify exact-byte Drive readback. It may commit and push the code-only plan extension and publish the existing approved Pages/Apps Script path when required. It must never store ESV wording, read comments, weaken a gate, generate a second reading under the same work order, or publish partial content. Failure leaves the previous manifest current and reports the same gap for retry. After a successful exact readback, an explicitly authorized recovery run may request a fresh work order and repeat only until the current-through-T+7 horizon is complete.
