// Service completion is stricter than the independently publishable devotional lane.
export function serviceBufferReport(health) {
  const ids = health.readingIds || [];
  const dailyMissing = new Set([
    ...(health.missingPreparedReadingIds || []),
    ...(health.missingPayloadReadingIds || []),
    ...(health.componentFailures || []).map(row => row.readingId)
  ]);
  const henry = health.currentHorizonHenryLayer;
  const henryMissing = new Set([
    ...(henry?.fallbackReadingIds || []), ...(henry?.unavailableReadingIds || [])
  ]);
  // Missing Henry evidence is unknown, never a full buffer.
  const measured = health.status !== 'error' && Array.isArray(health.readingIds) &&
    health.target === ids.length && henry &&
    ['complete', 'debt', 'unavailable'].includes(henry.status);
  const dailyPrefix = ids.findIndex(id => dailyMissing.has(id));
  const fullPrefix = measured ? ids.findIndex(id => dailyMissing.has(id) || henryMissing.has(id)) : 0;
  const dailyCount = dailyPrefix < 0 ? ids.length : dailyPrefix;
  const completeCount = fullPrefix < 0 ? ids.length : fullPrefix;
  const complete = measured && health.status === 'ready' && henry.status === 'complete' &&
    !dailyMissing.size && !henryMissing.size;
  return {
    schemaVersion: 'service-buffer/v1',
    status: complete ? 'ready' : 'not_ready',
    effectiveDate: health.effectiveDate || null,
    targetReadings: ids.length,
    devotionalConsecutiveReadings: measured ? dailyCount : 0,
    completeConsecutiveReadings: completeCount,
    devotionalFutureDays: measured ? Math.max(0, dailyCount - 1) : 0,
    completeFutureDays: Math.max(0, completeCount - 1),
    firstIncompleteReadingId: ids[completeCount] || null,
    devotionalGaps: ids.filter(id => dailyMissing.has(id)),
    henryGaps: ids.filter(id => henryMissing.has(id)),
    measurementComplete: Boolean(measured),
    // These are queue handoffs, never authority to bypass a failed review or source gate.
    nextDailyReadingId: ids.find(id => dailyMissing.has(id)) || null,
    nextHenryReadingId: ids.find(id => !dailyMissing.has(id) && henryMissing.has(id)) || null
  };
}
