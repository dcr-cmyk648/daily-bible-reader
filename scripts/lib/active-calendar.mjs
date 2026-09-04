import {createHash} from "node:crypto";

export const ACTIVE_PLAN_VERSION = "celebration-y3q4-bridge-2026-v1";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildActiveCalendar({bridge, candidate}) {
  if (!bridge || !candidate || bridge.entries.length !== 39 || candidate.entries.length !== 1224 ||
      candidate.candidateMetadata?.scheduleSha256 !== "79b9dfd88851fdf4e852490cae8ff9e9605af7c3a081309d96a94077a44d0be8") {
    throw new Error("The locked long-term candidate or bridge schedule is invalid.");
  }
  const bridgeEntries = bridge.entries.map((entry) => structuredClone(entry));
  const longTermEntries = candidate.entries.map((entry, index) => ({
    ...structuredClone(entry),
    planVersion: ACTIVE_PLAN_VERSION,
    dayIndex: bridgeEntries.length + index + 1
  }));
  const activeScheduleSha256 = digest(JSON.stringify([...bridgeEntries, ...longTermEntries]));
  const plan = {
    schemaVersion: "plan/v1",
    planVersion: ACTIVE_PLAN_VERSION,
    title: "Celebration bridge and four-stream Protestant canon",
    canonId: candidate.canonId, calendarRevision: activeScheduleSha256,
    entries: [...bridgeEntries, ...longTermEntries],
    bookMetrics: {...candidate.bookMetrics, ...bridge.bookMetrics}
  };
  return {
    plan,
    activation: {
      schemaVersion: "active-calendar-activation/v1",
      activePlanVersion: ACTIVE_PLAN_VERSION,
      bridgeEntryCount: bridgeEntries.length,
      activatedSourcePlanVersion: candidate.planVersion,
      activatedSourceScheduleSha256: candidate.candidateMetadata.scheduleSha256,
      activeScheduleSha256
    }
  };
}

export function extendActivePrefix({privatePlan, activePlan, appConfig, today, lookaheadDays}) {
  const parsedToday = new Date(`${today}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today || "")) || Number.isNaN(parsedToday) || parsedToday.toISOString().slice(0, 10) !== today) throw new Error("today must be YYYY-MM-DD.");
  if (!activePlan || !Array.isArray(activePlan.entries) || !activePlan.entries.length || !privatePlan ||
      !Array.isArray(privatePlan.entries) || privatePlan.planVersion !== activePlan.planVersion) throw new Error("Active and private plan shapes are invalid.");
  if (!Number.isInteger(lookaheadDays) || lookaheadDays < 0 || lookaheadDays > 7) throw new Error("Lookahead must be 0–7 days.");
  const next = activePlan.entries[privatePlan.entries.length];
  if (!next) throw new Error("The active calendar is complete.");
  const startDate = appConfig && appConfig.sharedStartDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || "")) || Number.isNaN(Date.parse(`${startDate}T00:00:00Z`))) throw new Error("A fixed shared start date is required.");
  const currentDay = 1 + Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000));
  if (next.dayIndex > currentDay + lookaheadDays) throw new Error("The next active occurrence exceeds the authorized T+7 horizon.");
  if (privatePlan.entries.some((entry, index) => JSON.stringify(entry) !== JSON.stringify(activePlan.entries[index]))) throw new Error("Private prefix does not exactly match the active calendar.");
  const result = structuredClone(privatePlan);
  result.entries.push(structuredClone(next));
  result.bookMetrics ||= {};
  (next.passages || []).forEach((passage) => { if (!result.bookMetrics[passage.bookId] && activePlan.bookMetrics[passage.bookId]) result.bookMetrics[passage.bookId] = structuredClone(activePlan.bookMetrics[passage.bookId]); });
  return result;
}

export function compactActiveCalendar(plan) {
  return {
    schemaVersion: "compact-plan/v1", planVersion: plan.planVersion, title: plan.title, canonId: plan.canonId, calendarRevision: plan.calendarRevision,
    bookMetrics: plan.bookMetrics,
    entries: plan.entries.map(({planVersion, dayIndex, civilDate, sourcePlanDay, readingId, kind, bookId, chapter, passages, contextReadingIds}) => ({
      planVersion, dayIndex, ...(civilDate ? {civilDate} : {}), ...(sourcePlanDay ? {sourcePlanDay} : {}), readingId, kind, bookId,
      ...(Number.isInteger(chapter) ? {chapter} : {}), ...(passages ? {passages} : {}), ...(contextReadingIds ? {contextReadingIds} : {})
    }))
  };
}
