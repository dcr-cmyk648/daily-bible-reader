#!/usr/bin/env node

import {createHash} from "node:crypto";
import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const files = process.argv.slice(2);

if (!files.length) {
  process.stderr.write("Usage: node scripts/migrate-commentary-v3.mjs <private metadata files...>\n");
  process.exitCode = 1;
} else {
  for (const relativeFile of files) {
    const metadataPath = path.resolve(ROOT, relativeFile);
    const privateRoot = path.resolve(ROOT, "private-content") + path.sep;
    if (!metadataPath.startsWith(privateRoot) || !metadataPath.endsWith(".metadata.json")) {
      throw new Error(`Refusing to migrate a non-private metadata path: ${relativeFile}`);
    }
    const markdownPath = metadataPath.replace(/\.metadata\.json$/, ".md");
    const [metadataText, markdown] = await Promise.all([
      readFile(metadataPath, "utf8"),
      readFile(markdownPath, "utf8")
    ]);
    const metadata = JSON.parse(metadataText);
    if (!Array.isArray(metadata.sections) || !metadata.sections.length) {
      throw new Error(`${relativeFile} does not contain legacy sections.`);
    }
    const priorVersion = metadata.commentaryVersion;
    const sourceIds = Array.from(new Set(metadata.sections.flatMap((section) => section.sourceIds || [])));
    metadata.schemaVersion = "commentary/v3";
    metadata.commentaryVersion = String(priorVersion).replace(/-draft-v\d+$/, "-draft-v4");
    metadata.comprehensiveSynthesis = {
      markdown: "Loaded from the companion private Markdown file.",
      sourceIds
    };
    delete metadata.sections;
    metadata.generation.generatedAt = new Date().toISOString();
    metadata.generation.promptOrWorkflowVersion = "commentary-workflow-v4-all-sources-mobile";
    metadata.generation.contentHash = createHash("sha256").update(markdown, "utf8").digest("hex");
    metadata.generation.priorVersions = Array.from(new Set([
      ...(metadata.generation.priorVersions || []),
      priorVersion
    ]));
    metadata.generation.knownLimitations = [
      "The all-sources main synthesis and single collapsed comprehensive synthesis await final phone review.",
      "Several major modern technical commentaries were inventoried but inaccessible.",
      "The source set is broad and auditable but not exhaustive."
    ];
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    process.stdout.write(`Migrated ${relativeFile} to commentary/v3.\n`);
  }
}
