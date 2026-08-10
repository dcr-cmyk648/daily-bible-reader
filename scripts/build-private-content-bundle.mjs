#!/usr/bin/env node

import {createHash} from "node:crypto";
import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import path from "node:path";
import process from "node:process";
import {inspectText} from "./check-repository-safety.mjs";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "private-content/bundles/celebration-bridge-review");
const READING_IDS = [
  "CC-Y3Q4-D054",
  "CC-Y3Q4-D055",
  "CC-Y3Q4-D056",
  "CC-Y3Q4-D057",
  "CC-Y3Q4-D058",
  "CC-Y3Q4-D059",
  "CC-Y3Q4-D060"
];
const INPUTS = [
  ...READING_IDS.flatMap((readingId) => [
    {source: `private-content/bridge/celebration-y3q4/${readingId}.md`, destination: `readings/${readingId}.md`},
    {source: `private-content/bridge/celebration-y3q4/${readingId}.metadata.json`, destination: `readings/${readingId}.metadata.json`}
  ]),
  {source: "research/working/bridge-source-registry.json", destination: "config/source-registry.json"},
  {source: "research/working/BRIDGE_SOURCE_COVERAGE.md", destination: "coverage/BRIDGE_SOURCE_COVERAGE.md"}
];

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function validatePrivateInputs() {
  const result = spawnSync(process.execPath, ["scripts/validate-private-content.mjs", "--require"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "Private validation failed.").trim());
}

async function main() {
  validatePrivateInputs();
  const prepared = [];
  for (const file of INPUTS) {
    const content = await readFile(path.join(ROOT, file.source), "utf8");
    const problems = inspectText(`review-bundle/${file.destination}`, content);
    if (problems.length) throw new Error(`${file.destination} failed bundle safety: ${problems.join(", ")}`);
    prepared.push({...file, content, sha256: sha256(content), bytes: Buffer.byteLength(content, "utf8")});
  }

  const registry = JSON.parse(prepared.find((file) => file.destination === "config/source-registry.json").content);
  const readingInputs = READING_IDS.map((readingId) => ({
    readingId,
    markdown: `readings/${readingId}.md`,
    metadata: `readings/${readingId}.metadata.json`
  }));
  const readings = readingInputs.map((reading) => {
    const markdown = prepared.find((file) => file.destination === reading.markdown);
    const metadataFile = prepared.find((file) => file.destination === reading.metadata);
    const metadata = JSON.parse(metadataFile.content);
    if (metadata.readingId !== reading.readingId || metadata.generation.contentHash !== markdown.sha256) {
      throw new Error(`${reading.readingId} metadata/content association failed.`);
    }
    return {
      readingId: reading.readingId,
      markdown: reading.markdown,
      metadata: reading.metadata,
      commentaryVersion: metadata.commentaryVersion,
      publicationStatus: metadata.publicationStatus,
      humanReviewStatus: metadata.generation.humanReviewStatus,
      contentHash: markdown.sha256,
      includedSourceCount: metadata.coverage.includedCount
    };
  });

  const manifest = {
    bundleVersion: "celebration-bridge-private-review/v1",
    generatedAt: new Date().toISOString(),
    sourceRegistryVersion: registry.registryVersion,
    readings,
    files: prepared.map(({destination, sha256: digest, bytes}) => ({path: destination, sha256: digest, bytes})),
    safety: {
      scriptureIncluded: false,
      rawSourceTextIncluded: false,
      credentialsIncluded: false,
      approvedForPublication: false
    }
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestProblems = inspectText("review-bundle/manifest.json", manifestText);
  if (manifestProblems.length) throw new Error(`manifest.json failed bundle safety: ${manifestProblems.join(", ")}`);

  await rm(OUTPUT, {recursive: true, force: true});
  for (const file of prepared) {
    const destination = path.join(OUTPUT, file.destination);
    await mkdir(path.dirname(destination), {recursive: true});
    await writeFile(destination, file.content, "utf8");
  }
  await writeFile(path.join(OUTPUT, "manifest.json"), manifestText, "utf8");
  process.stdout.write(`Private bridge review bundle built at ${path.relative(ROOT, OUTPUT)} (${prepared.length + 1} files; no Scripture or credentials).\n`);
}

main().catch((error) => {
  process.stderr.write(`Private review bundle failed: ${error.message}\n`);
  process.exitCode = 1;
});
