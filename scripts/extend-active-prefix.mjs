#!/usr/bin/env node
import {readFile, writeFile, rename} from "node:fs/promises";
import {extendActivePrefix} from "./lib/active-calendar.mjs";
const root = process.cwd();
const args = process.argv.slice(2); let day = ""; let dryRun = false;
for (let i = 0; i < args.length; i += 1) { if (args[i] === "--today" && !day && args[i + 1]) day = args[++i]; else if (args[i] === "--dry-run" && !dryRun) dryRun = true; else if (["--help", "-h"].includes(args[i])) { process.stdout.write("Usage: node scripts/extend-active-prefix.mjs --today YYYY-MM-DD [--dry-run]\n"); process.exit(0); } else throw new Error("Usage: node scripts/extend-active-prefix.mjs --today YYYY-MM-DD [--dry-run]"); }
if (!day) throw new Error("Usage: node scripts/extend-active-prefix.mjs --today YYYY-MM-DD [--dry-run]");
const read = (file) => readFile(`${root}/${file}`, "utf8").then(JSON.parse);
const [privatePlan, activePlan, config] = await Promise.all([read("fixtures/pilot-content/plan.json"), read("config/active-calendar/celebration-bridge-long-term-active.json"), read("fixtures/pilot-content/app-config.json")]);
const planIds = privatePlan.entries.map((entry) => entry.readingId);
const configuredIds = config.testingReadingIds;
if (!Array.isArray(configuredIds) || !configuredIds.every((readingId, index) => readingId === planIds[index])) {
  throw new Error("testingReadingIds must be an exact prefix of the private plan.");
}
const recoveringConfig = configuredIds.length < planIds.length;
if (configuredIds.length > planIds.length) throw new Error("testingReadingIds cannot be ahead of the private plan.");
const next = recoveringConfig
  ? privatePlan
  : extendActivePrefix({privatePlan, activePlan, appConfig: config, today: day, lookaheadDays: config.futureLookaheadDays});
const nextConfig = {...config, testingReadingIds: next.entries.map((entry) => entry.readingId)};
if (!dryRun) {
  const planTarget = `${root}/fixtures/pilot-content/plan.json`;
  const configTarget = `${root}/fixtures/pilot-content/app-config.json`;
  const suffix = `.tmp-${process.pid}`;
  const configTemp = `${configTarget}${suffix}`;
  if (recoveringConfig) {
    await writeFile(configTemp, `${JSON.stringify(nextConfig, null, 2)}\n`);
    await rename(configTemp, configTarget);
  } else {
    const planTemp = `${planTarget}${suffix}`;
    await Promise.all([
      writeFile(planTemp, `${JSON.stringify(next, null, 2)}\n`),
      writeFile(configTemp, `${JSON.stringify(nextConfig, null, 2)}\n`)
    ]);
    // Commit the allowlist first so a failed second rename cannot leave a plan-only extension.
    await rename(configTemp, configTarget);
    await rename(planTemp, planTarget);
  }
}
process.stdout.write(`${next.entries.at(-1).readingId}\n`);
