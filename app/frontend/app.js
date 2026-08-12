(function attachDailyBibleReader(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyBibleReader = api;
  if (root.document) {
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      if (root.DBRBoot && typeof root.DBRBoot.coreStarted === "function") root.DBRBoot.coreStarted();
      api.init().catch(api.handleFatalError);
    };
    // The script is the final body asset, so the application DOM already exists even
    // while WebKit still reports readyState="loading". Start now; the event listener is
    // only a fallback for tests or an unexpectedly moved script tag.
    if (root.document.getElementById("appMain")) start();
    else if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, {once: true});
    else start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function dailyBibleReaderFactory(root) {
  "use strict";

  const DAY_MS = 86400000;
  const CLIENT_BUILD_ID = "__DBR_BUILD_ID__";
  const CLIENT_DELIVERY_MODE = "__DBR_DELIVERY_MODE__";
  const DB_NAME = "dailyBibleReaderPilot";
  const DB_VERSION = 4;
  const BOOTSTRAP_CACHE_KEY = "__app-bootstrap__";
  const BOOTSTRAP_CACHE_SCHEMA = "bootstrap-cache/v1";
  const HOT_READING_COUNT = 2;
  const READING_PREPARATION_SCHEMA = "reading-preparation/v1";
  const STARTUP_TIMING_SCHEMA = "startup-timing/v1";
  const STARTUP_MILESTONE_ORDER = [
    "shellVisible",
    "applicationCodeLoaded",
    "cachedCalendarVisible",
    "calendarVisible",
    "authorizationConfirmed",
    "freshDataSynchronized",
    "scriptureVisible"
  ];
  const STORE_DEFINITIONS = {
    calendarCompletion: "readingId",
    scriptureCache: "cacheKey",
    privateContent: "readingId",
    commentOutbox: "clientRequestId",
    commentDrafts: "draftKey",
    commentSnapshot: "commentId",
    commentEvents: "eventId",
    deviceCredentials: "credentialId"
  };
  const BOOK_NAMES = {
    GEN: "Genesis",
    "1PE": "1 Peter",
    "2PE": "2 Peter",
    HAB: "Habakkuk",
    MIC: "Micah",
    NAM: "Nahum",
    PRO: "Proverbs",
    ZEP: "Zephaniah"
  };
  const FALLBACK_ESV_NOTICE = "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated into any other language.\n\nUsers may not copy or download more than 500 verses of the ESV Bible or more than one half of any book of the ESV Bible.";

  const state = {
    adapter: null,
    authorizationPromise: null,
    serverAccessConfirmed: false,
    bootstrap: null,
    calendarMonthDate: null,
    calendarParticipants: [],
    calendarSyncPromise: null,
    calendarWindow: null,
    comments: [],
    completionByReadingId: new Map(),
    completedReadingIds: new Set(),
    config: null,
    currentEntry: null,
    currentPage: 0,
    policy: null,
    plan: null,
    prefetchScheduled: false,
    priorityPrefetchPromise: null,
    privatePayloadByReadingId: new Map(),
    privatePayloadRequestByReadingId: new Map(),
    readerCode: "",
    readerCodeSubmitting: false,
    schedule: null,
    selectedCalendarDate: null,
    session: null,
    store: null,
    sources: [],
    commentSyncToken: 0,
    scriptureRequestToken: 0,
    scriptureMemoryEpoch: 0,
    scriptureMemoryByReadingId: new Map(),
    scriptureRequestByReadingId: new Map(),
    selectedVerseRequestToken: 0,
    currentScripture: null,
    currentVerseCommentary: null,
    currentHenrySourceLink: null,
    highlightEnhancer: null,
    verseOfTheDay: null,
    uiWired: false,
    view: "home"
  };

  function startupNow() {
    return root.performance && typeof root.performance.now === "function"
      ? Math.max(0, Math.round(root.performance.now()))
      : null;
  }

  function startupMetricsRecord() {
    const existing = root.DBRStartupMetrics;
    if (existing && existing.schemaVersion === STARTUP_TIMING_SCHEMA &&
        existing.milestones && typeof existing.milestones === "object") return existing;
    const created = {schemaVersion: STARTUP_TIMING_SCHEMA, milestones: {}};
    root.DBRStartupMetrics = created;
    return created;
  }

  function markStartupMilestone(name) {
    if (!STARTUP_MILESTONE_ORDER.includes(name)) return;
    const record = startupMetricsRecord();
    if (Number.isFinite(record.milestones[name])) return;
    const elapsed = startupNow();
    if (elapsed !== null) record.milestones[name] = elapsed;
  }

  function startupTimingSnapshot(input) {
    const source = input && input.milestones ? input : startupMetricsRecord();
    const elapsedMs = {};
    STARTUP_MILESTONE_ORDER.forEach((name) => {
      const value = source.milestones && source.milestones[name];
      if (Number.isFinite(value) && value >= 0) elapsedMs[name] = Math.round(value);
    });
    const phaseDurationsMs = {};
    const phases = [
      ["shellToApplicationCode", "shellVisible", "applicationCodeLoaded"],
      ["shellToCachedCalendar", "shellVisible", "cachedCalendarVisible"],
      ["shellToCalendar", "shellVisible", "calendarVisible"],
      ["calendarToAuthorization", elapsedMs.cachedCalendarVisible === undefined ? "calendarVisible" : "cachedCalendarVisible", "authorizationConfirmed"],
      ["authorizationToCalendar", "authorizationConfirmed", "calendarVisible"],
      ["authorizationToFreshSync", "authorizationConfirmed", "freshDataSynchronized"],
      ["authorizationToScripture", "authorizationConfirmed", "scriptureVisible"]
    ];
    phases.forEach(([label, start, end]) => {
      if (Number.isFinite(elapsedMs[start]) && Number.isFinite(elapsedMs[end]) && elapsedMs[end] >= elapsedMs[start]) {
        phaseDurationsMs[label] = elapsedMs[end] - elapsedMs[start];
      }
    });
    return {
      schemaVersion: STARTUP_TIMING_SCHEMA,
      sessionOnly: true,
      elapsedMs,
      phaseDurationsMs
    };
  }

  markStartupMilestone("applicationCodeLoaded");

  function appError(message, code) {
    const error = new Error(message);
    error.code = code || "APP_ERROR";
    return error;
  }

  function element(id) {
    return root.document ? root.document.getElementById(id) : null;
  }

  function datePartsInTimeZone(dateInput, timeZone) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(date.getTime())) throw appError("Current date is invalid.", "INVALID_DATE");
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const values = {};
    parts.forEach((part) => {
      if (["year", "month", "day"].includes(part.type)) values[part.type] = Number(part.value);
    });
    if (!values.year || !values.month || !values.day) {
      throw appError("Could not calculate a calendar date in the configured timezone.", "INVALID_TIMEZONE");
    }
    return values;
  }

  function parseDateOnly(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) throw appError("Shared start date must use YYYY-MM-DD.", "INVALID_START_DATE");
    const parts = {year: Number(match[1]), month: Number(match[2]), day: Number(match[3])};
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    if (date.getUTCFullYear() !== parts.year || date.getUTCMonth() + 1 !== parts.month || date.getUTCDate() !== parts.day) {
      throw appError("Shared start date is not a real calendar date.", "INVALID_START_DATE");
    }
    return parts;
  }

  function civilDayNumber(parts) {
    return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
  }

  function dateOnlyForDay(startDate, zeroBasedOffset) {
    const start = parseDateOnly(startDate);
    const date = new Date(Date.UTC(start.year, start.month - 1, start.day + zeroBasedOffset));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  function dateOnlyFromParts(parts) {
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  }

  function validatePlan(plan) {
    if (!plan || !Array.isArray(plan.entries) || !plan.entries.length) {
      throw appError("The active reading plan is unavailable.", "INVALID_PLAN");
    }
    const ids = new Set();
    let expectedDay = 1;
    plan.entries.forEach((entry) => {
      if (!entry || entry.planVersion !== plan.planVersion || entry.dayIndex !== expectedDay || ids.has(entry.readingId)) {
        throw appError("The active reading plan has invalid order or duplicate IDs.", "INVALID_PLAN");
      }
      ids.add(entry.readingId);
      expectedDay += 1;
    });
    if (root.DBRServerCore && typeof root.DBRServerCore.validatePlanStructure === "function") {
      try {
        root.DBRServerCore.validatePlanStructure(plan);
      } catch (error) {
        throw appError(error && error.message || "The active reading plan is invalid.", "INVALID_PLAN");
      }
    }
    return plan;
  }

  function calculateSchedule(planInput, config, nowInput, requestedReadingId, options) {
    const plan = validatePlan(planInput);
    const now = nowInput instanceof Date ? nowInput : new Date(nowInput === undefined ? Date.now() : nowInput);
    const today = datePartsInTimeZone(now, config.timezone);
    const effectiveStartDate = config.sharedStartDateMode === "testing_today"
      ? dateOnlyFromParts(today)
      : config.sharedStartDate;
    const start = parseDateOnly(effectiveStartDate);
    const calendarDayIndex = civilDayNumber(today) - civilDayNumber(start) + 1;
    const futureLookaheadDays = Number.isInteger(config.futureLookaheadDays)
      ? Math.max(0, config.futureLookaheadDays)
      : 0;
    const lastUnlockedDayIndex = calendarDayIndex + futureLookaheadDays;
    const entries = plan.entries;
    const calendarSelection = calendarDayIndex < 1
      ? entries[0]
      : calendarDayIndex > entries.length
        ? entries[entries.length - 1]
        : entries[calendarDayIndex - 1];
    const requested = entries.find((entry) => entry.readingId === requestedReadingId) || null;
    const testingOverride = Boolean(
      options && options.testingOverride && config.testingOverrideEnabled && requested &&
      Array.isArray(config.testingReadingIds) && config.testingReadingIds.includes(requested.readingId)
    );
    const requestedIsFuture = requested ? requested.dayIndex > calendarDayIndex : false;
    const requestedBeyondLookahead = requested ? requested.dayIndex > lastUnlockedDayIndex : false;
    const requestedIsPast = requested ? requested.dayIndex < calendarDayIndex : false;
    const requestedAccessible = Boolean(requested) && (
      testingOverride ||
      (!requestedBeyondLookahead || !config.futureReadingsLocked) &&
      (!requestedIsPast || config.pastReadingsAvailable)
    );
    const selectedEntry = requestedAccessible ? requested : calendarSelection;
    const selectedIndex = entries.indexOf(selectedEntry);
    const selectedIsFuture = selectedEntry.dayIndex > calendarDayIndex;
    const selectedIsPast = selectedEntry.dayIndex < calendarDayIndex;
    const locked = !testingOverride && selectedEntry.dayIndex > lastUnlockedDayIndex && Boolean(config.futureReadingsLocked);

    function navigationAccessible(candidate) {
      if (!candidate) return false;
      if (testingOverride || (config.testingOverrideEnabled && options && options.testingOverride)) return true;
      if (candidate.dayIndex > lastUnlockedDayIndex && config.futureReadingsLocked) return false;
      if (candidate.dayIndex < calendarDayIndex && !config.pastReadingsAvailable) return false;
      return true;
    }

    return {
      calendarDayIndex,
      effectiveStartDate,
      futureLookaheadDays,
      selectedEntry,
      selectedIsFuture,
      selectedIsPast,
      locked,
      usingTestingOverride: testingOverride,
      status: calendarDayIndex < 1 ? "before_start" : calendarDayIndex > entries.length ? "pilot_complete" : "active",
      readingDate: dateOnlyForDay(effectiveStartDate, selectedEntry.dayIndex - 1),
      previousEntry: navigationAccessible(entries[selectedIndex - 1]) ? entries[selectedIndex - 1] : null,
      nextEntry: navigationAccessible(entries[selectedIndex + 1]) ? entries[selectedIndex + 1] : null
    };
  }

  function priorityReadingEntries(planInput, scheduleInput, limitInput) {
    const entries = planInput && Array.isArray(planInput.entries) ? planInput.entries : [];
    const limit = Math.max(0, Math.min(HOT_READING_COUNT, Number.isInteger(limitInput) ? limitInput : HOT_READING_COUNT));
    if (!entries.length || !scheduleInput || scheduleInput.status === "pilot_complete" || !limit) return [];
    const calendarDayIndex = Number(scheduleInput.calendarDayIndex);
    const startIndex = Number.isInteger(calendarDayIndex) && calendarDayIndex > 0
      ? Math.min(entries.length, calendarDayIndex - 1)
      : 0;
    return entries.slice(startIndex, startIndex + limit);
  }

  function shortTitleForEntry(entry) {
    if (!entry) return "No reading";
    return titleForEntry(entry);
  }

  function buildMonthCalendar(planInput, config, nowInput, completedReadingIds, monthDateInput) {
    const plan = validatePlan(planInput);
    const now = nowInput instanceof Date ? nowInput : new Date(nowInput === undefined ? Date.now() : nowInput);
    const todayParts = datePartsInTimeZone(now, config.timezone);
    const todayDate = dateOnlyFromParts(todayParts);
    const requestedMonth = monthDateInput ? parseDateOnly(monthDateInput) : todayParts;
    const monthStart = `${requestedMonth.year}-${String(requestedMonth.month).padStart(2, "0")}-01`;
    const monthStartParts = parseDateOnly(monthStart);
    const monthStartWeekday = new Date(Date.UTC(monthStartParts.year, monthStartParts.month - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(monthStartParts.year, monthStartParts.month, 0)).getUTCDate();
    const cellCount = Math.ceil((monthStartWeekday + daysInMonth) / 7) * 7;
    const windowStart = dateOnlyForDay(monthStart, -monthStartWeekday);
    const effectiveStartDate = config.sharedStartDateMode === "testing_today" ? todayDate : config.sharedStartDate;
    const start = parseDateOnly(effectiveStartDate);
    const todayNumber = civilDayNumber(todayParts);
    const calendarDayIndex = todayNumber - civilDayNumber(start) + 1;
    const lookahead = Number.isInteger(config.futureLookaheadDays) ? Math.max(0, config.futureLookaheadDays) : 0;
    const lastUnlockedDayIndex = calendarDayIndex + lookahead;
    const completed = completedReadingIds instanceof Set
      ? completedReadingIds
      : new Set(Array.isArray(completedReadingIds) ? completedReadingIds : []);

    const days = Array.from({length: cellCount}, (_, offset) => {
      const date = dateOnlyForDay(windowStart, offset);
      const parts = parseDateOnly(date);
      const dayNumber = civilDayNumber(parts);
      const dayIndex = dayNumber - civilDayNumber(start) + 1;
      const entry = dayIndex >= 1 && dayIndex <= plan.entries.length ? plan.entries[dayIndex - 1] : null;
      const isPast = dayNumber < todayNumber;
      const isToday = dayNumber === todayNumber;
      const isFuture = dayNumber > todayNumber;
      const beyondLookahead = entry && entry.dayIndex > lastUnlockedDayIndex;
      const accessible = Boolean(entry) &&
        (!isPast || Boolean(config.pastReadingsAvailable)) &&
        (!beyondLookahead || !config.futureReadingsLocked);
      const complete = Boolean(entry && completed.has(entry.readingId));
      let status = "none";
      if (entry && !accessible) status = "locked";
      else if (complete) status = "complete";
      else if (entry && isToday) status = "today";
      else if (entry && isPast) status = "missed";
      else if (entry) status = "available";
      return {
        date,
        dayIndex,
        entry,
        shortTitle: shortTitleForEntry(entry),
        accessible,
        complete,
        isPast,
        isToday,
        isFuture,
        inCurrentMonth: parts.year === monthStartParts.year && parts.month === monthStartParts.month,
        status
      };
    });

    return {
      calendarDayIndex,
      effectiveStartDate,
      monthStart,
      todayDate,
      windowStart,
      windowEnd: days[days.length - 1].date,
      days,
      weeks: Array.from({length: cellCount / 7}, (_, index) => days.slice(index * 7, index * 7 + 7))
    };
  }

  function readingHasActiveComment(comments, outboxItems, authorId, readingId) {
    if (!authorId || !readingId) return false;
    const pending = compactOutbox(outboxItems || []).filter((item) => item.readingId === readingId);
    const pendingDeletes = new Set(pending.filter((item) => item.eventType === "delete").map((item) => item.commentId));
    const activeServerComment = (comments || []).some((comment) =>
      comment && comment.readingId === readingId && comment.authorId === authorId && !comment.deletedAt &&
      !pendingDeletes.has(comment.commentId)
    );
    const pendingCreate = pending.some((item) => item.eventType === "create");
    return activeServerComment || pendingCreate;
  }

  function titleForEntry(entry) {
    if (!entry) return "Reading unavailable";
    const bookName = BOOK_NAMES[entry.bookId] || entry.bookId;
    if (entry.kind === "book_intro") return `${bookName}: Book Introduction`;
    const passages = Array.isArray(entry.passages) && entry.passages.length
      ? entry.passages
      : [{bookId: entry.bookId, chapter: entry.chapter}];
    if (passages.length === 1 && Number.isInteger(passages[0].verseStart)) {
      const passage = passages[0];
      return entry.unitLabel || `${BOOK_NAMES[passage.bookId] || passage.bookId} ${passage.chapter}:${passage.verseStart}–${passage.verseEnd}`;
    }
    const sameBook = passages.every((passage) => passage.bookId === passages[0].bookId && !Number.isInteger(passage.verseStart));
    const sequential = passages.every((passage, index) => index === 0 || passage.chapter === passages[index - 1].chapter + 1);
    if (sameBook && sequential) {
      const first = passages[0].chapter;
      const last = passages[passages.length - 1].chapter;
      return `${BOOK_NAMES[passages[0].bookId] || passages[0].bookId} ${first}${last === first ? "" : `–${last}`}`;
    }
    return passages.map((passage) => `${BOOK_NAMES[passage.bookId] || passage.bookId} ${passage.chapter}`).join("; ");
  }

  function formatReadingDate(dateOnly) {
    const parts = parseDateOnly(dateOnly);
    return new Intl.DateTimeFormat(undefined, {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)));
  }

  function createRequestId(prefix) {
    const random = root.crypto && typeof root.crypto.randomUUID === "function"
      ? root.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
    return `${prefix || "request"}:${random}`;
  }

  function readerCodeLooksReady(value) {
    const normalized = String(value || "").trim();
    return normalized.length >= 12 && normalized.length <= 128 && !/[\u0000-\u001F\u007F]/.test(normalized);
  }

  async function requestPersistentStorage() {
    try {
      if (!root.navigator || !root.navigator.storage || typeof root.navigator.storage.persist !== "function") return null;
      if (typeof root.navigator.storage.persisted === "function" && await root.navigator.storage.persisted()) return true;
      return Boolean(await root.navigator.storage.persist());
    } catch {
      return null;
    }
  }

  function compactOutbox(items) {
    const ordered = (Array.isArray(items) ? items : []).slice().sort((a, b) =>
      String(a.queuedAt || "").localeCompare(String(b.queuedAt || ""))
    );
    const result = [];
    const pendingCreateByTempId = new Map();
    ordered.forEach((item) => {
      if (item.eventType === "create" && item.localTempId) {
        pendingCreateByTempId.set(item.localTempId, item);
        result.push(item);
        return;
      }
      if (item.localTempId && pendingCreateByTempId.has(item.localTempId)) {
        const create = pendingCreateByTempId.get(item.localTempId);
        if (item.eventType === "edit") create.body = item.body;
        if (item.eventType === "delete") {
          const index = result.indexOf(create);
          if (index >= 0) result.splice(index, 1);
          pendingCreateByTempId.delete(item.localTempId);
        }
        return;
      }
      result.push(item);
    });
    return result;
  }

  function splitNumberedVerses(passageText) {
    const text = String(passageText || "");
    const marker = /\[(\d+)\]\s*/g;
    const matches = Array.from(text.matchAll(marker));
    if (!matches.length) return [];
    return matches.map((match, index) => ({
      verse: Number(match[1]),
      text: text.slice(match.index + match[0].length, matches[index + 1] ? matches[index + 1].index : text.length).trim()
    })).filter((record, index, records) =>
      Number.isInteger(record.verse) && record.verse > 0 && record.text &&
      records.findIndex((candidate) => candidate.verse === record.verse) === index
    );
  }

  function verseBelongsToPassage(passage, verse) {
    if (!passage || !Number.isInteger(verse) || verse < 1 || !Number.isInteger(passage.verseCount)) return false;
    const start = Number.isInteger(passage.verseStart) ? passage.verseStart : 1;
    const end = Number.isInteger(passage.verseEnd) ? passage.verseEnd : passage.verseCount;
    return end >= start && passage.verseCount === end - start + 1 && verse >= start && verse <= end;
  }

  function safeExternalUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["https:", "http:"].includes(url.protocol) ? url.toString() : null;
    } catch {
      return null;
    }
  }

  function safeVersionedAppUrl(value, buildId) {
    try {
      const url = new URL(String(value || ""));
      if (url.protocol !== "https:" || url.hostname !== "script.google.com" ||
          !/^\/macros\/s\/[A-Za-z0-9_-]+\/(?:exec|dev)$/.test(url.pathname) ||
          !/^[a-f0-9]{16}$/.test(String(buildId || ""))) return null;
      url.searchParams.set("appBuild", buildId);
      return url.toString();
    } catch {
      return null;
    }
  }

  function configureBuildUpdate(bootstrap) {
    const panel = element("updatePanel");
    if (!panel) return;
    const serverBuildId = String(bootstrap && bootstrap.appBuildId || "");
    const updateUrl = safeVersionedAppUrl(bootstrap && bootstrap.appUrl, serverBuildId);
    // A Pages-delivered client receives its current release from the validated
    // code-only manifest. The Apps Script build ID then describes backend code,
    // not whether this independently versioned frontend is stale.
    const stale = CLIENT_DELIVERY_MODE !== "pages-assets" &&
      state.adapter.kind === "apps-script" && serverBuildId && serverBuildId !== CLIENT_BUILD_ID;
    panel.hidden = !(stale && updateUrl);
    if (stale && updateUrl) {
      element("updateLink").href = updateUrl;
      setBanner("A newer application build is available. Use the update control before continuing sensitive work.", "info");
    }
  }

  function createMemoryStore() {
    const stores = new Map(Object.keys(STORE_DEFINITIONS).map((name) => [name, new Map()]));
    return {
      async get(storeName, key) { return stores.get(storeName).get(key) || null; },
      async getAll(storeName) { return Array.from(stores.get(storeName).values()); },
      async put(storeName, value) {
        const key = value[STORE_DEFINITIONS[storeName]];
        stores.get(storeName).set(key, value);
        return value;
      },
      async delete(storeName, key) { stores.get(storeName).delete(key); },
      async clear(storeName) { stores.get(storeName).clear(); },
      async clearAll() { stores.forEach((store) => store.clear()); },
      mode: "memory"
    };
  }

  function createBrowserStore(openTimeoutOverride) {
    if (!root.indexedDB) return Promise.resolve(createMemoryStore());
    return new Promise((resolve) => {
      const memory = createMemoryStore();
      const openTimeoutMs = Number.isInteger(openTimeoutOverride) && openTimeoutOverride > 0
        ? openTimeoutOverride
        : 2000;
      let settled = false;
      let openTimer = null;
      const finish = (store) => {
        if (settled) return false;
        settled = true;
        if (openTimer !== null) root.clearTimeout(openTimer);
        resolve(store);
        return true;
      };
      let request;
      try {
        request = root.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (_) {
        finish(memory);
        return;
      }
      openTimer = root.setTimeout(() => finish(memory), openTimeoutMs);
      request.onupgradeneeded = () => {
        const db = request.result;
        Object.entries(STORE_DEFINITIONS).forEach(([name, keyPath]) => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, {keyPath});
        });
      };
      request.onerror = () => finish(memory);
      request.onblocked = () => finish(memory);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        if (settled) {
          db.close();
          return;
        }
        let degraded = false;
        function transaction(storeName, mode, operation) {
          return new Promise((resolveTransaction, rejectTransaction) => {
            const tx = db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            let transactionSettled = false;
            const transactionTimer = root.setTimeout(() => {
              if (transactionSettled) return;
              transactionSettled = true;
              try { tx.abort(); } catch (_) {}
              rejectTransaction(new Error("IndexedDB transaction timed out."));
            }, 2500);
            const complete = (callback, value) => {
              if (transactionSettled) return;
              transactionSettled = true;
              root.clearTimeout(transactionTimer);
              callback(value);
            };
            let value;
            try {
              value = operation(store);
            } catch (error) {
              complete(rejectTransaction, error);
              return;
            }
            tx.oncomplete = () => complete(resolveTransaction, value && value.result !== undefined ? value.result : value);
            tx.onerror = () => complete(rejectTransaction, tx.error || new Error("IndexedDB transaction failed."));
            tx.onabort = () => complete(rejectTransaction, tx.error || new Error("IndexedDB transaction aborted."));
          });
        }
        async function resilient(databaseOperation, memoryOperation) {
          if (degraded) return memoryOperation();
          try {
            return await databaseOperation();
          } catch (_) {
            degraded = true;
            try { db.close(); } catch (_) {}
            return memoryOperation();
          }
        }
        finish({
          async get(storeName, key) {
            return resilient(async () => {
              const value = await transaction(storeName, "readonly", (store) => store.get(key));
              if (value) await memory.put(storeName, value);
              return value || null;
            }, () => memory.get(storeName, key));
          },
          async getAll(storeName) {
            return resilient(async () => {
              const values = await transaction(storeName, "readonly", (store) => store.getAll());
              for (const value of values || []) await memory.put(storeName, value);
              return values || [];
            }, () => memory.getAll(storeName));
          },
          async put(storeName, value) {
            await memory.put(storeName, value);
            await resilient(() => transaction(storeName, "readwrite", (store) => store.put(value)), () => value);
            return value;
          },
          async delete(storeName, key) {
            await memory.delete(storeName, key);
            return resilient(() => transaction(storeName, "readwrite", (store) => store.delete(key)), () => undefined);
          },
          async clear(storeName) {
            await memory.clear(storeName);
            return resilient(() => transaction(storeName, "readwrite", (store) => store.clear()), () => undefined);
          },
          async clearAll() {
            await memory.clearAll();
            return resilient(async () => {
              for (const storeName of Object.keys(STORE_DEFINITIONS)) {
                await transaction(storeName, "readwrite", (store) => store.clear());
              }
            }, () => undefined);
          },
          mode: "indexeddb"
        });
      };
    });
  }

  /* DBR_LOCAL_ADAPTER_START */
  function privateDraftMode() {
    try {
      return new URLSearchParams(root.location && root.location.search || "").get("privateDraft") === "1";
    } catch {
      return false;
    }
  }

  function mhcPilotMode() {
    try {
      return new URLSearchParams(root.location && root.location.search || "").get("mhcPilot") === "1";
    } catch {
      return false;
    }
  }

  async function fetchJson(path) {
    const response = await root.fetch(path, {cache: "no-store", credentials: "same-origin"});
    if (!response.ok) throw appError("Local pilot fixture could not be loaded.", "FIXTURE_UNAVAILABLE");
    return response.json();
  }

  function localAdapter(store) {
    const core = root.DBRServerCore;
    const highlightEvents = [];
    return {
      kind: "mock",
      cacheContext: mhcPilotMode() ? "mock-mhc-pilot" : privateDraftMode() ? "mock-private-draft" : "mock-fixture",
      async getBootstrapData() {
        const configPath = mhcPilotMode() ? "/__mhc/config.json" : "../../fixtures/pilot-content/app-config.json";
        const planPath = mhcPilotMode() ? "/__mhc/plan.json" : "../../fixtures/pilot-content/plan.json";
        const registryPath = mhcPilotMode()
          ? "/__mhc/registry.json"
          : privateDraftMode()
            ? "/__private/registry.json"
            : "../../fixtures/pilot-content/source-registry.json";
        const [config, plan, policySet, registry] = await Promise.all([
          fetchJson(configPath),
          fetchJson(planPath),
          fetchJson("../../config/provider-policies.example.json"),
          fetchJson(registryPath)
        ]);
        return {
          mode: "mock",
          appBuildId: CLIENT_BUILD_ID,
          appUrl: null,
          config,
          plan,
          providerPolicy: policySet.policies[0],
          session: {authorId: "dustin", displayName: "Dustin"},
          participants: [
            {authorId: "dustin", displayName: "Dustin"},
            {authorId: "shane", displayName: "Shane"}
          ],
          sources: registry.sources
        };
      },
      async getReadingPayload(readingId) {
        const entry = state.plan.entries.find((candidate) => candidate.readingId === readingId);
        if (!entry) throw appError("Unknown bridge reading.", "READING_NOT_FOUND");
        if (mhcPilotMode()) return fetchJson(`/__mhc/reading/${readingId}.json`);
        if (privateDraftMode()) return fetchJson(`/__private/reading/${readingId}.json`);
        const template = await fetchJson("../../fixtures/pilot-content/bridge-placeholder.commentary.json");
        const firstPassage = entry.passages[0];
        const commentary = {
          ...template,
          commentaryVersion: `${readingId}-placeholder-v1`,
          readingId,
          verseOfTheDay: {bookId: firstPassage.bookId, chapter: firstPassage.chapter, verse: 1}
        };
        return {commentary, sources: []};
      },
      async getReadingPayloads(readingIds) {
        const payloads = {};
        for (const readingId of readingIds) payloads[readingId] = await this.getReadingPayload(readingId);
        return {planVersion: state.plan.planVersion, payloads};
      },
      async getScripture(readingId) {
        const entry = state.plan.entries.find((candidate) => candidate.readingId === readingId);
        if (!entry || entry.kind !== "chapter") return {available: false, code: "NOT_A_CHAPTER"};
        return {
          available: true,
          isMock: true,
          translation: "MOCK",
          readingId,
          canonical: titleForEntry(entry),
          notice: "FABRICATED DEVELOPMENT TEXT — not ESV and not a Bible translation.",
          passages: entry.passages.map((passage) => ({
            bookId: passage.bookId,
            chapter: passage.chapter,
            verseStart: Number.isInteger(passage.verseStart) ? passage.verseStart : 1,
            verseEnd: Number.isInteger(passage.verseEnd) ? passage.verseEnd : passage.verseCount,
            canonical: `${BOOK_NAMES[passage.bookId] || passage.bookId} ${passage.chapter}`,
            verses: Array.from({length: passage.verseCount}, (_, index) =>
              `Fabricated mock verse ${(Number.isInteger(passage.verseStart) ? passage.verseStart : 1) + index} for local layout testing in chapter ${passage.chapter}; no licensed Scripture is stored here.`
            )
          })),
          cacheAllowed: false
        };
      },
      async listComments(readingId) {
        const events = await store.getAll("commentEvents");
        return core.materializeCommentEvents(events.filter((event) => event.readingId === readingId));
      },
      async listCommentActivity(readingIds) {
        const events = await store.getAll("commentEvents");
        const activity = core.participantCommentActivity(events, {
          participants: state.calendarParticipants,
          planVersion: state.plan.planVersion,
          readingIds
        });
        return {
          planVersion: state.plan.planVersion,
          ...activity,
          completedReadingIds: activity.completedByReadingId
            ? readingIds.filter((readingId) => activity.completedByReadingId[readingId].includes(state.session.authorId))
            : []
        };
      },
      async submitCommentEvent(payload) {
        const events = await store.getAll("commentEvents");
        const result = core.applyCommentEvent({
          payload,
          plan: state.plan,
          identity: state.session,
          existingEvents: events,
          now: new Date().toISOString(),
          idFactory: (kind) => createRequestId(kind)
        });
        if (!result.idempotent) await store.put("commentEvents", result.event);
        await store.put("commentSnapshot", result.event);
        return result;
      },
      async listHighlights(readingId) {
        return core.materializeHighlightEvents(highlightEvents.filter((event) => event.readingId === readingId));
      },
      async submitHighlightEvent(payload) {
        const result = core.applyHighlightEvent({
          payload,
          plan: state.plan,
          identity: state.session,
          existingEvents: highlightEvents,
          now: new Date().toISOString(),
          idFactory: (kind) => createRequestId(kind)
        });
        if (!result.idempotent) highlightEvents.push(result.event);
        return result;
      },
      async forgetReaderEnrollment() {
        return {forgotten: true};
      }
    };
  }
  /* DBR_LOCAL_ADAPTER_END */

  function appsScriptRpc(method, ...args) {
    return new Promise((resolve, reject) => {
      if (!root.google || !root.google.script || !root.google.script.run) {
        reject(appError("Authenticated Apps Script bridge is unavailable.", "BRIDGE_UNAVAILABLE"));
        return;
      }
      let settled = false;
      const timeout = root.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(appError("The server did not respond in time.", "SERVER_TIMEOUT"));
      }, 30000);
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        root.clearTimeout(timeout);
        callback(value);
      };
      const runner = root.google.script.run
        .withSuccessHandler((response) => finish(resolve, response))
        .withFailureHandler((failure) => finish(
          reject,
          appError(failure && failure.message ? failure.message : "Server request failed.", "SERVER_ERROR")
        ));
      try {
        runner[method](...args);
      } catch (error) {
        finish(reject, appError(error && error.message ? error.message : "Server request failed.", "SERVER_ERROR"));
      }
    });
  }

  function unwrapRpc(response) {
    if (!response || response.ok !== true) {
      const details = response && response.error ? response.error : {};
      throw appError(details.message || "Server request failed.", details.code || "SERVER_UNAVAILABLE");
    }
    return response.data;
  }

  function productionAdapter() {
    return {
      kind: "apps-script",
      cacheContext: "apps-script",
      getBootstrapData: () => appsScriptRpc("getBootstrapData", state.readerCode).then(unwrapRpc),
      confirmReaderAccess: () => appsScriptRpc("confirmReaderAccess", state.readerCode).then(unwrapRpc),
      getReadingPayload: (readingId) => appsScriptRpc("getReadingPayload", state.readerCode, readingId).then(unwrapRpc),
      getReadingPayloads: (readingIds) => appsScriptRpc("getReadingPayloads", state.readerCode, readingIds).then(unwrapRpc),
      getScripture: (readingId) => appsScriptRpc("getScripture", state.readerCode, readingId).then(unwrapRpc),
      listComments: (readingId) => appsScriptRpc("listComments", state.readerCode, readingId).then(unwrapRpc),
      listCommentActivity: (readingIds) => appsScriptRpc("listCommentActivity", state.readerCode, readingIds).then(unwrapRpc),
      submitCommentEvent: (payload) => appsScriptRpc("submitCommentEvent", state.readerCode, payload).then(unwrapRpc),
      listHighlights: (readingId) => appsScriptRpc("listHighlights", state.readerCode, readingId).then(unwrapRpc),
      submitHighlightEvent: (payload) => appsScriptRpc("submitHighlightEvent", state.readerCode, payload).then(unwrapRpc),
      forgetReaderEnrollment: () => appsScriptRpc("forgetReaderEnrollment", state.readerCode).then(unwrapRpc)
    };
  }

  function setBanner(message, kind) {
    const banner = element("stateBanner");
    if (!banner) return;
    banner.hidden = !message;
    banner.textContent = message || "";
    banner.dataset.state = kind || "info";
  }

  function setSyncStatus(message) {
    if (element("syncStatus")) element("syncStatus").textContent = message;
  }

  function replaceWithText(container, text, tagName) {
    container.replaceChildren();
    const node = root.document.createElement(tagName || "p");
    node.textContent = text;
    container.appendChild(node);
  }

  function appendInlineCitedText(container, markdown, citationIndex) {
    const text = String(markdown || "");
    if (!citationIndex) {
      container.textContent = text;
      return 0;
    }
    const pattern = /\{\{cite:([A-Za-z0-9_.:-]+(?:\s*,\s*[A-Za-z0-9_.:-]+)*)\}\}/g;
    let cursor = 0;
    let match;
    let markerCount = 0;
    while ((match = pattern.exec(text))) {
      container.appendChild(root.document.createTextNode(text.slice(cursor, match.index)));
      const citations = createNumberedCitations(
        match[1].split(",").map((sourceId) => sourceId.trim()),
        citationIndex
      );
      if (citations) container.appendChild(citations);
      cursor = pattern.lastIndex;
      markerCount += 1;
    }
    container.appendChild(root.document.createTextNode(text.slice(cursor)));
    return markerCount;
  }

  function renderSafeMarkdown(markdown, container, citationIndex) {
    container.replaceChildren();
    const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    let list = null;
    let listType = null;
    let paragraph = [];

    function flushParagraph() {
      if (!paragraph.length) return;
      const node = root.document.createElement("p");
      appendInlineCitedText(node, paragraph.join(" "), citationIndex);
      container.appendChild(node);
      paragraph = [];
    }

    function flushList() {
      list = null;
      listType = null;
    }

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        flushList();
        return;
      }
      const heading = /^(#{3,4})\s+(.+)$/.exec(trimmed);
      if (heading) {
        flushParagraph();
        flushList();
        const level = heading[1].length === 3 ? "h3" : "h4";
        const node = root.document.createElement(level);
        appendInlineCitedText(node, heading[2], citationIndex);
        container.appendChild(node);
        return;
      }
      const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
      const numbered = /^\d+[.)]\s+(.+)$/.exec(trimmed);
      if (bullet || numbered) {
        flushParagraph();
        const nextListType = numbered ? "ol" : "ul";
        if (!list || listType !== nextListType) {
          list = root.document.createElement(nextListType);
          listType = nextListType;
          container.appendChild(list);
        }
        const item = root.document.createElement("li");
        appendInlineCitedText(item, (bullet || numbered)[1], citationIndex);
        list.appendChild(item);
        return;
      }
      flushList();
      paragraph.push(trimmed);
    });
    flushParagraph();
  }

  function renderSourceCitations(sourceIds, sources, container) {
    container.replaceChildren();
    const byId = new Map((sources || []).map((source) => [source.sourceId, source]));
    const selected = (sourceIds || []).map((sourceId) => byId.get(sourceId)).filter(Boolean);
    container.hidden = selected.length === 0;
    if (!selected.length) return;
    const label = root.document.createElement("span");
    label.textContent = selected.length === 1 ? "Source:" : "Sources:";
    container.appendChild(label);
    selected.forEach((source) => {
      const url = safeExternalUrl(source.urlOrCitation);
      if (url) {
        const link = root.document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = source.title;
        container.appendChild(link);
      } else {
        const citation = root.document.createElement("span");
        citation.textContent = [source.title, source.authorOrOrganization].filter(Boolean).join(" — ");
        container.appendChild(citation);
      }
    });
  }

  function normalizedCommentarySummary(commentary) {
    if (commentary.commentarySummary && Array.isArray(commentary.commentarySummary.paragraphs)) {
      return commentary.commentarySummary;
    }
    const legacyInsights = Array.isArray(commentary.keyInsights) ? commentary.keyInsights : [];
    return {
      paragraphs: legacyInsights.map((insight) => ({
        markdown: [insight.title, insight.markdown].filter(Boolean).join(". "),
        sourceIds: insight.sourceIds || []
      }))
    };
  }

  function buildPageCitationIndex(summary, practicalTakeaway, comprehensive, sources) {
    const sourceById = new Map((sources || []).map((source) => [source.sourceId, source]));
    const orderedIds = [];
    const numberById = new Map();
    const units = [
      ...((summary && summary.paragraphs) || []),
      practicalTakeaway || {sourceIds: []},
      comprehensive || {sourceIds: []}
    ];
    units.forEach((unit) => {
      const sourceIds = [
        ...inlineCitationIds(unit.markdown),
        ...(unit.sourceIds || [])
      ];
      sourceIds.forEach((sourceId) => {
        if (!sourceById.has(sourceId) || numberById.has(sourceId)) return;
        orderedIds.push(sourceId);
        numberById.set(sourceId, orderedIds.length);
      });
    });
    return {numberById, orderedIds, sourceById};
  }

  function citationTargetIndex(index, disclosureId, noteIdPrefix) {
    return {...index, disclosureId, noteIdPrefix};
  }

  function inlineCitationIds(markdown) {
    const ids = [];
    const pattern = /\{\{cite:([A-Za-z0-9_.:-]+(?:\s*,\s*[A-Za-z0-9_.:-]+)*)\}\}/g;
    let match;
    while ((match = pattern.exec(String(markdown || "")))) {
      match[1].split(",").map((sourceId) => sourceId.trim()).forEach((sourceId) => ids.push(sourceId));
    }
    return ids;
  }

  function withoutInlineCitations(markdown) {
    return String(markdown || "").replace(
      /\{\{cite:[A-Za-z0-9_.:-]+(?:\s*,\s*[A-Za-z0-9_.:-]+)*\}\}/g,
      ""
    );
  }

  function createNumberedCitations(sourceIds, citationIndex) {
    const numbers = [...new Set((sourceIds || [])
      .map((sourceId) => citationIndex.numberById.get(sourceId))
      .filter(Number.isInteger))].sort((left, right) => left - right);
    if (!numbers.length) return null;
    const citations = root.document.createElement("sup");
    citations.className = "numeric-citations";
    citations.setAttribute("aria-label", `Sources ${numbers.join(", ")}`);
    numbers.forEach((number, index) => {
      if (index) citations.appendChild(root.document.createTextNode(","));
      const link = root.document.createElement("a");
      link.href = `#${citationIndex.noteIdPrefix}-${number}`;
      link.textContent = String(number);
      link.setAttribute("aria-label", `Source ${number}`);
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const disclosure = element(citationIndex.disclosureId);
        disclosure.open = true;
        const note = element(`${citationIndex.noteIdPrefix}-${number}`);
        if (note) {
          note.scrollIntoView({block: "center"});
          note.focus({preventScroll: true});
        }
      });
      citations.appendChild(link);
    });
    return citations;
  }

  function renderNumberedSourceNotes(citationIndex, options) {
    const disclosure = element(options.disclosureId);
    const list = element(options.listId);
    list.replaceChildren();
    disclosure.open = false;
    disclosure.hidden = citationIndex.orderedIds.length === 0;
    element(options.summaryId).textContent = citationIndex.orderedIds.length
      ? `${citationIndex.orderedIds.length} ${options.populatedLabel}`
      : options.emptyLabel;
    citationIndex.orderedIds.forEach((sourceId, index) => {
      const source = citationIndex.sourceById.get(sourceId);
      const item = root.document.createElement("li");
      const number = index + 1;
      item.id = `${options.noteIdPrefix}-${number}`;
      item.tabIndex = -1;
      const author = root.document.createElement("span");
      author.className = "main-source-author";
      author.textContent = source.authorOrOrganization ? `${source.authorOrOrganization}. ` : "";
      item.appendChild(author);
      const url = safeExternalUrl(source.urlOrCitation);
      if (url) {
        const link = root.document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = source.title;
        item.appendChild(link);
      } else {
        const title = root.document.createElement("span");
        title.textContent = source.title;
        item.appendChild(title);
      }
      const details = [source.edition, source.publicationDate].filter(Boolean).join(" · ");
      if (details) item.appendChild(root.document.createTextNode(` (${details})`));
      list.appendChild(item);
    });
  }

  function renderMainSourceNotes(citationIndex) {
    renderNumberedSourceNotes(citationIndex, {
      disclosureId: "mainSourceDisclosure",
      listId: "mainSourceNotes",
      summaryId: "mainSourceSummary",
      noteIdPrefix: "main-source-note",
      populatedLabel: "sources informing the daily synthesis",
      emptyLabel: "Sources informing the daily synthesis"
    });
  }

  function renderDeepSourceNotes(citationIndex) {
    renderNumberedSourceNotes(citationIndex, {
      disclosureId: "deepSourceDisclosure",
      listId: "deepSourceNotes",
      summaryId: "deepSourceSummary",
      noteIdPrefix: "deep-source-note",
      populatedLabel: "numbered sources used on this page",
      emptyLabel: "Sources used on this page"
    });
  }

  function renderCommentarySummary(summary) {
    const container = element("commentarySummary");
    container.replaceChildren();
    const paragraphs = summary && Array.isArray(summary.paragraphs) ? summary.paragraphs : [];
    if (!paragraphs.length) {
      replaceWithText(container, "Commentary research is still being prepared for this reading.");
      return;
    }
    paragraphs.forEach((paragraph) => {
      const node = root.document.createElement("p");
      node.textContent = withoutInlineCitations(paragraph.markdown);
      container.appendChild(node);
    });
  }

  function normalizedComprehensiveSynthesis(commentary, isBookIntroduction) {
    if (commentary.comprehensiveSynthesis && commentary.comprehensiveSynthesis.markdown) {
      return commentary.comprehensiveSynthesis;
    }
    const sections = (commentary.sections || []).filter((section) =>
      !(isBookIntroduction && section.sectionId === "brief-overview")
    );
    return {
      markdown: sections.map((section) => `### ${section.title}\n\n${section.markdown}`).join("\n\n"),
      sourceIds: Array.from(new Set(sections.flatMap((section) => section.sourceIds || [])))
    };
  }

  function splitComprehensiveSections(markdown) {
    const sections = [];
    let title = "";
    let lines = [];
    function flush() {
      const body = lines.join("\n").trim();
      if (body) sections.push({title: title || "Overview", markdown: body});
      lines = [];
    }
    String(markdown || "").replace(/\r\n?/g, "\n").split("\n").forEach((line) => {
      const heading = /^###\s+(.+)$/.exec(line.trim());
      if (heading) {
        flush();
        title = heading[1].trim();
      } else if (!/^##\s+/.test(line.trim())) {
        lines.push(line);
      }
    });
    flush();
    return sections;
  }

  function renderComprehensiveSections(comprehensive, citationIndex) {
    const container = element("comprehensiveSynthesis");
    container.replaceChildren();
    const sections = splitComprehensiveSections(comprehensive.markdown);
    if (!sections.length) {
      replaceWithText(container, "Comprehensive synthesis is still being prepared.");
      return;
    }
    sections.forEach((section) => {
      const disclosure = root.document.createElement("details");
      disclosure.className = "deep-dive-disclosure";
      const summary = root.document.createElement("summary");
      summary.textContent = section.title === "Overview" && state.currentEntry
        ? `${titleForEntry(state.currentEntry)} in one view`
        : section.title;
      const body = root.document.createElement("div");
      body.className = "commentary-body deep-dive-body";
      renderSafeMarkdown(section.markdown, body, citationIndex);
      disclosure.append(summary, body);
      container.appendChild(disclosure);
    });
  }

  function normalizedVerseOfTheDay(selection, entry) {
    if (!selection || !entry || entry.kind !== "chapter" ||
        !/^[A-Z0-9]{2,5}$/.test(String(selection.bookId || "")) ||
        !Number.isInteger(selection.chapter) || !Number.isInteger(selection.verse) ||
        selection.chapter < 1 || selection.verse < 1) return null;
    const passage = (entry.passages || []).find((candidate) =>
      candidate.bookId === selection.bookId && candidate.chapter === selection.chapter
    );
    if (!verseBelongsToPassage(passage, selection.verse)) return null;
    return {bookId: selection.bookId, chapter: selection.chapter, verse: selection.verse};
  }

  function normalizedHenrySourceLink(link, entry, sources) {
    if (!link || !entry || entry.kind !== "chapter" ||
        typeof link.sourceId !== "string" || !link.sourceId.trim() ||
        typeof link.title !== "string" || !link.title.trim() || link.title.length > 200 ||
        typeof link.note !== "string" || !link.note.trim() || link.note.length > 500 ||
        !(sources || []).some((source) => source && source.sourceId === link.sourceId)) return null;
    let url;
    try {
      url = new URL(String(link.url || ""));
    } catch (_) {
      return null;
    }
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return {sourceId: link.sourceId, title: link.title.trim(), url: url.href, note: link.note.trim()};
  }

  function validMhcRuntimeProvenance(shard) {
    return Boolean(shard && typeof shard === "object" &&
      shard.schema_version === "mhc-runtime/v1" && shard.validation_status === "valid" &&
      ["unreviewed", "in_review", "approved", "changes_requested"].includes(shard.review_status) &&
      typeof shard.source_id === "string" && shard.source_id &&
      typeof shard.source_version === "string" && shard.source_version &&
      /^[a-f0-9]{64}$/.test(String(shard.source_archive_sha256 || "")) &&
      typeof shard.source_manifest_ref === "string" && shard.source_manifest_ref &&
      typeof shard.worker_model === "string" && shard.worker_model &&
      typeof shard.prompt_version === "string" && shard.prompt_version &&
      typeof shard.generation_timestamp === "string" && Number.isFinite(Date.parse(shard.generation_timestamp)) &&
      typeof shard.label === "string" && shard.label.trim());
  }

  function normalizedVerseCommentaryShard(shard, entry) {
    if (!validMhcRuntimeProvenance(shard) || !entry || entry.kind !== "chapter" ||
        typeof shard.label !== "string" || !shard.label.trim() ||
        !/^[A-Z0-9]{2,8}$/.test(String(shard.book_id || "")) ||
        !Number.isInteger(shard.chapter) || !shard.records || typeof shard.records !== "object" ||
        Array.isArray(shard.records)) return null;
    const passage = (entry.passages || []).find((candidate) =>
      candidate.bookId === shard.book_id && candidate.chapter === shard.chapter
    );
    if (!passage) return null;
    const verseStart = Number.isInteger(passage.verseStart) ? passage.verseStart : 1;
    const verseEnd = Number.isInteger(passage.verseEnd) ? passage.verseEnd : verseStart + passage.verseCount - 1;
    if (!Number.isInteger(passage.verseCount) || verseEnd - verseStart + 1 !== passage.verseCount) return null;
    const expectedIds = Array.from({length: passage.verseCount}, (_, index) =>
      `${shard.book_id}.${shard.chapter}.${verseStart + index}`
    );
    if (Object.keys(shard.records).length !== expectedIds.length) return null;
    const sourceAtoms = shard.source_atoms;
    const hasSourceLayer = sourceAtoms && typeof sourceAtoms === "object" && !Array.isArray(sourceAtoms);
    if (sourceAtoms !== undefined && !hasSourceLayer) return null;
    if (hasSourceLayer) {
      if (typeof shard.source_layer_note !== "string" || !shard.source_layer_note.trim() || shard.source_layer_note.length > 500) return null;
      for (const [atomId, atom] of Object.entries(sourceAtoms)) {
        if (!atom || typeof atom !== "object" || atom.source_atom_id !== atomId ||
            typeof atom.source_unit_id !== "string" || !atom.source_unit_id ||
            typeof atom.source_reference_label !== "string" || !atom.source_reference_label ||
            !Number.isInteger(atom.sequence) || atom.sequence < 1 ||
            !["heading", "commentary"].includes(atom.atom_type) ||
            typeof atom.text !== "string" || !atom.text.trim() || atom.text.length > 100000 ||
            !/^[a-f0-9]{64}$/.test(String(atom.text_sha256 || ""))) return null;
      }
    }
    for (const verseId of expectedIds) {
      const record = shard.records[verseId];
      if (!record || typeof record !== "object" ||
          typeof record.blurb !== "string" || !record.blurb.trim() || record.blurb.length > 1200 ||
          !["direct", "range-derived", "no-distinct-comment"].includes(record.coverage_type) ||
          typeof record.scope_note !== "string" || !record.scope_note.trim() || record.scope_note.length > 400 ||
          !Array.isArray(record.source_unit_ids) || !record.source_unit_ids.length ||
          record.source_unit_ids.some((sourceUnitId) => typeof sourceUnitId !== "string" || !sourceUnitId) ||
          typeof record.source_reference_label !== "string" || !record.source_reference_label.trim()) return null;
      if (hasSourceLayer) {
        if (!Array.isArray(record.source_atom_ids) || !record.source_atom_ids.length ||
            new Set(record.source_atom_ids).size !== record.source_atom_ids.length ||
            record.source_atom_ids.some((atomId) => !sourceAtoms[atomId] ||
              !record.source_unit_ids.includes(sourceAtoms[atomId].source_unit_id))) return null;
      } else if (record.source_atom_ids !== undefined) return null;
    }
    return shard;
  }

  function normalizedVerseCommentarySet(commentary, entry) {
    const supplied = Array.isArray(commentary && commentary.verseCommentaries)
      ? commentary.verseCommentaries
      : commentary && commentary.verseCommentary ? [commentary.verseCommentary] : [];
    const shards = supplied.map((shard) => normalizedVerseCommentaryShard(shard, entry)).filter(Boolean);
    if (!shards.length || shards.length !== supplied.length) return null;
    const records = {};
    const sourceAtoms = {};
    for (const shard of shards) {
      for (const [recordId, record] of Object.entries(shard.records || {})) {
        if (records[recordId]) return null;
        records[recordId] = record;
      }
      for (const [atomId, atom] of Object.entries(shard.source_atoms || {})) {
        if (sourceAtoms[atomId] && sourceAtoms[atomId].text_sha256 !== atom.text_sha256) return null;
        sourceAtoms[atomId] = atom;
      }
    }
    return {
      label: shards[0].label,
      source_layer_note: "Exact public-domain Matthew Henry commentary used for these condensations; embedded Scripture transcription is omitted.",
      records,
      source_atoms: sourceAtoms,
      shards
    };
  }

  function normalizedBookCommentaryResource(shard, entry) {
    const resource = shard && shard.resource;
    if (!validMhcRuntimeProvenance(shard) || !entry || entry.kind !== "book_intro" ||
        !resource || resource.resource_type !== "book_intro" || resource.resource_id !== `intro-${entry.bookId}` ||
        resource.book_id !== entry.bookId || typeof resource.blurb !== "string" || !resource.blurb.trim() ||
        typeof resource.scope_note !== "string" || !resource.scope_note.trim() ||
        typeof resource.source_reference_label !== "string" || !resource.source_reference_label.trim() ||
        !Array.isArray(resource.source_unit_ids) || !resource.source_unit_ids.length) return null;
    return shard;
  }

  function renderBookCommentaryResource(shard) {
    const container = element("bookCommentaryResource");
    const valid = normalizedBookCommentaryResource(shard, state.currentEntry);
    container.hidden = !valid;
    if (!valid) {
      element("bookCommentaryBlurb").textContent = "";
      element("bookCommentaryReference").textContent = "";
      element("bookCommentaryScope").textContent = "";
      return;
    }
    element("bookCommentaryLabel").textContent = valid.label;
    element("bookCommentaryBlurb").textContent = valid.resource.blurb;
    element("bookCommentaryReference").textContent = `Source: ${valid.resource.source_reference_label}`;
    element("bookCommentaryScope").textContent = valid.resource.scope_note;
  }

  function verseReferenceLabel(selection) {
    if (!selection) return "Selected verse";
    return `${BOOK_NAMES[selection.bookId] || selection.bookId} ${selection.chapter}:${selection.verse}`;
  }

  function selectedDayVerseSelection(payload, entry) {
    const commentary = payload && (payload.commentary || payload.metadata);
    if (!commentary || !entry || commentary.readingId !== entry.readingId) return null;
    return normalizedVerseOfTheDay(commentary && commentary.verseOfTheDay, entry);
  }

  function verseOfDayEsvUrl(selection) {
    const label = verseReferenceLabel(selection);
    return `https://www.esv.org/${label.replace(/\s+/g, "+")}/`;
  }

  function extractNumberedVerseText(passageText, verseNumber) {
    const record = splitNumberedVerses(passageText).find((candidate) => candidate.verse === verseNumber);
    return record ? record.text : "";
  }

  function verseTextFromScripture(scripture, selection) {
    if (!scripture || !selection || !Array.isArray(scripture.passages)) return "";
    const passage = scripture.passages.find((candidate) =>
      candidate.bookId === selection.bookId && candidate.chapter === selection.chapter
    );
    if (!passage) return "";
    if (scripture.isMock === true && scripture.translation === "MOCK") {
      const start = Number.isInteger(passage.verseStart) ? passage.verseStart : 1;
      return String((passage.verses || [])[selection.verse - start] || "");
    }
    return scripture.translation === "ESV"
      ? extractNumberedVerseText(passage.passage, selection.verse)
      : "";
  }

  function prepareVerseOfTheDay() {
    const section = element("verseOfDaySection");
    const selection = state.verseOfTheDay;
    section.hidden = !selection;
    element("verseOfDayText").hidden = true;
    element("verseOfDayAttribution").hidden = true;
    if (!selection) return;
    element("verseOfDayReference").textContent = verseReferenceLabel(selection);
    element("verseOfDayEsvLink").href = verseOfDayEsvUrl(selection);
    const status = element("verseOfDayState");
    status.hidden = false;
    status.dataset.state = "info";
    status.textContent = state.adapter && state.adapter.kind === "mock"
      ? "Loading a fabricated mock verse for layout testing…"
      : "Loading the selected verse from the live ESV reading…";
  }

  function renderVerseOfDayUnavailable(message) {
    if (!state.verseOfTheDay) return;
    const status = element("verseOfDayState");
    status.hidden = false;
    status.dataset.state = "error";
    status.textContent = message || "The selected ESV verse is unavailable. Retry Scripture when connected; no alternate translation will be substituted.";
    element("verseOfDayText").hidden = true;
    element("verseOfDayAttribution").hidden = true;
  }

  function renderVerseOfTheDay(scripture) {
    const selection = state.verseOfTheDay;
    if (!selection) return;
    const verseText = verseTextFromScripture(scripture, selection);
    if (!verseText) {
      renderVerseOfDayUnavailable("The selected verse could not be isolated from the Scripture response. Retry when connected; no alternate translation will be substituted.");
      return;
    }
    const quote = element("verseOfDayText");
    quote.textContent = verseText;
    quote.hidden = false;
    const status = element("verseOfDayState");
    if (scripture.isMock === true) {
      status.hidden = false;
      status.dataset.state = "error";
      status.textContent = "FABRICATED DEVELOPMENT TEXT — not ESV and not a Bible translation.";
      element("verseOfDayAttribution").hidden = true;
    } else {
      status.hidden = true;
      element("verseOfDayAttribution").hidden = false;
    }
  }

  function renderCommentary(commentary, sources) {
    const overview = element("overviewContent");
    const dailyIntroduction = commentary.dailyIntroduction || {markdown: commentary.overview, sourceIds: []};
    renderSafeMarkdown(dailyIntroduction.markdown || "Orientation unavailable.", overview);
    overview.classList.remove("skeleton-text");
    renderSourceCitations(dailyIntroduction.sourceIds, sources || [], element("overviewSources"));

    const isBookIntroduction = state.currentEntry && state.currentEntry.kind === "book_intro";
    const briefOverview = (commentary.sections || []).find((section) => section.sectionId === "brief-overview");
    const bookIntroduction = element("bookIntroductionContent");
    if (isBookIntroduction) {
      renderSafeMarkdown(commentary.overview || (briefOverview && briefOverview.markdown) || "Book introduction unavailable.", bookIntroduction);
      bookIntroduction.classList.remove("skeleton-text");
      renderSourceCitations(briefOverview && briefOverview.sourceIds || [], sources || [], element("bookIntroductionSources"));
    } else {
      bookIntroduction.replaceChildren();
      element("bookIntroductionSources").replaceChildren();
    }
    renderBookCommentaryResource(commentary.bookCommentary);

    state.currentVerseCommentary = normalizedVerseCommentarySet(commentary, state.currentEntry);
    state.currentHenrySourceLink = normalizedHenrySourceLink(commentary.henrySourceLink, state.currentEntry, sources || []);

    const commentarySummary = normalizedCommentarySummary(commentary);
    const practicalTakeaway = commentary.practicalTakeaway || {markdown: "Practical takeaway unavailable.", sourceIds: []};
    state.verseOfTheDay = normalizedVerseOfTheDay(commentary.verseOfTheDay, state.currentEntry);
    prepareVerseOfTheDay();
    const comprehensive = normalizedComprehensiveSynthesis(commentary, isBookIntroduction);
    const mainPageCitationIndex = buildPageCitationIndex(
      commentarySummary,
      practicalTakeaway,
      {sourceIds: []},
      sources || []
    );
    const deepPageCitationIndex = buildPageCitationIndex(
      {paragraphs: []},
      {sourceIds: []},
      comprehensive,
      sources || []
    );
    const mainCitationIndex = citationTargetIndex(mainPageCitationIndex, "mainSourceDisclosure", "main-source-note");
    const deepCitationIndex = citationTargetIndex(deepPageCitationIndex, "deepSourceDisclosure", "deep-source-note");
    renderCommentarySummary(commentarySummary);
    renderSafeMarkdown(practicalTakeaway.markdown, element("practicalTakeaway"));
    renderMainSourceNotes(mainCitationIndex);

    const badge = element("reviewBadge");
    badge.textContent = commentary.publicationStatus === "placeholder" ? "Commentary being prepared" : commentary.publicationStatus;

    renderComprehensiveSections(comprehensive, deepCitationIndex);
    renderDeepSourceNotes(deepCitationIndex);
    element("sourceAuditDisclosure").open = false;

    renderCoverage(commentary.coverage || {}, sources || []);
  }

  function listNode(items, emptyText) {
    if (!items || !items.length) {
      const paragraph = root.document.createElement("p");
      paragraph.textContent = emptyText;
      return paragraph;
    }
    const list = root.document.createElement("ul");
    items.forEach((value) => {
      const item = root.document.createElement("li");
      item.textContent = value;
      list.appendChild(item);
    });
    return list;
  }

  function coverageCard(title, contentNode) {
    const card = root.document.createElement("div");
    card.className = "coverage-card";
    const heading = root.document.createElement("strong");
    heading.textContent = title;
    card.append(heading, contentNode);
    return card;
  }

  function renderCoverage(coverage, sources) {
    const consulted = Number(coverage.consultedCount || 0);
    const included = Number(coverage.includedCount || 0);
    element("coverageIndicator").textContent = `${consulted} consulted · ${included} included`;
    const summary = element("coverageSummary");
    summary.replaceChildren(
      coverageCard("Represented categories", listNode(coverage.representedCategories, "None yet — research has not begun.")),
      coverageCard("Missing categories", listNode(coverage.missingCategories, "No missing categories recorded.")),
      coverageCard("Major disagreements", listNode(coverage.majorDisagreements, "Not yet assessed.")),
      coverageCard("Known limitations", listNode(coverage.limitations, "No limitations recorded."))
    );

    const sourceList = element("sourceList");
    sourceList.replaceChildren();
    if (!sources.length) {
      replaceWithText(sourceList, "No commentary sources are claimed for this reading yet.");
      return;
    }
    sources.forEach((source) => {
      const record = root.document.createElement("article");
      record.className = "source-record";
      const title = root.document.createElement("strong");
      title.textContent = source.title;
      const metadata = root.document.createElement("p");
      metadata.className = "muted";
      metadata.textContent = [source.authorOrOrganization, source.edition, source.publicationDate, source.summaryUseStatus]
        .filter(Boolean).join(" · ");
      record.append(title, metadata);
      const url = safeExternalUrl(source.urlOrCitation);
      if (url) {
        const link = root.document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open source record";
        record.appendChild(link);
      } else if (source.urlOrCitation) {
        const citation = root.document.createElement("p");
        citation.textContent = source.urlOrCitation;
        record.appendChild(citation);
      }
      sourceList.appendChild(record);
    });
  }

  function renderScriptureUnavailable(message) {
    const scriptureState = element("scriptureState");
    scriptureState.hidden = false;
    scriptureState.dataset.state = "error";
    scriptureState.textContent = message || "ESV Scripture is unavailable. Retry or open the passage on ESV.org.";
    element("scriptureContent").replaceChildren();
    state.currentScripture = null;
    notifyHighlightEnhancer();
    renderVerseOfDayUnavailable();
  }

  function highlightContext() {
    if (!state.currentEntry || state.currentEntry.kind !== "chapter" || !state.currentScripture) return null;
    return {
      readingId: state.currentEntry.readingId,
      planVersion: state.plan && state.plan.planVersion,
      entry: state.currentEntry,
      scripture: state.currentScripture,
      verseCommentary: state.currentVerseCommentary,
      henrySourceLink: state.currentHenrySourceLink,
      participants: state.calendarParticipants.slice(),
      session: state.session ? {authorId: state.session.authorId, displayName: state.session.displayName} : null,
      online: serverCallsAllowed()
    };
  }

  function notifyHighlightEnhancer() {
    if (!state.highlightEnhancer || typeof state.highlightEnhancer.render !== "function") return;
    try {
      Promise.resolve(state.highlightEnhancer.render(highlightContext())).catch(() => {});
    } catch (_) {}
  }

  function registerHighlightEnhancer(enhancer) {
    state.highlightEnhancer = enhancer && typeof enhancer.render === "function" ? enhancer : null;
    notifyHighlightEnhancer();
  }

  async function listCurrentHighlights(readingId) {
    if (!state.currentEntry || state.currentEntry.readingId !== readingId || !serverCallsAllowed()) {
      throw appError("Shared highlights require a confirmed connection.", "OFFLINE_HIGHLIGHTS_UNAVAILABLE");
    }
    return state.adapter.listHighlights(readingId);
  }

  async function submitCurrentHighlightEvent(payload) {
    if (!state.currentEntry || state.currentEntry.readingId !== payload.readingId || !serverCallsAllowed()) {
      throw appError("Shared highlights require a confirmed connection.", "OFFLINE_HIGHLIGHTS_UNAVAILABLE");
    }
    return state.adapter.submitHighlightEvent(payload);
  }

  function renderScripture(scripture, sourceLabel) {
    const content = element("scriptureContent");
    const scriptureState = element("scriptureState");
    content.replaceChildren();
    scriptureState.hidden = false;
    scriptureState.dataset.state = "info";
    state.currentScripture = scripture;

    if (scripture && scripture.isMock === true && scripture.translation === "MOCK") {
      element("translationLabel").textContent = "MOCK — not ESV";
      element("scriptureHeading").textContent = scripture.canonical;
      scriptureState.textContent = scripture.notice;
      const notice = root.document.createElement("div");
      notice.className = "mock-notice";
      notice.textContent = scripture.notice;
      content.appendChild(notice);
      (scripture.passages || [{canonical: scripture.canonical, verses: scripture.verses || []}]).forEach((passage) => {
        const section = root.document.createElement("section");
        section.className = "scripture-passage";
        const heading = root.document.createElement("h3");
        heading.textContent = passage.canonical;
        const start = Number.isInteger(passage.verseStart) ? passage.verseStart : 1;
        const list = root.document.createElement("ol");
        list.className = "mock-verses";
        passage.verses.forEach((verse, index) => {
          const item = root.document.createElement("li");
          item.dataset.verse = String(start + index);
          const number = root.document.createElement("span");
          number.className = "verse-number";
          number.textContent = String(start + index);
          const text = root.document.createElement("span");
          text.textContent = verse;
          item.append(number, text);
          list.appendChild(item);
        });
        section.append(heading, list);
        content.appendChild(section);
      });
      renderVerseOfTheDay(scripture);
      notifyHighlightEnhancer();
      markStartupMilestone("scriptureVisible");
      return;
    }

    const passages = scripture && Array.isArray(scripture.passages) ? scripture.passages : [];
    if (!scripture || scripture.available === false || scripture.translation !== "ESV" || !passages.length ||
        passages.some((passage) => !passage.passage)) {
      renderScriptureUnavailable();
      return;
    }
    element("translationLabel").textContent = "Page 2 · ESV Scripture";
    element("scriptureHeading").textContent = scripture.canonical || titleForEntry(state.currentEntry);
    scriptureState.hidden = true;
    scriptureState.textContent = "";
    passages.forEach((passage) => {
      const section = root.document.createElement("section");
      section.className = "scripture-passage";
      const heading = root.document.createElement("h3");
      heading.textContent = passage.canonical;
      const pre = root.document.createElement("pre");
      pre.textContent = passage.passage;
      section.append(heading, pre);
      content.appendChild(section);
    });
    const esvUrl = safeExternalUrl(scripture.esvUrl);
    if (esvUrl && esvUrl.startsWith("https://www.esv.org/")) element("openEsvLink").href = esvUrl;
    renderVerseOfTheDay(scripture);
    notifyHighlightEnhancer();
    markStartupMilestone("scriptureVisible");
  }

  async function persistScripture(scripture) {
    if (!scripture || scripture.translation !== "ESV") return;
    if (scripture.cacheAllowed === false || !state.policy.offlinePersistenceAllowed) {
      await state.store.delete("scriptureCache", `ESV:${scripture.readingId}`);
      await updateCacheInspector();
      return;
    }
    if (!scripture.passage) return;
    const candidate = {
      cacheKey: `ESV:${scripture.readingId}`,
      readingId: scripture.readingId,
      translation: "ESV",
      bookId: scripture.bookId,
      chapter: scripture.chapter,
      canonical: scripture.canonical,
      passage: scripture.passage,
      verseCount: scripture.verseCount,
      bookVerseCount: scripture.bookVerseCount,
      fetchedAt: scripture.fetchedAt || new Date().toISOString(),
      esvUrl: scripture.esvUrl
    };
    const existing = await state.store.getAll("scriptureCache");
    const plan = root.DBRProviderPolicy.planCacheWrite(existing, candidate, state.policy);
    for (const item of plan.evicted || []) await state.store.delete("scriptureCache", item.cacheKey);
    if (plan.accepted) await state.store.put("scriptureCache", plan.entryToWrite);
    await updateCacheInspector();
  }

  async function cachedScripture(readingId) {
    const entry = await state.store.get("scriptureCache", `ESV:${readingId}`);
    if (!entry) return null;
    if (!state.policy.offlinePersistenceAllowed) {
      await state.store.delete("scriptureCache", entry.cacheKey);
      return null;
    }
    if (root.DBRProviderPolicy.isExpired(entry, state.policy, Date.now())) {
      await state.store.delete("scriptureCache", entry.cacheKey);
      return null;
    }
    return entry;
  }

  function privateRecordIsFresh(record, nowInput, planVersion) {
    const now = Number.isFinite(nowInput) ? nowInput : Date.now();
    return Boolean(record && record.payload && Number.isFinite(Date.parse(record.expiresAt)) &&
      Date.parse(record.expiresAt) > now && (!planVersion || record.planVersion === planVersion));
  }

  function privateCacheContext() {
    return state.adapter && state.adapter.cacheContext || "apps-script";
  }

  function studyWordCount(value) {
    return String(value || "")
      .replace(/\{\{cite:[^}]+\}\}/g, "")
      .replace(/[#*_`>\[\]()]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }

  function substantiveStudyText(value, minimumWords) {
    const text = String(value || "").trim();
    if (studyWordCount(text) < minimumWords) return false;
    return !/(?:study notes?|commentary|orientation|synthesis|takeaway).{0,45}(?:not yet (?:prepared|available)|unavailable|being prepared|preparation pending)/i.test(text);
  }

  function preparationEntry(entryInput, commentary) {
    if (entryInput && typeof entryInput === "object") return entryInput;
    const shard = commentary && (commentary.verseCommentary ||
      (Array.isArray(commentary.verseCommentaries) && commentary.verseCommentaries[0]));
    const readingId = typeof entryInput === "string" ? entryInput : commentary && commentary.readingId;
    if (commentary && commentary.bookCommentary) return {readingId, kind: "book_intro", bookId: commentary.bookCommentary.resource && commentary.bookCommentary.resource.book_id};
    if (shard && shard.book_id && Number.isInteger(shard.chapter)) {
      return {
        readingId,
        kind: "chapter",
        bookId: shard.book_id,
        chapter: shard.chapter,
        passages: [{bookId: shard.book_id, chapter: shard.chapter, verseCount: Object.keys(shard.records || {}).length}]
      };
    }
    return {readingId, kind: "chapter", passages: []};
  }

  function chapterPassagesAreConfigured(entry) {
    return Boolean(entry && entry.kind === "chapter" && Array.isArray(entry.passages) && entry.passages.length &&
      entry.passages.every((passage) => passage && /^[A-Z0-9]{2,8}$/.test(String(passage.bookId || "")) &&
        Number.isInteger(passage.chapter) && passage.chapter > 0 &&
        Number.isInteger(passage.verseCount) && passage.verseCount > 0));
  }

  function verseCommentaryIsComplete(commentary, entry) {
    if (!chapterPassagesAreConfigured(entry)) return false;
    const supplied = Array.isArray(commentary && commentary.verseCommentaries)
      ? commentary.verseCommentaries
      : commentary && commentary.verseCommentary ? [commentary.verseCommentary] : [];
    if (supplied.length !== entry.passages.length) return false;
    return entry.passages.every((passage, passageIndex) => {
      const shard = supplied[passageIndex];
      if (!shard || shard.schema_version !== "mhc-runtime/v1" || shard.validation_status !== "valid" ||
          !["in_review", "approved"].includes(shard.review_status) || shard.book_id !== passage.bookId ||
          shard.chapter !== passage.chapter || !substantiveStudyText(shard.source_layer_note, 5)) return false;
      const records = shard.records && typeof shard.records === "object" ? shard.records : {};
      const atoms = shard.source_atoms && typeof shard.source_atoms === "object" ? shard.source_atoms : {};
      const startVerse = Number.isInteger(passage.verseStart) ? passage.verseStart : 1;
      const expectedIds = Array.from({length: passage.verseCount}, (_, index) =>
        `${passage.bookId}.${passage.chapter}.${startVerse + index}`
      );
      if (Object.keys(records).length !== expectedIds.length) return false;
      return expectedIds.every((recordId) => {
        const record = records[recordId];
        if (!record || !substantiveStudyText(record.blurb, 4) ||
            !substantiveStudyText(record.scope_note, 2) || !String(record.source_reference_label || "").trim() ||
            !Array.isArray(record.source_unit_ids) || !record.source_unit_ids.length ||
            !Array.isArray(record.source_atom_ids) || !record.source_atom_ids.length) return false;
        return record.source_atom_ids.every((atomId) => {
          const atom = atoms[atomId];
          return Boolean(atom && atom.source_unit_id && atom.source_reference_label && substantiveStudyText(atom.text, 3));
        });
      });
    });
  }

  function bookCommentaryIsComplete(commentary, entry) {
    const shard = commentary && commentary.bookCommentary;
    const resource = shard && shard.resource;
    return Boolean(entry && entry.kind === "book_intro" && shard && shard.schema_version === "mhc-runtime/v1" &&
      shard.validation_status === "valid" && ["in_review", "approved"].includes(shard.review_status) &&
      resource && resource.book_id === entry.bookId && resource.resource_type === "book_intro" &&
      substantiveStudyText(resource.blurb, 20) && Array.isArray(resource.source_unit_ids) && resource.source_unit_ids.length &&
      String(resource.source_reference_label || "").trim());
  }

  function citedPreparationSourceIds(commentary) {
    const ids = new Set();
    const add = (values) => (Array.isArray(values) ? values : []).forEach((value) => {
      if (typeof value === "string" && value) ids.add(value);
    });
    add(commentary && commentary.dailyIntroduction && commentary.dailyIntroduction.sourceIds);
    (commentary && commentary.commentarySummary && Array.isArray(commentary.commentarySummary.paragraphs)
      ? commentary.commentarySummary.paragraphs : []).forEach((paragraph) => add(paragraph.sourceIds));
    add(commentary && commentary.practicalTakeaway && commentary.practicalTakeaway.sourceIds);
    add(commentary && commentary.comprehensiveSynthesis && commentary.comprehensiveSynthesis.sourceIds);
    add(commentary && commentary.henrySourceLink ? [commentary.henrySourceLink.sourceId] : []);
    return ids;
  }

  function readingPreparationReport(payload, entryInput) {
    const commentary = payload && (payload.commentary || payload.metadata);
    const entry = preparationEntry(entryInput, commentary);
    const expectedReadingId = entry && entry.readingId;
    const generation = commentary && commentary.generation;
    const metadataReady = Boolean(commentary && commentary.readingId &&
      (!expectedReadingId || commentary.readingId === expectedReadingId) && commentary.schemaVersion === "commentary/v3" &&
      ["draft", "reviewed", "published"].includes(commentary.publicationStatus) && generation &&
      ["in_review", "approved"].includes(generation.humanReviewStatus) &&
      /^[a-f0-9]{64}$/.test(String(generation.contentHash || "")));
    const introduction = commentary && commentary.dailyIntroduction;
    const summaryParagraphs = commentary && commentary.commentarySummary &&
      Array.isArray(commentary.commentarySummary.paragraphs) ? commentary.commentarySummary.paragraphs : [];
    const takeaway = commentary && commentary.practicalTakeaway;
    const synthesis = commentary && commentary.comprehensiveSynthesis;
    const citedSourceIds = citedPreparationSourceIds(commentary);
    const sources = payload && Array.isArray(payload.sources) ? payload.sources : [];
    const henrySourceLinkReady = Boolean(normalizedHenrySourceLink(commentary && commentary.henrySourceLink, entry, sources));
    const sourceById = new Map(sources.map((source) => [source && source.sourceId, source]));
    const sourceRecordsReady = metadataReady && citedSourceIds.size >= 2 &&
      [...citedSourceIds].every((sourceId) => {
        const source = sourceById.get(sourceId);
        return Boolean(source && String(source.title || "").trim() && String(source.urlOrCitation || "").trim());
      });
    const components = [
      {id: "metadata", label: "reviewed study metadata", ready: metadataReady},
      {
        id: "orientation",
        label: "orientation",
        ready: metadataReady && introduction && substantiveStudyText(introduction.markdown, 20) &&
          Array.isArray(introduction.sourceIds) && introduction.sourceIds.length > 0
      },
      entry && entry.kind === "book_intro"
        ? {id: "book-overview", label: "Matthew Henry book overview", ready: metadataReady && bookCommentaryIsComplete(commentary, entry)}
        : {id: "scripture", label: "ESV passage configuration", ready: chapterPassagesAreConfigured(entry)},
      ...(entry && entry.kind === "book_intro" ? [] : [{
        id: "henry",
        label: henrySourceLinkReady
          ? "verified full Matthew Henry chapter link"
          : "Matthew Henry verse commentary with full source text",
        ready: metadataReady && (verseCommentaryIsComplete(commentary, entry) || henrySourceLinkReady)
      }]),
      {
        id: "main-synthesis",
        label: "main commentary synthesis",
        ready: metadataReady && summaryParagraphs.length > 0 &&
          summaryParagraphs.every((paragraph) => substantiveStudyText(paragraph.markdown, 20) &&
            Array.isArray(paragraph.sourceIds) && paragraph.sourceIds.length > 0)
      },
      {
        id: "verse-of-the-day",
        label: "verse of the day",
        ready: entry && entry.kind === "book_intro" ? true : metadataReady && Boolean(normalizedVerseOfTheDay(commentary && commentary.verseOfTheDay, entry))
      },
      {
        id: "takeaway",
        label: "practical takeaway",
        ready: metadataReady && takeaway && substantiveStudyText(takeaway.markdown, 5) &&
          Array.isArray(takeaway.sourceIds) && takeaway.sourceIds.length > 0
      },
      {
        id: "comprehensive-synthesis",
        label: "comprehensive synthesis",
        ready: metadataReady && synthesis && substantiveStudyText(synthesis.markdown, 100) &&
          Array.isArray(synthesis.sourceIds) && synthesis.sourceIds.length > 0
      },
      {id: "sources", label: "traceable source records", ready: sourceRecordsReady}
    ];
    const missing = components.filter((component) => !component.ready);
    return {
      schemaVersion: READING_PREPARATION_SCHEMA,
      readingId: expectedReadingId || commentary && commentary.readingId || null,
      prepared: missing.length === 0,
      components,
      missingComponentIds: missing.map((component) => component.id),
      missingComponents: missing.map((component) => component.label)
    };
  }

  function readingContentIsPrepared(payload, entryInput) {
    return readingPreparationReport(payload, entryInput).prepared;
  }

  function evaluateContentReadiness(entriesInput, payloadsInput, startIndexInput, targetInput) {
    const entries = Array.isArray(entriesInput) ? entriesInput : [];
    const payloads = payloadsInput instanceof Map
      ? payloadsInput
      : new Map(Object.entries(payloadsInput && typeof payloadsInput === "object" ? payloadsInput : {}));
    const startIndex = Math.min(entries.length, Math.max(0, Number.isInteger(startIndexInput) ? startIndexInput : 0));
    const remaining = entries.length - startIndex;
    const target = Math.min(remaining, Math.max(0, Number.isInteger(targetInput) ? targetInput : 3));
    let consecutiveReady = 0;
    let nextGapEntry = null;
    let nextGapReport = null;
    const reports = [];
    for (let offset = 0; offset < target; offset += 1) {
      const entry = entries[startIndex + offset];
      const report = readingPreparationReport(entry && payloads.get(entry.readingId), entry || null);
      reports.push(report);
      if (!entry || !report.prepared) {
        nextGapEntry = entry || null;
        nextGapReport = report;
        break;
      }
      consecutiveReady += 1;
    }
    return {
      consecutiveReady,
      target,
      readyThroughEntry: consecutiveReady ? entries[startIndex + consecutiveReady - 1] : null,
      nextGapEntry,
      nextGapReport,
      reports,
      state: target === 0 || consecutiveReady >= target ? "green" : consecutiveReady === 0 ? "critical" : "warning"
    };
  }

  function currentContentReadiness(payloadsInput) {
    const entries = state.plan && Array.isArray(state.plan.entries) ? state.plan.entries : [];
    if (!entries.length || !state.schedule) {
      return {...evaluateContentReadiness([], payloadsInput, 0, 0), currentPlanDay: false};
    }
    const scheduleComplete = state.schedule.status === "pilot_complete";
    const calendarIndex = Math.min(entries.length - 1, Math.max(0, state.schedule.calendarDayIndex - 1));
    const startsTomorrow = state.schedule.status === "active";
    const startIndex = scheduleComplete ? entries.length : startsTomorrow ? Math.min(entries.length, calendarIndex + 1) : 0;
    const configuredTarget = Number.isInteger(state.config && state.config.preparedAheadDays)
      ? Math.max(1, Math.min(7, state.config.preparedAheadDays))
      : 3;
    const target = scheduleComplete ? 0 : Math.min(configuredTarget, entries.length - startIndex);
    const readiness = evaluateContentReadiness(entries, payloadsInput, startIndex, target);
    return {
      ...readiness,
      currentPlanDay: state.schedule.status === "active",
      startsTomorrow,
      firstEntry: entries[startIndex] || null,
      firstReport: readiness.reports[0] || null
    };
  }

  function bootstrapRecordIsFresh(record, nowInput, credential) {
    const now = Number.isFinite(nowInput) ? nowInput : Date.now();
    return Boolean(record && record.readingId === BOOTSTRAP_CACHE_KEY &&
      record.schemaVersion === BOOTSTRAP_CACHE_SCHEMA && record.payload &&
      record.authorId && credential && credential.authorId === record.authorId &&
      Number.isFinite(Date.parse(record.expiresAt)) && Date.parse(record.expiresAt) > now &&
      record.payload.session && record.payload.session.authorId === record.authorId);
  }

  async function cachedBootstrapForCredential(credential) {
    const record = await state.store.get("privateContent", BOOTSTRAP_CACHE_KEY);
    if (!bootstrapRecordIsFresh(record, Date.now(), credential)) {
      if (record) await state.store.delete("privateContent", BOOTSTRAP_CACHE_KEY);
      return null;
    }
    return record.payload;
  }

  async function persistBootstrap(bootstrap) {
    const maxAgeSeconds = Number(bootstrap && bootstrap.config &&
      bootstrap.config.privateContentCacheMaxAgeSeconds || 0);
    if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0 || maxAgeSeconds > 1209600) return;
    const cachedAt = new Date();
    const session = bootstrap.session || {};
    const payload = {
      mode: bootstrap.mode,
      appBuildId: bootstrap.appBuildId,
      appUrl: bootstrap.appUrl,
      config: bootstrap.config,
      plan: bootstrap.plan,
      providerPolicy: bootstrap.providerPolicy,
      session: {authorId: session.authorId, displayName: session.displayName},
      participants: (bootstrap.participants || []).map((participant) => ({
        authorId: participant.authorId,
        displayName: participant.displayName
      })),
      sources: bootstrap.sources || []
    };
    await state.store.put("privateContent", {
      readingId: BOOTSTRAP_CACHE_KEY,
      schemaVersion: BOOTSTRAP_CACHE_SCHEMA,
      authorId: session.authorId,
      planVersion: bootstrap.plan.planVersion,
      cachedAt: cachedAt.toISOString(),
      expiresAt: new Date(cachedAt.getTime() + maxAgeSeconds * 1000).toISOString(),
      payload
    });
  }

  async function cachedPrivatePayload(readingId) {
    const record = await state.store.get("privateContent", readingId);
    const context = privateCacheContext();
    const contextMatches = record && (record.cacheContext === context ||
      (!record.cacheContext && context === "apps-script"));
    if (!contextMatches || !privateRecordIsFresh(record, Date.now(), state.plan && state.plan.planVersion)) {
      if (record) await state.store.delete("privateContent", readingId);
      state.privatePayloadByReadingId.delete(readingId);
      return null;
    }
    state.privatePayloadByReadingId.set(readingId, record.payload);
    return record.payload;
  }

  function privatePayloadRevision(payload) {
    const commentary = payload && (payload.commentary || payload.metadata);
    if (!commentary) return "";
    return [
      commentary.commentaryVersion || "",
      commentary.generation && commentary.generation.contentHash || "",
      commentary.verseCommentary && commentary.verseCommentary.generation_timestamp || "",
      ...(Array.isArray(commentary.verseCommentaries)
        ? commentary.verseCommentaries.map((shard) => shard && shard.generation_timestamp || "") : []),
      commentary.henrySourceLink && commentary.henrySourceLink.url || "",
      commentary.bookCommentary && commentary.bookCommentary.generation_timestamp || ""
    ].join(":");
  }

  function privatePayloadNeedsBlockingRefresh(payload) {
    const commentary = payload && (payload.commentary || payload.metadata);
    const generation = commentary && commentary.generation;
    return !commentary || commentary.publicationStatus === "placeholder" ||
      !generation || !["in_review", "approved"].includes(generation.humanReviewStatus) ||
      !/^[a-f0-9]{64}$/.test(String(generation.contentHash || ""));
  }

  async function persistPrivatePayload(readingId, payload) {
    const previous = state.privatePayloadByReadingId.get(readingId);
    state.privatePayloadByReadingId.set(readingId, payload);
    const maxAgeSeconds = Number(state.config && state.config.privateContentCacheMaxAgeSeconds || 0);
    if (Number.isInteger(maxAgeSeconds) && maxAgeSeconds > 0 && maxAgeSeconds <= 1209600) {
      const cachedAt = new Date();
      await state.store.put("privateContent", {
        readingId,
        cacheContext: privateCacheContext(),
        planVersion: state.plan.planVersion,
        cachedAt: cachedAt.toISOString(),
        expiresAt: new Date(cachedAt.getTime() + maxAgeSeconds * 1000).toISOString(),
        payload
      });
    }
    if (previous && privatePayloadRevision(previous) !== privatePayloadRevision(payload) &&
        state.view === "reading" && state.currentEntry && state.currentEntry.readingId === readingId) {
      const commentary = payload && (payload.commentary || payload.metadata);
      if (commentary && commentary.readingId === readingId) {
        renderCommentary(commentary, payload.sources || state.sources || []);
        setSyncStatus("Study updated to the newest version");
      }
    }
  }

  function mayUseOfflineFallback(error) {
    return !error || !["AUTH_REQUIRED", "ACCESS_DENIED", "WRONG_EXECUTION_IDENTITY", "READER_CODE_REQUIRED",
      "READER_CODE_INVALID", "CONTENT_ACCESS_DENIED"].includes(error.code);
  }

  function explicitAccessFailure(error) {
    return Boolean(error && ["AUTH_REQUIRED", "ACCESS_DENIED", "WRONG_EXECUTION_IDENTITY",
      "READER_CODE_REQUIRED", "READER_CODE_INVALID", "CONTENT_ACCESS_DENIED"].includes(error.code));
  }

  function serverCallsAllowed() {
    return Boolean(state.adapter && (state.adapter.kind === "mock" || state.serverAccessConfirmed));
  }

  async function readingPayloadWithCache(readingId) {
    const cached = await cachedPrivatePayload(readingId);
    if (cached) {
      if (serverCallsAllowed() && (!root.navigator || root.navigator.onLine !== false)) {
        if (privatePayloadNeedsBlockingRefresh(cached)) {
          try {
            const payload = await state.adapter.getReadingPayload(readingId);
            await persistPrivatePayload(readingId, payload);
            return {payload, source: "network"};
          } catch (error) {
            if (!mayUseOfflineFallback(error)) throw error;
          }
        } else {
          state.adapter.getReadingPayload(readingId)
            .then((payload) => persistPrivatePayload(readingId, payload))
            .catch(() => {});
        }
      }
      return {payload: cached, source: "cache"};
    }
    if (!serverCallsAllowed()) {
      throw appError("This reading has not been downloaded and secure access is not yet confirmed.", "OFFLINE_CONTENT_UNAVAILABLE");
    }
    try {
      const payload = await state.adapter.getReadingPayload(readingId);
      await persistPrivatePayload(readingId, payload);
      return {payload, source: "network"};
    } catch (error) {
      if (!mayUseOfflineFallback(error)) throw error;
      const fallback = await cachedPrivatePayload(readingId);
      if (!fallback) throw error;
      return {payload: fallback, source: "cache"};
    }
  }

  function syncScriptureMemoryWindow() {
    const entries = priorityReadingEntries(state.plan, state.schedule, HOT_READING_COUNT);
    const allowed = new Set(entries.filter((entry) => entry.kind === "chapter").map((entry) => entry.readingId));
    for (const readingId of state.scriptureMemoryByReadingId.keys()) {
      if (!allowed.has(readingId)) state.scriptureMemoryByReadingId.delete(readingId);
    }
    return entries;
  }

  function resetScriptureMemory() {
    state.scriptureMemoryEpoch += 1;
    state.scriptureMemoryByReadingId = new Map();
    state.scriptureRequestByReadingId = new Map();
    state.priorityPrefetchPromise = null;
  }

  async function getScriptureForReading(entry) {
    syncScriptureMemoryWindow();
    const remembered = state.scriptureMemoryByReadingId.get(entry.readingId);
    if (remembered) return {scripture: remembered, source: "memory"};
    let pending = state.scriptureRequestByReadingId.get(entry.readingId);
    if (!pending) {
      const memoryEpoch = state.scriptureMemoryEpoch;
      pending = state.adapter.getScripture(entry.readingId)
        .then((scripture) => {
          if (scripture && scripture.readingId && scripture.readingId !== entry.readingId) {
            throw appError("Scripture did not match the requested reading.", "CONTENT_MISMATCH");
          }
          const currentPriorityIds = new Set(priorityReadingEntries(state.plan, state.schedule, HOT_READING_COUNT)
            .map((candidate) => candidate.readingId));
          if (scripture && scripture.available !== false &&
              ["ESV", "MOCK"].includes(scripture.translation) && memoryEpoch === state.scriptureMemoryEpoch &&
              currentPriorityIds.has(entry.readingId)) {
            state.scriptureMemoryByReadingId.set(entry.readingId, scripture);
          }
          return {scripture, source: "network"};
        })
        .finally(() => state.scriptureRequestByReadingId.delete(entry.readingId));
      state.scriptureRequestByReadingId.set(entry.readingId, pending);
    }
    return pending;
  }

  async function loadScripture(entry) {
    const token = ++state.scriptureRequestToken;
    state.currentScripture = null;
    notifyHighlightEnhancer();
    const scriptureState = element("scriptureState");
    scriptureState.hidden = false;
    scriptureState.dataset.state = "info";
    scriptureState.textContent = state.adapter.kind === "mock"
      ? "Loading fabricated development text…"
      : "Retrieving official ESV text through the authenticated server…";
    element("scriptureContent").replaceChildren();
    prepareVerseOfTheDay();
    if (!serverCallsAllowed()) {
      renderScriptureUnavailable("ESV Scripture requires a confirmed connection. Saved commentary is available while access is checked in the background.");
      return;
    }
    try {
      const result = await getScriptureForReading(entry);
      const scripture = result.scripture;
      if (token !== state.scriptureRequestToken || state.currentEntry.readingId !== entry.readingId) return;
      if (scripture && scripture.available === false) throw appError("Scripture provider is unavailable.", scripture.code || "ESV_UNAVAILABLE");
      renderScripture(scripture, result.source);
      if (result.source !== "memory") await persistScripture(scripture);
    } catch {
      if (token !== state.scriptureRequestToken || state.currentEntry.readingId !== entry.readingId) return;
      const cached = state.adapter.kind === "apps-script" && state.policy.offlinePersistenceAllowed
        ? await cachedScripture(entry.readingId)
        : null;
      if (cached) renderScripture(cached, "cache");
      else renderScriptureUnavailable("ESV Scripture is unavailable. Retry when connected or open the passage on ESV.org; no alternate translation will be substituted.");
    }
  }

  function fullCalendarDate(value) {
    const parts = parseDateOnly(value);
    return new Intl.DateTimeFormat(undefined, {
      timeZone: "UTC",
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)));
  }

  function monthHeading(value) {
    const parts = parseDateOnly(value);
    return new Intl.DateTimeFormat(undefined, {
      timeZone: "UTC",
      month: "long",
      year: "numeric"
    }).format(new Date(Date.UTC(parts.year, parts.month - 1, 1, 12)));
  }

  function shiftMonth(value, offset) {
    const parts = parseDateOnly(value);
    const date = new Date(Date.UTC(parts.year, parts.month - 1 + offset, 1));
    return dateOnlyFromParts({year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: 1});
  }

  function shortOpenDate(value) {
    const parts = parseDateOnly(value);
    return new Intl.DateTimeFormat(undefined, {
      timeZone: "UTC",
      month: "long",
      day: "numeric"
    }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)));
  }

  function completionSet(readingId) {
    return state.completionByReadingId.get(readingId) || new Set();
  }

  function deriveCurrentReaderCompletion() {
    const completed = new Set();
    if (!state.session) return completed;
    state.completionByReadingId.forEach((authors, readingId) => {
      if (authors.has(state.session.authorId)) completed.add(readingId);
    });
    return completed;
  }

  function selectCalendarDate(date, options) {
    state.selectedCalendarDate = date;
    renderCalendar();
    if (options && options.focus) element("openSelectedReading").focus({preventScroll: true});
  }

  function renderCalendarLegend() {
    const legend = element("calendarParticipantLegend");
    legend.replaceChildren();
    state.calendarParticipants.forEach((participant, index) => {
      const item = root.document.createElement("span");
      const dot = root.document.createElement("span");
      dot.className = `participant-dot participant-color-${index}`;
      dot.dataset.complete = "true";
      dot.setAttribute("aria-hidden", "true");
      item.append(dot, root.document.createTextNode(participant.displayName));
      legend.appendChild(item);
    });
    const note = root.document.createElement("span");
    note.className = "calendar-legend-note";
    note.textContent = "Filled dot = commented";
    legend.appendChild(note);
  }

  function showSelectedDayVerse(selection, entry, scripture, pendingMessage) {
    const panel = element("selectedDayVerse");
    if (!selection || !entry) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const link = element("selectedDayVerseLink");
    const isMock = scripture && scripture.isMock === true && scripture.translation === "MOCK";
    link.textContent = `${verseReferenceLabel(selection)} · ${isMock ? "MOCK" : "ESV"}`;
    link.href = verseOfDayEsvUrl(selection);
    const verseText = verseTextFromScripture(scripture, selection);
    const quote = element("selectedDayVerseText");
    const notice = element("selectedDayVerseNoticeDisclosure");
    if (verseText) {
      quote.textContent = verseText;
      quote.hidden = false;
      element("selectedDayVerseStatus").textContent = isMock
        ? "FABRICATED DEVELOPMENT TEXT — not ESV and not a Bible translation."
        : "ESV · prefetched in memory for this session.";
      notice.hidden = isMock;
    } else {
      quote.textContent = "";
      quote.hidden = true;
      notice.hidden = true;
      element("selectedDayVerseStatus").textContent = pendingMessage ||
        "Open this reading to stream the exact ESV wording; no alternate translation will be substituted.";
    }
  }

  async function loadSelectedDayVerse(day, token) {
    let payload = state.privatePayloadByReadingId.get(day.entry.readingId) ||
      await cachedPrivatePayload(day.entry.readingId);
    if (token !== state.selectedVerseRequestToken || state.selectedCalendarDate !== day.date) return;
    if (!payload && serverCallsAllowed()) {
      try {
        let pending = state.privatePayloadRequestByReadingId.get(day.entry.readingId);
        if (!pending) {
          pending = state.adapter.getReadingPayload(day.entry.readingId)
            .then(async (result) => {
              await persistPrivatePayload(day.entry.readingId, result);
              return result;
            })
            .finally(() => state.privatePayloadRequestByReadingId.delete(day.entry.readingId));
          state.privatePayloadRequestByReadingId.set(day.entry.readingId, pending);
        }
        payload = await pending;
      } catch {
        payload = null;
      }
    }
    if (token !== state.selectedVerseRequestToken || state.selectedCalendarDate !== day.date) return;
    const selection = selectedDayVerseSelection(payload, day.entry);
    if (selection) {
      const remembered = state.scriptureMemoryByReadingId.get(day.entry.readingId);
      if (remembered) {
        showSelectedDayVerse(selection, day.entry, remembered);
        return;
      }
      const isPriorityReading = priorityReadingEntries(state.plan, state.schedule, HOT_READING_COUNT)
        .some((entry) => entry.readingId === day.entry.readingId);
      showSelectedDayVerse(selection, day.entry, null, isPriorityReading
        ? "Warming the live ESV verse for today and tomorrow…"
        : "Open this reading to stream the exact ESV wording; no alternate translation will be substituted.");
      if (!isPriorityReading || !serverCallsAllowed()) return;
      try {
        const result = await getScriptureForReading(day.entry);
        if (token !== state.selectedVerseRequestToken || state.selectedCalendarDate !== day.date) return;
        if (!result.scripture || result.scripture.available === false) {
          throw appError("Scripture provider is unavailable.", result.scripture && result.scripture.code || "ESV_UNAVAILABLE");
        }
        showSelectedDayVerse(selection, day.entry, result.scripture);
      } catch {
        if (token !== state.selectedVerseRequestToken || state.selectedCalendarDate !== day.date) return;
        showSelectedDayVerse(selection, day.entry, null,
          "The ESV verse could not be prefetched. Open the reading to retry when connected.");
      }
    } else {
      const panel = element("selectedDayVerse");
      panel.hidden = false;
      element("selectedDayVerseLink").removeAttribute("href");
      element("selectedDayVerseLink").textContent = "Selection unavailable";
      element("selectedDayVerseText").hidden = true;
      element("selectedDayVerseNoticeDisclosure").hidden = true;
      element("selectedDayVerseStatus").textContent = "The verse selection will appear when this reading's study notes are available.";
    }
  }

  function renderSelectedDayVerse(day) {
    const token = ++state.selectedVerseRequestToken;
    const panel = element("selectedDayVerse");
    if (!day || !day.entry || day.entry.kind !== "chapter") {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    element("selectedDayVerseLink").removeAttribute("href");
    element("selectedDayVerseLink").textContent = "Loading selection…";
    element("selectedDayVerseText").hidden = true;
    element("selectedDayVerseNoticeDisclosure").hidden = true;
    element("selectedDayVerseStatus").textContent = "Checking the private study metadata saved on this device.";
    loadSelectedDayVerse(day, token).catch(() => {});
  }

  function contentDiagnosticsArePrivateToOwner() {
    return Boolean(state.session && String(state.session.authorId || "").toLowerCase() === "dustin");
  }

  function preparationDateForEntry(entry) {
    if (!entry || !state.schedule || !state.schedule.effectiveStartDate || !Number.isInteger(entry.dayIndex)) return null;
    return dateOnlyForDay(state.schedule.effectiveStartDate, entry.dayIndex - 1);
  }

  function preparationEntryDescription(entry) {
    if (!entry) return "the next scheduled reading";
    const date = preparationDateForEntry(entry);
    return `${titleForEntry(entry)}${date ? ` on ${fullCalendarDate(date)}` : ""}`;
  }

  function conciseMissingComponents(report) {
    const missing = report && Array.isArray(report.missingComponents) ? report.missingComponents : [];
    if (!missing.length) return "one or more required study components";
    const visible = missing.slice(0, 4);
    const list = visible.length === 1
      ? visible[0]
      : visible.length === 2
        ? `${visible[0]} and ${visible[1]}`
        : `${visible.slice(0, -1).join(", ")}, and ${visible[visible.length - 1]}`;
    return missing.length > visible.length ? `${list}, plus ${missing.length - visible.length} more` : list;
  }

  function renderContentReadiness(readiness) {
    const alert = element("contentReadinessAlert");
    if (!readiness || readiness.state === "green" || readiness.target === 0) {
      alert.hidden = true;
      return;
    }
    alert.hidden = false;
    alert.dataset.state = readiness.state;
    const firstReady = Boolean(readiness.firstReport && readiness.firstReport.prepared);
    const firstLabel = readiness.startsTomorrow ? "Tomorrow's study" : "The first scheduled study";
    element("contentReadinessTitle").textContent = firstReady
      ? `${firstLabel} is ready`
      : `${firstLabel} needs attention`;
    if (contentDiagnosticsArePrivateToOwner()) {
      const gap = readiness.nextGapEntry;
      const gapDescription = preparationEntryDescription(gap);
      const missing = conciseMissingComponents(readiness.nextGapReport);
      element("contentReadinessMessage").textContent = firstReady
        ? `${preparationEntryDescription(readiness.firstEntry)} is fully prepared. The first later gap is ${gapDescription}; it is missing ${missing}.`
        : `${gapDescription} is missing ${missing}. Its configured ESV passage and discussion remain available while the study material is completed.`;
    } else {
      element("contentReadinessMessage").textContent = firstReady
        ? `${firstLabel} is fully prepared; a later reading is still being prepared.`
        : `${firstLabel} is still being prepared. Its configured ESV passage and discussion remain available.`;
    }
  }

  function renderSelectedDay(day) {
    const button = element("openSelectedReading");
    element("selectedDayDate").textContent = fullCalendarDate(day.date);
    element("selectedDayTitle").textContent = day.entry ? titleForEntry(day.entry) : "No reading scheduled";
    element("selectedDayPosition").textContent = day.entry
      ? day.entry.sourcePlanDay
        ? `Original plan day ${day.entry.sourcePlanDay} of 92 · Bridge day ${day.entry.dayIndex} of ${state.plan.entries.length}`
        : `Day ${day.entry.dayIndex} of ${state.plan.entries.length}`
      : "This date is outside the current active reading plan.";
    const completion = element("selectedDayCompletion");
    completion.replaceChildren();
    const completedAuthors = day.entry ? completionSet(day.entry.readingId) : new Set();
    state.calendarParticipants.forEach((participant, index) => {
      const row = root.document.createElement("div");
      row.className = "selected-reader-status";
      const identity = root.document.createElement("span");
      const dot = root.document.createElement("span");
      const complete = completedAuthors.has(participant.authorId);
      dot.className = `participant-dot participant-color-${index}`;
      dot.dataset.complete = complete ? "true" : "false";
      dot.setAttribute("aria-hidden", "true");
      identity.append(dot, root.document.createTextNode(participant.displayName));
      const status = root.document.createElement("strong");
      status.textContent = day.entry ? complete ? "Completed" : "Not completed" : "No reading";
      row.append(identity, status);
      completion.appendChild(row);
    });
    const canOpen = Boolean(day.entry && day.accessible);
    button.disabled = !canOpen;
    button.dataset.readingId = canOpen ? day.entry.readingId : "";
    button.textContent = canOpen
      ? `Open ${shortOpenDate(day.date)} reading`
      : day.entry ? `Reading unavailable on ${shortOpenDate(day.date)}` : `No reading on ${shortOpenDate(day.date)}`;
    if (canOpen) button.setAttribute("aria-label", `Open ${fullCalendarDate(day.date)} reading: ${titleForEntry(day.entry)}`);
    else button.removeAttribute("aria-label");
    renderSelectedDayVerse(day);
  }

  function renderCalendar() {
    if (!state.plan || !state.config) return;
    if (!state.calendarMonthDate) {
      const today = datePartsInTimeZone(new Date(), state.config.timezone);
      state.calendarMonthDate = dateOnlyFromParts({...today, day: 1});
    }
    state.completedReadingIds = deriveCurrentReaderCompletion();
    const calendar = buildMonthCalendar(state.plan, state.config, new Date(), state.completedReadingIds, state.calendarMonthDate);
    state.calendarWindow = calendar;
    state.calendarMonthDate = calendar.monthStart;
    element("calendarMonthHeading").textContent = monthHeading(calendar.monthStart);
    element("previousMonth").setAttribute("aria-label", `Show ${monthHeading(shiftMonth(calendar.monthStart, -1))}`);
    element("nextMonth").setAttribute("aria-label", `Show ${monthHeading(shiftMonth(calendar.monthStart, 1))}`);
    element("calendarSummary").textContent = "Select a date to see its reading and whether Dustin and Shane have completed it.";

    const selectionInMonth = calendar.days.find((day) => day.inCurrentMonth && day.date === state.selectedCalendarDate);
    if (!selectionInMonth) {
      const today = calendar.days.find((day) => day.inCurrentMonth && day.isToday);
      const scheduled = calendar.days.find((day) => day.inCurrentMonth && day.entry);
      state.selectedCalendarDate = (today || scheduled || calendar.days.find((day) => day.inCurrentMonth)).date;
    }
    const weeks = element("calendarWeeks");
    weeks.replaceChildren();
    calendar.weeks.forEach((days) => {
      const row = root.document.createElement("div");
      row.className = "calendar-week";
      days.forEach((day) => {
        const button = root.document.createElement("button");
        button.type = "button";
        button.className = "calendar-day";
        button.dataset.status = day.status;
        button.dataset.date = day.date;
        button.dataset.today = day.isToday ? "true" : "false";
        button.dataset.currentMonth = day.inCurrentMonth ? "true" : "false";
        button.dataset.hasReading = day.entry ? "true" : "false";
        button.dataset.selected = day.date === state.selectedCalendarDate ? "true" : "false";
        button.disabled = !day.inCurrentMonth;
        button.setAttribute("aria-pressed", day.date === state.selectedCalendarDate ? "true" : "false");

        const number = root.document.createElement("span");
        number.className = "calendar-day-number";
        number.textContent = String(parseDateOnly(day.date).day);
        const dots = root.document.createElement("span");
        dots.className = "calendar-day-dots";
        const completedAuthors = day.entry ? completionSet(day.entry.readingId) : new Set();
        state.calendarParticipants.forEach((participant, index) => {
          const dot = root.document.createElement("span");
          dot.className = `participant-dot participant-color-${index}`;
          dot.dataset.complete = completedAuthors.has(participant.authorId) ? "true" : "false";
          dot.setAttribute("aria-hidden", "true");
          dots.appendChild(dot);
        });
        button.append(number, dots);

        const descriptors = day.entry
          ? [fullCalendarDate(day.date), day.shortTitle, day.accessible ? "Reading available" : "Reading locked"]
          : [fullCalendarDate(day.date), "No scheduled reading"];
        state.calendarParticipants.forEach((participant) => {
          descriptors.push(`${participant.displayName}: ${completedAuthors.has(participant.authorId) ? "completed" : "not completed"}`);
        });
        if (day.isToday) descriptors.push("Today");
        button.setAttribute("aria-label", descriptors.join(". "));
        if (day.inCurrentMonth) button.addEventListener("click", () => selectCalendarDate(day.date));
        row.appendChild(button);
      });
      weeks.appendChild(row);
    });
    renderCalendarLegend();
    renderSelectedDay(calendar.days.find((day) => day.date === state.selectedCalendarDate));
  }

  async function localCompletionForReadings(readingIds) {
    const [savedCompletion, snapshots, outbox] = await Promise.all([
      state.store.getAll("calendarCompletion"),
      state.store.getAll("commentSnapshot"),
      state.store.getAll("commentOutbox")
    ]);
    const currentSnapshots = snapshots.filter((item) => !item.planVersion || item.planVersion === state.plan.planVersion);
    const currentOutbox = outbox.filter((item) => !item.planVersion || item.planVersion === state.plan.planVersion);
    const allowedParticipants = new Set(state.calendarParticipants.map((participant) => participant.authorId));
    const completionByReadingId = new Map(readingIds.map((readingId) => [readingId, new Set()]));
    savedCompletion
      .filter((item) => item.planVersion === state.plan.planVersion && completionByReadingId.has(item.readingId))
      .forEach((item) => {
        const authors = completionByReadingId.get(item.readingId);
        if (item.completionByAuthorId && typeof item.completionByAuthorId === "object") {
          allowedParticipants.forEach((authorId) => {
            if (item.completionByAuthorId[authorId] === true) authors.add(authorId);
          });
        } else if (allowedParticipants.has(item.authorId) && item.completed) {
          authors.add(item.authorId);
        }
      });
    const pendingReadingIds = new Set(currentOutbox.map((item) => item.readingId));
    pendingReadingIds.forEach((readingId) => {
      if (!completionByReadingId.has(readingId)) return;
      const authors = completionByReadingId.get(readingId);
      if (readingHasActiveComment(currentSnapshots, currentOutbox, state.session.authorId, readingId)) authors.add(state.session.authorId);
      else authors.delete(state.session.authorId);
    });
    return {completionByReadingId, snapshots: currentSnapshots, outbox: currentOutbox};
  }

  async function persistCalendarCompletion(readingIds, completionByReadingId) {
    const syncedAt = new Date().toISOString();
    for (const readingId of readingIds) {
      const authors = completionByReadingId.get(readingId) || new Set();
      await state.store.put("calendarCompletion", {
        readingId,
        planVersion: state.plan.planVersion,
        completionByAuthorId: Object.fromEntries(
          state.calendarParticipants.map((participant) => [participant.authorId, authors.has(participant.authorId)])
        ),
        syncedAt
      });
    }
  }

  async function hydrateCalendarCompletion() {
    const ids = state.plan.entries.map((entry) => entry.readingId);
    const local = await localCompletionForReadings(ids);
    state.completionByReadingId = local.completionByReadingId;
    state.completedReadingIds = deriveCurrentReaderCompletion();
    renderCalendar();
    element("calendarStatus").textContent = Array.from(state.completionByReadingId.values()).some((authors) => authors.size)
      ? "Showing both readers’ saved progress while the shared discussion updates."
      : "Calendar is ready; checking the shared discussion for completed days.";
  }

  async function syncCalendarCompletion() {
    if (!state.plan || !state.session || !state.calendarWindow) return;
    if (!serverCallsAllowed()) {
      await hydrateCalendarCompletion();
      element("calendarStatus").textContent = "Saved progress is ready · confirming shared comments in the background.";
      setSyncStatus("Saved data ready · confirming access");
      return;
    }
    if (state.calendarSyncPromise) return state.calendarSyncPromise;
    const run = async () => {
      const button = element("refreshCalendar");
      button.disabled = true;
      element("calendarStatus").textContent = "Checking the shared comments for completed days…";
      const readingIds = Array.from(new Set(
        state.calendarWindow.days.filter((day) => day.entry).map((day) => day.entry.readingId)
      ));
      if (!readingIds.length) {
        element("calendarStatus").textContent = "No readings are scheduled in this month.";
        button.disabled = false;
        return;
      }
      try {
        const activity = await state.adapter.listCommentActivity(readingIds);
        if (!activity || activity.planVersion !== state.plan.planVersion ||
            !Array.isArray(activity.participants) || !activity.completedByReadingId || typeof activity.completedByReadingId !== "object") {
          throw appError("Comment activity did not match the active plan.", "COMMENT_ACTIVITY_INVALID");
        }
        const allowed = new Set(readingIds);
        const expectedParticipants = state.calendarParticipants.map((participant) => participant.authorId);
        const returnedParticipants = activity.participants.map((participant) => participant && participant.authorId);
        if (JSON.stringify(returnedParticipants) !== JSON.stringify(expectedParticipants)) {
          throw appError("Comment activity returned an unexpected reader list.", "COMMENT_ACTIVITY_INVALID");
        }
        const completionByReadingId = new Map(state.completionByReadingId);
        readingIds.forEach((readingId) => {
          const authors = activity.completedByReadingId[readingId];
          if (!Array.isArray(authors) || authors.some((authorId) => !expectedParticipants.includes(authorId))) {
            throw appError("Comment activity contained an invalid reader.", "COMMENT_ACTIVITY_INVALID");
          }
          completionByReadingId.set(readingId, new Set(authors));
        });
        const local = await localCompletionForReadings(readingIds);
        const pendingByReading = new Set(local.outbox.map((item) => item.readingId));
        pendingByReading.forEach((readingId) => {
          if (!allowed.has(readingId)) return;
          const localAuthors = local.completionByReadingId.get(readingId) || new Set();
          const authors = completionByReadingId.get(readingId);
          if (localAuthors.has(state.session.authorId)) authors.add(state.session.authorId);
          else authors.delete(state.session.authorId);
        });
        state.completionByReadingId = completionByReadingId;
        state.completedReadingIds = deriveCurrentReaderCompletion();
        await persistCalendarCompletion(readingIds, completionByReadingId);
        renderCalendar();
        markStartupMilestone("freshDataSynchronized");
        element("calendarStatus").textContent = "Dustin and Shane’s progress is synchronized from shared comments.";
        setSyncStatus("Calendar synchronized");
      } catch {
        await hydrateCalendarCompletion();
        element("calendarStatus").textContent = "Offline · showing both readers’ last saved progress.";
        setSyncStatus("Offline · saved calendar available");
      } finally {
        button.disabled = false;
      }
    };
    const promise = run();
    state.calendarSyncPromise = promise;
    try {
      return await promise;
    } finally {
      if (state.calendarSyncPromise === promise) state.calendarSyncPromise = null;
    }
  }

  function pageLabel(index) {
    if (index === 0) return "Orientation";
    if (index === 1) return state.currentEntry && state.currentEntry.kind === "book_intro" ? "Book introduction" : "Scripture";
    return "Commentary";
  }

  function setReadingPage(pageIndex, options) {
    const nextPage = Math.max(0, Math.min(2, Number(pageIndex) || 0));
    state.currentPage = nextPage;
    [0, 1, 2].forEach((index) => {
      const panel = element(index === 0 ? "readingPageIntro" : index === 1 ? "readingPageText" : "readingPageCommentary");
      panel.hidden = index !== nextPage;
      const step = element(`pageStep${index}`);
      if (index === nextPage) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });
    element("pagePosition").textContent = `Page ${nextPage + 1} of 3 · ${pageLabel(nextPage)}`;
    element("previousPage").disabled = nextPage === 0;
    element("nextPage").hidden = nextPage === 2;
    element("finishReading").hidden = nextPage !== 2;
    element("extendedStudy").hidden = nextPage !== 2;
    if (nextPage !== 2) {
      element("extendedStudy").querySelectorAll("details").forEach((disclosure) => {
        disclosure.open = false;
      });
    }
    element("discussionPageContext").textContent = `${pageLabel(nextPage)} · comments for this day`;
    if (!options || options.focus !== false) {
      const heading = element(nextPage === 0
        ? "overviewHeading"
        : nextPage === 1
          ? state.currentEntry && state.currentEntry.kind === "book_intro" ? "bookIntroductionHeading" : "scriptureHeading"
          : "commentarySummaryHeading");
      heading.scrollIntoView({block: "start"});
      heading.focus({preventScroll: true});
    }
  }

  function showHome(options) {
    state.view = "home";
    state.currentEntry = null;
    state.scriptureRequestToken += 1;
    state.commentSyncToken += 1;
    state.currentScripture = null;
    state.currentVerseCommentary = null;
    state.currentHenrySourceLink = null;
    notifyHighlightEnhancer();
    element("readingView").hidden = true;
    element("homeView").hidden = false;
    element("skipLink").href = "#selectedDayTitle";
    element("skipLink").textContent = "Skip to today’s reading";
    setBanner("");
    renderCalendar();
    if ((!options || options.sync !== false) && (!root.navigator || root.navigator.onLine !== false)) {
      resumeOnlineWork();
    }
    if (root.scrollTo) root.scrollTo({top: 0, behavior: "auto"});
    if (!options || options.focus !== false) element("selectedDayTitle").focus({preventScroll: true});
  }

  async function openReading(readingId, options) {
    state.view = "reading";
    element("homeView").hidden = true;
    element("readingView").hidden = false;
    element("skipLink").href = "#overviewHeading";
    element("skipLink").textContent = "Skip to the reading";
    setReadingPage(0, {focus: false});
    if (root.scrollTo) root.scrollTo({top: 0, behavior: "auto"});
    await loadReading(readingId, {testingOverride: Boolean(options && options.testingOverride)});
  }

  function renderReadingShell(schedule) {
    const entry = schedule.selectedEntry;
    state.currentEntry = entry;
    state.currentScripture = null;
    state.currentVerseCommentary = null;
    state.currentHenrySourceLink = null;
    notifyHighlightEnhancer();
    element("readingDate").textContent = formatReadingDate(schedule.readingDate);
    element("readingPosition").textContent = entry.sourcePlanDay
      ? `Original plan day ${entry.sourcePlanDay} of 92 · Bridge day ${entry.dayIndex} of ${state.plan.entries.length}`
      : `Day ${entry.dayIndex} of ${state.plan.entries.length}`;
    const passageCount = Array.isArray(entry.passages) ? entry.passages.length : 1;
    element("readingKind").textContent = entry.kind === "book_intro"
      ? "Book introduction day"
      : `${passageCount} ${passageCount === 1 ? "chapter" : "chapters"} · one daily discussion`;
    element("readingTitle").textContent = titleForEntry(entry);
    element("readingRationale").textContent = entry.orderingRationale;
    element("pageStep1Label").textContent = entry.kind === "book_intro" ? "Book intro" : "Scripture";
    element("bookIntroductionSection").hidden = entry.kind !== "book_intro";
    element("scriptureSection").hidden = entry.kind !== "chapter";
    setReadingPage(0, {focus: false});

    if (schedule.locked) {
      state.currentVerseCommentary = null;
      state.currentHenrySourceLink = null;
      setBanner("This future reading is locked by the shared plan configuration.", "info");
    } else if (schedule.usingTestingOverride) {
      setBanner("Development override is active. The shared calendar has not been changed.", "info");
    } else if (schedule.status === "before_start") {
      setBanner("The shared plan has not started yet.", "info");
    } else if (schedule.status === "pilot_complete") {
      setBanner("The currently published bridge is complete. A later reading is not active yet.", "info");
    } else {
      setBanner("");
    }
  }

  async function loadReading(requestedReadingId, options) {
    const schedule = calculateSchedule(state.plan, state.config, new Date(), requestedReadingId, options);
    state.schedule = schedule;
    renderReadingShell(schedule);
    if (schedule.locked) {
      state.verseOfTheDay = null;
      prepareVerseOfTheDay();
      replaceWithText(element("overviewContent"), "This reading will become available according to the shared calendar.");
      element("overviewSources").replaceChildren();
      replaceWithText(element("commentarySummary"), "The commentary summary will become available with the reading.");
      replaceWithText(element("practicalTakeaway"), "The practical takeaway will become available with the reading.");
      element("mainSourceNotes").replaceChildren();
      element("mainSourceDisclosure").hidden = true;
      replaceWithText(element("comprehensiveSynthesis"), "The comprehensive synthesis will become available with the reading.");
      return;
    }
    setSyncStatus("Loading reading…");
    const entry = schedule.selectedEntry;
    await loadCachedDiscussion(entry.readingId);
    refreshComments({background: true, readingId: entry.readingId}).catch(() => {});
    const result = await readingPayloadWithCache(entry.readingId);
    const payload = result.payload;
    if (state.currentEntry.readingId !== entry.readingId) return;
    const commentary = payload.commentary || payload.metadata;
    if (!commentary || commentary.readingId !== entry.readingId) {
      throw appError("Private commentary did not match the selected reading.", "CONTENT_MISMATCH");
    }
    renderCommentary(commentary, payload.sources || state.sources || []);
    if (entry.kind === "chapter") loadScripture(entry).catch(() => {});
    await loadDraft(entry.readingId);
    await updateCacheInspector();
    setSyncStatus(result.source === "cache" || (root.navigator && root.navigator.onLine === false)
      ? "Offline · cached reading and drafts available"
      : "Ready");
    element("readingTitle").focus({preventScroll: true});
  }

  async function warmPriorityWindow() {
    if (!serverCallsAllowed() || !state.plan || !state.schedule) return;
    if (state.priorityPrefetchPromise) return state.priorityPrefetchPromise;
    const run = async () => {
      const entries = syncScriptureMemoryWindow();
      if (!entries.length) return;
      for (const entry of entries) {
        await cachedPrivatePayload(entry.readingId);
      }
      try {
        // Cached bytes paint immediately, but today and tomorrow are always revalidated
        // after authorization so a private-content revision cannot remain hidden behind the offline retention window.
        const batch = await state.adapter.getReadingPayloads(entries.map((entry) => entry.readingId));
        if (!batch || batch.planVersion !== state.plan.planVersion ||
            !batch.payloads || typeof batch.payloads !== "object") {
          throw appError("Priority reading batch did not match the active plan.", "CONTENT_MISMATCH");
        }
        for (const entry of entries) {
          const payload = batch.payloads[entry.readingId];
          const commentary = payload && (payload.commentary || payload.metadata);
          if (!commentary || commentary.readingId !== entry.readingId) {
            throw appError("Priority reading batch contained mismatched content.", "CONTENT_MISMATCH");
          }
          await persistPrivatePayload(entry.readingId, payload);
        }
      } catch {
        // The cached priority payload and normal reading loader remain available offline.
      }
      await Promise.allSettled(entries.map(async (entry) => {
        const comments = await state.adapter.listComments(entry.readingId);
        await replaceCommentSnapshots(entry.readingId, comments);
      }));
      await Promise.allSettled(entries
        .filter((entry) => entry.kind === "chapter")
        .map((entry) => getScriptureForReading(entry)));
      const selectedDay = state.calendarWindow && state.calendarWindow.days
        .find((day) => day.date === state.selectedCalendarDate);
      if (state.view === "home") {
        renderContentReadiness(currentContentReadiness(state.privatePayloadByReadingId));
        if (selectedDay) renderSelectedDayVerse(selectedDay);
      }
      await updateCacheInspector();
    };
    const promise = run();
    state.priorityPrefetchPromise = promise;
    try {
      return await promise;
    } finally {
      if (state.priorityPrefetchPromise === promise) state.priorityPrefetchPromise = null;
    }
  }

  async function prefetchOfflineWindow() {
    if (!state.plan || !state.config) return;
    const target = Math.min(8, Math.max(1, Number(state.config.offlineReadingWindowDays) || 1));
    const entries = state.plan.entries;
    const calendarIndex = Math.min(entries.length - 1, Math.max(0, state.schedule.calendarDayIndex - 1));
    let startIndex = calendarIndex;
    let endIndex = Math.min(entries.length, startIndex + target);
    if (endIndex - startIndex < target) startIndex = Math.max(0, endIndex - target);
    const windowEntries = entries.slice(startIndex, endIndex);
    let contentCount = 0;
    let scriptureCount = 0;
    let scriptureEligible = 0;
    const missingEntries = [];
    const payloadByReadingId = new Map();

    for (const entry of windowEntries) {
      const payload = await cachedPrivatePayload(entry.readingId);
      if (payload) {
        contentCount += 1;
        payloadByReadingId.set(entry.readingId, payload);
      }
      else missingEntries.push(entry);
    }

    if (missingEntries.length && serverCallsAllowed()) {
      try {
        const readingIds = missingEntries.map((entry) => entry.readingId);
        const batch = await state.adapter.getReadingPayloads(readingIds);
        if (!batch || batch.planVersion !== state.plan.planVersion ||
            !batch.payloads || typeof batch.payloads !== "object") {
          throw appError("Offline reading batch did not match the active plan.", "CONTENT_MISMATCH");
        }
        for (const entry of missingEntries) {
          const payload = batch.payloads[entry.readingId];
          const commentary = payload && (payload.commentary || payload.metadata);
          if (!commentary || commentary.readingId !== entry.readingId) {
            throw appError("Offline reading batch contained mismatched content.", "CONTENT_MISMATCH");
          }
          await persistPrivatePayload(entry.readingId, payload);
          payloadByReadingId.set(entry.readingId, payload);
          contentCount += 1;
        }
      } catch {
        // A partial pack is preferable to delaying the active reading.
      }
    }

    for (const entry of windowEntries) {
      if (entry.kind === "chapter" && state.policy.offlinePersistenceAllowed) {
        scriptureEligible += 1;
        try {
          let scripture = await cachedScripture(entry.readingId);
          if (!scripture) {
            scripture = await state.adapter.getScripture(entry.readingId);
            if (scripture && scripture.available !== false) await persistScripture(scripture);
          }
          if (scripture && scripture.translation === "ESV" && await cachedScripture(entry.readingId)) scriptureCount += 1;
        } catch {
          // The provider policy or connectivity may intentionally leave Scripture online-only.
        }
      }
    }

    const scriptureStatus = state.policy.offlinePersistenceAllowed
      ? `${scriptureCount}/${scriptureEligible} chapter text records available offline`
      : "ESV text stays network-only by provider policy";
    const readiness = currentContentReadiness(payloadByReadingId);
    renderContentReadiness(readiness);
    const offlineStatus = element("offlinePackStatus");
    offlineStatus.dataset.state = contentCount === windowEntries.length ? "ready" : "warning";
    offlineStatus.textContent = `${contentCount}/${windowEntries.length} reading records downloaded · ` +
      scriptureStatus;
    await updateCacheInspector();
  }

  function scheduleOfflinePrefetch() {
    if (state.prefetchScheduled || !serverCallsAllowed()) return;
    state.prefetchScheduled = true;
    const run = () => {
      state.prefetchScheduled = false;
      prefetchOfflineWindow().catch(() => {});
    };
    if (typeof root.requestIdleCallback === "function") {
      root.requestIdleCallback(run, {timeout: 6000});
    } else {
      root.setTimeout(run, 4000);
    }
  }

  async function loadDraft(readingId) {
    const draftKey = `comment:${readingId}`;
    const record = await state.store.get("commentDrafts", draftKey);
    const body = normalizedDraftBody(record);
    if (record && typeof record.body !== "string") await state.store.delete("commentDrafts", draftKey);
    element("commentBody").value = body;
    element("draftStatus").textContent = body ? "Draft restored from this browser." : "Drafts and pending writes use IndexedDB.";
  }

  function normalizedDraftBody(record) {
    return record && typeof record.body === "string" ? record.body : "";
  }

  let draftSaveTimer = null;
  function scheduleDraftSave() {
    root.clearTimeout(draftSaveTimer);
    draftSaveTimer = root.setTimeout(async () => {
      if (!state.currentEntry) return;
      const body = element("commentBody").value;
      const draftKey = `comment:${state.currentEntry.readingId}`;
      if (body) {
        await state.store.put("commentDrafts", {draftKey, readingId: state.currentEntry.readingId, body, updatedAt: new Date().toISOString()});
        element("draftStatus").textContent = "Draft saved on this device.";
      } else {
        await state.store.delete("commentDrafts", draftKey);
        element("draftStatus").textContent = "Drafts and pending writes use IndexedDB.";
      }
      await updateCacheInspector();
    }, 250);
  }

  function formatTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Time unavailable";
    return new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeStyle: "short"}).format(date);
  }

  function commentCard(comment, pending) {
    const card = root.document.createElement("article");
    card.className = "comment-card";
    card.dataset.pending = pending ? "true" : "false";
    const meta = root.document.createElement("div");
    meta.className = "comment-meta";
    const author = root.document.createElement("strong");
    author.textContent = pending ? `${state.session.displayName} · pending` : comment.displayName;
    const time = root.document.createElement("span");
    time.textContent = pending ? "Stored on this device" : `${formatTimestamp(comment.updatedAt)} · rev ${comment.revision}`;
    meta.append(author, time);
    const body = root.document.createElement("p");
    body.className = "comment-body";
    body.textContent = pending && comment.eventType === "delete" ? "Pending deletion" : (comment.body || "");
    card.append(meta, body);

    if (!pending && comment.authorId === state.session.authorId) {
      const actions = root.document.createElement("div");
      actions.className = "comment-actions";
      const edit = root.document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit";
      edit.setAttribute("aria-label", `Edit comment by ${comment.displayName}`);
      edit.addEventListener("click", () => beginInlineEdit(comment, card, body, actions));
      const remove = root.document.createElement("button");
      remove.type = "button";
      remove.textContent = "Retract";
      remove.setAttribute("aria-label", `Retract comment by ${comment.displayName}`);
      remove.addEventListener("click", () => beginRetraction(comment, actions));
      actions.append(edit, remove);
      card.appendChild(actions);
    }
    return card;
  }

  function cancelCommentAction() {
    refreshComments().catch(() => setSyncStatus("Could not restore the discussion view"));
  }

  function beginInlineEdit(comment, card, body, actions) {
    const editor = root.document.createElement("textarea");
    editor.className = "comment-editor";
    editor.rows = 5;
    editor.maxLength = 8000;
    editor.value = comment.body || "";
    editor.setAttribute("aria-label", `Edit comment by ${comment.displayName}`);
    body.replaceWith(editor);

    const save = root.document.createElement("button");
    save.type = "button";
    save.textContent = "Save edit";
    save.addEventListener("click", async () => {
      const revised = editor.value.trim();
      if (!revised) {
        setSyncStatus("A comment cannot be empty");
        editor.focus();
        return;
      }
      save.disabled = true;
      await editComment(comment, revised);
    });
    const cancel = root.document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", cancelCommentAction);
    actions.replaceChildren(save, cancel);
    card.dataset.editing = "true";
    editor.focus();
  }

  function beginRetraction(comment, actions) {
    const message = root.document.createElement("span");
    message.className = "comment-action-prompt";
    message.textContent = "Retract this comment? Revision history will remain on the server.";
    const confirm = root.document.createElement("button");
    confirm.type = "button";
    confirm.className = "danger-button";
    confirm.textContent = "Confirm retract";
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      await deleteComment(comment);
    });
    const cancel = root.document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", cancelCommentAction);
    actions.replaceChildren(message, confirm, cancel);
    confirm.focus();
  }

  async function renderComments(pendingItems) {
    const list = element("commentList");
    list.replaceChildren();
    const pending = compactOutbox(pendingItems || []);
    const combinedCount = state.comments.length + pending.length;
    if (!combinedCount) {
      replaceWithText(list, "No comments yet for this reading.");
      return;
    }
    state.comments.forEach((comment) => list.appendChild(commentCard(comment, false)));
    pending.forEach((comment) => list.appendChild(commentCard(comment, true)));
  }

  async function replaceCommentSnapshots(readingId, comments) {
    const existing = await state.store.getAll("commentSnapshot");
    for (const snapshot of existing) {
      if (snapshot.readingId === readingId) await state.store.delete("commentSnapshot", snapshot.commentId);
    }
    for (const comment of comments || []) {
      if (comment && comment.commentId) await state.store.put("commentSnapshot", comment);
    }
  }

  function updateReadingCompletion(readingId, comments, outbox) {
    const completedAuthors = new Set();
    state.calendarParticipants.forEach((participant) => {
      const participantOutbox = participant.authorId === state.session.authorId ? outbox : [];
      if (readingHasActiveComment(comments, participantOutbox, participant.authorId, readingId)) {
        completedAuthors.add(participant.authorId);
      }
    });
    state.completionByReadingId.set(readingId, completedAuthors);
    state.completedReadingIds = deriveCurrentReaderCompletion();
    if (state.store && state.plan && state.session) {
      state.store.put("calendarCompletion", {
        readingId,
        planVersion: state.plan.planVersion,
        completionByAuthorId: Object.fromEntries(
          state.calendarParticipants.map((participant) => [participant.authorId, completedAuthors.has(participant.authorId)])
        ),
        syncedAt: new Date().toISOString()
      }).catch(() => {});
    }
    if (state.view === "home") renderCalendar();
    return completedAuthors.has(state.session.authorId);
  }

  async function loadCachedDiscussion(readingId) {
    const [snapshots, outbox] = await Promise.all([
      state.store.getAll("commentSnapshot"),
      state.store.getAll("commentOutbox")
    ]);
    const comments = snapshots.filter((item) => item.readingId === readingId && !item.deletedAt);
    const pending = outbox.filter((item) => item.readingId === readingId);
    if (state.currentEntry && state.currentEntry.readingId === readingId) {
      state.comments = comments;
      await renderComments(pending);
    }
    updateReadingCompletion(readingId, comments, pending);
  }

  async function refreshComments(options) {
    const readingId = options && options.readingId || (state.currentEntry && state.currentEntry.readingId);
    if (!readingId) return;
    const token = ++state.commentSyncToken;
    const background = Boolean(options && options.background);
    if (!serverCallsAllowed()) {
      await loadCachedDiscussion(readingId);
      if (!background) setSyncStatus("Saved discussion ready · writes will sync after access is confirmed");
      return;
    }
    if (!background) setSyncStatus("Syncing discussion…");
    try {
      const comments = await state.adapter.listComments(readingId);
      await replaceCommentSnapshots(readingId, comments);
      const outbox = (await state.store.getAll("commentOutbox"))
        .filter((item) => item.readingId === readingId);
      updateReadingCompletion(readingId, comments, outbox);
      if (state.currentEntry && state.currentEntry.readingId === readingId && token === state.commentSyncToken) {
        state.comments = comments;
        await renderComments(outbox);
        setSyncStatus(outbox.length ? `${outbox.length} comment update${outbox.length === 1 ? "" : "s"} pending` : "Discussion synchronized");
      }
    } catch {
      const snapshots = (await state.store.getAll("commentSnapshot"))
        .filter((item) => item.readingId === readingId && !item.deletedAt);
      const outbox = (await state.store.getAll("commentOutbox"))
        .filter((item) => item.readingId === readingId);
      updateReadingCompletion(readingId, snapshots, outbox);
      if (state.currentEntry && state.currentEntry.readingId === readingId && token === state.commentSyncToken) {
        state.comments = snapshots;
        await renderComments(outbox);
        setSyncStatus("Offline · showing cached discussion");
      }
    }
  }

  async function queueComment(payload) {
    const item = {
      ...payload,
      queuedAt: new Date().toISOString(),
      status: "pending"
    };
    await state.store.put("commentOutbox", item);
    await updateCacheInspector();
    return item;
  }

  async function submitNewComment(event) {
    event.preventDefault();
    const body = element("commentBody").value.trim();
    if (!body || !state.currentEntry) return;
    const clientRequestId = createRequestId("comment-create");
    await queueComment({
      clientRequestId,
      localTempId: createRequestId("local-comment"),
      eventType: "create",
      planVersion: state.plan.planVersion,
      readingId: state.currentEntry.readingId,
      body,
      baseRevision: 0
    });
    element("commentBody").value = "";
    await state.store.delete("commentDrafts", `comment:${state.currentEntry.readingId}`);
    await refreshComments();
    if (!root.navigator || root.navigator.onLine !== false || state.adapter.kind === "mock") await flushOutbox();
    else setSyncStatus("Offline · comment queued");
  }

  async function editComment(comment, revised) {
    const normalized = String(revised || "").trim();
    if (!normalized || normalized === comment.body) {
      await refreshComments();
      return;
    }
    await queueComment({
      clientRequestId: createRequestId("comment-edit"),
      eventType: "edit",
      planVersion: comment.planVersion,
      readingId: comment.readingId,
      commentId: comment.commentId,
      body: normalized,
      baseRevision: comment.revision
    });
    await refreshComments();
    if (!root.navigator || root.navigator.onLine !== false || state.adapter.kind === "mock") await flushOutbox();
  }

  async function deleteComment(comment) {
    await queueComment({
      clientRequestId: createRequestId("comment-delete"),
      eventType: "delete",
      planVersion: comment.planVersion,
      readingId: comment.readingId,
      commentId: comment.commentId,
      body: "",
      baseRevision: comment.revision
    });
    await refreshComments();
    if (!root.navigator || root.navigator.onLine !== false || state.adapter.kind === "mock") await flushOutbox();
  }

  async function flushOutbox() {
    if (!serverCallsAllowed()) {
      const queued = compactOutbox(await state.store.getAll("commentOutbox"));
      setSyncStatus(queued.length
        ? `${queued.length} comment update${queued.length === 1 ? "" : "s"} saved locally · awaiting secure access`
        : "Saved data ready · confirming access");
      return;
    }
    if (root.navigator && root.navigator.onLine === false && state.adapter.kind !== "mock") {
      setSyncStatus("Offline · writes remain queued");
      return;
    }
    const queued = compactOutbox(await state.store.getAll("commentOutbox"));
    if (!queued.length) {
      setSyncStatus("No pending comments");
      await refreshComments();
      return;
    }
    setSyncStatus(`Syncing ${queued.length} pending…`);
    for (const item of queued) {
      try {
        const result = await state.adapter.submitCommentEvent(item);
        await state.store.delete("commentOutbox", item.clientRequestId);
        if (result && result.event) await state.store.put("commentSnapshot", result.event);
      } catch (error) {
        await state.store.put("commentOutbox", {...item, status: "error", errorCode: error.code || "SYNC_FAILED"});
        setSyncStatus(error.code === "REVISION_CONFLICT" ? "Edit conflict · refresh required" : "Sync paused · retry available");
        break;
      }
    }
    await refreshComments();
    await updateCacheInspector();
    const remaining = await state.store.getAll("commentOutbox");
    if (!remaining.length) setSyncStatus("Discussion synchronized");
  }

  async function updateCacheInspector() {
    if (!state.store || !state.policy) return;
    const [scripture, content, completion, outbox, drafts, snapshots, mockEvents, credential] = await Promise.all([
      state.store.getAll("scriptureCache"),
      state.store.getAll("privateContent"),
      state.store.getAll("calendarCompletion"),
      state.store.getAll("commentOutbox"),
      state.store.getAll("commentDrafts"),
      state.store.getAll("commentSnapshot"),
      state.store.getAll("commentEvents"),
      state.store.get("deviceCredentials", "reader-code")
    ]);
    const freshContent = [];
    let bootstrapCached = false;
    const cacheContext = privateCacheContext();
    for (const record of content) {
      if (record.readingId === BOOTSTRAP_CACHE_KEY) {
        bootstrapCached = bootstrapRecordIsFresh(record, Date.now(), credential);
        if (!bootstrapCached) await state.store.delete("privateContent", record.readingId);
      } else if ((record.cacheContext === cacheContext || (!record.cacheContext && cacheContext === "apps-script")) &&
          privateRecordIsFresh(record, Date.now(), state.plan && state.plan.planVersion)) {
        freshContent.push(record);
      } else {
        await state.store.delete("privateContent", record.readingId);
      }
    }
    const policyState = root.DBRProviderPolicy.inspectCache(scripture, state.policy);
    element("cacheInspector").textContent = JSON.stringify({
      storageMode: state.store.mode,
      clientBuildId: CLIENT_BUILD_ID,
      clientDeliveryMode: CLIENT_DELIVERY_MODE,
      staticReleaseSource: root.DBRStaticRelease && root.DBRStaticRelease.source || null,
      serverBuildId: state.bootstrap && state.bootstrap.appBuildId,
      providerPolicy: policyState,
      offlineReadingWindowDays: state.config.offlineReadingWindowDays,
      bootstrapCached,
      serverAccessConfirmed: state.serverAccessConfirmed,
      privateContentEntries: freshContent.length,
      priorityReadingTarget: HOT_READING_COUNT,
      scriptureMemoryEntries: state.scriptureMemoryByReadingId.size,
      scriptureMemoryOnly: true,
      calendarCompletionEntries: completion.length,
      cachedCommentSnapshots: snapshots.length,
      localMockRevisionEvents: mockEvents.length,
      offlineDrafts: drafts.length,
      pendingCommentEvents: outbox.length,
      highlightsPersistedLocally: false,
      readerCodeStored: Boolean(credential && credential.readerCode),
      serviceWorkerRegistered: Boolean(root.document && root.document.documentElement &&
        root.document.documentElement.dataset.pwaServiceWorker === "registered"),
      startupTiming: startupTimingSnapshot()
    }, null, 2);
  }

  async function clearDownloadedData() {
    const button = element("clearDownloadedData");
    if (button.dataset.confirmClear !== "true") {
      button.dataset.confirmClear = "true";
      button.textContent = "Confirm clear downloaded data";
      button.setAttribute("aria-label", "Confirm clearing all downloaded data from this browser");
      setSyncStatus("Press the clear button again to remove local data");
      root.setTimeout(() => {
        if (button.dataset.confirmClear === "true") {
          delete button.dataset.confirmClear;
          button.textContent = "Clear downloaded data";
          button.removeAttribute("aria-label");
        }
      }, 10000);
      return;
    }
    delete button.dataset.confirmClear;
    button.textContent = "Clear downloaded data";
    button.removeAttribute("aria-label");
    const credential = await state.store.get("deviceCredentials", "reader-code");
    await state.store.clearAll();
    if (credential && credential.readerCode) await state.store.put("deviceCredentials", credential);
    element("commentBody").value = "";
    state.comments = [];
    state.privatePayloadByReadingId = new Map();
    state.privatePayloadRequestByReadingId = new Map();
    resetScriptureMemory();
    state.completionByReadingId = new Map();
    state.completedReadingIds = new Set();
    await renderComments([]);
    notifyHighlightEnhancer();
    await updateCacheInspector();
    renderCalendar();
    delete element("offlinePackStatus").dataset.state;
    element("offlinePackStatus").textContent = "Downloaded reading data cleared. Reader access remains remembered; reconnect to prepare the offline window again.";
    setSyncStatus("Downloaded data cleared");
    if (state.currentEntry && state.currentEntry.kind === "chapter") await loadScripture(state.currentEntry);
    if (state.view === "home" && (!root.navigator || root.navigator.onLine !== false)) resumeOnlineWork();
  }

  async function forgetReaderAccess() {
    const button = element("forgetReaderAccess");
    if (button.dataset.confirmForget !== "true") {
      button.dataset.confirmForget = "true";
      button.textContent = "Confirm forget reader code";
      button.setAttribute("aria-label", "Confirm forgetting reader access for this browser");
      setSyncStatus("Press the forget button again to require the reader code next time");
      root.setTimeout(() => {
        if (button.dataset.confirmForget === "true") {
          delete button.dataset.confirmForget;
          button.textContent = "Forget reader code";
          button.removeAttribute("aria-label");
        }
      }, 10000);
      return;
    }
    button.disabled = true;
    try {
      await state.adapter.forgetReaderEnrollment();
      await clearPrivateDataAfterAccessFailure();
      showReaderCodeGate(appError("Reader access was forgotten. Enter your code to enroll this account again.", "READER_CODE_REQUIRED"));
    } catch {
      setSyncStatus("Reader access could not be forgotten; reconnect and retry");
    } finally {
      delete button.dataset.confirmForget;
      button.textContent = "Forget reader code";
      button.removeAttribute("aria-label");
      button.disabled = false;
    }
  }

  function resumeOnlineWork() {
    if (state.adapter && state.adapter.kind === "apps-script" && !state.serverAccessConfirmed && state.plan && state.session) {
      confirmServerAccess({expectedAuthorId: state.session.authorId, hadCachedShell: true}).catch(handleFatalError);
      return;
    }
    if (!serverCallsAllowed()) return;
    warmPriorityWindow().catch(() => {});
    flushOutbox().catch(() => setSyncStatus("Sync retry failed"));
    notifyHighlightEnhancer();
    if (state.view === "home") syncCalendarCompletion().catch(() => {});
  }

  function wireEvents() {
    if (state.uiWired) return;
    state.uiWired = true;
    element("brandHomeButton").addEventListener("click", () => showHome());
    element("calendarHomeButton").addEventListener("click", () => showHome());
    element("refreshCalendar").addEventListener("click", () => syncCalendarCompletion().catch(() => {}));
    element("previousMonth").addEventListener("click", () => {
      state.calendarMonthDate = shiftMonth(state.calendarMonthDate, -1);
      state.selectedCalendarDate = null;
      renderCalendar();
      syncCalendarCompletion().catch(() => {});
    });
    element("nextMonth").addEventListener("click", () => {
      state.calendarMonthDate = shiftMonth(state.calendarMonthDate, 1);
      state.selectedCalendarDate = null;
      renderCalendar();
      syncCalendarCompletion().catch(() => {});
    });
    element("openSelectedReading").addEventListener("click", () => {
      const readingId = element("openSelectedReading").dataset.readingId;
      if (readingId) openReading(readingId).catch(handleFatalError);
    });
    [0, 1, 2].forEach((index) => {
      element(`pageStep${index}`).addEventListener("click", () => setReadingPage(index));
    });
    element("previousPage").addEventListener("click", () => setReadingPage(state.currentPage - 1));
    element("nextPage").addEventListener("click", () => setReadingPage(state.currentPage + 1));
    element("finishReading").addEventListener("click", () => showHome());
    element("retryScripture").addEventListener("click", () => state.currentEntry && loadScripture(state.currentEntry));
    element("refreshComments").addEventListener("click", refreshComments);
    element("commentForm").addEventListener("submit", submitNewComment);
    element("commentBody").addEventListener("input", scheduleDraftSave);
    element("syncOutbox").addEventListener("click", flushOutbox);
    element("clearDownloadedData").addEventListener("click", clearDownloadedData);
    element("forgetReaderAccess").addEventListener("click", forgetReaderAccess);
    root.addEventListener("online", resumeOnlineWork);
    root.addEventListener("pageshow", () => {
      if (state.view === "home" && (!root.navigator || root.navigator.onLine !== false)) {
        resumeOnlineWork();
      }
    });
    root.document.addEventListener("visibilitychange", () => {
      if (root.document.visibilityState === "visible" && state.view === "home" &&
          (!root.navigator || root.navigator.onLine !== false)) {
        resumeOnlineWork();
      }
    });
    root.addEventListener("offline", () => setSyncStatus("Offline · drafts remain local"));
  }

  function showReaderCodeGate(error) {
    if (root.DBRBoot && typeof root.DBRBoot.ready === "function") root.DBRBoot.ready();
    element("appMain").hidden = true;
    element("readerCodeGate").hidden = false;
    element("authStatus").textContent = "Reader code required";
    element("readerCodeStatus").textContent = error && error.message
      ? error.message
      : "Enter the private reader code assigned to you.";
    element("readerCodeInput").value = "";
    state.readerCodeSubmitting = false;
    updateReaderCodeSubmitState();
    element("readerCodeInput").focus();
    setSyncStatus("Locked");
  }

  function hideReaderCodeGate() {
    element("readerCodeGate").hidden = true;
    element("appMain").hidden = false;
  }

  function applyBootstrapState(bootstrap) {
    state.bootstrap = bootstrap;
    state.config = bootstrap.config;
    state.plan = validatePlan(bootstrap.plan);
    state.policy = root.DBRProviderPolicy.validatePolicy(bootstrap.providerPolicy);
    state.session = bootstrap.session;
    state.sources = bootstrap.sources || [];
    if (!state.session || !state.session.authorId || !state.session.displayName) {
      throw appError("The server did not provide an authorized display identity.", "AUTH_REQUIRED");
    }
    const participants = Array.isArray(bootstrap.participants) ? bootstrap.participants.map((participant) => ({
      authorId: String(participant && participant.authorId || ""),
      displayName: String(participant && participant.displayName || "")
    })) : [];
    if (participants.length !== 2 || new Set(participants.map((participant) => participant.authorId)).size !== 2 ||
        participants.some((participant) => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(participant.authorId) ||
          !participant.displayName || participant.displayName.length > 80) ||
        !participants.some((participant) => participant.authorId === state.session.authorId)) {
      throw appError("The server did not provide the expected two-reader roster.", "AUTH_REQUIRED");
    }
    state.calendarParticipants = participants;
  }

  async function installBootstrap(bootstrap, options) {
    const hadApplication = Boolean(state.plan && state.session);
    const previousPlanVersion = state.plan && state.plan.planVersion;
    const previousAppBuildId = state.bootstrap && state.bootstrap.appBuildId;
    applyBootstrapState(bootstrap);
    if (hadApplication && (previousPlanVersion !== state.plan.planVersion ||
        previousAppBuildId !== bootstrap.appBuildId)) resetScriptureMemory();
    hideReaderCodeGate();
    element("authStatus").textContent = state.adapter.kind === "mock"
      ? "Local mock · fabricated data"
      : options && options.cached
        ? `Saved copy for ${state.session.displayName} · checking access`
        : `Reading as ${state.session.displayName}`;
    const esvNotice = state.policy.requiredAttribution.notice || FALLBACK_ESV_NOTICE;
    element("esvNotice").textContent = esvNotice;
    element("verseOfDayNotice").textContent = esvNotice;
    element("selectedDayVerseNotice").textContent = esvNotice;
    wireEvents();
    state.schedule = calculateSchedule(state.plan, state.config, new Date());
    await hydrateCalendarCompletion();
    markStartupMilestone(options && options.cached ? "cachedCalendarVisible" : "calendarVisible");
    if (!hadApplication || previousPlanVersion !== state.plan.planVersion || state.view === "home") {
      showHome({focus: false, sync: false});
    }
    if (!options || !options.cached) configureBuildUpdate(bootstrap);
    if (root.DBRBoot && typeof root.DBRBoot.ready === "function") root.DBRBoot.ready();
  }

  async function rememberConfirmedDevice() {
    if (state.adapter.kind !== "apps-script" || !state.session) return;
    const prior = await state.store.get("deviceCredentials", "reader-code");
    const record = {
      credentialId: "reader-code",
      readerCode: state.readerCode || prior && prior.readerCode || "",
      verifiedAt: new Date().toISOString(),
      authorId: state.session.authorId,
      persistentStorage: Boolean(prior && prior.persistentStorage)
    };
    await state.store.put("deviceCredentials", record);
    requestPersistentStorage().then(async (persistentStorage) => {
      await state.store.put("deviceCredentials", {...record, persistentStorage});
    }).catch(() => {});
  }

  async function clearPrivateDataAfterAccessFailure() {
    await state.store.clearAll();
    state.readerCode = "";
    state.bootstrap = null;
    state.config = null;
    state.plan = null;
    state.policy = null;
    state.session = null;
    state.sources = [];
    state.comments = [];
    state.privatePayloadByReadingId = new Map();
    state.privatePayloadRequestByReadingId = new Map();
    resetScriptureMemory();
    state.currentScripture = null;
    state.currentVerseCommentary = null;
    state.currentHenrySourceLink = null;
    notifyHighlightEnhancer();
    state.calendarParticipants = [];
    state.completionByReadingId = new Map();
    state.completedReadingIds = new Set();
  }

  function startConfirmedBackgroundWork() {
    warmPriorityWindow().catch(() => {});
    syncCalendarCompletion().catch(() => {});
    flushOutbox().catch(() => {});
    notifyHighlightEnhancer();
    if (state.view === "reading" && state.currentEntry) {
      refreshComments({background: true, readingId: state.currentEntry.readingId}).catch(() => {});
      if (state.currentEntry.kind === "chapter") {
        loadScripture(state.currentEntry).catch(() => {});
      }
    }
    scheduleOfflinePrefetch();
  }

  async function refreshBootstrapAfterConfirmation(expectedAuthorId) {
    try {
      const bootstrap = await state.adapter.getBootstrapData();
      if (!bootstrap.session || bootstrap.session.authorId !== expectedAuthorId) {
        throw appError("The authorized reader changed while refreshing private data.", "AUTH_REQUIRED");
      }
      await installBootstrap(bootstrap, {cached: false});
      await persistBootstrap(bootstrap);
      startConfirmedBackgroundWork();
    } catch (error) {
      if (explicitAccessFailure(error)) {
        state.serverAccessConfirmed = false;
        await clearPrivateDataAfterAccessFailure();
        handleFatalError(error);
        return;
      }
      setSyncStatus("Saved data ready · background refresh will retry later");
      startConfirmedBackgroundWork();
    }
  }

  async function confirmServerAccess(options) {
    if (state.authorizationPromise) return state.authorizationPromise;
    const expectedAuthorId = options && options.expectedAuthorId;
    const hadCachedShell = Boolean(options && options.hadCachedShell);
    const run = async () => {
      setSyncStatus(hadCachedShell ? "Saved data ready · confirming access" : "Authorizing…");
      try {
        if (hadCachedShell) {
          const confirmation = await state.adapter.confirmReaderAccess();
          if (!confirmation.session || confirmation.session.authorId !== expectedAuthorId) {
            throw appError("The authorized reader does not match this device's saved reader.", "AUTH_REQUIRED");
          }
          const confirmedParticipants = Array.isArray(confirmation.participants)
            ? confirmation.participants.map((participant) => participant && participant.authorId)
            : [];
          const cachedParticipants = state.calendarParticipants.map((participant) => participant.authorId);
          if (JSON.stringify(confirmedParticipants) !== JSON.stringify(cachedParticipants)) {
            throw appError("The authorized reader roster changed.", "AUTH_REQUIRED");
          }
          state.serverAccessConfirmed = true;
          markStartupMilestone("authorizationConfirmed");
          state.bootstrap = {...state.bootstrap, appBuildId: confirmation.appBuildId, appUrl: confirmation.appUrl};
          configureBuildUpdate(confirmation);
          element("authStatus").textContent = `Reading as ${state.session.displayName}`;
          await rememberConfirmedDevice();
          setBanner("");
          setSyncStatus("Ready · refreshing saved data in the background");
          refreshBootstrapAfterConfirmation(expectedAuthorId).catch(() => {});
          return true;
        }
        const bootstrap = await state.adapter.getBootstrapData();
        if (expectedAuthorId && (!bootstrap.session || bootstrap.session.authorId !== expectedAuthorId)) {
          throw appError("The authorized reader does not match this device's saved reader.", "AUTH_REQUIRED");
        }
        state.serverAccessConfirmed = true;
        markStartupMilestone("authorizationConfirmed");
        await installBootstrap(bootstrap, {cached: false});
        await rememberConfirmedDevice();
        await persistBootstrap(bootstrap);
        setBanner("");
        setSyncStatus("Ready");
        startConfirmedBackgroundWork();
        return true;
      } catch (error) {
        state.serverAccessConfirmed = false;
        if (explicitAccessFailure(error)) {
          await clearPrivateDataAfterAccessFailure();
          throw error;
        }
        if (!hadCachedShell) throw error;
        element("authStatus").textContent = state.session
          ? `Offline copy for ${state.session.displayName}`
          : "Offline saved copy";
        setBanner("Saved readings are available while the secure Google connection is unavailable. New comments stay on this device until access is confirmed.", "info");
        setSyncStatus("Offline · saved readings and drafts available");
        return false;
      }
    };
    const promise = run();
    state.authorizationPromise = promise;
    try {
      return await promise;
    } finally {
      if (state.authorizationPromise === promise) state.authorizationPromise = null;
    }
  }

  async function startAuthorizedApplication(options) {
    if (state.adapter.kind === "mock") {
      state.serverAccessConfirmed = true;
      markStartupMilestone("authorizationConfirmed");
      const bootstrap = await state.adapter.getBootstrapData();
      await installBootstrap(bootstrap, {cached: false});
      startConfirmedBackgroundWork();
      return;
    }
    const credential = options && options.credential;
    if (options && options.allowCached && credential) {
      const cached = await cachedBootstrapForCredential(credential);
      if (cached) {
        state.serverAccessConfirmed = false;
        await installBootstrap(cached, {cached: true});
        confirmServerAccess({expectedAuthorId: credential.authorId, hadCachedShell: true})
          .catch(handleFatalError);
        return;
      }
    }
    await confirmServerAccess({
      expectedAuthorId: options && options.expectedAuthorId,
      hadCachedShell: false
    });
  }

  function updateReaderCodeSubmitState() {
    const input = element("readerCodeInput");
    const submit = element("readerCodeSubmit");
    if (!input || !submit) return;
    submit.disabled = state.readerCodeSubmitting || !readerCodeLooksReady(input.value);
  }

  function wireReaderCodeForm() {
    const input = element("readerCodeInput");
    ["input", "change", "keyup"].forEach((eventName) => input.addEventListener(eventName, updateReaderCodeSubmitState));
    input.addEventListener("paste", () => root.setTimeout(updateReaderCodeSubmitState, 0));
    updateReaderCodeSubmitState();
    element("readerCodeForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = element("readerCodeSubmit");
      const code = input.value.trim();
      if (!readerCodeLooksReady(code)) {
        element("readerCodeStatus").textContent = "Paste the complete reader code before unlocking.";
        updateReaderCodeSubmitState();
        return;
      }
      state.readerCodeSubmitting = true;
      updateReaderCodeSubmitState();
      element("readerCodeStatus").textContent = "Checking your private reader code…";
      state.readerCode = code;
      try {
        await startAuthorizedApplication({allowCached: false});
      } catch (error) {
        state.readerCode = "";
        await state.store.delete("deviceCredentials", "reader-code");
        if (["READER_CODE_REQUIRED", "READER_CODE_INVALID", "AUTH_REQUIRED", "ACCESS_DENIED", "WRONG_EXECUTION_IDENTITY"].includes(error.code)) {
          showReaderCodeGate(error);
        } else {
          handleFatalError(error);
        }
      } finally {
        state.readerCodeSubmitting = false;
        updateReaderCodeSubmitState();
      }
    });
  }

  async function init() {
    setSyncStatus("Preparing…");
    state.store = await createBrowserStore();
    state.adapter = root.google && root.google.script && root.google.script.run
      ? productionAdapter()
      : localAdapter(state.store);
    wireReaderCodeForm();
    if (state.adapter.kind === "apps-script") {
      const credential = await state.store.get("deviceCredentials", "reader-code");
      state.readerCode = credential && credential.readerCode ? credential.readerCode : "";
      try {
        await startAuthorizedApplication({allowCached: true, credential});
      } catch (error) {
        if (["READER_CODE_REQUIRED", "READER_CODE_INVALID"].includes(error.code)) {
          state.readerCode = "";
          await state.store.delete("deviceCredentials", "reader-code");
          showReaderCodeGate(error);
          return;
        }
        throw error;
      }
      return;
    }
    await startAuthorizedApplication({allowCached: false});
  }

  function handleFatalError(error) {
    if (root.DBRBoot && typeof root.DBRBoot.ready === "function") root.DBRBoot.ready();
    const code = error && error.code ? error.code : "UNAVAILABLE";
    if (explicitAccessFailure(error) && state.adapter && state.adapter.kind === "apps-script") {
      const message = ["READER_CODE_REQUIRED", "READER_CODE_INVALID"].includes(code)
        ? error.message
        : "Access could not be confirmed. Check your private reader code and connection.";
      showReaderCodeGate(appError(message, code));
      return;
    }
    const publicMessage = ["AUTH_REQUIRED", "ACCESS_DENIED", "WRONG_EXECUTION_IDENTITY"].includes(code)
      ? "Access could not be confirmed. Check your private reader code and connection."
      : "The reader could not finish loading. Private data remains closed; retry after checking the local server or deployment configuration.";
    setBanner(publicMessage, "error");
    setSyncStatus("Unavailable");
    ["nextPage", "finishReading", "submitComment", "refreshComments", "refreshCalendar", "syncOutbox", "openSelectedReading", "previousMonth", "nextMonth"].forEach((id) => {
      if (element(id)) element(id).disabled = true;
    });
  }

  return {
    bootstrapRecordIsFresh,
    buildMonthCalendar,
    calculateSchedule,
    civilDayNumber,
    compactOutbox,
    createRequestId,
    createBrowserStore,
    dateOnlyForDay,
    datePartsInTimeZone,
    evaluateContentReadiness,
    extractNumberedVerseText,
    formatReadingDate,
    handleFatalError,
    init,
    parseDateOnly,
    priorityReadingEntries,
    privatePayloadNeedsBlockingRefresh,
    privatePayloadRevision,
    privateRecordIsFresh,
    readingContentIsPrepared,
    readingPreparationReport,
    readingHasActiveComment,
    readerCodeLooksReady,
    normalizedDraftBody,
    normalizedBookCommentaryResource,
    normalizedVerseCommentaryShard,
    normalizedVerseOfTheDay,
    listCurrentHighlights,
    registerHighlightEnhancer,
    safeExternalUrl,
    safeVersionedAppUrl,
    selectedDayVerseSelection,
    splitNumberedVerses,
    splitComprehensiveSections,
    submitCurrentHighlightEvent,
    startupTimingSnapshot,
    titleForEntry,
    verseReferenceLabel,
    verseBelongsToPassage,
    verseTextFromScripture,
    validatePlan
  };
});
