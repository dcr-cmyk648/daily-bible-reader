import {createHash} from "node:crypto";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function runtimeReviewBasisSha256(runtime) {
  const neutral = structuredClone(runtime);
  neutral.review_status = "unreviewed";
  return sha256(Buffer.from(JSON.stringify(neutral)));
}

export function buildScheduleReviewPassages({audit, passageResults}) {
  return passageResults.map((result) => {
    const auditPassage = (audit.passages || []).find((candidate) =>
      candidate.book_id === result.book_id && candidate.chapter === result.chapter);
    if (!auditPassage) {
      throw new Error(`${result.book_id} ${result.chapter} is absent from the schedule audit.`);
    }
    return {
      book_id: result.book_id,
      chapter: result.chapter,
      job_id: auditPassage.job_id,
      fingerprint: auditPassage.fingerprint,
      runtime_basis_sha256: runtimeReviewBasisSha256(result.runtime),
      record_count: Object.keys(result.runtime.records || {}).length,
      source_atom_count: Object.keys(result.runtime.source_atoms || {}).length
    };
  });
}

export function validateScheduleReviewBindings({review, audit, passageResults}) {
  const errors = [];
  if (review.reading_id !== audit.reading_id) errors.push("review reading_id does not match the audit");
  if (review.plan_version !== audit.plan_version) errors.push("review plan_version does not match the audit");
  if (review.prompt_version !== audit.prompt_version) errors.push("review prompt_version does not match the audit");
  const expected = buildScheduleReviewPassages({audit, passageResults});
  if (!Array.isArray(review.passages) || review.passages.length !== expected.length) {
    errors.push("review passage count does not match the exact scheduled reading");
    return errors;
  }
  expected.forEach((passage, index) => {
    const actual = review.passages[index];
    for (const key of Object.keys(passage)) {
      if (!actual || actual[key] !== passage[key]) {
        errors.push(`review passage ${index + 1} ${key} does not match the current generated artifact`);
      }
    }
  });
  return errors;
}

export function applyScheduleReviewToResults({review, audit, passageResults}) {
  const errors = validateScheduleReviewBindings({review, audit, passageResults});
  if (errors.length) throw new Error(`Matthew Henry schedule review is stale or mismatched:\n- ${errors.join("\n- ")}`);
  const correctedVerseIds = [];
  const corrections = new Map();
  for (const correction of review.corrections || []) {
    if (corrections.has(correction.verse_id)) throw new Error(`Duplicate schedule-review correction for ${correction.verse_id}.`);
    corrections.set(correction.verse_id, correction);
  }
  const promotedResults = passageResults.map((result) => {
    const runtime = structuredClone(result.runtime);
    runtime.review_status = review.status;
    for (const [verseId, correction] of corrections) {
      if (!Object.hasOwn(runtime.records || {}, verseId)) continue;
      runtime.records[verseId].blurb = correction.replacement_blurb;
      correctedVerseIds.push(verseId);
      corrections.delete(verseId);
    }
    return {...result, runtime};
  });
  if (corrections.size) {
    throw new Error(`Schedule-review corrections name unknown verses: ${[...corrections.keys()].join(", ")}.`);
  }
  const promotedAudit = {
    ...audit,
    audit_status: review.status,
    review_status: review.status,
    human_review: {
      status: review.status,
      reviewed_at: review.reviewed_at,
      reviewer: review.reviewer,
      findings: [...review.findings],
      corrected_verse_ids: [...correctedVerseIds],
      approval: review.status === "approved" ? "approved" : null
    }
  };
  promotedAudit.passages = (promotedAudit.passages || []).map((passage) => ({
    ...passage,
    review_applied: true,
    corrected_verse_ids: correctedVerseIds.filter((verseId) => verseId.startsWith(`${passage.book_id}.${passage.chapter}.`))
  }));
  return {audit: promotedAudit, passageResults: promotedResults};
}
