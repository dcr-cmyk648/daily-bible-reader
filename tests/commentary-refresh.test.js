const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const app = require("../app/frontend/app.js");

function setup(refresh, overrides = {}) {
  let now = 1000, nextId = 0, active = true;
  const timers = new Map(), states = [];
  const controller = app.createCommentaryRefreshController({
    refresh, retryDelays: [5000, 15000, 30000], now: () => now,
    isActive: () => active, onChange: state => states.push(state),
    setTimer(callback, delay) { const id = ++nextId; timers.set(id, {callback, delay}); return id; },
    clearTimer(id) { timers.delete(id); }, ...overrides
  });
  controller.select("FABRICATED-READING-A");
  return {
    controller, timers, states, setActive: value => { active = value; },
    async next() {
      assert.equal(timers.size, 1);
      const [id, timer] = [...timers][0]; timers.delete(id); now += timer.delay;
      await timer.callback();
      return timer.delay;
    }
  };
}

test("a transient commentary check recovers automatically without reopening", async () => {
  let attempts = 0;
  const h = setup(async () => ({state: ++attempts === 1 ? "retryable" : "refreshed"}));
  await h.controller.request();
  assert.equal(h.controller.snapshot().phase, "retrying");
  assert.equal(await h.next(), 5000);
  assert.equal(attempts, 2);
  assert.equal(h.controller.snapshot().phase, "confirmed");
  assert.equal(h.controller.snapshot().checkedAt, 6000);
  assert.equal(h.timers.size, 0);
});

test("repeated failures stop after three spaced retries and permit an explicit retry", async () => {
  let calls = 0;
  const h = setup(async () => { calls++; return {state: "retryable"}; });
  await h.controller.request();
  assert.deepEqual([await h.next(), await h.next(), await h.next()], [5000, 15000, 30000]);
  assert.equal(calls, 4);
  assert.equal(h.controller.snapshot().phase, "failed");
  assert.equal(h.timers.size, 0);
  await h.controller.request();
  assert.equal(calls, 5);
  assert.equal(h.controller.snapshot().attempt, 1);
  assert.equal(h.timers.size, 1);
});

test("concurrent checks share one request and one retry timer", async () => {
  let finish, calls = 0;
  const h = setup(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const first = h.controller.request(), second = h.controller.request();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish({state: "retryable"});
  await first;
  assert.equal(h.timers.size, 1);
});

test("leaving a reading cancels its retry and late failures cannot affect the next reading", async () => {
  const queued = setup(async () => ({state: "retryable"}));
  await queued.controller.request();
  queued.controller.clear();
  assert.equal(queued.timers.size, 0);
  let finish;
  const active = setup(() => new Promise(resolve => { finish = resolve; }));
  const old = active.controller.request(); await Promise.resolve();
  active.controller.select("FABRICATED-READING-B");
  finish({state: "retryable"}); await old;
  assert.equal(active.controller.snapshot().readingId, "FABRICATED-READING-B");
  assert.equal(active.controller.snapshot().phase, "saved");
  assert.equal(active.timers.size, 0);
});

test("hidden readers pause queued retries and resume with a fresh check", async () => {
  const h = setup(async () => ({state: "retryable"}));
  await h.controller.request();
  h.setActive(false); h.controller.pause();
  assert.equal(h.timers.size, 0);
  assert.equal((await h.controller.request()).state, "inactive");
  h.setActive(true); await h.controller.request();
  assert.equal(h.controller.snapshot().phase, "retrying");
  assert.equal(h.timers.size, 1);
});

test("a request failing while hidden does not start a background retry", async () => {
  let finish;
  const h = setup(() => new Promise(resolve => { finish = resolve; }));
  const waiting = h.controller.request(); await Promise.resolve();
  h.setActive(false); h.controller.pause();
  finish({state: "retryable"}); await waiting;
  assert.equal(h.controller.snapshot().phase, "saved");
  assert.equal(h.timers.size, 0);
});

test("denied access cancels refresh and non-transient failures never auto-retry", async () => {
  for (const state of ["denied", "failed"]) {
    const h = setup(async () => ({state}));
    await h.controller.request();
    assert.equal(h.timers.size, 0);
    assert.equal(h.controller.snapshot().phase, state === "denied" ? "idle" : "failed");
  }
});

test("a verified newer payload cancels queued retries and supersedes late failed checks", async () => {
  const queued = setup(async () => ({state: "retryable"}));
  await queued.controller.request(); queued.controller.confirm("FABRICATED-READING-A");
  assert.equal(queued.timers.size, 0);
  let finish;
  const h = setup(() => new Promise(resolve => { finish = resolve; }));
  const waiting = h.controller.request(); await Promise.resolve();
  h.controller.confirm("FABRICATED-READING-A");
  finish({state: "retryable"}); await waiting;
  assert.equal(h.controller.snapshot().phase, "confirmed");
  assert.equal(h.timers.size, 0);
});

test("freshness text retains the last successful check when a subsequent check fails", async () => {
  let fails = false;
  const h = setup(async () => ({state: fails ? "failed" : "refreshed"}));
  await h.controller.request();
  const checked = h.controller.snapshot().checkedAt;
  fails = true; await h.controller.request();
  assert.equal(h.controller.snapshot().checkedAt, checked);
  const message = app.commentaryRefreshPresentation(h.controller.snapshot());
  assert.match(message.text, /couldn’t check for updates/);
  assert.match(message.text, /last checked at/);
  assert.equal(message.retryVisible, true);
});

test("successful background discussion cannot erase a commentary failure indicator", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const take = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
  const nodes = {
    commentaryRefreshStatus: {dataset: {}, hidden: false},
    commentaryRefreshMessage: {textContent: ""},
    retryCommentaryRefresh: {hidden: true}
  };
  let discussionStatus = "";
  const sandbox = {
    root: {document: {}}, element: id => nodes[id],
    commentaryRefreshPresentation: app.commentaryRefreshPresentation,
    state: {currentEntry: {readingId: "FABRICATED-READING-A"}, commentSyncToken: 0,
      adapter: {listComments: async () => []}, store: {getAll: async () => []}},
    recoverServerAccess: async () => true, replaceCommentSnapshots: async () => {},
    updateReadingCompletion() {}, renderComments: async () => {}, loadCachedDiscussion: async () => {},
    setSyncStatus: text => { discussionStatus = text; }
  };
  vm.createContext(sandbox);
  vm.runInContext(take("  function renderCommentaryRefreshStatus(", "  async function revalidateOpenReading(") +
    take("  async function refreshComments(", "  async function queueComment("), sandbox);
  const h = setup(async () => ({state: "failed"}), {onChange: snapshot => sandbox.renderCommentaryRefreshStatus(snapshot)});
  await h.controller.request();
  const warning = nodes.commentaryRefreshMessage.textContent;
  assert.match(warning, /couldn’t check for updates/);
  await sandbox.refreshComments({background: true});
  assert.equal(discussionStatus, "Discussion synchronized");
  assert.equal(nodes.commentaryRefreshMessage.textContent, warning);
  assert.equal(nodes.retryCommentaryRefresh.hidden, false);
});

function persistenceSandbox(tracker, controller, initial) {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const persist = source.slice(source.indexOf("  async function persistPrivatePayload("), source.indexOf("  function mayUseOfflineFallback("));
  const state = {privatePayloadByReadingId: new Map([["FABRICATED-READING-A", initial]]),
    config: {}, view: "reading", currentEntry: {readingId: "FABRICATED-READING-A"}};
  const rendered = [];
  const sandbox = {state, privatePayloadRequests: tracker, commentaryRefresh: controller,
    privatePayloadRevision: app.privatePayloadRevision, renderCommentary: value => rendered.push(value),
    notifyHighlightCommentaryUpdate() {}, setSyncStatus() {}};
  vm.createContext(sandbox); vm.runInContext(persist, sandbox);
  return {state, rendered, persist: sandbox.persistPrivatePayload};
}

test("a late older background download cannot cancel a newer failed check's automatic retry", async () => {
  const tracker = app.createPrivatePayloadRequestTracker();
  const background = tracker.begin(["FABRICATED-READING-A"]);
  const old = {metadata: {readingId: "FABRICATED-READING-A", commentaryVersion: "fabricated/old"}};
  const h = setup(async () => {
    tracker.begin(["FABRICATED-READING-A"]);
    return {state: "retryable"};
  });
  await h.controller.request();
  const p = persistenceSandbox(tracker, h.controller, old);
  assert.equal(await p.persist("FABRICATED-READING-A", old, background), false);
  assert.equal(h.controller.snapshot().phase, "retrying");
  assert.equal(h.timers.size, 1);
  assert.equal(p.rendered.length, 0);
});

test("out-of-order reading responses cannot replace a newer accepted payload", async () => {
  const tracker = app.createPrivatePayloadRequestTracker();
  const oldRequest = tracker.begin(["FABRICATED-READING-A", "FABRICATED-READING-B"]);
  const newest = tracker.begin(["FABRICATED-READING-A"]);
  const old = {metadata: {readingId: "FABRICATED-READING-A", commentaryVersion: "fabricated/old"}};
  const fresh = {metadata: {...old.metadata, commentaryVersion: "fabricated/new"}};
  const h = setup(async () => ({state: "refreshed"}));
  const p = persistenceSandbox(tracker, h.controller, old);
  assert.equal(await p.persist("FABRICATED-READING-A", fresh, newest), true);
  assert.equal(await p.persist("FABRICATED-READING-A", old, oldRequest), false);
  assert.equal(p.state.privatePayloadByReadingId.get("FABRICATED-READING-A"), fresh);
  assert.equal(p.rendered.length, 1);
  assert.equal(tracker.isCurrent("FABRICATED-READING-B", oldRequest), true);
});

test("credential or cache reset invalidates every outstanding private download", async () => {
  const tracker = app.createPrivatePayloadRequestTracker();
  const request = tracker.begin(["FABRICATED-READING-A"]);
  const old = {metadata: {readingId: "FABRICATED-READING-A", commentaryVersion: "fabricated/old"}};
  const h = setup(async () => ({state: "refreshed"}));
  const p = persistenceSandbox(tracker, h.controller, old);
  tracker.clear();
  assert.equal(await p.persist("FABRICATED-READING-A", old, request), false);
  assert.equal(p.rendered.length, 0);
  assert.equal(h.controller.snapshot().phase, "saved");
});
