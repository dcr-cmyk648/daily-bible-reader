#!/usr/bin/env node
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {buildActiveCalendar} from "./lib/active-calendar.mjs";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8").then(JSON.parse);
const output = path.join(root, "config/active-calendar/celebration-bridge-long-term-active.json");
const activationOutput = path.join(root, "config/active-calendar/activation.json");
const [bridge, candidate] = await Promise.all([
  read("config/bridge-schedules/celebration-y3q4-bridge-full.json"), read("config/long-term-plan/four-stream-candidate.json")
]);
const result = buildActiveCalendar({bridge, candidate});
if (process.argv.includes("--check")) {
  const existing = await readFile(output, "utf8");
  if (existing !== `${JSON.stringify(result.plan, null, 2)}\n`) throw new Error("Active calendar artifact drifted.");
} else {
  await mkdir(path.dirname(output), {recursive: true});
  await writeFile(output, `${JSON.stringify(result.plan, null, 2)}\n`);
  await writeFile(activationOutput, `${JSON.stringify(result.activation, null, 2)}\n`);
}
process.stdout.write(`Active calendar has ${result.plan.entries.length} entries.\n`);
