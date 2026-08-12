import assert from "node:assert/strict";
import test from "node:test";

import {
  applyScheduleReviewToResults,
  buildScheduleReviewPassages,
  runtimeReviewBasisSha256,
  validateScheduleReviewBindings
} from "../scripts/lib/mhc-review.mjs";

function fixture() {
  const runtime = {
    schema_version: "mhc-runtime/v1",
    review_status: "unreviewed",
    records: {"NAM.1.1": {blurb: "FABRICATED", source_atom_ids: ["atom-1"]}},
    source_atoms: {"atom-1": {text: "FABRICATED SOURCE"}}
  };
  const audit = {
    reading_id: "FABRICATED-DAY",
    plan_version: "fabricated-plan-v1",
    prompt_version: "mhc-autonomous-writer/v5",
    passages: [{book_id: "NAM", chapter: 1, job_id: "NAM-001", fingerprint: "a".repeat(64)}],
    human_review: {status: "required"}
  };
  const passageResults = [{book_id: "NAM", chapter: 1, runtime}];
  const passages = buildScheduleReviewPassages({audit, passageResults});
  const review = {
    reading_id: audit.reading_id,
    plan_version: audit.plan_version,
    prompt_version: audit.prompt_version,
    status: "in_review",
    reviewed_at: "2026-08-12T12:00:00.000Z",
    reviewer: "FABRICATED REVIEWER",
    findings: ["FABRICATED FINDING"],
    corrections: [],
    passages
  };
  return {runtime, audit, passageResults, review};
}

test("review basis ignores only the mutable review status", () => {
  const {runtime} = fixture();
  assert.equal(runtimeReviewBasisSha256(runtime), runtimeReviewBasisSha256({...runtime, review_status: "in_review"}));
  assert.notEqual(runtimeReviewBasisSha256(runtime), runtimeReviewBasisSha256({...runtime, records: {
    ...runtime.records,
    "NAM.1.1": {...runtime.records["NAM.1.1"], blurb: "FABRICATED CHANGED"}
  }}));
});

test("a complete hash-bound review promotes the runtime without mutating generation bytes", () => {
  const state = fixture();
  const promoted = applyScheduleReviewToResults(state);
  assert.equal(state.runtime.review_status, "unreviewed");
  assert.equal(promoted.passageResults[0].runtime.review_status, "in_review");
  assert.equal(promoted.audit.review_status, "in_review");
  assert.equal(promoted.audit.human_review.reviewer, "FABRICATED REVIEWER");
});

test("a hash-bound review can apply an explicit isolated prose correction", () => {
  const state = fixture();
  state.review.corrections = [{
    verse_id: "NAM.1.1",
    replacement_blurb: "FABRICATED corrected reader-facing condensation with adequate length.",
    reason: "FABRICATED grammar correction"
  }];
  const promoted = applyScheduleReviewToResults(state);
  assert.equal(state.runtime.records["NAM.1.1"].blurb, "FABRICATED");
  assert.match(promoted.passageResults[0].runtime.records["NAM.1.1"].blurb, /corrected reader-facing/);
  assert.deepEqual(promoted.audit.human_review.corrected_verse_ids, ["NAM.1.1"]);
  assert.deepEqual(promoted.audit.passages[0].corrected_verse_ids, ["NAM.1.1"]);
});

test("a correction for an unknown verse fails closed", () => {
  const state = fixture();
  state.review.corrections = [{verse_id: "NAM.1.2", replacement_blurb: "FABRICATED replacement", reason: "test"}];
  assert.throws(() => applyScheduleReviewToResults(state), /unknown verses/);
});

test("a stale or reordered review fails closed", () => {
  const state = fixture();
  const stale = structuredClone(state.review);
  stale.passages[0].runtime_basis_sha256 = "b".repeat(64);
  assert.match(validateScheduleReviewBindings({...state, review: stale})[0], /current generated artifact/);
  assert.throws(() => applyScheduleReviewToResults({...state, review: stale}), /stale or mismatched/);
});
