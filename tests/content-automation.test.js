const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");

const root = path.join(__dirname, "..");
const automationModule = import("../scripts/lib/content-automation.mjs");
const schemaModule = import("../scripts/lib/schema-validator.mjs");

function json(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const base = {
  plan: json("fixtures/automation/plan.json"),
  appConfig: json("fixtures/automation/app-config.json"),
  policy: json("config/content-automation.example.json"),
  stagingIndex: json("fixtures/automation/staging-index.json"),
  liveIndex: json("fixtures/automation/live-index.json")
};

function staged(entry, overrides = {}) {
  const hashCharacter = String(entry.dayIndex % 10);
  return {
    readingId: entry.readingId,
    dayIndex: entry.dayIndex,
    stage: "ready_for_review",
    artifactRef: `FABRICATED_${entry.readingId}`,
    generatedAt: "2026-08-10T08:00:00.000Z",
    workflowVersion: "fabricated-workflow/v1",
    modelOrTool: "FABRICATED TEST TOOL",
    sourceSetVersion: "fabricated-sources/v1",
    humanReviewStatus: "unreviewed",
    contentHash: hashCharacter.repeat(64),
    validation: {status: "passed", checkedAt: "2026-08-10T08:30:00.000Z", errorCodes: []},
    priorContentHashes: [],
    knownLimitations: [],
    ...overrides
  };
}

function live(entry, overrides = {}) {
  const hashCharacter = String(entry.dayIndex % 10);
  const hash = hashCharacter.repeat(64);
  return {
    readingId: entry.readingId,
    dayIndex: entry.dayIndex,
    publicationStatus: "published",
    humanReviewStatus: "approved",
    contentHash: hash,
    manifestContentHash: hash,
    manifestEntryPresent: true,
    validationStatus: "passed",
    ...overrides
  };
}

test("automation fixtures and generated report validate against versioned schemas", async () => {
  const {assertSchemaValid} = await schemaModule;
  const {evaluateContentAutomation} = await automationModule;
  const schemas = {
    reading: json("schemas/reading.schema.json"),
    plan: json("schemas/plan.schema.json"),
    policy: json("schemas/content-automation-policy.schema.json"),
    staging: json("schemas/content-staging-index.schema.json"),
    live: json("schemas/content-live-index.schema.json"),
    report: json("schemas/content-readiness-report.schema.json"),
    workOrder: json("schemas/commentary-work-order.schema.json")
  };
  assertSchemaValid(base.plan, schemas.plan, {
    label: "Fabricated automation plan",
    externalSchemas: {"reading.schema.json": schemas.reading}
  });
  assertSchemaValid(base.policy, schemas.policy, {label: "Automation policy"});
  assertSchemaValid(base.stagingIndex, schemas.staging, {label: "Staging index"});
  assertSchemaValid(base.liveIndex, schemas.live, {label: "Live index"});
  const report = evaluateContentAutomation(clone(base), {
    today: "2026-08-10",
    evaluatedAt: "2026-08-10T10:00:00.000Z"
  });
  assertSchemaValid(report, schemas.report, {label: "Readiness report"});
});

test("the earliest missing draft wins even when a later reading is staged", async () => {
  const {evaluateContentAutomation} = await automationModule;
  const report = evaluateContentAutomation(clone(base), {
    today: "2026-08-10",
    evaluatedAt: "2026-08-10T10:00:00.000Z"
  });
  assert.equal(report.draft.consecutiveReadyDays, 2);
  assert.equal(report.draft.nextGapReadingId, "TST-003");
  assert.equal(report.draft.nextGapReason, "staging_entry_missing");
  assert.equal(report.draft.state, "critical");
  assert.deepEqual(report.nextAction, {
    kind: "generate_or_repair_one",
    readingId: "TST-003",
    reasonCode: "staging_entry_missing"
  });
});

test("changes requested and validation failures stop the draft horizon", async () => {
  const {evaluateContentAutomation} = await automationModule;
  const input = clone(base);
  input.stagingIndex.entries.push(staged(input.plan.entries[2], {
    stage: "changes_requested",
    humanReviewStatus: "changes_requested"
  }));
  let report = evaluateContentAutomation(input, {today: "2026-08-10"});
  assert.equal(report.draft.nextGapReadingId, "TST-003");
  assert.equal(report.draft.nextGapReason, "changes_requested");

  input.stagingIndex.entries[input.stagingIndex.entries.length - 1] = staged(input.plan.entries[2], {
    stage: "validation_failed",
    validation: {status: "failed", checkedAt: "2026-08-10T09:00:00.000Z", errorCodes: ["citation_missing"]}
  });
  report = evaluateContentAutomation(input, {today: "2026-08-10"});
  assert.equal(report.draft.nextGapReason, "staging_validation_failed");
});

test("published readiness is strict about approval, manifest presence, and matching hashes", async () => {
  const {evaluateContentAutomation} = await automationModule;
  const input = clone(base);
  input.stagingIndex.entries = input.plan.entries.slice(1, 7).map((entry) => staged(entry));
  input.liveIndex.readings = input.plan.entries.slice(0, 5).map((entry) => live(entry));
  input.liveIndex.readings[1].manifestContentHash = "f".repeat(64);
  let report = evaluateContentAutomation(input, {today: "2026-08-10"});
  assert.equal(report.draft.targetMet, true);
  assert.equal(report.published.nextGapReadingId, "TST-002");
  assert.equal(report.published.nextGapReason, "content_hash_mismatch");
  assert.equal(report.nextAction.kind, "review_or_publish_one");

  input.liveIndex.readings[1] = live(input.plan.entries[1], {humanReviewStatus: "in_review"});
  report = evaluateContentAutomation(input, {today: "2026-08-10"});
  assert.equal(report.published.nextGapReason, "review_not_approved");

  input.liveIndex.readings[1] = live(input.plan.entries[1], {manifestEntryPresent: false});
  report = evaluateContentAutomation(input, {today: "2026-08-10"});
  assert.equal(report.published.nextGapReason, "manifest_entry_missing");
});

test("book introductions count as one normal buffered reading", async () => {
  const {evaluateContentAutomation} = await automationModule;
  const input = clone(base);
  input.stagingIndex.entries = input.plan.entries.slice(1, 7).map((entry) => staged(entry));
  const report = evaluateContentAutomation(input, {today: "2026-08-10"});
  assert.equal(input.plan.entries[3].kind, "book_intro");
  assert.equal(report.draft.consecutiveReadyDays, 7);
  assert.equal(report.draft.readyThroughReadingId, "TST-007");
  assert.equal(report.draft.targetMet, true);
});

test("Detroit civil-day selection survives DST and a changed start date", async () => {
  const {civilDateInTimeZone, resolveAutomationStart} = await automationModule;
  assert.equal(civilDateInTimeZone("2026-03-08T04:59:59.000Z", "America/Detroit"), "2026-03-07");
  assert.equal(civilDateInTimeZone("2026-03-08T05:00:00.000Z", "America/Detroit"), "2026-03-08");
  const config = {...base.appConfig, sharedStartDate: "2026-03-07"};
  assert.equal(resolveAutomationStart(base.plan, config, {today: "2026-03-09"}).startIndex, 2);
  assert.equal(resolveAutomationStart(base.plan, {...config, sharedStartDate: "2026-03-08"}, {today: "2026-03-09"}).startIndex, 1);
});

test("the evaluator closes cleanly at the end of the plan", async () => {
  const {evaluateContentAutomation} = await automationModule;
  const report = evaluateContentAutomation(clone(base), {today: "2026-08-18"});
  assert.equal(report.startIndex, 8);
  assert.equal(report.remainingDays, 0);
  assert.equal(report.draft.state, "green");
  assert.equal(report.published.state, "green");
  assert.deepEqual(report.nextAction, {
    kind: "plan_complete",
    readingId: null,
    reasonCode: "no_remaining_readings"
  });
});

test("unsafe automation policy changes fail closed", async () => {
  const {validateAutomationPolicy, evaluateContentAutomation} = await automationModule;
  assert.throws(() => validateAutomationPolicy({...clone(base.policy), autoPublish: true}), /never auto-publish/);
  assert.throws(() => validateAutomationPolicy({...clone(base.policy), maxReadingsGeneratedPerRun: 2}), /at most one/);
  const wrongZone = clone(base);
  wrongZone.policy.generationTimezone = "America/Chicago";
  assert.throws(() => evaluateContentAutomation(wrongZone, {today: "2026-08-10"}), /timezones must match/);
});

test("a validated one-reading work order is stable and carries the complete schedule unit", async () => {
  const {buildCommentaryWorkOrder, evaluateContentAutomation} = await automationModule;
  const {assertSchemaValid} = await schemaModule;
  const input = clone(base);
  input.policy.generationEnabled = true;
  const report = evaluateContentAutomation(input, {
    today: "2026-08-10",
    evaluatedAt: "2026-08-10T10:00:00.000Z"
  });
  const workOrder = buildCommentaryWorkOrder({plan: input.plan, policy: input.policy, report});
  assertSchemaValid(workOrder, json("schemas/commentary-work-order.schema.json"), {
    label: "Fabricated commentary work order",
    externalSchemas: {"reading.schema.json": json("schemas/reading.schema.json")}
  });
  assert.equal(workOrder.reading.readingId, "TST-003");
  assert.equal(workOrder.reading.passages[0].chapter, 3);
  assert.equal(workOrder.context.immediatePreviousReadingId, "TST-002");
  assert.equal(workOrder.pipeline.skillName, "draft-daily-commentary");
  assert.equal(workOrder.guards.maxReadings, 1);
  assert.equal(workOrder.guards.autoPublish, false);
  assert.equal(workOrder.guards.scriptureTextAllowed, false);

  const laterReport = {...report, evaluatedAt: "2026-08-10T11:00:00.000Z"};
  const retry = buildCommentaryWorkOrder({plan: input.plan, policy: input.policy, report: laterReport});
  assert.equal(retry.workOrderId, workOrder.workOrderId);
});

test("the work-order gate refuses generation until a private policy explicitly enables it", async () => {
  const {buildCommentaryWorkOrder, evaluateContentAutomation} = await automationModule;
  const input = clone(base);
  const report = evaluateContentAutomation(input, {today: "2026-08-10"});
  assert.throws(() => buildCommentaryWorkOrder({plan: input.plan, policy: input.policy, report}),
    /generation is disabled/);
});

test("duplicate staging records fail rather than producing an ambiguous action", async () => {
  const {evaluateContentAutomation} = await automationModule;
  const input = clone(base);
  input.stagingIndex.entries.push(clone(input.stagingIndex.entries[0]));
  assert.throws(() => evaluateContentAutomation(input, {today: "2026-08-10"}), /duplicate readingId/);
});

test("staging and live indexes cannot name an unconfigured reading", async () => {
  const {evaluateContentAutomation} = await automationModule;
  const input = clone(base);
  input.stagingIndex.entries.push(staged({readingId: "TST-999", dayIndex: 999}));
  assert.throws(() => evaluateContentAutomation(input, {today: "2026-08-10"}), /outside the active plan/);
  input.stagingIndex.entries.pop();
  input.liveIndex.readings[0].dayIndex = 2;
  assert.throws(() => evaluateContentAutomation(input, {today: "2026-08-10"}), /dayIndex does not match/);
});

test("the CLI is read-only and emits one machine-readable next action", () => {
  const result = spawnSync(process.execPath, [
    "scripts/content-automation.mjs", "status",
    "--plan", "fixtures/automation/plan.json",
    "--app-config", "fixtures/automation/app-config.json",
    "--policy", "config/content-automation.example.json",
    "--staging-index", "fixtures/automation/staging-index.json",
    "--live-index", "fixtures/automation/live-index.json",
    "--today", "2026-08-10",
    "--compact"
  ], {cwd: root, encoding: "utf8"});
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.nextAction.kind, "generate_or_repair_one");
  assert.equal(report.nextAction.readingId, "TST-003");
  const source = fs.readFileSync(path.join(root, "scripts/content-automation.mjs"), "utf8");
  assert.doesNotMatch(source, /writeFile|appendFile|unlink|rmSync|fetch\s*\(|DriveApp|SpreadsheetApp/);
});

test("the CLI can hand one validated work order to the scheduled commentary skill", () => {
  const commonArgs = [
    "--plan", "fixtures/automation/plan.json",
    "--app-config", "fixtures/automation/app-config.json",
    "--staging-index", "fixtures/automation/staging-index.json",
    "--live-index", "fixtures/automation/live-index.json",
    "--today", "2026-08-10",
    "--compact"
  ];
  const enabled = spawnSync(process.execPath, [
    "scripts/content-automation.mjs", "work-order",
    "--policy", "fixtures/automation/policy-enabled.json",
    ...commonArgs
  ], {cwd: root, encoding: "utf8"});
  assert.equal(enabled.status, 0, enabled.stderr);
  const workOrder = JSON.parse(enabled.stdout);
  assert.equal(workOrder.schemaVersion, "commentary-work-order/v1");
  assert.equal(workOrder.reading.readingId, "TST-003");
  assert.equal(workOrder.pipeline.skillName, "draft-daily-commentary");

  const disabled = spawnSync(process.execPath, [
    "scripts/content-automation.mjs", "work-order",
    "--policy", "config/content-automation.example.json",
    ...commonArgs
  ], {cwd: root, encoding: "utf8"});
  assert.notEqual(disabled.status, 0);
  assert.match(disabled.stderr, /generation is disabled/);
});
