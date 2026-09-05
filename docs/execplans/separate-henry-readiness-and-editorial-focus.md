# Separate Henry readiness and tighten synthesis disagreement handling

## Goal

Make Matthew Henry verse-layer completeness an independently tracked automation concern instead of treating a verified full-source link as equivalent to a completed Henry layer. Update the future-study editorial contract so the main synthesis discusses disagreements only when a specific dispute materially affects interpretation, while detailed secondary disputes remain in the expanded study.

## Requirements

- Preserve the existing end-to-end daily-study readiness guarantee: a verified complete public-domain Henry link remains an acceptable nonblocking fallback for opening and using a daily study.
- Add a separate, deterministic Henry-readiness/debt status that distinguishes a reviewed verse layer from a source-link fallback.
- After the current-through-T+7 study horizon is ready, the scheduled task must inspect and process at most one Henry-only backfill even when historical protocol-refresh work remains.
- Keep the one-reading bounds and exact model routing: Spark once, then Luna-low once after an eligible Spark model-execution failure; never Sol or Terra for Henry condensation.
- Report daily-study readiness and Henry-layer readiness separately so a green study horizon cannot conceal Henry fallback debt.
- Do not regenerate existing study prose as part of this change.
- Update the drafting/editorial instructions for future studies: state the best-supported interpretive point directly; include disagreement in the main synthesis only when the positions can be named specifically and the dispute materially changes the reading. Put lesser or unresolved technical debates in the relevant expanded section, and omit vague recurring phrases such as “scholars debate” when they add no practical interpretive value.
- Preserve all security, private-content, ESV, release-stability, and immutable-deployment constraints.

## Constraints and non-goals

- No private commentary, source atoms, ESV wording, credentials, comments, or Google resource identifiers may enter Git or Pages.
- Do not change existing published studies or their hashes.
- Do not generate Henry content in this implementation milestone.
- Do not change authentication, Drive sharing, deployment identity, or the Apps Script endpoint.
- Work from the clean isolated worktree based on `origin/main`; do not touch the dirty canonical checkout.

## Relevant repository state

- `study:live-health` intentionally accepts a reviewed Henry layer or a verified source-link fallback as sufficient for daily-study availability.
- `mhc:backfill:next` independently identifies the oldest fallback; on 2026-09-05 it selected `CC-Y3Q4-D079`.
- `study:protocol-backfill:next` independently selected `CC-Y3Q4-D071`.
- The scheduled prompt currently runs the Henry-only lane only after the protocol-refresh lane returns `none`, which starves Henry repair while the protocol queue is nonempty.
- The private metadata/catalog audit confirms D057–D078 have reviewed verse layers and D079–D089 record verified-link fallbacks after Spark and Luna both failed at `fact_chunk_generation`.

## Decisions

- Keep “study ready” and “Henry verse layer complete” as two explicit truths rather than redefining the daily study as unavailable when a lawful full-source fallback works.
- Run one Henry-only backfill before the optional historical protocol refresh after the T+7 preparation lane is green.
- Historical protocol refresh remains bounded to at most one reading and may run after the Henry attempt; a failed Henry attempt must retain the working fallback and must not invalidate the prepared daily study.
- Editorial tightening applies prospectively only.

## Milestones

1. Implement deterministic separate Henry readiness/debt reporting and regression tests.
2. Reorder and clarify scheduled-task/runbook contracts so Henry repair cannot be starved by protocol refresh.
3. Update editorial/drafting guidance prospectively without touching published content.
4. Validate focused tests, repository safety, full `npm run check`, build/release invariants, and inspect the final diff.
5. Publish only the validated code/documentation release through the already approved existing channels if runtime artifacts changed.

## Acceptance criteria

- A fixture with all daily studies available but at least one source-link fallback reports the daily horizon ready and Henry debt nonzero.
- With both a Henry fallback and a stale historical-protocol reading, the task contract selects/attempts one Henry repair rather than suppressing it.
- A Henry failure leaves the daily-study availability state unchanged and still permits the bounded protocol refresh to be considered afterward.
- Run reports name both ready-through study status and separate Henry completeness/debt.
- Future drafting instructions reject vague disagreement boilerplate in the main synthesis unless the dispute is specific and materially interpretive.
- Existing private content files are unchanged.
- Relevant focused tests, `npm run safety`, and `npm run check` pass.

## Validation

- Focused unit tests for Henry readiness/debt selection and scheduling order.
- Existing rolling-study, live-health, MHC backfill, and protocol-backfill tests.
- `npm run safety`
- `npm run check`
- `git diff --check`

## Progress

- [x] Root cause confirmed: daily readiness and Henry completeness were conflated in reporting, and prompt ordering starved Henry-only backfill behind protocol refresh.
- [x] Milestone 1–3 implementation completed.
- [x] Focused readiness, backfill-order, and contract tests; repository safety; and `git diff --check` passed after the scope/policy reconciliation.
- [x] Primary diff and test review completed.
- [x] Immutable code-only release candidate generated and the complete repository check passed.
- [x] Commit, push, live Pages byte/MIME verification, and authenticated health verification completed.
- [ ] Deployed browser smoke remains unavailable because this environment has no connected controllable browser.

## Discoveries

- The underlying `mhc:backfill:next` selector already works and currently returns D079. The starvation is primarily in orchestration order, not candidate discovery.
- Failure audits retain only model/stage codes for D079–D089; richer durable failure observability remains a related follow-up unless safely included without widening this milestone.
- `study:live-health` now retains daily-study availability semantics while adding
  a separate deterministic chapter-level Henry report: complete reviewed verse
  layers, verified-link fallback debt, and unavailable layers. It uses the
  frontend's exported complete-verse-layer predicate, so the report does not
  duplicate or weaken reader readiness validation.
- The external report field is `currentHorizonHenryLayer` with an explicit
  `current_through_t_plus_7_chapters` scope. It reuses the same authenticated
  eight-payload batch as daily readiness and does not query a historical queue.
- The checked recurring-task contract now attempts at most one Henry fallback
  repair before the optional protocol refresh; a retained fallback after the
  permitted Spark→Luna route leaves daily-study readiness green and does not
  suppress the protocol consideration. Future drafting guidance now requires
  named, materially interpretive disagreements in the main synthesis and
  routes lesser debate to expanded sections.
- Focused tests and repository safety passed. The subsequent D089 bookkeeping
  update restored the expected private prefix shape; `npm run validate:private`
  now passes with 36 prepared readings. No private content was changed by this
  milestone.
- The final full `npm run check` passed with 272 tests, repository safety over
  351 files, all content/source/private validators, every build, and exact
  verification of frontend release `c20dfa1a2c7392c9` and PWA client
  `c2681bc6c65b8220`.
- Commits `836c69a` and `7207fb4` are on `main`. GitHub safety/test run
  `33987317570` and Pages deployment `33987317194` passed. All eight changed
  live files returned HTTPS 200 with expected MIME types and exact committed
  bytes.
- The authenticated live-health result reports the daily study horizon as 8/8
  ready while `currentHorizonHenryLayer` independently reports eight fallback
  debts and zero complete reviewed verse layers for D082–D089.
- Browser-client discovery found no connected browser, so the deployed
  mobile-width visual smoke could not be run. This release does not change UI
  behavior, storage, authentication, transport, or Apps Script server bytes;
  the remaining visual smoke is recorded rather than bypassed.

## Exact next action

At the next available browser session, run the routine deployed mobile-width
smoke. The next scheduled preparation run can otherwise use the checked prompt:
finish T+7, attempt one Henry fallback repair, then consider one protocol
refresh. No Apps Script deployment is required because the generated server
bundle is unchanged.
