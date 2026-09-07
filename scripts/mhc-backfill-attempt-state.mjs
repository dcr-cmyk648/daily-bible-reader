#!/usr/bin/env node

import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {assertSchemaValid} from "./lib/schema-validator.mjs";
import {emptyMhcBackfillAttemptState, normalizedAttemptState, recordMhcBackfillAttempt} from "./lib/mhc-backfill-attempt-state.mjs";

const ROOT = process.cwd();
const STATE_PATH = path.join(ROOT, "private-content", "automation", "mhc-backfill-attempt-state.json");

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (["--help", "-h"].includes(option)) options.help = true;
    else if (["--reading", "--outcome", "--stage", "--code", "--at"].includes(option) && argv[index + 1]) options[option.slice(2)] = argv[++index];
    else throw new Error("Usage: node scripts/mhc-backfill-attempt-state.mjs --reading <readingId> --outcome <published|model_failure|blocked> --stage <generation|review|validation|publication|controller> --code <SAFE_CODE> [--at ISO-8601]");
  }
  return options;
}

async function readJson(filePath) {
  try { return JSON.parse(await readFile(filePath, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return process.stdout.write("Usage: node scripts/mhc-backfill-attempt-state.mjs --reading <readingId> --outcome <published|model_failure|blocked> --stage <generation|review|validation|publication|controller> --code <SAFE_CODE> [--at ISO-8601]\n");
  const [plan, schema, existing] = await Promise.all([
    readJson(path.join(ROOT, "fixtures", "pilot-content", "plan.json")),
    readJson(path.join(ROOT, "schemas", "mhc-backfill-attempt-state.schema.json")),
    readJson(STATE_PATH)
  ]);
  const state = normalizedAttemptState(existing, plan.planVersion);
  if (existing) assertSchemaValid(state, schema, {label: "Matthew Henry private attempt state"});
  const next = recordMhcBackfillAttempt(state, {
    readingId: options.reading,
    attemptedAt: options.at || new Date().toISOString(),
    outcome: options.outcome,
    stage: options.stage,
    code: options.code
  });
  assertSchemaValid(next, schema, {label: "Matthew Henry private attempt state"});
  await mkdir(path.dirname(STATE_PATH), {recursive: true});
  await writeFile(STATE_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  const attempt = next.attempts[options.reading];
  process.stdout.write(`${JSON.stringify({lane: "henry_backfill", readingId: options.reading, attemptedAt: attempt.attemptedAt, outcome: attempt.outcome, stage: attempt.stage, code: attempt.code, priorManifestRemainsLive: true, retryAction: "select_least_recent_eligible_debt_next_run"})}\n`);
}

main().catch((error) => {
  process.stderr.write(`Matthew Henry backfill attempt state failed: ${error.message}\n`);
  process.exitCode = 1;
});
