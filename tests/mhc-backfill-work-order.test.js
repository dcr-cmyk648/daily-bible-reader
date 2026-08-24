import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {assertSchemaValid} from "../scripts/lib/schema-validator.mjs";
import {
  buildMhcBackfillWorkOrder,
  isVerifiedHenryFallback,
  selectMhcBackfillCandidate
} from "../scripts/lib/mhc-backfill-work-order.mjs";

const schema = JSON.parse(readFileSync(new URL("../schemas/mhc-backfill-work-order.schema.json", import.meta.url), "utf8"));
const plan = {
  planVersion: "fabricated-plan-v1",
  entries: [1, 2, 3].map((dayIndex) => ({
    planVersion: "fabricated-plan-v1",
    dayIndex,
    readingId: `FAB-${String(dayIndex).padStart(3, "0")}`,
    kind: "chapter",
    passages: [{bookId: "TST", chapter: dayIndex, verseCount: 10}]
  }))
};
const fallback = (readingId) => ({
  readingId,
  henrySourceLink: {
    sourceId: "fabricated-henry",
    title: "Fabricated full public-domain commentary",
    url: "https://example.test/fabricated-henry",
    note: "FABRICATED TEST FALLBACK ONLY."
  }
});

test("the queue selects only the earliest published valid fallback", () => {
  const metadata = new Map([
    ["FAB-001", fallback("FAB-001")],
    ["FAB-002", fallback("FAB-002")]
  ]);
  let candidate = selectMhcBackfillCandidate({
    plan,
    metadataByReadingId: metadata,
    manifestReadingIds: ["FAB-002", "FAB-003"]
  });
  assert.equal(candidate.entry.readingId, "FAB-002");
  metadata.get("FAB-002").henrySourceLink.url = "javascript:alert(1)";
  candidate = selectMhcBackfillCandidate({plan, metadataByReadingId: metadata, manifestReadingIds: ["FAB-002"]});
  assert.equal(candidate, null);
  assert.equal(isVerifiedHenryFallback(fallback("FAB-001").henrySourceLink), true);
});

test("a missing artifact creates one bounded Spark ensure request", () => {
  const candidate = selectMhcBackfillCandidate({
    plan,
    metadataByReadingId: {"FAB-001": fallback("FAB-001")},
    manifestReadingIds: ["FAB-001"]
  });
  const order = buildMhcBackfillWorkOrder({
    plan,
    candidate,
    libraryState: "missing",
    issuedAt: "2026-08-12T18:00:00.000Z"
  });
  assertSchemaValid(order, schema, {label: "Fabricated Henry backfill order"});
  assert.equal(order.action, "generate_review_publish");
  assert.equal(order.reading.readingId, "FAB-001");
  assert.equal(order.sparkRequest.reading_count, 1);
  assert.equal(order.sparkRequest.worker_model, "gpt-5.3-codex-spark");
  assert.equal(order.guards.tPlus7PreparationFirst, true);
  assert.equal(order.guards.sparkAvailabilityFallback, "gpt-5.6-luna-low-only");
  assert.equal(order.guards.solOrOtherModelAllowed, false);
});

test("stored artifacts skip generation and retain review gates", () => {
  const candidate = {entry: plan.entries[0], metadata: fallback("FAB-001")};
  const inReview = buildMhcBackfillWorkOrder({
    plan, candidate, libraryState: "in_review", issuedAt: "2026-08-12T18:00:00.000Z"
  });
  assert.equal(inReview.action, "review_attach_publish");
  assert.equal(inReview.sparkRequest, null);
  const approved = buildMhcBackfillWorkOrder({
    plan, candidate, libraryState: "approved", issuedAt: "2026-08-12T18:00:00.000Z"
  });
  assert.equal(approved.action, "attach_publish");
  assert.equal(approved.sparkRequest, null);
});

test("an empty queue is a stable no-op", () => {
  const first = buildMhcBackfillWorkOrder({
    plan, candidate: null, issuedAt: "2026-08-12T18:00:00.000Z"
  });
  const later = buildMhcBackfillWorkOrder({
    plan, candidate: null, issuedAt: "2026-08-12T19:00:00.000Z"
  });
  assertSchemaValid(first, schema, {label: "Empty Henry backfill order"});
  assert.equal(first.action, "none");
  assert.equal(first.workOrderId, later.workOrderId);
});
