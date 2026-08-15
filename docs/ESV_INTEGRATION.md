# ESV integration and provider policy

Terms re-verified: 2026-08-15 at <https://api.esv.org/>. Endpoint behavior was checked at <https://api.esv.org/docs/passage-text/>. Re-check before production deployment and whenever the provider-policy version changes.

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

Chapter pages display `ESV`, link to the exact assigned passage on ESV.org, and display the following standard notice exactly as published on the checked terms page:

> Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated into any other language.
>
> Users may not copy or download more than 500 verses of the ESV Bible or more than one half of any book of the ESV Bible.

## Server adapter

`getScripture(readingId)` accepts a stable reading ID; the backward-compatible structured form `{readingId, passageIndex}` selects one configured passage of a partitioned daily reading. The server resolves only plan-allowlisted references, verifies the reader, reads `ESV_API_KEY` from Script Properties, and sends one provider request per displayed chapter with an `Authorization: Token …` header. `UrlFetchApp.fetchAll` reduces latency for a compliant combined reading, but requests remain legally and technically independent. The key is never returned.

The adapter requests verse numbers, passage references, and the short copyright marker; it excludes API-added headings/footnotes to keep display deterministic. It compares every returned range and verse count with server-known metadata. If a daily assignment would display more than half a book, the server returns one compliant chapter plus partition metadata instead of returning a generic provider failure. The Scripture page then exposes accessible chapter tabs and replaces the displayed chapter when one is selected. A chapter that individually exceeds the display limit is not integrated and receives an exact ESV.org fallback link.

Commentary metadata may select one `verseOfTheDay` reference inside the configured reading. The browser may retain only that extracted verse in volatile memory after its source chapter is replaced, so the home/Page 3 card remains available without retaining a second full short-book chapter. Neither the selected wording nor any chapter is copied into commentary metadata, Drive content, Git, or a build. Missing key, provider error, malformed response, reference mismatch, or verse-extraction failure produces an unavailable state and never another translation.

## `esv-api-2026-08-15-v5-bounded-offline` browser policy

- `maxTotalCachedVerses`: 500
- `maxBookFraction`: 0.5, calculated from configured ESV-versification book totals
- `maxAgeSeconds`: 691200 (eight days)
- `offlinePersistenceAllowed`: true, but only through the policy engine below
- `refreshBehavior`: network-first when a reading opens; a valid bounded record may paint immediately and remains the fallback when refresh fails
- `downloadAllowed`: false; no Scripture export/download feature
- `bulkCopyAllowed`: false; ordinary browser text selection is not treated as a secure DRM boundary, and the required user limit notice remains visible
- attribution: visible `ESV`, exact notice above, and ESV.org link
- `verifiedAt`: 2026-08-15

IndexedDB stores one record per configured passage, never a bundled Bible or unbounded reading archive. Before every write, the policy engine removes expired or older-policy records, evicts the oldest same-book records until the half-book bound is met, then evicts globally until no more than 500 verses remain. It refuses a chapter that by itself exceeds half its book. Records expire after eight days and refresh network-first when opened. **Clear downloaded data**, access denial, or a policy/app/plan identity change removes or invalidates them. The service worker never sees or caches ESV responses.

The app prepares the current and next private study payloads first, then fills the current-plus-seven (eight-reading) private commentary/comment snapshot. It attempts the same horizon for ESV chapter records, processing the most immediate day last so an eviction favors today's text. This is a best-effort target, not a promise that every scheduled chapter fits: consecutive chapters from a short book, a whole-short-book daily assignment, and some individual chapters necessarily produce partial coverage. The Downloaded Data card reports the retained chapter count and identifies multi-chapter readings that must stream one chapter at a time. The home verse still warms first for today and tomorrow.

The active bridge supplies per-book ESV verse totals and exact chapter counts for every activated book. Tests include fabricated long and short books, Habakkuk's whole-book daily assignment, and a Haggai chapter that alone exceeds half the book. A later reading may not be activated until its metrics and display/cache behavior are configured. Grouping chapters as one schedule day never implies that they may be requested, displayed, or retained as one ESV payload.
