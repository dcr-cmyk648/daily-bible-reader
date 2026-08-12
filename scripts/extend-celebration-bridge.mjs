#!/usr/bin/env node

import {readFile, rename, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {buildBridgeExtension} from "./lib/bridge-extension.mjs";
import {assertSchemaValid} from "./lib/schema-validator.mjs";

const ROOT = process.cwd();
const PLAN_PATH = path.join(ROOT, "fixtures", "pilot-content", "plan.json");
const CONFIG_PATH = path.join(ROOT, "fixtures", "pilot-content", "app-config.json");
const REFERENCE_PATH = path.join(ROOT, "config", "reference-plans", "celebration-y3q4.json");
const METRICS_PATH = path.join(ROOT, "config", "reference-plans", "celebration-y3q4-chapter-metrics.json");

function usage() {
  return "Usage: node scripts/extend-celebration-bridge.mjs --source-day N [--today YYYY-MM-DD] [--dry-run]";
}

function parseArgs(argv) {
  const options = {dryRun: false};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") options.dryRun = true;
    else if (["--source-day", "--today"].includes(argument) && argv[index + 1]) {
      options[argument === "--source-day" ? "sourceDay" : "today"] = argv[++index];
    } else if (["--help", "-h"].includes(argument)) options.help = true;
    else throw new Error(usage());
  }
  if (options.help) return options;
  options.sourceDay = Number(options.sourceDay);
  if (!Number.isInteger(options.sourceDay)) throw new Error(usage());
  options.today ||= new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
  return options;
}

async function json(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return process.stdout.write(`${usage()}\n`);
  const [plan, appConfig, referencePlan, metrics, planSchema, readingSchema] = await Promise.all([
    json(PLAN_PATH), json(CONFIG_PATH), json(REFERENCE_PATH), json(METRICS_PATH),
    json(path.join(ROOT, "schemas", "plan.schema.json")),
    json(path.join(ROOT, "schemas", "reading.schema.json"))
  ]);
  const result = buildBridgeExtension({plan, appConfig, referencePlan, metrics, ...options});
  assertSchemaValid(result.plan, planSchema, {
    label: "Extended bridge plan",
    externalSchemas: {"reading.schema.json": readingSchema}
  });
  if (!options.dryRun) {
    await writeJsonAtomic(PLAN_PATH, result.plan);
    await writeJsonAtomic(CONFIG_PATH, result.appConfig);
  }
  process.stdout.write(`${options.dryRun ? "Would append" : "Appended"} ${result.entry.readingId} (${result.entry.passages.map((p) => `${p.bookId} ${p.chapter}`).join(", ")}); authorized through source day ${result.authorizedSourceDay}.\n`);
}

main().catch((error) => {
  process.stderr.write(`Bridge extension failed: ${error.message}\n`);
  process.exitCode = 1;
});
