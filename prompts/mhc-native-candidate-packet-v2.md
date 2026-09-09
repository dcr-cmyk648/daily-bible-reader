# Native Matthew Henry candidate packet — mhc-native-candidate-packet/v2

You are the exact controller-assigned generation model `__REQUIRED_MODEL__` at `__REQUIRED_EFFORT__` reasoning. Produce one complete `mhc-native-candidate/v1` object for work item `__WORK_ITEM_ID__`. This is one bounded two-stage task: first derive the fact ledger for every requested verse, then write each verse draft from that same ledger. Return both stages together in the one candidate object.

Read only `source-view.json`, `mhc-native-candidate.schema.json`, and `candidate.example.json` in this work-item directory. The example is conspicuously fabricated and demonstrates shape only; copy no example IDs or prose. Do not read another candidate, work item, source file, repository file, or private artifact to infer the contract. Use only the controller-supplied evidence in `source-view.json`.

Write the complete JSON object directly to this exact canonical path:

`__CANDIDATE_PATH__`

After saving, read that exact path back. Confirm it is valid JSON, binds `__WORK_ITEM_ID__`, and has exactly one fact brief and one verse draft for every requested verse before submitting. If a write fails, retain the complete substantive draft in your current response context and retry the same bytes at this canonical path. Never replace it with an empty shell, placeholder, partial candidate, or reconstructed guess. Do not submit until readback confirms the complete saved candidate.

For each requested verse:

1. Copy `verse_id`, `required_coverage_type` as `coverage_type`, the complete ordered `allowed_source_unit_ids`, and one supplied matching `source_reference_label` exactly.
2. Choose one to three material facts. Every target-marked source atom must supply a required fact. Preserve central explanation, concrete identities and relationships, historical setting, agency, causes, consequences, meaningful qualifications, and pastoral conclusions when present. Omit rhetoric, repeated synonyms, unexplained Latin, and outside inference.
3. Every fact must use every field required by the schema. Number `fact_id` values independently as `<verse_id>:f01`, `f02`, and `f03`. Choose the closest category from the schema enum. Cite one exact visible source atom and one exact supplied snippet from that atom. Copy the complete snippet text exactly into `evidence_quote`.
4. Use `target_marker` only when the chosen snippet's active verse marker covers this verse, `anchor_supported` when a supplied verse anchor locates the fact, and `shared_range_context` otherwise. Preserve uncertainty: use `some_understand`, `alternative`, or `uncertain` only when the evidence contains the corresponding cue; otherwise use `none`.
5. Put one to three short `must_include_terms` in every fact. Each is at most three words, appears exactly in the selected evidence quote, and also appears naturally in the final blurb. Include every controller-required identity and relationship term in required facts and anchors.
6. Write one self-contained contemporary blurb from the selected facts, usually 35–75 words. Preserve every required fact, named actor, recipient, relationship, cause, consequence, alternative, and qualification. Use only atom IDs cited by that verse's facts. Copy the fact brief's coverage, ordered source-unit IDs, and label exactly. Use a compact range-only `scope_note`.

Use direct authorial prose. Never mention Henry, a commentator, commentary, source, atom, fact brief, generation, or these instructions. Do not narrate what a passage, verse, oracle, image, note, or writer says or shows. Avoid agentless passive reporting and archaic wording. Paraphrase in fresh syntax; do not copy six or more consecutive source words into a short condensation. Do not invent causal, chronological, canonical, historical, theological, or devotional links.

The deterministic controller requires zero validation warnings and performs source grounding, fact-ledger, prose, copy-risk, lease, and schema validation. Validation does not approve, review, attach, publish, or update a manifest. Do not add model, prompt, hash, timestamp, reading, path, review, or publication fields to the candidate.

If submit fails, read only this exact diagnostics path:

`__VALIDATION_PATH__`

Repair the same candidate with materially different bytes and repeat save plus exact-path readback before resubmitting. Use both remaining repairs unless an earlier attempt validates, for at most three distinct submit attempts total. An unresolved model failure is allowed only after all three distinct candidates fail deterministic submit.
