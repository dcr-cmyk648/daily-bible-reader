# Commentary research and publication workflow

The synthesis is a prepublication artifact, never a runtime AI response. Work one reading at a time. The temporary Celebration bridge permits only `CC-Y3Q4-D054` through `CC-Y3Q4-D060`; Dustin individually authorized D057 (Nahum 1) on 2026-08-10, so D054–D057 may contain substantive main syntheses. D058–D060 remain main-commentary placeholders. The separately requested rolling D056–D058 Matthew Henry verse window is an ignored review aid, not a replacement synthesis or automatic publication. D057's human-corrected 15-verse result was separately attached after review; this does not authorize a D058 main synthesis, D059, or D060 generation.

Scheduled preparation uses the repo-local `$draft-daily-commentary` skill only after `scripts/content-automation.mjs work-order` emits a validated `commentary-work-order/v1` packet from an explicitly enabled private policy. The packet authorizes one ignored `unreviewed` staging draft and nothing else. The status evaluator, work-order generator, and skill are separate gates; none can publish.

Keep this complete workflow in the primary task: source discovery and consultation, rights decisions, evidentiary weighting, synthesis, editing, citation verification, validation, and publication handoff. Do not delegate the main daily synthesis to Spark. The exact authenticated `gpt-5.3-codex-spark` model is reserved for the separate mass verse-by-verse Matthew Henry condensation lane in `MATTHEW_HENRY_PIPELINE.md`. D057's preserved Spark-assisted draft is a one-off calibration and does not authorize the same method for D058 or later readings.

## 1. Create the reading workspace

Instantiate the reading metadata from `commentary.schema.json`. Record reading ID, schema/workflow version, planned categories, generation/tool/model metadata if applicable, and human review status `unreviewed`. Do not copy ESV text into the workspace.

## 2. Search broadly and inventory honestly

Search deliberately across classics, open notes, contemporary academic work, technical/pastoral commentary, Hebrew/textual work, ancient Near Eastern studies, literary analysis, Jewish reception, patristic/Catholic/Orthodox traditions, diverse Protestant traditions, archaeology/history, theology-and-science, reference works, journal/book chapters, institutional lectures, and serious dissenting or qualifying sources.

Add every meaningful lead to the registry immediately with its exact edition, URL/citation, access date/method, status, rights, independence/duplication notes, quality tier, methodological assumptions relevant to the reading, and intended role: exegesis, historical context, linguistic evidence, reception, or counterposition. For new modern sources, verify and record `affiliationContext` and `synthesisPriority` when possible. Non-Christian or non-church-affiliated work ordinarily serves language, text, archaeology, or historical context; include its contrary interpretation only when the claim is both substantially influential and materially important to the passage. Do not use an arbitrary small source cap. Continue while new sources add evidence, method, perspective, disagreement, or reception history; stop when additions are substantially derivative, inaccessible, low quality, or merely another minor objection. Count independent works, not mirrors.

Matthew Henry's *Complete Commentary on the Whole Bible* is the default foundational commentary for both chapter studies and relevant book introductions. Begin the commentary pass there for its sustained confessional, pastoral, and practical reading, then build outward with independent grammatical, textual, historical, literary, canonical, theological, reception-historical, and contemporary technical work. “Foundational” does not mean controlling every conclusion, replacing close exegesis, or counting Henry as evidence for modern linguistic, archaeological, scientific, or text-critical claims. Record the exact consulted edition. The preferred current research input is CrossWire's `MHC` module version 2.2 (2022-08-29), which CrossWire labels **Public Domain—Copy Freely**; remember that Henry himself completed the work only through Acts and that later material was completed by associates. Raw module text may remain in the ignored local research workspace but is not copied into Git, Pages, logs, or the main synthesis. A private review/runtime shard may carry only the exact public-domain commentary atoms actually cited by a condensation so the reader can expand **Read Henry**; it never carries the embedded Scripture transcription or a raw commentary library. Source and rights record: <https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=MHC> (checked 2026-08-10).

The deterministic preprocessing/controller contract is in `MATTHEW_HENRY_PIPELINE.md`. It preserves CrossWire's shared verse ranges, atomizes exact commentary paragraphs, excludes embedded Scripture transcription from worker/runtime data, keeps the Genesis opener as a book-level resource, and validates every derived record against its exact cited atoms. Verse condensations use short direct authorial prose rather than “Henry says” reporting. Natural overlap within a shared Henry range is acceptable when each verse remains reasonably centered; cross-range imports are not. A model-valid JSON file remains `unreviewed` until a person compares it directly with the cited atoms; it is not publication-ready merely because the controller completed.

The current ignored pilot inventory is validated independently of tracked fixtures:

```sh
npm run validate:sources -- research/working/bridge-source-registry.json
```

Passing validation proves status/metadata consistency, not that a source has been read deeply enough or should be used. Move a record to `included` only after claim-level notes, drafting, and rights review; `includedReadings` must stay empty before then.

The registry version identifies the exact inventory used for new work. When an expanded registry is strictly additive and preserves every older source record unchanged, list the prior inventory in `compatibleSourceSetVersions`; existing readings can then retain honest generation provenance without a metadata-only rewrite. Never declare compatibility after removing or materially changing an older record.

## 3. Consult and take claim-level notes

Move a source from `discovered` only after actual access. Notes should capture original claims in paraphrase, relevant scope, interpretive position, evidence, limitations, relationships to other sources, and only indispensable short quotations with word counts. Raw copyrighted text stays in the ignored local workspace.

## 4. Draft in layers

Apply the confessional and steelman-and-assess method in `EDITORIAL_STANCE.md`. The ordinary grammatical, literary, and historical sense is the starting posture, while genre and textual signals determine when metaphor, symbolism, or other figures are present. Scripture's presentation of prophecy, miracle, divine action, and explicit attribution remains the working presumption unless very strong positive evidence independent of anti-supernatural assumptions displaces it. Present strong, widespread alternatives fairly before explaining the preferred assessment; do not manufacture neutrality or spend the reader's time on fringe catalogues.

The daily surface is concise but not compressed, assumes expert readers, and appears in this order:

1. One- or two-paragraph orientation (maximum 150 words).
2. ESV reading for a chapter day.
3. One coherent commentary summary in continuous prose, normally 250–600 words and never more than 700. Use as many paragraphs as the argument needs; do not manufacture a numbered or titled point count.
4. One representative verse-of-the-day reference selected from the configured reading; never copy its ESV wording into metadata.
5. One-sentence, passage-specific action or diagnostic for today (maximum 32 words).
6. Passage-specific deep-study sections and the research audit, each collapsed by default and placed below the discussion controls.

Publication metadata must support the three-page reader without generating separate content copies: `dailyIntroduction` feeds page 1; the server-delivered ESV chapter feeds page 2 for chapter readings; `overview` feeds page 2 on a book-introduction day; and `commentarySummary`, `verseOfTheDay`, `practicalTakeaway`, `comprehensiveSynthesis`, and coverage/source metadata feed page 3. `verseOfTheDay` contains only `bookId`, `chapter`, and `verse`; validation requires it to fall inside that reading's configured passages. At runtime the browser isolates the exact verse from the live ESV chapter already in memory, shows ESV identification, the required notice, and an ESV.org link, and fails without substitution if Scripture is unavailable. `commentarySummary.paragraphs` is one editorial unit, not a list of independent insight cards. In `commentary/v3`, place `{{cite:source_id,source_id}}` immediately after each supported claim; every marker ID must appear in that paragraph's `sourceIds`, and every declared ID must appear in a marker. The reader numbers sources by first appearance and resolves every marker to one compact source-note list below the article. Comments remain attached once to the reading ID and are not duplicated per page.

The orientation, main synthesis, and takeaway use dedicated `dailyIntroduction`, `commentarySummary`, and `practicalTakeaway` metadata. Every notable commentary claim there must have adjacent links through `sourceIds` to exact consulted registry records. The selected verse is traced directly to Scripture through its validated reference, not a commentary source ID.

Draft for readers who already know the biblical narrative and standard doctrinal vocabulary. Use that shared knowledge to avoid remedial explanation, not to justify pretentious diction or tightly packed jargon. Prefer plain precision, natural transitions, and paragraphs with one clear movement. Do not summarize sources serially; collate the strongest evidence, shared conclusions, and important disagreements into one passage-driven argument. Source breadth does not imply equal epistemic weight. The daily main article cites the sources that materially help interpret and apply the passage under the stated stance; it must not force every included contextual or counterposition source into the main path. Every included source must contribute materially somewhere in the complete published synthesis or research audit, while exhaustive detail and source distribution belong in the collapsed deep study.

When a source-critical conclusion relies partly or wholly on treating predictive prophecy, miracle, divine action, or explicit authorship as implausible, identify that premise rather than reporting the conclusion as neutral history. Distinguish the source's observable evidence from its reconstruction. Widespread naturalistic theories may receive a strong, concise account in a custom deep-study section when relevant, but the synthesis gives them authority only in proportion to positive evidence that survives the app's confessional premise. Use a tight evidence–traditional-response–assessment sequence, identify the actual proponent through an adjacent citation, and do not repeat the same background dispute chapter after chapter unless the day's text materially raises it.

Published prose never discusses these editorial instructions, “the rules,” source quotas, model behavior, or the generation workflow. It simply states the evidence, the strongest responsible alternatives, and the resulting Christian judgment in normal authorial prose.

Treat every displayed unit as independently useful within the day's reading. The orientation, each summary paragraph, the takeaway, and the comprehensive synthesis must identify enough of its own subject to stand alone. Avoid backward/forward pointers that require another app section. If `contextReadingIds` identifies a genuinely relevant prior day, briefly restate the needed event, argument, or prophetic sequence and then show how today's text advances it. Make the payoff explicit: show how the material changes interpretation or a concrete response, while refusing generic application that could be attached to any passage.

The comprehensive synthesis is one coherent Markdown source document whose level-three headings are organic to that passage; do not force every reading through a fixed twelve-section template. At runtime, each heading becomes a separately collapsed deep-study section so the reader can scan the titles and open the relevant line of inquiry. The document should still cover the literary, historical, linguistic, theological, canonical, reception, disagreement, practical, and research-limit material that is genuinely useful, but its structure should follow the argument of the text. The research audit and complete source list have their own final disclosure.

The Genesis introduction must also cover the Pentateuch/Torah, authorship/composition/final form, uncertainty and dating, toledot structures, primeval/patriarchal divisions, covenant/blessing/land/offspring/presence, archaeology/history, chronology rationale, and a chapter roadmap without later chapter commentary.

Genesis 1 must distinguish the creation pattern, Hebrew/syntax/textual questions, ancient cosmology and comparative texts, image/dominion/male-and-female, creation-days positions, scientific harmonizations versus exegesis, ex nihilo in chapter/canon/theology, reception, canonical links, and popular claims needing qualification. The ordinary-day reading is the pilot's starting assessment, but strong framework, analogical, day-age, functional, and other substantial views must be presented and tested on their actual evidence rather than dismissed. Broader scientific models remain distinct from what the text directly states.

## 5. Connect claims to sources

Important claims carry source IDs. Orientation citations remain explicit links; main-summary citation markers render as unobtrusive numbers exactly where the supported claim appears, and the takeaway retains a compact end citation. Both resolve to one numbered source list. Every cited ID must exist and be `consulted` or `included`; sources merely discovered/inaccessible cannot support a claim. Consensus language requires broad, substantially independent support. Use bounded wording such as “Across the sources consulted…” and identify source-set limits.

## 6. Produce the coverage report

Record represented/missing categories, independent consulted/included counts, main disagreements, single-source claims, inaccessible candidates, excluded duplicates/quality/rights, and remaining uncertainty. A high raw count is not a quality metric.

## 7. Validate and review

Run schema/referential/rights/safety checks. Human review covers accuracy, consistency with the stated editorial stance, fair representation of important alternatives, source breadth, traceability, quotation risk, length, readability, and whether summary prose could substitute for a source. It explicitly asks whether any conclusion gained authority mainly because a source assumed prophecy, miracle, or divine action was impossible or intrinsically unlikely. Set the review status and record reviewer/date/notes. Compute a content hash only after validation.

For the ignored bridge workspace:

```sh
node scripts/validate-source-registry.mjs research/working/bridge-source-registry.json
node scripts/validate-private-content.mjs --require
```

The private validator requires exactly the seven bridge readings, `commentary/v3` with one comprehensive Markdown synthesis for the four individually authorized substantive days, legacy `commentary/v2` fixed-section placeholders for the three ungenerated days, matching content hashes, multiple independent sources in each substantive main synthesis, every included source represented across the complete substantive package, accurate single-source flags, and no likely stored ESV passage or unsafe raw HTML.

## 8. Publish one reading

Build a private bundle containing the Markdown synthesis, metadata, source registry, coverage report, and file hashes—never ESV, credentials, or raw source text:

```sh
npm run bundle:private
```

The output is ignored at `private-content/bundles/pilot-review/`; its manifest remains `approvedForPublication: false`. Building the bundle is not publication. Upload only after explicit approval, update the private manifest for that reading, retain a private prior version, and test both authorized accounts. Regenerating one reading must not require rebuilding unrelated readings.

Before publication, the ignored drafts can be rendered through the localhost-only development server with `?privateDraft=1`. When the bounded private window store contains a matching reading, this route verifies its checksum and may attach its unreviewed verse shard solely for local troubleshooting; legacy per-reading audits remain a fallback. The store contains no Scripture and is also available through localhost-only manifest/reading JSON routes for a future private consumer. This preview path exists for content and mobile review and is removed from production builds.

## Review checkpoint

After D057, stop unless the user explicitly authorizes another reading. The current main-synthesis authorization ends at D057. D057's attached Henry layer remains `in_review`; the D056 and D058 layers remain private and unattached. None of them authorizes a D058 synthesis, D059–D060, recurring publication, or the complete chronology. The preserved Genesis calibration and this bridge inform the later launch plan, but every additional commentary reading still requires the one-reading gate.
