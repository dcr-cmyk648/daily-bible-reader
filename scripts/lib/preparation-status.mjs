import core from "../../app/shared/server-core.js";

export const PREPARATION_LANES = ["daily", "henry_primary", "henry_recovery", "review"];

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
    if (["success", "no_op"].includes(receipt.lastOutcome)) value.lastSuccessAt = now;
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
  return result;
}
