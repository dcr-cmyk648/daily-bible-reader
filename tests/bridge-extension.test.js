import assert from "node:assert/strict";
import test from "node:test";
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import os from "node:os";
import path from "node:path";

import {authorizedBridgeSourceDay, buildBridgeExtension, buildCompleteBridgeSchedule} from "../scripts/lib/bridge-extension.mjs";

const json = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

function addCivilDays(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextBoundary(plan, appConfig) {
  const firstSourceDay = plan.entries[0].sourcePlanDay;
  const sourceDay = plan.entries.at(-1).sourcePlanDay + 1;
  const elapsedDays = sourceDay - firstSourceDay - appConfig.futureLookaheadDays;
  return {
    sourceDay,
    readingId: `CC-Y3Q4-D${String(sourceDay).padStart(3, "0")}`,
    today: addCivilDays(appConfig.sharedStartDate, elapsedDays)
  };
}

test("the bridge may append exactly the reading entering the Detroit T+7 window", () => {
  const plan = json("fixtures/pilot-content/plan.json");
  const appConfig = json("fixtures/pilot-content/app-config.json");
  const referencePlan = json("config/reference-plans/celebration-y3q4.json");
  const metrics = json("config/reference-plans/celebration-y3q4-chapter-metrics.json");
  const boundary = nextBoundary(plan, appConfig);
  assert.equal(authorizedBridgeSourceDay({plan, appConfig, today: boundary.today}), boundary.sourceDay);
  const result = buildBridgeExtension({...boundary, plan, appConfig, referencePlan, metrics});
  assert.equal(result.entry.readingId, boundary.readingId);
  assert.equal(result.entry.sourcePlanDay, boundary.sourceDay);
  assert.equal(result.entry.passages.length,
    referencePlan.days.find((day) => day.day === boundary.sourceDay).references.length);
  assert.ok(result.entry.passages.every((passage) => passage.verseCount > 0));
  assert.equal(result.plan.entries.length, plan.entries.length + 1);
  assert.equal(result.appConfig.testingReadingIds.at(-1), boundary.readingId);
});

test("the bridge cannot skip ahead or exceed the seven-day authorization", () => {
  const plan = json("fixtures/pilot-content/plan.json");
  const appConfig = json("fixtures/pilot-content/app-config.json");
  const referencePlan = json("config/reference-plans/celebration-y3q4.json");
  const metrics = json("config/reference-plans/celebration-y3q4-chapter-metrics.json");
  const boundary = nextBoundary(plan, appConfig);
  assert.throws(() => buildBridgeExtension({plan, appConfig, referencePlan, metrics,
    sourceDay: boundary.sourceDay - 1, today: boundary.today}), /append exactly/);
  assert.throws(() => buildBridgeExtension({plan, appConfig, referencePlan, metrics,
    sourceDay: boundary.sourceDay, today: addCivilDays(boundary.today, -1)}), /T\+7 horizon/);
});

test("the full factual schedule is deterministic and does not broaden the preparation window", () => {
  const plan = json("fixtures/pilot-content/plan.json");
  const appConfig = json("fixtures/pilot-content/app-config.json");
  const referencePlan = json("config/reference-plans/celebration-y3q4.json");
  const metrics = json("config/reference-plans/celebration-y3q4-chapter-metrics.json");
  const full = buildCompleteBridgeSchedule({plan, appConfig, referencePlan, metrics});
  const tracked = json("config/bridge-schedules/celebration-y3q4-bridge-full.json");
  assert.equal(full.entries.length, 39);
  assert.equal(full.entries.at(-1).readingId, "CC-Y3Q4-D092");
  assert.deepEqual(full.entries.at(-1).passages, [{bookId: "MAL", chapter: 4, verseCount: 6}]);
  assert.deepEqual(full, tracked);
  assert.deepEqual(appConfig.testingReadingIds, plan.entries.slice(0, appConfig.testingReadingIds.length).map((entry) => entry.readingId));
});

test("active-prefix CLI extends the plan and testing allowlist together", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dbr-prefix-extend-"));
  try {
    cpSync(new URL("../scripts/extend-active-prefix.mjs", import.meta.url), path.join(root, "scripts", "extend-active-prefix.mjs"));
    cpSync(new URL("../scripts/lib/active-calendar.mjs", import.meta.url), path.join(root, "scripts", "lib", "active-calendar.mjs"));
    cpSync(new URL("../fixtures/pilot-content", import.meta.url), path.join(root, "fixtures", "pilot-content"), {recursive: true});
    cpSync(new URL("../config/active-calendar", import.meta.url), path.join(root, "config", "active-calendar"), {recursive: true});
    const planBefore = JSON.parse(readFileSync(path.join(root, "fixtures/pilot-content/plan.json"), "utf8"));
    const configBefore = JSON.parse(readFileSync(path.join(root, "fixtures/pilot-content/app-config.json"), "utf8"));
    writeFileSync(path.join(root, "fixtures/pilot-content/app-config.json"), `${JSON.stringify({
      ...configBefore, testingReadingIds: planBefore.entries.map((entry) => entry.readingId)
    }, null, 2)}\n`);
    const boundary = nextBoundary(planBefore, configBefore);
    const result = spawnSync(process.execPath, ["scripts/extend-active-prefix.mjs", "--today", boundary.today], {cwd: root, encoding: "utf8"});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), boundary.readingId);
    const planAfter = JSON.parse(readFileSync(path.join(root, "fixtures/pilot-content/plan.json"), "utf8"));
    const configAfter = JSON.parse(readFileSync(path.join(root, "fixtures/pilot-content/app-config.json"), "utf8"));
    assert.equal(planAfter.entries.length, planBefore.entries.length + 1);
    assert.equal(planAfter.entries.at(-1).readingId, boundary.readingId);
    assert.deepEqual(configAfter.testingReadingIds, planAfter.entries.map((entry) => entry.readingId));
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test("active-prefix CLI repairs an exact stale allowlist prefix without extending the plan", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dbr-prefix-recover-"));
  try {
    cpSync(new URL("../scripts/extend-active-prefix.mjs", import.meta.url), path.join(root, "scripts", "extend-active-prefix.mjs"));
    cpSync(new URL("../scripts/lib/active-calendar.mjs", import.meta.url), path.join(root, "scripts", "lib", "active-calendar.mjs"));
    cpSync(new URL("../fixtures/pilot-content", import.meta.url), path.join(root, "fixtures", "pilot-content"), {recursive: true});
    cpSync(new URL("../config/active-calendar", import.meta.url), path.join(root, "config", "active-calendar"), {recursive: true});
    const planBefore = JSON.parse(readFileSync(path.join(root, "fixtures/pilot-content/plan.json"), "utf8"));
    const configBefore = JSON.parse(readFileSync(path.join(root, "fixtures/pilot-content/app-config.json"), "utf8"));
    const staleConfig = {...configBefore, testingReadingIds: planBefore.entries.slice(0, -1).map((entry) => entry.readingId)};
    writeFileSync(path.join(root, "fixtures/pilot-content/app-config.json"), `${JSON.stringify(staleConfig, null, 2)}\n`);
    const boundary = nextBoundary(planBefore, staleConfig);
    const result = spawnSync(process.execPath, ["scripts/extend-active-prefix.mjs", "--today", boundary.today], {cwd: root, encoding: "utf8"});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), planBefore.entries.at(-1).readingId);
    const planAfter = JSON.parse(readFileSync(path.join(root, "fixtures/pilot-content/plan.json"), "utf8"));
    const configAfter = JSON.parse(readFileSync(path.join(root, "fixtures/pilot-content/app-config.json"), "utf8"));
    assert.deepEqual(planAfter, planBefore);
    assert.deepEqual(configAfter.testingReadingIds, planBefore.entries.map((entry) => entry.readingId));
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});
