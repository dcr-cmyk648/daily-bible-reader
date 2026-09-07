import {createHash} from "node:crypto";
import {MHC_BACKFILL_COOLDOWN_MS, normalizedAttemptState} from "./mhc-backfill-attempt-state.mjs";

const ACTIONS_BY_LIBRARY_STATE = Object.freeze({
  missing: "generate_review_publish",
  unreviewed: "review_attach_publish",
  in_review: "review_attach_publish",
  approved: "attach_publish"
});

const REASONS_BY_LIBRARY_STATE = Object.freeze({
  missing: "spark_generation_required",
  unreviewed: "generated_artifact_requires_review",
  in_review: "reviewed_artifact_requires_approval",
  approved: "approved_artifact_ready_to_attach"
});

const GUARDS = Object.freeze({
  maxReadings: 1,
  independentHistoricalLane: true,
  publishedFallbackOnly: true,
  sparkModel: "gpt-5.3-codex-spark",
  sparkAvailabilityFallback: "gpt-5.6-luna-low-only",
  solOrOtherModelAllowed: false,
  primaryReviewRequired: true,
  contentFirstManifestLast: true,
  scriptureTextStored: false,
  runtimeAiAllowed: false,
  commentsReadable: false
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function orderedEntries(plan) {
  if (!plan || typeof plan.planVersion !== "string" || !Array.isArray(plan.entries)) {
    throw new Error("A versioned active plan is required.");
  }
  const seen = new Set();
  plan.entries.forEach((entry, index) => {
    if (!entry || entry.planVersion !== plan.planVersion || entry.dayIndex !== index + 1 ||
        typeof entry.readingId !== "string" || !entry.readingId) {
      throw new Error(`Active-plan entry ${index + 1} is invalid or noncontiguous.`);
    }
    if (seen.has(entry.readingId)) throw new Error(`Duplicate reading ID ${entry.readingId}.`);
    seen.add(entry.readingId);
  });
  return plan.entries;
}

export function isVerifiedHenryFallback(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof value.sourceId !== "string" || !value.sourceId ||
      typeof value.title !== "string" || !value.title ||
      typeof value.note !== "string" || !value.note) return false;
  try {
    const url = new URL(String(value.url || ""));
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function metadataFor(metadataByReadingId, readingId) {
  if (metadataByReadingId instanceof Map) return metadataByReadingId.get(readingId) || null;
  return metadataByReadingId && metadataByReadingId[readingId] || null;
}

export function selectMhcBackfillCandidate({plan, metadataByReadingId, manifestReadingIds, attemptState = null, now = new Date(), cooldownMs = MHC_BACKFILL_COOLDOWN_MS}) {
  const entries = orderedEntries(plan);
  const manifest = manifestReadingIds instanceof Set ? manifestReadingIds : new Set(manifestReadingIds || []);
  const state = normalizedAttemptState(attemptState, plan.planVersion);
  const currentMs = new Date(now).getTime();
  if (!Number.isFinite(currentMs) || !Number.isSafeInteger(cooldownMs) || cooldownMs < 0) {
    throw new Error("A valid current time and nonnegative Matthew Henry cooldown are required.");
  }
  const candidates = entries.flatMap((entry) => {
    if (entry.kind !== "chapter" || !manifest.has(entry.readingId)) return [];
    const metadata = metadataFor(metadataByReadingId, entry.readingId);
    if (!metadata || metadata.readingId !== entry.readingId || !isVerifiedHenryFallback(metadata.henrySourceLink)) return [];
    const attempt = state.attempts[entry.readingId] || null;
    const attemptedAtMs = attempt ? Date.parse(attempt.attemptedAt) : null;
    const nextEligibleAt = attemptedAtMs === null ? null : new Date(attemptedAtMs + cooldownMs).toISOString();
    return [{entry, metadata, attempt, attemptedAtMs, nextEligibleAt, coolingDown: attemptedAtMs !== null && currentMs < attemptedAtMs + cooldownMs}];
  });
  const eligible = candidates.filter((candidate) => !candidate.coolingDown)
    .sort((left, right) => (left.attemptedAtMs ?? -Infinity) - (right.attemptedAtMs ?? -Infinity) || left.entry.dayIndex - right.entry.dayIndex);
  const cooling = candidates.filter((candidate) => candidate.coolingDown)
    .sort((left, right) => left.attemptedAtMs - right.attemptedAtMs || left.entry.dayIndex - right.entry.dayIndex);
  const selected = eligible[0] || null;
  return {
    candidate: selected,
    queue: {
      eligibleFallbackCount: candidates.length,
      selectableCount: eligible.length,
      coolingDownCount: cooling.length,
      cooldownSeconds: cooldownMs / 1000,
      selectionPolicy: "least_recent_attempt_then_plan_order",
      nextEligibleAt: cooling[0]?.nextEligibleAt || null
    }
  };
}

function buildEnsureRequest(planVersion, readingId) {
  return {
    schema_version: "mhc-ensure-request/v1",
    request_id: `henry-backfill-${readingId.toLowerCase()}-v1`,
    plan_version: planVersion,
    requested_by: "daily-study-backfill",
    start_reading_id: readingId,
    reading_count: 1,
    worker_model: "gpt-5.3-codex-spark",
    generation_mode: "spark-autonomous-chunked-two-stage/v4",
    only_if_missing: true,
    reason: "Replace the published full-commentary fallback with one reviewed verse-by-verse Matthew Henry layer. The controller tries Spark first and may use only Luna at low reasoning after a coded Spark availability failure."
  };
}

export function buildMhcBackfillWorkOrder({plan, candidate, queue, libraryState = null, issuedAt}) {
  orderedEntries(plan);
  const emptyQueue = queue || {eligibleFallbackCount: 0, selectableCount: 0, coolingDownCount: 0, cooldownSeconds: MHC_BACKFILL_COOLDOWN_MS / 1000, selectionPolicy: "least_recent_attempt_then_plan_order", nextEligibleAt: null};
  if (!candidate) {
    const coolingDown = emptyQueue.eligibleFallbackCount > 0 && emptyQueue.selectableCount === 0;
    return {
      schemaVersion: "mhc-backfill-work-order/v1",
      workOrderId: `MHBWO-${sha256(JSON.stringify({plan: plan.planVersion, reason: coolingDown ? "published_henry_fallbacks_cooling_down" : "no_published_henry_fallbacks"})).slice(0, 24)}`,
      issuedAt,
      planVersion: plan.planVersion,
      action: "none",
      reasonCode: coolingDown ? "published_henry_fallbacks_cooling_down" : "no_published_henry_fallbacks",
      reading: null,
      metadataPath: null,
      manifestEntryPresent: false,
      libraryState: null,
      sparkRequest: null,
      queue: emptyQueue,
      diagnostic: {lane: "henry_backfill", status: coolingDown ? "cooldown" : "empty", priorManifestRemainsLive: true, retryAction: coolingDown ? "wait_for_next_eligible_attempt" : "no_historical_henry_action"},
      guards: GUARDS
    };
  }
  const {entry, metadata} = candidate;
  if (!ACTIONS_BY_LIBRARY_STATE[libraryState]) throw new Error(`Unsupported Henry library state ${libraryState}.`);
  if (!entry || metadata.readingId !== entry.readingId || !isVerifiedHenryFallback(metadata.henrySourceLink)) {
    throw new Error("The Henry backfill candidate is not a valid published fallback reading.");
  }
  const action = ACTIONS_BY_LIBRARY_STATE[libraryState];
  const reasonCode = REASONS_BY_LIBRARY_STATE[libraryState];
  return {
    schemaVersion: "mhc-backfill-work-order/v1",
    workOrderId: `MHBWO-${sha256(JSON.stringify({plan: plan.planVersion, reading: entry.readingId, action})).slice(0, 24)}`,
    issuedAt,
    planVersion: plan.planVersion,
    action,
    reasonCode,
    reading: structuredClone(entry),
    metadataPath: `private-content/bridge/celebration-y3q4/${entry.readingId}.metadata.json`,
    manifestEntryPresent: true,
    libraryState,
    sparkRequest: libraryState === "missing" ? buildEnsureRequest(plan.planVersion, entry.readingId) : null,
    queue: emptyQueue,
    diagnostic: {lane: "henry_backfill", status: "selected", priorManifestRemainsLive: true, retryAction: "process_one_selected_reading", lastAttemptedAt: candidate.attempt?.attemptedAt || null, failedStage: candidate.attempt?.stage || null, failureCode: candidate.attempt?.code || null},
    guards: GUARDS
  };
}
