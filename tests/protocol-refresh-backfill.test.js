import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {assertSchemaValid} from "../scripts/lib/schema-validator.mjs";
import {evaluateContentProtocolFreshness} from "../scripts/lib/daily-study-protocol.mjs";
import {buildRollingStudyWorkOrder, privateReadingReady} from "../scripts/lib/rolling-study-work-order.mjs";
import {buildProtocolBackfillWorkOrder, selectProtocolBackfillCandidate} from "../scripts/lib/protocol-backfill-work-order.mjs";

const protocol = JSON.parse(readFileSync(new URL("../config/daily-study-protocol.json", import.meta.url), "utf8"));
const schema = JSON.parse(readFileSync(new URL("../schemas/protocol-backfill-work-order.schema.json", import.meta.url), "utf8"));
const plan = {
  planVersion: "fabricated-protocol-plan/v1",
  entries: [1, 2, 3, 4].map((dayIndex) => ({
    planVersion: "fabricated-protocol-plan/v1", dayIndex, sourcePlanDay: 70 + dayIndex,
    readingId: `FAB-${String(dayIndex).padStart(3, "0")}`, kind: "chapter",
    passages: [{bookId: "TST", chapter: dayIndex, verseCount: 10}]
  }))
};
const appConfig = {sharedStartDate: "2026-08-01", sharedStartDateMode: "fixed", futureLookaheadDays: 7};

function reviewedMetadata(readingId, assessment = {status: "not_material", rationale: "No meaningful historical or archaeological evidence is material for this fabricated test reading."}) {
  return {
    readingId, publicationStatus: "draft",
    generation: {humanReviewStatus: "in_review", contentProtocolVersion: protocol.protocolVersion},
    componentAssessments: {historicalContext: assessment},
    verseCommentary: {review_status: "in_review"}
  };
}

function artifact(entry, assessment, markdown = "Fabricated private study for protocol testing.") {
  const markdownBytes = Buffer.from(markdown);
  const metadata = reviewedMetadata(entry.readingId, assessment);
  metadata.generation.contentHash = createHash("sha256").update(markdownBytes).digest("hex");
  return {metadata, markdownBytes, manifestHasReading: true};
}

test("protocol freshness rejects legacy and validates included or honestly not-material context", () => {
  const entry = plan.entries[0];
  const noContext = artifact(entry);
  assert.deepEqual(evaluateContentProtocolFreshness({...noContext, protocol}), {current: true, reasonCode: "current_protocol"});
  assert.equal(privateReadingReady({entry, ...noContext, protocol}), true);

  const legacy = structuredClone(noContext);
  delete legacy.metadata.generation.contentProtocolVersion;
  assert.equal(evaluateContentProtocolFreshness({...legacy, protocol}).reasonCode, "content_protocol_version_missing_or_stale");
  assert.equal(privateReadingReady({entry, ...legacy, protocol}), false);

  const silent = structuredClone(noContext);
  delete silent.metadata.componentAssessments;
  assert.equal(evaluateContentProtocolFreshness({...silent, protocol}).reasonCode, "historical_context_assessment_missing");

  const invalidNotMaterial = structuredClone(noContext);
  invalidNotMaterial.metadata.componentAssessments.historicalContext.rationale = "Too short";
  assert.equal(evaluateContentProtocolFreshness({...invalidNotMaterial, protocol}).reasonCode, "historical_context_not_material_invalid");

  const preview = "A concise context paragraph identifies evidence without overclaiming.{{cite:context_source}}";
  const expandedBody = [
    "#### Evidence from the fabricated setting",
    "This independently written extended discussion supplies enough concrete material to distinguish evidence from inference and explain why the historical setting matters to this fabricated reading.{{cite:context_source}}",
    "#### Limits of inference",
    "The dossier also explains that the fabricated evidence does not establish more than it can bear, retaining a clear boundary between observation and interpretation for this intentionally synthetic test case.{{cite:context_source}}"
  ].join("\n\n");
  const expanded = `${expandedBody} ${"Additional distinct test analysis. ".repeat(26)}`;
  const markdown = `### Archaeological and historical context\n\n${preview}\n\n### Archaeological and historical context — expanded study\n\n${expanded}`;
  const included = artifact(entry, {status: "included"}, markdown);
  assert.deepEqual(evaluateContentProtocolFreshness({...included, protocol}), {current: true, reasonCode: "current_protocol"});
});

test("current horizon selects protocol-stale content before a later gap", () => {
  const activePlan = {...plan, entries: plan.entries.slice(0, 2)};
  const privatePlan = structuredClone(activePlan);
  const first = artifact(activePlan.entries[0]);
  delete first.metadata.componentAssessments;
  const second = artifact(activePlan.entries[1]);
  const order = buildRollingStudyWorkOrder({
    plan: activePlan, privatePlan, appConfig: {...appConfig, sharedStartDate: "2026-08-01", futureLookaheadDays: 7},
    protocol, today: "2026-08-01", issuedAt: "2026-08-01T12:00:00.000Z",
    readingArtifacts: {[activePlan.entries[0].readingId]: first, [activePlan.entries[1].readingId]: second}
  });
  assert.equal(order.action, "prepare_publish");
  assert.equal(order.reading.readingId, activePlan.entries[0].readingId);
  assert.equal(order.guards.contentProtocolVersion, protocol.protocolVersion);
});

test("prior-study protocol backfill waits for the horizon then selects one most-recent manifest-backed stale study", () => {
  const artifacts = Object.fromEntries(plan.entries.map((entry) => [entry.readingId, artifact(entry)]));
  delete artifacts["FAB-003"].metadata.generation.contentProtocolVersion;
  delete artifacts["FAB-002"].metadata.componentAssessments;
  const candidate = selectProtocolBackfillCandidate({
    plan, appConfig, today: "2026-08-05", protocol, artifactsByReadingId: artifacts,
    manifestReadingIds: ["FAB-001", "FAB-002", "FAB-003"]
  });
  assert.equal(candidate.entry.readingId, "FAB-003");
  const deferred = buildProtocolBackfillWorkOrder({
    plan, appConfig, today: "2026-08-05", protocol, horizonReady: false, candidate, issuedAt: "2026-08-05T12:00:00.000Z"
  });
  assertSchemaValid(deferred, schema, {label: "Deferred protocol backfill"});
  assert.equal(deferred.action, "deferred");
  const order = buildProtocolBackfillWorkOrder({
    plan, appConfig, today: "2026-08-05", protocol, horizonReady: true, candidate, issuedAt: "2026-08-05T12:00:00.000Z"
  });
  assertSchemaValid(order, schema, {label: "Protocol refresh backfill"});
  assert.equal(order.action, "refresh_review_publish");
  assert.equal(order.reading.readingId, "FAB-003");
  assert.equal(order.guards.preserveCommentsAndHighlights, true);
  assert.equal(order.guards.preserveNewestReviewedHenry, true);
  assert.equal(order.guards.contentFirstManifestLast, true);
});

test("scheduled workflow makes one Henry-only backfill precede optional protocol refresh", () => {
  const prompt = readFileSync(new URL("../prompts/daily-study-scheduled-task.md", import.meta.url), "utf8");
  const workflow = readFileSync(new URL("../docs/COMMENTARY_WORKFLOW.md", import.meta.url), "utf8");
  assert.match(prompt, /generation\.contentProtocolVersion: daily-study-protocol\/v1/);
  assert.match(prompt, /componentAssessments\.historicalContext/);
  assert.ok(prompt.indexOf("11. Only after the complete current-through-T+7 horizon") <
    prompt.indexOf("12. After that one Henry inspection or attempt"));
  assert.match(workflow, /most-recent-first/);
  assert.match(workflow, /metadata-only bump/);
});
