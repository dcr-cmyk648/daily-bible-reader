#!/usr/bin/env node

import {readFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {assertSchemaValid} from "./lib/schema-validator.mjs";
import {buildRollingStudyWorkOrder} from "./lib/rolling-study-work-order.mjs";
import {buildProtocolBackfillWorkOrder, selectProtocolBackfillCandidate} from "./lib/protocol-backfill-work-order.mjs";

const ROOT = process.cwd();
const PRIVATE_CONTENT = path.join(ROOT, "private-content");

async function readJson(filePath, optional = false) {
  try { return JSON.parse(await readFile(filePath, "utf8")); }
  catch (error) { if (optional && error.code === "ENOENT") return null; throw error; }
}
async function optionalBytes(filePath) {
  try { return await readFile(filePath); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--today" && argv[index + 1]) options.today = argv[++index];
    else if (["--help", "-h"].includes(argv[index])) options.help = true;
    else throw new Error("Usage: node scripts/protocol-backfill-work-order.mjs [--today YYYY-MM-DD]");
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return process.stdout.write("Usage: node scripts/protocol-backfill-work-order.mjs [--today YYYY-MM-DD]\\n");
  const today = options.today || new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
  const [plan, privatePlan, appConfig, protocol, protocolSchema, schema, manifest] = await Promise.all([
    readJson(path.join(ROOT, "config", "bridge-schedules", "celebration-y3q4-bridge-full.json")),
    readJson(path.join(ROOT, "fixtures", "pilot-content", "plan.json")),
    readJson(path.join(ROOT, "fixtures", "pilot-content", "app-config.json")),
    readJson(path.join(ROOT, "config", "daily-study-protocol.json")),
    readJson(path.join(ROOT, "schemas", "daily-study-protocol.schema.json")),
    readJson(path.join(ROOT, "schemas", "protocol-backfill-work-order.schema.json")),
    readJson(path.join(PRIVATE_CONTENT, "private-manifest.json"), true)
  ]);
  assertSchemaValid(protocol, protocolSchema, {label: "Canonical daily-study protocol"});
  const manifestReadingIds = Object.keys(manifest && manifest.readings || {});
  const artifactsByReadingId = Object.fromEntries(await Promise.all(plan.entries.map(async (entry) => {
    const base = path.join(PRIVATE_CONTENT, "bridge", "celebration-y3q4", entry.readingId);
    const [metadata, markdownBytes] = await Promise.all([readJson(`${base}.metadata.json`, true), optionalBytes(`${base}.md`)]);
    return [entry.readingId, {metadata, markdownBytes, manifestHasReading: manifestReadingIds.includes(entry.readingId)}];
  })));
  const horizonArtifacts = Object.fromEntries(Object.entries(artifactsByReadingId).filter(([, artifact]) => artifact.manifestHasReading));
  const horizon = buildRollingStudyWorkOrder({
    plan, privatePlan, appConfig, protocol, today, issuedAt: new Date().toISOString(), readingArtifacts: horizonArtifacts
  });
  const horizonReady = ["none", "plan_complete"].includes(horizon.action);
  const candidate = horizonReady ? selectProtocolBackfillCandidate({
    plan, appConfig, today, protocol, artifactsByReadingId, manifestReadingIds
  }) : null;
  const workOrder = buildProtocolBackfillWorkOrder({
    plan, appConfig, today, protocol, horizonReady, candidate, issuedAt: new Date().toISOString()
  });
  assertSchemaValid(workOrder, schema, {label: "Protocol refresh backfill work order"});
  process.stdout.write(`${JSON.stringify(workOrder, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Protocol refresh backfill work order failed: ${error.message}\n`);
  process.exitCode = 1;
});
