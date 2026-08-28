# Commentary protocol freshness and backfill

## Goal

Make the current daily-study protocol an explicit, auditable content contract. Current-through-T+7 studies and previously read studies must be refreshed under that contract in bounded work orders, while preserving stable reading IDs, comments, highlights, reviewed Henry layers, source provenance, and prior versions. Apply the first refresh to Zechariah 5 (`CC-Y3Q4-D074`), whose August 22 payload predates the paired historical-context protocol.

## Requirements

- Add one tracked canonical protocol descriptor with a stable protocol version distinct from ad hoc prompt names.
- Require every current-protocol study to record an explicit archaeological/historical-context assessment: either `included` or `not_material`. A silent omission is never current.
- When context is `included`, require both independently authored Page 1 layers already defined by the workflow: the concise preview and the materially fuller cited dossier.
- When context is `not_material`, require a concise rationale and require both context layers to be absent.
- Treat a missing or superseded protocol version as stale even when the study otherwise has valid bytes, review status, Henry coverage, and manifest membership.
- Keep the current-through-T+7 preparation lane higher priority than historical backfill. Once the horizon is current, select at most one already-read stale study per scheduled run, in deterministic most-recent-first order.
- A refresh is a genuine current-protocol editorial pass, not a metadata-only version bump. Existing good prose and sources may be retained after direct review, but the study must be reconsidered end to end; missing current components must be researched and written, citations rechecked, metadata/version/hash advanced, prior versions preserved, and Drive publication verified content-first/manifest-last.
- Never alter `readingId`, plan placement, comments, highlights, author identity, ESV handling, reader codes, sharing, or backend authorization.
- Spark/Luna remain limited to the Matthew Henry verse layer. The primary task owns broader research, synthesis, context assessment, review, and publication.

## Constraints and non-goals

- No runtime AI.
- No ESV text in Git, Drive, generated metadata, logs, or work orders.
- No bulk unreviewed rewrite and no automatic publication merely because a model produced output.
- Do not replace or regress a newer reviewed Matthew Henry artifact during a protocol refresh.
- Do not activate or modify the inactive long-term plan.
- Do not change Apps Script deployment identity/access, Sheets, Drive sharing, or the public frontend merely to expose the backfill queue.

## Relevant repository state

- `main` begins this milestone at `2bc7c2b`.
- The canonical Drive `CC-Y3Q4-D074.md` has no historical-context heading. Its metadata is `CC-Y3Q4-D074-draft-v1`, generated `2026-08-22T13:20:00Z` under `commentary-workflow-v12-bounded-backfill`, source set `celebration-bridge-2026-08-22-v9`, with no historical-context assessment.
- The paired historical-context protocol entered the repository on August 26. D072 and D073 contain both layers; later v13 studies were produced after the rule but do not yet carry a machine-readable omission/inclusion assessment.
- `scripts/lib/rolling-study-work-order.mjs` currently recognizes hash/review/Henry/manifest staleness but not editorial-protocol staleness.
- The canonical scheduled prompt drains T+7 gaps and then may run one Henry-only backfill. It has no bounded full-study protocol-refresh lane.

## Decisions

- Use a canonical `daily-study-protocol/v1` descriptor in `config/`, with an exact current `protocolVersion` and current workflow name.
- Add `generation.contentProtocolVersion` plus `componentAssessments.historicalContext` to commentary metadata. They remain schema-optional for legacy readability but are mandatory for current readiness.
- Horizon readiness uses the canonical protocol. The separate prior-reading backfill work order is evaluated only after the horizon reports ready.
- Prior-reading refresh order is most-recent-first so material likely to be revisited through the new picker becomes current promptly; the bounded deterministic queue still reaches every stale prior study.
- Protocol refresh has priority over opportunistic Henry-only fallback replacement. Existing complete reviewed Henry layers or verified fallback links are preserved and revalidated.

## Milestones

1. Implement the canonical protocol descriptor, commentary metadata contract, freshness evaluator, current-horizon integration, one-reading prior-study backfill work order/schema/CLI, tests, and scheduled-workflow documentation.
2. Primary-review the implementation and run focused plus repository-wide validation.
3. Research and refresh Zechariah 5 under the current protocol, including an explicit historical-context assessment and both layers if material; preserve its latest reviewed Henry layer.
4. Validate the private bundle, publish only the refreshed D074 content/metadata plus additive source registry and manifest updates, verify exact Drive bytes/permissions, then commit/push the tracked protocol machinery.

## Acceptance criteria

- D074 is deterministically identified as stale because it predates the current protocol.
- A current study without a context assessment is stale.
- `not_material` is accepted only with a rationale and no context headings.
- `included` is accepted only with the concise and expanded layers satisfying the existing distinct-depth validator.
- The T+7 evaluator selects the earliest current/future stale study before any backfill.
- When T+7 is ready, the separate backfill work order selects exactly one most-recent already-read stale study and never selects a future/unprepared/nonmanifest reading.
- Work orders explicitly preserve stable occurrence identity, comments/highlights, ESV exclusion, current Henry review, prior versions, direct primary review, and content-first/manifest-last publication.
- Focused tests and `npm run check` pass; repository safety finds no private content or secrets in Git/Pages.
- The published D074 Drive payload has a current protocol version, explicit assessment, current hash/prior version, and exact readback; no ESV wording or unrelated Google state changes.

## Progress

- [x] Diagnosed D074 against both local ignored source and canonical Drive payload.
- [x] Implement and validate the tracked freshness/backfill contract: canonical `daily-study-protocol/v1`, optional legacy-readable metadata fields, protocol freshness evaluator, T+7 integration, and deterministic one-reading prior-study work order/CLI are tracked and covered by focused tests.
- [x] Run focused protocol/rolling/schema/backfill tests, the full tracked test suite, public content validation, and repository safety. The initial private-content file-count stop exposed that the tracked rollback-compatible prefix plan lagged the already-published canonical Drive plan by D081; the exact D081 plan entry was synchronized locally rather than weakening the validator.
- [x] Refresh, review, validate, and privately publish D074. The current-protocol v2 study includes distinct concise and expanded historical-context layers, preserves the reviewed Henry layer and stable occurrence identity, advances its source set additively, and passed exact content/metadata/registry readback before the unchanged manifest was written and re-read last. Existing narrow sharing was not changed and no broad anyone/domain permission was reported.
- [x] Rebuild and validate the private bundle: 25 end-to-end prepared studies, 28 syntheses, 200 registered sources, and no stored Scripture.
- [x] Run the final repository-wide gate after synchronizing D081: repository safety inspected 293 files; content validation accepted 26 schemas, 28 private-prefix readings, and the full 39-reading schedule; private validation accepted 25 end-to-end studies, 28 syntheses, and 200 registered sources with no stored Scripture; 245/245 tests, all builds, and exact Pages verification passed.
- [x] Commit the tracked protocol machinery and factual D081 prefix synchronization; no unrelated immutable web artifact was staged.
- [x] Push the finalized implementation commit `6e84f79` to `origin/main` after rebasing it over the concurrent D081 T+7 publication; the combined repository-wide gate passed before push.

## Exact next action

Milestone complete. The next scheduled preparation run must refresh D075/Zechariah 6 as the earliest current-horizon protocol-stale study; historical prior-study backfill remains deferred until the full T+7 horizon is current.
