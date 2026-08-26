# Recurring context workflow and schedule review

## Goal

Make the distinct two-level archaeological/historical context product part of every normal daily-study generation run, and expose the complete inactive long-term candidate as a compact, deterministic, phone-readable day-by-day review artifact.

## Requirements

- The recurring scheduled prompt and `$draft-daily-commentary` skill must explicitly require, when meaningful evidence exists:
  - a concise `### Archaeological and historical context` preview;
  - a separately researched `### Archaeological and historical context — expanded study` dossier;
  - distinct prose, materially greater depth, topical H4 headings, evidence/inference boundaries, claim-level citations, and a nearby bibliography for the expanded layer.
- Omit both layers when the passage has no useful reading-specific context; never manufacture filler.
- The normal workflow must never satisfy the lower panel by repeating or mechanically stretching the preview.
- Add regression coverage so the recurring prompt and skill cannot silently lose the paired-layer contract.
- Generate a complete day-by-day Markdown review schedule from the existing inactive candidate JSON. It must include all 1,255 entries, civil dates, day indices, streams, and reading labels, be grouped for phone scanning, and state clearly that it is review-only/inactive.
- `npm run plan:long-term:check` must fail if the daily review artifact drifts from the deterministic candidate.

## Constraints / non-goals

- Do not alter the candidate ordering, dates, schedule hash, stream balance, book order, or activation state.
- Do not generate commentary for the long-term plan.
- Do not add ESV wording, private commentary, source extracts, credentials, reader codes, identities, or Google IDs to Git or Pages.
- Do not change Apps Script, Drive, Sheets, authentication, ESV policy, or the installed reader runtime.
- Spark remains reserved for the Matthew Henry verse-by-verse lane; this implementation milestone belongs to Terra.

## Relevant repository state

- `main` is `078e34d` and clean.
- The paired context rendering and private validator are already live.
- `docs/COMMENTARY_WORKFLOW.md` contains the canonical detailed two-layer contract.
- The scheduled prompt's component checklist currently says only `custom cited deep sections`.
- `.agents/skills/draft-daily-commentary/SKILL.md` does not explicitly require the paired context layers.
- The inactive candidate is `four-stream-protestant-66-candidate-2026-09-16-v1`, 1,255 entries from 2026-09-16 through 2030-02-21, SHA-256 `d209d9067b677ffb161ae62c8f3d31b7c00c6d3b0772fe115eaf45abe289d057`.

## Decisions

- Keep `docs/COMMENTARY_WORKFLOW.md` authoritative and repeat a concise mandatory checklist in the scheduled prompt and skill so unattended runs cannot overlook it.
- Treat historical context as conditional on meaningful evidence but, once a concise preview is authored for a prepared study, require the independently authored expanded dossier.
- Extend the existing deterministic long-term generator rather than hand-maintaining a second schedule.
- Use monthly H2 headings and compact Date / Day / Stream / Reading tables for the full review artifact.

## Milestones

1. Update the recurring prompt, drafting skill, and automation runbook/invariant with the paired-layer contract; add focused regression coverage.
2. Extend the deterministic long-term generator and check mode to write/verify the complete daily Markdown schedule; add generator tests without changing candidate bytes/hash.
3. Run focused and full validation, review the generated schedule, update durable state, commit/push safe tracked files, and verify the public review link.

## Acceptance criteria

- A future daily run is explicitly told to research and author two distinct context layers when context is meaningful.
- Tests fail if the exact two headings or the independent-depth requirement disappear from the scheduled prompt or skill.
- The generated schedule contains exactly 1,255 daily rows, begins with Genesis overview on 2026-09-16, ends with Malachi 4 on 2030-02-21, and preserves the existing schedule SHA-256.
- `npm run plan:long-term:check`, focused tests, repository safety, and `npm run check` pass.
- The candidate remains inactive and no private or licensed content enters public artifacts.

## Progress

- [x] User approved the distinct two-level presentation and requested it become the normal workflow.
- [x] Existing recurring prompt/skill gap and deterministic candidate artifacts inspected.
- [x] Implement workflow and schedule-review artifacts. The scheduled prompt, drafting skill, and runbook carry the paired-layer contract; focused regressions pass. The deterministic generator emits a 1,255-row monthly daily schedule without changing the candidate hash.
- [x] Validate the integrated milestone. Focused tests passed 10/10, deterministic schedule check passed, repository safety inspected 273 files, all 24 schemas/private gates passed, all 238 tests passed, and the unchanged frontend/PWA release verified exactly.
- [ ] Commit/push and verify the public schedule-review URL; then hand off review without activating the candidate.

## Exact next action

Commit and push the factual schedule/workflow files, wait for Pages publication, verify the public schedule-review bytes and content type, then hand the inactive candidate to Dustin for ordering review.
