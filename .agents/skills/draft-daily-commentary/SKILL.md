---
name: draft-daily-commentary
description: Prepare or repair exactly one Daily Bible Reader commentary draft from a schema-validated commentary-work-order/v1 packet. Use for the scheduled private prepublication pipeline, source inventory, cited daily synthesis, custom deep-study material, coverage audit, and staging validation. Do not use for runtime generation, Scripture delivery, bulk chapter generation, publication, deployment, or work without an explicitly enabled work order.
---

# Draft Daily Commentary

Accept one `commentary-work-order/v1` object produced by `scripts/content-automation.mjs work-order`. Treat it as authorization for that reading only, not as authority to publish.

## 1. Verify the gate

1. Read repository `AGENTS.md`, `README.md`, and `PROJECT_STATE.md`.
2. Validate the packet against `schemas/commentary-work-order.schema.json` and confirm its `reading` still exactly matches the canonical active plan.
3. Require `pipeline.skillName: draft-daily-commentary`, `guards.maxReadings: 1`, private ignored staging, no ESV wording, `autoPublish: false`, and review status `unreviewed`.
4. Stop if the packet is absent, stale, names more than one reading, conflicts with the plan, or asks for a reading outside the currently authorized generation scope.
5. Stop on a dirty shared worktree. Use the task's isolated worktree or dedicated clean automation checkout. Never reset or discard another task's files.

## 2. Load the exact workflow

Read every file named in `pipeline.workflowDocuments`, plus `schemas/commentary.schema.json`, `schemas/source.schema.json`, and `schemas/content-staging-index.schema.json`. These repository files are authoritative. Do not reconstruct editorial or rights rules from memory.

Use `context.configuredReadingIds` when the plan explicitly identifies relevant prior material. Treat `context.immediatePreviousReadingId` only as a candidate: consult and mention it only when it materially clarifies the current reading, and restate enough context for today's prose to stand alone.

## 3. Prepare private staging

Work only under the ignored path `private-content/automation/staging/<readingId>/` and the configured ignored research registry. Preserve any prior version and its hash. Never place generated prose, source extracts, access notes, ESV wording, or private identifiers in a tracked path.

Prepare these artifacts for the one reading:

- `commentary.json` using `commentary/v3`, publication status `draft`, and human review status `unreviewed`;
- `synthesis.md`, with passage-specific level-three headings;
- a validated reading-specific source-registry working copy or delta that retains honest access and rights states;
- `coverage-report.json`, containing represented and missing categories, consulted/included counts, major disagreements, single-source claims, inaccessible candidates, exclusions, and limitations;
- `validation-report.json`, containing commands run, pass/fail results, hashes, limitations, and files requiring review.

Do not copy Scripture into any artifact. `verseOfTheDay` is a reference only.

## 4. Research and draft

Run the Matthew Henry preflight for the named passages. When exact reviewed atoms exist, use that source as the foundational confessional/pastoral pass and record its exact CrossWire edition; absence is a reported limitation, not permission to invent it. Build outward with independent grammatical, textual, historical, literary, canonical, theological, reception, and useful counterposition sources.

Do not delegate the main daily synthesis to Spark. The primary task must perform the broad source research, evidentiary weighting, drafting, editing, citation verification, validation, and publication handoff itself. The exact authenticated `gpt-5.3-codex-spark` model is reserved for the separate high-volume, verse-by-verse Matthew Henry condensation pipeline described in `docs/MATTHEW_HENRY_PIPELINE.md`. Preserve the D057 Spark-assisted draft as a one-off historical calibration; it is not a precedent for subsequent work orders.

Record a source as consulted only after accessing the work itself. Separate inaccessible, rights-excluded, duplicate, low-quality, consulted, and included sources. Do not rely on snippets, mirrors, fabricated bibliography, paywall bypass, or stored copyrighted source prose.

Write for expert Christian readers under the repository's confessional stance. Produce an executive main synthesis with one governing thesis and connected paragraphs, rather than serial commentary notes or compressed source coverage. Let the passage determine the movement, but normally establish the situation, explain its theological logic, identify its interpretive center, and land in the resulting response. Move secondary textual, historical, and reception questions into custom deep-study sections unless they materially change that central argument. Retain private claim markers and an auditable source set; the reader hides those markers from the short daily surface while the detailed synthesis displays its own numbered citations. Also supply a one- or two-paragraph orientation and one practical sentence. Present major contrary views only when influential and relevant, distinguish evidence from anti-supernatural premises, and assess them concisely.

## 5. Validate and hand back

Run source provenance, commentary schema/citation/hash/rights checks, repository safety, and every reading-specific validator available. A failed check must leave the staging record non-ready and list stable error codes. A passing machine check still leaves the draft `unreviewed`.

Update only this reading's private staging-index entry. Re-run the status command and return:

- work-order ID and reading ID;
- artifacts created or changed;
- sources consulted, included, inaccessible, and excluded by category;
- validation results and known limitations;
- resulting draft and published horizons;
- the exact files Dustin must review.

Never publish, upload, deploy, commit private output, alter the live manifest, call the ESV API, read comments, or generate another reading.
