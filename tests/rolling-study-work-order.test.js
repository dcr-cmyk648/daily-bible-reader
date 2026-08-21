import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {buildRollingStudyWorkOrder, privateReadingReady} from "../scripts/lib/rolling-study-work-order.mjs";

const json = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const inputs = () => ({
  plan: json("config/bridge-schedules/celebration-y3q4-bridge-full.json"),
  privatePlan: json("fixtures/pilot-content/plan.json"),
  appConfig: json("fixtures/pilot-content/app-config.json"),
  referencePlan: json("config/reference-plans/celebration-y3q4.json"),
  metrics: json("config/reference-plans/celebration-y3q4-chapter-metrics.json"),
  today: "2026-08-13",
  issuedAt: "2026-08-13T07:00:00.000Z"
});

test("the work order distinguishes the complete schedule from the private prepared prefix", () => {
  const order = buildRollingStudyWorkOrder({...inputs(), today: "2026-08-21", issuedAt: "2026-08-21T07:00:00.000Z"});
  assert.equal(order.reading.readingId, "CC-Y3Q4-D074");
  assert.equal(order.planExtensionRequired, true);
});

test("the private prepared plan must align with the complete schedule", () => {
  const privatePlan = structuredClone(inputs().privatePlan);
  privatePlan.entries[1].readingId = "CC-Y3Q4-D999";
  assert.throws(() => buildRollingStudyWorkOrder({...inputs(), privatePlan}), /contiguous prefix/);
});

test("the daily work order selects exactly the reading entering T+7", () => {
  const order = buildRollingStudyWorkOrder(inputs());
  assert.equal(order.action, "prepare_publish");
  assert.equal(order.targetDate, "2026-08-20");
  assert.equal(order.reading.readingId, "CC-Y3Q4-D066");
  assert.equal(order.planExtensionRequired, false);
  assert.equal(order.guards.maxReadings, 1);
  assert.equal(order.guards.sparkScope, "matthew_henry_verse_layer_only");
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
  assert.equal(privateReadingReady({entry, metadata, markdownBytes, manifestHasReading: true}), true);
  assert.equal(privateReadingReady({entry, metadata, markdownBytes: Buffer.from("CHANGED"), manifestHasReading: true}), false);
  assert.equal(privateReadingReady({entry, metadata, markdownBytes, manifestHasReading: false}), false);
  assert.equal(privateReadingReady({entry, metadata: {...metadata, verseCommentary: {review_status: "unreviewed"}}, markdownBytes, manifestHasReading: true}), false);
  const linked = structuredClone(metadata);
  delete linked.verseCommentary;
  linked.henrySourceLink = {
    sourceId: "fabricated-henry-source",
    title: "Read the fabricated full commentary",
    url: "https://example.test/public-domain-commentary",
    note: "A verified test-only source link replaces an unavailable condensation."
  };
  assert.equal(privateReadingReady({entry, metadata: linked, markdownBytes, manifestHasReading: true}), true);
  linked.henrySourceLink.url = "javascript:alert(1)";
  assert.equal(privateReadingReady({entry, metadata: linked, markdownBytes, manifestHasReading: true}), false);
});
