#!/usr/bin/env node

import {createHash} from "node:crypto";
import {access, readFile, readdir} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {assertSchemaValid} from "./lib/schema-validator.mjs";
import {supportsSourceSetVersion, validateRegistryProvenance} from "./validate-source-registry.mjs";

const ROOT = process.cwd();
const REQUIRE_PRIVATE = process.argv.includes("--require");
const REGISTRY_PATH = path.join(ROOT, "research/working/bridge-source-registry.json");
const SCHEMA_PATH = path.join(ROOT, "schemas/commentary.schema.json");
const SOURCE_SCHEMA_PATH = path.join(ROOT, "schemas/source.schema.json");
const MHC_RUNTIME_SCHEMA_PATH = path.join(ROOT, "schemas/mhc-runtime.schema.json");
const PLAN_PATH = path.join(ROOT, "fixtures/pilot-content/plan.json");
const CONTENT_DIR = path.join(ROOT, "private-content/bridge/celebration-y3q4");
const READINGS = [
  {readingId: "CC-Y3Q4-D054", markdown: "CC-Y3Q4-D054.md", metadata: "CC-Y3Q4-D054.metadata.json", substantive: true},
  {readingId: "CC-Y3Q4-D055", markdown: "CC-Y3Q4-D055.md", metadata: "CC-Y3Q4-D055.metadata.json", substantive: true},
  {readingId: "CC-Y3Q4-D056", markdown: "CC-Y3Q4-D056.md", metadata: "CC-Y3Q4-D056.metadata.json", substantive: true},
  {readingId: "CC-Y3Q4-D057", markdown: "CC-Y3Q4-D057.md", metadata: "CC-Y3Q4-D057.metadata.json", substantive: true, prepared: true},
  {readingId: "CC-Y3Q4-D058", markdown: "CC-Y3Q4-D058.md", metadata: "CC-Y3Q4-D058.metadata.json", substantive: false},
  {readingId: "CC-Y3Q4-D059", markdown: "CC-Y3Q4-D059.md", metadata: "CC-Y3Q4-D059.metadata.json", substantive: false},
  {readingId: "CC-Y3Q4-D060", markdown: "CC-Y3Q4-D060.md", metadata: "CC-Y3Q4-D060.metadata.json", substantive: false}
];
const EXPECTED_FILES = new Set(READINGS.flatMap((reading) => [reading.markdown, reading.metadata]));
const EXPECTED_HEADINGS = [
  "Brief overview",
  "Literary structure",
  "Historical and cultural context",
  "Language and textual details",
  "Major theological themes",
  "Areas of broad agreement",
  "Major interpretive disagreements",
  "Canonical and intertextual connections",
  "Historical reception",
  "Contemporary questions",
  "Practical or theological takeaways",
  "Source notes"
];
const STORED_SCRIPTURE_SIGNATURES = [
  new RegExp(["In the beginning", "God created the heavens and the earth"].join(", "), "i"),
  new RegExp(["Let there be light", "there was light"].join("[^\\n]{0,80}"), "i")
];
const DEPENDENT_CROSS_REFERENCE = /\b(?:as (?:noted|discussed|explained|shown) (?:above|below|earlier)|see (?:above|below|the (?:previous|next|following) (?:section|page|paragraph))|(?:the|this) (?:previous|next|following) (?:section|page|paragraph)|(?:yesterday|tomorrow)(?:'s)? (?:reading|commentary))\b/i;
const INLINE_CITATION = /\{\{cite:([A-Za-z0-9_.:-]+(?:\s*,\s*[A-Za-z0-9_.:-]+)*)\}\}/g;

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function hash(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function citedSourceIds(commentary) {
  const ids = new Set();
  commentary.dailyIntroduction.sourceIds.forEach((sourceId) => ids.add(sourceId));
  commentary.commentarySummary.paragraphs.forEach((paragraph) =>
    paragraph.sourceIds.forEach((sourceId) => ids.add(sourceId))
  );
  commentary.practicalTakeaway.sourceIds.forEach((sourceId) => ids.add(sourceId));
  (commentary.sections || []).forEach((section) => section.sourceIds.forEach((sourceId) => ids.add(sourceId)));
  (commentary.comprehensiveSynthesis?.sourceIds || []).forEach((sourceId) => ids.add(sourceId));
  commentary.claims.forEach((claim) => claim.sourceIds.forEach((sourceId) => ids.add(sourceId)));
  return ids;
}

function markdownHeadings(markdown) {
  return [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim());
}

function inlineCitationIds(markdown) {
  return [...String(markdown || "").matchAll(INLINE_CITATION)]
    .flatMap((match) => match[1].split(",").map((sourceId) => sourceId.trim()));
}

function withoutInlineCitations(text) {
  return String(text || "").replace(INLINE_CITATION, "");
}

function levelThreeSections(markdown) {
  const text = String(markdown || "");
  const headings = [...text.matchAll(/^###\s+(.+)$/gm)];
  return headings.map((match, index) => ({
    title: match[1].trim(),
    body: text.slice(match.index + match[0].length, headings[index + 1]?.index ?? text.length).trim()
  }));
}

function wordCount(text) {
  return withoutInlineCitations(text).trim().split(/\s+/).filter(Boolean).length;
}

function paragraphCount(text) {
  return withoutInlineCitations(text).trim().split(/\n\s*\n/).filter(Boolean).length;
}

function assertStandalone(text, label) {
  assert(!DEPENDENT_CROSS_REFERENCE.test(withoutInlineCitations(text)),
    `${label}: displayed units must stand alone within the day's reading`);
}

async function main() {
  const hasPrivate = await exists(CONTENT_DIR) && await exists(REGISTRY_PATH);
  if (!hasPrivate) {
    if (REQUIRE_PRIVATE) fail("Private bridge content or research registry is missing.");
    process.stdout.write("Private content validation skipped (ignored local drafts are absent).\n");
    return;
  }

  const [schema, sourceSchema, mhcRuntimeSchema, registry, plan] = await Promise.all([
    readFile(SCHEMA_PATH, "utf8").then(JSON.parse),
    readFile(SOURCE_SCHEMA_PATH, "utf8").then(JSON.parse),
    readFile(MHC_RUNTIME_SCHEMA_PATH, "utf8").then(JSON.parse),
    readFile(REGISTRY_PATH, "utf8").then(JSON.parse),
    readFile(PLAN_PATH, "utf8").then(JSON.parse)
  ]);
  assertSchemaValid(registry, sourceSchema, {label: "Private bridge source registry"});
  validateRegistryProvenance(registry);
  const registryById = new Map(registry.sources.map((source) => [source.sourceId, source]));
  const files = (await readdir(CONTENT_DIR)).filter((name) => !name.startsWith("."));
  assert(files.length === EXPECTED_FILES.size, `Private bridge directory must contain exactly ${EXPECTED_FILES.size} files.`);
  files.forEach((filename) => assert(EXPECTED_FILES.has(filename), `Unexpected private bridge file: ${filename}`));

  for (const reading of READINGS) {
    const [markdown, commentary] = await Promise.all([
      readFile(path.join(CONTENT_DIR, reading.markdown), "utf8"),
      readFile(path.join(CONTENT_DIR, reading.metadata), "utf8").then(JSON.parse)
    ]);
    assertSchemaValid(commentary, schema, {
      label: `${reading.readingId} private commentary`,
      externalSchemas: {"mhc-runtime.schema.json": mhcRuntimeSchema}
    });
    assert(commentary.schemaVersion === (reading.substantive ? "commentary/v3" : "commentary/v2"),
      `${reading.readingId}: schema version does not match substantive/placeholder status`);
    assert(commentary.readingId === reading.readingId, `${reading.readingId}: metadata association mismatch`);
    assert(commentary.publicationStatus === (reading.substantive ? "draft" : "placeholder"),
      `${reading.readingId}: unexpected publication status`);
    assert(reading.substantive ? commentary.generation.humanReviewStatus !== "not_started" : commentary.generation.humanReviewStatus === "not_started",
      `${reading.readingId}: review state does not match content status`);
    assert(commentary.generation.contentHash === hash(markdown), `${reading.readingId}: Markdown content hash mismatch`);
    assert(supportsSourceSetVersion(registry, commentary.generation.sourceSetVersion),
      `${reading.readingId}: source-set version is not supported by the current additive registry`);
    const entry = plan.entries.find((candidate) => candidate.readingId === reading.readingId);
    const verseCommentary = commentary.verseCommentary;
    if (verseCommentary) {
      assert(entry && entry.kind === "chapter" && entry.passages.length === 1,
        `${reading.readingId}: attached verse commentary requires exactly one configured chapter`);
      const passage = entry.passages[0];
      assert(verseCommentary.book_id === passage.bookId && verseCommentary.chapter === passage.chapter,
        `${reading.readingId}: attached verse commentary does not match the configured chapter`);
      assert(["in_review", "approved"].includes(verseCommentary.review_status),
        `${reading.readingId}: an attached live verse-commentary layer must be in review or approved`);
      const startVerse = Number.isInteger(passage.verseStart) ? passage.verseStart : 1;
      const expectedRecordIds = Array.from({length: passage.verseCount}, (_, index) =>
        `${passage.bookId}.${passage.chapter}.${startVerse + index}`
      ).sort();
      assert(JSON.stringify(Object.keys(verseCommentary.records).sort()) === JSON.stringify(expectedRecordIds),
        `${reading.readingId}: attached verse commentary must cover every configured verse exactly once`);
      if (reading.prepared) {
        assert(verseCommentary.source_atoms && Object.keys(verseCommentary.source_atoms).length > 0,
          `${reading.readingId}: prepared verse commentary must carry its exact public-domain source atoms`);
        Object.entries(verseCommentary.records).forEach(([recordId, record]) => {
          assert(Array.isArray(record.source_atom_ids) && record.source_atom_ids.length > 0,
            `${reading.readingId}/${recordId}: prepared verse commentary must cite exact source atoms`);
          record.source_atom_ids.forEach((atomId) => {
            const atom = verseCommentary.source_atoms[atomId];
            assert(atom && typeof atom.text === "string" && atom.text.trim(),
              `${reading.readingId}/${recordId}: cited source atom ${atomId} is unavailable`);
          });
        });
      }
    }
    if (reading.prepared) assert(verseCommentary,
      `${reading.readingId}: an end-to-end prepared chapter requires reviewed verse-by-verse Matthew Henry commentary`);
    const selectedVerse = commentary.verseOfTheDay;
    const selectedPassage = entry && entry.passages.find((passage) =>
      passage.bookId === selectedVerse.bookId && passage.chapter === selectedVerse.chapter
    );
    assert(selectedPassage && selectedVerse.verse <= selectedPassage.verseCount,
      `${reading.readingId}: verse of the day must belong to the configured reading`);
    assert(paragraphCount(commentary.dailyIntroduction.markdown) >= 1 && paragraphCount(commentary.dailyIntroduction.markdown) <= 2,
      `${reading.readingId}: daily introduction must contain one or two paragraphs`);
    assert(wordCount(commentary.dailyIntroduction.markdown) <= 150,
      `${reading.readingId}: daily introduction must stay under 150 words`);
    assertStandalone(commentary.dailyIntroduction.markdown, `${reading.readingId}/daily-introduction`);
    assert(reading.substantive ? commentary.dailyIntroduction.sourceIds.length >= 1 : commentary.dailyIntroduction.sourceIds.length === 0,
      `${reading.readingId}: daily-introduction citations do not match content status`);
    const summaryParagraphs = commentary.commentarySummary.paragraphs;
    assert(reading.substantive ? summaryParagraphs.length >= 1 : summaryParagraphs.length === 0,
      `${reading.readingId}: commentary summary does not match content status`);
    const summaryWords = summaryParagraphs.reduce((total, paragraph) => total + wordCount(paragraph.markdown), 0);
    if (reading.substantive) {
      assert(summaryParagraphs.length >= 2 && summaryParagraphs.length <= 6,
        `${reading.readingId}: executive synthesis needs 2–6 connected prose paragraphs`);
      assert(summaryWords >= 220 && summaryWords <= 600,
        `${reading.readingId}: executive synthesis must contain 220–600 words`);
    }
    summaryParagraphs.forEach((paragraph, index) => {
      assert(paragraphCount(paragraph.markdown) === 1,
        `${reading.readingId}/summary-${index + 1}: each summary block must be one prose paragraph`);
      assert(wordCount(paragraph.markdown) >= 45 && wordCount(paragraph.markdown) <= 180,
        `${reading.readingId}/summary-${index + 1}: paragraph must contain 45–180 words`);
      assert(!/^\s*(?:[-*+]\s|\d+[.)]\s|#{1,6}\s)/.test(paragraph.markdown),
        `${reading.readingId}/summary-${index + 1}: main summary must be continuous prose, not a list or titled point`);
      assert(paragraph.sourceIds.length >= 1,
        `${reading.readingId}/summary-${index + 1}: main-summary provenance is missing`);
      if (reading.substantive) {
        const inlineIds = [...new Set(inlineCitationIds(paragraph.markdown))].sort();
        const declaredIds = [...paragraph.sourceIds].sort();
        assert(inlineIds.length >= 1,
          `${reading.readingId}/summary-${index + 1}: substantive prose needs inline citation markers`);
        assert(JSON.stringify(inlineIds) === JSON.stringify(declaredIds),
          `${reading.readingId}/summary-${index + 1}: inline citation markers must exactly match sourceIds`);
      }
    });
    if (reading.substantive) {
      assertStandalone(summaryParagraphs.map((paragraph) => paragraph.markdown).join("\n\n"),
        `${reading.readingId}/executive-synthesis`);
      const mainSourceIds = new Set(summaryParagraphs.flatMap((paragraph) => paragraph.sourceIds));
      assert(mainSourceIds.size >= 2,
        `${reading.readingId}: main synthesis must draw on multiple consulted sources`);
    }
    assert(wordCount(commentary.practicalTakeaway.markdown) <= 32,
      `${reading.readingId}: practical takeaway must stay under 32 words`);
    assert((commentary.practicalTakeaway.markdown.match(/[.!?](?=\s|$)/g) || []).length === 1,
      `${reading.readingId}: practical takeaway must be one sentence`);
    assertStandalone(commentary.practicalTakeaway.markdown, `${reading.readingId}/practical-takeaway`);

    const headings = markdownHeadings(markdown);
    if (reading.substantive) {
      assert(headings.length === 1 && headings[0] === "Comprehensive synthesis",
        `${reading.readingId}: substantive Markdown must contain one comprehensive synthesis`);
      const deepDiveSections = levelThreeSections(markdown);
      assert(deepDiveSections.length >= 3 && deepDiveSections.length <= 10,
        `${reading.readingId}: comprehensive synthesis needs 3–10 custom collapsed sections`);
      assert(new Set(deepDiveSections.map((section) => section.title)).size === deepDiveSections.length,
        `${reading.readingId}: comprehensive section headings must be unique`);
      deepDiveSections.forEach((section, index) => {
        assert(section.body.length >= 1,
          `${reading.readingId}: comprehensive section ${index + 1} must have content`);
        assertStandalone(section.body, `${reading.readingId}/comprehensive-section-${index + 1}`);
      });
    } else {
      assert(headings.length === EXPECTED_HEADINGS.length, `${reading.readingId}: placeholder must retain ${EXPECTED_HEADINGS.length} level-two sections`);
      EXPECTED_HEADINGS.forEach((heading, index) => assert(headings[index] === heading,
        `${reading.readingId}: section ${index + 1} must be ${heading}`));
    }
    assert(!/<(?:script|iframe|object|embed|style|form|input|button|svg|math)\b/i.test(markdown), `${reading.readingId}: unsupported raw HTML`);
    assert(!STORED_SCRIPTURE_SIGNATURES.some((signature) => signature.test(markdown)),
      `${reading.readingId}: likely stored ESV passage text`);
    assert(!/https?:\/\//i.test(markdown), `${reading.readingId}: source URLs belong in the private registry, not prose`);

    if (reading.substantive) {
      assert(commentary.comprehensiveSynthesis.sourceIds.length === commentary.coverage.includedCount,
        `${reading.readingId}: comprehensive synthesis must include every cited source`);
      assertStandalone(commentary.comprehensiveSynthesis.markdown, `${reading.readingId}/comprehensive-synthesis`);
      const inlineDeepSourceIds = [...new Set(inlineCitationIds(markdown))].sort();
      const declaredDeepSourceIds = [...commentary.comprehensiveSynthesis.sourceIds].sort();
      inlineDeepSourceIds.forEach((sourceId) => assert(declaredDeepSourceIds.includes(sourceId),
        `${reading.readingId}: comprehensive synthesis cites undeclared source ${sourceId}`));
      if (reading.prepared) {
        assert(inlineDeepSourceIds.length > 0,
          `${reading.readingId}: an end-to-end prepared comprehensive synthesis needs inline citation markers`);
        assert(JSON.stringify(inlineDeepSourceIds) === JSON.stringify(declaredDeepSourceIds),
          `${reading.readingId}: prepared comprehensive inline citations must cover its declared source set`);
      }
    } else {
      const sectionTitles = commentary.sections.map((section) => section.title);
      assert(sectionTitles.length === EXPECTED_HEADINGS.length, `${reading.readingId}: metadata section count`);
      EXPECTED_HEADINGS.forEach((heading, index) => assert(sectionTitles[index] === heading,
        `${reading.readingId}: metadata section ${index + 1} must be ${heading}`));
      commentary.sections.forEach((section, index) =>
        assertStandalone(section.markdown, `${reading.readingId}/section-${index + 1}`));
    }

    const sourceIds = citedSourceIds(commentary);
    assert(commentary.coverage.includedCount === sourceIds.size,
      `${reading.readingId}: includedCount ${commentary.coverage.includedCount} does not match ${sourceIds.size} cited sources`);
    assert(commentary.coverage.consultedCount >= commentary.coverage.includedCount,
      `${reading.readingId}: consulted count cannot be below included count`);
    for (const sourceId of sourceIds) {
      const source = registryById.get(sourceId);
      assert(source, `${reading.readingId}: unknown source ${sourceId}`);
      assert(source.summaryUseStatus === "included", `${reading.readingId}: source ${sourceId} is not marked included`);
      assert(source.includedReadings.includes(reading.readingId),
        `${reading.readingId}: source ${sourceId} is not associated with the reading`);
    }

    commentary.claims.forEach((claim) => {
      assert(claim.singleSource === (claim.sourceIds.length === 1), `${reading.readingId}/${claim.claimId}: singleSource mismatch`);
      claim.sourceIds.forEach((sourceId) => assert(sourceIds.has(sourceId), `${reading.readingId}/${claim.claimId}: uncatalogued claim source`));
    });
    const singleSourceClaimIds = commentary.claims.filter((claim) => claim.singleSource).map((claim) => claim.claimId).sort();
    const declaredSingleSourceIds = [...commentary.coverage.singleSourceClaimIds].sort();
    assert(JSON.stringify(singleSourceClaimIds) === JSON.stringify(declaredSingleSourceIds),
      `${reading.readingId}: single-source coverage list mismatch`);

    commentary.coverage.inaccessibleSourceIds.forEach((sourceId) => {
      const source = registryById.get(sourceId);
      assert(source && source.summaryUseStatus === "inaccessible", `${reading.readingId}: ${sourceId} is not an inaccessible registered source`);
    });
  }

  process.stdout.write(`Private content validation passed (1 end-to-end prepared study; 4 syntheses; 3 explicit placeholders; ${registry.sources.length} registered sources; no stored Scripture).\n`);
}

main().catch((error) => {
  process.stderr.write(`Private content validation failed: ${error.message}\n`);
  process.exitCode = 1;
});
