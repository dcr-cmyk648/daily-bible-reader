const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {EventEmitter} = require("node:events");
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

test("Henry routing is Spark-first, falls back only for coded availability failures, and latches Luna per batch", async () => {
  const {routeHenryGeneration} = await import("../scripts/mhc-pipeline.mjs");
  const calls = [];
  const success = await routeHenryGeneration({invoke: async (model) => { calls.push(model); return "ok"; }});
  assert.equal(success.model, "gpt-5.3-codex-spark");
  assert.deepEqual(calls, ["gpt-5.3-codex-spark"]);
  const quota = Object.assign(new Error("quota"), {code: "SPARK_QUOTA_UNAVAILABLE"});
  const fallback = await routeHenryGeneration({routing: success.routing, invoke: async (model) => {
    calls.push(model);
    if (model === "gpt-5.3-codex-spark") throw quota;
    return "luna";
  }});
  assert.equal(fallback.model, "gpt-5.6-luna");
  assert.deepEqual(calls.slice(-2), ["gpt-5.3-codex-spark", "gpt-5.6-luna"]);
  await routeHenryGeneration({routing: fallback.routing, invoke: async (model) => { calls.push(model); return "latched"; }});
  assert.equal(calls.at(-1), "gpt-5.6-luna");
  await assert.rejects(() => routeHenryGeneration({invoke: async () => { throw new Error("validation failed"); }}), /validation failed/);
});

test("Henry Codex invocation pins Luna low reasoning, disables internal agents, and forbids Sol", async () => {
  const {codexExecArgs} = await import("../scripts/mhc-pipeline.mjs");
  const luna = codexExecArgs({model: "gpt-5.6-luna", schemaPath: "/tmp/schema.json", outputPath: "/tmp/out.json", cwd: "/tmp"});
  assert.deepEqual(luna.slice(luna.indexOf("--model"), luna.indexOf("--output-schema")), ["--model", "gpt-5.6-luna", "--config", "model_reasoning_effort=low"]);
  assert.ok(luna.includes("multi_agent") && luna.includes("multi_agent_v2"));
  assert.throws(() => codexExecArgs({model: "gpt-5.6-sol", schemaPath: "/tmp/schema.json", outputPath: "/tmp/out.json", cwd: "/tmp"}), /forbids/);
});

test("both permitted chapter workers use the autonomous two-stage path while book introductions remain legacy", async () => {
  const {usesAutonomousChapterPath} = await import("../scripts/mhc-pipeline.mjs");
  assert.equal(usesAutonomousChapterPath({model: "gpt-5.3-codex-spark"}), true);
  assert.equal(usesAutonomousChapterPath({model: "gpt-5.6-luna"}), true);
  assert.equal(usesAutonomousChapterPath({model: "gpt-5.6-luna", bookIntro: true}), false);
  assert.equal(usesAutonomousChapterPath({model: "gpt-5.6-sol"}), false);
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
      blurb: `This fabricated verse belongs to one shared test range and emphasizes only the supplied fabricated theme for verse ${verse}.`,
      coverage_type: "range-derived",
      scope_note: "From fabricated Genesis 1:1–2.",
      source_unit_ids: [source.source_unit_id],
      source_atom_ids: [atom.source_atom_id],
      source_reference_label: source.reference_label
    }))
  };
}

function validFactBrief(pipeline, spec) {
  const source = spec.sourceUnits.find((unit) => unit.unit_type === "verse_range");
  const atom = source.source_atoms.find((candidate) => candidate.atom_type === "commentary");
  const snippet = pipeline.evidenceSnippetsForAtom(atom)[0];
  return {
    ...pipeline.buildFactBriefJobSpec({chapterJobSpec: spec}).metadata,
    verse_briefs: [1, 2].map((verse) => ({
      verse_id: `GEN.1.${verse}`,
      coverage_type: "range-derived",
      source_unit_ids: [source.source_unit_id],
      source_reference_label: source.reference_label,
      facts: [{
        fact_id: `GEN.1.${verse}:f01`,
        importance: "required",
        category: "action_or_event",
        statement: "FABRICATED treatment joins verses one and two for testing only.",
        source_atom_id: atom.source_atom_id,
        source_snippet_id: snippet.source_snippet_id,
        evidence_quote: snippet.text,
        must_include_terms: ["FABRICATED", "verses"],
        qualification: "none",
        verse_relevance: "shared_range_context"
      }]
    }))
  };
}

test("chapter validation accepts exact coverage and rejects duplicate or missing verses", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
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

test("current worker validation rejects source-reporting prose instead of merely warning", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-11T12:00:00.000Z"
  });
  const output = validChapterOutput(spec);
  output.records[0].blurb = "Henry treats this fabricated detail as important.";
  const validation = pipeline.validateChapterOutput(output, {
    schema: json("schemas/mhc-commentary-output.schema.json"), units, bookId: "GEN", chapter: 1,
    verseCount: 2, expectedMetadata: spec.metadata
  });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("source-reporting phrase")));

  output.records[0].blurb = "This fabricated explanation preserves the substance thereof while remaining long enough for validation.";
  const archaicValidation = pipeline.validateChapterOutput(output, {
    schema: json("schemas/mhc-commentary-output.schema.json"), units, bookId: "GEN", chapter: 1,
    verseCount: 2, expectedMetadata: spec.metadata
  });
  assert.equal(archaicValidation.valid, false);
  assert.ok(archaicValidation.errors.some((error) => error.includes('archaic term "thereof"')));
});

test("generated-prose lexicon rejects fabricated malformed archaic inflections", async () => {
  const {validateGeneratedProseLexicon} = await import("../scripts/mhc-pipeline.mjs");
  for (const term of ["upbraideth", "bridleth", "knowest", "whosoever"]) {
    const errors = validateGeneratedProseLexicon({records: [{blurb: `FABRICATED prose ${term} for lexical validation only.`}]});
    assert.ok(errors.some((error) => error.includes(`archaic term \"${term}\"`)), term);
  }
  assert.deepEqual(validateGeneratedProseLexicon({records: [{blurb: "FABRICATED contemporary prose remains valid."}]}), []);
});

test("autonomous Spark prompts separate grounded fact extraction from direct abridged prose", async () => {
  const {FACT_PROMPT_VERSION, PROMPT_VERSION} = await import("../scripts/lib/mhc-pipeline.mjs");
  const factPrompt = fs.readFileSync(path.join(__dirname, "..", "prompts/mhc-fact-extractor-v8.md"), "utf8");
  const writerPrompt = fs.readFileSync(path.join(__dirname, "..", "prompts/mhc-autonomous-writer-v5.md"), "utf8");
  assert.equal(FACT_PROMPT_VERSION, "mhc-fact-extractor/v8");
  assert.equal(PROMPT_VERSION, "mhc-autonomous-writer/v5");
  assert.match(factPrompt, /concrete identities, relationships, historical setting/);
  assert.match(factPrompt, /Every atom listed in `target_marked_source_atom_ids`/);
  assert.match(factPrompt, /preserve who acts, who receives the action/);
  assert.match(factPrompt, /controller canonicalizes that field from `source_snippet_id`/);
  assert.match(writerPrompt, /Use only the validated fact-brief view supplied below/);
  assert.match(writerPrompt, /Every fact marked `required` must be expressed faithfully/);
  assert.match(writerPrompt, /Never mention Henry, a commentator, commentary, a source, an atom, a fact brief/);
  assert.match(writerPrompt, /Do not assume a neighboring verse supplied information/);
});

test("Spark fact briefs require exact evidence, target facts, and explicit identities", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-11T12:00:00.000Z"
  });
  const schema = json("schemas/mhc-fact-brief.schema.json");
  const brief = validFactBrief(pipeline, spec);
  let validation = pipeline.validateFactBrief(brief, {schema, chapterJobSpec: spec});
  assert.equal(validation.valid, true, validation.errors.join("\n"));

  const inventedEvidence = structuredClone(brief);
  inventedEvidence.verse_briefs[0].facts[0].evidence_quote = "FABRICATED EVIDENCE THAT DOES NOT OCCUR IN THE ATOM";
  validation = pipeline.validateFactBrief(inventedEvidence, {schema, chapterJobSpec: spec});
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("must exactly equal the controller-selected evidence snippet")));

  const targetUnit = units.find((unit) => unit.unit_type === "verse_range");
  targetUnit.source_atoms.find((atom) => atom.atom_type === "commentary").text =
    "FABRICATED (v. 1) EXPLICIT TARGET DETAIL —Testperson and his spokesman Testspeaker.";
  const targetSpec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-11T12:00:00.000Z"
  });
  const omitted = validFactBrief(pipeline, targetSpec);
  omitted.verse_briefs[0].facts[0].importance = "supporting";
  validation = pipeline.validateFactBrief(omitted, {schema, chapterJobSpec: targetSpec});
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("target-marked atom")));
  assert.ok(validation.errors.some((error) => error.includes('omitted explicit identity "Testperson"')));
});

test("fact jobs prefer a verse-specific marker over a broader block marker", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const verseUnit = units.find((unit) => unit.unit_type === "verse_range");
  const baseAtom = verseUnit.source_atoms.find((atom) => atom.atom_type === "commentary");
  baseAtom.text = "FABRICATED broad treatment for vv. 1–2 with enough detail for this test.";
  verseUnit.source_atoms.push({
    ...structuredClone(baseAtom),
    source_atom_id: `${baseAtom.source_atom_id}:specific`,
    sequence: baseAtom.sequence + 1,
    text: "FABRICATED specific treatment for v. 1 with enough detail for this test."
  });
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-12T12:00:00.000Z"
  });
  const first = spec.requestedRecords.find((record) => record.verse_id === "GEN.1.1");
  assert.deepEqual(first.target_marked_source_atom_ids, [`${baseAtom.source_atom_id}:specific`]);
});

test("fact admission caps material claims and rejects source-reporting ledgers", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-11T12:00:00.000Z"
  });
  const schema = json("schemas/mhc-fact-brief.schema.json");
  const sourceReporting = validFactBrief(pipeline, spec);
  sourceReporting.verse_briefs[0].facts[0].statement = "He adds a fabricated observation about the target.";
  let validation = pipeline.validateFactBrief(sourceReporting, {schema, chapterJobSpec: spec});
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.warnings, []);

  const crowded = validFactBrief(pipeline, spec);
  const baseFact = crowded.verse_briefs[0].facts[0];
  for (let index = 2; index <= 4; index += 1) {
    crowded.verse_briefs[0].facts.push({
      ...structuredClone(baseFact),
      fact_id: `GEN.1.1:f${String(index).padStart(2, "0")}`,
      statement: `FABRICATED material fact number ${index} remains grounded in the same test evidence.`
    });
  }
  validation = pipeline.validateFactBrief(crowded, {schema, chapterJobSpec: spec});
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("no more than three material facts")));

  const archaic = validFactBrief(pipeline, spec);
  archaic.verse_briefs[0].facts[0].statement = "FABRICATED material remains thereof for this test.";
  validation = pipeline.validateFactBrief(archaic, {schema, chapterJobSpec: spec});
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes('archaic term "thereof"')));
});

test("fact hydration protects a named actor against ambiguous downstream agency", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const verseUnit = units.find((unit) => unit.unit_type === "verse_range");
  verseUnit.source_atoms.find((atom) => atom.atom_type === "commentary").text =
    "FABRICATED (v. 1) The Assyrians harmed Jacob and emptied his fields for this test.";
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-11T12:00:00.000Z"
  });
  const brief = validFactBrief(pipeline, spec);
  const atom = spec.sourceUnits.flatMap((unit) => unit.source_atoms)
    .find((candidate) => candidate.source_atom_id === brief.verse_briefs[0].facts[0].source_atom_id);
  const snippet = pipeline.evidenceSnippetsForAtom(atom).find((candidate) => /Assyrians/.test(candidate.text));
  const fact = brief.verse_briefs[0].facts[0];
  fact.statement = "Assyria harmed Jacob and emptied his fields.";
  fact.source_snippet_id = snippet.source_snippet_id;
  fact.evidence_quote = "SPARK PLACEHOLDER";
  fact.must_include_terms = ["emptied"];
  const hydrated = pipeline.hydrateFactBriefEvidence(brief, {chapterJobSpec: spec});
  assert.ok(hydrated.verse_briefs[0].facts[0].must_include_terms.includes("Assyrians"));
});

test("fact hydration derives verse relevance from source markers and prunes later-range detail", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const verseUnit = units.find((unit) => unit.unit_type === "verse_range");
  const atom = verseUnit.source_atoms.find((candidate) => candidate.atom_type === "commentary");
  atom.text = "FABRICATED (v. 1) Direct target material remains here with enough words to close this sentence clearly. " +
    "FABRICATED (v. 2) A later verse contains separate material with enough words to close this sentence clearly.";
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-11T12:00:00.000Z"
  });
  const brief = validFactBrief(pipeline, spec);
  const sourceAtom = spec.sourceUnits.flatMap((unit) => unit.source_atoms)
    .find((candidate) => candidate.source_atom_id === brief.verse_briefs[0].facts[0].source_atom_id);
  const snippets = pipeline.evidenceSnippetsForAtom(sourceAtom);
  const first = snippets.find((snippet) => /v\. 1/.test(snippet.text));
  const second = snippets.find((snippet) => /v\. 2/.test(snippet.text));
  brief.verse_briefs[0].facts = [
    {...brief.verse_briefs[0].facts[0], fact_id: "GEN.1.1:f01", source_snippet_id: first.source_snippet_id,
      evidence_quote: first.text, statement: "FABRICATED direct target material remains.", must_include_terms: ["target"]},
    {...brief.verse_briefs[0].facts[0], fact_id: "GEN.1.1:f02", source_snippet_id: second.source_snippet_id,
      evidence_quote: second.text, statement: "FABRICATED later material belongs to the next verse.", must_include_terms: ["later"]}
  ];
  const hydrated = pipeline.hydrateFactBriefEvidence(brief, {chapterJobSpec: spec});
  assert.equal(hydrated.verse_briefs[0].facts.length, 1);
  assert.equal(hydrated.verse_briefs[0].facts[0].verse_relevance, "target_marker");
});

test("fact hydration retains a required target-marked shared-range atom beside direct target evidence", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const verseUnit = units.find((unit) => unit.unit_type === "verse_range");
  const directAtom = verseUnit.source_atoms.find((atom) => atom.atom_type === "commentary");
  directAtom.text = "FABRICATED (v. 1) Direct target material remains here with enough words for this test.";
  const sharedAtom = {
    ...structuredClone(directAtom),
    source_atom_id: `${directAtom.source_atom_id}:shared-target`,
    sequence: directAtom.sequence + 1,
    text: "FABRICATED shared-range material remains available for the explicit target atom test."
  };
  verseUnit.source_atoms.push(sharedAtom);
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.6-luna", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-23T12:00:00.000Z"
  });
  const request = spec.requestedRecords.find((record) => record.verse_id === "GEN.1.1");
  request.target_marked_source_atom_ids = [...request.target_marked_source_atom_ids, sharedAtom.source_atom_id];
  request.verse_anchor_terms = [];
  const brief = validFactBrief(pipeline, spec);
  const sharedSnippet = pipeline.evidenceSnippetsForAtom(sharedAtom)[0];
  brief.verse_briefs[0].facts.push({
    ...brief.verse_briefs[0].facts[0],
    fact_id: "GEN.1.1:f02",
    statement: "FABRICATED shared-range material remains for the explicit target atom test.",
    source_atom_id: sharedAtom.source_atom_id,
    source_snippet_id: sharedSnippet.source_snippet_id,
    evidence_quote: sharedSnippet.text,
    must_include_terms: ["FABRICATED", "shared"]
  });
  const hydrated = pipeline.hydrateFactBriefEvidence(brief, {chapterJobSpec: spec});
  assert.deepEqual(hydrated.verse_briefs[0].facts.map((fact) => fact.source_atom_id), [
    directAtom.source_atom_id,
    sharedAtom.source_atom_id
  ]);
  assert.deepEqual(hydrated.verse_briefs[0].facts.map((fact) => fact.verse_relevance), [
    "target_marker",
    "shared_range_context"
  ]);
  assert.ok(hydrated.verse_briefs[0].facts.length <= 3);
});

test("the controller canonicalizes Spark evidence and shortens brittle writer anchors", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-11T12:00:00.000Z"
  });
  const brief = validFactBrief(pipeline, spec);
  brief.verse_briefs.forEach((verseBrief) => {
    verseBrief.facts[0].evidence_quote = "SPARK NEED NOT TRANSCRIBE THIS FIELD EXACTLY.";
    verseBrief.facts[0].must_include_terms = ["FABRICATED COMMENTARY TREATS VERSES"];
  });

  const hydrated = pipeline.hydrateFactBriefEvidence(brief, {chapterJobSpec: spec});
  const schema = json("schemas/mhc-fact-brief.schema.json");
  const validation = pipeline.validateFactBrief(hydrated, {schema, chapterJobSpec: spec});
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  hydrated.verse_briefs.forEach((verseBrief) => {
    const fact = verseBrief.facts[0];
    const atom = spec.sourceUnits.flatMap((unit) => unit.source_atoms)
      .find((candidate) => candidate.source_atom_id === fact.source_atom_id);
    const snippet = pipeline.evidenceSnippetsForAtom(atom)
      .find((candidate) => candidate.source_snippet_id === fact.source_snippet_id);
    assert.equal(fact.evidence_quote, snippet.text);
    assert.ok(fact.must_include_terms.every((term) => term.trim().split(/\s+/u).length === 1));
  });
});

test("the fact validator preserves Henry's likely qualification cue", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const source = units.find((unit) => unit.unit_type === "verse_range");
  const atom = source.source_atoms.find((candidate) => candidate.atom_type === "commentary");
  atom.text = "FABRICATED COMMENTARY very likely treats verses one and two together for testing only.";
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-11T12:00:00.000Z"
  });
  const brief = validFactBrief(pipeline, spec);
  brief.verse_briefs.forEach((verseBrief) => {
    verseBrief.facts[0].qualification = "uncertain";
    verseBrief.facts[0].must_include_terms = ["likely"];
  });
  const hydrated = pipeline.hydrateFactBriefEvidence(brief, {chapterJobSpec: spec});
  const validation = pipeline.validateFactBrief(hydrated, {
    schema: json("schemas/mhc-fact-brief.schema.json"), chapterJobSpec: spec
  });
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.ok(hydrated.verse_briefs.every((verseBrief) => verseBrief.facts[0].must_include_terms.includes("likely")));
});

test("fact hydration clears a pure qualification metadata mismatch but not statement hedging", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.6-luna", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-23T12:00:00.000Z"
  });
  const schema = json("schemas/mhc-fact-brief.schema.json");
  const metadataOnly = validFactBrief(pipeline, spec);
  metadataOnly.verse_briefs.forEach((brief) => { brief.facts[0].qualification = "uncertain"; });
  const normalized = pipeline.hydrateFactBriefEvidence(metadataOnly, {chapterJobSpec: spec});
  assert.ok(normalized.verse_briefs.every((brief) => brief.facts[0].qualification === "none"));
  assert.equal(pipeline.validateFactBrief(normalized, {schema, chapterJobSpec: spec}).valid, true);

  const hedgedStatement = validFactBrief(pipeline, spec);
  hedgedStatement.verse_briefs.forEach((brief) => {
    brief.facts[0].qualification = "uncertain";
    brief.facts[0].statement = "FABRICATED material may join verses one and two for testing only.";
  });
  const retained = pipeline.hydrateFactBriefEvidence(hedgedStatement, {chapterJobSpec: spec});
  assert.ok(retained.verse_briefs.every((brief) => brief.facts[0].qualification === "uncertain"));
  const validation = pipeline.validateFactBrief(retained, {schema, chapterJobSpec: spec});
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("qualification: uncertain lacks its corresponding cue")));
});

test("autonomous writer receives only the validated fact layer and must retain required terms", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-11T12:00:00.000Z"
  });
  const factBrief = validFactBrief(pipeline, spec);
  const prompt = pipeline.renderAutonomousWriterPrompt("FABRICATED WRITER CONTRACT", spec, factBrief);
  assert.match(prompt, /Validated Spark fact brief/);
  assert.match(prompt, /verses one and two/);
  assert.doesNotMatch(prompt, /"source_atoms"/);
  assert.doesNotMatch(prompt, /"worker_source_sha256"/);
  assert.doesNotMatch(prompt, /"evidence_quote"/);
  assert.doesNotMatch(prompt, /"source_snippet_id"/);

  const output = validChapterOutput(spec);
  output.records.forEach((record) => {
    record.blurb = "FABRICATED verses one and two share a compact treatment for testing only.";
  });
  const base = pipeline.validateChapterOutput(output, {
    schema: json("schemas/mhc-commentary-output.schema.json"), units, bookId: "GEN", chapter: 1,
    verseCount: 2, expectedMetadata: spec.metadata
  });
  let validation = pipeline.validateFactBoundChapterOutput(output, {factBrief, baseValidation: base});
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  output.records[0].blurb = "FABRICATED material shares a compact treatment for testing only.";
  validation = pipeline.validateFactBoundChapterOutput(output, {factBrief, baseValidation: base});
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes('omitted must-include term "verses"')));

  const inflectedBrief = structuredClone(factBrief);
  inflectedBrief.verse_briefs.forEach((brief) => { brief.facts[0].must_include_terms = ["instruct"]; });
  output.records.forEach((record) => {
    record.blurb = "FABRICATED material instructs the reader through a compact treatment for testing only.";
  });
  validation = pipeline.validateFactBoundChapterOutput(output, {factBrief: inflectedBrief, baseValidation: base});
  assert.equal(validation.valid, true, validation.errors.join("\n"));

  inflectedBrief.verse_briefs.forEach((brief) => { brief.facts[0].must_include_terms = ["Saviour"]; });
  validation = pipeline.validateFactBoundChapterOutput(output, {factBrief: inflectedBrief, baseValidation: base});
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes('omitted must-include term "Saviour"')));

  const admitted = pipeline.requireAutonomousAdmission({valid: true, errors: [], warnings: ["FABRICATED WARNING"]});
  assert.equal(admitted.valid, false);
  assert.ok(admitted.errors.some((error) => error.includes("requires zero warnings")));
});

test("fact extraction is split into bounded verse chunks before Spark repair", async () => {
  const controller = await import("../scripts/mhc-pipeline.mjs");
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-11T12:00:00.000Z"
  });
  const chunks = controller.buildFactChunks(spec, 1);
  assert.deepEqual(chunks.map((chunk) => chunk.chunkId), ["001-001", "002-002"]);
  assert.deepEqual(chunks.map((chunk) => chunk.chapterJobSpec.requestedRecords.map((record) => record.verse_id)), [
    ["GEN.1.1"], ["GEN.1.2"]
  ]);
  assert.ok(chunks.every((chunk) => chunk.chapterJobSpec.sourceUnits.length === 1));
  const writerChunks = controller.buildWriterChunks(spec, validFactBrief(pipeline, spec), 1);
  assert.deepEqual(writerChunks.map((chunk) => chunk.chunkId), ["001-001", "002-002"]);
  assert.deepEqual(writerChunks.map((chunk) => chunk.factBrief.verse_briefs.map((brief) => brief.verse_id)), [
    ["GEN.1.1"], ["GEN.1.2"]
  ]);
});

test("atom fallback isolates only missing target-marked atoms and preserves the selected worker", async () => {
  const controller = await import("../scripts/mhc-pipeline.mjs");
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const verseUnit = units.find((unit) => unit.unit_type === "verse_range");
  const firstAtom = verseUnit.source_atoms.find((atom) => atom.atom_type === "commentary");
  firstAtom.text = "FABRICATED (v. 1) FIRST TARGET DETAIL for atom fallback testing.";
  const secondAtom = {
    ...structuredClone(firstAtom),
    source_atom_id: `${firstAtom.source_atom_id}:second-target`,
    sequence: firstAtom.sequence + 1,
    text: "FABRICATED (v. 1) SECOND TARGET DETAIL for atom fallback testing."
  };
  verseUnit.source_atoms.push(secondAtom);
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.6-luna", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-23T12:00:00.000Z"
  });
  const firstRequest = spec.requestedRecords.find((record) => record.verse_id === "GEN.1.1");
  assert.deepEqual(firstRequest.target_marked_source_atom_ids, [firstAtom.source_atom_id, secondAtom.source_atom_id]);
  const brief = validFactBrief(pipeline, spec);
  assert.deepEqual(controller.missingRequiredTargetAtomIds({factBrief: brief, chapterJobSpec: spec}), [secondAtom.source_atom_id]);
  assert.equal(controller.onlyMissingTargetAtomErrors({
    validation: {errors: [`$.verse_briefs[0].facts: target-marked atom ${secondAtom.source_atom_id} needs a required fact`]},
    missingAtomIds: [secondAtom.source_atom_id]
  }), true);
  assert.equal(controller.onlyMissingTargetAtomErrors({
    validation: {errors: ["$.verse_briefs[0].facts[0].qualification: fabricated unrelated failure"]},
    missingAtomIds: [secondAtom.source_atom_id]
  }), false);

  const restricted = controller.buildAtomRestrictedFactChapterSpec({
    chapterJobSpec: spec,
    verseId: "GEN.1.1",
    atomId: secondAtom.source_atom_id
  });
  assert.equal(restricted.metadata.worker_model, "gpt-5.6-luna");
  assert.deepEqual(restricted.requestedRecords[0].allowed_source_atom_ids, [secondAtom.source_atom_id]);
  assert.deepEqual(restricted.requestedRecords[0].target_marked_source_atom_ids, [secondAtom.source_atom_id]);
  assert.deepEqual(restricted.sourceUnits[0].source_atoms.map((atom) => atom.source_atom_id), [secondAtom.source_atom_id]);
});

test("atom fallback merge deduplicates safely and deterministically renumbers model facts", async () => {
  const controller = await import("../scripts/mhc-pipeline.mjs");
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const verseUnit = units.find((unit) => unit.unit_type === "verse_range");
  const firstAtom = verseUnit.source_atoms.find((atom) => atom.atom_type === "commentary");
  firstAtom.text = "FABRICATED (v. 1) FIRST TARGET DETAIL for deterministic merge testing.";
  const secondAtom = {
    ...structuredClone(firstAtom),
    source_atom_id: `${firstAtom.source_atom_id}:merge-target`,
    sequence: firstAtom.sequence + 1,
    text: "FABRICATED (v. 1) SECOND TARGET DETAIL for deterministic merge testing."
  };
  verseUnit.source_atoms.push(secondAtom);
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.6-luna", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-23T12:00:00.000Z"
  });
  const existing = validFactBrief(pipeline, spec);
  const child = structuredClone(existing);
  const secondSnippet = pipeline.evidenceSnippetsForAtom(secondAtom)[0];
  child.verse_briefs[0].facts = [{
    ...child.verse_briefs[0].facts[0],
    fact_id: "GEN.1.1:f99",
    statement: "FABRICATED second target detail is supplied for merge testing only.",
    source_atom_id: secondAtom.source_atom_id,
    source_snippet_id: secondSnippet.source_snippet_id,
    evidence_quote: secondSnippet.text,
    must_include_terms: ["FABRICATED", "SECOND"]
  }, {
    ...child.verse_briefs[0].facts[0],
    fact_id: "GEN.1.1:f98",
    statement: "FABRICATED second target detail is supplied for merge testing only.",
    source_atom_id: secondAtom.source_atom_id,
    source_snippet_id: secondSnippet.source_snippet_id,
    evidence_quote: secondSnippet.text,
    must_include_terms: ["FABRICATED", "SECOND"]
  }];
  const merged = controller.mergeAtomFallbackFacts({factBrief: existing, atomFactBrief: child, verseId: "GEN.1.1"});
  assert.deepEqual(merged.verse_briefs[0].facts.map((fact) => fact.fact_id), ["GEN.1.1:f01", "GEN.1.1:f02"]);
  assert.deepEqual(merged.verse_briefs[0].facts.map((fact) => fact.source_atom_id), [firstAtom.source_atom_id, secondAtom.source_atom_id]);
});

test("qualification atom fallback identifies cue-only failures and replaces only the indexed fabricated fact", async () => {
  const controller = await import("../scripts/mhc-pipeline.mjs");
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.6-luna", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-23T12:00:00.000Z"
  });
  const schema = json("schemas/mhc-fact-brief.schema.json");
  const invalid = validFactBrief(pipeline, spec);
  invalid.verse_briefs[0].facts[0].qualification = "uncertain";
  invalid.verse_briefs[0].facts[0].statement = "FABRICATED material may join verses one and two for testing only.";
  const validation = pipeline.validateFactBrief(invalid, {schema, chapterJobSpec: spec});
  assert.equal(validation.valid, false);
  const offending = controller.qualificationCueOffendingFacts({validation, factBrief: invalid});
  assert.deepEqual(offending, [{briefIndex: 0, factIndex: 0, sourceAtomId: invalid.verse_briefs[0].facts[0].source_atom_id}]);
  assert.equal(controller.qualificationCueOffendingFacts({
    validation: {errors: [...validation.errors, "$.verse_briefs[0].facts[0].statement: fabricated unrelated error"]},
    factBrief: invalid
  }), null);

  const restricted = controller.buildAtomRestrictedFactChapterSpec({
    chapterJobSpec: spec,
    verseId: "GEN.1.1",
    atomId: invalid.verse_briefs[0].facts[0].source_atom_id,
    requireExistingTarget: false
  });
  assert.equal(restricted.metadata.worker_model, "gpt-5.6-luna");
  const replacementBrief = validFactBrief(pipeline, spec);
  const repaired = controller.replaceQualificationCueFacts({
    factBrief: invalid,
    replacements: [{factIndex: 0, fact: replacementBrief.verse_briefs[0].facts[0]}],
    verseId: "GEN.1.1"
  });
  assert.equal(repaired.verse_briefs[0].facts[0].fact_id, "GEN.1.1:f01");
  assert.equal(repaired.verse_briefs[0].facts[0].qualification, "none");
  assert.equal(pipeline.validateFactBrief(repaired, {schema, chapterJobSpec: spec}).valid, true);
});

test("explicit omission fallback isolates one target-marked fabricated atom for identity and relation repair", async () => {
  const controller = await import("../scripts/mhc-pipeline.mjs");
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const verseUnit = units.find((unit) => unit.unit_type === "verse_range");
  const targetAtom = verseUnit.source_atoms.find((atom) => atom.atom_type === "commentary");
  targetAtom.text = "FABRICATED (v. 1) EXPLICIT TARGET DETAIL —Testperson and his spokesman Testspeaker.";
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.6-luna", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-23T12:00:00.000Z"
  });
  const schema = json("schemas/mhc-fact-brief.schema.json");
  const invalid = validFactBrief(pipeline, spec);
  invalid.verse_briefs.forEach((brief) => { brief.facts[0].must_include_terms = ["FABRICATED", "TARGET"]; });
  const validation = pipeline.validateFactBrief(invalid, {schema, chapterJobSpec: spec});
  assert.equal(validation.valid, false);
  const requirements = controller.explicitOmissionRequirements({validation, factBrief: invalid, chapterJobSpec: spec});
  assert.ok(requirements, validation.errors.join("\n"));
  assert.deepEqual(requirements.map((requirement) => requirement.kind), ["identity", "identity", "relation"]);
  assert.ok(requirements.every((requirement) => controller.uniqueTargetMarkedAtomForRequirement({
    chapterJobSpec: spec, verseId: "GEN.1.1", terms: requirement.terms
  }) === targetAtom.source_atom_id));
  assert.equal(controller.explicitOmissionRequirements({
    validation: {errors: [...validation.errors, "$.verse_briefs[0].facts[0].statement: fabricated unrelated error"]},
    factBrief: invalid,
    chapterJobSpec: spec
  }), null);

  const restricted = controller.buildAtomRestrictedFactChapterSpec({
    chapterJobSpec: spec,
    verseId: "GEN.1.1",
    atomId: targetAtom.source_atom_id,
    requiredIdentityTerms: ["Testperson", "Testspeaker"],
    requiredRelations: [{term: "Testspeaker", relation: "spokesman"}]
  });
  assert.equal(restricted.metadata.worker_model, "gpt-5.6-luna");
  assert.deepEqual(restricted.requestedRecords[0].required_explicit_identity_terms, ["Testperson", "Testspeaker"]);
  const replacement = structuredClone(invalid.verse_briefs[0].facts[0]);
  replacement.statement = "Testperson acts through his spokesman Testspeaker in this fabricated detail.";
  replacement.must_include_terms = ["Testperson", "Testspeaker", "spokesman"];
  assert.equal(controller.factCarriesExplicitRequirements(replacement, ["Testperson", "Testspeaker", "spokesman"]), true);
  const repaired = controller.replaceExplicitOmissionFacts({
    factBrief: invalid,
    replacements: [{factIndex: 0, fact: replacement}],
    verseId: "GEN.1.1"
  });
  assert.equal(pipeline.validateFactBrief(repaired, {schema, chapterJobSpec: spec}).valid, true);
});

test("chapter job requests identify atoms that explicitly mark the target verse", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const verseUnit = units.find((unit) => unit.unit_type === "verse_range");
  const targetAtom = verseUnit.source_atoms.find((atom) => atom.atom_type === "commentary");
  targetAtom.text = "FABRICATED (v. 1) EXPLICIT TARGET DETAIL —Testperson and his spokesman Testspeaker.";
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-11T12:00:00.000Z"
  });
  assert.deepEqual(spec.requestedRecords[0].target_marked_source_atom_ids, [targetAtom.source_atom_id]);
  assert.deepEqual(spec.requestedRecords[0].required_explicit_identity_terms, ["Testperson", "Testspeaker"]);
  assert.deepEqual(spec.requestedRecords[0].required_explicit_relations, [{term: "Testspeaker", relation: "spokesman"}]);
  assert.deepEqual(spec.requestedRecords[1].target_marked_source_atom_ids, []);
  assert.deepEqual(spec.requestedRecords[1].required_explicit_identity_terms, []);
  assert.deepEqual(spec.requestedRecords[1].required_explicit_relations, []);
});

test("citation-like OSIS abbreviations are not required person identities", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const verseUnit = units.find((unit) => unit.unit_type === "verse_range");
  const targetAtom = verseUnit.source_atoms.find((atom) => atom.atom_type === "commentary");
  targetAtom.text = "FABRICATED (v. 1) A later citation called Isa.";
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-23T12:00:00.000Z"
  });
  assert.deepEqual(spec.requestedRecords[0].required_explicit_identity_terms, []);
  targetAtom.text = "FABRICATED (v. 1) The messenger named Testperson brings the report for testing only.";
  const personSpec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-23T12:00:00.000Z"
  });
  assert.deepEqual(personSpec.requestedRecords[0].required_explicit_identity_terms, ["Testperson"]);
});

test("ordinary words after a relationship noun are not treated as proper names", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const verseUnit = units.find((unit) => unit.unit_type === "verse_range");
  const targetAtom = verseUnit.source_atoms.find((atom) => atom.atom_type === "commentary");
  targetAtom.text = "FABRICATED (v. 1) Her husband wears a conspicuously fabricated coat.";
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-11T12:00:00.000Z"
  });
  assert.deepEqual(spec.requestedRecords[0].required_explicit_relations, []);
});

test("Roman-numeral chapter cross-references are not mistaken for target verse markers", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const verseUnit = units.find((unit) => unit.unit_type === "verse_range");
  const targetAtom = verseUnit.source_atoms.find((atom) => atom.atom_type === "commentary");
  targetAtom.text = "FABRICATED (v. 1) DIRECT DETAIL. A separate citation is Isa. v. 2.";
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-11T12:00:00.000Z"
  });
  assert.deepEqual(spec.requestedRecords[0].target_marked_source_atom_ids, [targetAtom.source_atom_id]);
  assert.deepEqual(spec.requestedRecords[1].target_marked_source_atom_ids, []);
});

test("current worker validation rejects indirect source-reporting scaffolds", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-11T12:00:00.000Z"
  });
  for (const phrase of ["The note says this fabricated detail matters.", "The text likens this fabricated detail to another.", "The warning is that this fabricated detail matters.", "Tradition ties this fabricated detail to another.", "This is treated as a fabricated warning.", "Traditions are cited for this fabricated detail.", "This passage asks why the fabricated detail matters.", "The burden introduces a fabricated detail.", "The detail is presented as important.", "This consequence is treated as certain.", "The event is announced as final.", "The person is described as faithful.", "The messenger is pictured coming near.", "The detail is likened to a fabricated object."]) {
    const output = validChapterOutput(spec);
    output.records[0].blurb = phrase;
    const validation = pipeline.validateChapterOutput(output, {
      schema: json("schemas/mhc-commentary-output.schema.json"), units, bookId: "GEN", chapter: 1,
      verseCount: 2, expectedMetadata: spec.metadata
    });
    assert.equal(validation.valid, false, phrase);
    assert.ok(validation.errors.some((error) => error.includes("source-reporting phrase")), phrase);
  }

  const directOutput = validChapterOutput(spec);
  directOutput.records[0].blurb = "His fabricated power is shown through the supplied fabricated event.";
  const directValidation = pipeline.validateChapterOutput(directOutput, {
    schema: json("schemas/mhc-commentary-output.schema.json"), units, bookId: "GEN", chapter: 1,
    verseCount: 2, expectedMetadata: spec.metadata
  });
  assert.equal(directValidation.valid, true, directValidation.errors.join("\n"));
});

test("current worker validation requires explicit identities from target-marked atoms", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const verseUnit = units.find((unit) => unit.unit_type === "verse_range");
  const targetAtom = verseUnit.source_atoms.find((atom) => atom.atom_type === "commentary");
  targetAtom.text = "FABRICATED (v. 1) EXPLICIT TARGET DETAIL —Testperson and his spokesman Testspeaker.";
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-11T12:00:00.000Z"
  });
  const output = validChapterOutput(spec);
  let validation = pipeline.validateChapterOutput(output, {
    schema: json("schemas/mhc-commentary-output.schema.json"), units, bookId: "GEN", chapter: 1,
    verseCount: 2, expectedMetadata: spec.metadata
  });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes('omitted explicit identity "Testperson"')));
  assert.ok(validation.errors.some((error) => error.includes('omitted explicit identity "Testspeaker"')));
  output.records[0].blurb = "Testperson works through his spokesman Testspeaker in this conspicuously fabricated condensation.";
  validation = pipeline.validateChapterOutput(output, {
    schema: json("schemas/mhc-commentary-output.schema.json"), units, bookId: "GEN", chapter: 1,
    verseCount: 2, expectedMetadata: spec.metadata
  });
  assert.equal(validation.valid, true, validation.errors.join("\n"));
});

test("current worker validation preserves explicit roles and catches misspelled proper names", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const verseUnit = units.find((unit) => unit.unit_type === "verse_range");
  const targetAtom = verseUnit.source_atoms.find((atom) => atom.atom_type === "commentary");
  targetAtom.text = "FABRICATED (v. 1) EXPLICIT TARGET DETAIL —Testperson and his spokesman Testspeaker.";
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
    generatedAt: "2026-08-11T12:00:00.000Z"
  });
  const output = validChapterOutput(spec);
  output.records[0].blurb = "Testperson and Testspeaker oppose Midspelledname in this conspicuously fabricated condensation.";
  const validation = pipeline.validateChapterOutput(output, {
    schema: json("schemas/mhc-commentary-output.schema.json"), units, bookId: "GEN", chapter: 1,
    verseCount: 2, expectedMetadata: spec.metadata
  });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes('explicit relation "spokesman Testspeaker"')));
  assert.ok(validation.errors.some((error) => error.includes('capitalized term "Midspelledname"')));
});

test("chapter validation rejects unknown and non-covering source-unit references", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
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
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
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
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
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
    worker_model: "gpt-5.3-codex-spark"
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

test("validation repair prompts preserve the full contract and give exact deterministic errors", async () => {
  const controller = await import("../scripts/mhc-pipeline.mjs");
  const prompt = controller.renderValidationRepairPrompt({
    prompt: "FABRICATED COMPLETE WORKER CONTRACT",
    output: {schema_version: "fabricated/v1", records: [{verse_id: "GEN.1.1"}]},
    validation: {errors: ["FABRICATED ERROR: omitted explicit identity Testperson"]}
  });
  assert.match(prompt, /FABRICATED COMPLETE WORKER CONTRACT/);
  assert.match(prompt, /omitted explicit identity Testperson/);
  assert.match(prompt, /Return the entire corrected JSON object/);
  assert.match(prompt, /Make the smallest possible correction/);
  assert.match(prompt, /Do not remove a required term while fixing another defect/);
  assert.match(prompt, /"verse_id": "GEN\.1\.1"/);
});

test("fact-brief repair prompt gives Luna-low explicit target-atom and qualification recovery rules", async () => {
  const {renderFactRepairPrompt} = await import("../scripts/mhc-pipeline.mjs");
  const prompt = renderFactRepairPrompt({
    prompt: "FABRICATED FACT CONTRACT",
    output: {schema_version: "mhc-fact-brief/v2", verse_briefs: []},
    validation: {errors: [
      "FABRICATED target-marked atom needs a required fact",
      "FABRICATED qualification: uncertain lacks its corresponding cue"
    ]}
  });
  assert.match(prompt, /Every named target_marked_source_atom_id needs at least one fact with importance "required"/);
  assert.match(prompt, /choose an allowed evidence snippet and short must_include_terms cue that actually contains the required cue/);
  assert.match(prompt, /set qualification to "none" and remove unsupported hedging/);
});

test("hash-bound human review overrides replace only named verse blurbs and preserve raw provenance", async () => {
  const controller = await import("../scripts/mhc-pipeline.mjs");
  const output = {
    records: [
      {verse_id: "GEN.1.1", blurb: "FABRICATED ORIGINAL ONE", source_atom_ids: ["fabricated:a1"]},
      {verse_id: "GEN.1.2", blurb: "FABRICATED ORIGINAL TWO", source_atom_ids: ["fabricated:a2"]}
    ]
  };
  const review = {
    schema_version: "mhc-human-review-overrides/v1",
    reading_id: "FABRICATED-READING",
    job_id: "GEN-001",
    fingerprint: "f".repeat(64),
    prompt_version: "mhc-worker/v11",
    base_output_sha256: "a".repeat(64),
    reviewed_at: "2026-08-11T12:00:00Z",
    reviewer: "FABRICATED REVIEWER",
    status: "in_review",
    corrections: [{
      verse_id: "GEN.1.1",
      blurb: "FABRICATED REVIEWED ONE",
      reason: "FABRICATED REVIEW REASON"
    }]
  };
  const applied = controller.applyReviewCorrections({
    output,
    review,
    expectedReadingId: review.reading_id,
    jobSpec: {metadata: {job_id: review.job_id, prompt_version: review.prompt_version}},
    fingerprint: review.fingerprint,
    baseOutputSha256: review.base_output_sha256
  });
  assert.equal(output.records[0].blurb, "FABRICATED ORIGINAL ONE");
  assert.equal(applied.output.records[0].blurb, "FABRICATED REVIEWED ONE");
  assert.equal(applied.output.records[1].blurb, "FABRICATED ORIGINAL TWO");
  assert.deepEqual(applied.humanReview.corrected_verse_ids, ["GEN.1.1"]);
  assert.throws(() => controller.applyReviewCorrections({
    output,
    review,
    expectedReadingId: review.reading_id,
    jobSpec: {metadata: {job_id: review.job_id, prompt_version: review.prompt_version}},
    fingerprint: review.fingerprint,
    baseOutputSha256: "b".repeat(64)
  }), /do not match the exact/);
});

test("source, prompt, schema, model, and fact-brief changes invalidate job fingerprints", async () => {
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
    {...baseline, worker_model: "gpt-two"},
    {...baseline, fact_brief_hash: "f".repeat(64), fact_prompt_version: "mhc-fact-extractor/v8"}
  ].map(jobFingerprint);
  assert.equal(new Set(fingerprints).size, fingerprints.length);
});

test("chapter export produces a compact verse-keyed runtime shard with provenance", async () => {
  const {pipeline, units, sourceManifest} = await normalizedFixture();
  const spec = pipeline.buildChapterJobSpec({
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN", chapter: 1, verseCount: 2,
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
    units, sourceManifest, model: "gpt-5.3-codex-spark", bookId: "GEN",
    generatedAt: "2026-08-10T12:00:00.000Z"
  });
  const source = spec.sourceUnits[0];
  const output = {
    ...spec.metadata,
    resource: {
      resource_id: "intro-GEN",
      book_id: "GEN",
      resource_type: "book_intro",
      blurb: "This fabricated book-level test summary remains distinct from every verse record.",
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

test("schedule resolution supports the interactive window and caller-selected activation counts", async () => {
  const {resolveScheduledBatch, resolveScheduledReading, resolveScheduledWindow} = await import("../scripts/lib/mhc-pipeline.mjs");
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
  assert.throws(() => resolveScheduledWindow({plan, appConfig, today: "2026-08-10", daysAhead: 3}), /interactive rolling audit window/);

  const activation = resolveScheduledBatch({
    plan,
    appConfig,
    today: "2026-08-10",
    startReadingId: "CC-Y3Q4-D057",
    readingCount: 2
  });
  assert.equal(activation.readingCount, 2);
  assert.deepEqual(activation.targets.map((target) => target.entry.readingId), ["CC-Y3Q4-D057", "CC-Y3Q4-D058"]);
  const fiveReadings = resolveScheduledWindow({plan, appConfig, today: "2026-08-10", readingCount: 5});
  assert.deepEqual(fiveReadings.targets.map((target) => target.entry.readingId), [
    "CC-Y3Q4-D056", "CC-Y3Q4-D057", "CC-Y3Q4-D058", "CC-Y3Q4-D059", "CC-Y3Q4-D060"
  ]);
  assert.throws(() => resolveScheduledBatch({
    plan, appConfig, today: "2026-08-10", startReadingId: "CC-Y3Q4-D056", readingCount: 15
  }), /between 1 and 14/);
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
      readingCount: 1,
      daysAhead: 0,
      windowStartDate: "2026-08-11",
      windowEndDate: "2026-08-11"
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

test("current-prompt portable readings reject source-reporting edits before storage", async () => {
  const controller = await import("../scripts/mhc-pipeline.mjs");
  const runtime = {
    schema_version: "mhc-runtime/v1",
    source_id: "fabricated-mhc-test",
    source_version: "test-only",
    source_archive_sha256: "a".repeat(64),
    source_manifest_ref: "FABRICATED-TEST-MANIFEST",
    worker_model: "gpt-5.3-codex-spark",
    prompt_version: "mhc-autonomous-writer/v5",
    generation_timestamp: "2026-08-11T12:00:00.000Z",
    validation_status: "valid",
    review_status: "unreviewed",
    label: "Matthew Henry — condensed paraphrase",
    book_id: "NAM",
    chapter: 1,
    records: {
      "NAM.1.1": {
        blurb: "Henry treats this fabricated detail as important.",
        coverage_type: "direct",
        scope_note: "Fabricated direct scope.",
        source_unit_ids: ["fabricated:NAM:001:001"],
        source_reference_label: "FABRICATED Nahum 1:1"
      }
    }
  };
  assert.throws(() => controller.buildPortableWindowReading({
    plan: {planVersion: "fabricated-plan-v1"},
    scheduledResult: {
      target: {
        scheduleDate: "2026-08-11",
        dayIndex: 4,
        timezone: "America/Detroit"
      },
      audit: {
        reading_id: "CC-Y3Q4-D057",
        source_plan_day: 57,
        worker_model: "gpt-5.3-codex-spark",
        prompt_version: "mhc-autonomous-writer/v5",
        review_status: "unreviewed",
        human_review: {status: "required"}
      },
      passageResults: [{book_id: "NAM", chapter: 1, verse_count: 1, runtime}]
    }
  }), /forbidden source-reporting phrase/);
});

test("plan generators can request a bounded count while the durable catalog retains earlier readings", async () => {
  const controller = await import("../scripts/mhc-pipeline.mjs");
  const schema = json("schemas/mhc-activation.schema.json");
  const {validateAgainstSchema} = await import("../scripts/lib/schema-validator.mjs");
  const request = {
    schema_version: "mhc-activation-request/v1",
    request_id: "fabricated-generator-001",
    plan_version: "fabricated-plan-v1",
    requested_by: "fabricated-plan-generator",
    start_reading_id: "CC-Y3Q4-D057",
    reading_count: 1,
    worker_model: "gpt-5.3-codex-spark",
    reason: "FABRICATED ACTIVATION FOR CONTRACT TESTING ONLY"
  };
  assert.deepEqual(validateAgainstSchema(request, {...schema, $ref: "#/$defs/request"}), []);
  assert.equal(controller.parseArgs(["activate", "--request", "/tmp/fabricated-request.json", "--dry-run"]).request,
    "/tmp/fabricated-request.json");

  const descriptor = (readingId, dayIndex, checksum) => ({
    reading_id: readingId,
    schedule_date: `2026-08-${String(dayIndex + 7).padStart(2, "0")}`,
    day_index: dayIndex,
    source_plan_day: dayIndex + 53,
    file: `plans/fabricated-plan-v1-aaaaaaaaaaaa/readings/${readingId}.${checksum.slice(0, 16)}.json`,
    sha256: checksum,
    passage_count: 1,
    worker_model: "gpt-5.3-codex-spark",
    prompt_version: "mhc-worker/v4",
    review_status: "unreviewed",
    human_review_status: "required"
  });
  const plan = {planVersion: request.plan_version};
  const firstStoredAt = "2026-08-10T12:00:00.000Z";
  const updatedAt = "2026-08-10T13:00:00.000Z";
  const prior = controller.buildLibraryCatalog({
    plan,
    priorCatalog: null,
    storedAt: firstStoredAt,
    readings: [descriptor("CC-Y3Q4-D056", 3, "a".repeat(64))]
  });
  const merged = controller.buildLibraryCatalog({
    plan,
    priorCatalog: prior,
    storedAt: updatedAt,
    readings: [descriptor("CC-Y3Q4-D057", 4, "b".repeat(64))]
  });
  assert.deepEqual(merged.readings.map((reading) => reading.reading_id), ["CC-Y3Q4-D056", "CC-Y3Q4-D057"]);
  assert.equal(merged.readings[0].first_stored_at, firstStoredAt);
  assert.equal(merged.readings[0].last_stored_at, firstStoredAt);
  assert.equal(merged.readings[1].last_stored_at, updatedAt);
  assert.deepEqual(validateAgainstSchema(merged, {...schema, $ref: "#/$defs/catalog"}), []);

  const pointer = controller.buildLibraryPointer({
    plan,
    catalogFile: "plans/fabricated-plan-v1-aaaaaaaaaaaa/catalog.json",
    catalogSha256: "c".repeat(64),
    updatedAt
  });
  assert.deepEqual(validateAgainstSchema(pointer, {...schema, $ref: "#/$defs/pointer"}), []);
  const privateRoot = path.join(__dirname, "../private-commentary/mhc");
  const result = controller.buildActivationResult({
    request,
    completedAt: updatedAt,
    scheduledResults: [{audit: {reading_id: "CC-Y3Q4-D057"}}],
    store: {
      manifestPath: path.join(privateRoot, "stores/current-window/manifest.json"),
      manifestSha256: "d".repeat(64),
      catalogPath: path.join(privateRoot, "stores/library/plans/fabricated-plan-v1-aaaaaaaaaaaa/catalog.json"),
      catalogSha256: "e".repeat(64)
    }
  });
  assert.deepEqual(validateAgainstSchema(result, {...schema, $ref: "#/$defs/result"}), []);
  assert.equal(result.requested_reading_count, 1);
  assert.equal(result.contains_scripture, false);
  assert.equal(result.publication_status, "not_published");
});

test("main-thread ensure requests reuse sound readings and select only missing targets for Spark", async () => {
  const controller = await import("../scripts/mhc-pipeline.mjs");
  const schema = json("schemas/mhc-ensure.schema.json");
  const {validateAgainstSchema} = await import("../scripts/lib/schema-validator.mjs");
  const request = {
    schema_version: "mhc-ensure-request/v1",
    request_id: "fabricated-main-thread-001",
    plan_version: "fabricated-plan-v1",
    requested_by: "fabricated-main-thread",
    start_reading_id: "CC-Y3Q4-D056",
    reading_count: 2,
    worker_model: "gpt-5.3-codex-spark",
    generation_mode: "spark-autonomous-chunked-two-stage/v4",
    only_if_missing: true,
    reason: "FABRICATED ENSURE REQUEST FOR TESTING ONLY"
  };
  assert.deepEqual(validateAgainstSchema(request, {...schema, $ref: "#/$defs/request"}), []);
  assert.equal(controller.parseArgs(["ensure", "--request", "/tmp/fabricated-ensure.json", "--dry-run"]).request,
    "/tmp/fabricated-ensure.json");
  const targets = ["CC-Y3Q4-D056", "CC-Y3Q4-D057"].map((readingId, index) => ({
    entry: {readingId},
    dayIndex: index + 1
  }));
  const partition = controller.partitionTargetsByAvailability({
    targets,
    availableReadingIds: ["CC-Y3Q4-D056"]
  });
  assert.deepEqual(partition.reused.map((target) => target.entry.readingId), ["CC-Y3Q4-D056"]);
  assert.deepEqual(partition.missing.map((target) => target.entry.readingId), ["CC-Y3Q4-D057"]);

  const result = controller.buildEnsureResult({
    request,
    completedAt: "2026-08-11T12:00:00.000Z",
    window: {targets},
    generatedReadingIds: ["CC-Y3Q4-D057"],
    reusedReadingIds: ["CC-Y3Q4-D056"],
    catalogPath: path.join(__dirname, "../private-commentary/mhc/stores/library/plans/fabricated/catalog.json"),
    catalogSha256: "a".repeat(64)
  });
  assert.deepEqual(validateAgainstSchema(result, {...schema, $ref: "#/$defs/result"}), []);
  assert.equal(result.status, "ready");
  assert.equal(result.generation_mode, "spark-autonomous-chunked-two-stage/v4");
  assert.deepEqual(result.generated_reading_ids, ["CC-Y3Q4-D057"]);
  assert.deepEqual(result.reused_reading_ids, ["CC-Y3Q4-D056"]);
  const workerModels = controller.ensureWorkerModels({
    window: {targets},
    scheduledResults: [{audit: {reading_id: "CC-Y3Q4-D057", worker_models: ["gpt-5.6-luna"]}}],
    catalog: {
      worker_models: ["gpt-5.3-codex-spark", "gpt-5.6-luna"],
      readings: [
        {reading_id: "CC-Y3Q4-D056", worker_models: ["gpt-5.3-codex-spark"]},
        {reading_id: "CC-Y3Q4-D057", worker_models: ["gpt-5.6-luna"]},
        {reading_id: "CC-Y3Q4-D099", worker_models: ["gpt-5.3-codex-spark"]}
      ]
    }
  });
  assert.deepEqual(workerModels, ["gpt-5.3-codex-spark", "gpt-5.6-luna"]);
  const lunaOnly = controller.ensureWorkerModels({
    window: {targets: [targets[1]]}, scheduledResults: [],
    catalog: {readings: [{reading_id: "CC-Y3Q4-D057", worker_models: ["gpt-5.6-luna"]},
      {reading_id: "CC-Y3Q4-D099", worker_models: ["gpt-5.3-codex-spark"]}]}
  });
  assert.deepEqual(lunaOnly, ["gpt-5.6-luna"]);
});

test("confirmed exact-Spark quota and availability failures never enter the retry path", async () => {
  const controller = await import("../scripts/mhc-pipeline.mjs");
  const quotaText = "ERROR: You've hit your usage limit for GPT-5.3-Codex-Spark. Switch to another model now, or try again later.";
  const quota = controller.classifySparkAvailabilityFailure({
    model: "gpt-5.3-codex-spark",
    text: quotaText
  });
  assert.deepEqual(quota, {
    code: "SPARK_QUOTA_UNAVAILABLE",
    message: "The exact gpt-5.3-codex-spark worker is unavailable because its usage quota is exhausted."
  });
  assert.equal(controller.shouldRetryCodexFailure({model: "gpt-5.3-codex-spark", text: quotaText}), false);

  const unavailable = controller.classifySparkAvailabilityFailure({
    model: "gpt-5.3-codex-spark",
    text: "Requested model gpt-5.3-codex-spark is unavailable."
  });
  assert.equal(unavailable.code, "SPARK_MODEL_UNAVAILABLE");
  assert.equal(controller.shouldRetryCodexFailure({
    model: "gpt-5.3-codex-spark",
    text: "Requested model gpt-5.3-codex-spark is unavailable."
  }), false);

  assert.equal(controller.shouldRetryCodexFailure({
    model: "gpt-5.3-codex-spark",
    text: "temporary network timeout; try again"
  }), true);
});

test("durable store pointers are replaced atomically only after immutable readings", () => {
  const source = fs.readFileSync(path.join(__dirname, "../scripts/mhc-pipeline.mjs"), "utf8");
  assert.match(source, /await rename\(temporaryPath, filePath\)/);
  const writer = source.slice(source.indexOf("async function writePortableStores"), source.indexOf("async function scheduleNext"));
  const contentWrite = writer.indexOf("writeContentAddressed(outputPath");
  const catalogWrite = writer.indexOf("writeJsonAtomic(catalogPath");
  const pointerWrite = writer.indexOf("writeJsonAtomic(pointerPath");
  const windowWrite = writer.indexOf("writeJsonAtomic(manifestPath");
  assert.ok(contentWrite >= 0 && contentWrite < catalogWrite);
  assert.ok(catalogWrite < pointerWrite);
  assert.ok(pointerWrite < windowWrite);
  assert.doesNotMatch(writer, /unlink|rmSync|rmdir/);
});

test("Codex worker arguments are ephemeral, standard-speed, read-only, and single-agent", async () => {
  const {codexExecArgs} = await import("../scripts/mhc-pipeline.mjs");
  const args = codexExecArgs({
    model: "gpt-5.3-codex-spark",
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

test("a silent Codex child times out once, terminates safely, and remains a transient retry failure", async () => {
  const {collectCodexChild, shouldRetryCodexFailure} = await import("../scripts/mhc-pipeline.mjs");
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.end = (prompt) => { child.prompt = prompt; };
  const signals = [];
  child.kill = (signal) => { signals.push(signal); return true; };
  const timers = [];
  const cleared = [];
  const resultPromise = collectCodexChild({
    child,
    prompt: "FABRICATED TEST PROMPT ONLY",
    timeoutMs: 20,
    setTimer: (callback) => {
      const handle = {callback};
      timers.push(handle);
      return handle;
    },
    clearTimer: (handle) => { cleared.push(handle); }
  });
  assert.equal(child.prompt, "FABRICATED TEST PROMPT ONLY");
  assert.equal(timers.length, 1);
  timers[0].callback();
  const result = await resultPromise;
  assert.equal(result.error.code, "CODEX_INVOCATION_TIMEOUT");
  assert.match(result.stderr, /CODEX_INVOCATION_TIMEOUT/);
  assert.deepEqual(signals, ["SIGTERM"]);
  assert.equal(shouldRetryCodexFailure({model: "gpt-5.6-luna", text: result.error.message}), true);
  assert.equal(timers.length, 2);
  child.emit("close", 0);
  assert.ok(cleared.includes(timers[1]));
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
    "schemas/mhc-book-intro-output.schema.json",
    "schemas/mhc-fact-brief.schema.json"
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
