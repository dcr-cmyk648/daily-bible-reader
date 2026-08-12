#!/usr/bin/env node

import {readFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {buildRollingStudyWorkOrder} from "./lib/rolling-study-work-order.mjs";
import {assertSchemaValid} from "./lib/schema-validator.mjs";

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
    else throw new Error("Usage: node scripts/rolling-study-work-order.mjs [--today YYYY-MM-DD]");
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return process.stdout.write("Usage: node scripts/rolling-study-work-order.mjs [--today YYYY-MM-DD]\n");
  const today = options.today || new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
  const [plan, appConfig, referencePlan, metrics, schema, manifest] = await Promise.all([
    readJson(path.join(ROOT, "fixtures", "pilot-content", "plan.json")),
    readJson(path.join(ROOT, "fixtures", "pilot-content", "app-config.json")),
    readJson(path.join(ROOT, "config", "reference-plans", "celebration-y3q4.json")),
    readJson(path.join(ROOT, "config", "reference-plans", "celebration-y3q4-chapter-metrics.json")),
    readJson(path.join(ROOT, "schemas", "rolling-study-work-order.schema.json")),
    readJson(path.join(PRIVATE_CONTENT, "private-manifest.json"), true)
  ]);
  const firstSourceDay = plan.entries[0].sourcePlanDay;
  const sourceDay = Math.min(referencePlan.dayCount, firstSourceDay + Math.max(0,
    Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${appConfig.sharedStartDate}T00:00:00Z`)) / 86400000)) + 7);
  const readingId = `CC-Y3Q4-D${String(sourceDay).padStart(3, "0")}`;
  const base = path.join(PRIVATE_CONTENT, "bridge", "celebration-y3q4", readingId);
  const [metadata, markdownBytes] = await Promise.all([
    readJson(`${base}.metadata.json`, true), optionalBytes(`${base}.md`)
  ]);
  const workOrder = buildRollingStudyWorkOrder({
    plan, appConfig, referencePlan, metrics, today, issuedAt: new Date().toISOString(), metadata, markdownBytes,
    manifestHasReading: Boolean(manifest && manifest.readings && manifest.readings[readingId])
  });
  assertSchemaValid(workOrder, schema, {label: "Rolling study work order"});
  process.stdout.write(`${JSON.stringify(workOrder, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Rolling study work order failed: ${error.message}\n`);
  process.exitCode = 1;
});
