#!/usr/bin/env node

import {createReadStream} from "node:fs";
import {createHash} from "node:crypto";
import {readFile, stat} from "node:fs/promises";
import {createServer} from "node:http";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const PORT = Number(process.env.DBR_PORT || 4173);
const HOST = "127.0.0.1";
const ACTIVE_PLAN = JSON.parse(await readFile(path.join(ROOT, "fixtures/pilot-content/plan.json"), "utf8"));
const BRIDGE_READING_IDS = ACTIVE_PLAN.entries.map((entry) => entry.readingId);
const MHC_PILOT_READING_IDS = ["intro-GEN", "GEN-001"];
const MHC_WINDOW_ROOT = path.join(ROOT, "private-commentary", "mhc", "stores", "current-window");
const ALLOWED_PREFIXES = ["app/frontend/", "app/shared/", "fixtures/", "config/", "web/"];
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, {"Content-Type": "text/plain; charset=utf-8", ...headers});
  response.end(body);
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {"Content-Type": "application/json; charset=utf-8", ...headers});
  response.end(`${JSON.stringify(value)}\n`);
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function mergeCommentaryMarkdown(metadata, markdown) {
  const commentary = structuredClone(metadata);
  const sections = new Map();
  let title = "";
  let lines = [];
  function flush() {
    if (title) sections.set(slug(title), lines.join("\n").trim());
    lines = [];
  }
  String(markdown || "").replace(/\r\n?/g, "\n").split("\n").forEach((line) => {
    const heading = /^##\s+(.+)$/.exec(line.trim());
    if (heading) {
      flush();
      title = heading[1].trim();
    } else if (!/^#\s+/.test(line.trim())) {
      lines.push(line);
    }
  });
  flush();
  commentary.sections = (commentary.sections || []).map((section) => ({
    ...section,
    markdown: sections.get(slug(section.title)) || section.markdown
  }));
  commentary.overview = sections.get("brief-overview") || commentary.overview;
  if (commentary.comprehensiveSynthesis && sections.get("comprehensive-synthesis")) {
    commentary.comprehensiveSynthesis.markdown = sections.get("comprehensive-synthesis");
  }
  return commentary;
}

async function scheduleMhcRuntimes(readingId) {
  const privateMhcRoot = path.join(ROOT, "private-commentary", "mhc");
  const portable = await windowStoreReading(readingId);
  if (portable && Array.isArray(portable.chapters) && portable.chapters.length &&
      portable.chapters.every((chapter) => ["in_review", "approved"].includes(chapter.runtime && chapter.runtime.review_status))) {
    return portable.chapters.map((chapter) => chapter.runtime);
  }
  try {
    const audit = JSON.parse(await readFile(path.join(privateMhcRoot, "schedule", readingId, "audit.json"), "utf8"));
    if (audit.reading_id !== readingId || !["unreviewed", "in_review", "approved"].includes(audit.audit_status) ||
        !Array.isArray(audit.passages) || !audit.passages.length) return [];
    const runtimes = [];
    for (const passage of audit.passages) {
      const runtimePath = path.resolve(privateMhcRoot, String(passage.runtime_path || ""));
      if (!runtimePath.startsWith(`${privateMhcRoot}${path.sep}`)) throw new Error("Unsafe Matthew Henry runtime path");
      runtimes.push(JSON.parse(await readFile(runtimePath, "utf8")));
    }
    return runtimes;
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function windowStoreManifest() {
  const manifest = JSON.parse(await readFile(path.join(MHC_WINDOW_ROOT, "manifest.json"), "utf8"));
  if (manifest.schema_version !== "mhc-window-store/v1" || !Array.isArray(manifest.readings) ||
      manifest.contains_scripture !== false || manifest.publication_status !== "not_published") {
    throw new Error("Invalid Matthew Henry window-store manifest");
  }
  return manifest;
}

async function windowStoreReading(readingId) {
  if (!BRIDGE_READING_IDS.includes(readingId)) throw new Error("Unknown reading");
  try {
    const manifest = await windowStoreManifest();
    const descriptor = manifest.readings.find((candidate) => candidate.reading_id === readingId);
    if (!descriptor) return null;
    const readingPath = path.resolve(MHC_WINDOW_ROOT, String(descriptor.file || ""));
    if (!readingPath.startsWith(`${MHC_WINDOW_ROOT}${path.sep}`)) throw new Error("Unsafe Matthew Henry window-store path");
    const bytes = await readFile(readingPath, "utf8");
    if (sha256(bytes) !== descriptor.sha256) throw new Error("Matthew Henry window-store checksum mismatch");
    const reading = JSON.parse(bytes);
    if (reading.schema_version !== "mhc-portable-reading/v1" || reading.reading_id !== readingId ||
        reading.plan_version !== manifest.plan_version || reading.contains_scripture !== false ||
        reading.publication_status !== "not_published") {
      throw new Error("Invalid Matthew Henry portable reading");
    }
    return reading;
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function privateDraftPayload(readingId) {
  if (!BRIDGE_READING_IDS.includes(readingId)) throw new Error("Unknown reading");
  const contentDir = path.join(ROOT, "private-content/bridge/celebration-y3q4");
  const [markdown, metadata, registry] = await Promise.all([
    readFile(path.join(contentDir, `${readingId}.md`), "utf8"),
    readFile(path.join(contentDir, `${readingId}.metadata.json`), "utf8").then(JSON.parse),
    readFile(path.join(ROOT, "research/working/bridge-source-registry.json"), "utf8").then(JSON.parse)
  ]);
  const commentary = mergeCommentaryMarkdown(metadata, markdown);
  const verseCommentaries = await scheduleMhcRuntimes(readingId);
  if (verseCommentaries.length === 1) commentary.verseCommentary = verseCommentaries[0];
  else if (verseCommentaries.length > 1) commentary.verseCommentaries = verseCommentaries;
  const sourceIds = new Set();
  (commentary.dailyIntroduction?.sourceIds || []).forEach((sourceId) => sourceIds.add(sourceId));
  (commentary.commentarySummary?.paragraphs || []).forEach((paragraph) =>
    paragraph.sourceIds.forEach((sourceId) => sourceIds.add(sourceId))
  );
  (commentary.practicalTakeaway?.sourceIds || []).forEach((sourceId) => sourceIds.add(sourceId));
  (commentary.sections || []).forEach((section) => section.sourceIds.forEach((sourceId) => sourceIds.add(sourceId)));
  (commentary.comprehensiveSynthesis?.sourceIds || []).forEach((sourceId) => sourceIds.add(sourceId));
  commentary.claims.forEach((claim) => claim.sourceIds.forEach((sourceId) => sourceIds.add(sourceId)));
  return {commentary, sources: registry.sources.filter((source) => sourceIds.has(source.sourceId))};
}

function mhcPilotPlan() {
  const planVersion = "genesis-mhc-pilot-local-v1";
  return {
    schemaVersion: "plan/v1",
    planVersion,
    title: "Local Genesis Matthew Henry pilot",
    canonId: "protestant-66-provisional-configurable",
    entries: [
      {
        planVersion,
        dayIndex: 1,
        readingId: "intro-GEN",
        kind: "book_intro",
        bookId: "GEN",
        unitLabel: "Genesis introduction",
        orderingRationale: "Local-only calibration resource; it does not alter the active bridge.",
        chronologyBasis: "pragmatic",
        confidence: "high",
        notes: "Matthew Henry's Genesis opener remains a book-level resource.",
        sourceIds: []
      },
      {
        planVersion,
        dayIndex: 2,
        readingId: "GEN-001",
        kind: "chapter",
        bookId: "GEN",
        chapter: 1,
        passages: [{bookId: "GEN", chapter: 1, verseCount: 31}],
        contextReadingIds: ["intro-GEN"],
        orderingRationale: "Local-only calibration chapter; it does not alter the active bridge.",
        chronologyBasis: "pragmatic",
        confidence: "high",
        notes: "The displayed Scripture is conspicuously fabricated local test text.",
        sourceIds: []
      }
    ],
    bookMetrics: {
      GEN: {verseCount: 1533, chapterCount: 50, versification: "ESV API policy metric; no ESV text is stored"}
    }
  };
}

function mhcPilotConfig() {
  return {
    schemaVersion: "app-config/v1",
    sharedStartDate: null,
    sharedStartDateMode: "testing_today",
    timezone: "America/Detroit",
    futureReadingsLocked: true,
    futureLookaheadDays: 1,
    pastReadingsAvailable: true,
    offlineReadingWindowDays: 2,
    privateContentCacheMaxAgeSeconds: 604800,
    testingOverrideEnabled: true,
    testingReadingIds: MHC_PILOT_READING_IDS,
    displayTranslation: "ESV",
    runtimeAI: false
  };
}

function fabricatedMhcRuntime(readingId) {
  const common = {
    schema_version: "mhc-runtime/v1",
    source_id: "fabricated-ui-test",
    source_version: "test-only",
    source_archive_sha256: "0".repeat(64),
    source_manifest_ref: "FABRICATED-UI-TEST",
    worker_model: "FABRICATED-NO-MODEL",
    prompt_version: "fabricated-ui-test/v1",
    generation_timestamp: "2026-08-10T00:00:00.000Z",
    validation_status: "valid",
    review_status: "unreviewed",
    label: "FABRICATED UI TEST — not Matthew Henry commentary"
  };
  if (readingId === "intro-GEN") {
    return {...common, resource: {
      resource_id: "intro-GEN",
      book_id: "GEN",
      resource_type: "book_intro",
      blurb: "Fabricated book-level summary used only to verify the local layout when no model output exists.",
      scope_note: "Fabricated book-introduction scope for interface testing only.",
      source_unit_ids: ["fabricated-ui-test:GEN:book-intro"],
      source_reference_label: "FABRICATED Genesis introduction"
    }};
  }
  const records = Object.fromEntries(Array.from({length: 31}, (_, index) => {
    const verse = index + 1;
    return [`GEN.1.${verse}`, {
      blurb: `Fabricated verse ${verse} commentary summary used only to verify immediate local lookup, layout, and accessibility.`,
      coverage_type: "range-derived",
      scope_note: "Fabricated shared-range scope for interface testing only.",
      source_unit_ids: ["fabricated-ui-test:GEN:001:001-031"],
      source_reference_label: "FABRICATED Genesis 1:1–31"
    }];
  }));
  return {...common, book_id: "GEN", chapter: 1, records};
}

async function mhcRuntimeOrFabricated(readingId, runtimePath) {
  try {
    return JSON.parse(await readFile(runtimePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return fabricatedMhcRuntime(readingId);
    throw error;
  }
}

async function mhcPilotPayload(readingId) {
  if (!MHC_PILOT_READING_IDS.includes(readingId)) throw new Error("Unknown reading");
  const stem = readingId === "intro-GEN" ? "introduction" : "001";
  const runtimePath = readingId === "intro-GEN"
    ? path.join(ROOT, "private-commentary/mhc/runtime/GEN/introduction.json")
    : path.join(ROOT, "private-commentary/mhc/runtime/GEN/001.json");
  const [markdown, metadata, runtime, registry] = await Promise.all([
    readFile(path.join(ROOT, `private-content/books/GEN/${stem}.md`), "utf8"),
    readFile(path.join(ROOT, `private-content/books/GEN/${stem}.metadata.json`), "utf8").then(JSON.parse),
    mhcRuntimeOrFabricated(readingId, runtimePath),
    readFile(path.join(ROOT, "private-content/bundles/pilot-review/config/source-registry.json"), "utf8").then(JSON.parse)
  ]);
  const commentary = mergeCommentaryMarkdown(metadata, markdown);
  if (readingId === "intro-GEN") commentary.bookCommentary = runtime;
  else commentary.verseCommentary = runtime;
  const sourceIds = new Set();
  (commentary.dailyIntroduction?.sourceIds || []).forEach((sourceId) => sourceIds.add(sourceId));
  (commentary.keyInsights || []).forEach((insight) => (insight.sourceIds || []).forEach((sourceId) => sourceIds.add(sourceId)));
  (commentary.sections || []).forEach((section) => (section.sourceIds || []).forEach((sourceId) => sourceIds.add(sourceId)));
  (commentary.claims || []).forEach((claim) => (claim.sourceIds || []).forEach((sourceId) => sourceIds.add(sourceId)));
  return {commentary, sources: registry.sources.filter((source) => sourceIds.has(source.sourceId))};
}

const server = createServer(async (request, response) => {
  const headers = {
    "Cache-Control": "no-store, max-age=0",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    send(response, 405, "Method not allowed.", headers);
    return;
  }
  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  if (url.pathname === "/__mhc/window/manifest.json") {
    try {
      sendJson(response, 200, await windowStoreManifest(), headers);
    } catch {
      sendJson(response, 404, {error: "Private Matthew Henry window store is unavailable."}, headers);
    }
    return;
  }
  const mhcWindowReading = /^\/__mhc\/window\/readings\/([A-Za-z0-9_-]+)\.json$/.exec(url.pathname);
  if (mhcWindowReading) {
    try {
      if (!BRIDGE_READING_IDS.includes(mhcWindowReading[1])) throw new Error("Reading is outside the active plan");
      const reading = await windowStoreReading(mhcWindowReading[1]);
      if (!reading) throw new Error("Reading is outside the current window");
      sendJson(response, 200, reading, headers);
    } catch {
      sendJson(response, 404, {error: "Private Matthew Henry window reading is unavailable."}, headers);
    }
    return;
  }
  if (url.pathname === "/__mhc/config.json") {
    sendJson(response, 200, mhcPilotConfig(), headers);
    return;
  }
  if (url.pathname === "/__mhc/plan.json") {
    sendJson(response, 200, mhcPilotPlan(), headers);
    return;
  }
  if (url.pathname === "/__mhc/registry.json") {
    try {
      const registry = JSON.parse(await readFile(path.join(ROOT, "private-content/bundles/pilot-review/config/source-registry.json"), "utf8"));
      sendJson(response, 200, registry, headers);
    } catch {
      sendJson(response, 404, {error: "Private pilot registry is unavailable."}, headers);
    }
    return;
  }
  const mhcReading = /^\/__mhc\/reading\/(intro-GEN|GEN-001)\.json$/.exec(url.pathname);
  if (mhcReading) {
    try {
      sendJson(response, 200, await mhcPilotPayload(mhcReading[1]), headers);
    } catch {
      sendJson(response, 404, {error: "Private Matthew Henry pilot output is unavailable."}, headers);
    }
    return;
  }
  if (url.pathname === "/__private/registry.json") {
    try {
      const registry = JSON.parse(await readFile(path.join(ROOT, "research/working/bridge-source-registry.json"), "utf8"));
      sendJson(response, 200, registry, headers);
    } catch {
      sendJson(response, 404, {error: "Private draft registry is unavailable."}, headers);
    }
    return;
  }
  const privateReading = /^\/__private\/reading\/([A-Za-z0-9_-]+)\.json$/.exec(url.pathname);
  if (privateReading) {
    try {
      if (!BRIDGE_READING_IDS.includes(privateReading[1])) throw new Error("Reading is outside the active plan");
      sendJson(response, 200, await privateDraftPayload(privateReading[1]), headers);
    } catch {
      sendJson(response, 404, {error: "Private draft reading is unavailable."}, headers);
    }
    return;
  }
  if (url.pathname === "/") {
    response.writeHead(302, {...headers, Location: "/app/frontend/"});
    response.end();
    return;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  } catch {
    send(response, 400, "Invalid path.", headers);
    return;
  }
  if (decoded.endsWith("/")) decoded += "index.html";
  if (!ALLOWED_PREFIXES.some((prefix) => decoded.startsWith(prefix)) || decoded.includes("..") || decoded.startsWith(".")) {
    send(response, 404, "Not found.", headers);
    return;
  }
  const absolute = path.resolve(ROOT, decoded);
  if (!absolute.startsWith(`${ROOT}${path.sep}`)) {
    send(response, 404, "Not found.", headers);
    return;
  }
  try {
    const info = await stat(absolute);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, {"Content-Type": MIME[path.extname(absolute)] || "application/octet-stream", ...headers});
    if (request.method === "HEAD") response.end();
    else createReadStream(absolute).pipe(response);
  } catch {
    send(response, 404, "Not found.", headers);
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Daily Bible Reader local preview: http://${HOST}:${PORT}/app/frontend/\n`);
});
