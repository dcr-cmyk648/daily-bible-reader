import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

import {authorizedBridgeSourceDay, buildBridgeExtension} from "../scripts/lib/bridge-extension.mjs";

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
    sourceDay: boundary.sourceDay + 1, today: boundary.today}), /append exactly/);
  assert.throws(() => buildBridgeExtension({plan, appConfig, referencePlan, metrics,
    sourceDay: boundary.sourceDay, today: addCivilDays(boundary.today, -1)}), /T\+7 horizon/);
});
