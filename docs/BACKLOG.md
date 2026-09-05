# Product backlog

Updated 2026-08-22 (`America/Detroit`). This is the single index of requested work. Detailed security, content, and release requirements remain authoritative in the linked project documents; moving an item here never broadens approval for external actions or content generation.

Status meanings: **in progress**, **queued**, **approval-gated**, **manual check**, and **accepted—do not regress**.

## Priority 0 — deployment stability and daily usability

| ID | Status | Item | Acceptance boundary |
|---|---|---|---|
| `PWA-001` | **accepted—do not regress** | Use the GitHub Pages top-level PWA as the primary installed reader while retaining the production Apps Script hybrid as rollback. | Dustin confirmed the installed Pages app works. Public shell only; correct iOS icon; fast cached launch; content-addressed updates and rollback; service worker never caches ESV, private content, comments, highlights, backend responses, or credentials. |
| `PWA-002` | **accepted—do not regress** | Use the approved Pages PWA plus owner-executed bearer-token backend. | OAuth/API execution was discarded. The nonce-bound POST bridge, exact method map, hashed Dustin/Shane identity, isolated manifest/build, public-only cache, live private reads/writes, code retention, and installed-iPhone behavior are confirmed. Version 23 remains rollback. |
| `STAB-001` | **accepted—do not regress** | Keep ordinary frontend releases independent of Apps Script versions. | Immutable code releases, exact readback, previous-release fallback, bounded startup states, and no production promotion without the applicable phone gate. |
| `PERF-001` | **implemented** | Compare launch phases without analytics. | The in-memory inspector records shell, code, cached/fresh calendar, authorization, fresh sync, and Scripture milestones. Values reset each launch, are field-allowlisted, and are never persisted, logged, or transmitted. |

## Priority 1 — near-term product and content workflow

| ID | Status | Item | Acceptance boundary |
|---|---|---|---|
| `CAL-001` | **live; installed-phone gate pending** | Lead the home page with the selected reading card: date, passage, completion, verse of the day, and date-specific open button; place the calendar immediately below it. | The validated reference comes from private commentary metadata. Current and next resolve exact wording from the live/bounded ESV path with identity, exact link, and notice; only the provider-policy store may retain eligible wording. |
| `PERF-002` | **implemented; release gate in progress** | Warm the normal daily path without creating an unbounded Scripture archive. | Today plus seven private records paint from a reader/plan/version-bound IndexedDB snapshot. Eligible ESV passages use separate total/book/age/version enforcement; current and next retain the first displayable chapter, later short-book tabs stream on open, and transient reads retry once automatically. |
| `AUTO-001` | **implemented; installed-phone update check pending** | Implement deterministic commentary-readiness health in the reader. | The eight-reading batch audits the full T+7 horizon against the complete preparation contract, names the first missing components for Dustin, gives Shane only a generic delay message, and revalidates retained records after authorization. |
| `AUTO-002` | **active; bounded recovery verified; task-UI sync pending** | Run bounded daily current-through-T+7 preparation/publication work orders. | **Prepare Daily Bible Reader T+7** is documented for 3:00 a.m. Detroit time. `study:next` selects the earliest missing or stale reading in the eight-reading horizon; each work order remains one reading, and only exact Drive readback permits reevaluation. The primary task owns the broad synthesis; Spark is Henry-only; a confirmed Spark quota failure permits only a verified full public-domain link. Repository prompt/runbook are current; the saved task UI still needs signed-in synchronization. |
| `CONTENT-001` | **D057–D078 reviewed; D079–D089 verified full-source fallback** | Use Matthew Henry's *Complete Commentary on the Whole Bible* as the default foundational commentary pass. | CrossWire `MHC` 2.2 is hash-verified and atomized; exact cited-atom disclosure, resumable controller, portable private library, and verse-details UI are implemented. Publications follow the checksum-bound newest artifact. Spark gets one attempt; only after an eligible model-execution/no-output failure may Luna retry once at low reasoning. Sol, Terra, and every other model remain forbidden; an unavailable or failed permitted route exposes the verified full-commentary link. |
| `CONTENT-002` | **live through D075; rolling task active** | Prepare later bridge syntheses only as the approved rolling buffer requires. | The private prefix is ready through August 29. A caught-up run normally prepares only the newly entering T+7 reading; bounded recovery may repair earlier gaps sequentially, one exact-readback work order at a time, but never a reading beyond T+7 or the new long-term plan. |

The active bridge uses `in_review` for directly reviewed private two-person studies. The readiness check accepts `in_review` or `approved` while rejecting `not_started`, `unreviewed`, and `changes_requested`. Machine validation alone never assigns the accepted states.

## Priority 2 — launch plan and deeper offline behavior

| ID | Status | Item | Acceptance boundary |
|---|---|---|---|
| `PLAN-001` | **review candidate ready; activation gated** | Review the v2 four-stream plan beginning September 16, 2026, after the Celebration bridge. | The inactive 1,224-slot candidate keeps the confirmed 66-book canon, OT/NT proportional interweaving, immediate book-intro adjacency, canonical Psalms, and explicit machine-readable combined Psalm/Proverbs contributions. It must not activate until Dustin reviews its reports and the pragmatic Proverbs boundaries. |
| `PLAN-002` | **partially confirmed** | Record remaining launch inputs before activation. | Confirmed: canon, Detroit start date (2026-09-16), one-unit daily model, OT/NT stream order, canonical Psalm order, weighted Psalm/Proverbs pairing policy, and a target of near-simultaneous stream completion. The generated v2 candidate has a 3-day finish spread. Remaining: review and approval of the dated schedule and pragmatic Proverbs cut points, future-lock behavior, browsing horizon, recurring commentary length, and explicit activation approval. |
| `LIBRARY-001` | **approved design; implementation queued** | Add permanent canonical study resources alongside dated daily occurrences. | Drive holds reviewed lawfully storable reusable layers; stable canonical resource IDs remain distinct from occurrence-keyed comments/completion; the Sheet remains append-only event authority; ESV stays outside the library. |
| `LIBRARY-002` | **active-plan picker implemented; permanent layer queued** | Add library browsing, permanent notes, and bounded resource caching. | The released compact active-plan picker uses only authorized bootstrap plan/metrics/prepared membership, disables unavailable options, preserves grouped occurrence history, labels partial ranges exactly, and never completes a day by opening. Permanent notes, Drive-resource migration, and bounded recent-resource caching remain queued. |
| `CONTEXT-001` | **queued; editorial design confirmed** | Add an optional collapsed archaeological/historical-context section to prepared studies. | Render only when it adds meaningful reading-specific evidence; distinguish evidence from inference; limit disputes to material questions; use Wikipedia only for orientation/discovery and prefer stronger final sources; do not add naturalistic or skeptical padding. |
| `OFFLINE-001` | **implemented; installed-phone gate pending** | Retain as much of the current-plus-seven ESV horizon as verified terms allow. | Policy v5 uses per-passage IndexedDB records, 500-total/half-book eviction, eight-day expiry, network-first refresh, first-chapter retention for partitioned assignments, honest target-based coverage reporting, and no service-worker Scripture caching. Later short-book chapters replace or reload through the streamed tab path. |
| `HISTORY-001` | **approved design; implementation queued** | Keep the Google Sheet canonical for append-only comment, note, and highlight history, with restricted Drive exports as backups. | App-mediated events remain revision-aware and append-only; a direct Sheet editor can still alter rows outside the app, so the record is operationally auditable rather than cryptographically immutable. Stronger tamper resistance would require a later mediated-write design. |

## Manual acceptance still outstanding

| ID | Status | Item |
|---|---|---|
| `SHANE-001` | **manual check** | Shane installs the chosen final host, opens live ESV, verifies warm/cold launch, and tests overlapping highlights when the app is closer to launch. |
| `AUTH-001` | **manual check** | Explicit third-account, crossed-reader-code, granular-scope-denial, Drive-removal, Sheet-removal, and wrong-deployment checks. |
| `OFFLINE-002` | **manual check** | Comment outbox recovery, downloaded-data clearing, revocation behavior, and installed-iPhone update/rollback. |

## Accepted behavior — do not regress

- Dark, mobile-first full-month calendar; selecting a date does not immediately navigate.
- Selected-date passage and separate Dustin/Shane completion; two persistent color-coded dots on every date; comment activity counts without opening that reading.
- Three reading pages: orientation, Scripture/book overview, and commentary; shared comments on every page; **Finished** returns home.
- Concise, practical, expert-level prose that stands alone within the day's reading; one coherent cited main article; passage-specific collapsed deep studies below comments.
- Confessional Christian premise, ordinary textual sense as the default, and fair but bounded treatment of genuinely influential critical claims without granting methodological naturalism neutral authority.
- Verse of the day and concrete takeaway on page 3; exact ESV wording derived only from the live provider response.
- Shared verse highlights with independent reader colors/timestamps, overlap support, immediate optimistic feedback, and server-authoritative reconciliation.
- Persistent reader enrollment/code fallback; pasted-code button behavior; no `undefined` drafts; append-only idempotent comments and highlights with server identity/time.
- An eight-reading current-plus-T+7 private download target, with commentary/calendar state retained for up to fourteen days so the farthest-ahead study remains available when its day arrives; offline drafts/outbox continue, ESV retention is policy-bounded and may be partial, and highlights remain network-only.
- No runtime AI, secrets, ESV passages, private commentary, comments, Google private-resource IDs, or raw copyrighted source text in GitHub Pages artifacts.

## Routing references

- Hosting/security: `ARCHITECTURE.md`, `SECURITY.md`, `RELEASE_STABILITY.md`, `GOOGLE_SETUP.md`
- Commentary: `COMMENTARY_WORKFLOW.md`, `EDITORIAL_STANCE.md`, `CONTENT_AND_RIGHTS.md`
- Automation: `CONTENT_AUTOMATION.md`
- Plan: `CHRONOLOGY.md`
- Validation: `TESTING.md`
