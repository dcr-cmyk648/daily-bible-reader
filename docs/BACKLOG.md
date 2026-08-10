# Product backlog

Updated 2026-08-10 (`America/Detroit`). This is the single index of requested work. Detailed security, content, and release requirements remain authoritative in the linked project documents; moving an item here never broadens approval for external actions or content generation.

Status meanings: **in progress**, **queued**, **approval-gated**, **manual check**, and **accepted—do not regress**.

## Priority 0 — deployment stability and daily usability

| ID | Status | Item | Acceptance boundary |
|---|---|---|---|
| `PWA-001` | **local implementation complete—external gate pending** | Build a GitHub Pages top-level PWA canary alongside the production Apps Script hybrid. | Public shell only; correct iOS icon; fast cached launch; content-addressed updates and rollback; service worker never caches ESV, private content, comments, highlights, backend responses, or credentials. Production remains unchanged until the two-reader phone/security gate passes. |
| `PWA-002` | **in progress—token canary** | Replace the Apps Script top-level launcher with the approved Pages PWA plus owner-executed bearer-token backend. | OAuth/API execution was discarded. The local nonce-bound POST bridge, exact method map, hashed Dustin/Shane identity, isolated manifest/build, public-only cache, and tests are implemented; immutable deployment, enabled config, live read/write probe, and installed-iPhone gate remain. |
| `STAB-001` | **accepted—do not regress** | Keep ordinary frontend releases independent of Apps Script versions. | Immutable code releases, exact readback, previous-release fallback, bounded startup states, and no production promotion without the applicable phone gate. |
| `PERF-001` | **queued** | Compare production hybrid and Pages canary startup phases without analytics. | Measure shell visible, cached calendar visible, authorization confirmed, fresh data synchronized, and Scripture visible; never log identities, content, references, comments, or credentials. |

## Priority 1 — near-term product and content workflow

| ID | Status | Item | Acceptance boundary |
|---|---|---|---|
| `CAL-001` | **queued** | Put the selected reading's verse of the day in the card below the calendar, above the date-specific open button. | Reference paints immediately from validated private metadata. Any exact ESV wording is fetched server-side without blocking calendar selection, remains memory-only, and carries required ESV identification, link, and notice. |
| `AUTO-001` | **queued** | Implement deterministic commentary-readiness health in the reader. | Count consecutive substantive, reviewed readings; placeholders and gaps do not count; warn Dustin with the exact gap and give Shane a non-sensitive delay message. |
| `AUTO-002` | **approval-gated** | Create the scheduled offline/prepublication generation workflow. | Target a seven-day draft buffer and five-day reviewed/published buffer; generate at most the earliest one missing reading per run; runtime AI remains absent; no auto-publication during initial review period. See `CONTENT_AUTOMATION.md`. |
| `CONTENT-001` | **accepted—do not regress** | Use Matthew Henry's *Complete Commentary on the Whole Bible* as the default foundational commentary pass. | Prefer CrossWire `MHC` 2.2, recorded as the exact public-domain edition; then build outward with independent textual, linguistic, historical, literary, canonical, theological, reception, and contemporary technical sources. Henry is foundational, not controlling or sufficient by himself. |
| `CONTENT-002` | **queued** | Prepare later bridge syntheses only as the approved rolling buffer requires. | D057–D060 remain explicit placeholders until individually requested or an approved automation workflow reaches them; no bulk generation or later-Bible expansion. |

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
