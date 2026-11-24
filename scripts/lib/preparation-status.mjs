import core from "../../app/shared/server-core.js";
import {serviceBufferReport} from "./service-buffer.mjs";

export const PREPARATION_LANES = ["daily", "henry_primary", "henry_recovery", "review"];
const PUBLICATION_LANES = ["daily", "review"];

function latestSuccess(now, ...dates) {
  return dates.filter(date => typeof date === "string" && date.length <= 40 &&
    Number.isFinite(Date.parse(date)) && Date.parse(date) <= Date.parse(now))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

// A heartbeat is staged even for no-op/failed runs. Publication still requires
// a fresh live manifest comparison and exact readback by the existing publisher.
export function preparationStatusCandidate(previous, options = {}) {
  const now = options.now || new Date().toISOString();
  const state = options.state;
  if (!["running", "blocked", "approval_required", "ready"].includes(state) ||
      !Number.isFinite(Date.parse(now))) throw new Error("PREPARATION_STATUS_INVALID");
  const clean = core.preparationServiceStatus({preparationStatus: previous}, {authorId: "dustin"}) || {};
  const value = {...clean, schemaVersion: "preparation-status/v1", state, updatedAt: now};
  for (const field of ["summary", "action"]) {
    const text = options[field] ?? clean[field] ?? "";
    if (typeof text !== "string" || text.length > 240 || /[\u0000-\u001f]/.test(text)) throw new Error("PREPARATION_STATUS_INVALID");
    value[field] = text;
  }
  const receipt = options.heartbeat;
  if (receipt) {
    if (!PREPARATION_LANES.includes(receipt.lane) ||
        !["running", "success", "no_op", "blocked", "error"].includes(receipt.lastOutcome) ||
        (receipt.lastErrorCode && !/^[A-Z][A-Z0-9_]{0,79}$/.test(receipt.lastErrorCode))) {
      throw new Error("PREPARATION_HEARTBEAT_INVALID");
    }
    value.lastRunAt = now;
    const priorLane = clean.lanes && clean.lanes[receipt.lane];
    const preserveNoOpBlock = ["running", "no_op"].includes(receipt.lastOutcome) && priorLane && ["blocked", "error"].includes(priorLane.lastOutcome);
    value.lanes = {...clean.lanes, [receipt.lane]: preserveNoOpBlock ? {...priorLane, lastAttemptAt: now} : {
      lastAttemptAt: now, lastOutcome: receipt.lastOutcome, lastErrorCode: receipt.lastErrorCode || ""
    }};
    if (receipt.buffer) value.buffer = receipt.buffer;
  }
  const unresolvedLanes = Object.values(value.lanes || {}).some(row => ["blocked", "error"].includes(row.lastOutcome));
  const legacyBlock = ["blocked", "approval_required"].includes(clean.state) && !Object.keys(clean.lanes || {}).length;
  if (legacyBlock || clean.blockerRequiresResolution) value.blockerRequiresResolution = !options.resolveBlocker;
  if (["running", "ready"].includes(state) && (unresolvedLanes || value.blockerRequiresResolution)) {
    value.state = clean.state === "approval_required" ? "approval_required" : "blocked";
    value.summary = ["blocked", "approval_required"].includes(clean.state) && clean.summary || "A preparation lane has an unresolved failure.";
    value.action = ["blocked", "approval_required"].includes(clean.state) && clean.action || "";
  }
  const result = core.preparationServiceStatus({preparationStatus: value}, {authorId: "dustin"});
  if (receipt?.buffer && !result.buffer) throw new Error("PREPARATION_BUFFER_INVALID");
  if (state === "ready" && (!result.buffer?.measurementComplete || result.buffer.status !== "ready")) {
    throw new Error("PREPARATION_READY_REQUIRES_COMPLETE_BUFFER");
  }
  const verifiedHealth = receipt?.buffer && result.buffer?.measurementComplete &&
    result.buffer.targetReadings > 0 && result.buffer.devotionalGaps.length === 0;
  const success = receipt && (receipt.lastOutcome === "success" && PUBLICATION_LANES.includes(receipt.lane) ||
    verifiedHealth && ["success", "no_op"].includes(receipt.lastOutcome));
  // Keep recorded lane successes even when the deployed backend omits those
  // nested timestamps from its reader-facing status projection.
  for (const [lane, row] of Object.entries(result.lanes || {})) {
    const lastSuccessAt = latestSuccess(now, previous?.lanes?.[lane]?.lastSuccessAt,
      success && receipt.lane === lane ? now : null);
    if (lastSuccessAt) row.lastSuccessAt = lastSuccessAt;
  }
  const lastSuccessAt = latestSuccess(now, result.lastSuccessAt,
    ...PUBLICATION_LANES.map(lane => result.lanes?.[lane]?.lastSuccessAt), success ? now : null);
  if (lastSuccessAt) result.lastSuccessAt = lastSuccessAt;
  return result;
}

export function preparationStatusAfterPublication(previous, {lane, readingId, named, health, now}) {
  const buffer = serviceBufferReport(health);
  if (!PUBLICATION_LANES.includes(lane) || named?.status !== "ready" || named.readingId !== readingId ||
      (lane === "review" && named.henryLayerStatus !== "complete") || !buffer.measurementComplete) {
    throw new Error("PREPARATION_PUBLICATION_READBACK_REQUIRED");
  }
  return preparationStatusCandidate(previous, {
    state: buffer.status === "ready" ? "ready" : "running", now,
    summary: "Latest publication and current study window verified.", action: "",
    heartbeat: {lane, lastOutcome: "success", lastErrorCode: "", buffer}
  });
}
