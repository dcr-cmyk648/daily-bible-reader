import {createHash} from "node:crypto";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DRAFT_STAGES = new Set(["drafted", "ready_for_review", "approved", "published"]);
const LIVE_DRAFT_STATUSES = new Set(["draft", "reviewed", "published"]);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validHash(value) {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function validateCivilDate(value, label = "date") {
  const match = CIVIL_DATE_PATTERN.exec(String(value || ""));
  assert(match, `${label} must use YYYY-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  assert(date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day,
    `${label} must be a real civil date.`);
  return {year, month, day, value: `${match[1]}-${match[2]}-${match[3]}`};
}

function validateTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", {timeZone}).format(new Date(0));
  } catch {
    fail(`Unknown generation timezone ${timeZone}.`);
  }
}

function validateBuffer(buffer, label) {
  assert(isObject(buffer), `${label} buffer is required.`);
  ["targetDays", "warningBelowDays", "criticalBelowDays"].forEach((key) =>
    assert(Number.isInteger(buffer[key]) && buffer[key] > 0, `${label}.${key} must be a positive integer.`)
  );
  assert(buffer.targetDays >= buffer.warningBelowDays,
    `${label}.warningBelowDays cannot exceed targetDays.`);
  assert(buffer.warningBelowDays >= buffer.criticalBelowDays,
    `${label}.criticalBelowDays cannot exceed warningBelowDays.`);
  assert(Array.isArray(buffer.allowedReviewStatuses) && buffer.allowedReviewStatuses.length > 0,
    `${label}.allowedReviewStatuses must not be empty.`);
}

export function validateAutomationPolicy(policy) {
  assert(isObject(policy), "Automation policy is required.");
  assert(policy.schemaVersion === "content-automation-policy/v1", "Unsupported automation policy version.");
  validateTimeZone(policy.generationTimezone);
  assert(policy.generationStrategy === "earliest_gap_only", "Only earliest_gap_only generation is supported.");
  assert(typeof policy.generationEnabled === "boolean", "generationEnabled must be explicit.");
  assert(policy.maxReadingsGeneratedPerRun === 1, "Automation may select at most one reading per run.");
  assert(policy.autoPublish === false, "Initial automation must never auto-publish.");
  assert(policy.requireValidationPassed === true, "Automation must require passed validation.");
  assert(policy.requireMatchingHashes === true, "Automation must require matching content hashes.");
  validateBuffer(policy.draftBuffer, "draftBuffer");
  validateBuffer(policy.publishedBuffer, "publishedBuffer");
  assert(Array.isArray(policy.publishedBuffer.acceptedPublicationStatuses) &&
    policy.publishedBuffer.acceptedPublicationStatuses.length > 0,
  "publishedBuffer.acceptedPublicationStatuses must not be empty.");
  assert(policy.publishedBuffer.allowedReviewStatuses.every((status) => status === "approved"),
    "Published readiness requires explicit approval.");
  return policy;
}

function stableWorkOrderId(planVersion, readingId, reasonCode) {
  const digest = createHash("sha256")
    .update(JSON.stringify({planVersion, readingId, reasonCode, pipelineVersion: "daily-commentary-generation/v1"}))
    .digest("hex");
  return `CWO-${digest.slice(0, 24)}`;
}

export function buildCommentaryWorkOrder(input) {
  assert(isObject(input), "Work-order input is required.");
  const {plan, policy, report} = input;
  validateAutomationPolicy(policy);
  assert(policy.generationEnabled === true,
    "Commentary generation is disabled; status may be inspected but no work order may be issued.");
  const entries = orderedEntries(plan);
  assert(isObject(report) && report.schemaVersion === "content-readiness-report/v1",
    "A validated readiness report is required.");
  assert(report.planVersion === plan.planVersion, "Readiness report planVersion does not match the active plan.");
  assert(report.nextAction && report.nextAction.kind === "generate_or_repair_one",
    "A commentary work order requires a generate_or_repair_one action.");
  const entryIndex = entries.findIndex((entry) => entry.readingId === report.nextAction.readingId);
  assert(entryIndex >= 0, "The requested commentary reading is not in the active plan.");
  const entry = entries[entryIndex];
  const configuredContext = Array.isArray(entry.contextReadingIds) ? [...entry.contextReadingIds] : [];
  configuredContext.forEach((readingId) =>
    assert(entries.some((candidate) => candidate.readingId === readingId),
      `Configured context reading ${readingId} is outside the active plan.`)
  );
  const workOrderId = stableWorkOrderId(plan.planVersion, entry.readingId, report.nextAction.reasonCode);
  return {
    schemaVersion: "commentary-work-order/v1",
    workOrderId,
    issuedAt: report.evaluatedAt,
    effectiveDate: report.effectiveDate,
    planVersion: plan.planVersion,
    actionReasonCode: report.nextAction.reasonCode,
    reading: JSON.parse(JSON.stringify(entry)),
    context: {
      immediatePreviousReadingId: entryIndex > 0 ? entries[entryIndex - 1].readingId : null,
      configuredReadingIds: configuredContext
    },
    pipeline: {
      skillName: "draft-daily-commentary",
      pipelineVersion: "daily-commentary-generation/v1",
      workflowDocuments: [
        "docs/COMMENTARY_WORKFLOW.md",
        "docs/EDITORIAL_STANCE.md",
        "docs/CONTENT_AND_RIGHTS.md",
        "docs/SECURITY.md",
        "docs/MATTHEW_HENRY_PIPELINE.md"
      ],
      foundationalSourceLane: "matthew_henry_when_exact_reviewed_atoms_are_available"
    },
    deliverables: [
      "dailyIntroduction",
      "commentarySummary",
      "verseOfTheDayReference",
      "practicalTakeaway",
      "comprehensiveSynthesis",
      "sourceRegistryUpdates",
      "coverageReport",
      "commentaryMetadata",
      "validationReport"
    ],
    guards: {
      maxReadings: 1,
      privateIgnoredStagingOnly: true,
      autoPublish: false,
      requiredReviewStatus: "unreviewed",
      scriptureTextAllowed: false,
      runtimeAiAllowed: false
    }
  };
}

export function civilDateInTimeZone(dateInput, timeZone) {
  validateTimeZone(timeZone);
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  assert(Number.isFinite(date.getTime()), "Evaluation time must be a valid date-time.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function civilDayNumber(value, label) {
  const {year, month, day} = validateCivilDate(value, label);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

export function resolveAutomationStart(plan, appConfig, options = {}) {
  assert(isObject(plan) && Array.isArray(plan.entries), "Plan entries are required.");
  assert(isObject(appConfig), "Application configuration is required.");
  assert(appConfig.sharedStartDateMode === "fixed", "Scheduled generation requires a fixed shared start date.");
  const timeZone = options.timeZone || appConfig.timezone;
  validateTimeZone(timeZone);
  const effectiveDate = options.today
    ? validateCivilDate(options.today, "today").value
    : civilDateInTimeZone(options.now || new Date(), timeZone);
  const difference = civilDayNumber(effectiveDate, "today") -
    civilDayNumber(appConfig.sharedStartDate, "sharedStartDate");
  const startIndex = Math.min(plan.entries.length, Math.max(0, difference));
  return {
    effectiveDate,
    startIndex,
    remainingDays: Math.max(0, plan.entries.length - startIndex)
  };
}

function orderedEntries(plan) {
  assert(isObject(plan) && typeof plan.planVersion === "string" && Array.isArray(plan.entries),
    "A versioned plan is required.");
  const seen = new Set();
  plan.entries.forEach((entry, index) => {
    assert(isObject(entry) && entry.planVersion === plan.planVersion, `Plan entry ${index + 1} has the wrong planVersion.`);
    assert(entry.dayIndex === index + 1, `Plan day indexes must be contiguous at ${index + 1}.`);
    assert(typeof entry.readingId === "string" && entry.readingId.length > 0, `Plan entry ${index + 1} lacks a readingId.`);
    assert(!seen.has(entry.readingId), `Duplicate plan readingId ${entry.readingId}.`);
    seen.add(entry.readingId);
  });
  return plan.entries;
}

function indexedRecords(records, label) {
  assert(Array.isArray(records), `${label} records must be an array.`);
  const map = new Map();
  records.forEach((record, index) => {
    assert(isObject(record) && typeof record.readingId === "string", `${label} record ${index + 1} lacks a readingId.`);
    assert(!map.has(record.readingId), `${label} contains duplicate readingId ${record.readingId}.`);
    map.set(record.readingId, record);
  });
  return map;
}

function assertIndexMembership(entries, records, label) {
  const planById = new Map(entries.map((entry) => [entry.readingId, entry]));
  records.forEach((record) => {
    const planEntry = planById.get(record.readingId);
    assert(planEntry, `${label} contains readingId ${record.readingId} outside the active plan.`);
    assert(record.dayIndex === planEntry.dayIndex,
      `${label} dayIndex does not match the active plan for ${record.readingId}.`);
  });
}

function assessLiveDraft(entry, record, policy) {
  if (!record) return {ready: false, reason: "live_entry_missing"};
  if (record.dayIndex !== entry.dayIndex) return {ready: false, reason: "live_day_index_mismatch"};
  if (record.publicationStatus === "placeholder") return {ready: false, reason: "live_placeholder"};
  if (!LIVE_DRAFT_STATUSES.has(record.publicationStatus)) return {ready: false, reason: "live_status_not_draft"};
  if (!policy.draftBuffer.allowedReviewStatuses.includes(record.humanReviewStatus)) {
    return {ready: false, reason: record.humanReviewStatus === "changes_requested" ? "changes_requested" : "draft_review_status_not_ready"};
  }
  if (!record.manifestEntryPresent) return {ready: false, reason: "manifest_entry_missing"};
  if (!validHash(record.contentHash) || !validHash(record.manifestContentHash)) {
    return {ready: false, reason: "content_hash_missing"};
  }
  if (record.contentHash !== record.manifestContentHash) return {ready: false, reason: "content_hash_mismatch"};
  if (record.validationStatus !== "passed") return {ready: false, reason: "live_validation_not_passed"};
  return {ready: true, reason: null};
}

function assessPublished(entry, record, policy) {
  if (!record) return {ready: false, reason: "live_entry_missing"};
  if (record.dayIndex !== entry.dayIndex) return {ready: false, reason: "live_day_index_mismatch"};
  if (!record.manifestEntryPresent) return {ready: false, reason: "manifest_entry_missing"};
  if (!policy.publishedBuffer.acceptedPublicationStatuses.includes(record.publicationStatus)) {
    return {ready: false, reason: record.publicationStatus === "placeholder" ? "live_placeholder" : "publication_status_not_ready"};
  }
  if (!policy.publishedBuffer.allowedReviewStatuses.includes(record.humanReviewStatus)) {
    return {ready: false, reason: record.humanReviewStatus === "changes_requested" ? "changes_requested" : "review_not_approved"};
  }
  if (!validHash(record.contentHash) || !validHash(record.manifestContentHash)) {
    return {ready: false, reason: "content_hash_missing"};
  }
  if (record.contentHash !== record.manifestContentHash) return {ready: false, reason: "content_hash_mismatch"};
  if (record.validationStatus !== "passed") return {ready: false, reason: "live_validation_not_passed"};
  return {ready: true, reason: null};
}

function assessStagedDraft(entry, stagingRecord, liveRecord, policy) {
  if (!stagingRecord && !liveRecord) return {ready: false, reason: "staging_entry_missing"};
  if (!stagingRecord) return assessLiveDraft(entry, liveRecord, policy);
  if (stagingRecord.dayIndex !== entry.dayIndex) return {ready: false, reason: "staging_day_index_mismatch"};
  if (stagingRecord.stage === "validation_failed") return {ready: false, reason: "staging_validation_failed"};
  if (stagingRecord.stage === "changes_requested" || stagingRecord.humanReviewStatus === "changes_requested") {
    return {ready: false, reason: "changes_requested"};
  }
  if (!DRAFT_STAGES.has(stagingRecord.stage)) return {ready: false, reason: "staging_not_drafted"};
  if (!policy.draftBuffer.allowedReviewStatuses.includes(stagingRecord.humanReviewStatus)) {
    return {ready: false, reason: "draft_review_status_not_ready"};
  }
  if (!validHash(stagingRecord.contentHash)) return {ready: false, reason: "content_hash_missing"};
  if (!stagingRecord.validation || stagingRecord.validation.status !== "passed") {
    return {ready: false, reason: "staging_validation_not_passed"};
  }
  return {ready: true, reason: null};
}

function horizonState(consecutiveReadyDays, targetDays, buffer) {
  if (targetDays === 0) return "green";
  const warningThreshold = Math.min(targetDays, buffer.warningBelowDays);
  const criticalThreshold = Math.min(warningThreshold, buffer.criticalBelowDays);
  if (consecutiveReadyDays >= warningThreshold) return "green";
  if (consecutiveReadyDays >= criticalThreshold) return "warning";
  return "critical";
}

function evaluateHorizon(entries, startIndex, buffer, assess) {
  const targetDays = Math.min(buffer.targetDays, Math.max(0, entries.length - startIndex));
  let consecutiveReadyDays = 0;
  let nextGapReadingId = null;
  let nextGapReason = null;
  for (let offset = 0; offset < targetDays; offset += 1) {
    const entry = entries[startIndex + offset];
    const result = assess(entry);
    if (!result.ready) {
      nextGapReadingId = entry.readingId;
      nextGapReason = result.reason;
      break;
    }
    consecutiveReadyDays += 1;
  }
  return {
    consecutiveReadyDays,
    targetDays,
    targetMet: consecutiveReadyDays >= targetDays,
    warningBelowDays: Math.min(targetDays, buffer.warningBelowDays),
    criticalBelowDays: Math.min(targetDays, buffer.criticalBelowDays),
    state: horizonState(consecutiveReadyDays, targetDays, buffer),
    readyThroughReadingId: consecutiveReadyDays
      ? entries[startIndex + consecutiveReadyDays - 1].readingId
      : null,
    nextGapReadingId,
    nextGapReason
  };
}

export function evaluateContentAutomation(input, options = {}) {
  assert(isObject(input), "Automation input is required.");
  const {plan, appConfig, policy, stagingIndex, liveIndex} = input;
  validateAutomationPolicy(policy);
  const entries = orderedEntries(plan);
  assert(stagingIndex && stagingIndex.schemaVersion === "content-staging-index/v1", "Unsupported staging index version.");
  assert(liveIndex && liveIndex.schemaVersion === "content-live-index/v1", "Unsupported live index version.");
  assert(stagingIndex.planVersion === plan.planVersion, "Staging index planVersion does not match the active plan.");
  assert(liveIndex.planVersion === plan.planVersion, "Live index planVersion does not match the active plan.");
  assert(policy.generationTimezone === appConfig.timezone,
    "Automation and application timezones must match exactly.");
  assertIndexMembership(entries, stagingIndex.entries, "Staging index");
  assertIndexMembership(entries, liveIndex.readings, "Live index");
  const stagingById = indexedRecords(stagingIndex.entries, "Staging index");
  const liveById = indexedRecords(liveIndex.readings, "Live index");
  const start = resolveAutomationStart(plan, appConfig, {
    today: options.today,
    now: options.now,
    timeZone: policy.generationTimezone
  });
  const draft = evaluateHorizon(entries, start.startIndex, policy.draftBuffer, (entry) =>
    assessStagedDraft(entry, stagingById.get(entry.readingId), liveById.get(entry.readingId), policy)
  );
  const published = evaluateHorizon(entries, start.startIndex, policy.publishedBuffer, (entry) =>
    assessPublished(entry, liveById.get(entry.readingId), policy)
  );
  let nextAction;
  if (start.remainingDays === 0) {
    nextAction = {kind: "plan_complete", readingId: null, reasonCode: "no_remaining_readings"};
  } else if (!draft.targetMet) {
    nextAction = {
      kind: "generate_or_repair_one",
      readingId: draft.nextGapReadingId,
      reasonCode: draft.nextGapReason || "draft_target_not_met"
    };
  } else if (!published.targetMet) {
    nextAction = {
      kind: "review_or_publish_one",
      readingId: published.nextGapReadingId,
      reasonCode: published.nextGapReason || "published_target_not_met"
    };
  } else {
    nextAction = {kind: "none", readingId: null, reasonCode: "buffers_satisfied"};
  }
  const evaluatedAt = options.evaluatedAt
    ? new Date(options.evaluatedAt)
    : options.now instanceof Date
      ? options.now
      : new Date(options.now || Date.now());
  assert(Number.isFinite(evaluatedAt.getTime()), "evaluatedAt must be a valid date-time.");
  return {
    schemaVersion: "content-readiness-report/v1",
    planVersion: plan.planVersion,
    evaluatedAt: evaluatedAt.toISOString(),
    effectiveDate: start.effectiveDate,
    startIndex: start.startIndex,
    remainingDays: start.remainingDays,
    draft,
    published,
    nextAction
  };
}

export const automationInternals = Object.freeze({
  validHash,
  assessLiveDraft,
  assessPublished,
  assessStagedDraft,
  horizonState
});
