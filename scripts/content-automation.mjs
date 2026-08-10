#!/usr/bin/env node

import {readFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {assertSchemaValid} from "./lib/schema-validator.mjs";
import {evaluateContentAutomation} from "./lib/content-automation.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/content-automation.mjs status \\",
    "    --plan <plan.json> --app-config <app-config.json> \\",
    "    --policy <policy.json> --staging-index <staging-index.json> \\",
    "    --live-index <live-index.json> [--today YYYY-MM-DD] [--compact]",
    "",
    "This command is read-only. It selects at most one earliest action and never generates or publishes content."
  ].join("\n");
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  if (command === "--help" || command === "-h") return {help: true};
  if (command !== "status") throw new Error(`Unsupported command ${command || "(missing)"}.\n${usage()}`);
  const values = {command, compact: false};
  while (args.length) {
    const name = args.shift();
    if (name === "--compact") {
      values.compact = true;
      continue;
    }
    if (!["--plan", "--app-config", "--policy", "--staging-index", "--live-index", "--today"].includes(name)) {
      throw new Error(`Unknown option ${name}.`);
    }
    if (!args.length || args[0].startsWith("--")) throw new Error(`${name} requires a value.`);
    values[name.slice(2).replaceAll("-", "_")] = args.shift();
  }
  ["plan", "app_config", "policy", "staging_index", "live_index"].forEach((key) => {
    if (!values[key]) throw new Error(`--${key.replaceAll("_", "-")} is required.`);
  });
  return values;
}

async function loadJson(filename) {
  const absolutePath = path.resolve(process.cwd(), filename);
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const [plan, appConfig, policy, stagingIndex, liveIndex, policySchema, stagingSchema, liveSchema, reportSchema] =
    await Promise.all([
      loadJson(args.plan),
      loadJson(args.app_config),
      loadJson(args.policy),
      loadJson(args.staging_index),
      loadJson(args.live_index),
      loadJson("schemas/content-automation-policy.schema.json"),
      loadJson("schemas/content-staging-index.schema.json"),
      loadJson("schemas/content-live-index.schema.json"),
      loadJson("schemas/content-readiness-report.schema.json")
    ]);
  assertSchemaValid(policy, policySchema, {label: "Automation policy"});
  assertSchemaValid(stagingIndex, stagingSchema, {label: "Staging index"});
  assertSchemaValid(liveIndex, liveSchema, {label: "Live index"});
  const report = evaluateContentAutomation({plan, appConfig, policy, stagingIndex, liveIndex}, {
    today: args.today
  });
  assertSchemaValid(report, reportSchema, {label: "Readiness report"});
  process.stdout.write(`${JSON.stringify(report, null, args.compact ? 0 : 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Content automation status failed: ${error.message}\n`);
  process.exitCode = 1;
});
