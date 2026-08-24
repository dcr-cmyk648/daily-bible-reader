const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

function digest(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function runtime(promptVersion, generatedAt, reviewStatus = "in_review") {
  const atomId = "fabricated:NAM:002:001:a001";
  return {
    schema_version: "mhc-runtime/v1",
    source_id: "fabricated-source",
    source_version: "test-v1",
    source_archive_sha256: "a".repeat(64),
    source_manifest_ref: "FABRICATED TEST MANIFEST",
    worker_model: "gpt-5.3-codex-spark",
    prompt_version: promptVersion,
    generation_timestamp: generatedAt,
    validation_status: "valid",
    review_status: reviewStatus,
    label: "Matthew Henry — condensed paraphrase",
    book_id: "NAM",
    chapter: 2,
    source_layer_note: "Fabricated source layer for sync testing only.",
    source_atoms: {
      [atomId]: {
        source_atom_id: atomId,
        source_unit_id: "fabricated:NAM:002:001",
        source_reference_label: "Fabricated Nahum 2:1",
        sequence: 1,
        atom_type: "commentary",
        text: "FABRICATED COMMENTARY SOURCE ATOM FOR SYNC TESTING ONLY.",
        text_sha256: "b".repeat(64)
      }
    },
    records: {
      "NAM.2.1": {
        blurb: `Fabricated ${promptVersion} condensation for testing only.`,
        coverage_type: "direct",
        scope_note: "Fabricated direct note.",
        source_unit_ids: ["fabricated:NAM:002:001"],
        source_atom_ids: [atomId],
        source_reference_label: "Fabricated Nahum 2:1"
      }
    }
  };
}

async function fixture(reviewStatus = "in_review") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbr-mhc-library-"));
  const planDir = path.join(root, "plans", "fabricated-plan");
  const readingsDir = path.join(planDir, "readings");
  await fs.mkdir(readingsDir, {recursive: true});
  const latest = runtime("mhc-worker/v99", "2026-08-11T13:18:26.238Z", reviewStatus);
  const portable = {
    schema_version: "mhc-portable-reading/v1",
    plan_version: "fabricated-plan-v1",
    reading_id: "CC-Y3Q4-D058",
    schedule_date: "2026-08-12",
    day_index: 5,
    source_plan_day: 58,
    timezone: "America/Detroit",
    worker_model: "gpt-5.3-codex-spark",
    prompt_version: latest.prompt_version,
    review_status: reviewStatus,
    human_review_status: reviewStatus,
    publication_status: "not_published",
    contains_scripture: false,
    chapters: [{book_id: "NAM", chapter: 2, verse_count: 1, runtime: latest}]
  };
  const portableBytes = Buffer.from(`${JSON.stringify(portable, null, 2)}\n`);
  const portableHash = digest(portableBytes);
  const relativeReading = `plans/fabricated-plan/readings/CC-Y3Q4-D058.${portableHash.slice(0, 16)}.json`;
  await fs.writeFile(path.join(root, relativeReading), portableBytes);
  const catalog = {
    schema_version: "mhc-library-catalog/v1",
    plan_version: "fabricated-plan-v1",
    readings: [{reading_id: "CC-Y3Q4-D058", file: relativeReading, sha256: portableHash}]
  };
  const catalogBytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`);
  const relativeCatalog = "plans/fabricated-plan/catalog.json";
  await fs.writeFile(path.join(root, relativeCatalog), catalogBytes);
  await fs.writeFile(path.join(root, "current.json"), `${JSON.stringify({
    schema_version: "mhc-library-pointer/v1",
    plan_version: "fabricated-plan-v1",
    catalog_file: relativeCatalog,
    catalog_sha256: digest(catalogBytes)
  }, null, 2)}\n`);
  const metadataPath = path.join(root, "metadata.json");
  await fs.writeFile(metadataPath, `${JSON.stringify({
    readingId: "CC-Y3Q4-D058",
    verseCommentary: runtime("mhc-worker/v1", "2026-08-10T12:00:00Z"),
    henrySourceLink: {
      sourceId: "fabricated-source",
      title: "Fabricated fallback link",
      url: "https://example.test/fabricated-commentary",
      note: "FABRICATED TEST FALLBACK ONLY."
    }
  }, null, 2)}\n`);
  return {root, metadataPath, latest};
}

test("Henry handoff follows the checksum-bound current catalog and replaces a stale attachment", async () => {
  const {syncLatestHenryRuntime} = await import("../scripts/lib/mhc-library-sync.mjs");
  const data = await fixture();
  const result = await syncLatestHenryRuntime({
    libraryRoot: data.root,
    readingId: "CC-Y3Q4-D058",
    metadataPath: data.metadataPath,
    runtimeSchemaPath: path.join(__dirname, "../schemas/mhc-runtime.schema.json")
  });
  assert.equal(result.changed, true);
  const metadata = JSON.parse(await fs.readFile(data.metadataPath, "utf8"));
  assert.deepEqual(metadata.verseCommentary, data.latest);
  assert.equal(metadata.henrySourceLink, undefined);
  await assert.doesNotReject(() => syncLatestHenryRuntime({
    libraryRoot: data.root,
    readingId: "CC-Y3Q4-D058",
    metadataPath: data.metadataPath,
    runtimeSchemaPath: path.join(__dirname, "../schemas/mhc-runtime.schema.json"),
    checkOnly: true
  }));
});

test("Henry handoff fails closed for a newer unreviewed artifact", async () => {
  const {syncLatestHenryRuntime} = await import("../scripts/lib/mhc-library-sync.mjs");
  const data = await fixture("unreviewed");
  await assert.rejects(() => syncLatestHenryRuntime({
    libraryRoot: data.root,
    readingId: "CC-Y3Q4-D058",
    metadataPath: data.metadataPath,
    runtimeSchemaPath: path.join(__dirname, "../schemas/mhc-runtime.schema.json")
  }), /newest Henry artifact is unreviewed/);
});

test("Henry handoff rejects a catalog whose checksum no longer matches the pointer", async () => {
  const {loadLatestHenryReading} = await import("../scripts/lib/mhc-library-sync.mjs");
  const data = await fixture();
  await fs.appendFile(path.join(data.root, "plans/fabricated-plan/catalog.json"), " ");
  await assert.rejects(() => loadLatestHenryReading({
    libraryRoot: data.root,
    readingId: "CC-Y3Q4-D058",
    runtimeSchemaPath: path.join(__dirname, "../schemas/mhc-runtime.schema.json")
  }), /catalog checksum mismatch/);
});

test("mixed Spark/Luna catalog descriptors retain older immutable readings", async () => {
  const {buildLibraryCatalog} = await import("../scripts/mhc-pipeline.mjs");
  const plan = {planVersion: "fabricated-plan-v1"};
  const prior = buildLibraryCatalog({plan, priorCatalog: null, storedAt: "2026-08-12T00:00:00.000Z", readings: [{
    reading_id: "FAB-001", schedule_date: "2026-08-12", day_index: 1, source_plan_day: 1,
    file: "plans/fabricated-plan/readings/FAB-001.aaaaaaaaaaaaaaaa.json", sha256: "a".repeat(64), passage_count: 1,
    worker_model: "gpt-5.3-codex-spark", worker_models: ["gpt-5.3-codex-spark"], prompt_version: "test",
    review_status: "unreviewed", human_review_status: "required"
  }]});
  const merged = buildLibraryCatalog({plan, priorCatalog: prior, storedAt: "2026-08-13T00:00:00.000Z", readings: [{
    reading_id: "FAB-002", schedule_date: "2026-08-13", day_index: 2, source_plan_day: 2,
    file: "plans/fabricated-plan/readings/FAB-002.bbbbbbbbbbbbbbbb.json", sha256: "b".repeat(64), passage_count: 1,
    worker_model: "gpt-5.6-luna", worker_models: ["gpt-5.6-luna"], prompt_version: "test",
    review_status: "unreviewed", human_review_status: "required"
  }]});
  assert.deepEqual(merged.readings.map((item) => item.reading_id), ["FAB-001", "FAB-002"]);
  assert.deepEqual(merged.worker_models, ["gpt-5.3-codex-spark", "gpt-5.6-luna"]);
});
