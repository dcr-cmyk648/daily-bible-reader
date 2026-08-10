#!/usr/bin/env node

import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const PRIVATE_PATH_PATTERNS = [
  /(^|\/)private-content(\/|$)/i,
  /(^|\/)private-commentary(\/|$)/i,
  /(^|\/)local-private(\/|$)/i,
  /(^|\/)research\/(?:raw|working|exports)(\/|$)/i,
  /(^|\/)uploads(\/|$)/i,
  /(^|\/)config\/.*\.(?:local|private)\.json$/i,
  /(^|\/)\.clasp\.json$/i,
  /(^|\/)\.env(?:\.|$)(?!example$)/i
];

const SECRET_PATTERNS = [
  {name: "private key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/},
  {name: "Google API key", regex: /AIza[0-9A-Za-z_-]{35}/},
  {name: "GitHub token", regex: /gh[opusr]_[A-Za-z0-9_]{30,}/},
  {name: "OAuth client secret", regex: /GOCSPX-[A-Za-z0-9_-]{20,}/},
  {name: "Apps Script deployment URL", regex: /https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec/},
  {name: "likely personal Gmail address", regex: /\b[A-Z0-9._%+-]+@gmail\.com\b/i},
  {name: "real authorized-user email", regex: /"email"\s*:\s*"(?![^"@]+@(?:example\.com|example\.org|example\.net|example\.invalid))[^"@]+@[^"@]+"/i}
];

// Build these at runtime so the scanner can safely inspect its own source.
const ESV_SIGNATURES = [
  new RegExp(["In the beginning", "God created the heavens and the earth"].join(", "), "i"),
  new RegExp(["And God said", "[“\"]Let there be light"].join(", "), "i"),
  new RegExp(["So God created man", "his own image"].join(" in "), "i")
];

function gitOutput(args) {
  const result = spawnSync("git", args, {cwd: ROOT, encoding: null});
  if (result.status !== 0) {
    throw new Error((result.stderr || Buffer.from("Git command failed.")).toString("utf8"));
  }
  return result.stdout;
}

function nulList(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean);
}

function looksLikePlaceholder(value) {
  return /PLACEHOLDER|PASTE_|YOUR_|EXAMPLE|NOT_CONFIGURED|ESV_API_KEY|IMPORT_TOKEN/i.test(value) || /^[A-Z0-9_:-]+$/.test(value);
}

function inspectSecretAssignments(text, problems) {
  const assignment = /(?:api[_-]?key|client[_-]?secret|import[_-]?token|password)\s*[:=]\s*["']([^"']{10,})["']/gi;
  let match;
  while ((match = assignment.exec(text))) {
    if (!looksLikePlaceholder(match[1])) problems.push("likely literal secret assignment");
  }
}

export function inspectText(relativePath, text) {
  const problems = [];
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(text)) problems.push(pattern.name);
  }
  inspectSecretAssignments(text, problems);
  for (const signature of ESV_SIGNATURES) {
    if (signature.test(text)) problems.push("likely ESV passage wording");
  }

  if (relativePath.endsWith(".json")) {
    if (/"translation"\s*:\s*"ESV"/i.test(text) && /"(?:passage|verses|scriptureText)"\s*:/i.test(text)) {
      problems.push("structured ESV text payload");
    }
    if (/fixtures\/pilot-content\//.test(relativePath) && /"publicationStatus"\s*:\s*"(?!placeholder)[^"]+"/.test(text)) {
      problems.push("non-placeholder private commentary fixture");
    }
    if (/"(?:rawText|rawSourceText|fullCommentaryText|sourceText)"\s*:/i.test(text)) {
      problems.push("forbidden raw-source field");
    }
  }
  return Array.from(new Set(problems));
}

async function contentForPath(relativePath, staged) {
  if (staged) {
    // Node's spawnSync default output buffer is roughly 1 MiB. Legitimate binary
    // assets (notably the 1024 px app icon) can exceed it, so inspect a bounded
    // larger buffer and then apply the binary/size checks below.
    const result = spawnSync("git", ["show", `:${relativePath}`], {
      cwd: ROOT,
      encoding: null,
      maxBuffer: 8 * 1024 * 1024
    });
    if (result.status !== 0) throw new Error(`Could not inspect staged file ${relativePath}.`);
    return result.stdout;
  }
  return readFile(path.join(ROOT, relativePath));
}

export async function inspectPaths(paths, options = {}) {
  const violations = [];
  for (const inputPath of paths) {
    const relativePath = path.relative(ROOT, path.resolve(ROOT, inputPath)).replaceAll(path.sep, "/");
    if (!relativePath || relativePath.startsWith("../")) {
      violations.push(`${inputPath}: path is outside the repository`);
      continue;
    }
    if (PRIVATE_PATH_PATTERNS.some((pattern) => pattern.test(relativePath))) {
      violations.push(`${relativePath}: private-content path must not enter Git/build input`);
      continue;
    }
    let buffer;
    try {
      buffer = await contentForPath(relativePath, Boolean(options.staged));
    } catch (error) {
      violations.push(`${relativePath}: ${error.message}`);
      continue;
    }
    if (buffer.length > 3_000_000 || buffer.includes(0)) continue;
    const problems = inspectText(relativePath, buffer.toString("utf8"));
    problems.forEach((problem) => violations.push(`${relativePath}: ${problem}`));
  }
  return violations;
}

async function main() {
  const args = process.argv.slice(2);
  const staged = args.includes("--staged");
  let paths;
  if (staged) {
    paths = nulList(gitOutput(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]));
  } else if (args.includes("--all")) {
    paths = nulList(gitOutput(["ls-files", "-co", "--exclude-standard", "-z"]));
  } else {
    const marker = args.indexOf("--paths");
    paths = marker >= 0 ? args.slice(marker + 1) : [];
  }
  const violations = await inspectPaths(paths, {staged});
  if (violations.length) {
    process.stderr.write(`Repository safety check failed:\n- ${violations.join("\n- ")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Repository safety check passed (${paths.length} file${paths.length === 1 ? "" : "s"} inspected).\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => {
  process.stderr.write(`Repository safety check could not run: ${error.message}\n`);
  process.exitCode = 1;
});
