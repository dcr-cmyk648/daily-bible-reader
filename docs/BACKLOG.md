# Product backlog

Updated 2026-08-11 (`America/Detroit`). This is the single index of requested work. Detailed security, content, and release requirements remain authoritative in the linked project documents; moving an item here never broadens approval for external actions or content generation.

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
| `CAL-001` | **live; installed-phone gate pending** | Put the selected reading's verse of the day in the card below the calendar, above the date-specific open button. | The validated reference comes from private commentary metadata. Current and next resolve exact wording from the two-reading volatile ESV window with ESV identity/link/notice; older days stream when opened. No wording is persisted. |
| `PERF-002` | **live; authenticated browser passed; installed-phone gate pending** | Warm the normal daily path without creating an offline Scripture archive. | Current and next paint from valid IndexedDB records immediately, then are always re-fetched after authorization so a Drive revision replaces stale cached content. Their ESV responses remain in JavaScript memory only. The seven-reading private snapshot fills in the background; other Scripture streams on open. |
| `AUTO-002` | **implemented, two bounded runs complete; recurring task not enabled** | Let the main scheduled task execute one bounded commentary work order. | Stable one-reading work orders prepared D057 and D058 separately; their source packets, primary-task edits, coverage, and validation records remain private. Future main studies stay entirely in the primary task; Spark is reserved for mass verse-by-verse Henry work. The gate is disabled again, and no auto-publication occurred. |
| `AUTO-001` | **implemented** | Implement deterministic commentary-readiness health in the reader. | The seven-reading batch audits tomorrow plus two later studies against the complete preparation contract, reports tomorrow separately from later gaps, names missing components for Dustin, and gives Shane only a generic delay message. |
| `AUTO-002` | **approval-gated—local foundation built** | Create the scheduled offline/prepublication generation workflow. | The read-only evaluator models seven draft and five explicitly approved live days and returns at most one earliest gap. The bounded Henry precursor can prepare today through two days ahead in an ignored no-Scripture store. D057 had one explicitly approved manual release; no recurring task or automated Drive publication exists. See `CONTENT_AUTOMATION.md` and `AUTOMATION_RUNBOOK.md`. |
| `CONTENT-001` | **D057/D058 attached; D056 remains a private review aid** | Use Matthew Henry's *Complete Commentary on the Whole Bible* as the default foundational commentary pass. | CrossWire `MHC` 2.2 is hash-verified and atomized; exact cited-atom disclosure, resumable controller, portable private library, and verse-details UI are implemented. D057's 15 records and D058's 13 records were reviewed against their cited atoms and attached as `in_review`. Each publication bundle follows the checksum-bound current pointer and refuses a stale, corrupt, or unreviewed handoff. D056 remains unattached; the Genesis calibration remains unreviewed. Henry is foundational, not controlling or sufficient by himself. |
| `CONTENT-002` | **D057 and D058 ready; D059–D060 untouched** | Prepare later bridge syntheses only as the approved rolling buffer requires. | D057 and D058 are live as `in_review`, each with a complete Henry layer and multi-source synthesis. This does not authorize D059–D060 generation, bulk expansion, recurrence, or automated publication. |

The active bridge's five substantive studies still carry the legacy `in_review` metadata value, so the reader-health check treats `in_review` and `approved` as usable while rejecting `not_started` and `changes_requested`. The future publication workflow remains stricter: newly automated drafts do not become published-ready until their metadata is explicitly approved.

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
- Cached private commentary/calendar state and offline drafts/outbox for up to seven days; ESV and highlights remain network-only under current policy.
- No runtime AI, secrets, ESV passages, private commentary, comments, Google private-resource IDs, or raw copyrighted source text in GitHub Pages artifacts.

## Routing references

- Hosting/security: `ARCHITECTURE.md`, `SECURITY.md`, `RELEASE_STABILITY.md`, `GOOGLE_SETUP.md`
- Commentary: `COMMENTARY_WORKFLOW.md`, `EDITORIAL_STANCE.md`, `CONTENT_AND_RIGHTS.md`
- Automation: `CONTENT_AUTOMATION.md`
- Plan: `CHRONOLOGY.md`
- Validation: `TESTING.md`
