export const MHC_BACKFILL_ATTEMPT_STATE_VERSION = "mhc-backfill-attempt-state/v1";
export const MHC_BACKFILL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function validDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function emptyMhcBackfillAttemptState(planVersion) {
  return {schemaVersion: MHC_BACKFILL_ATTEMPT_STATE_VERSION, planVersion, attempts: {}};
}

export function normalizedAttemptState(value, planVersion) {
  if (value === null || value === undefined) return emptyMhcBackfillAttemptState(planVersion);
  if (!value || value.schemaVersion !== MHC_BACKFILL_ATTEMPT_STATE_VERSION ||
      value.planVersion !== planVersion || !value.attempts || typeof value.attempts !== "object" || Array.isArray(value.attempts)) {
    throw new Error("Matthew Henry backfill attempt state is invalid or does not match the active plan.");
  }
  for (const attempt of Object.values(value.attempts)) {
    if (!attempt || !validDate(attempt.attemptedAt)) {
      throw new Error("Matthew Henry backfill attempt state has an invalid attempt timestamp.");
    }
  }
  return value;
}

export function recordMhcBackfillAttempt(state, {readingId, attemptedAt, outcome, stage, code}) {
  if (typeof readingId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(readingId) || !validDate(attemptedAt) ||
      !["published", "model_failure", "blocked"].includes(outcome) ||
      !["generation", "review", "validation", "publication", "controller"].includes(stage) ||
      typeof code !== "string" || !/^[A-Z][A-Z0-9_:-]{2,79}$/.test(code)) {
    throw new Error("Matthew Henry backfill attempt fields are invalid.");
  }
  return {
    ...state,
    attempts: {
      ...state.attempts,
      [readingId]: {attemptedAt, outcome, stage, code, priorManifestRemainsLive: true}
    }
  };
}
