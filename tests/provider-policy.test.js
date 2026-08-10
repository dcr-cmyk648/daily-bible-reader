const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const provider = require("../app/shared/provider-policy.js");
const policy = JSON.parse(fs.readFileSync(path.join(__dirname, "../config/provider-policies.example.json"), "utf8")).policies[0];
const storagePolicy = {
  ...policy,
  policyVersion: "synthetic-storage-policy-v1",
  maxCacheAgeSeconds: 604800,
  offlinePersistenceAllowed: true,
  refreshBehavior: "network_first"
};
const now = Date.parse("2026-08-08T16:00:00Z");

function entry(cacheKey, bookId, verseCount, bookVerseCount, ageHours = 0) {
  return {
    cacheKey,
    bookId,
    verseCount,
    bookVerseCount,
    fetchedAt: new Date(now - ageHours * 3600000).toISOString(),
    passage: "fabricated test payload"
  };
}

test("verified ESV provider policy is complete", () => {
  assert.equal(provider.validatePolicy(policy), policy);
  assert.equal(policy.maxTotalCachedVerses, 500);
  assert.equal(policy.maxBookFraction, 0.5);
  assert.equal(policy.maxCacheAgeSeconds, 0);
  assert.equal(policy.policyVersion, "esv-api-2026-08-08-v3-network-only");
  assert.equal(policy.offlinePersistenceAllowed, false);
  assert.equal(policy.refreshBehavior, "network_every_open");
  assert.equal(policy.requiredAttribution.label, "ESV");
  assert.equal(policy.apiKeyMayReachClient, false);
});

test("Genesis 1-sized entry is accepted", () => {
  const result = provider.planCacheWrite([], entry("ESV:GEN-001", "GEN", 31, 1533), storagePolicy, now);
  assert.equal(result.accepted, true);
  assert.equal(result.resultingVerseCount, 31);
});

test("a long chapter is accepted when within both limits", () => {
  const result = provider.planCacheWrite([], entry("ESV:LONG-001", "LONG", 176, 1200), storagePolicy, now);
  assert.equal(result.accepted, true);
});

test("a complete short one-chapter book is refused persistent storage", () => {
  const result = provider.planCacheWrite([], entry("ESV:SHORT-001", "SHORT", 25, 25), storagePolicy, now);
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "candidate_exceeds_book_fraction");
  assert.equal(result.perBookLimit, 12);
});

test("candidate over 500 verses is refused", () => {
  const result = provider.planCacheWrite([], entry("ESV:HUGE-001", "HUGE", 501, 2000), storagePolicy, now);
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "candidate_exceeds_total_limit");
});

test("oldest global entry is evicted before total limit is exceeded", () => {
  const existing = [
    entry("old", "A", 300, 1000, 10),
    entry("newer", "B", 190, 1000, 2)
  ];
  const result = provider.planCacheWrite(existing, entry("candidate", "C", 31, 1000), storagePolicy, now);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.evicted, [{cacheKey: "old", reason: "total_limit"}]);
  assert.equal(result.resultingVerseCount, 221);
});

test("same-book entry is evicted before half-book limit is exceeded", () => {
  const result = provider.planCacheWrite(
    [entry("same-book-old", "SMALL", 40, 100, 6), entry("other", "OTHER", 20, 1000, 8)],
    entry("same-book-new", "SMALL", 20, 100),
    storagePolicy,
    now
  );
  assert.equal(result.accepted, true);
  assert.deepEqual(result.evicted, [{cacheKey: "same-book-old", reason: "book_fraction"}]);
});

test("entries older than the seven-day cache window are purged before admission", () => {
  const result = provider.planCacheWrite([entry("expired", "A", 200, 1000, 169)], entry("candidate", "B", 20, 1000), storagePolicy, now);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.evicted, [{cacheKey: "expired", reason: "expired"}]);
});

test("replacement evicts the prior cache key before counting", () => {
  const result = provider.planCacheWrite([entry("same", "GEN", 31, 1533, 2)], entry("same", "GEN", 31, 1533), storagePolicy, now);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.evicted, [{cacheKey: "same", reason: "replaced"}]);
  assert.equal(result.resultingVerseCount, 31);
});

test("policy can disable all offline persistence", () => {
  const result = provider.planCacheWrite([], entry("candidate", "GEN", 31, 1533), {...policy, offlinePersistenceAllowed: false}, now);
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "persistence_disabled");
});

test("cache inspection exposes counts but not passage bodies", () => {
  const result = provider.inspectCache([entry("one", "GEN", 31, 1533)], storagePolicy, now);
  assert.deepEqual(result.byBook, {GEN: 31});
  assert.equal(result.totalVerses, 31);
  assert.equal(JSON.stringify(result).includes("fabricated test payload"), false);
});
