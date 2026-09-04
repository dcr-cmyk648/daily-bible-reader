const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const app = require("../app/frontend/app.js");
const serverCore = require("../app/shared/server-core.js");
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, "../config/bridge-schedules/celebration-y3q4-bridge-full.json"), "utf8"));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/pilot-content/app-config.json"), "utf8"));
const bridgeIds = plan.entries.map((entry) => entry.readingId);
const activePlan = JSON.parse(fs.readFileSync(path.join(__dirname, "../config/active-calendar/celebration-bridge-long-term-active.json"), "utf8"));

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

function validatorHarness(today) {
  const source = fs.readFileSync(path.join(__dirname, "../app/apps-script/Code.gs"), "utf8")
    .replace(/JSON\.parse\("\{\\"__dbr_active_calendar__\\":true\}"\)/, `(${JSON.stringify(activePlan)})`);
  const context = vm.createContext({
    DBRServerCore: serverCore,
    Utilities: {formatDate() { return today; }}
  });
  new vm.Script(`${source}\nglobalThis.__validatePrivateConfig = dbrValidatePrivateConfig_;`, {filename: "Code.gs"}).runInContext(context);
  return context.__validatePrivateConfig;
}

function validManifestFor(entries) {
  const fileId = (suffix) => `FABRICATED${suffix}ID`;
  return {
    schemaVersion: "private-manifest/v1",
    appConfigFileId: fileId("CONFIG"),
    planFileId: fileId("PLAN"),
    sourceRegistryFileId: fileId("SOURCES"),
    readings: Object.fromEntries(entries.map((entry, index) => [entry.readingId, {
      contentFileId: fileId(`CONTENT${index}`), metadataFileId: fileId(`METADATA${index}`)
    }]))
  };
}

test("bridge preserves the full contiguous source-day sequence with stable IDs and grouped chapters", () => {
  assert.deepEqual(plan.entries.map((entry) => entry.readingId), bridgeIds);
  assert.deepEqual(plan.entries.map((entry) => entry.sourcePlanDay), Array.from({length: plan.entries.length}, (_, index) => index + 54));
  assert.deepEqual(plan.entries[0].passages.map((passage) => passage.chapter), [3, 4]);
  assert.deepEqual(plan.entries[1].passages.map((passage) => passage.chapter), [5, 6, 7]);
  assert.equal(plan.entries.length, 39);
  assert.equal(plan.entries.at(-1).readingId, "CC-Y3Q4-D092");
});

test("prepared-reading membership is a contiguous prefix independent of the full schedule", () => {
  const prefix = plan.entries.slice(0, 3).map((entry) => entry.readingId);
  assert.equal(app.preparedReadingIdSet({preparedReadingIds: prefix}, plan).size, 3);
  assert.throws(() => app.preparedReadingIdSet({preparedReadingIds: [prefix[0], plan.entries[2].readingId]}, plan),
    /contiguous prefix/);
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

test("seven-day lookahead exposes the complete prepared window", () => {
  const target = plan.entries.find((entry) => entry.sourcePlanDay === 65);
  const result = app.calculateSchedule(plan, fixedConfig(), new Date("2026-08-12T16:00:00Z"), target.readingId);
  assert.equal(result.selectedEntry.readingId, target.readingId);
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
  const result = app.calculateSchedule(plan, config, new Date("2026-08-08T16:00:00Z"), "CC-Y3Q4-D999", {testingOverride: true});
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

test("the full schedule maps September 15 to Malachi 4 while keeping it locked", () => {
  const calendar = app.buildMonthCalendar(plan, config, new Date("2026-08-21T16:00:00Z"), new Set(), "2026-09-01");
  const last = calendar.days.find((day) => day.date === "2026-09-15");
  assert.equal(last.entry.readingId, "CC-Y3Q4-D092");
  assert.equal(last.shortTitle, "Malachi 4");
  assert.equal(last.accessible, false);
});

test("bridge calendar maps every active August entry to its shared civil date", () => {
  const calendar = app.buildMonthCalendar(plan, config, new Date("2026-08-08T16:00:00Z"), new Set(), "2026-08-01");
  const dated = calendar.days.filter((day) => day.entry && day.inCurrentMonth);
  const augustIds = bridgeIds.slice(0, 24);
  assert.deepEqual(dated.map((day) => day.entry.readingId), augustIds);
  assert.deepEqual(dated.map((day) => day.date), Array.from({length: augustIds.length}, (_, index) => `2026-08-${String(index + 8).padStart(2, "0")}`));
  assert.equal(dated[0].status, "today");
  assert.ok(dated.slice(0, 8).every((day) => day.accessible));
  assert.ok(dated.slice(8).every((day) => !day.accessible));
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

test("active calendar preserves bridge events and labels the September long-term transition", () => {
  assert.equal(activePlan.entries.length, 1263);
  assert.equal(activePlan.entries[38].readingId, "CC-Y3Q4-D092");
  assert.equal(activePlan.entries[39].readingId, "LTP-0001-GEN-INTRO");
  assert.equal(activePlan.entries[40].readingId, "LTP-0002-GEN-001");
  const calendar = app.buildMonthCalendar(activePlan, config, new Date("2026-09-16T16:00:00Z"), new Set(), "2026-09-01");
  assert.equal(calendar.days.find((day) => day.date === "2026-09-16").shortTitle, "Genesis: Book Introduction");
  assert.equal(calendar.days.find((day) => day.date === "2026-09-17").shortTitle, "Genesis 1");
});

test("local mock defaults to the active calendar while ordinary future locks still apply", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  assert.match(source, /config\/active-calendar\/celebration-bridge-long-term-active\.json/);
  assert.equal(activePlan.entries[39].civilDate, "2026-09-16");
  assert.equal(activePlan.entries[40].civilDate, "2026-09-17");
  const lockedConfig = fixedConfig({futureLookaheadDays: 0});
  const schedule = app.calculateSchedule(activePlan, lockedConfig, new Date("2026-09-16T16:00:00Z"), "LTP-0002-GEN-001");
  assert.equal(schedule.selectedEntry.readingId, "LTP-0001-GEN-INTRO");
  const calendar = app.buildMonthCalendar(activePlan, lockedConfig, new Date("2026-09-16T16:00:00Z"), new Set(), "2026-09-01");
  const genesisOne = calendar.days.find((day) => day.date === "2026-09-17");
  assert.equal(genesisOne.entry.readingId, "LTP-0002-GEN-001");
  assert.equal(genesisOne.accessible, false);
});

test("Apps Script names every active-calendar book and frontend cache requires calendar revision", () => {
  const code = fs.readFileSync(path.join(__dirname, "../app/apps-script/Code.gs"), "utf8");
  const match = /const DBR_BOOK_NAMES = (\{[\s\S]*?\n\});/.exec(code);
  const names = Function(`return (${match[1]})`)();
  assert.equal(Object.keys(names).length, 66);
  activePlan.entries.flatMap((entry) => entry.passages || []).forEach((passage) => assert.ok(names[passage.bookId]));
  const frontend = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  assert.match(frontend, /calendarRevision/);
  assert.match(frontend, /previousCalendarRevision !== state\.plan\.calendarRevision/);
});

test("Apps Script private-config validator accepts the current active prefix and fails closed on active-calendar changes", () => {
  const privatePlan = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/pilot-content/plan.json"), "utf8"));
  const earliestPermittedDate = new Date(`${config.sharedStartDate}T12:00:00Z`);
  earliestPermittedDate.setUTCDate(
    earliestPermittedDate.getUTCDate() + privatePlan.entries.at(-1).dayIndex - 1 - config.preparedAheadDays
  );
  const validate = validatorHarness(earliestPermittedDate.toISOString().slice(0, 10));
  const manifest = validManifestFor(privatePlan.entries);
  assert.doesNotThrow(() => validate(config, privatePlan, manifest));

  const changedPassage = structuredClone(privatePlan);
  changedPassage.entries[0].passages[0].chapter += 1;
  assert.throws(() => validate(config, changedPassage, manifest), /Prepared plan does not match/);

  const changedBook = structuredClone(privatePlan);
  changedBook.entries[0].bookId = "GEN";
  assert.throws(() => validate(config, changedBook, manifest), /Prepared plan does not match/);
});

test("cached compatibility bootstrap requires a calendar revision while legacy plans remain readable", () => {
  const record = {readingId: "__app-bootstrap__", schemaVersion: "bootstrap-cache/v1", authorId: "dustin",
    cachedAt: "2026-09-01T00:00:00Z", expiresAt: "2026-09-02T00:00:00Z",
    payload: {session: {authorId: "dustin"}, plan: {planVersion: "celebration-y3q4-bridge-2026-v1", calendarRevision: activePlan.calendarRevision}}};
  assert.equal(app.bootstrapRecordIsFresh(record, Date.parse("2026-09-01T12:00:00Z"), {authorId: "dustin"}), true);
  delete record.payload.plan.calendarRevision;
  assert.equal(app.bootstrapRecordIsFresh(record, Date.parse("2026-09-01T12:00:00Z"), {authorId: "dustin"}), false);
  record.payload.plan.planVersion = "legacy-v1";
  assert.equal(app.bootstrapRecordIsFresh(record, Date.parse("2026-09-01T12:00:00Z"), {authorId: "dustin"}), true);
});
