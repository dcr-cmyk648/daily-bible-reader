import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {inflateSync} from "node:zlib";
import {validateAgainstSchema} from "./schema-validator.mjs";

export const MHC_SOURCE = Object.freeze({
  sourceId: "crosswire-mhc-2.2",
  workTitle: "Matthew Henry's Complete Commentary on the Whole Bible",
  moduleName: "MHC",
  moduleVersion: "2.2",
  sourceVersionDate: "2022-08-29",
  sourceUrl: "https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=MHC",
  downloadUrl: "https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/MHC.zip",
  license: "Public Domain--Copy Freely; Distribution License Public Domain",
  sourceFormat: "CrossWire SWORD zCom4 OSIS",
  versification: "KJV"
});

export const NORMALIZED_SCHEMA_VERSION = "mhc-normalized-source/v3";
export const COMMENTARY_SCHEMA_VERSION = "mhc-commentary/v2";
export const BOOK_INTRO_SCHEMA_VERSION = "mhc-book-intro/v1";
export const RUNTIME_SCHEMA_VERSION = "mhc-runtime/v1";
export const FACT_BRIEF_SCHEMA_VERSION = "mhc-fact-brief/v2";
export const FACT_PROMPT_VERSION = "mhc-fact-extractor/v8";
export const LEGACY_PROMPT_VERSION = "mhc-worker/v11";
export const PROMPT_VERSION = "mhc-autonomous-writer/v5";
export const AUTONOMOUS_GENERATION_MODE = "spark-autonomous-chunked-two-stage/v4";

export const OSIS_BOOKS = Object.freeze([
  ["Gen", "GEN", "Genesis"], ["Exod", "EXO", "Exodus"], ["Lev", "LEV", "Leviticus"],
  ["Num", "NUM", "Numbers"], ["Deut", "DEU", "Deuteronomy"], ["Josh", "JOS", "Joshua"],
  ["Judg", "JDG", "Judges"], ["Ruth", "RUT", "Ruth"], ["1Sam", "1SA", "1 Samuel"],
  ["2Sam", "2SA", "2 Samuel"], ["1Kgs", "1KI", "1 Kings"], ["2Kgs", "2KI", "2 Kings"],
  ["1Chr", "1CH", "1 Chronicles"], ["2Chr", "2CH", "2 Chronicles"], ["Ezra", "EZR", "Ezra"],
  ["Neh", "NEH", "Nehemiah"], ["Esth", "EST", "Esther"], ["Job", "JOB", "Job"],
  ["Ps", "PSA", "Psalms"], ["Prov", "PRO", "Proverbs"], ["Eccl", "ECC", "Ecclesiastes"],
  ["Song", "SNG", "Song of Solomon"], ["Isa", "ISA", "Isaiah"], ["Jer", "JER", "Jeremiah"],
  ["Lam", "LAM", "Lamentations"], ["Ezek", "EZK", "Ezekiel"], ["Dan", "DAN", "Daniel"],
  ["Hos", "HOS", "Hosea"], ["Joel", "JOL", "Joel"], ["Amos", "AMO", "Amos"],
  ["Obad", "OBA", "Obadiah"], ["Jonah", "JON", "Jonah"], ["Mic", "MIC", "Micah"],
  ["Nah", "NAM", "Nahum"], ["Hab", "HAB", "Habakkuk"], ["Zeph", "ZEP", "Zephaniah"],
  ["Hag", "HAG", "Haggai"], ["Zech", "ZEC", "Zechariah"], ["Mal", "MAL", "Malachi"],
  ["Matt", "MAT", "Matthew"], ["Mark", "MRK", "Mark"], ["Luke", "LUK", "Luke"],
  ["John", "JHN", "John"], ["Acts", "ACT", "Acts"], ["Rom", "ROM", "Romans"],
  ["1Cor", "1CO", "1 Corinthians"], ["2Cor", "2CO", "2 Corinthians"], ["Gal", "GAL", "Galatians"],
  ["Eph", "EPH", "Ephesians"], ["Phil", "PHP", "Philippians"], ["Col", "COL", "Colossians"],
  ["1Thess", "1TH", "1 Thessalonians"], ["2Thess", "2TH", "2 Thessalonians"], ["1Tim", "1TI", "1 Timothy"],
  ["2Tim", "2TI", "2 Timothy"], ["Titus", "TIT", "Titus"], ["Phlm", "PHM", "Philemon"],
  ["Heb", "HEB", "Hebrews"], ["Jas", "JAS", "James"], ["1Pet", "1PE", "1 Peter"],
  ["2Pet", "2PE", "2 Peter"], ["1John", "1JN", "1 John"], ["2John", "2JN", "2 John"],
  ["3John", "3JN", "3 John"], ["Jude", "JUD", "Jude"], ["Rev", "REV", "Revelation"]
].map(([osisId, bookId, name]) => Object.freeze({osisId, bookId, name})));

const BOOK_BY_OSIS = new Map(OSIS_BOOKS.map((book) => [book.osisId, book]));
const BOOK_BY_ID = new Map(OSIS_BOOKS.map((book) => [book.bookId, book]));
const OSIS_CITATION_ABBREVIATIONS = new Set(OSIS_BOOKS
  .filter(({osisId, name}) => osisId.toLowerCase() !== name.replace(/\s+/g, "").toLowerCase())
  .map(({osisId}) => osisId));

export function parseOsisReferenceRange(value) {
  const match = /^([A-Za-z0-9]+)\.([1-9][0-9]{0,2})\.([1-9][0-9]{0,2})(?:-([A-Za-z0-9]+)\.([1-9][0-9]{0,2})\.([1-9][0-9]{0,2}))?$/.exec(String(value || ""));
  if (!match) return null;
  const startBook = BOOK_BY_OSIS.get(match[1]);
  const endBook = BOOK_BY_OSIS.get(match[4] || match[1]);
  const chapter = Number(match[2]);
  const verseStart = Number(match[3]);
  const endChapter = Number(match[5] || match[2]);
  const verseEnd = Number(match[6] || match[3]);
  if (!startBook || !endBook || startBook.bookId !== endBook.bookId || chapter !== endChapter || verseEnd < verseStart) return null;
  return {bookId: startBook.bookId, chapter, verseStart, verseEnd};
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function parseModuleConfig(text) {
  const config = {};
  String(text || "").replace(/\r\n?/g, "\n").split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || /^\[[^\]]+\]$/.test(trimmed)) return;
    const match = /^([^=]+)=(.*)$/.exec(trimmed);
    if (match) config[match[1].trim()] = match[2].trim();
  });
  return config;
}

export function assertSupportedModuleConfig(config) {
  const expected = {
    ModDrv: "zCom4",
    SourceType: "OSIS",
    Encoding: "UTF-8",
    CompressType: "ZIP",
    BlockType: "BOOK",
    Versification: "KJV",
    Version: MHC_SOURCE.moduleVersion,
    SwordVersionDate: MHC_SOURCE.sourceVersionDate,
    DistributionLicense: "Public Domain"
  };
  Object.entries(expected).forEach(([key, value]) => {
    if (config[key] !== value) throw new Error(`Unsupported MHC module configuration: ${key} must equal ${value}.`);
  });
  return config;
}

export function parseTwelveByteIndex(buffer, label) {
  if (!Buffer.isBuffer(buffer) || buffer.length % 12 !== 0) {
    throw new Error(`${label || "SWORD"} index length must be divisible by 12.`);
  }
  const records = [];
  for (let offset = 0; offset < buffer.length; offset += 12) {
    records.push({
      first: buffer.readUInt32LE(offset),
      second: buffer.readUInt32LE(offset + 4),
      third: buffer.readUInt32LE(offset + 8)
    });
  }
  return records;
}

export function decodeSwordTestament({blockIndex, verseIndex, compressed, testament}) {
  const blocks = parseTwelveByteIndex(blockIndex, `${testament} block`).map((record, blockNumber) => {
    const end = record.first + record.second;
    if (end > compressed.length) throw new Error(`${testament} block ${blockNumber} exceeds the compressed data file.`);
    const inflated = inflateSync(compressed.subarray(record.first, end));
    if (inflated.length !== record.third) throw new Error(`${testament} block ${blockNumber} length mismatch.`);
    return inflated;
  });
  const indexEntries = parseTwelveByteIndex(verseIndex, `${testament} verse`).map((record, index) => {
    const bytes = blocks[record.first];
    if (bytes === undefined || record.second + record.third > bytes.length) {
      throw new Error(`${testament} verse index ${index} points outside its block.`);
    }
    return {
      index,
      blockNumber: record.first,
      offset: record.second,
      length: record.third,
      xml: bytes.subarray(record.second, record.second + record.third).toString("utf8")
    };
  });
  const byBlock = new Map();
  indexEntries.forEach((entry) => {
    if (!byBlock.has(entry.blockNumber)) byBlock.set(entry.blockNumber, []);
    byBlock.get(entry.blockNumber).push(entry);
  });
  const books = new Map();
  for (const [blockNumber, entries] of byBlock) {
    if (blockNumber === 0) continue;
    const blockText = blocks[blockNumber].toString("utf8");
    const bookMatch = /<div\b(?=[^>]*\btype="book")(?=[^>]*\bosisID="([A-Za-z0-9]+)")[^>]*\/>/.exec(blockText);
    if (!bookMatch) throw new Error(`${testament} block ${blockNumber} has no OSIS book marker.`);
    const book = BOOK_BY_OSIS.get(bookMatch[1]);
    if (!book) throw new Error(`Unsupported OSIS book ID ${bookMatch[1]}.`);
    let chapter = null;
    let verse = 0;
    const chapters = new Map();
    entries.forEach((entry) => {
      const escapedOsis = book.osisId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const chapterPattern = new RegExp(`<chapter\\b(?=[^>]*\\bsID="${escapedOsis}\\.([1-9][0-9]{0,2})")[^>]*\\/>`);
      const chapterMatch = chapterPattern.exec(entry.xml);
      if (chapterMatch) {
        chapter = Number(chapterMatch[1]);
        verse = 0;
        if (chapters.has(chapter)) throw new Error(`${book.bookId} ${chapter} has duplicate chapter index entries.`);
        chapters.set(chapter, {chapter, introEntry: entry, verseEntries: []});
        return;
      }
      if (chapter !== null) {
        verse += 1;
        chapters.get(chapter).verseEntries.push({...entry, verse});
      }
    });
    if (!chapters.size) throw new Error(`${book.bookId} contains no indexed chapters.`);
    books.set(book.bookId, {...book, testament, blockNumber, chapters});
  }
  return {blocks, indexEntries, books};
}

export async function readSwordModule(moduleRoot) {
  const base = path.resolve(moduleRoot);
  const [configText, otBlockIndex, otVerseIndex, otCompressed, ntBlockIndex, ntVerseIndex, ntCompressed] = await Promise.all([
    readFile(path.join(base, "..", "..", "..", "..", "mods.d", "mhc.conf"), "utf8"),
    readFile(path.join(base, "ot.bzs")), readFile(path.join(base, "ot.bzv")), readFile(path.join(base, "ot.bzz")),
    readFile(path.join(base, "nt.bzs")), readFile(path.join(base, "nt.bzv")), readFile(path.join(base, "nt.bzz"))
  ]);
  const config = assertSupportedModuleConfig(parseModuleConfig(configText));
  const ot = decodeSwordTestament({blockIndex: otBlockIndex, verseIndex: otVerseIndex, compressed: otCompressed, testament: "ot"});
  const nt = decodeSwordTestament({blockIndex: ntBlockIndex, verseIndex: ntVerseIndex, compressed: ntCompressed, testament: "nt"});
  const books = new Map([...ot.books, ...nt.books]);
  if (books.size !== 66) throw new Error(`Expected 66 Protestant-canon books; decoded ${books.size}.`);
  return {config, books, testaments: {ot, nt}};
}

function findMilestoneTag(xml, attribute, value, from = 0) {
  const tag = /<div\b[^>]*\/>/g;
  tag.lastIndex = from;
  let match;
  const attributePattern = new RegExp(`\\b${attribute}="${String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`);
  while ((match = tag.exec(xml))) {
    if (attributePattern.test(match[0])) return {index: match.index, end: tag.lastIndex, tag: match[0]};
  }
  return null;
}

export function extractMilestoneRange(xml, startId, endId = startId) {
  const start = findMilestoneTag(xml, "sID", startId);
  if (!start) return null;
  const end = findMilestoneTag(xml, "eID", endId, start.end);
  if (!end) return null;
  return {start: start.index, end: end.end, innerXml: xml.slice(start.end, end.index), xml: xml.slice(start.index, end.end)};
}

export function extractTypedMilestone(xml, type) {
  const tag = /<div\b[^>]*\/>/g;
  let match;
  while ((match = tag.exec(xml))) {
    if (!new RegExp(`\\btype="${String(type).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(match[0])) continue;
    const id = /\bsID="([^"]+)"/.exec(match[0]);
    if (!id) continue;
    const end = findMilestoneTag(xml, "eID", id[1], tag.lastIndex);
    // Some SWORD OSIS imports use a typed start milestone whose scope ends with
    // the enclosing x-preverse milestone instead of emitting a matching eID.
    if (!end) {
      return {start: match.index, end: xml.length, innerXml: xml.slice(tag.lastIndex), xml: xml.slice(match.index), id: id[1]};
    }
    return {start: match.index, end: end.end, innerXml: xml.slice(tag.lastIndex, end.index), xml: xml.slice(match.index, end.end), id: id[1]};
  }
  return null;
}

export function splitPreverse(xml) {
  const startTag = /<div\b(?=[^>]*\bsubType="x-preverse")(?=[^>]*\bsID="([^"]+)")[^>]*\/>/.exec(xml);
  if (!startTag) return {preverseXml: "", bodyXml: xml};
  const startEnd = startTag.index + startTag[0].length;
  const end = findMilestoneTag(xml, "eID", startTag[1], startEnd);
  if (!end) throw new Error(`Preverse milestone ${startTag[1]} has no closing marker.`);
  return {
    preverseXml: xml.slice(startTag.index, end.end),
    bodyXml: `${xml.slice(0, startTag.index)}${xml.slice(end.end)}`
  };
}

function decodeXmlEntities(text) {
  return text.replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)))
    .replace(/&#([0-9]+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

export function normalizeOsisText(xml) {
  return decodeXmlEntities(String(xml || "")
    .replace(/<note\b[^>]*>[\s\S]*?<\/note>/gi, " ")
    .replace(/<title\b[^>]*>/gi, "\n\n")
    .replace(/<\/title>/gi, "\n")
    .replace(/<lb\b[^>]*\/>/gi, "\n")
    .replace(/<div\b[^>]*\/>/gi, "\n\n")
    .replace(/<chapter\b[^>]*\/>/gi, "\n\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractMilestoneParagraphs(xml, type = "x-p") {
  const paragraphs = [];
  const tag = /<div\b[^>]*\/>/g;
  let match;
  const typePattern = new RegExp(`\\btype="${String(type).replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}"`);
  while ((match = tag.exec(String(xml || "")))) {
    if (!typePattern.test(match[0])) continue;
    const id = /\bsID="([^"]+)"/.exec(match[0]);
    if (!id) continue;
    const end = findMilestoneTag(xml, "eID", id[1], tag.lastIndex);
    if (!end) {
      paragraphs.push({
        id: id[1],
        start: match.index,
        end: String(xml || "").length,
        innerXml: String(xml || "").slice(tag.lastIndex)
      });
      break;
    }
    paragraphs.push({
      id: id[1],
      start: match.index,
      end: end.end,
      innerXml: String(xml).slice(tag.lastIndex, end.index)
    });
    tag.lastIndex = end.end;
  }
  return paragraphs;
}

function atomRecord(sourceUnitId, sequence, atomType, text) {
  return {
    source_atom_id: `${sourceUnitId}:a${String(sequence).padStart(3, "0")}`,
    sequence,
    atom_type: atomType,
    text,
    text_sha256: sha256(text)
  };
}

const VERSE_ANCHOR_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "before", "but", "by", "for", "from", "had", "has", "have",
  "he", "her", "here", "him", "his", "i", "in", "is", "it", "its", "me", "my", "no", "not", "of", "on", "or",
  "our", "out", "shall", "she", "so", "that", "the", "their", "them", "then", "there", "they", "this", "thou",
  "thy", "to", "unto", "up", "was", "we", "were", "what", "when", "which", "while", "who", "will", "with", "ye",
  "yea", "you", "your"
]);

function verseAnchorsFromScriptureParagraph(xml) {
  const sourceXml = String(xml || "");
  const markers = [...sourceXml.matchAll(/<hi\b(?=[^>]*\btype="super")[^>]*>\s*([1-9][0-9]{0,2})\s*<\/hi>/gi)];
  return markers.map((marker, index) => {
    const start = marker.index + marker[0].length;
    const end = index + 1 < markers.length ? markers[index + 1].index : sourceXml.length;
    const text = normalizeOsisText(sourceXml.slice(start, end));
    const terms = [...new Set((text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [])
      .filter((term) => term.length > 2 && !VERSE_ANCHOR_STOP_WORDS.has(term)))].slice(0, 18);
    return {verse: Number(marker[1]), anchor_terms: terms};
  }).filter((anchor) => anchor.anchor_terms.length);
}

export function extractCommentaryAtoms(xml, sourceUnitId, unitType) {
  const sourceXml = String(xml || "");
  const candidates = [];
  const excludedScripture = [];
  const verseAnchors = [];
  const titles = [...sourceXml.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)]
    .map((match) => normalizeOsisText(match[1])).filter(Boolean);
  titles.forEach((text) => candidates.push({atomType: "heading", text}));

  const paragraphs = extractMilestoneParagraphs(sourceXml);
  paragraphs.forEach((paragraph) => {
    const text = normalizeOsisText(paragraph.innerXml);
    if (!text) return;
    const isScriptureTranscription = unitType === "verse_range" &&
      /<hi\b(?=[^>]*\btype="super")[^>]*>/i.test(paragraph.innerXml);
    if (isScriptureTranscription) {
      excludedScripture.push(text);
      verseAnchors.push(...verseAnchorsFromScriptureParagraph(paragraph.innerXml));
    }
    else candidates.push({atomType: "commentary", text});
  });

  if (!candidates.some((candidate) => candidate.atomType === "commentary")) {
    const titleSet = new Set(titles);
    normalizeOsisText(sourceXml).split(/\n{2,}/).map((text) => text.trim()).filter(Boolean).forEach((text) => {
      if (!titleSet.has(text)) candidates.push({atomType: "commentary", text});
    });
  }

  const deduplicated = candidates.filter((candidate, index) =>
    candidates.findIndex((other) => other.atomType === candidate.atomType && other.text === candidate.text) === index
  );
  if (!deduplicated.some((candidate) => candidate.atomType === "commentary")) {
    throw new Error(`${sourceUnitId} contains no commentary prose after Scripture-transcription removal.`);
  }
  const atoms = deduplicated.map((candidate, index) =>
    atomRecord(sourceUnitId, index + 1, candidate.atomType, candidate.text)
  );
  return {
    atoms,
    workerSourceSha256: sha256(stableJson(atoms)),
    excludedScriptureSha256: excludedScripture.length ? sha256(excludedScripture.join("\n\n")) : null,
    verseAnchors
  };
}

function sourceProvenance(sourceManifest) {
  return {
    source_url: sourceManifest.source_url,
    download_url: sourceManifest.download_url,
    module_name: sourceManifest.module_name,
    module_version: sourceManifest.module_version,
    source_version_date: sourceManifest.source_version_date,
    retrieved_at: sourceManifest.retrieved_at,
    license: sourceManifest.license,
    archive_sha256: sourceManifest.archive_sha256,
    source_format: sourceManifest.source_format,
    versification: sourceManifest.versification
  };
}

function normalizedUnit(fields, sourceManifest) {
  const sourceText = normalizeOsisText(fields.xml);
  if (!sourceText) throw new Error(`${fields.sourceUnitId} normalized to empty source text.`);
  const atomization = extractCommentaryAtoms(fields.xml, fields.sourceUnitId, fields.unitType);
  return {
    schema_version: NORMALIZED_SCHEMA_VERSION,
    source_id: sourceManifest.source_id,
    source_unit_id: fields.sourceUnitId,
    work_title: sourceManifest.work_title,
    book_id: fields.bookId,
    chapter: fields.chapter,
    verse_start: fields.verseStart,
    verse_end: fields.verseEnd,
    reference_label: fields.referenceLabel,
    unit_type: fields.unitType,
    source_text: sourceText,
    source_text_sha256: sha256(sourceText),
    source_atoms: atomization.atoms,
    worker_source_sha256: atomization.workerSourceSha256,
    excluded_scripture_sha256: atomization.excludedScriptureSha256,
    verse_anchors: atomization.verseAnchors,
    provenance: sourceProvenance(sourceManifest)
  };
}

export function normalizeBookChapter({decodedModule, sourceManifest, boundaries, bookId, chapter, includeBookIntro = true}) {
  const book = decodedModule.books.get(bookId);
  if (!book) throw new Error(`Book ${bookId} is not present in the decoded module.`);
  const chapterIndex = book.chapters.get(chapter);
  if (!chapterIndex) throw new Error(`${book.name} ${chapter} is not present in the decoded module.`);
  if (!chapterIndex.verseEntries.length) throw new Error(`${book.name} ${chapter} has no verse index entries.`);
  const units = [];
  const exceptions = [];
  const first = chapterIndex.verseEntries[0];
  const preverse = splitPreverse(first.xml);
  const consumed = [];

  if (includeBookIntro && chapter === 1) {
    const sourceBoundary = boundaries && boundaries.books && boundaries.books[bookId];
    if (!sourceBoundary) {
      exceptions.push({
        schema_version: "mhc-normalization-exception/v1",
        exception_id: `${sourceManifest.source_id}:${bookId}:book-intro-boundary`,
        book_id: bookId,
        chapter,
        reason: "The first-chapter preverse may contain volume, book, and chapter material, but no hash-guarded book-introduction boundary is configured.",
        source_text: normalizeOsisText(preverse.preverseXml),
        source_text_sha256: sha256(normalizeOsisText(preverse.preverseXml))
      });
    } else {
      if (boundaries.archiveSha256 !== sourceManifest.archive_sha256 || boundaries.moduleVersion !== sourceManifest.module_version) {
        throw new Error("The source-specific book-introduction boundaries do not match this archive and module version.");
      }
      const range = extractMilestoneRange(preverse.preverseXml,
        sourceBoundary.bookIntroStartMilestoneId, sourceBoundary.bookIntroEndMilestoneId);
      if (!range) throw new Error(`${bookId} book-introduction milestones were not found.`);
      consumed.push(range);
      units.push(normalizedUnit({
        sourceUnitId: `${sourceManifest.source_id}:${bookId}:book-intro`,
        bookId,
        chapter: null,
        verseStart: null,
        verseEnd: null,
        referenceLabel: `${book.name} introduction`,
        unitType: "book_intro",
        xml: range.innerXml
      }, sourceManifest));
    }
  }

  const chapterIntro = extractTypedMilestone(preverse.preverseXml, "introduction");
  if (chapterIntro) {
    consumed.push(chapterIntro);
    units.push(normalizedUnit({
      sourceUnitId: `${sourceManifest.source_id}:${bookId}:${String(chapter).padStart(3, "0")}:chapter-intro`,
      bookId,
      chapter,
      verseStart: null,
      verseEnd: null,
      referenceLabel: `${book.name} ${chapter} introduction`,
      unitType: "chapter_intro",
      xml: chapterIntro.innerXml
    }, sourceManifest));
  }

  if (preverse.preverseXml) {
    let remaining = preverse.preverseXml;
    consumed.sort((left, right) => right.start - left.start).forEach((range) => {
      remaining = `${remaining.slice(0, range.start)}${remaining.slice(range.end)}`;
    });
    const unclassified = normalizeOsisText(remaining);
    if (unclassified) {
      exceptions.push({
        schema_version: "mhc-normalization-exception/v1",
        exception_id: `${sourceManifest.source_id}:${bookId}:${String(chapter).padStart(3, "0")}:unclassified-preverse`,
        book_id: bookId,
        chapter,
        reason: "Preverse material remains outside configured book- and chapter-introduction milestones; it is preserved for review and is not silently assigned.",
        source_text: unclassified,
        source_text_sha256: sha256(unclassified)
      });
    }
  }

  const grouped = [];
  chapterIndex.verseEntries.forEach((entry, index) => {
    const key = `${entry.blockNumber}:${entry.offset}:${entry.length}`;
    const prior = grouped[grouped.length - 1];
    if (prior && prior.key === key) {
      prior.verseEnd = entry.verse;
      return;
    }
    const split = index === 0 ? preverse : splitPreverse(entry.xml);
    grouped.push({key, verseStart: entry.verse, verseEnd: entry.verse, xml: split.bodyXml});
  });
  grouped.forEach((range) => {
    const suffix = range.verseStart === range.verseEnd
      ? String(range.verseStart).padStart(3, "0")
      : `${String(range.verseStart).padStart(3, "0")}-${String(range.verseEnd).padStart(3, "0")}`;
    const referenceLabel = range.verseStart === range.verseEnd
      ? `${book.name} ${chapter}:${range.verseStart}`
      : `${book.name} ${chapter}:${range.verseStart}–${range.verseEnd}`;
    try {
      units.push(normalizedUnit({
        sourceUnitId: `${sourceManifest.source_id}:${bookId}:${String(chapter).padStart(3, "0")}:${suffix}`,
        bookId,
        chapter,
        verseStart: range.verseStart,
        verseEnd: range.verseEnd,
        referenceLabel,
        unitType: "verse_range",
        xml: range.xml
      }, sourceManifest));
    } catch (error) {
      exceptions.push({
        schema_version: "mhc-normalization-exception/v1",
        exception_id: `${sourceManifest.source_id}:${bookId}:${String(chapter).padStart(3, "0")}:${suffix}`,
        book_id: bookId,
        chapter,
        verse_start: range.verseStart,
        verse_end: range.verseEnd,
        reason: error.message,
        source_text: normalizeOsisText(range.xml),
        source_text_sha256: sha256(normalizeOsisText(range.xml))
      });
    }
  });
  return {book, chapterIndex, units, exceptions};
}

export function normalizedBatchHash(units) {
  return sha256(units.map((unit) => stableJson(unit)).join("\n"));
}

export function expectedVerseIds(bookId, chapter, verseCount) {
  return Array.from({length: verseCount}, (_, index) => `${bookId}.${chapter}.${index + 1}`);
}

export function unitCoversVerse(unit, bookId, chapter, verse) {
  return Boolean(unit && unit.book_id === bookId && unit.chapter === chapter &&
    Number.isInteger(unit.verse_start) && Number.isInteger(unit.verse_end) &&
    verse >= unit.verse_start && verse <= unit.verse_end);
}

function wordCount(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

const SOURCE_REPORTING_PATTERNS = Object.freeze([
  /\b(?:Matthew\s+)?Henry\b/i,
  /\b(?:the\s+)?commentator(?:'s)?\b/i,
  /\b(?:the\s+)?commentary\b/i,
  /\b(?:the\s+)?source\b/i,
  /\b(?:the\s+)?atom\b/i,
  /\b(?:the|this|that|same)\s+(?:heading|burden|account|chapter|section|record|passage|text|verse|oracle|prophecy|note|comment|warning|description|image|imagery)\s+(?:says?|states?|asks?|names?|introduces?|sets?|presents?|treats?|depicts?|pictures?|describes?|identifies?|interprets?|observes?|applies?|allows?|draws?|likens?|calls?|teaches?|shows?|warns?|explains?|adds?|makes?)\b/i,
  /\b(?:the|this)\s+(?:point|warning|lesson|application|practical\s+sense)\s+is\b/i,
  /\btraditions?\s+(?:(?:is|are)\s+)?(?:says?|holds?|ties?|identifies?|takes?|cited|reported|mentioned)\b/i,
  /\b(?:is|are|was|were)\s+(?:treated|presented|described|interpreted|understood|depicted|portrayed|pictured|declared|announced|held|framed|extended)\b/i,
  /\b(?:is|are|was|were)\s+called\s+(?:as\s+)?(?:a|an|the)\b/i,
  /\b(?:is|are|was|were)\s+likened\s+(?:as|to)\b/i,
  /\b(?:the|this)\s+image(?:ry)?\s+is\b/i
  ,/\b(?:he|Henry)\s+(?:adds?|summarizes?|uses?|identifies?|describes?|compares?)\b/i
  ,/\b(?:the\s+)?treatment\s+(?:adds?|summarizes?|uses?|identifies?|describes?|compares?)\b/i
]);

const ARCHAIC_TERM_PATTERN = /\b(?:doth|hast|hath|ravin|shalt|thee|thereof|thereunto|thine|thou|thy|whelps?|whereof|wherein|whence|whither|ye)\b/i;

function findArchaicTerm(value) {
  const match = ARCHAIC_TERM_PATTERN.exec(String(value || ""));
  return match && match[0] || null;
}

export function findSourceReportingPhrase(value) {
  const text = String(value || "");
  for (const pattern of SOURCE_REPORTING_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return match[0];
  }
  return null;
}

function explicitVerseMarkerGroups(value) {
  const text = String(value || "");
  const groups = [];
  const pattern = /\b(?:v|ver|verse)s?\.?\s*(\d+)(?:\s*[-–]\s*(\d+))?(?:\s*(?:,|&|and)\s*(\d+))?/giu;
  for (const match of text.matchAll(pattern)) {
    const prefix = text.slice(Math.max(0, match.index - 32), match.index);
    // Henry commonly prints cross-references such as “Isa. v. 8”. In that
    // construction `v.` is a Roman chapter number, not a marker for verse 8 of
    // the chapter being abridged. Treat a marker immediately following a
    // capitalized book abbreviation as a cross-reference and ignore it.
    if (/(?:^|[\s(])(?:[1-3]\s*)?[A-Z][A-Za-z]{1,14}\.\s*$/u.test(prefix)) continue;
    const values = [];
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    for (let verse = start; verse <= end; verse += 1) values.push(verse);
    if (match[3]) values.push(Number(match[3]));
    if (values.length) groups.push(values);
  }
  return groups;
}

function atomExplicitlyMarksVerse(atom, verse) {
  return explicitVerseMarkerGroups(atom && atom.text).some((group) => group.includes(verse));
}

function atomVerseMarkerSpecificity(atom, verse) {
  const matchingGroups = explicitVerseMarkerGroups(atom && atom.text)
    .filter((group) => group.includes(verse));
  if (!matchingGroups.length) return null;
  return Math.min(...matchingGroups.map((group) => group.length));
}

function explicitIdentityTermsForAtom(atom) {
  const text = String(atom && atom.text || "");
  const terms = [];
  const patterns = [
    /[—–]\s*([A-Z][A-Za-z'’-]{2,})\b(?=\s+and\s+(?:his|her|their)\s+(?:spokesman|son|daughter|brother|sister|father|mother|wife|husband)\b)/g,
    /\b(?:named|called|namely|spokesman|son|daughter|brother|sister|father|mother|wife|husband)\s+([A-Z][A-Za-z'’-]{2,})\b/g
  ];
  const ignored = new Set(["And", "But", "For", "He", "Her", "His", "It", "Its", "She", "That", "The", "Their", "There", "These", "They", "This", "Those", "We", "What", "When", "Where", "Who"]);
  patterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      const term = match[1];
      const afterTerm = text.slice((match.index || 0) + match[0].length);
      // A shortened OSIS book name is often introduced by prose such as
      // “called Isa.” before a separately atomized citation. Require the
      // period plus citation/end punctuation, so real people (including book
      // names used without an abbreviation) remain protected identities.
      const citationAbbreviation = OSIS_CITATION_ABBREVIATIONS.has(term) &&
        /^\.(?:\s*(?:[ivxlcdm]+\b|\d+\b|v(?:erse)?\.|ch(?:apter)?\.|[,;:)\]])|\s*$)/iu.test(afterTerm);
      if (!ignored.has(term) && !citationAbbreviation && !terms.includes(term)) terms.push(term);
    }
  });
  return terms;
}

function explicitRelationsForAtom(atom) {
  const text = String(atom && atom.text || "");
  const relations = [];
  // The related person must be an actual capitalized proper name. Do not use the
  // case-insensitive flag here: it caused ordinary continuations such as
  // “her husband wears …” to be misread as a person named “Wears.”
  const pattern = /\b(?:[Hh]is|[Hh]er|[Tt]heir)\s+(spokesman|son|daughter|brother|sister|father|mother|wife|husband)\s+([A-Z][A-Za-z'’-]{2,})\b/g;
  for (const match of text.matchAll(pattern)) {
    const relation = match[1].toLowerCase();
    const term = match[2];
    if (!relations.some((candidate) => candidate.term === term && candidate.relation === relation)) {
      relations.push({term, relation});
    }
  }
  return relations;
}

function unsupportedMidSentenceCapitalizedTerms(value, sourceTexts) {
  const text = String(value || "");
  const ignored = new Set(["And", "But", "For", "From", "He", "Her", "His", "It", "Its", "Nor", "Or", "She", "So", "That", "The", "Their", "There", "These", "They", "This", "Those", "Thus", "We", "What", "When", "Where", "Who", "Yet"]);
  const candidates = [];
  for (const match of text.matchAll(/\b[A-Z][A-Za-z'’-]{2,}\b/g)) {
    const before = text.slice(0, match.index).trimEnd();
    const sentenceInitial = !before || /[.!?]$/.test(before);
    const normalizedTerm = match[0].replace(/[’']s$/i, "");
    if (!sentenceInitial && !ignored.has(normalizedTerm) && !candidates.includes(normalizedTerm)) candidates.push(normalizedTerm);
  }
  return candidates.filter((term) => {
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escapedTerm}\\b`, "i");
    return !sourceTexts.some((sourceText) => pattern.test(sourceText));
  });
}

function copiedSequence(blurb, sourceTexts, size = 12) {
  const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  const words = normalize(blurb).split(" ").filter(Boolean);
  if (words.length < size) return null;
  const haystacks = sourceTexts.map(normalize);
  for (let index = 0; index <= words.length - size; index += 1) {
    const phrase = words.slice(index, index + size).join(" ");
    if (haystacks.some((text) => text.includes(phrase))) return phrase;
  }
  return null;
}

export function validateChapterOutput(output, {
  schema,
  units,
  bookId,
  chapter,
  verseCount,
  expectedMetadata = {},
  expectedVerseIdsOverride = null
}) {
  const errors = validateAgainstSchema(output, schema, {instancePath: "$"});
  const warnings = [];
  const verseUnits = units.filter((unit) => unit.unit_type === "verse_range");
  const byUnitId = new Map(units.map((unit) => [unit.source_unit_id, unit]));
  const byAtomId = new Map(units.flatMap((unit) => (unit.source_atoms || []).map((atom) => [atom.source_atom_id, {...atom, source_unit_id: unit.source_unit_id}])));
  const expected = expectedVerseIdsOverride || expectedVerseIds(bookId, chapter, verseCount);
  const records = Array.isArray(output && output.records) ? output.records : [];
  const counts = new Map();
  records.forEach((record) => counts.set(record.verse_id, (counts.get(record.verse_id) || 0) + 1));
  expected.forEach((verseId) => {
    if (!counts.has(verseId)) errors.push(`$.records: missing expected verse ${verseId}`);
    else if (counts.get(verseId) !== 1) errors.push(`$.records: ${verseId} appears ${counts.get(verseId)} times`);
  });
  counts.forEach((count, verseId) => {
    if (!expected.includes(verseId)) errors.push(`$.records: unexpected verse ${verseId}`);
  });
  Object.entries(expectedMetadata).forEach(([key, value]) => {
    if (output && output[key] !== value) errors.push(`$.${key}: does not match the requested job metadata`);
  });
  records.forEach((record, index) => {
    const match = /^([A-Z0-9]{2,8})\.(\d+)\.(\d+)$/.exec(String(record.verse_id || ""));
    if (!match) return;
    const targetBook = match[1];
    const targetChapter = Number(match[2]);
    const targetVerse = Number(match[3]);
    const targetUnits = units.filter((unit) => unit.book_id === targetBook && unit.chapter === targetChapter);
    const expectedCoverage = chapterCoverageForVerse(targetUnits, targetVerse);
    const allowedUnitIds = new Set(expectedCoverage.sourceUnits.map((unit) => unit.source_unit_id));
    const citedIds = record.source_unit_ids || [];
    if (new Set(citedIds).size !== citedIds.length) {
      errors.push(`$.records[${index}].source_unit_ids: duplicate source-unit IDs are not allowed`);
    }
    const cited = citedIds.map((id) => byUnitId.get(id));
    citedIds.forEach((id) => {
      if (!byUnitId.has(id)) errors.push(`$.records[${index}].source_unit_ids: unknown source unit ${id}`);
      else if (!allowedUnitIds.has(id)) {
        errors.push(`$.records[${index}].source_unit_ids: ${id} does not cover ${record.verse_id} or its deterministic surrounding treatment`);
      }
    });
    const covering = cited.filter((unit) => unitCoversVerse(unit, targetBook, targetChapter, targetVerse));
    if (!expectedCoverage.sourceUnits.length) {
      errors.push(`$.records[${index}]: no source unit covers ${record.verse_id} or provides deterministic surrounding treatment`);
    }
    if (record.coverage_type !== expectedCoverage.coverageType) {
      errors.push(`$.records[${index}].coverage_type: expected ${expectedCoverage.coverageType}`);
    }
    const permittedCited = cited.filter((unit) => unit && allowedUnitIds.has(unit.source_unit_id));
    if (!permittedCited.length) {
      errors.push(`$.records[${index}]: cited source units do not cover ${record.verse_id} or its deterministic surrounding treatment`);
    }
    if (record.source_reference_label && permittedCited.length &&
        !permittedCited.some((unit) => unit.reference_label === record.source_reference_label)) {
      errors.push(`$.records[${index}].source_reference_label: does not match a cited supporting source unit`);
    }
    const citedAtomIds = record.source_atom_ids || [];
    if (expectedMetadata.prompt_version === PROMPT_VERSION && !citedAtomIds.length) {
      errors.push(`$.records[${index}].source_atom_ids: at least one exact commentary atom is required`);
    }
    if (new Set(citedAtomIds).size !== citedAtomIds.length) {
      errors.push(`$.records[${index}].source_atom_ids: duplicate source-atom IDs are not allowed`);
    }
    citedAtomIds.forEach((atomId) => {
      const atom = byAtomId.get(atomId);
      if (!atom) errors.push(`$.records[${index}].source_atom_ids: unknown source atom ${atomId}`);
      else if (!allowedUnitIds.has(atom.source_unit_id)) {
        errors.push(`$.records[${index}].source_atom_ids: ${atomId} is outside the permitted source treatment for ${record.verse_id}`);
      } else if (!citedIds.includes(atom.source_unit_id)) {
        errors.push(`$.records[${index}].source_atom_ids: ${atomId} belongs to an uncited source unit`);
      }
    });
    if (expectedMetadata.prompt_version === PROMPT_VERSION) {
      const targetMarkedAtoms = expectedCoverage.sourceUnits.flatMap((unit) =>
        (unit.source_atoms || []).filter((atom) => atomExplicitlyMarksVerse(atom, targetVerse))
      );
      const targetMarkedAtomIds = targetMarkedAtoms.map((atom) => atom.source_atom_id);
      if (targetMarkedAtomIds.length && !citedAtomIds.some((atomId) => targetMarkedAtomIds.includes(atomId))) {
        errors.push(`$.records[${index}].source_atom_ids: cite at least one atom that explicitly marks ${record.verse_id}`);
      }
      const requiredIdentityTerms = [...new Set(targetMarkedAtoms.flatMap(explicitIdentityTermsForAtom))];
      requiredIdentityTerms.forEach((term) => {
        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (!new RegExp(`\\b${escapedTerm}\\b`, "i").test(record.blurb || "")) {
          errors.push(`$.records[${index}].blurb: omitted explicit identity ${JSON.stringify(term)} from the target-marked commentary atom`);
        }
      });
      const requiredRelations = targetMarkedAtoms.flatMap(explicitRelationsForAtom);
      requiredRelations.forEach(({term, relation}) => {
        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const escapedRelation = relation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const relationPattern = new RegExp(`(?:\\b${escapedRelation}\\b.{0,50}\\b${escapedTerm}\\b|\\b${escapedTerm}\\b.{0,50}\\b${escapedRelation}\\b)`, "i");
        if (!relationPattern.test(record.blurb || "")) {
          errors.push(`$.records[${index}].blurb: omitted or reassigned explicit relation ${JSON.stringify(`${relation} ${term}`)}`);
        }
      });
    }
    const count = wordCount(record.blurb);
    if (count > 110) warnings.push(`${record.verse_id}: blurb is ${count} words (review above 110)`);
    const sourceReportingPhrase = findSourceReportingPhrase(record.blurb);
    if (expectedMetadata.prompt_version === PROMPT_VERSION && sourceReportingPhrase) {
      errors.push(`$.records[${index}].blurb: source-reporting phrase ${JSON.stringify(sourceReportingPhrase)} is forbidden; state the abridged substance directly`);
    }
    const citedAtomTexts = citedAtomIds.map((atomId) => byAtomId.get(atomId)).filter(Boolean).map((atom) => atom.text);
    if (expectedMetadata.prompt_version === PROMPT_VERSION) {
      const archaic = findArchaicTerm(record.blurb);
      if (archaic) errors.push(`$.records[${index}].blurb: archaic term ${JSON.stringify(archaic)} must be paraphrased into contemporary English`);
      unsupportedMidSentenceCapitalizedTerms(record.blurb, citedAtomTexts).forEach((term) => {
        errors.push(`$.records[${index}].blurb: capitalized term ${JSON.stringify(term)} is absent from the cited source atoms`);
      });
    }
    ["apostle", "Christ", "church", "covenant", "gospel", "Hezekiah", "Jerome", "Jesus", "Jonah", "providence", "Rabshakeh", "Sennacherib", "Yahweh", "Zion"]
      .forEach((term) => {
        const termPattern = new RegExp(`\\b${term}\\b`, "i");
        if (termPattern.test(record.blurb || "") && !citedAtomTexts.some((text) => termPattern.test(text))) {
          const message = `${record.verse_id}: named concept ${JSON.stringify(term)} is absent from the cited source atoms`;
          if (expectedMetadata.prompt_version === PROMPT_VERSION) errors.push(message);
          else warnings.push(message);
        }
      });
    const copied = copiedSequence(record.blurb, covering.flatMap((unit) =>
      (unit.source_atoms || []).filter((atom) => atom.atom_type === "commentary").map((atom) => atom.text)
    ));
    if (copied) warnings.push(`${record.verse_id}: possible 12-word source copy: ${JSON.stringify(copied)}`);
  });
  const sourceUnitIds = new Set(verseUnits.map((unit) => unit.source_unit_id));
  if (!sourceUnitIds.size) errors.push("No normalized verse-range units were supplied for validation.");
  return {valid: errors.length === 0, errors, warnings};
}

export function validateBookIntroOutput(output, {schema, units, bookId, expectedMetadata = {}}) {
  const errors = validateAgainstSchema(output, schema, {instancePath: "$"});
  const warnings = [];
  const byUnitId = new Map(units.map((unit) => [unit.source_unit_id, unit]));
  Object.entries(expectedMetadata).forEach(([key, value]) => {
    if (output && output[key] !== value) errors.push(`$.${key}: does not match the requested job metadata`);
  });
  const resource = output && output.resource || {};
  if (resource.book_id !== bookId || resource.resource_id !== `intro-${bookId}`) {
    errors.push("$.resource: book introduction association is invalid");
  }
  const citedIds = resource.source_unit_ids || [];
  if (new Set(citedIds).size !== citedIds.length) {
    errors.push("$.resource.source_unit_ids: duplicate source-unit IDs are not allowed");
  }
  const cited = citedIds.map((id) => byUnitId.get(id));
  citedIds.forEach((id) => {
    if (!byUnitId.has(id)) errors.push(`$.resource.source_unit_ids: unknown source unit ${id}`);
  });
  if (!cited.length || cited.some((unit) => !unit || unit.unit_type !== "book_intro" || unit.book_id !== bookId)) {
    errors.push("$.resource.source_unit_ids: introduction must cite only the selected book-introduction source unit");
  }
  const count = wordCount(resource.blurb);
  if (count > 130) warnings.push(`intro-${bookId}: blurb is ${count} words (review above 130)`);
  const sourceReportingPhrase = findSourceReportingPhrase(resource.blurb);
  if (expectedMetadata.prompt_version === PROMPT_VERSION && sourceReportingPhrase) {
    errors.push(`$.resource.blurb: source-reporting phrase ${JSON.stringify(sourceReportingPhrase)} is forbidden; state the abridged substance directly`);
  }
  const copied = copiedSequence(resource.blurb, cited.filter(Boolean).map((unit) => unit.source_text));
  if (copied) warnings.push(`intro-${bookId}: possible 12-word source copy: ${JSON.stringify(copied)}`);
  return {valid: errors.length === 0, errors, warnings};
}

export function chapterCoverageForVerse(units, verse) {
  const verseUnits = units.filter((unit) => unit.unit_type === "verse_range" &&
    Number.isInteger(unit.verse_start) && Number.isInteger(unit.verse_end));
  const covering = verseUnits.filter((unit) =>
    Number.isInteger(unit.verse_start) && verse >= unit.verse_start && verse <= unit.verse_end);
  if (covering.length) {
    return {
      coverageType: covering.some((unit) => unit.verse_start === verse && unit.verse_end === verse) ? "direct" : "range-derived",
      sourceUnits: covering
    };
  }
  const distance = (unit) => verse < unit.verse_start ? unit.verse_start - verse : verse - unit.verse_end;
  const nearestDistance = verseUnits.length ? Math.min(...verseUnits.map(distance)) : null;
  const surrounding = nearestDistance === null
    ? units.filter((unit) => unit.unit_type === "chapter_intro").slice(0, 1)
    : verseUnits.filter((unit) => distance(unit) === nearestDistance);
  return {coverageType: "no-distinct-comment", sourceUnits: surrounding};
}

function workerSourceUnit(unit) {
  if (!Array.isArray(unit.source_atoms) || !unit.source_atoms.length) {
    throw new Error(`${unit.source_unit_id} has no normalized commentary atoms. Re-normalize this chapter with ${NORMALIZED_SCHEMA_VERSION}.`);
  }
  return {
    schema_version: unit.schema_version,
    source_id: unit.source_id,
    source_unit_id: unit.source_unit_id,
    work_title: unit.work_title,
    book_id: unit.book_id,
    chapter: unit.chapter,
    verse_start: unit.verse_start,
    verse_end: unit.verse_end,
    reference_label: unit.reference_label,
    unit_type: unit.unit_type,
    worker_source_sha256: unit.worker_source_sha256,
    verse_anchors: unit.verse_anchors || [],
    source_atoms: unit.source_atoms
  };
}

export function buildChapterJobSpec({
  units,
  sourceManifest,
  model,
  bookId,
  chapter,
  verseCount,
  generatedAt,
  promptVersion = PROMPT_VERSION,
  schemaVersion = COMMENTARY_SCHEMA_VERSION
}) {
  const selectedNormalizedUnits = units.filter((unit) => unit.book_id === bookId && unit.chapter === chapter &&
    unit.unit_type === "verse_range");
  const selectedUnits = selectedNormalizedUnits.map(workerSourceUnit);
  const sourceHash = normalizedBatchHash(selectedUnits);
  const jobId = `${bookId}-${String(chapter).padStart(3, "0")}`;
  const requestedRecords = expectedVerseIds(bookId, chapter, verseCount).map((verseId, index) => {
    const coverage = chapterCoverageForVerse(selectedUnits, index + 1);
    if (!coverage.sourceUnits.length) {
      throw new Error(`${verseId} has no normalized source unit or deterministic surrounding treatment.`);
    }
    const markedAtoms = coverage.sourceUnits.flatMap((unit) =>
      unit.source_atoms
        .map((atom) => ({atom, specificity: atomVerseMarkerSpecificity(atom, index + 1)}))
        .filter(({specificity}) => specificity !== null)
    );
    // A broad block heading such as “vv. 8–11” should not become an additional
    // mandatory fact when a later atom explicitly treats “v. 9”. Require every
    // equally specific marker, but prefer the narrowest marker available.
    const bestMarkerSpecificity = markedAtoms.length
      ? Math.min(...markedAtoms.map(({specificity}) => specificity))
      : null;
    const targetMarkedAtoms = markedAtoms
      .filter(({specificity}) => specificity === bestMarkerSpecificity)
      .map(({atom}) => atom);
    return {
      verse_id: verseId,
      required_coverage_type: coverage.coverageType,
      allowed_source_unit_ids: coverage.sourceUnits.map((unit) => unit.source_unit_id),
      allowed_source_atom_ids: coverage.sourceUnits.flatMap((unit) => unit.source_atoms.map((atom) => atom.source_atom_id)),
      target_marked_source_atom_ids: targetMarkedAtoms.map((atom) => atom.source_atom_id),
      required_explicit_identity_terms: [...new Set(targetMarkedAtoms.flatMap(explicitIdentityTermsForAtom))],
      required_explicit_relations: targetMarkedAtoms.flatMap(explicitRelationsForAtom),
      verse_anchor_terms: coverage.sourceUnits.flatMap((unit) =>
        (unit.verse_anchors || []).filter((anchor) => anchor.verse === index + 1).flatMap((anchor) => anchor.anchor_terms)
      ),
      source_reference_labels: coverage.sourceUnits.map((unit) => unit.reference_label)
    };
  });
  return {
    metadata: {
      schema_version: schemaVersion,
      job_id: jobId,
      source_id: sourceManifest.source_id,
      source_version: sourceManifest.module_version,
      source_manifest_ref: "source-manifest.json",
      source_hash: sourceHash,
      worker_model: model,
      prompt_version: promptVersion,
      generation_timestamp: generatedAt,
      validation_status: "unvalidated",
      review_status: "unreviewed",
      book_id: bookId,
      chapter
    },
    sourceUnits: selectedUnits,
    requestedRecords
  };
}

export function buildBookIntroJobSpec({
  units,
  sourceManifest,
  model,
  bookId,
  generatedAt,
  promptVersion = LEGACY_PROMPT_VERSION
}) {
  const selectedUnits = units.filter((unit) => unit.book_id === bookId && unit.unit_type === "book_intro");
  if (selectedUnits.length !== 1) throw new Error(`Expected exactly one ${bookId} book-introduction source unit.`);
  return {
    metadata: {
      schema_version: BOOK_INTRO_SCHEMA_VERSION,
      job_id: `intro-${bookId}`,
      source_id: sourceManifest.source_id,
      source_version: sourceManifest.module_version,
      source_manifest_ref: "source-manifest.json",
      source_hash: normalizedBatchHash(selectedUnits),
      worker_model: model,
      prompt_version: promptVersion,
      generation_timestamp: generatedAt,
      validation_status: "unvalidated",
      review_status: "unreviewed"
    },
    sourceUnits: selectedUnits,
    requestedResource: {
      resource_id: `intro-${bookId}`,
      book_id: bookId,
      resource_type: "book_intro",
      allowed_source_unit_ids: selectedUnits.map((unit) => unit.source_unit_id),
      source_reference_labels: selectedUnits.map((unit) => unit.reference_label)
    }
  };
}

export function renderWorkerPrompt(template, jobSpec, kind) {
  const instructions = kind === "book_intro"
    ? "Summarize only the supplied book-introduction source unit as the requested book-level resource. Do not force it into a verse record."
    : "Produce exactly one record for every requested verse ID. Use each requested coverage type exactly. Cite only that record's allowed source-unit IDs and the exact allowed source-atom IDs that materially support its condensation.";
  return `${String(template || "").trim()}\n\n## Job kind\n\n${kind}\n\n${instructions}\n\n## Exact job metadata and requested output\n\n${JSON.stringify({metadata: jobSpec.metadata, requested_records: jobSpec.requestedRecords, requested_resource: jobSpec.requestedResource}, null, 2)}\n\n## Supplied normalized source units\n\n${JSON.stringify(jobSpec.sourceUnits, null, 2)}\n`;
}

export function buildFactBriefJobSpec({chapterJobSpec, generatedAt}) {
  if (!chapterJobSpec || !chapterJobSpec.metadata || !Array.isArray(chapterJobSpec.requestedRecords)) {
    throw new Error("A chapter job specification is required for fact extraction.");
  }
  const metadata = chapterJobSpec.metadata;
  return {
    metadata: {
      schema_version: FACT_BRIEF_SCHEMA_VERSION,
      job_id: metadata.job_id,
      source_id: metadata.source_id,
      source_version: metadata.source_version,
      source_hash: metadata.source_hash,
      worker_model: metadata.worker_model,
      prompt_version: FACT_PROMPT_VERSION,
      generation_timestamp: generatedAt || metadata.generation_timestamp,
      book_id: metadata.book_id,
      chapter: metadata.chapter
    },
    requestedVerses: chapterJobSpec.requestedRecords,
    sourceUnits: chapterJobSpec.sourceUnits.map((unit) => ({
      ...unit,
      source_atoms: (unit.source_atoms || []).map((atom) => ({
        ...atom,
        evidence_snippets: evidenceSnippetsForAtom(atom)
      }))
    }))
  };
}

export function renderFactExtractionPrompt(template, factJobSpec) {
  return `${String(template || "").trim()}\n\n## Exact fact-brief metadata and requested verses\n\n${JSON.stringify({metadata: factJobSpec.metadata, requested_verses: factJobSpec.requestedVerses}, null, 2)}\n\n## Supplied normalized source units\n\n${JSON.stringify(factJobSpec.sourceUnits, null, 2)}\n`;
}

export function renderAutonomousWriterPrompt(template, chapterJobSpec, factBrief) {
  const writerView = {
    ...Object.fromEntries(Object.entries(factBrief).filter(([key]) => key !== "verse_briefs")),
    verse_briefs: (factBrief.verse_briefs || []).map((brief) => ({
      ...brief,
      facts: (brief.facts || []).map(({evidence_quote: _evidenceQuote, source_snippet_id: _sourceSnippetId, ...fact}) => fact)
    }))
  };
  return `${String(template || "").trim()}\n\n## Exact commentary job metadata and requested records\n\n${JSON.stringify({metadata: chapterJobSpec.metadata, requested_records: chapterJobSpec.requestedRecords}, null, 2)}\n\n## Validated Spark fact brief view\n\n${JSON.stringify(writerView, null, 2)}\n`;
}

function normalizedEvidence(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function evidenceSnippetsForAtom(atom) {
  const text = normalizedEvidence(atom && atom.text);
  if (!text) return [];
  const words = text.split(" ");
  const spans = [];
  let start = 0;
  for (let index = 0; index < words.length; index += 1) {
    const length = index - start + 1;
    const token = words[index];
    const strongBoundary = /[.!?]["')\]]?$/u.test(token);
    const clauseBoundary = /[;:]["')\]]?$/u.test(token);
    const softBoundary = /,["')\]]?$/u.test(token);
    if ((length >= 8 && (strongBoundary || clauseBoundary)) || (length >= 28 && softBoundary) || length >= 40) {
      spans.push(words.slice(start, index + 1).join(" "));
      start = index + 1;
    }
  }
  if (start < words.length) spans.push(words.slice(start).join(" "));
  if (spans.length > 1 && wordCount(spans.at(-1)) < 3) {
    spans[spans.length - 2] = `${spans[spans.length - 2]} ${spans.at(-1)}`;
    spans.pop();
  }
  return spans.map((snippetText, index) => ({
    source_snippet_id: `${atom.source_atom_id}:s${String(index + 1).padStart(3, "0")}`,
    source_atom_id: atom.source_atom_id,
    sequence: index + 1,
    text: snippetText,
    text_sha256: sha256(snippetText)
  }));
}

export function hydrateFactBriefEvidence(factBrief, {chapterJobSpec}) {
  const hydrated = structuredClone(factBrief);
  const snippets = new Map(chapterJobSpec.sourceUnits.flatMap((unit) =>
    (unit.source_atoms || []).flatMap((atom) => evidenceSnippetsForAtom(atom).map((snippet) => [snippet.source_snippet_id, snippet]))
  ));
  const atoms = new Map(chapterJobSpec.sourceUnits.flatMap((unit) =>
    (unit.source_atoms || []).map((atom) => [atom.source_atom_id, atom])
  ));
  const requestByVerse = new Map(chapterJobSpec.requestedRecords.map((record) => [record.verse_id, record]));
  const stopWords = new Set(["a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for", "from", "had", "has", "have", "he", "her", "his", "i", "in", "is", "it", "its", "of", "on", "or", "that", "the", "their", "them", "they", "this", "to", "was", "were", "will", "with"]);
  const actorIgnored = new Set(["And", "But", "For", "From", "He", "Her", "His", "It", "Its", "Let", "Nor", "Or", "She", "So", "That", "The", "Their", "There", "These", "They", "This", "Those", "Thus", "We", "What", "When", "Where", "Who", "Yet"]);
  const wordTokens = (value) => String(value || "").match(/[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*/gu) || [];
  const qualificationAnchor = (evidence, qualification) => {
    if (qualification === "some_understand") {
      const match = /\bsome\s+(?:think|understand|take|make|interpret)(?:s|ing|ed)?\b/i.exec(evidence);
      return match && match[0];
    }
    if (qualification === "alternative") {
      const match = /\b(?:some\s+read|or it may|either|another|otherwise|or)\b/i.exec(evidence);
      return match && match[0];
    }
    if (qualification === "uncertain") {
      const match = /\b(?:may|might|perhaps|possibly|probably|likely|uncertain|unclear)\b/i.exec(evidence);
      return match && match[0];
    }
    return null;
  };
  const chooseShortAnchor = (term, statement, evidence) => {
    const cleanTerm = normalizedEvidence(term);
    if (wordCount(cleanTerm) === 1 && !findArchaicTerm(cleanTerm) && containsRequiredTerm(evidence, cleanTerm)) return cleanTerm;
    const statementWords = new Set(wordTokens(statement).map((word) => word.toLowerCase()));
    const candidates = wordTokens(cleanTerm).filter((word) => !findArchaicTerm(word) && containsRequiredTerm(evidence, word));
    const fallback = wordTokens(evidence).filter((word) => !findArchaicTerm(word) && statementWords.has(word.toLowerCase()));
    const pool = candidates.length ? candidates : fallback;
    const ranked = pool.filter((word) => !stopWords.has(word.toLowerCase())).sort((left, right) => {
      const properDifference = Number(/^[A-Z]/.test(right)) - Number(/^[A-Z]/.test(left));
      return properDifference || right.length - left.length || left.localeCompare(right);
    });
    return ranked[0] || pool[0] || null;
  };
  const addProtectedAnchor = (fact, anchor) => {
    if (!anchor || !containsRequiredTerm(fact.evidence_quote, anchor) ||
        (fact.must_include_terms || []).some((term) => containsRequiredTerm(term, anchor))) return;
    const qualifier = qualificationAnchor(fact.evidence_quote, fact.qualification);
    const retained = (fact.must_include_terms || []).filter((term) => !qualifier || term !== qualifier);
    fact.must_include_terms = [...(qualifier ? [qualifier] : []), anchor, ...retained]
      .filter((term, index, values) => values.findIndex((candidate) => candidate.toLowerCase() === term.toLowerCase()) === index)
      .slice(0, 3);
  };
  const commonPrefixLength = (left, right) => {
    let index = 0;
    while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
    return index;
  };
  const namedActorAnchors = (statement, evidence) => {
    const statementWords = wordTokens(statement).map((word) => word.toLowerCase().replace(/[’']s$/u, ""));
    const result = [];
    for (const match of String(evidence || "").matchAll(/\b[A-Z][A-Za-z'’-]{2,}\b/gu)) {
      const term = match[0].replace(/[’']s$/u, "");
      if (actorIgnored.has(term) || result.includes(term)) continue;
      const normalizedTerm = term.toLowerCase();
      const namedInStatement = statementWords.some((word) => word === normalizedTerm ||
        (Math.min(word.length, normalizedTerm.length) >= 6 && commonPrefixLength(word, normalizedTerm) >= 6));
      if (namedInStatement) result.push(term);
    }
    return result.slice(0, 2);
  };
  const deterministicVerseRelevance = (fact, request) => {
    const snippet = snippets.get(fact.source_snippet_id);
    const atom = atoms.get(fact.source_atom_id);
    if (!snippet || !atom) return fact.verse_relevance;
    const targetVerse = Number(String(request && request.verse_id || "").split(".").at(-1));
    let activeMarkers = [];
    const allSnippets = evidenceSnippetsForAtom(atom);
    let markerCarry = "";
    for (const candidate of allSnippets) {
      if (candidate.sequence > snippet.sequence) break;
      const combinedMarkerText = `${markerCarry} ${candidate.text}`;
      const groups = explicitVerseMarkerGroups(combinedMarkerText);
      if (groups.length) activeMarkers = groups.at(-1);
      markerCarry = String(candidate.text || "").slice(-16);
    }
    if (activeMarkers.includes(targetVerse)) return "target_marker";
    if (activeMarkers.length) return "shared_range_context";
    if ((request && request.verse_anchor_terms || []).some((term) => containsRequiredTerm(snippet.text, term))) {
      return "anchor_supported";
    }
    return "shared_range_context";
  };
  for (const brief of hydrated && hydrated.verse_briefs || []) {
    const request = requestByVerse.get(brief.verse_id);
    const facts = Array.isArray(brief.facts) ? brief.facts : [];
    facts.forEach((fact) => { fact.verse_relevance = deterministicVerseRelevance(fact, request); });
    const isTranslatedMaxim = (fact) => {
      const snippet = snippets.get(fact.source_snippet_id);
      const evidence = String(snippet && snippet.text || fact.evidence_quote || "");
      const pieces = evidence.split(/[—–]/u);
      if (pieces.length !== 2) return false;
      const leftWords = wordCount(pieces[0]);
      const rightWords = wordCount(pieces[1]);
      return leftWords >= 2 && leftWords <= 8 && rightWords >= 3;
    };
    const hasDirectTargetFact = facts.some((fact) => fact.verse_relevance === "target_marker" && !isTranslatedMaxim(fact));
    const targetMarkedAtomIds = new Set(request && request.target_marked_source_atom_ids || []);
    const isRequiredTargetMarkedFact = (fact) => fact.importance === "required" && targetMarkedAtomIds.has(fact.source_atom_id) &&
      !facts.some((candidate) => candidate.source_atom_id === fact.source_atom_id && candidate.verse_relevance === "target_marker");
    brief.facts = facts
      .filter((fact) => !isTranslatedMaxim(fact))
      // A required fact for an atom explicitly selected for this verse remains material
      // even if the atom's individual snippet has shared-range relevance. A later shared
      // snippet from an atom that already supplied direct-target evidence remains prunable.
      .filter((fact) => !hasDirectTargetFact || fact.verse_relevance !== "shared_range_context" || isRequiredTargetMarkedFact(fact))
      .slice(0, 3)
      .map((fact, index) => ({...fact, fact_id: `${brief.verse_id}:f${String(index + 1).padStart(2, "0")}`}));
    for (const fact of brief.facts || []) {
      const snippet = snippets.get(fact.source_snippet_id);
      if (snippet && snippet.source_atom_id === fact.source_atom_id) {
        fact.evidence_quote = snippet.text;
        // A worker can attach qualification metadata without making an uncertain claim.
        // Clear only that pure metadata mismatch; a cue in the statement or writer anchors
        // remains a substantive unsupported hedge for validation to reject.
        if (fact.qualification !== "none" &&
            !textContainsQualificationCue(snippet.text, fact.qualification) &&
            !textContainsQualificationCue(fact.statement, fact.qualification) &&
            !textContainsQualificationCue((fact.must_include_terms || []).join(" "), fact.qualification)) {
          fact.qualification = "none";
        }
        const qualifier = qualificationAnchor(snippet.text, fact.qualification);
        const anchors = (fact.must_include_terms || [])
          .map((term) => chooseShortAnchor(term, fact.statement, snippet.text))
          .filter(Boolean);
        fact.must_include_terms = [...(qualifier ? [qualifier] : []), ...anchors]
          .filter((term, index, values) => values.findIndex((candidate) => candidate.toLowerCase() === term.toLowerCase()) === index)
          .slice(0, 3);
        if (!fact.must_include_terms.length) {
          const fallback = chooseShortAnchor("", fact.statement, snippet.text);
          if (fallback) fact.must_include_terms = [fallback];
        }
        for (const actor of namedActorAnchors(fact.statement, snippet.text).reverse()) addProtectedAnchor(fact, actor);
      }
    }
    const requiredFacts = (brief.facts || []).filter((fact) => fact.importance === "required");
    for (const identity of request && request.required_explicit_identity_terms || []) {
      const fact = requiredFacts.find((candidate) => containsRequiredTerm(candidate.evidence_quote, identity));
      if (fact) addProtectedAnchor(fact, identity);
    }
    for (const relation of request && request.required_explicit_relations || []) {
      const fact = requiredFacts.find((candidate) => containsRequiredTerm(candidate.evidence_quote, relation.term) &&
        containsRequiredTerm(candidate.evidence_quote, relation.relation));
      if (fact) {
        addProtectedAnchor(fact, relation.term);
        addProtectedAnchor(fact, relation.relation);
      }
    }
  }
  return hydrated;
}

function containsRequiredTerm(value, term) {
  const haystack = normalizedEvidence(value).toLowerCase();
  const needle = normalizedEvidence(term).toLowerCase();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(haystack);
}

function inflectionForms(value) {
  const word = String(value || "").toLowerCase();
  const forms = new Set([word]);
  if (word.length < 5) return forms;
  if (word.endsWith("ies") && word.length > 5) forms.add(`${word.slice(0, -3)}y`);
  if (word.endsWith("es")) {
    forms.add(word.slice(0, -1));
    forms.add(word.slice(0, -2));
  }
  if (word.endsWith("s") && !word.endsWith("ss")) forms.add(word.slice(0, -1));
  if (word.endsWith("ing") && word.length > 6) {
    const base = word.slice(0, -3);
    forms.add(base);
    forms.add(`${base}e`);
    if (/(.)\1$/u.test(base)) forms.add(base.slice(0, -1));
  }
  if (word.endsWith("ed") && word.length > 5) {
    const base = word.slice(0, -2);
    forms.add(base);
    forms.add(`${base}e`);
    if (/(.)\1$/u.test(base)) forms.add(base.slice(0, -1));
  }
  return forms;
}

function containsWriterAnchor(value, term) {
  if (containsRequiredTerm(value, term)) return true;
  const cleanTerm = normalizedEvidence(term);
  if (!/^[a-z][a-z'-]{4,}$/u.test(cleanTerm)) return false;
  const requiredForms = inflectionForms(cleanTerm);
  return (String(value || "").match(/[A-Za-z]+(?:[’'-][A-Za-z]+)*/gu) || [])
    .some((word) => [...inflectionForms(word)].some((form) => requiredForms.has(form)));
}

function evidenceAppearsInAtom(atomText, evidence) {
  const atom = normalizedEvidence(atomText);
  const quote = normalizedEvidence(evidence);
  if (!quote) return false;
  if (atom.includes(quote) || atom.toLowerCase().includes(quote.toLowerCase())) return true;
  const wordsOnly = (value) => value.toLowerCase().replace(/[’']/gu, "'")
    .replace(/[^a-z0-9']+/gu, " ").replace(/\s+/g, " ").trim();
  const canonicalQuote = wordsOnly(quote);
  return canonicalQuote.length >= 3 && wordsOnly(atom).includes(canonicalQuote);
}

function textContainsQualificationCue(value, qualification) {
  const text = String(value || "");
  if (qualification === "none") return true;
  if (qualification === "some_understand") {
    return /\bsome\b.{0,50}\b(?:think|understand|take|make|interpret)(?:s|ing|ed)?\b/i.test(text);
  }
  if (qualification === "alternative") {
    return /\b(?:some\s+read|or|either|alternative|another|otherwise|others?)\b/i.test(text);
  }
  return /\b(?:may|might|perhaps|possibly|probably|likely|uncertain|unclear)\b/i.test(text);
}

export function validateFactBrief(factBrief, {schema, chapterJobSpec}) {
  const errors = validateAgainstSchema(factBrief, schema, {instancePath: "$"});
  const warnings = [];
  const expectedMetadata = buildFactBriefJobSpec({
    chapterJobSpec,
    generatedAt: factBrief && factBrief.generation_timestamp || chapterJobSpec.metadata.generation_timestamp
  }).metadata;
  Object.entries(expectedMetadata).forEach(([key, value]) => {
    if (factBrief && factBrief[key] !== value) errors.push(`$.${key}: does not match the requested fact-extraction metadata`);
  });
  const expectedByVerse = new Map(chapterJobSpec.requestedRecords.map((record) => [record.verse_id, record]));
  const sourceAtoms = new Map(chapterJobSpec.sourceUnits.flatMap((unit) =>
    (unit.source_atoms || []).map((atom) => [atom.source_atom_id, atom])
  ));
  const sourceSnippets = new Map(chapterJobSpec.sourceUnits.flatMap((unit) =>
    (unit.source_atoms || []).flatMap((atom) => evidenceSnippetsForAtom(atom).map((snippet) => [snippet.source_snippet_id, snippet]))
  ));
  const briefs = Array.isArray(factBrief && factBrief.verse_briefs) ? factBrief.verse_briefs : [];
  const counts = new Map();
  briefs.forEach((brief) => counts.set(brief.verse_id, (counts.get(brief.verse_id) || 0) + 1));
  expectedByVerse.forEach((_request, verseId) => {
    if (!counts.has(verseId)) errors.push(`$.verse_briefs: missing expected verse ${verseId}`);
    else if (counts.get(verseId) !== 1) errors.push(`$.verse_briefs: ${verseId} appears ${counts.get(verseId)} times`);
  });
  counts.forEach((_count, verseId) => {
    if (!expectedByVerse.has(verseId)) errors.push(`$.verse_briefs: unexpected verse ${verseId}`);
  });
  const seenFactIds = new Set();
  briefs.forEach((brief, briefIndex) => {
    const request = expectedByVerse.get(brief.verse_id);
    if (!request) return;
    if (brief.coverage_type !== request.required_coverage_type) {
      errors.push(`$.verse_briefs[${briefIndex}].coverage_type: expected ${request.required_coverage_type}`);
    }
    if (JSON.stringify(brief.source_unit_ids) !== JSON.stringify(request.allowed_source_unit_ids)) {
      errors.push(`$.verse_briefs[${briefIndex}].source_unit_ids: must exactly echo the requested source units`);
    }
    if (!request.source_reference_labels.includes(brief.source_reference_label)) {
      errors.push(`$.verse_briefs[${briefIndex}].source_reference_label: is not permitted for ${brief.verse_id}`);
    }
    const facts = Array.isArray(brief.facts) ? brief.facts : [];
    if (facts.length > 3) errors.push(`$.verse_briefs[${briefIndex}].facts: no more than three material facts are allowed`);
    if (!facts.some((fact) => fact.importance === "required")) {
      errors.push(`$.verse_briefs[${briefIndex}].facts: at least one required fact is needed`);
    }
    const normalizedStatements = new Set();
    facts.forEach((fact, factIndex) => {
      const expectedFactId = `${brief.verse_id}:f${String(factIndex + 1).padStart(2, "0")}`;
      const factPath = `$.verse_briefs[${briefIndex}].facts[${factIndex}]`;
      if (fact.fact_id !== expectedFactId) errors.push(`${factPath}.fact_id: expected ${expectedFactId}`);
      if (seenFactIds.has(fact.fact_id)) errors.push(`${factPath}.fact_id: duplicate fact ID ${fact.fact_id}`);
      seenFactIds.add(fact.fact_id);
      if (!request.allowed_source_atom_ids.includes(fact.source_atom_id)) {
        errors.push(`${factPath}.source_atom_id: is outside the permitted atoms for ${brief.verse_id}`);
      }
      const atom = sourceAtoms.get(fact.source_atom_id);
      if (!atom) errors.push(`${factPath}.source_atom_id: unknown source atom ${fact.source_atom_id}`);
      const snippet = sourceSnippets.get(fact.source_snippet_id);
      if (!snippet) errors.push(`${factPath}.source_snippet_id: unknown evidence snippet ${fact.source_snippet_id}`);
      else if (snippet.source_atom_id !== fact.source_atom_id) {
        errors.push(`${factPath}.source_snippet_id: does not belong to cited atom ${fact.source_atom_id}`);
      }
      const evidence = normalizedEvidence(fact.evidence_quote);
      const atomText = normalizedEvidence(atom && atom.text);
      if (snippet && evidence !== normalizedEvidence(snippet.text)) {
        errors.push(`${factPath}.evidence_quote: must exactly equal the controller-selected evidence snippet`);
      } else if (atom && !evidenceAppearsInAtom(atomText, evidence)) {
        errors.push(`${factPath}.evidence_quote: selected snippet is not a contiguous span of the cited atom`);
      }
      const evidenceWords = wordCount(evidence);
      if (evidenceWords < 1 || evidenceWords > 50) errors.push(`${factPath}.evidence_quote: must contain 1–50 words`);
      (fact.must_include_terms || []).forEach((term, termIndex) => {
        if (!containsRequiredTerm(evidence, term)) errors.push(`${factPath}.must_include_terms[${termIndex}]: is absent from the evidence quote`);
        if (wordCount(term) > 3) errors.push(`${factPath}.must_include_terms[${termIndex}]: must be a short anchor of no more than three words`);
      });
      unsupportedMidSentenceCapitalizedTerms(fact.statement, [atom && atom.text || ""]).forEach((term) => {
        errors.push(`${factPath}.statement: capitalized term ${JSON.stringify(term)} is absent from the cited atom`);
      });
      // Fact statements are private accuracy scaffolding. The reader-facing writer and
      // chapter admission reject source-reporting language after paraphrase.
      const archaicFactTerm = findArchaicTerm(fact.statement);
      if (archaicFactTerm) {
        errors.push(`${factPath}.statement: archaic term ${JSON.stringify(archaicFactTerm)} must be paraphrased into contemporary English`);
      }
      const statementKey = normalizedEvidence(fact.statement).toLowerCase();
      if (normalizedStatements.has(statementKey)) errors.push(`${factPath}.statement: duplicate fact statement within ${brief.verse_id}`);
      normalizedStatements.add(statementKey);
      if (!textContainsQualificationCue(evidence, fact.qualification)) {
        errors.push(`${factPath}.qualification: ${fact.qualification} lacks its corresponding cue in the evidence quote`);
      }
      if (!textContainsQualificationCue((fact.must_include_terms || []).join(" "), fact.qualification)) {
        errors.push(`${factPath}.must_include_terms: must carry the ${fact.qualification} cue into the writer contract`);
      }
    });
    request.target_marked_source_atom_ids.forEach((atomId) => {
      if (!facts.some((fact) => fact.importance === "required" && fact.source_atom_id === atomId)) {
        errors.push(`$.verse_briefs[${briefIndex}].facts: target-marked atom ${atomId} needs a required fact`);
      }
    });
    const requiredFactText = facts.filter((fact) => fact.importance === "required")
      .map((fact) => `${fact.statement} ${(fact.must_include_terms || []).join(" ")}`).join(" ");
    const requiredTermText = facts.filter((fact) => fact.importance === "required")
      .flatMap((fact) => fact.must_include_terms || []).join(" ");
    request.required_explicit_identity_terms.forEach((term) => {
      if (!containsRequiredTerm(requiredFactText, term) || !containsRequiredTerm(requiredTermText, term)) {
        errors.push(`$.verse_briefs[${briefIndex}].facts: omitted explicit identity ${JSON.stringify(term)}`);
      }
    });
    request.required_explicit_relations.forEach(({term, relation}) => {
      if (!containsRequiredTerm(requiredFactText, term) || !containsRequiredTerm(requiredFactText, relation) ||
          !containsRequiredTerm(requiredTermText, term) || !containsRequiredTerm(requiredTermText, relation)) {
        errors.push(`$.verse_briefs[${briefIndex}].facts: omitted explicit relation ${JSON.stringify(`${relation} ${term}`)}`);
      }
    });
  });
  return {valid: errors.length === 0, errors, warnings};
}

export function validateFactBoundChapterOutput(output, {factBrief, baseValidation}) {
  const errors = [...(baseValidation && baseValidation.errors || [])];
  const warnings = [...(baseValidation && baseValidation.warnings || [])];
  const records = new Map((output && output.records || []).map((record) => [record.verse_id, record]));
  for (const brief of factBrief && factBrief.verse_briefs || []) {
    const record = records.get(brief.verse_id);
    if (!record) continue;
    const allAtomIds = new Set((brief.facts || []).map((fact) => fact.source_atom_id));
    const citedAtomIds = new Set(record.source_atom_ids || []);
    for (const atomId of citedAtomIds) {
      if (!allAtomIds.has(atomId)) errors.push(`${brief.verse_id}: cited atom ${atomId} is absent from the validated fact brief`);
    }
    for (const fact of (brief.facts || []).filter((candidate) => candidate.importance === "required")) {
      if (!citedAtomIds.has(fact.source_atom_id)) {
        errors.push(`${brief.verse_id}: required fact ${fact.fact_id} is not backed by a cited atom`);
      }
      for (const term of fact.must_include_terms || []) {
        if (!containsWriterAnchor(record.blurb, term)) {
          errors.push(`${brief.verse_id}: required fact ${fact.fact_id} omitted must-include term ${JSON.stringify(term)}`);
        }
      }
    }
    if (JSON.stringify(record.source_unit_ids) !== JSON.stringify(brief.source_unit_ids)) {
      errors.push(`${brief.verse_id}: source-unit IDs do not match the validated fact brief`);
    }
    if (record.source_reference_label !== brief.source_reference_label) {
      errors.push(`${brief.verse_id}: source-reference label does not match the validated fact brief`);
    }
  }
  return {valid: errors.length === 0, errors, warnings};
}

export function requireAutonomousAdmission(validation) {
  const errors = [...(validation && validation.errors || [])];
  const warnings = [...(validation && validation.warnings || [])];
  warnings.forEach((warning) => errors.push(`Autonomous admission requires zero warnings: ${warning}`));
  return {valid: errors.length === 0, errors, warnings: []};
}

export function jobFingerprint(metadata) {
  return sha256(stableJson({
    schema_version: metadata.schema_version,
    source_hash: metadata.source_hash,
    prompt_version: metadata.prompt_version,
    worker_model: metadata.worker_model,
    generation_mode: metadata.generation_mode || null,
    fact_brief_hash: metadata.fact_brief_hash || null,
    fact_prompt_version: metadata.fact_prompt_version || null
  }));
}

export function shouldSkipCompletedJob(manifest, metadata, outputValidation) {
  const fingerprint = jobFingerprint(metadata);
  const job = (manifest && Array.isArray(manifest.jobs) ? manifest.jobs : []).find((candidate) =>
    candidate.job_id === metadata.job_id && candidate.worker_model === metadata.worker_model &&
    candidate.fingerprint === fingerprint && candidate.status === "completed"
  );
  return Boolean(job && outputValidation && outputValidation.valid);
}

export function requireFullCorpusConfirmation(options) {
  if (options && options.all && options.confirmFullCorpus !== true) {
    throw new Error("Full-corpus processing is locked. Re-run with --confirm-full-corpus after reviewing the selected source and pilot.");
  }
  return true;
}

export function exportChapterRuntime(output, sourceManifest, validation, normalizedUnits = []) {
  if (!validation || !validation.valid) throw new Error("Cannot export a chapter result that failed validation.");
  const records = {};
  const normalizedAtoms = new Map(normalizedUnits.flatMap((unit) => (unit.source_atoms || []).map((atom) => [atom.source_atom_id, {
    source_atom_id: atom.source_atom_id,
    source_unit_id: unit.source_unit_id,
    source_reference_label: unit.reference_label,
    sequence: atom.sequence,
    atom_type: atom.atom_type,
    text: atom.text,
    text_sha256: atom.text_sha256
  }])));
  const citedAtomIds = new Set();
  output.records.slice().sort((left, right) => {
    const verse = (value) => Number(String(value).split(".").at(-1));
    return verse(left.verse_id) - verse(right.verse_id);
  }).forEach((record) => {
    const runtimeRecord = {
      blurb: record.blurb,
      coverage_type: record.coverage_type,
      scope_note: record.scope_note,
      source_unit_ids: record.source_unit_ids,
      source_reference_label: record.source_reference_label
    };
    if (Array.isArray(record.source_atom_ids) && record.source_atom_ids.length) {
      runtimeRecord.source_atom_ids = record.source_atom_ids;
      record.source_atom_ids.forEach((atomId) => citedAtomIds.add(atomId));
    }
    records[record.verse_id] = runtimeRecord;
  });
  const runtime = {
    schema_version: RUNTIME_SCHEMA_VERSION,
    source_id: output.source_id,
    source_version: output.source_version,
    source_archive_sha256: sourceManifest.archive_sha256,
    source_manifest_ref: output.source_manifest_ref,
    worker_model: output.worker_model,
    prompt_version: output.prompt_version,
    generation_timestamp: output.generation_timestamp,
    validation_status: "valid",
    review_status: output.review_status,
    label: "Matthew Henry — condensed paraphrase",
    book_id: output.book_id,
    chapter: output.chapter,
    records
  };
  if (citedAtomIds.size) {
    runtime.source_layer_note = "Exact public-domain commentary excerpts used for the condensation; embedded Scripture transcription is omitted.";
    runtime.source_atoms = {};
    [...citedAtomIds].sort().forEach((atomId) => {
      const atom = normalizedAtoms.get(atomId);
      if (!atom) throw new Error(`Cannot export unknown cited source atom ${atomId}.`);
      runtime.source_atoms[atomId] = atom;
    });
  }
  return runtime;
}

export function exportBookIntroRuntime(output, sourceManifest, validation) {
  if (!validation || !validation.valid) throw new Error("Cannot export a book introduction that failed validation.");
  return {
    schema_version: RUNTIME_SCHEMA_VERSION,
    source_id: output.source_id,
    source_version: output.source_version,
    source_archive_sha256: sourceManifest.archive_sha256,
    source_manifest_ref: output.source_manifest_ref,
    worker_model: output.worker_model,
    prompt_version: output.prompt_version,
    generation_timestamp: output.generation_timestamp,
    validation_status: "valid",
    review_status: output.review_status,
    label: "AI-generated summary of Matthew Henry's commentary",
    resource: output.resource
  };
}

export function bookName(bookId) {
  return BOOK_BY_ID.get(bookId)?.name || bookId;
}

export function addCivilDays(isoDate, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || "")) || !Number.isInteger(days)) {
    throw new Error("Civil dates must use YYYY-MM-DD and an integer day offset.");
  }
  const [year, month, day] = isoDate.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

export function civilDateInTimeZone(now, timeZone) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) throw new Error("The schedule clock is invalid.");
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function civilDayNumber(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function scheduleContext({plan, appConfig, now = new Date(), today}) {
  if (!plan || !Array.isArray(plan.entries) || !appConfig) throw new Error("The active plan and app config are required.");
  if (appConfig.sharedStartDateMode !== "fixed" || !/^\d{4}-\d{2}-\d{2}$/.test(String(appConfig.sharedStartDate || ""))) {
    throw new Error("Day-ahead generation requires a fixed shared start date.");
  }
  const timezone = appConfig.timezone || "America/Detroit";
  const preparedOn = today || civilDateInTimeZone(now, timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(preparedOn)) throw new Error("--today must use YYYY-MM-DD.");
  return {preparedOn, timezone};
}

function scheduledTarget({plan, appConfig, preparedOn, timezone, daysAhead}) {
  const scheduleDate = addCivilDays(preparedOn, daysAhead);
  const dayIndex = civilDayNumber(scheduleDate) - civilDayNumber(appConfig.sharedStartDate) + 1;
  const matches = plan.entries.filter((entry) => entry.dayIndex === dayIndex);
  if (matches.length !== 1) throw new Error(`No unique active reading is scheduled for ${scheduleDate}.`);
  const entry = matches[0];
  if (Array.isArray(appConfig.testingReadingIds) && !appConfig.testingReadingIds.includes(entry.readingId)) {
    throw new Error(`${entry.readingId} is outside the active allowlisted schedule window.`);
  }
  return {preparedOn, scheduleDate, daysAhead, timezone, dayIndex, entry};
}

export const MAX_SCHEDULE_READING_COUNT = 14;

export function resolveScheduledBatch({
  plan,
  appConfig,
  startReadingId,
  readingCount,
  now = new Date(),
  today
}) {
  if (!Number.isInteger(readingCount) || readingCount < 1 || readingCount > MAX_SCHEDULE_READING_COUNT) {
    throw new Error(`A schedule activation must request between 1 and ${MAX_SCHEDULE_READING_COUNT} consecutive readings.`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(String(startReadingId || ""))) {
    throw new Error("A schedule activation requires a valid start reading ID.");
  }
  const context = scheduleContext({plan, appConfig, now, today});
  const startMatches = plan.entries.filter((entry) => entry.readingId === startReadingId);
  if (startMatches.length !== 1) throw new Error(`No unique active reading matches ${startReadingId}.`);
  const startDayIndex = startMatches[0].dayIndex;
  const targets = Array.from({length: readingCount}, (_, offset) => {
    const dayIndex = startDayIndex + offset;
    const matches = plan.entries.filter((entry) => entry.dayIndex === dayIndex);
    if (matches.length !== 1) throw new Error(`No unique active reading follows ${startReadingId} at day index ${dayIndex}.`);
    const entry = matches[0];
    if (Array.isArray(appConfig.testingReadingIds) && !appConfig.testingReadingIds.includes(entry.readingId)) {
      throw new Error(`${entry.readingId} is outside the active allowlisted schedule window.`);
    }
    const scheduleDate = addCivilDays(appConfig.sharedStartDate, dayIndex - 1);
    return {
      preparedOn: context.preparedOn,
      scheduleDate,
      daysAhead: civilDayNumber(scheduleDate) - civilDayNumber(context.preparedOn),
      timezone: context.timezone,
      dayIndex,
      entry
    };
  });
  return {
    preparedOn: context.preparedOn,
    timezone: context.timezone,
    readingCount,
    daysAhead: readingCount - 1,
    startReadingId,
    windowStartDate: targets[0].scheduleDate,
    windowEndDate: targets.at(-1).scheduleDate,
    targets
  };
}

export function resolveScheduledReading({plan, appConfig, now = new Date(), today, daysAhead = 1}) {
  if (!Number.isInteger(daysAhead) || daysAhead < 0 || daysAhead > 1) {
    throw new Error("The single-reading audit pipeline is deliberately limited to today or one day ahead.");
  }
  const context = scheduleContext({plan, appConfig, now, today});
  return scheduledTarget({plan, appConfig, ...context, daysAhead});
}

export function resolveScheduledWindow({plan, appConfig, now = new Date(), today, daysAhead = 2, readingCount}) {
  if (readingCount === undefined && (!Number.isInteger(daysAhead) || daysAhead < 0 || daysAhead > 2)) {
    throw new Error("The interactive rolling audit window is deliberately limited to today through two days ahead.");
  }
  const resolvedCount = readingCount === undefined ? daysAhead + 1 : readingCount;
  if (!Number.isInteger(resolvedCount) || resolvedCount < 1 || resolvedCount > MAX_SCHEDULE_READING_COUNT) {
    throw new Error(`A rolling schedule request must contain between 1 and ${MAX_SCHEDULE_READING_COUNT} readings.`);
  }
  const context = scheduleContext({plan, appConfig, now, today});
  const first = scheduledTarget({plan, appConfig, ...context, daysAhead: 0});
  return resolveScheduledBatch({
    plan,
    appConfig,
    startReadingId: first.entry.readingId,
    readingCount: resolvedCount,
    now,
    today: context.preparedOn
  });
}
