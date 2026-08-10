#!/usr/bin/env node

import {createReadStream} from "node:fs";
import {readFile, stat} from "node:fs/promises";
import {createServer} from "node:http";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const PORT = Number(process.env.DBR_PORT || 4173);
const HOST = "127.0.0.1";
const BRIDGE_READING_IDS = [
  "CC-Y3Q4-D054",
  "CC-Y3Q4-D055",
  "CC-Y3Q4-D056",
  "CC-Y3Q4-D057",
  "CC-Y3Q4-D058",
  "CC-Y3Q4-D059",
  "CC-Y3Q4-D060"
];
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

async function privateDraftPayload(readingId) {
  if (!BRIDGE_READING_IDS.includes(readingId)) throw new Error("Unknown reading");
  const contentDir = path.join(ROOT, "private-content/bridge/celebration-y3q4");
  const [markdown, metadata, registry] = await Promise.all([
    readFile(path.join(contentDir, `${readingId}.md`), "utf8"),
    readFile(path.join(contentDir, `${readingId}.metadata.json`), "utf8").then(JSON.parse),
    readFile(path.join(ROOT, "research/working/bridge-source-registry.json"), "utf8").then(JSON.parse)
  ]);
  const commentary = mergeCommentaryMarkdown(metadata, markdown);
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
  if (url.pathname === "/__private/registry.json") {
    try {
      const registry = JSON.parse(await readFile(path.join(ROOT, "research/working/bridge-source-registry.json"), "utf8"));
      sendJson(response, 200, registry, headers);
    } catch {
      sendJson(response, 404, {error: "Private draft registry is unavailable."}, headers);
    }
    return;
  }
  const privateReading = /^\/__private\/reading\/(CC-Y3Q4-D05[4-9]|CC-Y3Q4-D060)\.json$/.exec(url.pathname);
  if (privateReading) {
    try {
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
