#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import {syncLatestHenryRuntime} from "./lib/mhc-library-sync.mjs";

function usage() {
  return [
    "Usage: node scripts/sync-latest-mhc.mjs --reading <readingId> --metadata <metadata.json>",
    "  [--library-root <private Henry library>] [--check]",
    "",
    "The command follows the library's checksum-bound current pointer. It refuses unreviewed",
    "artifacts and either attaches the newest reviewed runtime or fails when --check finds staleness."
  ].join("\n");
}

function parseArgs(argv) {
  const options = {checkOnly: false};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      options.checkOnly = true;
      continue;
    }
    if (!["--reading", "--metadata", "--library-root"].includes(argument)) {
      throw new Error(`Unknown argument ${argument}.\n${usage()}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.\n${usage()}`);
    index += 1;
    if (argument === "--reading") options.readingId = value;
    if (argument === "--metadata") options.metadataPath = value;
    if (argument === "--library-root") options.libraryRoot = value;
  }
  if (!options.readingId || !options.metadataPath) throw new Error(usage());
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const result = await syncLatestHenryRuntime({
    ...options,
    libraryRoot: path.resolve(root, options.libraryRoot || "private-commentary/mhc/stores/library"),
    metadataPath: path.resolve(root, options.metadataPath),
    runtimeSchemaPath: path.join(root, "schemas/mhc-runtime.schema.json")
  });
  const action = options.checkOnly ? "matches" : result.changed ? "attached" : "already matches";
  process.stdout.write(`${result.readingId} ${action} the newest reviewed Henry artifact (${result.promptVersion}; ${result.generationTimestamp}; ${result.artifactSha256.slice(0, 16)}).\n`);
}

main().catch((error) => {
  process.stderr.write(`Henry sync failed: ${error.message}\n`);
  process.exitCode = 1;
});
