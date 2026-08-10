# ESV integration and provider policy

Terms verified: 2026-08-08 at <https://api.esv.org/>. Endpoint behavior verified at <https://api.esv.org/docs/passage-text/>. Re-check before production deployment and whenever the provider-policy version changes.

## Verified conditions relevant to this app

- A request may contain at most 500 verses or half of a book, whichever is less; the request rule states an exception for single- and double-chapter books.
- Daily/hourly/minute request limits are 5,000 / 1,000 / 60.
- Local storage may not exceed 500 verses or half of any individual book, whichever is less. The cache language does not state the single-/double-chapter exception, so this app does not apply that exception to persistence.
- A page may not display more than 500 verses or half of a book, whichever is less.
- Further redistribution is limited to 500 verses, under half of a book, and under half of the receiving work.
- Use and the website/app must be noncommercial. The service is intended for personal, church, and Christian ministry use and includes eligibility/statement-of-faith conditions on the official page.
- Each passage must be identified as ESV; every page using the text must link to ESV.org and include the notice returned with the text. The site also requires a standard copyright notice.
- ESV words may not be changed. Optional headings, footnotes, cross-references, verse numbers, and carefully marked omissions may be omitted under the stated conditions.
- The API key may not be sold, shared, or published. Access may be revoked.
- Mobile/digital use is allowed under the general conditions. Uses exceeding them require a formal license; Crossway says its licensing policy is for organizations, not individual/solo developers.
- No real ESV text may be committed, uploaded as commentary, logged, placed in error reports, exported, or included in a build artifact.

This is a technical compliance record, not legal advice.

## Required notice

Chapter pages display `ESV`, link the passage to <https://www.esv.org/>, and display the following standard notice exactly as published on the checked terms page:

> Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated into any other language.
>
> Users may not copy or download more than 500 verses of the ESV Bible or more than one half of any book of the ESV Bible.

## Server adapter

`getScripture(readingId)` accepts a stable reading ID only. The server resolves one to five configured chapter references from the private plan, verifies the active user and Drive gate, reads `ESV_API_KEY` from Script Properties, and sends one provider request per chapter with an `Authorization: Token …` header. `UrlFetchApp.fetchAll` reduces latency, but the requests remain legally and technically independent. The key is never returned.

The adapter requests verse numbers, passage references, and the short copyright marker; it excludes API-added headings/footnotes to keep display deterministic. It compares every returned canonical range and verse count with server-known reading metadata and checks the aggregate against both the 500-verse and per-book half-book display limits. The browser receives a chapter array and renders it on one daily Scripture page. Commentary metadata may select one `verseOfTheDay` reference inside those configured chapters. Page 3 isolates that verse from the same response already held in memory, preserving its wording and line breaks; neither the verse nor the chapter is copied into commentary metadata, Drive content, IndexedDB, or a build. The Page 3 card identifies the text as ESV, links the precise reference to ESV.org, and exposes the same required notice. Missing key, provider error, malformed response, reference mismatch, or verse-extraction failure produces an unavailable state and never another translation.

## `esv-api-2026-08-08-v3-network-only` browser policy

- `maxTotalCachedVerses`: 500
- `maxBookFraction`: 0.5, calculated from configured ESV-versification book totals
- `maxAgeSeconds`: 0
- `offlinePersistenceAllowed`: false
- `refreshBehavior`: request from the provider on every open; no Scripture fallback is read from IndexedDB
- `downloadAllowed`: false; no Scripture export/download feature
- `bulkCopyAllowed`: false; ordinary browser text selection is not treated as a secure DRM boundary, and the required user limit notice remains visible
- attribution: visible `ESV`, exact notice above, and ESV.org link
- `verifiedAt`: 2026-08-08

The network-only decision is stricter than the storage allowance and avoids turning a multi-chapter bridge into a rolling Scripture archive. ESV responses exist only in the live page's memory. The persistence adapter deletes any legacy Scripture record it encounters; the service-worker path remains absent; **Clear downloaded data** still clears all other local categories. The numerical limit engine remains tested with synthetic storage-enabled policies so a future licensed or explicitly permitted provider mode cannot bypass total, per-book, age, and eviction controls.

The app prefetches at most the next seven available private commentary payloads and comment state, but it skips ESV prefetch when the provider policy disables persistence. An offline user can read previously downloaded private synthesis and draft a comment, while the Scripture page clearly says a connection is required. Multi-chapter days are fetched chapter by chapter when online and combined only for the current page.

The active bridge supplies trustworthy per-book ESV verse totals for Micah, 1 Peter, Nahum, and Proverbs plus exact expected chapter counts. Tests also use fabricated long- and short-book metrics. A later reading may not be activated until its metrics are configured and its combined display passes the provider limits; for example, storing three chapters as one API request is never assumed permissible merely because the app groups them visually.
