# Repair installed-reader synchronization

## Goal

Fix the installed Pages reader state in which an online device paints retained commentary, continues to report **Offline**, and can leave today's study on an older cached revision even though the canonical Drive payload is current.

## Requirements

- Preserve immediate local-first rendering from the reader-bound IndexedDB snapshot.
- Treat “rendered from cache” and “browser is offline / server access is unconfirmed” as separate states; never label a merely cached first paint as offline.
- When the browser is online, opening today's or tomorrow's prepared reading must recover authorization if necessary and then revalidate that reading against the backend.
- A newer commentary version/content hash must replace the retained payload and rerender the already-open reading, including both historical-context panels.
- Calendar completion, discussion/outbox, highlights, and private-study refresh must converge through the same confirmed-access state without duplicate identity prompts or unhandled races.
- A transient refresh failure keeps the cached reading usable but exposes a retryable synchronization state; an explicit authorization denial still fails closed.
- Genuine `navigator.onLine === false` behavior remains offline-first and performs no backend call.

## Constraints / non-goals

- Use only fabricated Scripture and fabricated commentary in automated/local browser tests.
- Do not read browser storage from a real user profile or expose reader codes.
- Do not change the Apps Script backend contract, deployment identity, Google resources, Drive/Sheet data, ESV policy, IndexedDB schema, or service-worker private-data boundary unless evidence proves the existing client contract cannot support recovery.
- Do not modify the dirty selected workspace; implementation and release use the clean isolated clone.
- Preserve all prior immutable `web/releases/` and versioned PWA clients.

## Relevant repository state

- Base: `3ec00fd` (`Record sync recovery release`).
- Canonical Drive content and metadata for `CC-Y3Q4-D077` were read-only verified on 2026-08-31: the live manifest points to the current `draft-v2` payload, metadata marks `daily-study-protocol/v1` historical context as included, and the Markdown contains distinct concise and expanded historical-context sections.
- Therefore the missing Zechariah 7 context is a client retention/synchronization problem, not missing generation or publication.
- The prior repair introduced `recoverServerAccess()` for manual calendar/comment/outbox/highlight paths, but cached reading opening still determines its final status from `result.source === "cache"` and may race authorization/background priority refresh.

## Decisions

- Keep cached first paint fast; make authoritative refresh an explicit, observable second phase.
- Prefer one deduplicated access/revalidation primitive for the open reading instead of relying on incidental comment synchronization or a swallowed batch refresh.
- Do not clear downloaded data to repair a current study.

## Milestones

1. Reproduce the online-cached startup/open-reading race with a stale fabricated payload and identify the exact status/refresh boundary.
2. Add focused regression coverage and implement the smallest client fix that produces authoritative current-study replacement while preserving true-offline behavior and fail-closed authorization.
3. Primary review, iPhone-width browser smoke, full release gate, immutable Pages publication, GitHub workflow verification, live byte/MIME verification, and installed-iPhone handoff.

## Acceptance criteria

- With a stale fabricated current-day cache and an online browser, the reading paints immediately without claiming the device is offline, access recovery runs once, the newer fabricated payload replaces it, and the open Page 1 gains both historical-context panels.
- With `navigator.onLine === false`, the same cache paints with an honest offline status and no access/content RPC.
- Transient online refresh failure retains cached content with an explicit retry state; authorization rejection shows the reader-code/fatal gate and no local fallback overwrites it.
- Existing comment, calendar, outbox, and highlight recovery tests continue to pass.
- `npm run check`, local 390×844 smoke, immutable Pages publishing, GitHub workflows, and exact live HTTPS byte/MIME comparison pass.

## Progress

- [x] Canonical Drive publication and historical-context content verified read-only.
- [x] Client-side stale-cache/synchronization boundary selected for investigation.
- [x] Reproduction test and implementation accepted; `node --test tests/outbox-and-frontend.test.js` passed (57/57), `node --check app/frontend/app.js` and `git diff --check` passed.
- [x] Isolated 390×844 Chrome smoke passed: fabricated stale `CC-Y3Q4-D077` cache painted while disconnected, connectivity recovery replaced it with the authoritative fabricated fixture, the visible Sync action completed, no page errors occurred, and document width remained 390 px.
- [x] Full local release gate passed: repository safety inspected 308 files; all validators, 249/249 tests, both builds, and exact prepared Pages verification passed.
- [ ] Pages release deployed and verified live.

## Exact next action

Commit and push the validated source plus immutable releases `81e02dcc477061b4` / `3d946af577c6bd19`, wait for GitHub workflows, and compare the live HTTPS bytes/MIME types with the committed artifacts.

## Discoveries

- `readingPayloadWithCache()` returned a retained payload when cached-shell confirmation was still pending and `loadReading()` mapped every cache result to **Offline**, even when `navigator.onLine` was true.
- The background priority batch persisted newer payloads but did not rerender an already-open reading, so its latest commentary—including the independently rendered concise and expanded historical-context panels—could remain stale.
- The open-reading revalidation persists the authoritative payload and relies on `persistPrivatePayload()`'s revision comparison for rerendering; identical payloads therefore do not reset the selected page. The existing Sync control now retries both the open payload and discussion, while resume/pageshow retries the same deduplicated open-reading path.
- Both visible Sync controls (`#refreshComments` on a reading and `#syncOutbox` in downloaded-data controls) now share one operation that confirms access once before retrying the open payload and discussion; transient/offline access remains non-RPC and visibly retryable.
