import {createHash} from "node:crypto";
import {evaluateContentProtocolFreshness, protocolDescriptorIsValid} from "./daily-study-protocol.mjs";

const GUARDS = Object.freeze({
  maxReadings: 1,
  horizonPreparationFirst: true,
  alreadyReadOnly: true,
  manifestBackedOnly: true,
  stableReadingIdRequired: true,
  preserveCommentsAndHighlights: true,
  scriptureTextStored: false,
  primaryReviewRequired: true,
  preservePriorVersions: true,
  preserveNewestReviewedHenry: true,
  contentFirstManifestLast: true,
  runtimeAiAllowed: false,
  commentsReadable: false,
  sparkScope: "matthew_henry_verse_layer_only"
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function civilDayOffset(from, to) {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function orderedEntries(plan) {
  if (!plan || typeof plan.planVersion !== "string" || !Array.isArray(plan.entries)) {
    throw new Error("A versioned active plan is required.");
  }
  const seen = new Set();
  plan.entries.forEach((entry, index) => {
    if (!entry || entry.planVersion !== plan.planVersion || entry.dayIndex !== index + 1 ||
        typeof entry.readingId !== "string" || !entry.readingId || seen.has(entry.readingId)) {
      throw new Error(`Active-plan entry ${index + 1} is invalid or noncontiguous.`);
    }
    seen.add(entry.readingId);
  });
  return plan.entries;
}

function artifactFor(artifactsByReadingId, readingId) {
  return artifactsByReadingId instanceof Map
    ? artifactsByReadingId.get(readingId) || null
    : artifactsByReadingId && artifactsByReadingId[readingId] || null;
}

export function selectProtocolBackfillCandidate({plan, appConfig, today, protocol, artifactsByReadingId, manifestReadingIds}) {
  if (!protocolDescriptorIsValid(protocol)) throw new Error("A valid canonical daily-study protocol is required.");
  if (!appConfig || typeof appConfig.sharedStartDate !== "string") throw new Error("A shared start date is required.");
  const entries = orderedEntries(plan);
  const manifest = manifestReadingIds instanceof Set ? manifestReadingIds : new Set(manifestReadingIds || []);
  const currentSourceDay = entries[0].sourcePlanDay + Math.max(0, civilDayOffset(appConfig.sharedStartDate, today));
  for (const entry of [...entries].reverse()) {
    if (!manifest.has(entry.readingId) || entry.sourcePlanDay >= currentSourceDay) continue;
    const artifact = artifactFor(artifactsByReadingId, entry.readingId);
    if (!artifact || !artifact.metadata || !artifact.markdownBytes || artifact.metadata.readingId !== entry.readingId) continue;
    const freshness = evaluateContentProtocolFreshness({
      metadata: artifact.metadata,
      markdownBytes: artifact.markdownBytes,
      protocol
    });
    if (!freshness.current) return {entry, artifact, freshness};
  }
  return null;
}

export function buildProtocolBackfillWorkOrder({plan, appConfig, today, protocol, horizonReady, candidate, issuedAt}) {
  orderedEntries(plan);
  if (!protocolDescriptorIsValid(protocol)) throw new Error("A valid canonical daily-study protocol is required.");
  if (!horizonReady) {
    return {
      schemaVersion: "protocol-backfill-work-order/v1",
      workOrderId: `PBWO-${sha256(JSON.stringify({plan: plan.planVersion, reason: "horizon_not_ready"})).slice(0, 24)}`,
      issuedAt, planVersion: plan.planVersion, protocolVersion: protocol.protocolVersion,
      action: "deferred", reasonCode: "horizon_not_ready", reading: null, metadataPath: null, manifestEntryPresent: false,
      guards: GUARDS
    };
  }
  if (!candidate) {
    return {
      schemaVersion: "protocol-backfill-work-order/v1",
      workOrderId: `PBWO-${sha256(JSON.stringify({plan: plan.planVersion, reason: "no_stale_prior_studies"})).slice(0, 24)}`,
      issuedAt, planVersion: plan.planVersion, protocolVersion: protocol.protocolVersion,
      action: "none", reasonCode: "no_stale_prior_studies", reading: null, metadataPath: null, manifestEntryPresent: false,
      guards: GUARDS
    };
  }
  const {entry, freshness} = candidate;
  return {
    schemaVersion: "protocol-backfill-work-order/v1",
    workOrderId: `PBWO-${sha256(JSON.stringify({plan: plan.planVersion, reading: entry.readingId, reason: freshness.reasonCode})).slice(0, 24)}`,
    issuedAt, planVersion: plan.planVersion, protocolVersion: protocol.protocolVersion,
    action: "refresh_review_publish", reasonCode: freshness.reasonCode,
    reading: structuredClone(entry),
    metadataPath: `private-content/bridge/celebration-y3q4/${entry.readingId}.metadata.json`,
    manifestEntryPresent: true,
    guards: GUARDS
  };
}
