# Product backlog

Updated 2026-08-12 (`America/Detroit`). This is the single index of requested work. Detailed security, content, and release requirements remain authoritative in the linked project documents; moving an item here never broadens approval for external actions or content generation.

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
| `CAL-001` | **live; installed-phone gate pending** | Lead the home page with the selected reading card: date, passage, completion, verse of the day, and date-specific open button; place the calendar immediately below it. | The validated reference comes from private commentary metadata. Current and next resolve exact wording from the two-reading volatile ESV window with ESV identity/link/notice; older days stream when opened. No wording is persisted. |
| `PERF-002` | **implemented; release gate in progress** | Warm the normal daily path without creating an offline Scripture archive. | Today plus seven private records paint from a reader/plan/version-bound IndexedDB snapshot. Today and tomorrow always refresh after authorization and keep ESV only in JavaScript memory; other Scripture streams on open. |
| `AUTO-001` | **implemented; release gate in progress** | Implement deterministic commentary-readiness health in the reader. | The eight-reading batch audits the full T+7 horizon against the complete preparation contract, names the first missing components for Dustin, and gives Shane only a generic delay message. |
| `AUTO-002` | **authorized; local workflow implemented; task creation pending** | Run one bounded daily T+7 preparation/publication work order. | `study:next` selects exactly D+7; the primary task owns the broad synthesis; Spark is Henry-only; a confirmed Spark quota failure permits only a verified full public-domain link. Content uploads precede the manifest and exact readback is mandatory. See `CONTENT_AUTOMATION.md` and `AUTOMATION_RUNBOOK.md`. |
| `CONTENT-001` | **D057–D064 reviewed; D065 full-source fallback** | Use Matthew Henry's *Complete Commentary on the Whole Bible* as the default foundational commentary pass. | CrossWire `MHC` 2.2 is hash-verified and atomized; exact cited-atom disclosure, resumable controller, portable private library, and verse-details UI are implemented. Publications follow the checksum-bound newest artifact. Spark quota/availability failures never switch models and expose only a verified full-commentary link. |
| `CONTENT-002` | **prepared locally through D065; publication gate in progress** | Prepare later bridge syntheses only as the approved rolling buffer requires. | The initial current-plus-seven fill ends at D065. Subsequent runs may publish exactly the one reading entering T+7, never a batch or the new long-term plan. |

The active bridge uses `in_review` for directly reviewed private two-person studies. The readiness check accepts `in_review` or `approved` while rejecting `not_started`, `unreviewed`, and `changes_requested`. Machine validation alone never assigns the accepted states.

## Priority 2 — launch plan and deeper offline behavior

| ID | Status | Item | Acceptance boundary |
|---|---|---|---|
| `PLAN-001` | **queued** | Build the new four-stream long-term plan after pilot approval. | One focused unit per day; OT, NT, Psalms, and Proverbs finish together as closely as practical; chronology and book contiguity remain visible constraints; every book introduction is followed immediately by chapter 1. |
| `PLAN-002` | **decision needed** | Confirm launch inputs. | Final canon, shared launch date, future-lock behavior, browsing horizon, commentary length, Psalm ordering, Proverbs chunk size, and stream-balancing tolerance. |
| `OFFLINE-001` | **decision needed** | Decide whether reliable offline Scripture is necessary. | Current ESV policy is network-only. Any change requires fresh provider/licensing review and policy tests; the service worker may never silently cache ESV. |
| `HISTORY-001` | **decision needed** | Decide whether Sheet-backed comment revision history is sufficient permanently. | Current app is append-only, but either direct Sheet editor can alter rows outside the app. Stronger tamper resistance requires mediated writes. |

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
- An eight-reading current-plus-T+7 private download target, with commentary/calendar state retained for up to fourteen days so the farthest-ahead study remains available when its day arrives; offline drafts/outbox continue, while ESV and highlights remain network-only under current policy.
- No runtime AI, secrets, ESV passages, private commentary, comments, Google private-resource IDs, or raw copyrighted source text in GitHub Pages artifacts.

## Routing references

- Hosting/security: `ARCHITECTURE.md`, `SECURITY.md`, `RELEASE_STABILITY.md`, `GOOGLE_SETUP.md`
- Commentary: `COMMENTARY_WORKFLOW.md`, `EDITORIAL_STANCE.md`, `CONTENT_AND_RIGHTS.md`
- Automation: `CONTENT_AUTOMATION.md`
- Plan: `CHRONOLOGY.md`
- Validation: `TESTING.md`
