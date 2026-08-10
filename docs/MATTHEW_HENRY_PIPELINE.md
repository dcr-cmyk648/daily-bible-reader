# Matthew Henry preprocessing pipeline

This is an offline, resumable source-preprocessing workflow. It never runs AI in the browser or Apps Script, never downloads ESV text, and never publishes commentary automatically. It supports two bounded uses:

- the preserved Genesis book-introduction/Genesis 1 Spark-versus-Luna calibration; and
- a schedule-aware Spark audit lane that resolves the active reading from today through at most two days ahead.

The rolling lane was explicitly exercised on 2026-08-10 for `CC-Y3Q4-D056` (1 Peter 5), `CC-Y3Q4-D057` (Nahum 1), and `CC-Y3Q4-D058` (Nahum 2). D057 now has a separately published multi-source main draft, while D058 retains its main-commentary placeholder. Every generated Henry shard, audit, and portable-store file remains ignored, private, and unapproved; none is automatically attached to the main draft, and D059 was not generated.

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

## Worker contract and validation

The active prompt is `prompts/mhc-worker-v4.md`. Chapter output uses `mhc-commentary/v2`; the prior v1 schema remains available only to revalidate preserved Genesis jobs.

The active contract requires:

- exactly one concise record for every requested verse;
- direct condensed authorial prose, without “Henry says,” source-reporting language, or commentary about the generation process;
- the exact allowed shared-range label;
- one or more exact `source_atom_id` citations that materially support the blurb;
- no claim imported from another indexed source range; and
- no reconstruction or quotation of the excluded embedded Scripture transcription.

The controller deterministically checks schema conformance, exact verse completeness, duplicates/extras, source-unit coverage, coverage types, exact atom existence and parent linkage, range labels, provenance/job metadata, length, suspicious twelve-word source overlap, selected unsupported named concepts, and prohibited “Henry” wording. Model-valid JSON remains `unreviewed` until direct human comparison with its cited atoms.

The compact private runtime conforms to `mhc-runtime/v1`. It contains only the cited commentary atoms, deduplicated and hash-linked, under the label `Matthew Henry — condensed paraphrase`. Tapping a verse performs an in-memory lookup. Expanding **Read Henry** reveals the exact public-domain atom or atoms used for that condensation, with a notice that the embedded Scripture transcription was omitted. There is no per-click server request and no runtime AI.

## Authentication and controller behavior

The controller requires `codex login status` to report a ChatGPT login and refuses an API-key state. It checks the installed model catalog and never substitutes an unrequested model. Worker invocations are noninteractive, ephemeral, read-only, sequential, standard-speed, and disable both multi-agent feature flags. Final JSON is written to an explicit fingerprinted private path and validated after every job.

The fingerprint includes source hash, prompt version, output schema version, and requested model. A restart skips only a completed result with the same fingerprint that still validates. Changed inputs create a new directory and mark a prior completed manifest record superseded; an approved output is not overwritten. Transient failures receive at most two retries by default with bounded exponential backoff.

## Rolling two-day-ahead Spark lane

`schedule-window` resolves the inclusive active-plan window from the Detroit civil date through two days ahead. `--days-ahead` accepts only `0`, `1`, or `2`; two is the default and hard maximum. The older `schedule-next` command remains a compatible single-reading tool whose offset accepts only `0` or `1`. Both paths:

1. rejects book/chapter/corpus selectors and any model other than exact `gpt-5.3-codex-spark`;
2. resolves the active scheduled reading rather than accepting an arbitrary passage;
3. requires a chapter reading and validates every scheduled passage and verse count against the indexed Henry source;
4. normalizes, generates, validates, and exports each scheduled chapter sequentially;
5. write a machine-readable audit plus a Markdown comparison containing every condensation and its exact cited Henry atoms; and
6. leave the reading's main commentary, publication status, Drive content, and deployed app unchanged.

The audit preserves human findings across a same-prompt rerun and stays `unreviewed` until approval is recorded. Range bleed within one indexed Henry treatment is a review judgment, not an automatic defect. Cross-range drift, invented distinctions, copied wording, and unsupported named concepts remain defects.

After every target succeeds, `schedule-window` writes an app-neutral, checksum-addressed exchange store under `private-commentary/mhc/stores/current-window/`. `manifest.json` declares `mhc-window-store/v1`, the plan/window/model/prompt, `contains_scripture: false`, `publication_status: not_published`, review states, and each reading file's relative path and SHA-256. Each `mhc-portable-reading/v1` file embeds one or more validated `mhc-runtime/v1` chapter shards. Reading filenames include a hash prefix and the manifest is replaced last, so an interrupted run cannot point consumers at a partially replaced window. Old unreferenced private files are harmless and are not deleted automatically.

### Nahum 1 troubleshooting result

The bounded D057 exercise preserved three fingerprinted Spark attempts:

- The first structurally valid result exposed material verse drift within Henry's `9–15` treatment.
- The anchor-aware revision corrected the verse centering but was safely rejected after changing the required shared source label.
- Prompt v4 preserved the exact range label and produced 15 valid records with no deterministic warnings.

Human review confirms that the final records cite only atoms from their indexed ranges, use direct condensed authorial voice, and contain no embedded Scripture transcription. It remains `in_review`, not approved: verses 5 and 14 need copy edits, and one slightly abstract phrase in verse 11 needs a final judgment. This is intentionally retained as an audit example rather than silently polished into an approved result.

The D056 and D058 results are also `in_review`. D056 requires a source-copy edit at verse 6, correction of the awkward/unsupported construction at verse 11, and softening of a small exclusivity overstatement at verse 5; its verse-12 `church` warning was judged acceptable contextual shorthand. D058 is otherwise well grounded, with one rhetorical comparison at verse 10 to soften before approval. Natural reuse of one exact Henry range across neighboring verses was explicitly accepted and is not repeated as a warning on every record.

## Commands

```sh
# Verify/download the exact archive.
npm run mhc:acquire

# See the inclusive active window without writing anything.
npm run mhc:window:dry-run

# Generate/resume today through two days ahead and atomically export the private store.
npm run mhc:window:spark

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
- Schedule audit: `private-commentary/mhc/schedule/<readingId>/audit.{json,md}`
- Runtime chapter: `private-commentary/mhc/runtime/<BOOK>/<CHAPTER>.json`
- Portable current-window manifest: `private-commentary/mhc/stores/current-window/manifest.json`
- Portable reading: `private-commentary/mhc/stores/current-window/readings/<readingId>.<hash-prefix>.json`
- Genesis comparison: `private-commentary/mhc/reports/GEN-001-spark-vs-luna.{json,md}`

For a localhost audit, run `npm run dev`, open `http://127.0.0.1:4173/app/frontend/?privateDraft=1`, select a generated schedule day, open Scripture, tap a verse, and expand **Read Henry**. The same server exposes the current manifest at `/__mhc/window/manifest.json` and an included portable record at `/__mhc/window/readings/<readingId>.json`; it verifies the manifest checksum before serving or attaching that reading. The private adapter accepts only active bridge IDs, sends `no-store`, and is stripped from production builds. The separate `?mhcPilot=1` route preserves the inactive Genesis calibration.

## Full-corpus lock and limitations

No broader generation was run. A future full-corpus invocation is rejected unless both explicit flags are present. Even then, it processes only normalized, reviewed batches that already exist, sequentially:

```sh
node scripts/mhc-pipeline.mjs generate --all --confirm-full-corpus --model gpt-5.6-luna
```

Do not run that command merely because a bounded pilot succeeded. SWORD uses KJV versification, so later canon/versification differences require deterministic exceptions or mappings rather than guesses. Shared-range source treatment can produce overlapping adjacent blurbs by design. Source-specific introduction boundaries must be reviewed and hash-locked per edition/book. The exact excerpt layer is a narrow, citation-driven disclosure for this public-domain edition; it is not permission to publish the raw commentary corpus as an app asset.
