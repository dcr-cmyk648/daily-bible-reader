const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const os = require("node:os");
const {spawnSync} = require("node:child_process");
const app = require("../app/frontend/app.js");
const core = require("../app/shared/server-core.js");
const {preparationFixture} = require("./helpers/preparation-fixture.js");
const modules = Promise.all([import("../scripts/lib/service-buffer.mjs"), import("../scripts/lib/preparation-status.mjs")]);

async function scenario(day, devotionalCount, completeCount, lastRunAt) {
  const {entries, payload, fallback} = preparationFixture();
  const start = day - 6;
  const horizon = entries.slice(start, start + 8);
  const health = {status: devotionalCount === 8 ? "ready" : "not_ready", effectiveDate: `2026-10-${String(day).padStart(2, "0")}`,
    readingIds: horizon.map(e => e.readingId), target: 8,
    missingPreparedReadingIds: horizon.slice(devotionalCount).map(e => e.readingId),
    currentHorizonHenryLayer: {status: completeCount === 8 ? "complete" : "debt",
      fallbackReadingIds: horizon.slice(completeCount, devotionalCount).map(e => e.readingId),
      unavailableReadingIds: horizon.slice(devotionalCount).map(e => e.readingId)}};
  const [{serviceBufferReport}] = await modules;
  const service = {schemaVersion: "preparation-status/v1", state: "ready", updatedAt: lastRunAt,
    lastRunAt, lastSuccessAt: lastRunAt, buffer: serviceBufferReport(health),
    summary: "FABRICATED private operational detail", action: "FABRICATED owner action",
    lanes: {henry_primary: {lastAttemptAt: lastRunAt, lastOutcome: "success", lastErrorCode: ""}}};
  const preparedIds = new Set(horizon.slice(0, devotionalCount).map(e => e.readingId));
  const payloads = new Map(horizon.slice(0, devotionalCount).map((e, i) => [e.readingId, i < completeCount ? payload(e) : fallback(e)]));
  const input = {entries, schedule: {status: "active", calendarDayIndex: start + 1}, preparedIds, payloads,
    service: core.preparationServiceStatus({preparationStatus: service}, {authorId: "dustin"}), now: Date.parse(`2026-10-${String(day).padStart(2, "0")}T16:00:00Z`)};
  return {input, readiness: app.evaluatePreparationReadiness(input), payload, horizon};
}

function rendered(readiness, service, owner = true) {
  const nodes = Object.fromEntries(["contentReadinessAlert", "contentReadinessTitle", "contentReadinessMessage"].map(id => [id, {dataset: {}, setAttribute(name, value) {this[name] = value;}}]));
  const source = fs.readFileSync(require.resolve("../app/frontend/app.js"), "utf8");
  const box = {state: {bootstrap: {preparationStatus: service}}, element: id => nodes[id],
    contentDiagnosticsArePrivateToOwner: () => owner, preparationNotice: app.preparationNotice};
  vm.createContext(box);
  vm.runInContext(source.slice(source.indexOf("  function renderContentReadiness("), source.indexOf("  function renderSelectedDay(")), box);
  box.renderContentReadiness(readiness);
  return nodes;
}

test("fabricated October 6/8/10 windows render amber/red/red and name the actual stale/fallback condition", async () => {
  for (const [day, devotional, complete, heartbeat, severity] of [
    [6, 8, 5, "2026-10-05T20:00:00Z", "warning"],
    [8, 8, 3, "2026-10-07T20:00:00Z", "critical"],
    [10, 3, 0, "2026-10-05T19:00:00Z", "critical"]
  ]) {
    const {input, readiness} = await scenario(day, devotional, complete, heartbeat);
    assert.equal(readiness.state, severity);
    assert.equal(readiness.completeFutureDays, Math.max(0, complete - 1));
    assert.equal(readiness.henryMissingCount, devotional - complete);
    const nodes = rendered(readiness, input.service);
    assert.equal(nodes.contentReadinessAlert.dataset.state, severity);
    assert.match(nodes.contentReadinessMessage.textContent, /Verse-by-verse commentary missing/);
    assert.match(nodes.contentReadinessMessage.textContent, /full-commentary links/);
    if (day === 10) assert.match(nodes.contentReadinessTitle.textContent, /hasn't run since Oct 5/);
    const short = rendered(readiness, input.service, false).contentReadinessMessage.textContent;
    assert.match(short, /verse commentary/);
    assert.doesNotMatch(short, /V2_AUTHOR|henry primary|operational|owner action/);
  }
});

test("green needs the complete actual horizon and a fresh heartbeat; a ready receipt cannot suppress debt", async () => {
  const {input} = await scenario(10, 8, 6, "2026-10-10T05:00:00Z");
  // Any fallback remains amber, even when five complete future days remain.
  assert.equal(app.evaluatePreparationReadiness(input).state, "warning");
  input.service.buffer.henryGaps = []; input.service.buffer.fallbackReadingIds = [];
  input.payloads = new Map(input.entries.slice(4, 12).map(e => [e.readingId, preparationFixture().payload(e)]));
  assert.equal(app.evaluatePreparationReadiness(input).state, "green");
  input.now = Date.parse(input.service.lastRunAt) + 30 * 3600000;
  assert.equal(app.evaluatePreparationReadiness(input).heartbeatStale, true);
  assert.equal(app.evaluatePreparationReadiness(input).state, "critical");
  delete input.service.lastRunAt;
  assert.equal(app.evaluatePreparationReadiness(input).state, "critical");
});

test("seven of eight published studies stay amber even when every downloaded payload is complete", async () => {
  const {input, payload, horizon} = await scenario(10, 7, 7, "2026-10-10T05:00:00Z");
  input.payloads = new Map(horizon.map(entry => [entry.readingId, payload(entry)]));
  const readiness = app.evaluatePreparationReadiness(input);
  assert.equal(readiness.completeFutureDays, 6);
  assert.equal(readiness.futureTarget, 7);
  assert.equal(readiness.devotionalMissingCount, 1);
  assert.equal(readiness.state, "warning");
  const owner = rendered(readiness, input.service);
  assert.equal(owner.contentReadinessAlert.hidden, false);
  assert.match(owner.contentReadinessMessage.textContent, /1 of 8 studies unavailable/);
  const shared = rendered(readiness, input.service, false);
  assert.equal(shared.contentReadinessAlert.hidden, false);
  assert.match(shared.contentReadinessMessage.textContent, /upcoming study buffer is incomplete/);
});

test("a fully complete shorter end-of-plan window is green without demanding seven nonexistent future days", () => {
  const {entries, payload} = preparationFixture();
  for (const count of [1, 2, 3, 7]) {
    const horizon = entries.slice(-count);
    const service = {state: "running", lastRunAt: "2026-10-10T05:00:00Z"};
    const readiness = app.evaluatePreparationReadiness({entries,
      schedule: {status: "active", calendarDayIndex: horizon[0].dayIndex},
      preparedIds: new Set(horizon.map(entry => entry.readingId)),
      payloads: new Map(horizon.map(entry => [entry.readingId, payload(entry)])),
      service, now: Date.parse("2026-10-10T15:00:00Z")});
    assert.equal(readiness.target, count);
    assert.equal(readiness.futureTarget, count - 1);
    assert.equal(readiness.completeFutureDays, count - 1);
    assert.equal(readiness.state, "green");
    assert.equal(app.preparationNotice(readiness, service, true), null);
  }
});

test("complete downloaded payloads cannot hide missing manifest membership or a measured Henry gap", async () => {
  const {input, payload, horizon} = await scenario(10, 3, 0, "2026-10-10T05:00:00Z");
  input.payloads = new Map(horizon.map(e => [e.readingId, payload(e)]));
  let result = app.evaluatePreparationReadiness(input);
  assert.equal(result.state, "critical"); assert.equal(result.devotionalMissingCount, 5);
  assert.equal(result.completeFutureDays, 0);
  // Calendar and payload paths share exactly the same evaluator and horizon.
  const source = fs.readFileSync(require.resolve("../app/frontend/app.js"), "utf8");
  assert.match(source, /renderContentReadiness\(currentContentReadiness\(\)\)/);
  assert.match(source, /renderContentReadiness\(currentContentReadiness\(payloadByReadingId\)\)/);
});

test("heartbeat no-op/success/blocked receipts preserve other lanes, last success, and reject a false ready claim", async () => {
  const [, {preparationStatusCandidate}] = await modules;
  const {input} = await scenario(10, 3, 0, "2026-10-05T19:00:00Z");
  const previous = input.service;
  const noOp = preparationStatusCandidate(previous, {state: "running", now: "2026-10-10T16:00:00Z",
    heartbeat: {lane: "daily", lastOutcome: "no_op", buffer: previous.buffer}});
  assert.equal(noOp.lastRunAt, "2026-10-10T16:00:00Z"); assert.equal(noOp.lastSuccessAt, noOp.lastRunAt);
  assert.deepEqual(noOp.lanes.henry_primary, previous.lanes.henry_primary);
  const blocked = preparationStatusCandidate(noOp, {state: "blocked", now: "2026-10-10T17:00:00Z",
    heartbeat: {lane: "henry_primary", lastOutcome: "blocked", lastErrorCode: "V2_AUTHOR_MODEL_UNAVAILABLE"}});
  assert.equal(blocked.lastSuccessAt, noOp.lastSuccessAt);
  assert.equal(blocked.lanes.daily.lastOutcome, "no_op");
  assert.throws(() => preparationStatusCandidate(blocked, {state: "ready"}), /COMPLETE_BUFFER/);
  assert.throws(() => preparationStatusCandidate(blocked, {state: "blocked", heartbeat: {lane: "daily", lastOutcome: "error", lastErrorCode: "raw private error text"}}), /HEARTBEAT_INVALID/);
});

test("bootstrap exposes shared liveness without owner details and recomputes inflated buffer counts", async () => {
  const {input} = await scenario(10, 3, 0, "2026-10-05T19:00:00Z");
  input.service.buffer.completeFutureDays = 99;
  input.service.buffer.privateFileId = "FABRICATED-PRIVATE-FIELD";
  const short = core.preparationServiceStatus({preparationStatus: input.service}, {authorId: "shane"});
  assert.equal(short.buffer.completeFutureDays, 0);
  assert.equal(short.lastRunAt, input.service.lastRunAt);
  for (const field of ["summary", "action", "lanes"]) assert.equal(short[field], undefined);
  assert.equal(short.buffer.privateFileId, undefined);
  assert.equal(core.preparationServiceStatus({preparationStatus: input.service}, {authorId: "outsider"}), null);
});

test("a daily no-op preserves another lane's blocker and both readers stay red with full content/fresh heartbeat", async () => {
  const [, {preparationStatusCandidate}] = await modules;
  const {input} = await scenario(10, 8, 8, "2026-10-10T05:00:00Z");
  input.service.state = "blocked";
  input.service.summary = "FABRICATED Henry configuration is blocked.";
  input.service.lanes.henry_primary = {lastAttemptAt: input.service.lastRunAt, lastOutcome: "blocked", lastErrorCode: "V2_AUTHOR_MODEL_UNAVAILABLE"};
  const next = preparationStatusCandidate(input.service, {state: "ready", summary: "FABRICATED daily no-op passed", now: "2026-10-10T15:00:00Z",
    heartbeat: {lane: "daily", lastOutcome: "no_op", buffer: input.service.buffer}});
  assert.equal(next.state, "blocked"); assert.equal(next.summary, input.service.summary);
  assert.deepEqual(next.lanes.henry_primary, input.service.lanes.henry_primary);
  for (const authorId of ["dustin", "shane"]) {
    const service = core.preparationServiceStatus({preparationStatus: {...next, state: "ready"}}, {authorId});
    assert.equal(service.hasUnresolvedLaneError, true);
    const readiness = app.evaluatePreparationReadiness({...input, service});
    assert.equal(readiness.state, "critical");
    assert.equal(app.preparationNotice(readiness, service, authorId === "dustin").state, "critical");
  }
  const sameLaneNoOp = preparationStatusCandidate(next, {state: "running", now: "2026-10-10T15:30:00Z", heartbeat: {lane: "henry_primary", lastOutcome: "no_op"}});
  assert.equal(sameLaneNoOp.lanes.henry_primary.lastErrorCode, "V2_AUTHOR_MODEL_UNAVAILABLE");
  const retryStart = preparationStatusCandidate(next, {state: "running", heartbeat: {lane: "henry_primary", lastOutcome: "running"}});
  assert.equal(retryStart.state, "blocked");
  assert.equal(retryStart.lanes.henry_primary.lastErrorCode, "V2_AUTHOR_MODEL_UNAVAILABLE");
  const legacy = {schemaVersion: "preparation-status/v1", state: "blocked", updatedAt: "2026-10-10T12:00:00Z", summary: "FABRICATED legacy blocker", action: ""};
  const migrated = preparationStatusCandidate(legacy, {state: "running", heartbeat: {lane: "daily", lastOutcome: "no_op"}});
  assert.equal(migrated.state, "blocked");
  assert.equal(preparationStatusCandidate(migrated, {state: "running", heartbeat: {lane: "daily", lastOutcome: "no_op"}}).state, "blocked");
  assert.equal(preparationStatusCandidate(migrated, {state: "running", resolveBlocker: true, heartbeat: {lane: "daily", lastOutcome: "success"}}).state, "running");
});

test("the actual status CLI stages a no-op heartbeat without mutating the manifest or its content pointers", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dbr-fabricated-status-"));
  try {
    const privateRoot = path.join(temporary, "private-content");
    fs.mkdirSync(privateRoot);
    const manifest = {schemaVersion: "private-manifest/v1", readings: {"FABRICATED-ONE": {fixturePointer: "FABRICATED UNCHANGED POINTER"}},
      preparationStatus: {schemaVersion: "preparation-status/v1", state: "blocked", updatedAt: "2026-10-05T19:00:00Z",
        summary: "FABRICATED retained Henry blocker", action: "FABRICATED correction required"}};
    const text = JSON.stringify(manifest) + "\n";
    fs.writeFileSync(path.join(privateRoot, "private-manifest.json"), text);
    fs.writeFileSync(path.join(temporary, "receipt.json"), JSON.stringify({lane: "daily", lastOutcome: "no_op"}));
    const command = spawnSync(process.execPath, [path.resolve(__dirname, "../scripts/prepare-service-status.mjs"),
      "running", "FABRICATED daily no-op", "", "--heartbeat", "receipt.json"], {cwd: temporary, encoding: "utf8"});
    assert.equal(command.status, 0, command.stderr);
    assert.deepEqual(JSON.parse(command.stdout), {state: "blocked", candidatePrepared: true, published: false});
    assert.equal(fs.readFileSync(path.join(privateRoot, "private-manifest.json"), "utf8"), text);
    const candidate = JSON.parse(fs.readFileSync(path.join(privateRoot, "automation/staging/service-status/manifest-candidate.json")));
    assert.deepEqual(candidate.readings, manifest.readings);
    assert.equal(candidate.preparationStatus.lanes.daily.lastOutcome, "no_op");
    assert.ok(Number.isFinite(Date.parse(candidate.preparationStatus.lastRunAt)));
    assert.equal(candidate.preparationStatus.summary, manifest.preparationStatus.summary);
  } finally {
    const resolved = fs.realpathSync(temporary);
    assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    fs.rmSync(resolved, {recursive: true, force: true});
  }
});
