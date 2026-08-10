# Content and rights policy

This project makes source use traceable and conservative; it does not declare that a use is legally authorized. The U.S. Copyright Office emphasizes that fair use is case-specific, balances four factors, and has no guaranteed word/percentage formula: <https://www.copyright.gov/fair-use/> (checked 2026-08-08).

## Storage boundaries

- Git/Pages: source, schemas, tools, safe bibliographic metadata, fabricated fixtures, and built code/style releases only. Pages never receives commentary, source notes/extracts, ESV wording, comments, or deployment configuration.
- Ignored local research workspace: lawfully accessed research inputs and working notes. Do not sync this folder to the friend or include it in logs/builds.
- Private Drive publication: original synthesis, source metadata, coverage report, and short justified quotations only. No ESV passages and no raw commentary library.
- Browser: the published synthesis and comment data; current ESV responses remain network-only in page memory.

Private two-person use can reduce practical exposure but does not itself grant permission.

## Source status is evidence, not aspiration

Every registry record has one current status:

- `discovered` — bibliographic lead only; not represented as read.
- `consulted` — the actual work/edition was lawfully opened and enough was read to support notes; access date/method recorded.
- `inaccessible` — known but not available without a barrier we did not bypass.
- `excluded_rights` — license/terms/storage/use risk is unsuitable.
- `excluded_duplicate` — mirror or derivative adds no independent evidence.
- `excluded_quality` — unreliable, thin, or search-optimized repetition.
- `included` — consulted and actually used in the published synthesis.

A search result, snippet, bibliography mention, AI recollection, or mirror title is not consultation. Never fabricate edition, publisher, date, rights, access, or claims.

The active bridge registry lives in ignored `research/working/bridge-source-registry.json`; its coverage report is beside it. Keeping it ignored prevents private access notes or later personally supplied holdings from becoming public repository history. Validate it with `npm run validate:sources -- research/working/bridge-source-registry.json`. The tracked fixture is intentionally non-substantive and is not the publication registry. The preserved Genesis calibration inventory remains private historical material rather than the active publication registry.

## Public-domain and open sources

Verify the exact edition/transcription and host terms. An old author does not make a modern translation, annotation, database, or transcription automatically public domain. Record license wording and allowed uses. Deduplicate mirrors and derivative aggregations against the underlying work.

For the foundational Matthew Henry pass, prefer CrossWire's exact `MHC` module version 2.2 (2022-08-29), whose module record states `Distribution License Public Domain`. Record that module and access date rather than treating every modern Matthew Henry PDF, website, or database as interchangeable. CCEL-generated files and other modern containers may carry separate formatting or distribution terms even when the underlying commentary is historical. The public-domain status permits local research use; it does not justify padding the synthesis with source-like wording or publishing a raw commentary library.

## Copyrighted modern works

- Do not bypass paywalls, DRM, authentication, rate limits, download controls, robots restrictions, or publisher terms.
- Personally supplied books/PDFs remain local research inputs, not distributable assets.
- Do not reproduce entries or source-like paraphrases. Synthesize across sources in original prose.
- Use a short quotation only when its wording itself matters; record source ID and word count.
- The validator flags raw-source fields and unusually long quotations, but human rights review is still required.

## ESV separation

ESV text has its own provider adapter/policy in `docs/ESV_INTEGRATION.md`. Commentary files may cite verse references and discuss ESV translation decisions, but may not persist the passage text.

## Publication gate

Before upload, a reviewer confirms source status, citation integrity, quote length, rights notes, source independence, theological framing, ESV separation, generated-content metadata, and the coverage report. A content hash and prior-version pointer are recorded. Only the individual approved reading is uploaded.
