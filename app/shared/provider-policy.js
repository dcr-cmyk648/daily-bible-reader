(function attachProviderPolicy(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DBRProviderPolicy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function providerPolicyFactory() {
  "use strict";

  function policyError(message, code) {
    const error = new Error(message);
    error.code = code || "POLICY_ERROR";
    return error;
  }

  function finiteInteger(value, label) {
    if (!Number.isInteger(value) || value < 0) {
      throw policyError(`${label} must be a non-negative integer.`, "INVALID_POLICY_INPUT");
    }
    return value;
  }

  function timestamp(value) {
    const parsed = typeof value === "number" ? value : Date.parse(value);
    if (!Number.isFinite(parsed)) {
      throw policyError("Cache timestamps must be valid dates.", "INVALID_CACHE_TIMESTAMP");
    }
    return parsed;
  }

  function validatePolicy(policy) {
    if (!policy || typeof policy !== "object") {
      throw policyError("Provider policy is required.", "INVALID_POLICY");
    }
    finiteInteger(policy.maxTotalCachedVerses, "maxTotalCachedVerses");
    finiteInteger(policy.maxCacheAgeSeconds, "maxCacheAgeSeconds");
    if (!(policy.maxBookFraction > 0 && policy.maxBookFraction <= 1)) {
      throw policyError("maxBookFraction must be greater than zero and at most one.", "INVALID_POLICY");
    }
    if (!policy.policyVersion || !policy.verifiedAt) {
      throw policyError("Provider policy version and verification date are required.", "INVALID_POLICY");
    }
    if (policy.apiKeyMayReachClient !== false) {
      throw policyError("The provider policy must prohibit API-key exposure.", "INVALID_POLICY");
    }
    const attribution = policy.requiredAttribution || {};
    if (attribution.label !== "ESV" || !attribution.notice || attribution.linkUrl !== "https://www.esv.org/") {
      throw policyError("The verified ESV attribution configuration is incomplete.", "INVALID_ATTRIBUTION");
    }
    return policy;
  }

  function normalizeEntry(entry) {
    if (!entry || typeof entry !== "object") {
      throw policyError("Cache entry must be an object.", "INVALID_CACHE_ENTRY");
    }
    if (!entry.cacheKey || !entry.bookId) {
      throw policyError("Cache key and book ID are required.", "INVALID_CACHE_ENTRY");
    }
    finiteInteger(entry.verseCount, "verseCount");
    finiteInteger(entry.bookVerseCount, "bookVerseCount");
    if (entry.verseCount < 1 || entry.bookVerseCount < 1) {
      throw policyError("Verse counts must be positive.", "INVALID_CACHE_ENTRY");
    }
    timestamp(entry.fetchedAt);
    return entry;
  }

  function isExpired(entry, policy, nowMs) {
    const ageMs = Math.max(0, nowMs - timestamp(entry.fetchedAt));
    return ageMs >= policy.maxCacheAgeSeconds * 1000;
  }

  function oldestIndex(entries, predicate) {
    let selected = -1;
    let selectedTime = Infinity;
    entries.forEach((entry, index) => {
      if (predicate && !predicate(entry)) return;
      const entryTime = timestamp(entry.fetchedAt);
      if (entryTime < selectedTime) {
        selected = index;
        selectedTime = entryTime;
      }
    });
    return selected;
  }

  function verseTotal(entries) {
    return entries.reduce((sum, entry) => sum + entry.verseCount, 0);
  }

  function bookVerseTotal(entries, bookId) {
    return entries
      .filter((entry) => entry.bookId === bookId)
      .reduce((sum, entry) => sum + entry.verseCount, 0);
  }

  function planCacheWrite(existingEntries, candidateEntry, providerPolicy, nowValue) {
    const policy = validatePolicy(providerPolicy);
    const candidate = normalizeEntry(candidateEntry);
    const nowMs = nowValue === undefined ? Date.now() : timestamp(nowValue);
    const existing = Array.isArray(existingEntries) ? existingEntries.map(normalizeEntry) : [];
    const kept = [];
    const evicted = [];

    for (const entry of existing) {
      if (isExpired(entry, policy, nowMs)) {
        evicted.push({cacheKey: entry.cacheKey, reason: "expired"});
      } else if (entry.cacheKey === candidate.cacheKey) {
        evicted.push({cacheKey: entry.cacheKey, reason: "replaced"});
      } else {
        kept.push(entry);
      }
    }

    if (!policy.offlinePersistenceAllowed) {
      return {accepted: false, reason: "persistence_disabled", entriesToKeep: kept, evicted};
    }
    if (candidate.verseCount > policy.maxTotalCachedVerses) {
      return {accepted: false, reason: "candidate_exceeds_total_limit", entriesToKeep: kept, evicted};
    }

    const perBookLimit = Math.floor(candidate.bookVerseCount * policy.maxBookFraction);
    if (candidate.verseCount > perBookLimit) {
      return {
        accepted: false,
        reason: "candidate_exceeds_book_fraction",
        perBookLimit,
        entriesToKeep: kept,
        evicted
      };
    }

    while (bookVerseTotal(kept, candidate.bookId) + candidate.verseCount > perBookLimit) {
      const index = oldestIndex(kept, (entry) => entry.bookId === candidate.bookId);
      if (index < 0) break;
      const [removed] = kept.splice(index, 1);
      evicted.push({cacheKey: removed.cacheKey, reason: "book_fraction"});
    }

    while (verseTotal(kept) + candidate.verseCount > policy.maxTotalCachedVerses) {
      const index = oldestIndex(kept);
      if (index < 0) break;
      const [removed] = kept.splice(index, 1);
      evicted.push({cacheKey: removed.cacheKey, reason: "total_limit"});
    }

    if (bookVerseTotal(kept, candidate.bookId) + candidate.verseCount > perBookLimit ||
        verseTotal(kept) + candidate.verseCount > policy.maxTotalCachedVerses) {
      return {accepted: false, reason: "limits_unsatisfied", perBookLimit, entriesToKeep: kept, evicted};
    }

    return {
      accepted: true,
      reason: "accepted",
      perBookLimit,
      entriesToKeep: kept,
      evicted,
      entryToWrite: candidate,
      resultingVerseCount: verseTotal(kept) + candidate.verseCount
    };
  }

  function inspectCache(entries, providerPolicy, nowValue) {
    const policy = validatePolicy(providerPolicy);
    const nowMs = nowValue === undefined ? Date.now() : timestamp(nowValue);
    const normalized = (Array.isArray(entries) ? entries : []).map(normalizeEntry);
    const active = normalized.filter((entry) => !isExpired(entry, policy, nowMs));
    const byBook = {};
    active.forEach((entry) => {
      byBook[entry.bookId] = (byBook[entry.bookId] || 0) + entry.verseCount;
    });
    return {
      policyVersion: policy.policyVersion,
      verifiedAt: policy.verifiedAt,
      entryCount: active.length,
      expiredCount: normalized.length - active.length,
      totalVerses: verseTotal(active),
      byBook
    };
  }

  return {
    inspectCache,
    isExpired,
    planCacheWrite,
    validatePolicy
  };
});

