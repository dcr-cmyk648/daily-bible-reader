#!/usr/bin/env node
import {readFile, writeFile, rename} from "node:fs/promises";
import {extendActivePrefix} from "./lib/active-calendar.mjs";
const root = process.cwd();
const args = process.argv.slice(2); let day = ""; let dryRun = false;
for (let i = 0; i < args.length; i += 1) { if (args[i] === "--today" && !day && args[i + 1]) day = args[++i]; else if (args[i] === "--dry-run" && !dryRun) dryRun = true; else if (["--help", "-h"].includes(args[i])) { process.stdout.write("Usage: node scripts/extend-active-prefix.mjs --today YYYY-MM-DD [--dry-run]\n"); process.exit(0); } else throw new Error("Usage: node scripts/extend-active-prefix.mjs --today YYYY-MM-DD [--dry-run]"); }
if (!day) throw new Error("Usage: node scripts/extend-active-prefix.mjs --today YYYY-MM-DD [--dry-run]");
const read = (file) => readFile(`${root}/${file}`, "utf8").then(JSON.parse);
const [privatePlan, activePlan, config] = await Promise.all([read("fixtures/pilot-content/plan.json"), read("config/active-calendar/celebration-bridge-long-term-active.json"), read("fixtures/pilot-content/app-config.json")]);
const next = extendActivePrefix({privatePlan, activePlan, appConfig: config, today: day, lookaheadDays: config.futureLookaheadDays});
if (!dryRun) { const target = `${root}/fixtures/pilot-content/plan.json`; const temp = `${target}.tmp-${process.pid}`; await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`); await rename(temp, target); }
process.stdout.write(`${next.entries.at(-1).readingId}\n`);
