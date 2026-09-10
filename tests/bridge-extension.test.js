import assert from "node:assert/strict";
import test from "node:test";
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import os from "node:os";
import path from "node:path";

import {authorizedBridgeSourceDay, buildBridgeExtension, buildCompleteBridgeSchedule} from "../scripts/lib/bridge-extension.mjs";

const json = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

function bridgeOnlyPlan() {
  const rollingPlan = json("fixtures/pilot-content/plan.json");
  const entries = rollingPlan.entries.filter((entry) => Number.isInteger(entry.sourcePlanDay));
  const bookIds = new Set(entries.flatMap((entry) => entry.passages.map((passage) => passage.bookId)));
  return {
    ...rollingPlan,
    entries,
    bookMetrics: Object.fromEntries(Object.entries(rollingPlan.bookMetrics).filter(([bookId]) => bookIds.has(bookId)))
  };
}

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

function nextActiveBoundary(plan, appConfig, activeCalendar) {
  const entry = activeCalendar.entries[plan.entries.length];
  return {
    readingId: entry.readingId,
    today: addCivilDays(entry.civilDate, -appConfig.futureLookaheadDays)
  };
}

test("the bridge may append exactly the reading entering the Detroit T+7 window", () => {
  const currentPlan = bridgeOnlyPlan();
  const plan = {...currentPlan, entries: currentPlan.entries.slice(0, -1)};
  const currentConfig = json("fixtures/pilot-content/app-config.json");
  const appConfig = {...currentConfig, testingReadingIds: plan.entries.map((entry) => entry.readingId)};
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
  const currentPlan = bridgeOnlyPlan();
  const plan = {...currentPlan, entries: currentPlan.entries.slice(0, -1)};
  const currentConfig = json("fixtures/pilot-content/app-config.json");
  const appConfig = {...currentConfig, testingReadingIds: plan.entries.map((entry) => entry.readingId)};
  const referencePlan = json("config/reference-plans/celebration-y3q4.json");
  const metrics = json("config/reference-plans/celebration-y3q4-chapter-metrics.json");
  const boundary = nextBoundary(plan, appConfig);
  assert.throws(() => buildBridgeExtension({plan, appConfig, referencePlan, metrics,
    sourceDay: boundary.sourceDay - 1, today: boundary.today}), /append exactly/);
  assert.throws(() => buildBridgeExtension({plan, appConfig, referencePlan, metrics,
    sourceDay: boundary.sourceDay, today: addCivilDays(boundary.today, -1)}), /T\+7 horizon/);
});

test("the full factual schedule is deterministic and does not broaden the preparation window", () => {
  const plan = bridgeOnlyPlan();
  const appConfig = json("fixtures/pilot-content/app-config.json");
  const referencePlan = json("config/reference-plans/celebration-y3q4.json");
  const metrics = json("config/reference-plans/celebration-y3q4-chapter-metrics.json");
  const full = buildCompleteBridgeSchedule({plan, appConfig, referencePlan, metrics});
  const tracked = json("config/bridge-schedules/celebration-y3q4-bridge-full.json");
  assert.equal(full.entries.length, 39);
  assert.equal(full.entries.at(-1).readingId, "CC-Y3Q4-D092");
  assert.deepEqual(full.entries.at(-1).passages, [{bookId: "MAL", chapter: 4, verseCount: 6}]);
  assert.deepEqual(full, tracked);
  assert.deepEqual(appConfig.testingReadingIds, json("fixtures/pilot-content/plan.json").entries.map((entry) => entry.readingId));
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
    const activeCalendar = JSON.parse(readFileSync(path.join(root, "config/active-calendar/celebration-bridge-long-term-active.json"), "utf8"));
    writeFileSync(path.join(root, "fixtures/pilot-content/app-config.json"), `${JSON.stringify({
      ...configBefore, testingReadingIds: planBefore.entries.map((entry) => entry.readingId)
    }, null, 2)}\n`);
    const boundary = nextActiveBoundary(planBefore, configBefore, activeCalendar);
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
    const activeCalendar = JSON.parse(readFileSync(path.join(root, "config/active-calendar/celebration-bridge-long-term-active.json"), "utf8"));
    const boundary = nextActiveBoundary(planBefore, staleConfig, activeCalendar);
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

test("manifest-prefix CLI repairs D090-live/D089-tracked only from fabricated hash-valid local artifacts", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dbr-prefix-reconcile-"));
  try {
    cpSync(new URL("../scripts/reconcile-manifest-prefix.mjs", import.meta.url), path.join(root, "scripts", "reconcile-manifest-prefix.mjs"));
    cpSync(new URL("../scripts/lib/active-calendar.mjs", import.meta.url), path.join(root, "scripts", "lib", "active-calendar.mjs"));
    cpSync(new URL("../fixtures/pilot-content", import.meta.url), path.join(root, "fixtures", "pilot-content"), {recursive:true});
    cpSync(new URL("../config/active-calendar", import.meta.url), path.join(root, "config", "active-calendar"), {recursive:true});
    const active = JSON.parse(readFileSync(path.join(root, "config/active-calendar/celebration-bridge-long-term-active.json"), "utf8"));
    const currentTracked = JSON.parse(readFileSync(path.join(root, "fixtures/pilot-content/plan.json"), "utf8"));
    const staleLength = active.entries.findIndex((entry) => entry.readingId === "CC-Y3Q4-D090");
    assert.ok(staleLength > 0);
    const tracked = {...currentTracked, entries: active.entries.slice(0, staleLength)};
    const trackedConfig = JSON.parse(readFileSync(path.join(root, "fixtures/pilot-content/app-config.json"), "utf8"));
    trackedConfig.testingReadingIds = tracked.entries.map((entry) => entry.readingId);
    writeFileSync(path.join(root, "fixtures/pilot-content/plan.json"), `${JSON.stringify(tracked, null, 2)}\n`);
    writeFileSync(path.join(root, "fixtures/pilot-content/app-config.json"), `${JSON.stringify(trackedConfig, null, 2)}\n`);
    assert.equal(tracked.entries.at(-1).readingId, "CC-Y3Q4-D089");
    const liveEntries = active.entries.slice(0, tracked.entries.length + 1);
    const manifest = {schemaVersion:"private-manifest/v1",readings:Object.fromEntries(liveEntries.map((entry)=>[entry.readingId,{contentFileId:"FABRICATED",metadataFileId:"FABRICATED"}]))};
    mkdirSync(path.join(root,"private-content/bridge/celebration-y3q4"),{recursive:true});
    writeFileSync(path.join(root, "private-content/private-manifest.json"), `${JSON.stringify(manifest)}\n`);
    for (const entry of liveEntries) {
      const markdown=Buffer.from(`FABRICATED PRIVATE COMMENTARY FOR ${entry.readingId}`),hash=createHash("sha256").update(markdown).digest("hex"),base=path.join(root,"private-content/bridge/celebration-y3q4",entry.readingId);
      writeFileSync(`${base}.md`,markdown);
      writeFileSync(`${base}.metadata.json`,`${JSON.stringify({readingId:entry.readingId,generation:{contentHash:hash}})}\n`);
    }
    const first=spawnSync(process.execPath,["scripts/reconcile-manifest-prefix.mjs"],{cwd:root,encoding:"utf8"});
    assert.equal(first.status,0,first.stderr);
    assert.equal(JSON.parse(first.stdout).action,"reconciled");
    const repaired=JSON.parse(readFileSync(path.join(root,"fixtures/pilot-content/plan.json"),"utf8"));
    const config=JSON.parse(readFileSync(path.join(root,"fixtures/pilot-content/app-config.json"),"utf8"));
    assert.equal(repaired.entries.at(-1).readingId,"CC-Y3Q4-D090");
    assert.equal(config.testingReadingIds.at(-1),"CC-Y3Q4-D090");
    const second=spawnSync(process.execPath,["scripts/reconcile-manifest-prefix.mjs"],{cwd:root,encoding:"utf8"});
    assert.equal(second.status,0,second.stderr);
    assert.equal(JSON.parse(second.stdout).state,"already_current");
    writeFileSync(path.join(root,"private-content/bridge/celebration-y3q4/CC-Y3Q4-D090.md"),"FABRICATED TAMPERED BYTES");
    const tampered=spawnSync(process.execPath,["scripts/reconcile-manifest-prefix.mjs"],{cwd:root,encoding:"utf8"});
    assert.notEqual(tampered.status,0);
    assert.match(tampered.stderr,/Local private-content validation failed/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
