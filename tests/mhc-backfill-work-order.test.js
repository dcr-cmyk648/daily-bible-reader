import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {assertSchemaValid} from "../scripts/lib/schema-validator.mjs";
import {
  buildMhcBackfillWorkOrder,
  isVerifiedHenryFallback,
  selectMhcBackfillCandidate
} from "../scripts/lib/mhc-backfill-work-order.mjs";
import {emptyMhcBackfillAttemptState, recordMhcBackfillAttempt} from "../scripts/lib/mhc-backfill-attempt-state.mjs";

const schema = JSON.parse(readFileSync(new URL("../schemas/mhc-backfill-work-order.schema.json", import.meta.url), "utf8"));
const attemptSchema = JSON.parse(readFileSync(new URL("../schemas/mhc-backfill-attempt-state.schema.json", import.meta.url), "utf8"));
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

test("the queue selects only valid published fallbacks and rotates least-recent eligible attempts", () => {
  const metadata = new Map([
    ["FAB-001", fallback("FAB-001")],
    ["FAB-002", fallback("FAB-002")]
  ]);
  let selection = selectMhcBackfillCandidate({
    plan,
    metadataByReadingId: metadata,
    manifestReadingIds: ["FAB-002", "FAB-003"], now: "2026-09-07T12:00:00.000Z"
  });
  assert.equal(selection.candidate.entry.readingId, "FAB-002");
  metadata.get("FAB-002").henrySourceLink.url = "javascript:alert(1)";
  selection = selectMhcBackfillCandidate({plan, metadataByReadingId: metadata, manifestReadingIds: ["FAB-002"], now: "2026-09-07T12:00:00.000Z"});
  assert.equal(selection.candidate, null);
  assert.equal(isVerifiedHenryFallback(fallback("FAB-001").henrySourceLink), true);
});

test("a cooldown prevents a repeated failure from starving later Henry debt", () => {
  const metadata = new Map(plan.entries.map((entry) => [entry.readingId, fallback(entry.readingId)]));
  let state = emptyMhcBackfillAttemptState(plan.planVersion);
  state = recordMhcBackfillAttempt(state, {readingId: "FAB-001", attemptedAt: "2026-09-07T12:00:00.000Z", outcome: "model_failure", stage: "generation", code: "SPARK_MODEL_GENERATION_FAILED"});
  assertSchemaValid(state, attemptSchema, {label: "Fabricated private Henry attempt state"});
  const rotated = selectMhcBackfillCandidate({plan, metadataByReadingId: metadata, manifestReadingIds: plan.entries.map((entry) => entry.readingId), attemptState: state, now: "2026-09-07T13:00:00.000Z"});
  assert.equal(rotated.candidate.entry.readingId, "FAB-002");
  assert.equal(rotated.queue.coolingDownCount, 1);
  state = recordMhcBackfillAttempt(state, {readingId: "FAB-002", attemptedAt: "2026-09-07T12:30:00.000Z", outcome: "blocked", stage: "validation", code: "PRIVATE_VALIDATION_FAILED"});
  state = recordMhcBackfillAttempt(state, {readingId: "FAB-003", attemptedAt: "2026-09-07T12:45:00.000Z", outcome: "blocked", stage: "controller", code: "CONTROLLER_PRECHECK_FAILED"});
  const cooling = selectMhcBackfillCandidate({plan, metadataByReadingId: metadata, manifestReadingIds: plan.entries.map((entry) => entry.readingId), attemptState: state, now: "2026-09-07T13:00:00.000Z"});
  assert.equal(cooling.candidate, null);
  assert.equal(cooling.queue.coolingDownCount, 3);
  assert.equal(cooling.queue.nextEligibleAt, "2026-09-08T12:00:00.000Z");
  const order = buildMhcBackfillWorkOrder({plan, candidate: cooling.candidate, queue: cooling.queue, issuedAt: "2026-09-07T13:00:00.000Z"});
  assertSchemaValid(order, schema, {label: "Cooling-down Henry backfill order"});
  assert.equal(order.reasonCode, "published_henry_fallbacks_cooling_down");
  assert.equal(order.diagnostic.retryAction, "wait_for_next_eligible_attempt");
  const empty = buildMhcBackfillWorkOrder({plan, candidate: null, issuedAt: "2026-09-07T13:00:00.000Z"});
  assert.notEqual(order.workOrderId, empty.workOrderId);
});

test("a missing artifact creates one bounded Spark ensure request", () => {
  const selection = selectMhcBackfillCandidate({
    plan,
    metadataByReadingId: {"FAB-001": fallback("FAB-001")},
    manifestReadingIds: ["FAB-001"]
  });
  const order = buildMhcBackfillWorkOrder({
    plan,
    candidate: selection.candidate, queue: selection.queue,
    libraryState: "missing",
    issuedAt: "2026-08-12T18:00:00.000Z"
  });
  assertSchemaValid(order, schema, {label: "Fabricated Henry backfill order"});
  assert.equal(order.action, "generate_review_publish");
  assert.equal(order.reading.readingId, "FAB-001");
  assert.equal(order.sparkRequest.reading_count, 1);
  assert.equal(order.sparkRequest.worker_model, "gpt-5.3-codex-spark");
  assert.equal(order.guards.independentHistoricalLane, true);
  assert.equal(order.guards.sparkAvailabilityFallback, "gpt-5.6-luna-low-only");
  assert.equal(order.guards.solOrOtherModelAllowed, false);
});

test("stored artifacts skip generation and retain review gates", () => {
  const candidate = {entry: plan.entries[0], metadata: fallback("FAB-001"), attempt: null};
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

test("the independent Henry scheduled task uses the strict Spark-to-Luna policy and safe reporting", () => {
  const prompt = readFileSync(new URL("../prompts/henry-backfill-scheduled-task.md", import.meta.url), "utf8");
  assert.match(prompt, /For `generate_review_publish`[\s\S]*one actual Codex child process for exact `gpt-5\.3-codex-spark`[\s\S]*one exact `gpt-5\.6-luna` child at low reasoning/);
  assert.match(prompt, /without `--max-retries`/);
  assert.match(prompt, /On every failure, retain the verified source link and the prior manifest/);
  assert.match(prompt, /never prepares a daily study/);
  assert.match(prompt, /Deterministic request, source, checksum, schema, security, repository, review, validation, or publication failure never switches models/);
  assert.match(prompt, /Never use Sol, Terra, or any other model/);
  assert.doesNotMatch(prompt, /skip this probe entirely/);
  assert.doesNotMatch(prompt, /coded quota\/model-unavailable failure may use/);
  assert.match(prompt, /mhc:backfill:record/);
  assert.match(prompt, /prior manifest remains live/);
  const daily = readFileSync(new URL("../prompts/daily-study-scheduled-task.md", import.meta.url), "utf8");
  assert.doesNotMatch(daily, /mhc:backfill:next/);
  assert.match(daily, /lane=daily_t_plus_7/);
});

test("scheduled commentary instructions preserve the paired historical-context contract", () => {
  const prompt = readFileSync(new URL("../prompts/daily-study-scheduled-task.md", import.meta.url), "utf8");
  const skill = readFileSync(new URL("../.agents/skills/draft-daily-commentary/SKILL.md", import.meta.url), "utf8");
  for (const document of [prompt, skill]) {
    assert.match(document, /### Archaeological and historical context/);
    assert.match(document, /### Archaeological and historical context — expanded study/);
    assert.match(document, /Omit both when they would be filler/);
    assert.match(document, /at least two (?:passage-specific |custom )?H4/);
    assert.match(document, /evidence-versus-inference boundaries/);
    assert.match(document, /inline (?:claim )?citations/);
    assert.match(document, /nearby bibliography/);
    assert.match(document, /never repeat or mechanically stretch the preview/);
  }
  assert.match(skill, /Spark remains limited to the Matthew Henry verse layer/);
});
