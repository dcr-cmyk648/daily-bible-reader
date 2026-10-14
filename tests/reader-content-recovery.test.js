const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const app = require("../app/frontend/app.js");
const {preparationFixture} = require("./helpers/preparation-fixture.js");
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
const fault = code => Object.assign(new Error("FABRICATED content-service failure"), {code});
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };

function harness({cached = true, error = fault("CONTENT_INVALID")} = {}) {
  const fixture = preparationFixture();
  const entries = fixture.entries.slice(0, 2).map(entry => ({...entry, planVersion: "FABRICATED/v1"}));
  const payload = fixture.payload(entries[0]);
  const data = new Map(), local = new Map(), nodes = new Map(), timers = new Map();
  class Node {
    constructor(tag = "div") { this.tagName = tag; this.children = []; this.dataset = {}; this.disabled = false;
      this.hidden = false; this.value = ""; this.href = ""; this._text = "";
      this.classList = {add() {}, remove() {}, toggle() {}, contains() { return false; }}; }
    get textContent() { return this._text + this.children.map(child => child.textContent || "").join(""); }
    set textContent(value) { this._text = String(value); this.children = []; }
    replaceChildren(...children) { this._text = ""; this.children = children; }
    appendChild(child) { this.children.push(child); return child; }
    append(...children) { this.children.push(...children); }
    setAttribute(key, value) { this[key] = value; }
    removeAttribute(key) { delete this[key]; }
    addEventListener() {}
    querySelectorAll() { return []; }
    querySelector() { return null; }
    focus() {}
    insertAdjacentElement(_where, node) { nodes.set(node.id, node); }
  }
  const node = id => { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); };
  const context = {URL, Map, Set, Date, Intl, Uint8Array,
    location: {href: "https://fabricated.example.test/daily-bible-reader/web/pwa-canary/"},
    localStorage: {getItem: key => local.get(key), setItem: (key, value) => local.set(key, value)},
    setTimeout(callback, delay) { const token = {}; timers.set(token, {callback, delay}); return token; },
    clearTimeout(token) { timers.delete(token); },
    DBRProviderPolicy: {inspectCache() { return {label: "FABRICATED cache policy"}; }, isExpired() { return false; }}};
  const source = fs.readFileSync(require.resolve("../app/frontend/app.js"), "utf8").replace("    bootstrapRecordIsFresh,",
    "    __test: {state, cachedPrivatePayload, persistPrivatePayload, readingPayloadWithCache, revalidateOpenReading, loadReading, openReading, showHome, scheduleDraftSave, submitNewComment, retryOpenReadingSync, refreshComments, readFatalDiagnostic},\n    bootstrapRecordIsFresh,");
  vm.runInNewContext(source, context);
  context.document = {visibilityState: "visible", getElementById: node, querySelectorAll() { return []; },
    createElement: tag => new Node(tag), createTextNode: text => { const result = new Node("text"); result.textContent = text; return result; }};
  const api = context.DailyBibleReader, hooks = api.__test, state = hooks.state;
  state.store = {mode: "FABRICATED memory", async get(store, key) { return data.get(store + ":" + key); },
    async put(store, value) { data.set(store + ":" + (value.draftKey || value.clientRequestId || value.commentId || value.readingId), value); },
    async delete(store, key) { data.delete(store + ":" + key); },
    async getAll(store) { return [...data].filter(([key]) => key.startsWith(store + ":")).map(([, value]) => value); }};
  let next = error;
  state.adapter = {kind: "apps-script", cacheContext: "apps-script",
    async getReadingPayload() { if (next instanceof Error) throw next; return next; },
    async getScripture() { throw fault("BRIDGE_UNAVAILABLE"); }, async listComments() { return {comments: []}; }};
  state.plan = {planVersion: "FABRICATED/v1", entries, bookMetrics: {NAM: {chapterCount: 3, verseCount: 3}}};
  state.config = {timezone: "America/Detroit", sharedStartDateMode: "testing_today", futureLookaheadDays: 7,
    pastReadingsAvailable: true, futureReadingsLocked: true, privateContentCacheMaxAgeSeconds: 3600, offlineReadingWindowDays: 8};
  state.policy = {policyVersion: "FABRICATED policy", offlinePersistenceAllowed: false, maxVersesPerRequest: 500,
    maxTotalCachedVerses: 500, maxBookFraction: 0.5, requiredAttribution: {notice: "FABRICATED notice"}};
  state.session = {authorId: "dustin", displayName: "FABRICATED authorized reader"};
  state.serverAccessConfirmed = true; state.preparedReadingIds = new Set(entries.map(entry => entry.readingId));
  state.view = "reading"; state.currentEntry = entries[0];
  state.bootstrap = {appBuildId: "1111111111111111"};
  const record = {readingId: entries[0].readingId, cacheContext: "apps-script", planVersion: state.plan.planVersion,
    expiresAt: new Date(Date.now() + 3600000).toISOString(), payload};
  if (cached) data.set("privateContent:" + entries[0].readingId, record);
  const draft = {draftKey: "comment:" + entries[0].readingId, body: "FABRICATED retained draft", readingId: entries[0].readingId};
  data.set("commentDrafts:" + draft.draftKey, draft);
  return {api, hooks, state, node, nodes, data, local, payload, record, entries, fixture,
    timers, setResponse(value) { next = value; }};
}

test("publication-time content failure keeps a matching prepared saved study and discussion usable with persistent retry", async () => {
  const h = harness(); await h.hooks.loadReading(h.entries[0].readingId); await flush();
  assert.match(h.node("overviewContent").textContent, /Fabricated/);
  assert.equal(h.node("submitComment").disabled, false);
  assert.equal(h.node("openSelectedReading").disabled, false);
  assert.equal(h.state.serverAccessConfirmed, true);
  assert.equal(h.state.lastFatal, null);
  const warning = h.node("commentaryRefreshMessage").textContent;
  assert.match(warning, /Saved commentary.*CONTENT_INVALID/);
  assert.equal(h.node("retryCommentaryRefresh").hidden, false);
  await h.hooks.refreshComments({background: true});
  assert.equal(h.node("commentaryRefreshMessage").textContent, warning);
  assert.equal(h.node("commentBody").value, "FABRICATED retained draft");
  assert.equal(h.data.get("privateContent:" + h.entries[0].readingId).payload, h.payload);
});

test("no usable cache clears the previous study, keeps home usable and draft intact, then restores only validated content", async () => {
  const h = harness({cached: false});
  const oldIds = ["overviewContent", "comprehensiveSynthesis", "scriptureContent", "scriptureHeading", "scripturePassageTabs"];
  for (const id of oldIds) h.node(id).textContent = "FABRICATED WRONG PREVIOUS READING";
  let highlightContext = "FABRICATED OLD VERSE SHEET";
  h.state.highlightEnhancer = {render(context) { highlightContext = context; }};
  await h.hooks.loadReading(h.entries[0].readingId); await flush();
  for (const id of oldIds) assert.doesNotMatch(h.node(id).textContent, /WRONG PREVIOUS/);
  assert.equal(h.node("scripturePassageControls").hidden, true);
  assert.equal(highlightContext, null);
  assert.equal(h.node("submitComment").disabled, true);
  assert.equal(h.node("openSelectedReading").disabled, false);
  assert.equal(h.node("refreshCalendar").disabled, false);
  assert.equal(h.state.lastFatal, null);
  assert.match(h.node("commentaryRefreshMessage").textContent, /Study unavailable/);
  assert.doesNotMatch(h.node("commentaryRefreshMessage").textContent, /Saved commentary/);
  assert.equal(h.node("commentBody").value, "FABRICATED retained draft");
  h.setResponse(h.payload); await h.hooks.retryOpenReadingSync(); await flush();
  assert.equal(h.node("submitComment").disabled, false);
  assert.match(h.node("overviewContent").textContent, /Fabricated/);
  assert.equal(h.state.readingUnavailableId, null);
});

test("wrong-reading, context, expiry, plan, placeholder and invalid review caches cannot stand in for a prepared study", async () => {
  for (const mutate of [r => {r.payload = {commentary: {...r.payload.commentary, readingId: "FABRICATED-OTHER"}, sources: r.payload.sources};},
    r => {r.cacheContext = "FABRICATED other identity context";}, r => {r.expiresAt = "2000-01-01T00:00:00Z";},
    r => {r.planVersion = "FABRICATED other plan";}, r => {r.payload.commentary.publicationStatus = "placeholder";},
    r => {r.payload.commentary.generation.humanReviewStatus = "unreviewed";}]) {
    const h = harness(); mutate(h.record); await h.hooks.loadReading(h.entries[0].readingId); await flush();
    assert.equal(h.state.readingUnavailableId, h.entries[0].readingId);
    assert.equal(h.node("submitComment").disabled, true);
    assert.match(h.node("commentaryRefreshMessage").textContent, /Study unavailable/);
    assert.equal(h.state.privatePayloadByReadingId.has(h.entries[0].readingId), false);
  }
});

test("fresh invalid payload cannot overwrite a valid saved study or mark refresh confirmed", async () => {
  const h = harness(); await h.hooks.loadReading(h.entries[0].readingId); await flush();
  h.setResponse({commentary: {...h.payload.commentary, readingId: "FABRICATED WRONG READING"}, sources: h.payload.sources});
  const result = await h.hooks.retryOpenReadingSync(); await flush();
  assert.equal(result.state, "retryable");
  assert.equal(h.data.get("privateContent:" + h.entries[0].readingId).payload, h.payload);
  assert.match(h.node("commentaryRefreshMessage").textContent, /CONTENT_MISMATCH/);
  assert.equal(h.node("submitComment").disabled, false);
});

test("real denial stays denied, whereas omitted reading-service codes recover without a global fatal", async () => {
  const denied = harness({error: fault("CONTENT_ACCESS_DENIED")});
  await denied.hooks.loadReading(denied.entries[0].readingId); await flush();
  assert.equal(denied.state.serverAccessConfirmed, false);
  assert.equal(denied.node("appMain").hidden, true);
  assert.equal(denied.node("readerCodeGate").hidden, false);
  for (const code of ["READING_NOT_FOUND", "INVALID_READING", "RATE_LIMITED", "SERVER_TIMEOUT", "SOURCE_REGISTRY_INVALID"]) {
    const h = harness({error: fault(code)}); await h.hooks.loadReading(h.entries[0].readingId); await flush();
    assert.equal(h.state.serverAccessConfirmed, true);
    assert.equal(h.state.lastFatal, null);
    assert.equal(h.node("submitComment").disabled, false);
    assert.match(h.node("commentaryRefreshMessage").textContent, new RegExp(code));
  }
});

test("programming errors remain fatal and diagnostics expose only bounded code/time/phase, surviving reopen", async () => {
  const h = harness({cached: false, error: new TypeError("FABRICATED SECRET MESSAGE")});
  await assert.rejects(h.hooks.loadReading(h.entries[0].readingId), /FABRICATED SECRET/);
  h.api.handleFatalError(new TypeError("FABRICATED SECRET MESSAGE"), "reading-open");
  assert.match(h.node("stateBanner").textContent, /Error code: CLIENT_TYPE_ERROR/);
  assert.doesNotMatch(h.node("stateBanner").textContent, /SECRET/);
  assert.equal(h.node("openSelectedReading").disabled, true);
  assert.deepEqual(Object.keys(h.state.lastFatal).sort(), ["at", "code", "operation", "phase"]);
  assert.equal(h.hooks.readFatalDiagnostic().code, "CLIENT_TYPE_ERROR");
  assert.equal(JSON.parse(h.node("cacheInspector").textContent).lastFatal.phase, "reading-open");
  assert.doesNotMatch(JSON.stringify([...h.local.values()]), /SECRET|readerCode|authorId/);
  assert.equal(app.safeFatalErrorCode({code: "FABRICATED_SECRET_CODE", name: "constructor"}), "UNAVAILABLE");
});

test("an unavailable study cannot disable opening a different valid saved reading", async () => {
  const h = harness({cached: false});
  const other = h.fixture.payload(h.entries[1]);
  other.commentary.dailyIntroduction.markdown += " FABRICATED SECOND READING.";
  h.data.set("privateContent:" + h.entries[1].readingId, {...h.record, readingId: h.entries[1].readingId, payload: other});
  await h.hooks.loadReading(h.entries[0].readingId); await flush();
  await h.hooks.loadReading(h.entries[1].readingId); await flush();
  assert.equal(h.state.currentEntry.readingId, h.entries[1].readingId);
  assert.equal(h.state.readingUnavailableId, null);
  assert.match(h.node("overviewContent").textContent, /SECOND READING/);
  assert.equal(h.node("submitComment").disabled, false);
  assert.equal(h.data.get("commentDrafts:comment:" + h.entries[0].readingId).body, "FABRICATED retained draft");
});

test("fatal diagnostics identify awaited draft and cache-write subphases without messages or draft data", async () => {
  const draft = harness();
  const originalGet = draft.state.store.get;
  draft.state.store.get = async (store, key) => { if (store === "commentDrafts") throw new TypeError("FABRICATED PRIVATE DRAFT ERROR"); return originalGet(store, key); };
  let draftError;
  try { await draft.hooks.loadReading(draft.entries[0].readingId); } catch (error) { draftError = error; }
  draft.api.handleFatalError(draftError, "reading-open");
  assert.equal(draft.state.lastFatal.operation, "draft-restore");
  assert.equal(draft.state.lastFatal.code, "CLIENT_TYPE_ERROR");
  const cache = harness({cached: false, error: null}); cache.setResponse(cache.payload);
  cache.state.store.put = async () => { const error = new Error("FABRICATED PRIVATE QUOTA ERROR"); error.name = "QuotaExceededError"; throw error; };
  let cacheError;
  try { await cache.hooks.loadReading(cache.entries[0].readingId); } catch (error) { cacheError = error; }
  cache.api.handleFatalError(cacheError, "reading-open");
  assert.equal(cache.state.lastFatal.operation, "cache-write");
  assert.equal(cache.state.lastFatal.code, "LOCAL_STORAGE_FULL");
  assert.doesNotMatch(JSON.stringify([...cache.local.values(), ...draft.local.values()]), /PRIVATE|DRAFT ERROR|QUOTA ERROR/);
});

test("a pending reading payload resolving or rejecting after Home cannot render or enter global fatal", async () => {
  for (const reject of [false, true]) {
    const h = harness({cached: false}); const pending = deferred(); h.setResponse(pending.promise);
    const opening = h.hooks.loadReading(h.entries[0].readingId); await flush();
    h.setResponse(fault("CONTENT_UNAVAILABLE")); // Home's independent verse-metadata lookup does not reuse the pending reading call.
    h.hooks.showHome({sync: false, focus: false});
    if (reject) pending.reject(new TypeError("FABRICATED obsolete load")); else pending.resolve(h.payload);
    await opening; await flush();
    assert.equal(h.state.view, "home"); assert.equal(h.state.currentEntry, null);
    assert.equal(h.state.lastFatal, null); assert.equal(h.node("openSelectedReading").disabled, false);
    assert.equal(h.data.has("privateContent:" + h.entries[0].readingId), false);
    assert.doesNotMatch(h.node("overviewContent").textContent, /Fabricated test-only prose/);
  }
});

test("malformed fresh render shapes return CONTENT_INVALID without replacing a validated cache", async () => {
  for (const mutate of [c => {c.commentarySummary.paragraphs = [null];}, c => {c.sections = [null];},
    c => {c.keyInsights = [null];}, c => {c.coverage = {limitations: {length: 1}};}]) {
    const h = harness(); await h.hooks.loadReading(h.entries[0].readingId); await flush();
    const fresh = structuredClone(h.payload); mutate(fresh.commentary); h.setResponse(fresh);
    const result = await h.hooks.retryOpenReadingSync(); await flush();
    assert.equal(result.state, "retryable"); assert.equal(h.state.lastFatal, null);
    assert.equal(h.data.get("privateContent:" + h.entries[0].readingId).payload, h.payload);
    assert.equal(h.state.privatePayloadByReadingId.get(h.entries[0].readingId), h.payload);
    assert.match(h.node("commentaryRefreshMessage").textContent, /CONTENT_INVALID/);
    assert.match(h.node("overviewContent").textContent, /Fabricated/);
    assert.equal(h.node("submitComment").disabled, false);
  }
});

test("delayed draft A cannot enter B's composer or autosave under B's draft key", async () => {
  const h = harness(); const pending = deferred(); const originalGet = h.state.store.get;
  const idA = h.entries[0].readingId, idB = h.entries[1].readingId;
  h.data.set("privateContent:" + idB, {...h.record, readingId: idB, payload: h.fixture.payload(h.entries[1])});
  h.data.set("commentDrafts:comment:" + idB, {draftKey: "comment:" + idB, readingId: idB, body: "FABRICATED B draft"});
  h.state.store.get = (store, key) => store === "commentDrafts" && key === "comment:" + idA ? pending.promise : originalGet(store, key);
  const openingA = h.hooks.loadReading(idA); await flush();
  await h.hooks.loadReading(idB); await flush();
  pending.resolve({body: "FABRICATED delayed A draft"}); await openingA; await flush();
  assert.equal(h.node("commentBody").value, "FABRICATED B draft");
  h.hooks.scheduleDraftSave();
  for (const timer of [...h.timers.values()].filter(timer => timer.delay === 250)) await timer.callback();
  assert.equal(h.data.get("commentDrafts:comment:" + idB).body, "FABRICATED B draft");
  assert.equal(h.data.get("commentDrafts:comment:" + idA).body, "FABRICATED retained draft");
  assert.equal(h.state.lastFatal, null);
});

test("A to Home to A ignores the first draft restore and obsolete queued autosave generation", async () => {
  const h = harness(); const pending = deferred(); const originalGet = h.state.store.get; let first = true;
  h.state.store.get = (store, key) => { if (store === "commentDrafts" && first) { first = false; return pending.promise; } return originalGet(store, key); };
  const oldOpening = h.hooks.loadReading(h.entries[0].readingId); await flush();
  h.node("commentBody").value = "FABRICATED obsolete typed body"; h.hooks.scheduleDraftSave();
  const oldTimer = [...h.timers.values()].find(timer => timer.delay === 250);
  h.hooks.showHome({sync: false, focus: false});
  await h.hooks.openReading(h.entries[0].readingId); await flush();
  pending.resolve({body: "FABRICATED obsolete restored body"}); await oldOpening; await oldTimer.callback();
  assert.equal(h.node("commentBody").value, "FABRICATED retained draft");
  assert.equal(h.data.get("commentDrafts:comment:" + h.entries[0].readingId).body, "FABRICATED retained draft");
  assert.equal(h.state.lastFatal, null);
});

test("validated legacy summaries, complete Henry and source-link fallback remain renderable", async () => {
  for (const version of ["commentary/v1", "commentary/v2", "commentary/v3"]) {
    const h = harness(); const payload = h.fixture.fallback(h.entries[0]);
    payload.commentary.schemaVersion = version;
    if (version !== "commentary/v3") {
      payload.commentary.overview = payload.commentary.dailyIntroduction.markdown; delete payload.commentary.dailyIntroduction;
      payload.commentary.keyInsights = payload.commentary.commentarySummary.paragraphs; delete payload.commentary.commentarySummary;
      payload.commentary.sections = [{sectionId: "synthesis", title: "Fabricated synthesis", ...payload.commentary.comprehensiveSynthesis}];
      delete payload.commentary.comprehensiveSynthesis;
    }
    h.record.payload = payload;
    await h.hooks.loadReading(h.entries[0].readingId); await flush();
    assert.equal(h.state.readingUnavailableId, null); assert.equal(h.state.lastFatal, null);
    assert.match(h.node("overviewContent").textContent, /Fabricated/);
    assert.equal(h.node("submitComment").disabled, false);
  }
});

test("validated book-introduction fallback remains available without a chapter verse selection", async () => {
  const h = harness(); const entry = h.entries[0]; entry.kind = "book_intro"; delete entry.chapter; delete entry.passages;
  const payload = h.fixture.fallback(entry); delete payload.commentary.verseOfTheDay;
  payload.commentary.overview = payload.commentary.dailyIntroduction.markdown;
  h.record.payload = payload;
  await h.hooks.loadReading(entry.readingId); await flush();
  assert.equal(h.state.readingUnavailableId, null); assert.equal(h.state.lastFatal, null);
  assert.equal(h.node("scriptureSection").hidden, true);
  assert.match(h.node("bookIntroductionContent").textContent, /Fabricated/);
  assert.equal(h.node("submitComment").disabled, false);
});

test("late revalidation and discussion responses do not update Home or a later A generation", async () => {
  const h = harness(); await h.hooks.loadReading(h.entries[0].readingId); await flush();
  const pending = deferred(); h.setResponse(pending.promise);
  const refresh = h.hooks.retryOpenReadingSync(); await flush();
  const discussion = deferred(); h.state.adapter.listComments = () => discussion.promise;
  const comments = h.hooks.refreshComments(); await flush();
  h.hooks.showHome({sync: false, focus: false});
  h.setResponse(fault("CONTENT_UNAVAILABLE")); h.state.adapter.listComments = async () => [];
  await h.hooks.openReading(h.entries[0].readingId); await flush();
  pending.reject(new TypeError("FABRICATED obsolete refresh"));
  discussion.resolve([{commentId: "FABRICATED-old-comment", readingId: h.entries[0].readingId,
    displayName: "FABRICATED author", body: "FABRICATED obsolete discussion", updatedAt: new Date().toISOString()}]);
  await refresh; await comments; await flush();
  assert.equal(h.state.lastFatal, null);
  assert.doesNotMatch(h.node("commentList").textContent, /obsolete discussion/);
  assert.equal(h.node("submitComment").disabled, false);
});

test("submitting a captured A draft cannot clear B's composer or delete B's draft after navigation", async () => {
  const h = harness(); await h.hooks.loadReading(h.entries[0].readingId); await flush();
  const idA = h.entries[0].readingId, idB = h.entries[1].readingId, pending = deferred(), originalPut = h.state.store.put;
  h.data.set("privateContent:" + idB, {...h.record, readingId: idB, payload: h.fixture.payload(h.entries[1])});
  h.data.set("commentDrafts:comment:" + idB, {draftKey: "comment:" + idB, readingId: idB, body: "FABRICATED B draft"});
  h.state.store.put = async (store, value) => { if (store === "commentOutbox") await pending.promise; return originalPut(store, value); };
  const submitting = h.hooks.submitNewComment({preventDefault() {}}); await flush();
  await h.hooks.loadReading(idB); await flush(); pending.resolve(); await submitting;
  const outbox = await h.state.store.getAll("commentOutbox");
  assert.equal(outbox.length, 1); assert.equal(outbox[0].readingId, idA);
  assert.equal(outbox[0].body, "FABRICATED retained draft");
  assert.equal(h.node("commentBody").value, "FABRICATED B draft");
  assert.equal(h.data.get("commentDrafts:comment:" + idB).body, "FABRICATED B draft");
});

test("a delayed draft cannot enter a replacement reader session", async () => {
  const h = harness(); const pending = deferred(), originalGet = h.state.store.get;
  h.state.store.get = (store, key) => store === "commentDrafts" ? pending.promise : originalGet(store, key);
  const opening = h.hooks.loadReading(h.entries[0].readingId); await flush();
  h.state.readerSessionEpoch += 1; h.state.session = {authorId: "shane", displayName: "FABRICATED replacement reader"};
  pending.resolve({body: "FABRICATED other reader draft"}); await opening;
  assert.equal(h.node("commentBody").value, ""); assert.equal(h.state.lastFatal, null);
});
