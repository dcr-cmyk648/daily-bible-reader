const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = require("../app/frontend/app.js");
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/pilot-content/plan.json"), "utf8"));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/pilot-content/app-config.json"), "utf8"));
const bridgeIds = Array.from({length: 7}, (_, index) => `CC-Y3Q4-D${String(index + 54).padStart(3, "0")}`);

function fixedConfig(overrides = {}) {
  return {...config, sharedStartDateMode: "fixed", testingOverrideEnabled: false, ...overrides};
}

function syntheticPlan(count = 4) {
  return {
    planVersion: "synthetic-v1",
    entries: Array.from({length: count}, (_, index) => ({
      planVersion: "synthetic-v1",
      dayIndex: index + 1,
      readingId: `TST-${String(index + 1).padStart(3, "0")}`
    }))
  };
}

test("bridge preserves source days 54–60 with stable daily IDs and grouped chapters", () => {
  assert.deepEqual(plan.entries.map((entry) => entry.readingId), bridgeIds);
  assert.deepEqual(plan.entries.map((entry) => entry.sourcePlanDay), [54, 55, 56, 57, 58, 59, 60]);
  assert.deepEqual(plan.entries[0].passages.map((passage) => passage.chapter), [3, 4]);
  assert.deepEqual(plan.entries[1].passages.map((passage) => passage.chapter), [5, 6, 7]);
});

test("shared Detroit date selects bridge day 1 and then day 2", () => {
  const dayOne = app.calculateSchedule(plan, fixedConfig(), new Date("2026-08-08T16:00:00Z"));
  const dayTwo = app.calculateSchedule(plan, fixedConfig(), new Date("2026-08-09T16:00:00Z"));
  assert.equal(dayOne.selectedEntry.readingId, bridgeIds[0]);
  assert.equal(dayOne.calendarDayIndex, 1);
  assert.equal(dayTwo.selectedEntry.readingId, bridgeIds[1]);
  assert.equal(dayTwo.calendarDayIndex, 2);
});

test("testing-today mode can still make the Detroit test day the effective start date", () => {
  const testingConfig = {...config, sharedStartDateMode: "testing_today"};
  const result = app.calculateSchedule(plan, testingConfig, new Date("2031-01-17T16:00:00Z"));
  assert.equal(result.effectiveStartDate, "2031-01-17");
  assert.equal(result.calendarDayIndex, 1);
  assert.equal(result.selectedEntry.readingId, bridgeIds[0]);
  assert.equal(result.nextEntry.readingId, bridgeIds[1]);
});

test("civil-day arithmetic survives spring daylight-saving transition", () => {
  const configured = fixedConfig({sharedStartDate: "2026-03-07"});
  const synthetic = syntheticPlan();
  assert.equal(app.calculateSchedule(synthetic, configured, new Date("2026-03-07T17:00:00Z")).calendarDayIndex, 1);
  assert.equal(app.calculateSchedule(synthetic, configured, new Date("2026-03-08T16:00:00Z")).calendarDayIndex, 2);
  assert.equal(app.calculateSchedule(synthetic, configured, new Date("2026-03-09T16:00:00Z")).calendarDayIndex, 3);
});

test("civil-day arithmetic survives autumn daylight-saving transition", () => {
  const configured = fixedConfig({sharedStartDate: "2026-10-31"});
  const synthetic = syntheticPlan();
  assert.equal(app.calculateSchedule(synthetic, configured, new Date("2026-10-31T16:00:00Z")).calendarDayIndex, 1);
  assert.equal(app.calculateSchedule(synthetic, configured, new Date("2026-11-01T17:00:00Z")).calendarDayIndex, 2);
  assert.equal(app.calculateSchedule(synthetic, configured, new Date("2026-11-02T17:00:00Z")).calendarDayIndex, 3);
});

test("changing start date changes calendar placement but not stable reading IDs", () => {
  const result = app.calculateSchedule(plan, fixedConfig({sharedStartDate: "2026-08-09"}), new Date("2026-08-09T16:00:00Z"));
  assert.equal(result.selectedEntry.readingId, bridgeIds[0]);
  assert.deepEqual(plan.entries.map((entry) => entry.readingId), bridgeIds);
});

test("six-day lookahead exposes the complete bridge week", () => {
  const result = app.calculateSchedule(plan, fixedConfig(), new Date("2026-08-08T16:00:00Z"), bridgeIds[6]);
  assert.equal(result.selectedEntry.readingId, bridgeIds[6]);
  assert.equal(result.locked, false);
});

test("future lock refuses a reading beyond a configured one-day lookahead", () => {
  const result = app.calculateSchedule(syntheticPlan(), fixedConfig({futureLookaheadDays: 1}), new Date("2026-08-08T16:00:00Z"), "TST-003");
  assert.equal(result.selectedEntry.readingId, "TST-001");
  assert.equal(result.nextEntry.readingId, "TST-002");
});

test("future lock can be disabled by configuration", () => {
  const result = app.calculateSchedule(plan, fixedConfig({futureReadingsLocked: false, futureLookaheadDays: 0}), new Date("2026-08-08T16:00:00Z"), bridgeIds[6]);
  assert.equal(result.selectedEntry.readingId, bridgeIds[6]);
  assert.equal(result.locked, false);
});

test("past browsing setting is enforced", () => {
  const result = app.calculateSchedule(plan, fixedConfig({pastReadingsAvailable: false}), new Date("2026-08-09T16:00:00Z"), bridgeIds[0]);
  assert.equal(result.selectedEntry.readingId, bridgeIds[1]);
  assert.equal(result.previousEntry, null);
});

test("development override switches to an approved bridge reading without changing time", () => {
  const overrideConfig = {...config, futureLookaheadDays: 0};
  const result = app.calculateSchedule(plan, overrideConfig, new Date("2026-08-08T16:00:00Z"), bridgeIds[6], {testingOverride: true});
  assert.equal(result.selectedEntry.readingId, bridgeIds[6]);
  assert.equal(result.usingTestingOverride, true);
  assert.equal(result.readingDate, "2026-08-14");
});

test("unconfigured override cannot escape the bridge", () => {
  const result = app.calculateSchedule(plan, config, new Date("2026-08-08T16:00:00Z"), "CC-Y3Q4-D061", {testingOverride: true});
  assert.equal(result.selectedEntry.readingId, bridgeIds[0]);
  assert.equal(result.usingTestingOverride, false);
});

test("calendar home renders the complete Sunday-based month grid", () => {
  const calendar = app.buildMonthCalendar(plan, config, new Date("2026-08-08T16:00:00Z"), new Set(), "2026-08-01");
  assert.equal(calendar.windowStart, "2026-07-26");
  assert.equal(calendar.windowEnd, "2026-09-05");
  assert.equal(calendar.days.length, 42);
  assert.equal(calendar.weeks.length, 6);
  assert.ok(calendar.weeks.every((week) => week.length === 7));
  assert.equal(calendar.days.filter((day) => day.inCurrentMonth).length, 31);
  assert.equal(calendar.days.filter((day) => day.isToday).length, 1);
});

test("bridge calendar maps all seven readings to August 8–14", () => {
  const calendar = app.buildMonthCalendar(plan, config, new Date("2026-08-08T16:00:00Z"), new Set(), "2026-08-01");
  const dated = calendar.days.filter((day) => day.entry);
  assert.deepEqual(dated.map((day) => day.entry.readingId), bridgeIds);
  assert.deepEqual(dated.map((day) => day.date), ["2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"]);
  assert.equal(dated[0].status, "today");
  assert.ok(dated.every((day) => day.accessible));
});

test("calendar distinguishes per-reader completion, missed days, and locked future days", () => {
  const configured = fixedConfig({sharedStartDate: "2026-08-07", futureLookaheadDays: 1});
  const calendar = app.buildMonthCalendar(syntheticPlan(4), configured, new Date("2026-08-08T16:00:00Z"), new Set(["TST-002"]), "2026-08-01");
  const dayOne = calendar.days.find((day) => day.entry && day.entry.readingId === "TST-001");
  const dayTwo = calendar.days.find((day) => day.entry && day.entry.readingId === "TST-002");
  const dayFour = calendar.days.find((day) => day.entry && day.entry.readingId === "TST-004");
  assert.equal(dayOne.status, "missed");
  assert.equal(dayTwo.status, "complete");
  assert.equal(dayTwo.isToday, true);
  assert.equal(dayFour.status, "locked");
  assert.equal(dayFour.accessible, false);
});

test("monthly calendar preserves Detroit civil dates across daylight saving", () => {
  const configured = fixedConfig({sharedStartDate: "2026-03-07"});
  const calendar = app.buildMonthCalendar(syntheticPlan(4), configured, new Date("2026-03-09T16:00:00Z"), new Set(), "2026-03-01");
  assert.equal(calendar.todayDate, "2026-03-09");
  assert.equal(calendar.calendarDayIndex, 3);
  assert.equal(calendar.days.find((day) => day.isToday).entry.readingId, "TST-003");
});
