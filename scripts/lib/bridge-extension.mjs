const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function civilNumber(value) {
  const match = CIVIL_DATE.exec(String(value || ""));
  if (!match) throw new Error("Civil dates must use YYYY-MM-DD.");
  const number = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(number);
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 ||
      date.getUTCDate() !== Number(match[3])) throw new Error("Civil date is invalid.");
  return Math.floor(number / 86400000);
}

export function authorizedBridgeSourceDay({plan, appConfig, today}) {
  if (!Array.isArray(plan.entries) || !plan.entries.length) throw new Error("Active bridge entries are required.");
  if (appConfig.sharedStartDateMode !== "fixed" || !Number.isInteger(appConfig.futureLookaheadDays)) {
    throw new Error("Rolling bridge extension requires a fixed shared start date and lookahead.");
  }
  const firstSourceDay = plan.entries[0].sourcePlanDay;
  const currentOffset = Math.max(0, civilNumber(today) - civilNumber(appConfig.sharedStartDate));
  return Math.min(92, firstSourceDay + currentOffset + appConfig.futureLookaheadDays);
}

function parseReference(reference, metrics) {
  const match = /^(.*?)\s+(\d+)$/.exec(String(reference || "").trim());
  if (!match) throw new Error(`Unsupported bridge reference ${reference}.`);
  const book = metrics.books[match[1]];
  const chapter = Number(match[2]);
  const verseCount = book && Number(book.chapters[String(chapter)]);
  if (!book || !Number.isInteger(verseCount) || verseCount < 1) {
    throw new Error(`Missing factual chapter metrics for ${reference}.`);
  }
  return {bookId: book.bookId, chapter, verseCount, bookMetrics: book};
}

export function buildBridgeExtension({plan, appConfig, referencePlan, metrics, sourceDay, today}) {
  if (!Number.isInteger(sourceDay) || sourceDay < 1 || sourceDay > 92) throw new Error("sourceDay must be 1–92.");
  const last = plan.entries.at(-1);
  if (sourceDay !== last.sourcePlanDay + 1) {
    throw new Error(`Bridge extension must append exactly source day ${last.sourcePlanDay + 1}.`);
  }
  const authorized = authorizedBridgeSourceDay({plan, appConfig, today});
  if (sourceDay > authorized) {
    throw new Error(`Source day ${sourceDay} exceeds the authorized T+7 horizon ending at source day ${authorized}.`);
  }
  const referenceDay = referencePlan.days.find((candidate) => candidate.day === sourceDay);
  if (!referenceDay || !Array.isArray(referenceDay.references) || !referenceDay.references.length) {
    throw new Error(`Reference plan has no source day ${sourceDay}.`);
  }
  const passages = referenceDay.references.map((reference) => parseReference(reference, metrics));
  const readingId = `CC-Y3Q4-D${String(sourceDay).padStart(3, "0")}`;
  const primary = passages[0];
  const previousSameBook = last.bookId === primary.bookId ? last.readingId : null;
  const entry = {
    planVersion: plan.planVersion,
    dayIndex: last.dayIndex + 1,
    sourcePlanDay: sourceDay,
    readingId,
    kind: "chapter",
    bookId: primary.bookId,
    chapter: primary.chapter,
    passages: passages.map(({bookId, chapter, verseCount}) => ({bookId, chapter, verseCount})),
    ...(previousSameBook ? {contextReadingIds: [previousSameBook]} : {}),
    orderingRationale: `Temporary bridge preserves Day ${sourceDay} of Celebration Church's published Year 3, Quarter 4 sequence.`,
    chronologyBasis: "pragmatic",
    confidence: "high",
    notes: passages.length === 1
      ? "One chapter appears on the Scripture page."
      : `${referenceDay.references.join("; ")} appears as one daily reading, one Scripture page, and one shared discussion.`,
    sourceIds: ["youversion_celebration_y3q4_plan_3805"]
  };
  const nextPlan = structuredClone(plan);
  nextPlan.entries.push(entry);
  passages.forEach(({bookId, bookMetrics}) => {
    nextPlan.bookMetrics[bookId] ||= {
      verseCount: bookMetrics.verseCount,
      chapterCount: bookMetrics.chapterCount,
      versification: "Factual Protestant chapter metrics for bridge policy calculations"
    };
  });
  const nextConfig = structuredClone(appConfig);
  if (!nextConfig.testingReadingIds.includes(readingId)) nextConfig.testingReadingIds.push(readingId);
  return {plan: nextPlan, appConfig: nextConfig, entry, authorizedSourceDay: authorized};
}
