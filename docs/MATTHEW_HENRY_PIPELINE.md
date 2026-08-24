# Matthew Henry preprocessing pipeline

This is an offline, resumable source-preprocessing workflow. It never runs AI in the browser or Apps Script, never downloads ESV text, and never publishes commentary automatically. It supports four bounded uses:

- the preserved Genesis book-introduction/Genesis 1 Spark-versus-Luna calibration; and
- an autonomous Spark fact-ledger and prose pipeline for approved chapter calibrations;
- a schedule-aware Spark audit lane that resolves the active reading from today through at most two days ahead; and
- plan-generator activation and ensure-missing contracts that accept a start reading plus a bounded caller-selected count.

The rolling lane was first exercised on 2026-08-10 for D056–D058, then used under direct review for D059–D064 during the authorized T+7 fill. Generated Henry shards, audits, and portable-store files remain ignored and private; only hash-bound reviewed runtime layers may be attached to published reading metadata. Spark quota was unavailable for D065, so no model substitution occurred and that reading uses a verified link to the complete public-domain chapter commentary.

The deterministic `mhc-backfill-work-order/v1` queue revisits that kind of fallback after the daily T+7 study is safe. It selects at most one earliest published fallback through the Spark-first ensure contract. A coded Spark quota/model-unavailable error may retry only `gpt-5.6-luna` at low reasoning; validation, source, controller, and generic failures remain fail-closed. Sol, Terra, and every other model are forbidden. A successful artifact still passes complete atom-by-atom primary review before `sync-latest-mhc` replaces the fallback and the private metadata/manifest are republished atomically. The queue never changes the broader commentary synthesis.

## Selected source and rights record

The selected input is CrossWire's **Matthew Henry's Complete Commentary on the Whole Bible** SWORD module `MHC`, version 2.2, dated 2022-08-29. CrossWire describes it as `Public Domain--Copy Freely`, and the module configuration states `DistributionLicense=Public Domain`.

- Information: <https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=MHC>
- Exact archive: <https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/MHC.zip>
- Retrieved: 2026-08-10
- Archive SHA-256: `6bcb936873ca144e317805e5c1677940fd86e2403f7c14517752e44f25c8882b`
- Format: SWORD `zCom4`, OSIS, UTF-8, ZIP compression, book blocks, KJV versification

CCEL's work page and Volume I ThML/XML were also evaluated: <https://ccel.org/ccel/henry/mhc> and <https://ccel.org/ccel/h/henry/mhc1.xml>. CCEL has useful explicit Genesis divisions, but its container/reuse policy is more qualified. CrossWire was selected because its exact module has an explicit public-domain distribution license and its SWORD index preserves Henry's shared verse-range granularity.

The archive remains byte-for-byte unchanged at ignored `research/raw/matthew-henry/crosswire/MHC-2.2.zip`. `acquire` verifies its hash before extracting or parsing it. Source manifests, normalized text, prompts/outputs, review queues, reports, audits, and runtime shards remain under ignored `private-commentary/mhc/`. Neither private directory may enter Git or Pages.

## Deterministic normalization and atomization

`scripts/lib/mhc-pipeline.mjs` reads the SWORD 12-byte block and verse indexes, inflates the book blocks, maps all 66 OSIS book IDs to the app's canonical IDs, and groups adjacent verse entries that share the same block/offset/length. It does not assume that an index entry is a distinct verse comment.

Normalized units conform to `mhc-normalized-source/v3` in `schemas/mhc-normalized-source.schema.json`. Each unit preserves the complete private source text and hash, but divides the actual commentary into stable, exact heading/paragraph atoms with their own IDs, order, type, text, and SHA-256. The KJV transcription embedded by the SWORD module is retained only in the private normalized source for provenance. It is excluded from worker evidence and from the runtime source layer; its exclusion is hash-recorded.

Short, non-display anchor terms are deterministically extracted for each indexed verse from that excluded transcription. They are supplied only to help the worker center a condensation on the target verse when Henry treats a range together. They are never rendered as Scripture or carried into the runtime shard.

Genesis 1 has ten shared/single source ranges. Nahum 1 has a chapter introduction plus the indexed verse treatments `1`, `2–8`, and `9–15`. A derived verse retains its real supporting range. Natural overlap between adjacent verse condensations inside one shared Henry treatment is acceptable; the validator does not demand a repetitive range disclaimer in every blurb. The runtime instead presents a quiet `From` label and the exact cited source layer.

The first Genesis preverse also contains volume, book, and chapter material. `config/mhc-source-boundaries.json` hash-locks the reviewed `gen15`–`gen19` book-introduction milestones for this exact archive. The typed chapter introduction is normalized separately. Remaining volume-preface material is preserved in the private exception file rather than guessed into either introduction. Other books without a reviewed opener boundary preserve preverse material as an explicit exception.

## Autonomous Spark contract and validation

The current autonomous mode is `spark-autonomous-chunked-two-stage/v4`. It uses `mhc-fact-extractor/v8` followed by `mhc-autonomous-writer/v5`; chapter output remains `mhc-commentary/v2`. The first rolling-window audit exposed over-extracted source rhetoric, weak agency, unrelated shared-range details, archaic residue, and ledger-like prose. Fact v8 permits at most three material facts, favors the treatment's interpretive conclusion over setup detail, rejects source-reporting scaffolds and peripheral maxims, and protects named actors. The controller derives verse relevance from the nearest explicit source marker instead of trusting the model's label. Writer v5 then performs a strict plain-English coherence pass without inventing links between separate agents, while admission rejects common archaic residue. `mhc-worker/v11` and the older output schema remain only for preserved calibration/review artifacts.

The two stages deliberately separate grounding from prose:

1. Spark receives normalized commentary atoms plus stable controller-generated evidence snippets and emits `mhc-fact-brief/v2`. Every fact selects one exact snippet, preserves agency, identity, relationship, historical detail, application, alternative, and qualification, and marks facts whose omission would materially weaken the verse summary.
2. The controller replaces Spark's evidence transcription with the canonical selected snippet, derives compact ordinary-word anchors, and protects exact names, roles, and qualification cues. It rejects ungrounded facts, missing target-marked atoms, unsupported names, or incomplete explicit identities/relationships.
3. The prose-stage view keeps the validated fact statements, short anchors, qualifications, and atom IDs but strips `evidence_quote` and `source_snippet_id`. Exact Henry text remains in the stored audit/source layer and is not shown to the writer. This lets Spark paraphrase freely while preserving a direct route back to Henry.
4. Spark writes direct abridged prose. Deterministic validation supplies exact repair errors; a failed multi-verse chunk falls back to independently resumable verse chunks. A zero-error, zero-warning draft is admitted unchanged. The removed extra self-review rewrite had regressed already-valid drafts and is not part of v4.

The final contract requires:

- exactly one concise record for every requested verse;
- direct condensed authorial prose, without “Henry says,” source-reporting language, or commentary about the generation process;
- preservation of reader-useful concrete facts, especially an explicit identification of an otherwise unnamed figure, with exact spelling and relationships retained;
- the exact allowed shared-range label;
- one or more exact `source_atom_id` citations that materially support the blurb;
- no claim imported from another indexed source range; and
- no reconstruction or quotation of the excluded embedded Scripture transcription.

The controller deterministically checks schema conformance, exact verse completeness, duplicates/extras, source-unit coverage, coverage types, exact atom existence and parent linkage, range labels, provenance/job metadata, length, suspicious twelve-word source overlap, unsupported names/concepts, explicit identity and role preservation, and prohibited source-reporting wording. It rejects direct or indirect narration of Henry/the source and scaffolds such as a passage that “asks,” “introduces,” “treats,” or “describes”; ordinary direct claims such as “his power is shown” are not misclassified as source reporting. Proper names remain exact, while ordinary one-word grammatical inflections may satisfy an anchor. Any warning becomes an autonomous-admission error. Model-valid JSON remains `unreviewed` until direct human comparison with its cited atoms.

The compact private runtime conforms to `mhc-runtime/v1`. It contains only the cited commentary atoms, deduplicated and hash-linked, under the label `Matthew Henry — condensed paraphrase`. Tapping a verse performs an in-memory lookup. Expanding **Read Henry** reveals the exact public-domain atom or atoms used for that condensation, with a notice that the embedded Scripture transcription was omitted. There is no per-click server request and no runtime AI.

## Authentication and controller behavior

The controller requires `codex login status` to report a ChatGPT login and refuses an API-key state. Each invocation starts with exact `gpt-5.3-codex-spark`; only coded `SPARK_QUOTA_UNAVAILABLE` or `SPARK_MODEL_UNAVAILABLE` failures can retry exact `gpt-5.6-luna` with `model_reasoning_effort=low`. One confirmed availability failure latches Luna for the remaining missing targets in that batch, while a later invocation probes Spark again. Validation, source, controller, and generic failures never fall back. Sol, Terra, and every unspecified model are blocked. Worker invocations are noninteractive, ephemeral, read-only, sequential, standard-speed, and disable both multi-agent feature flags. Actual Spark/Luna provenance is recorded per fact brief, writer, runtime, reading, catalog, receipt, and review audit; immutable mixed-model artifacts remain valid. Final JSON is written to an explicit fingerprinted private path and validated after every job.

The writer fingerprint includes source hash, prompt/schema/model versions, autonomous mode, fact-prompt version, and exact fact-brief hash. Validated fact-ledger caching is independent of downstream writer-admission revisions, so a prose-prompt change does not spend worker budget re-extracting unchanged facts. A restart skips only a completed result whose current bytes still validate. Changed inputs create a new directory; prior attempts remain preserved. Transient process failures use bounded retries, and invalid structured drafts receive at most the configured bounded validation-guided repairs. The retained `spark-*` autonomous schema/version identifiers are compatibility labels; each artifact’s `worker_model` remains the authoritative actual provenance.

Human corrections remain a separate, explicit review layer. The autonomous Spark chapter path rejects the legacy `review-overrides.json`; recurring failures must be addressed by a general controller/prompt revision and a new versioned run. After direct comparison with every cited atom, `mhc-schedule-review/v1` may record an isolated replacement blurb and its reason. That correction is hash-bound to the exact unreviewed runtime, may name only an existing verse, leaves citations/ranges/source atoms untouched, and is listed in the audit's corrected verse IDs. It is therefore review provenance, not a silent mutation. Older schedule-local overrides remain preserved for legacy jobs only.

## Rolling two-day-ahead Spark lane

`schedule-window` resolves the inclusive active-plan window from the Detroit civil date through two days ahead. `--days-ahead` accepts only `0`, `1`, or `2`; two is the default interactive maximum. A caller may instead pass `--reading-count 1..14`. The older `schedule-next` command remains a compatible single-reading tool whose offset accepts only `0` or `1`. These paths:

1. reject book/chapter/corpus selectors and any model other than exact `gpt-5.3-codex-spark`;
2. resolves the active scheduled reading rather than accepting an arbitrary passage;
3. requires a chapter reading and validates every scheduled passage and verse count against the indexed Henry source;
4. normalizes, generates, validates, and exports each scheduled chapter sequentially;
5. write a machine-readable audit plus a Markdown comparison containing every condensation and its exact cited Henry atoms; and
6. leave the reading's main commentary, publication status, Drive content, and deployed app unchanged.

The audit preserves human findings across a same-prompt rerun and stays `unreviewed` until approval is recorded. Range bleed within one indexed Henry treatment is a review judgment, not an automatic defect. Cross-range drift, invented distinctions, copied wording, and unsupported named concepts remain defects.

After every target succeeds, the controller writes an app-neutral, checksum-addressed exchange window under `private-commentary/mhc/stores/current-window/`. `manifest.json` declares `mhc-window-store/v1`, the requested count, plan/window/model/prompt, `contains_scripture: false`, `publication_status: not_published`, review states, and each reading file's relative path and SHA-256. Each `mhc-portable-reading/v1` file embeds one or more validated `mhc-runtime/v1` chapter shards.

The same immutable reading bytes are merged into `stores/library/plans/<plan-key>/` and indexed by `mhc-library-catalog/v1`. `stores/library/current.json` points to the complete current-plan catalog and hashes its exact bytes. A later one-reading request replaces only that reading's catalog pointer; it never drops other retained readings or deletes an older content-addressed version. Reading objects are written first, then the catalog, pointer, and request-window manifest are replaced atomically. An interrupted or unavailable worker therefore leaves the last complete catalog/pointers readable.

## Plan-generator activation contract

The main content generator activates Henry with `mhc-activation-request/v1`, validated by `schemas/mhc-activation.schema.json`. The caller controls only the plan version, stable start reading, and amount of consecutive plan content. It cannot choose arbitrary chapters, an output directory, publication status, prompt, corpus mode, or a substitute model.

```json
{
  "schema_version": "mhc-activation-request/v1",
  "request_id": "celebration-20260810-d056-count3-v1",
  "plan_version": "celebration-y3q4-bridge-2026-v1",
  "requested_by": "reading-plan-content-generator",
  "start_reading_id": "CC-Y3Q4-D056",
  "reading_count": 3,
  "worker_model": "gpt-5.3-codex-spark",
  "reason": "Prepare the next three plan readings for private review."
}
```

Invoke it with:

```sh
npm run mhc:activate -- --request /absolute/or/repository-relative/request.json
```

`--dry-run` validates and resolves the exact reading IDs without writing or contacting the worker. A successful real run writes the validated request plus an `mhc-activation-result/v1` receipt containing the produced reading IDs and hashes for both the request-window manifest and durable catalog. The generator can consume that receipt rather than parsing human log output.

This is a prepublication handoff. After editorial approval, the broader content process embeds the approved runtime shard in the private reading payload and publishes that payload through the existing Drive/manifest workflow. The deployed app reads those stored payloads and its bounded IndexedDB snapshot; it never calls this controller or Codex. If Codex is unavailable, a new activation fails without replacing the last good catalog/window, while already published and downloaded readings continue to work.

## Main-thread ensure-missing contract

The ordinary content-generation thread should use `mhc-ensure-request/v1` when it needs a bounded plan range to exist but does not want to regenerate sound stored readings. The request fixes the plan, start reading, count from 1 through 14, exact Spark model, current autonomous mode, and `only_if_missing: true`.

```json
{
  "schema_version": "mhc-ensure-request/v1",
  "request_id": "main-thread-current-three-20260811",
  "plan_version": "celebration-y3q4-bridge-2026-v1",
  "requested_by": "reading-plan-main-thread",
  "start_reading_id": "CC-Y3Q4-D056",
  "reading_count": 3,
  "worker_model": "gpt-5.3-codex-spark",
  "generation_mode": "spark-autonomous-chunked-two-stage/v4",
  "only_if_missing": true
}
```

```sh
npm run mhc:ensure -- --request /path/to/mhc-ensure-request.json

# Inspect the one-reading published-fallback backfill queue.
npm run mhc:backfill:next
```

The controller verifies the catalog pointer, catalog hash/schema, immutable reading hash/schema, chapter runtime, and exact requested plan membership before treating a reading as available. It invokes Spark first only for missing or invalid targets, with the narrow coded availability fallback to Luna-low, merges successful results into the durable catalog without replacing the latest rolling-window manifest, verifies the complete requested set again, and writes `mhc-ensure-result/v1`. If every reading already exists, no model call occurs. If generation fails or Codex is unavailable, prior stored and published content remains intact.

### Nahum 1 troubleshooting result

The final autonomy calibration on 2026-08-11 used fact prompt v5, writer prompt v2, and mode v4. Nahum 1 produced fifteen valid records with zero warnings and one automatic writer-chunk fallback; 1 Peter 5 supplied a structurally different fourteen-verse test and passed with zero warnings and no writer fallback. Both runs used exact Spark for fact extraction, prose, and bounded error repair, and both record `human_override_applied: false`. The prose model never received exact evidence snippets. Nahum 1:11 directly identifies Sennacherib and Rabshakeh as his spokesman and retains the Assyrian surrender counsel and Hezekiah detail. These calibration jobs remain ignored, private, unreviewed, and unpublished.

The durable D057 localhost catalog still points to the separately reviewed v11 derivative described below. The v4 calibration was intentionally not substituted for that review artifact merely because it validated.

The D057 audit now exercises prompt v11 and the review layer. Earlier attempts established range anchoring and explicit identity preservation. A first complete-chapter v10 redraft exposed broader indirect reporting constructions; v11 turned those constructions into hard failures and added an explicit agency-preservation instruction. The controller rejected the raw v11 result after bounded repairs still left “is shown,” “the image teaches,” “is treated,” and “the note warns,” plus two names outside the selected atoms. Every rejected attempt remains preserved privately.

A hash-bound `in_review` derivative now replaces the prose for all fifteen verses while leaving the raw v11 output and every citation, range, and metadata field unchanged. The review restores reader-useful details across the chapter: Nahum's Elkoshite background and Nineveh's earlier Jonah reprieve; the Chaldean judgment of Assyria; Sennacherib, Rabshakeh, Hezekiah, Jerusalem, and the Assyrian appeal; the destroying angel; the alternative readings of Sennacherib's death, idols, grave, and empire; and the Isaiah/apostolic use of the peace-messenger language. Verse 11 retains the user-approved direct identification of Sennacherib as the wicked counsellor from Nineveh and Rabshakeh as his spokesman. All fifteen records validate with zero warnings, contain no embedded Scripture transcription, and remain unapproved and unpublished.

The D056 and D058 results are also `in_review`. D056 requires a source-copy edit at verse 6, correction of the awkward/unsupported construction at verse 11, and softening of a small exclusivity overstatement at verse 5; its verse-12 `church` warning was judged acceptable contextual shorthand. D058 is otherwise well grounded, with one rhetorical comparison at verse 10 to soften before approval. Natural reuse of one exact Henry range across neighboring verses was explicitly accepted and is not repeated as a warning on every record.

## Commands

```sh
# Verify/download the exact archive.
npm run mhc:acquire

# See the inclusive active window without writing anything.
npm run mhc:window:dry-run

# Generate/resume today through two days ahead and atomically export the private store.
npm run mhc:window:spark

# Let the reading-plan generator choose the starting reading and amount.
npm run mhc:activate -- --request /path/to/mhc-activation-request.json

# Let the main thread verify durable readings and generate only missing targets.
npm run mhc:ensure -- --request /path/to/mhc-ensure-request.json

# Re-run the two current autonomous calibration chapters.
npm run mhc:autonomy:nahum
npm run mhc:autonomy:1peter5

# Optional narrower single-reading compatibility lane.
npm run mhc:next:dry-run
npm run mhc:next:spark

# Reproduce a civil-date selection without changing the system clock.
node scripts/mhc-pipeline.mjs schedule-next --today 2026-08-10 --days-ahead 1 --dry-run

# Preserved Genesis calibration commands.
npm run mhc:normalize:genesis-1
npm run mhc:preflight
npm run mhc:pilot:dry-run
npm run mhc:pilot
npm run mhc:validate:luna
npm run mhc:export:luna
```

Expected private locations:

- Normalized units: `private-commentary/mhc/normalized/<BOOK>/<CHAPTER>.jsonl`
- Exceptions: `private-commentary/mhc/exceptions/<BOOK>/<CHAPTER>.jsonl`
- Raw worker outputs: `private-commentary/mhc/jobs/<BOOK>-<CHAPTER>/<model>/<fingerprint>/raw-output.json`
- Validated fact ledgers: `private-commentary/mhc/fact-briefs/<BOOK>-<CHAPTER>/<model>/<fingerprint>/fact-brief.json`
- Schedule audit: `private-commentary/mhc/schedule/<readingId>/audit.{json,md}`
- Human review overrides: `private-commentary/mhc/schedule/<readingId>/review-overrides.json`
- Preserved raw/reviewed job pair: `private-commentary/mhc/jobs/<BOOK>-<CHAPTER>/<model>/<fingerprint>/{raw-output,reviewed-output}.json`
- Runtime chapter: `private-commentary/mhc/runtime/<BOOK>/<CHAPTER>.json`
- Portable current-window manifest: `private-commentary/mhc/stores/current-window/manifest.json`
- Portable reading: `private-commentary/mhc/stores/current-window/readings/<readingId>.<hash-prefix>.json`
- Durable catalog pointer: `private-commentary/mhc/stores/library/current.json`
- Durable per-plan catalog/readings: `private-commentary/mhc/stores/library/plans/<plan-key>/`
- Activation request/result: `private-commentary/mhc/stores/activations/<request-key>/{request,result}.json`
- Ensure receipt: `private-commentary/mhc/stores/ensure-requests/<request-key>/result.json`
- Genesis comparison: `private-commentary/mhc/reports/GEN-001-spark-vs-luna.{json,md}`

For a localhost audit, run `npm run dev`, open `http://127.0.0.1:4173/app/frontend/?privateDraft=1`, select a generated schedule day, open Scripture, tap a verse, and expand **Read Henry**. The server exposes the retained catalog at `/__mhc/library/catalog.json` and a reading at `/__mhc/library/readings/<readingId>.json`; `/__mhc/window/` exposes only the most recent request. It verifies catalog/reading hashes and prefers the durable library when attaching a shard. The private adapter accepts only active bridge IDs, sends `no-store`, and is stripped from production builds. The separate `?mhcPilot=1` route preserves the inactive Genesis calibration.

## Full-corpus lock and limitations

No broader generation was run. A future full-corpus invocation is rejected unless both explicit flags are present. Even then, it processes only normalized, reviewed batches that already exist, sequentially:

```sh
node scripts/mhc-pipeline.mjs generate --all --confirm-full-corpus --model gpt-5.6-luna
```

Do not run that command merely because a bounded pilot succeeded. SWORD uses KJV versification, so later canon/versification differences require deterministic exceptions or mappings rather than guesses. Shared-range source treatment can produce overlapping adjacent blurbs by design. Source-specific introduction boundaries must be reviewed and hash-locked per edition/book. The exact excerpt layer is a narrow, citation-driven disclosure for this public-domain edition; it is not permission to publish the raw commentary corpus as an app asset.
