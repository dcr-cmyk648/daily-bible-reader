# Content and rights policy

This project makes source use traceable and conservative; it does not declare that a use is legally authorized. The U.S. Copyright Office emphasizes that fair use is case-specific, balances four factors, and has no guaranteed word/percentage formula: <https://www.copyright.gov/fair-use/> (checked 2026-08-08).

## Storage boundaries

- Git/Pages: source, schemas, tools, safe bibliographic metadata, fabricated fixtures, and built code/style releases only. Pages never receives commentary, source notes/extracts, ESV wording, comments, or deployment configuration.
- Ignored local research workspace: lawfully accessed research inputs and working notes. Do not sync this folder to the friend or include it in logs/builds.
- Private Drive publication: original synthesis, source metadata, coverage report, and short justified quotations only. A reviewed Matthew Henry verse shard may additionally contain only the exact cited atoms from the selected public-domain edition for its **Read Henry** disclosure. The ignored portable audit store follows the same rule and declares `contains_scripture: false` plus `publication_status: not_published`; another app must keep it private and must not treat it as approved content. No ESV passages, embedded source-module Scripture transcription, or raw commentary library.
- Browser: the published synthesis, comments, reviewed citation-driven Henry disclosure, and ESV passage records only within the verified provider cache policy (500 verses total, half of a book, eight-day expiry, automatic eviction). ESV never enters a public artifact, export, Drive commentary file, log, or service-worker cache.

The approved permanent-library model does not broaden these boundaries: Drive may retain reviewed original study layers and restricted backups, but it may not retain ESV wording or raw copyrighted commentary/source libraries. A future reusable library record must preserve the same source metadata, rights review, hash, and revision history as its dated publication.

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

For the foundational Matthew Henry pass, prefer CrossWire's exact `MHC` module version 2.2 (2022-08-29), whose module record states `Distribution License Public Domain`. Record that module and access date rather than treating every modern Matthew Henry PDF, website, or database as interchangeable. CCEL-generated files and other modern containers may carry separate formatting or distribution terms even when the underlying commentary is historical. The exact CrossWire edition may support a narrowly scoped private **Read Henry** layer containing only the atoms cited for a condensation. Public-domain status still does not justify padding the synthesis with source-like wording, shipping the raw module or full normalized library, or treating another transcription as interchangeable.

The reviewed CrossWire archive retrieved 2026-08-10 has SHA-256 `6bcb936873ca144e317805e5c1677940fd86e2403f7c14517752e44f25c8882b`. It and every normalized source-text unit remain ignored. The SWORD module's embedded KJV transcription is hash-accounted for but excluded from model evidence and runtime disclosure. `MATTHEW_HENRY_PIPELINE.md` records the exact download URL, CCEL comparison, format assumptions, source atomization, and source-specific boundary controls.

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
