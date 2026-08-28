import {createHash} from "node:crypto";
import {authorizedBridgeSourceDay} from "./bridge-extension.mjs";
import {evaluateContentProtocolFreshness, protocolDescriptorIsValid} from "./daily-study-protocol.mjs";

const REQUIRED_COMPONENTS = Object.freeze([
  "planEntry", "orientation", "scriptureReference", "verseOfTheDayReference", "commentarySummary",
  "practicalTakeaway", "comprehensiveSynthesis", "sourceRegistryAndCoverage", "reviewedMatthewHenryVerseLayerOrVerifiedFullTextLink",
  "commentaryMetadataAndHash", "currentContentProtocolAndHistoricalContextAssessment", "privateManifestPromotion", "driveReadbackVerification"
]);
const GUARDS = Object.freeze({
  maxReadings: 1,
  exactDaysAhead: 7,
  privateContentOnly: true,
  publishAfterPrimaryReview: true,
  requiredReviewStatus: "in_review",
  contentFirstManifestLast: true,
  scriptureTextStored: false,
  runtimeAiAllowed: false,
  commentsReadable: false,
  sparkScope: "matthew_henry_verse_layer_only"
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function addCivilDays(value, days) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function civilDayOffset(from, to) {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function privateReadingReady({entry, metadata, markdownBytes, manifestHasReading, protocol}) {
  if (!entry || !metadata || metadata.readingId !== entry.readingId || !manifestHasReading || !markdownBytes) return false;
  if (!protocolDescriptorIsValid(protocol) || !evaluateContentProtocolFreshness({metadata, markdownBytes, protocol}).current) return false;
  if (!["draft", "reviewed", "published"].includes(metadata.publicationStatus) ||
      !["in_review", "approved"].includes(metadata.generation && metadata.generation.humanReviewStatus)) return false;
  if (metadata.generation.contentHash !== sha256(markdownBytes)) return false;
  const runtimes = Array.isArray(metadata.verseCommentaries)
    ? metadata.verseCommentaries
    : metadata.verseCommentary ? [metadata.verseCommentary] : [];
  const fallback = metadata.henrySourceLink;
  let verifiedFallback = false;
  if (fallback && typeof fallback === "object" && typeof fallback.sourceId === "string" && fallback.sourceId &&
      typeof fallback.title === "string" && fallback.title && typeof fallback.note === "string" && fallback.note) {
    try {
      const url = new URL(String(fallback.url || ""));
      verifiedFallback = url.protocol === "https:" && !url.username && !url.password;
    } catch (_) {}
  }
  if (entry.kind === "chapter" && ((runtimes.length !== entry.passages.length ||
      runtimes.some((runtime) => !["in_review", "approved"].includes(runtime.review_status))) && !verifiedFallback)) return false;
  return true;
}

export function buildRollingStudyWorkOrder({plan, privatePlan = plan, appConfig, referencePlan, metrics, today, issuedAt,
  protocol, readingArtifacts = {}, metadata = null, markdownBytes = null, manifestHasReading = false}) {
  if (!protocolDescriptorIsValid(protocol)) throw new Error("A valid canonical daily-study protocol is required.");
  const firstSourceDay = plan.entries[0].sourcePlanDay;
  const finalSourceDay = plan.entries.at(-1).sourcePlanDay;
  const lookaheadDays = appConfig.futureLookaheadDays;
  const rawCurrentSourceDay = firstSourceDay + Math.max(0, civilDayOffset(appConfig.sharedStartDate, today));
  const sourceDay = Math.min(authorizedBridgeSourceDay({plan, appConfig, today}), finalSourceDay);
  const targetDate = addCivilDays(today, lookaheadDays);
  const currentSourceDay = Math.min(Math.max(firstSourceDay, rawCurrentSourceDay), finalSourceDay);
  if (!privatePlan || privatePlan.planVersion !== plan.planVersion || !Array.isArray(privatePlan.entries) ||
      privatePlan.entries.some((candidate, index) => !plan.entries[index] ||
        candidate.readingId !== plan.entries[index].readingId ||
        candidate.sourcePlanDay !== plan.entries[index].sourcePlanDay)) {
    throw new Error("The private prepared plan must be a contiguous prefix of the complete schedule.");
  }
  const horizonEntries = rawCurrentSourceDay > finalSourceDay ? [] : plan.entries.filter((candidate) =>
    candidate.sourcePlanDay >= currentSourceDay && candidate.sourcePlanDay <= sourceDay);
  // `readingArtifacts` must cover the entire horizon. Missing evidence is
  // deliberately stale: choosing a later entry without inspecting a prefix
  // record could skip a failed or corrupt private publication.
  const legacyTarget = plan.entries.find((candidate) => candidate.sourcePlanDay === sourceDay);
  const artifacts = {...readingArtifacts};
  if (legacyTarget && !Object.hasOwn(artifacts, legacyTarget.readingId) &&
      (metadata !== null || markdownBytes !== null || manifestHasReading)) {
    artifacts[legacyTarget.readingId] = {metadata, markdownBytes, manifestHasReading};
  }
  const entry = horizonEntries.find((candidate) => {
    const artifact = artifacts[candidate.readingId] || {};
    return !privateReadingReady({entry: candidate, protocol, ...artifact});
  });
  // The public/calendar schedule is already complete. This legacy field now
  // records whether the rollback-compatible private prepared-prefix plan must
  // advance before this reading can be promoted into the private manifest.
  const planExtensionRequired = Boolean(entry && !privatePlan.entries.some((candidate) =>
    candidate.readingId === entry.readingId));
  const action = !horizonEntries.length ? "plan_complete" : entry ? "prepare_publish" : "none";
  const reasonCode = !horizonEntries.length ? "reference_plan_complete" : entry
    ? "horizon_content_missing_or_stale" : "horizon_ready";
  return {
    schemaVersion: "rolling-study-work-order/v1",
    workOrderId: `RSWO-${sha256(JSON.stringify({
      plan: plan.planVersion,
      reading: entry ? entry.readingId : legacyTarget && legacyTarget.readingId,
      reasonCode,
      planExtensionRequired
    })).slice(0, 24)}`,
    issuedAt,
    effectiveDate: today,
    targetDate,
    daysAhead: lookaheadDays,
    planVersion: plan.planVersion,
    action,
    reasonCode,
    planExtensionRequired,
    reading: entry ? structuredClone(entry) : action === "none" && legacyTarget ? structuredClone(legacyTarget) : null,
    requiredComponents: REQUIRED_COMPONENTS,
    guards: {...GUARDS, contentProtocolVersion: protocol.protocolVersion}
  };
}
