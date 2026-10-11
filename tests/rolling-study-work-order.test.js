import assert from "node:assert/strict";
import test from "node:test";
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildRollingStudyWorkOrder, privateReadingReady} from "../scripts/lib/rolling-study-work-order.mjs";

const json = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const bridgeOnlyPrivatePlan = () => {
  const rollingPlan = json("fixtures/pilot-content/plan.json");
  return {...rollingPlan, entries: rollingPlan.entries.filter((entry) => Number.isInteger(entry.sourcePlanDay))};
};
const inputs = () => ({
  plan: json("config/bridge-schedules/celebration-y3q4-bridge-full.json"),
  privatePlan: bridgeOnlyPrivatePlan(),
  appConfig: json("fixtures/pilot-content/app-config.json"),
  referencePlan: json("config/reference-plans/celebration-y3q4.json"),
  metrics: json("config/reference-plans/celebration-y3q4-chapter-metrics.json"),
  protocol: json("config/daily-study-protocol.json"),
  today: "2026-08-13",
  issuedAt: "2026-08-13T07:00:00.000Z"
});

function privatePrefix(plan, lastSourceDayInclusive) {
  const privatePlan = structuredClone(plan);
  privatePlan.entries = privatePlan.entries.filter((entry) => entry.sourcePlanDay <= lastSourceDayInclusive);
  return privatePlan;
}

function activeInputs() {
  const base = inputs();
  base.plan = json("config/active-calendar/celebration-bridge-long-term-active.json");
  base.privatePlan = { ...base.privatePlan, entries: base.privatePlan.entries.slice() };
  return base;
}

function reviewedArtifact(entry) {
  const markdownBytes = Buffer.from(`FABRICATED PRIVATE COMMENTARY FOR ${entry.readingId}`);
  return {
    metadata: {
      readingId: entry.readingId,
      publicationStatus: "draft",
      generation: {
        humanReviewStatus: "in_review",
        contentHash: createHash("sha256").update(markdownBytes).digest("hex"),
        contentProtocolVersion: "daily-study-protocol/v1"
      },
      componentAssessments: {
        historicalContext: {status: "not_material", rationale: "Fabricated test reading has no meaningful contextual material to add."}
      },
      verseCommentaries: entry.passages.map(() => ({review_status: "in_review"}))
    },
    markdownBytes,
    manifestHasReading: true
  };
}

function horizonArtifacts({plan, today}) {
  const firstSourceDay = plan.entries[0].sourcePlanDay;
  const currentSourceDay = firstSourceDay + Math.max(0,
    Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse("2026-08-08T00:00:00Z")) / 86400000));
  return Object.fromEntries(plan.entries
    .filter((entry) => entry.sourcePlanDay >= currentSourceDay && entry.sourcePlanDay <= currentSourceDay + 7)
    .map((entry) => [entry.readingId, reviewedArtifact(entry)]));
}

test("the work order distinguishes the complete schedule from the private prepared prefix", () => {
  const base = inputs();
  const privatePlan = privatePrefix(base.privatePlan, 69);
  const artifacts = horizonArtifacts({plan: base.plan, today: "2026-08-22"});
  delete artifacts["CC-Y3Q4-D070"];
  const order = buildRollingStudyWorkOrder({...base, privatePlan, today: "2026-08-22", issuedAt: "2026-08-22T07:00:00.000Z",
    readingArtifacts: artifacts});
  assert.equal(order.reading.readingId, "CC-Y3Q4-D070");
  assert.equal(order.planExtensionRequired, true);
});

test("the private prepared plan must align with the complete schedule", () => {
  const privatePlan = structuredClone(inputs().privatePlan);
  privatePlan.entries[1].readingId = "CC-Y3Q4-D999";
  assert.throws(() => buildRollingStudyWorkOrder({...inputs(), privatePlan}), /contiguous prefix/);
});

test("the daily work order selects the newly entering T+7 reading when the earlier horizon is ready", () => {
  const base = inputs();
  const readingArtifacts = horizonArtifacts({plan: base.plan, today: base.today});
  delete readingArtifacts["CC-Y3Q4-D066"];
  const order = buildRollingStudyWorkOrder({...base,
    readingArtifacts});
  assert.equal(order.action, "prepare_publish");
  assert.equal(order.targetDate, "2026-08-20");
  assert.equal(order.reading.readingId, "CC-Y3Q4-D066");
  assert.equal(order.planExtensionRequired, false);
  assert.equal(order.guards.maxReadings, 1);
  assert.equal(order.guards.sparkScope, "matthew_henry_verse_layer_only");
});

test("the work order drains horizon gaps in order and treats missing readiness evidence as stale", () => {
  const base = inputs();
  const today = "2026-08-22";
  const artifacts = horizonArtifacts({plan: base.plan, today});
  delete artifacts["CC-Y3Q4-D070"];
  delete artifacts["CC-Y3Q4-D071"];
  const initialPrivatePlan = privatePrefix(base.plan, 69);
  let order = buildRollingStudyWorkOrder({...base, today, privatePlan: initialPrivatePlan, readingArtifacts: artifacts});
  assert.equal(order.reading.readingId, "CC-Y3Q4-D070");
  assert.equal(order.planExtensionRequired, true);

  artifacts["CC-Y3Q4-D070"] = reviewedArtifact(base.plan.entries.find((entry) => entry.readingId === "CC-Y3Q4-D070"));
  const privatePlan = privatePrefix(base.plan, 70);
  order = buildRollingStudyWorkOrder({...base, today, privatePlan, readingArtifacts: artifacts});
  assert.equal(order.reading.readingId, "CC-Y3Q4-D071");
  assert.equal(order.planExtensionRequired, true);
});

test("the work order returns no work only when the whole current-through-T+7 horizon is ready", () => {
  const base = inputs();
  const today = "2026-08-22";
  const privatePlan = structuredClone(base.plan);
  const order = buildRollingStudyWorkOrder({...base, today, privatePlan,
    readingArtifacts: horizonArtifacts({plan: base.plan, today})});
  assert.equal(order.action, "none");
  assert.equal(order.reasonCode, "horizon_ready");
  assert.equal(order.reading.readingId, "CC-Y3Q4-D075");
});

test("the final in-plan horizon is audited before the evaluator reports plan completion", () => {
  const base = inputs();
  const finalDay = "2026-09-15";
  const finalEntry = base.plan.entries.find((entry) => entry.readingId === "CC-Y3Q4-D092");
  const finalArtifacts = {[finalEntry.readingId]: reviewedArtifact(finalEntry)};
  let order = buildRollingStudyWorkOrder({...base, today: finalDay, readingArtifacts: finalArtifacts});
  assert.equal(order.action, "none");
  delete finalArtifacts["CC-Y3Q4-D092"];
  order = buildRollingStudyWorkOrder({...base, today: finalDay, readingArtifacts: finalArtifacts});
  assert.equal(order.action, "prepare_publish");
  assert.equal(order.reading.readingId, "CC-Y3Q4-D092");

  order = buildRollingStudyWorkOrder({...base, today: "2026-09-16", readingArtifacts: finalArtifacts});
  assert.equal(order.action, "plan_complete");
  assert.equal(order.reading, null);
});

test("a near-end horizon starts at the actual current scheduled day", () => {
  const base = inputs();
  const today = "2026-09-10";
  const artifacts = Object.fromEntries(base.plan.entries
    .filter((entry) => entry.sourcePlanDay >= 87 && entry.sourcePlanDay <= 92)
    .map((entry) => [entry.readingId, reviewedArtifact(entry)]));
  delete artifacts["CC-Y3Q4-D087"];
  const order = buildRollingStudyWorkOrder({...base, today, readingArtifacts: artifacts});
  assert.equal(order.reading.readingId, "CC-Y3Q4-D087");
});

test("before the bridge starts, the horizon begins at its first scheduled reading", () => {
  const base = inputs();
  const today = "2026-08-01";
  const readingArtifacts = horizonArtifacts({plan: base.plan, today});
  delete readingArtifacts["CC-Y3Q4-D054"];
  const order = buildRollingStudyWorkOrder({...base, today,
    readingArtifacts});
  assert.equal(order.action, "prepare_publish");
  assert.equal(order.reading.readingId, "CC-Y3Q4-D054");
});

test("a stale private-prefix record is selected before a later missing T+7 record", () => {
  const base = inputs();
  const today = "2026-08-22";
  const artifacts = horizonArtifacts({plan: base.plan, today});
  artifacts["CC-Y3Q4-D069"].markdownBytes = Buffer.from("STALE FABRICATED BYTES");
  delete artifacts["CC-Y3Q4-D075"];
  const order = buildRollingStudyWorkOrder({...base, today, readingArtifacts: artifacts});
  assert.equal(order.reading.readingId, "CC-Y3Q4-D069");
  assert.equal(order.planExtensionRequired, false);
});

test("readiness requires exact private bytes, reviewed Henry, and manifest presence", () => {
  const entry = {readingId: "CC-Y3Q4-D066", kind: "chapter", passages: [{bookId: "2PE", chapter: 2, verseCount: 22}]};
  const markdownBytes = Buffer.from("FABRICATED PRIVATE COMMENTARY");
  const metadata = {
    readingId: entry.readingId,
    publicationStatus: "draft",
    generation: {humanReviewStatus: "in_review", contentHash: createHash("sha256").update(markdownBytes).digest("hex")},
    verseCommentary: {review_status: "in_review"}
  };
  const protocol = inputs().protocol;
  metadata.generation.contentProtocolVersion = protocol.protocolVersion;
  metadata.componentAssessments = {historicalContext: {status: "not_material", rationale: "Fabricated test reading has no meaningful contextual material to add."}};
  assert.equal(privateReadingReady({entry, metadata, markdownBytes, manifestHasReading: true, protocol}), true);
  assert.equal(privateReadingReady({entry, metadata, markdownBytes: Buffer.from("CHANGED"), manifestHasReading: true, protocol}), false);
  assert.equal(privateReadingReady({entry, metadata, markdownBytes, manifestHasReading: false, protocol}), false);
  assert.equal(privateReadingReady({entry, metadata: {...metadata, verseCommentary: {review_status: "unreviewed"}}, markdownBytes, manifestHasReading: true, protocol}), false);
  const linked = structuredClone(metadata);
  delete linked.verseCommentary;
  linked.henrySourceLink = {
    sourceId: "fabricated-henry-source",
    title: "Read the fabricated full commentary",
    url: "https://example.test/public-domain-commentary",
    note: "A verified test-only source link replaces an unavailable condensation."
  };
  assert.equal(privateReadingReady({entry, metadata: linked, markdownBytes, manifestHasReading: true, protocol}), true);
  linked.henrySourceLink.url = "javascript:alert(1)";
  assert.equal(privateReadingReady({entry, metadata: linked, markdownBytes, manifestHasReading: true, protocol}), false);
});

test("the rolling horizon crosses into the active long-term calendar by day index", () => {
  const base = activeInputs();
  const readingArtifacts = Object.fromEntries(base.plan.entries.slice(32, 39)
    .map((entry) => [entry.readingId, reviewedArtifact(entry)]));
  const order = buildRollingStudyWorkOrder({...base, today: "2026-09-09", readingArtifacts});
  assert.equal(order.reading.readingId, "LTP-0001-GEN-INTRO");
  assert.equal(order.planExtensionRequired, true);
  assert.equal(order.reading.dayIndex, 40);
});

test("the rolling-study CLI selects Genesis introduction after the D092-ready private prefix", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dbr-rolling-study-cli-"));
  try {
    for (const directory of ["scripts", "config", "fixtures", "schemas"]) {
      cpSync(path.join(ROOT, directory), path.join(root, directory), {recursive: true});
    }
    const activePlan = json("config/active-calendar/celebration-bridge-long-term-active.json");
    const privatePlanPath = path.join(root, "fixtures", "pilot-content", "plan.json");
    const privatePlan = JSON.parse(readFileSync(privatePlanPath, "utf8"));
    privatePlan.entries = activePlan.entries.slice(0, 39);
    writeFileSync(privatePlanPath, `${JSON.stringify(privatePlan, null, 2)}\n`);

    // The canonical private artifact directory stays shared across the bridge
    // and active-calendar continuation; only the prepared prefix advances.
    const artifactDirectory = path.join(root, "private-content", "bridge", "celebration-y3q4");
    mkdirSync(artifactDirectory, {recursive: true});
    const readyEntries = activePlan.entries.filter((entry) => entry.dayIndex >= 34 && entry.dayIndex <= 39);
    const manifest = {readings: {}};
    for (const entry of readyEntries) {
      const artifact = reviewedArtifact(entry);
      writeFileSync(path.join(artifactDirectory, `${entry.readingId}.metadata.json`), `${JSON.stringify(artifact.metadata)}\n`);
      writeFileSync(path.join(artifactDirectory, `${entry.readingId}.md`), artifact.markdownBytes);
      manifest.readings[entry.readingId] = {};
    }
    writeFileSync(path.join(root, "private-content", "private-manifest.json"), `${JSON.stringify(manifest)}\n`);

    const result = spawnSync(process.execPath, ["scripts/rolling-study-work-order.mjs", "--today", "2026-09-10"], {
      cwd: root, encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
    const order = JSON.parse(result.stdout);
    assert.equal(order.action, "prepare_publish");
    assert.equal(order.reading.readingId, "LTP-0001-GEN-INTRO");
    assert.equal(order.reading.dayIndex, 40);
    assert.equal(order.planExtensionRequired, true);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test("daily CLI selects missing Genesis 16 despite retained Genesis 15 Henry review debt", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dbr-daily-henry-independent-"));
  try {
    for (const directory of ["scripts", "config", "fixtures", "schemas"]) {
      cpSync(path.join(ROOT, directory), path.join(root, directory), {recursive: true});
    }
    const activePlan = json("config/active-calendar/celebration-bridge-long-term-active.json");
    const privatePlan = json("fixtures/pilot-content/plan.json");
    privatePlan.entries = activePlan.entries.slice(0, 66);
    writeFileSync(path.join(root, "fixtures/pilot-content/plan.json"), JSON.stringify(privatePlan));
    const artifactDirectory = path.join(root, "private-content/bridge/celebration-y3q4");
    mkdirSync(artifactDirectory, {recursive: true});
    const manifest = {readings: {}};
    for (const entry of activePlan.entries.slice(63, 66)) {
      const artifact = reviewedArtifact(entry);
      delete artifact.metadata.verseCommentaries;
      artifact.metadata.henrySourceLink = {
        sourceId: "FABRICATED-henry-full-work", title: "FABRICATED full commentary",
        url: "https://example.test/FABRICATED-complete-henry",
        note: "FABRICATED test-only verified full-work fallback; native review is pending."
      };
      writeFileSync(path.join(artifactDirectory, `${entry.readingId}.metadata.json`), JSON.stringify(artifact.metadata));
      writeFileSync(path.join(artifactDirectory, `${entry.readingId}.md`), artifact.markdownBytes);
      manifest.readings[entry.readingId] = {};
    }
    writeFileSync(path.join(root, "private-content/private-manifest.json"), JSON.stringify(manifest));
    // This retained, conspicuously fabricated debt is outside daily publication
    // readiness. The daily CLI must neither read nor reset the Henry journal.
    const debtDirectory = path.join(root, "private-content/automation/mhc-v2/FABRICATED-GEN-015");
    mkdirSync(debtDirectory, {recursive: true});
    const debtPath = path.join(debtDirectory, "state.json");
    const debtBytes = JSON.stringify({label: "FABRICATED retained Henry review debt",
      reading_id: "LTP-0027-GEN-015", status: "review_exhausted"});
    writeFileSync(debtPath, debtBytes);
    const run = () => spawnSync(process.execPath, ["scripts/rolling-study-work-order.mjs", "--today", "2026-10-10"], {
      cwd: root, encoding: "utf8"
    });
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const order = JSON.parse(result.stdout);
    assert.equal(order.action, "prepare_publish");
    assert.equal(order.reading.readingId, "LTP-0028-GEN-016");
    assert.equal(order.reading.civilDate, "2026-10-13");
    assert.equal(order.targetDate, "2026-10-17");
    assert.equal(order.planExtensionRequired, true);
    assert.equal(order.guards.maxReadings, 1);
    assert.equal(readFileSync(debtPath, "utf8"), debtBytes);
    // Independence must not hide a stale devotional or an invalid fallback.
    const priorPath = path.join(artifactDirectory, "LTP-0027-GEN-015.metadata.json");
    const prior = JSON.parse(readFileSync(priorPath, "utf8"));
    prior.henrySourceLink.url = "http://example.test/FABRICATED-invalid-fallback";
    writeFileSync(priorPath, JSON.stringify(prior));
    const invalid = run();
    assert.equal(invalid.status, 0, invalid.stderr);
    assert.equal(JSON.parse(invalid.stdout).reading.readingId, "LTP-0027-GEN-015");
    assert.equal(readFileSync(debtPath, "utf8"), debtBytes);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});
