import {createHash} from "node:crypto";
import {authorizedBridgeSourceDay} from "./bridge-extension.mjs";

const REQUIRED_COMPONENTS = Object.freeze([
  "planEntry", "orientation", "scriptureReference", "verseOfTheDayReference", "commentarySummary",
  "practicalTakeaway", "comprehensiveSynthesis", "sourceRegistryAndCoverage", "reviewedMatthewHenryVerseLayerOrVerifiedFullTextLink",
  "commentaryMetadataAndHash", "privateManifestPromotion", "driveReadbackVerification"
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

export function privateReadingReady({entry, metadata, markdownBytes, manifestHasReading}) {
  if (!entry || !metadata || metadata.readingId !== entry.readingId || !manifestHasReading || !markdownBytes) return false;
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
  metadata = null, markdownBytes = null, manifestHasReading = false}) {
  const sourceDay = authorizedBridgeSourceDay({plan, appConfig, today});
  const targetDate = addCivilDays(today, 7);
  const entry = plan.entries.find((candidate) => candidate.sourcePlanDay === sourceDay);
  if (!privatePlan || privatePlan.planVersion !== plan.planVersion || !Array.isArray(privatePlan.entries) ||
      privatePlan.entries.some((candidate, index) => !plan.entries[index] ||
        candidate.readingId !== plan.entries[index].readingId ||
        candidate.sourcePlanDay !== plan.entries[index].sourcePlanDay)) {
    throw new Error("The private prepared plan must be a contiguous prefix of the complete schedule.");
  }
  // The public/calendar schedule is already complete. This legacy field now
  // records whether the rollback-compatible private prepared-prefix plan must
  // advance before this reading can be promoted into the private manifest.
  const planExtensionRequired = Boolean(entry && !privatePlan.entries.some((candidate) =>
    candidate.readingId === entry.readingId));
  const ready = entry && privateReadingReady({entry, metadata, markdownBytes, manifestHasReading});
  const action = !entry ? "plan_complete" : ready ? "none" : "prepare_publish";
  const reasonCode = !entry ? "reference_plan_complete" : ready ? "t_plus_7_ready" : "t_plus_7_content_missing_or_stale";
  return {
    schemaVersion: "rolling-study-work-order/v1",
    workOrderId: `RSWO-${sha256(JSON.stringify({
      plan: plan.planVersion,
      reading: entry && entry.readingId,
      reasonCode,
      planExtensionRequired
    })).slice(0, 24)}`,
    issuedAt,
    effectiveDate: today,
    targetDate,
    daysAhead: 7,
    planVersion: plan.planVersion,
    action,
    reasonCode,
    planExtensionRequired,
    reading: entry ? structuredClone(entry) : null,
    requiredComponents: REQUIRED_COMPONENTS,
    guards: GUARDS
  };
}
