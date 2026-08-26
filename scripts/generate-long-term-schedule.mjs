#!/usr/bin/env node

import {mkdir, readFile, rename, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {buildLongTermCandidate, candidateMetrics, renderCandidateReport, renderLongTermDailySchedule, validateLongTermCandidate} from "./lib/long-term-schedule.mjs";
import {assertSchemaValid} from "./lib/schema-validator.mjs";

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "config", "long-term-plan", "four-stream-candidate-input.json");
const OUTPUT = path.join(ROOT, "config", "long-term-plan", "four-stream-candidate.json");
const REPORT = path.join(ROOT, "docs", "reports", "long-term-four-stream-candidate.md");
const DAILY_SCHEDULE_REPORT = path.join(ROOT, "docs", "reports", "long-term-four-stream-daily-schedule.md");

async function json(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeAtomic(filePath, body) {
  await mkdir(path.dirname(filePath), {recursive: true});
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, body, "utf8");
  await rename(temporary, filePath);
}

async function main() {
  const check = process.argv.slice(2).includes("--check");
  const [input, planSchema, readingSchema] = await Promise.all([
    json(INPUT), json(path.join(ROOT, "schemas", "plan.schema.json")), json(path.join(ROOT, "schemas", "reading.schema.json"))
  ]);
  const {plan, nonSundayMinorExceptions} = buildLongTermCandidate(input);
  validateLongTermCandidate(plan, input);
  assertSchemaValid(plan, planSchema, {label: "Long-term review candidate", externalSchemas: {"reading.schema.json": readingSchema}});
  const metrics = candidateMetrics(plan, nonSundayMinorExceptions);
  const planBody = `${JSON.stringify(plan, null, 2)}\n`;
  const reportBody = renderCandidateReport({input, plan, metrics});
  const dailyScheduleBody = renderLongTermDailySchedule({plan});
  if (check) {
    const [trackedPlan, trackedReport, trackedDailySchedule] = await Promise.all([readFile(OUTPUT, "utf8"), readFile(REPORT, "utf8"), readFile(DAILY_SCHEDULE_REPORT, "utf8")]);
    if (trackedPlan !== planBody || trackedReport !== reportBody || trackedDailySchedule !== dailyScheduleBody) throw new Error("Generated long-term candidate or review report is stale; run npm run plan:long-term:generate.");
    process.stdout.write(`Long-term review candidate is deterministic (${plan.entries.length} units, ${plan.candidateMetadata.scheduleSha256}).\n`);
    return;
  }
  await Promise.all([writeAtomic(OUTPUT, planBody), writeAtomic(REPORT, reportBody), writeAtomic(DAILY_SCHEDULE_REPORT, dailyScheduleBody)]);
  process.stdout.write(`Generated review-only long-term candidate (${plan.entries.length} units, ${plan.candidateMetadata.scheduleSha256}).\n`);
}

main().catch((error) => {
  process.stderr.write(`Long-term candidate generation failed: ${error.message}\n`);
  process.exitCode = 1;
});
