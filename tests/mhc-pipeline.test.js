const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {deflateSync} = require("node:zlib");

function json(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8"));
}

function indexBuffer(records) {
  const buffer = Buffer.alloc(records.length * 12);
  records.forEach((record, index) => {
    buffer.writeUInt32LE(record[0], index * 12);
    buffer.writeUInt32LE(record[1], index * 12 + 4);
    buffer.writeUInt32LE(record[2], index * 12 + 8);
  });
  return buffer;
}

function fabricatedDecodedGenesis() {
  const book = '<div canonical="true" osisID="Gen" sID="fabricated-book" type="book"/>';
  const chapter = '<chapter n="1" osisID="Gen.1" sID="Gen.1"/>';
  const verse = [
    '<div type="x-milestone" subType="x-preverse" sID="fabricated-preverse"/>',
    '<div sID="fabricated-book-intro-start" type="x-p"/>FABRICATED BOOK INTRODUCTION FOR TESTING ONLY.',
    '<div eID="fabricated-book-intro-end" type="x-p"/>',
    '<div sID="fabricated-chapter-intro" type="introduction"/>FABRICATED CHAPTER INTRODUCTION FOR TESTING ONLY.',
    '<div eID="fabricated-chapter-intro" type="introduction"/>',
    '<div type="x-milestone" subType="x-preverse" eID="fabricated-preverse"/>',
    '<title type="x-s3">FABRICATED RANGE HEADING</title>',
    '<div sID="fabricated-scripture" type="x-p"/><hi type="super">1</hi> FABRICATED SCRIPTURE TRANSCRIPTION THAT MUST NOT REACH THE WORKER.',
    '<div eID="fabricated-scripture" type="x-p"/>',
    '<div sID="fabricated-commentary" type="x-p"/>FABRICATED COMMENTARY TREATS VERSES ONE AND TWO TOGETHER FOR TESTING ONLY.',
    '<div eID="fabricated-commentary" type="x-p"/>'
  ].join(" ");
  const block0 = Buffer.from('<milestone type="x-importer" n="FABRICATED"/>');
  const block1 = Buffer.from(`${book}${chapter}${verse}`);
  const compressed0 = deflateSync(block0);
  const compressed1 = deflateSync(block1);
  const compressed = Buffer.concat([compressed0, compressed1]);
  const blockIndex = indexBuffer([
    [0, compressed0.length, block0.length],
    [compressed0.length, compressed1.length, block1.length]
  ]);
  const bookOffset = 0;
  const chapterOffset = Buffer.byteLength(book);
  const verseOffset = chapterOffset + Buffer.byteLength(chapter);
  const verseLength = Buffer.byteLength(verse);
  const verseIndex = indexBuffer([
    [0, 0, 0],
    [0, 0, block0.length],
    [1, bookOffset, Buffer.byteLength(book)],
    [1, chapterOffset, Buffer.byteLength(chapter)],
    [1, verseOffset, verseLength],
    [1, verseOffset, verseLength]
  ]);
  return {blockIndex, verseIndex, compressed};
}

function fabricatedManifest() {
  return {
    source_id: "crosswire-mhc-2.2",
    work_title: "FABRICATED COMMENTARY WORK FOR TESTING ONLY",
    source_url: "https://example.test/source",
    download_url: "https://example.test/source.zip",
    module_name: "MHC",
    module_version: "2.2",
    source_version_date: "2022-08-29",
    retrieved_at: "2026-08-10",
    license: "FABRICATED PUBLIC-DOMAIN LABEL FOR TESTING ONLY",
    archive_sha256: "a".repeat(64),
    source_format: "CrossWire SWORD zCom4 OSIS",
    versification: "KJV"
  };
}

async function normalizedFixture() {
  const pipeline = await import("../scripts/lib/mhc-pipeline.mjs");
  const decoded = pipeline.decodeSwordTestament({...fabricatedDecodedGenesis(), testament: "ot"});
  const sourceManifest = fabricatedManifest();
  const boundaries = {
    archiveSha256: sourceManifest.archive_sha256,
    moduleVersion: "2.2",
    books: {
      GEN: {
        bookIntroStartMilestoneId: "fabricated-book-intro-start",
        bookIntroEndMilestoneId: "fabricated-book-intro-end"
      }
    }
  };
  const result = pipeline.normalizeBookChapter({
    decodedModule: {books: decoded.books},
    sourceManifest,
    boundaries,
    bookId: "GEN",
    chapter: 1
  });
  return {pipeline, sourceManifest, ...result};
}

test("OSIS references map deterministically to canonical app IDs and bounded ranges", async () => {
  const {parseOsisReferenceRange} = await import("../scripts/lib/mhc-pipeline.mjs");
  assert.deepEqual(parseOsisReferenceRange("Gen.1.3-Gen.1.5"), {
    bookId: "GEN", chapter: 1, verseStart: 3, verseEnd: 5
  });
  assert.deepEqual(parseOsisReferenceRange("1Pet.5.7"), {
    bookId: "1PE", chapter: 5, verseStart: 7, verseEnd: 7
  });
  assert.equal(parseOsisReferenceRange("Gen.1.5-Gen.1.3"), null);
  assert.equal(parseOsisReferenceRange("Gen.1.1-Exod.1.1"), null);
  assert.equal(parseOsisReferenceRange("ambiguous"), null);
});

test("SWORD zCom4 indexing preserves one shared source unit for a linked verse range", async () => {
  const {units, exceptions, chapterIndex} = await normalizedFixture();
  assert.equal(chapterIndex.verseEntries.length, 2);
  const range = units.find((unit) => unit.unit_type === "verse_range");
  assert.equal(range.reference_label, "Genesis 1:1–2");
  assert.equal(range.verse_start, 1);
  assert.equal(range.verse_end, 2);
  assert.match(range.source_text, /FABRICATED COMMENTARY TREATS VERSES ONE AND TWO TOGETHER/);
  assert.match(range.source_text, /FABRICATED SCRIPTURE TRANSCRIPTION/);
  assert.equal(range.source_atoms.some((atom) => atom.text.includes("FABRICATED SCRIPTURE TRANSCRIPTION")), false);
  assert.equal(range.source_atoms.some((atom) => atom.text.includes("FABRICATED COMMENTARY TREATS")), true);
  assert.match(range.excluded_scripture_sha256, /^[a-f0-9]{64}$/);
  assert.equal(units.filter((unit) => unit.unit_type === "verse_range").length, 1);
  assert.equal(exceptions.length, 0);
});

test("normalized source creation separates book introduction, chapter introduction, and verse range", async () => {
  const {units} = await normalizedFixture();
  assert.deepEqual(units.map((unit) => unit.unit_type), ["book_intro", "chapter_intro", "verse_range"]);
  assert.equal(units[0].chapter, null);
  assert.equal(units[1].chapter, 1);
  assert.equal(units[2].source_text_sha256.length, 64);
  const schema = json("schemas/mhc-normalized-source.schema.json");
  const {validateAgainstSchema} = await import("../scripts/lib/schema-validator.mjs");
  units.forEach((unit) => assert.deepEqual(validateAgainstSchema(unit, schema), []));
});

function validChapterOutput(spec) {
  const source = spec.sourceUnits.find((unit) => unit.unit_type === "verse_range");
  const atom = source.source_atoms.find((candidate) => candidate.atom_type === "commentary");
  return {
    ...spec.metadata,
    records: [1, 2].map((verse) => ({
      verse_id: `GEN.1.${verse}`,
      blurb: `Henry treats this fabricated verse as part of one shared test range, emphasizing only the supplied fabricated theme for verse ${verse}.`,
      coverage_type: "range-derived",
      scope_note: "Henry treats verses 1–2 together.",
      source_unit_ids: [source.source_unit_id],
      source_atom_ids: [atom.source_atom_id],
      source_reference_label: source.reference_label
    }))
  };
}

test("chapter validation accepts exact coverage and rejects duplicate or missing verses", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-test", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-10T12:00:00.000Z"
  });
  assert.ok(spec.sourceUnits.every((unit) => unit.unit_type === "verse_range"));
  const schema = json("schemas/mhc-commentary-output.schema.json");
  const output = validChapterOutput(spec);
  const valid = pipeline.validateChapterOutput(output, {
    schema, units, bookId: "GEN", chapter: 1, verseCount: 2, expectedMetadata: spec.metadata
  });
  assert.equal(valid.valid, true, valid.errors.join("\n"));

  const duplicate = structuredClone(output);
  duplicate.records[1].verse_id = "GEN.1.1";
  const invalid = pipeline.validateChapterOutput(duplicate, {
    schema, units, bookId: "GEN", chapter: 1, verseCount: 2, expectedMetadata: spec.metadata
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes("appears 2 times")));
  assert.ok(invalid.errors.some((error) => error.includes("missing expected verse GEN.1.2")));
});

test("chapter validation rejects unknown and non-covering source-unit references", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-test", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-10T12:00:00.000Z"
  });
  const schema = json("schemas/mhc-commentary-output.schema.json");
  const output = validChapterOutput(spec);
  output.records[0].source_unit_ids = ["crosswire-mhc-2.2:GEN:unknown"];
  const invalid = pipeline.validateChapterOutput(output, {
    schema, units, bookId: "GEN", chapter: 1, verseCount: 2, expectedMetadata: spec.metadata
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes("unknown source unit")));
  assert.ok(invalid.errors.some((error) => error.includes("do not cover GEN.1.1")));
});

test("chapter validation rejects duplicate source-unit citations outside the Codex schema subset", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-test", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-10T12:00:00.000Z"
  });
  const output = validChapterOutput(spec);
  output.records[0].source_unit_ids.push(output.records[0].source_unit_ids[0]);
  const invalid = pipeline.validateChapterOutput(output, {
    schema: json("schemas/mhc-commentary-output.schema.json"), units, bookId: "GEN", chapter: 1,
    verseCount: 2, expectedMetadata: spec.metadata
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes("duplicate source-unit IDs")));
});

test("chapter validation requires exact permitted commentary atoms for the v2 worker", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-test", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-10T12:00:00.000Z"
  });
  const output = validChapterOutput(spec);
  output.records[0].source_atom_ids = ["crosswire-mhc-2.2:GEN:001:001-002:a999"];
  const invalid = pipeline.validateChapterOutput(output, {
    schema: json("schemas/mhc-commentary-output.schema.json"), units, bookId: "GEN", chapter: 1,
    verseCount: 2, expectedMetadata: spec.metadata
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes("unknown source atom")));
});

test("no-distinct-comment support resolves only to the nearest surrounding source range", async () => {
  const {chapterCoverageForVerse} = await import("../scripts/lib/mhc-pipeline.mjs");
  const units = [
    {source_unit_id: "fabricated:GEN:001:001", unit_type: "verse_range", verse_start: 1, verse_end: 1},
    {source_unit_id: "fabricated:GEN:001:003", unit_type: "verse_range", verse_start: 3, verse_end: 3},
    {source_unit_id: "fabricated:GEN:001:010", unit_type: "verse_range", verse_start: 10, verse_end: 10}
  ];
  const coverage = chapterCoverageForVerse(units, 2);
  assert.equal(coverage.coverageType, "no-distinct-comment");
  assert.deepEqual(coverage.sourceUnits.map((unit) => unit.source_unit_id), [
    "fabricated:GEN:001:001", "fabricated:GEN:001:003"
  ]);
});

test("resume matching skips only completed, schema-valid, source-matching jobs", async () => {
  const {shouldSkipCompletedJob, jobFingerprint} = await import("../scripts/lib/mhc-pipeline.mjs");
  const metadata = {
    schema_version: "mhc-commentary/v1",
    job_id: "GEN-001",
    source_hash: "b".repeat(64),
    prompt_version: "mhc-worker/v1",
    worker_model: "gpt-test"
  };
  const fingerprint = jobFingerprint(metadata);
  const manifest = {jobs: [{
    job_id: metadata.job_id,
    worker_model: metadata.worker_model,
    fingerprint,
    status: "completed"
  }]};
  assert.equal(shouldSkipCompletedJob(manifest, metadata, {valid: true}), true);
  assert.equal(shouldSkipCompletedJob(manifest, metadata, {valid: false}), false);
  assert.equal(shouldSkipCompletedJob(manifest, {...metadata, source_hash: "c".repeat(64)}, {valid: true}), false);
});

test("source, prompt, schema, and model changes invalidate job fingerprints", async () => {
  const {jobFingerprint} = await import("../scripts/lib/mhc-pipeline.mjs");
  const baseline = {
    schema_version: "mhc-commentary/v1", source_hash: "d".repeat(64),
    prompt_version: "mhc-worker/v1", worker_model: "gpt-one"
  };
  const fingerprints = [
    baseline,
    {...baseline, source_hash: "e".repeat(64)},
    {...baseline, prompt_version: "mhc-worker/v2"},
    {...baseline, schema_version: "mhc-commentary/v2"},
    {...baseline, worker_model: "gpt-two"}
  ].map(jobFingerprint);
  assert.equal(new Set(fingerprints).size, fingerprints.length);
});

test("chapter export produces a compact verse-keyed runtime shard with provenance", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-test", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-10T12:00:00.000Z"
  });
  const output = validChapterOutput(spec);
  const schema = json("schemas/mhc-commentary-output.schema.json");
  const validation = pipeline.validateChapterOutput(output, {
    schema, units, bookId: "GEN", chapter: 1, verseCount: 2, expectedMetadata: spec.metadata
  });
  const shard = pipeline.exportChapterRuntime(output, sourceManifest, validation, units);
  const runtimeSchema = json("schemas/mhc-runtime.schema.json");
  const {validateAgainstSchema} = await import("../scripts/lib/schema-validator.mjs");
  assert.equal(shard.schema_version, "mhc-runtime/v1");
  assert.equal(shard.source_archive_sha256, sourceManifest.archive_sha256);
  assert.deepEqual(Object.keys(shard.records), ["GEN.1.1", "GEN.1.2"]);
  assert.equal(shard.records["GEN.1.1"].coverage_type, "range-derived");
  assert.equal(Object.keys(shard.source_atoms).length, 1);
  assert.match(shard.source_atoms[shard.records["GEN.1.1"].source_atom_ids[0]].text, /FABRICATED COMMENTARY TREATS/);
  assert.equal(JSON.stringify(shard).includes("FABRICATED SCRIPTURE TRANSCRIPTION"), false);
  assert.equal(JSON.stringify(shard).includes("source_text"), false);
  assert.deepEqual(validateAgainstSchema(shard, runtimeSchema), []);
});

test("book introduction remains a separate validated book-level runtime resource", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildBookIntroJobSpec({
    units, sourceManifest, model: "gpt-test", bookId: "GEN",
    generatedAt: "2026-08-10T12:00:00.000Z"
  });
  const source = spec.sourceUnits[0];
  const output = {
    ...spec.metadata,
    resource: {
      resource_id: "intro-GEN",
      book_id: "GEN",
      resource_type: "book_intro",
      blurb: "Henry's fabricated book-level test summary remains distinct from every verse record.",
      scope_note: "This is a fabricated Genesis book-introduction scope for testing only.",
      source_unit_ids: [source.source_unit_id],
      source_reference_label: source.reference_label
    }
  };
  const schema = json("schemas/mhc-book-intro-output.schema.json");
  const validation = pipeline.validateBookIntroOutput(output, {
    schema, units, bookId: "GEN", expectedMetadata: spec.metadata
  });
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  const runtime = pipeline.exportBookIntroRuntime(output, sourceManifest, validation);
  const runtimeSchema = json("schemas/mhc-runtime.schema.json");
  const {validateAgainstSchema} = await import("../scripts/lib/schema-validator.mjs");
  assert.equal(runtime.resource.resource_id, "intro-GEN");
  assert.equal(Object.hasOwn(runtime, "records"), false);
  assert.deepEqual(validateAgainstSchema(runtime, {...runtimeSchema, $ref: "#/$defs/bookIntroShard"}), []);
});

test("full-corpus execution requires the explicit safeguard", async () => {
  const {requireFullCorpusConfirmation} = await import("../scripts/lib/mhc-pipeline.mjs");
  assert.throws(() => requireFullCorpusConfirmation({all: true, confirmFullCorpus: false}), /--confirm-full-corpus/);
  assert.equal(requireFullCorpusConfirmation({all: true, confirmFullCorpus: true}), true);
  assert.equal(requireFullCorpusConfirmation({all: false}), true);
});

test("day-ahead resolution uses Detroit civil dates and the rolling window stops at two days", async () => {
  const {resolveScheduledReading, resolveScheduledWindow} = await import("../scripts/lib/mhc-pipeline.mjs");
  const plan = json("fixtures/pilot-content/plan.json");
  const appConfig = json("fixtures/pilot-content/app-config.json");
  const resolved = resolveScheduledReading({
    plan,
    appConfig,
    now: new Date("2026-08-11T03:30:00.000Z"),
    daysAhead: 1
  });
  assert.equal(resolved.preparedOn, "2026-08-10");
  assert.equal(resolved.scheduleDate, "2026-08-11");
  assert.equal(resolved.entry.readingId, "CC-Y3Q4-D057");
  assert.deepEqual(resolved.entry.passages, [{bookId: "NAM", chapter: 1, verseCount: 15}]);
  assert.throws(() => resolveScheduledReading({plan, appConfig, today: "2026-08-10", daysAhead: 2}), /single-reading audit pipeline/);

  const window = resolveScheduledWindow({plan, appConfig, today: "2026-08-10", daysAhead: 2});
  assert.equal(window.windowStartDate, "2026-08-10");
  assert.equal(window.windowEndDate, "2026-08-12");
  assert.deepEqual(window.targets.map((target) => target.entry.readingId), [
    "CC-Y3Q4-D056", "CC-Y3Q4-D057", "CC-Y3Q4-D058"
  ]);
  assert.throws(() => resolveScheduledWindow({plan, appConfig, today: "2026-08-10", daysAhead: 3}), /two days ahead/);
});

test("portable window records are app-neutral, hashed, and explicitly unreviewed", async () => {
  const controller = await import("../scripts/mhc-pipeline.mjs");
  const runtime = {
    schema_version: "mhc-runtime/v1",
    source_id: "fabricated-mhc-test",
    source_version: "test-only",
    source_archive_sha256: "a".repeat(64),
    source_manifest_ref: "FABRICATED-TEST-MANIFEST",
    worker_model: "gpt-5.3-codex-spark",
    prompt_version: "mhc-worker/v4",
    generation_timestamp: "2026-08-10T12:00:00.000Z",
    validation_status: "valid",
    review_status: "unreviewed",
    label: "Matthew Henry — condensed paraphrase",
    book_id: "NAM",
    chapter: 1,
    records: {
      "NAM.1.1": {
        blurb: "Fabricated condensation for portable-store testing only.",
        coverage_type: "direct",
        scope_note: "Fabricated direct scope.",
        source_unit_ids: ["fabricated:NAM:001:001"],
        source_reference_label: "FABRICATED Nahum 1:1"
      }
    }
  };
  const plan = {planVersion: "fabricated-plan-v1"};
  const scheduledResult = {
    target: {
      preparedOn: "2026-08-10",
      scheduleDate: "2026-08-11",
      daysAhead: 1,
      timezone: "America/Detroit",
      dayIndex: 4,
      entry: {readingId: "CC-Y3Q4-D057"}
    },
    audit: {
      reading_id: "CC-Y3Q4-D057",
      source_plan_day: 57,
      worker_model: "gpt-5.3-codex-spark",
      prompt_version: "mhc-worker/v4",
      review_status: "unreviewed",
      human_review: {status: "required"}
    },
    passageResults: [{book_id: "NAM", chapter: 1, verse_count: 1, runtime}]
  };
  const reading = controller.buildPortableWindowReading({plan, scheduledResult});
  const descriptor = {
    reading_id: reading.reading_id,
    schedule_date: reading.schedule_date,
    day_index: reading.day_index,
    source_plan_day: reading.source_plan_day,
    file: `readings/${reading.reading_id}.${"b".repeat(16)}.json`,
    sha256: "b".repeat(64),
    passage_count: 1,
    review_status: reading.review_status,
    human_review_status: reading.human_review_status
  };
  const manifest = controller.buildWindowStoreManifest({
    plan,
    window: {
      preparedOn: "2026-08-10",
      timezone: "America/Detroit",
      daysAhead: 2,
      windowStartDate: "2026-08-10",
      windowEndDate: "2026-08-12"
    },
    generatedAt: "2026-08-10T13:00:00.000Z",
    readings: [descriptor]
  });
  const storeSchema = json("schemas/mhc-window-store.schema.json");
  const runtimeSchema = json("schemas/mhc-runtime.schema.json");
  const {validateAgainstSchema} = await import("../scripts/lib/schema-validator.mjs");
  const externalSchemas = {"mhc-runtime.schema.json": runtimeSchema};
  assert.deepEqual(validateAgainstSchema(reading, {...storeSchema, $ref: "#/$defs/reading"}, {externalSchemas}), []);
  assert.deepEqual(validateAgainstSchema(manifest, storeSchema, {externalSchemas}), []);
  assert.equal(reading.contains_scripture, false);
  assert.equal(reading.publication_status, "not_published");
  assert.equal(reading.human_review_status, "required");
  assert.equal(JSON.stringify(reading).includes("source_text"), false);
});

test("Codex worker arguments are ephemeral, standard-speed, read-only, and single-agent", async () => {
  const {codexExecArgs} = await import("../scripts/mhc-pipeline.mjs");
  const args = codexExecArgs({
    model: "gpt-fabricated",
    schemaPath: "/tmp/fabricated-schema.json",
    outputPath: "/tmp/fabricated-output.json",
    cwd: "/tmp/fabricated-job"
  });
  assert.deepEqual(args.slice(0, 3), ["--ask-for-approval", "never", "exec"]);
  assert.ok(args.includes("--ephemeral"));
  assert.ok(args.includes("--ignore-user-config"));
  assert.ok(args.includes("read-only"));
  assert.equal(args.filter((value) => value === "fast_mode").length, 1);
  assert.ok(args.includes("multi_agent"));
  assert.ok(args.includes("multi_agent_v2"));
  assert.ok(args.includes("--output-schema"));
  assert.ok(args.includes("--output-last-message"));
  assert.equal(args.at(-1), "-");
});

test("Codex output schemas give every const and enum an explicit type", () => {
  const visit = (value, location = "$") => {
    if (!value || typeof value !== "object") return;
    if (Object.hasOwn(value, "const") || Object.hasOwn(value, "enum")) {
      assert.equal(typeof value.type, "string", `${location} must declare an explicit type`);
    }
    for (const [key, child] of Object.entries(value)) visit(child, `${location}.${key}`);
  };

  for (const schemaPath of [
    "schemas/mhc-commentary-output.schema.json",
    "schemas/mhc-book-intro-output.schema.json"
  ]) {
    const schema = json(schemaPath);
    visit(schema);
    assert.equal(JSON.stringify(schema).includes('"uniqueItems"'), false);
  }
});

test("raw and generated Matthew Henry storage is ignored and absent from Git", () => {
  const ignore = fs.readFileSync(path.join(__dirname, "../.gitignore"), "utf8");
  assert.match(ignore, /^private-commentary\/$/m);
  assert.match(ignore, /^research\/raw\/$/m);
  const tracked = spawnSync("git", ["ls-files", "private-commentary", "research/raw"], {
    cwd: path.join(__dirname, ".."), encoding: "utf8"
  });
  assert.equal(tracked.status, 0);
  assert.equal(tracked.stdout.trim(), "");
});
