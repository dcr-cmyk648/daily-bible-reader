const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const {webcrypto} = require("node:crypto");

const CURRENT = "1111111111111111", NEXT = "2222222222222222";
const BASE = "https://fabricated.example.test/daily-bible-reader/web/pwa-canary/";
const clientSource = fs.readFileSync(require.resolve("../app/pages-pwa/client.js"), "utf8");
const workerSource = fs.readFileSync(require.resolve("../app/pages-pwa/service-worker.js"), "utf8");
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };

function client({release = NEXT, store = new Map(), legacy = false, base = BASE, storageFails = false, activationFails = false} = {}) {
  const nodes = {pwaUpdatePanel: {hidden: true}, pwaUpdateInspector: {hidden: true}, documentElement: {dataset: {}}};
  const events = new Map(), order = [];
  let reloads = 0, activations = 0;
  const scope = base;
  function worker(id) {
    return {scriptURL: base + "service-worker.js", state: "installed", addEventListener() {},
      postMessage(data, ports) {
        if (data.type === "DBR_ACTIVATE_UPDATE") {
          order.push("activate"); activations++;
          if (activationFails) throw new Error("FABRICATED activation failure");
        }
        if (data.type === "DBR_WORKER_INFO" && !legacy) ports[0].peer.onmessage({data: {
          type: "DBR_WORKER_INFO", releaseId: id, scope, activation: {cleanup: "ok", claim: "ok"}
        }});
      }};
  }
  const waiting = worker(release);
  const registration = {scope, waiting, addEventListener() {}, update: async () => {}};
  const serviceWorker = {controller: worker(CURRENT), register: async () => registration,
    addEventListener(type, fn) { events.set(type, fn); }};
  const context = {URL, AbortController, setTimeout, clearTimeout, crypto: webcrypto,
    location: {href: base, origin: new URL(base).origin, reload() { reloads++; }},
    navigator: {serviceWorker},
    localStorage: {getItem(key) { if (storageFails) throw new Error("FABRICATED storage denial"); return store.get(key); },
      setItem(key, value) { if (storageFails) throw new Error("FABRICATED storage denial"); order.push("save"); store.set(key, value); }},
    fetch: async () => new Response("FABRICATED legacy worker bytes"),
    MessageChannel: legacy ? undefined : class {
      constructor() { this.port1 = {close() {}}; this.port2 = {close() {}, peer: this.port1}; }
    }};
  const config = {schemaVersion: "dbr-pages-public-config/v2", enabled: true, pwaReleaseId: CURRENT};
  vm.runInNewContext(clientSource.replace("__DBR_PUBLIC_CONFIG__", JSON.stringify(config)), context);
  context.document = {documentElement: nodes.documentElement, getElementById: id => nodes[id]};
  return {api: context.DBRPagesPwa, nodes, registration, serviceWorker, waiting, worker, store, order,
    get reloads() { return reloads; }, get activations() { return activations; },
    async change(controller = waiting) { serviceWorker.controller = controller; events.get("controllerchange")(); await flush(); }};
}

test("same-release waiting workers activate silently without first-install or repeated controller reloads", async () => {
  const h = client({release: CURRENT});
  await h.api.registerServiceWorker();
  assert.equal(h.nodes.pwaUpdatePanel.hidden, true);
  assert.equal(h.activations, 1);
  await h.change(); await h.change();
  assert.equal(h.reloads, 0);
  assert.equal(h.store.size, 0);
  assert.equal(h.api.updateDiagnostics().controllerReleaseId, CURRENT);
});

test("first installation and a foreign claim during an explicit update never force a restart", async () => {
  const first = client(); first.registration.waiting = null; first.serviceWorker.controller = null;
  await first.api.registerServiceWorker(); await first.change();
  assert.equal(first.reloads, 0); assert.equal(first.nodes.pwaUpdatePanel.hidden, true);
  const requested = client(); await requested.api.registerServiceWorker(); requested.api.activateWaitingWorker();
  await requested.change(requested.worker("4444444444444444"));
  assert.equal(requested.reloads, 0); assert.equal(requested.api.updateDiagnostics().state, "unexpected_controller");
  await requested.change(); assert.equal(requested.reloads, 1);
});

test("a requested update persists before activation and reloads once despite duplicate controllerchange", async () => {
  const h = client(); await h.api.registerServiceWorker();
  assert.equal(h.nodes.pwaUpdatePanel.hidden, false);
  h.api.activateWaitingWorker(); h.api.activateWaitingWorker();
  assert.deepEqual(h.order, ["save", "activate"]);
  await h.change(); await h.change();
  assert.equal(h.reloads, 1);
  assert.equal(JSON.parse([...h.store.values()][0]).reloadIssued, true);
  assert.equal(h.nodes.pwaUpdatePanel.hidden, true);
});

test("reload and force-close recovery suppress the same waiting release but admit a genuinely different release", async () => {
  const store = new Map(), first = client({store}); await first.api.registerServiceWorker();
  first.api.activateWaitingWorker(); await first.change();
  const reopened = client({store}); await reopened.api.registerServiceWorker();
  assert.equal(reopened.nodes.pwaUpdatePanel.hidden, true);
  assert.equal(reopened.api.updateDiagnostics().state, "repeat_attempt_suppressed");
  await reopened.change(); assert.equal(reopened.reloads, 0); assert.equal(reopened.activations, 0);
  const newer = client({store, release: "3333333333333333"}); await newer.api.registerServiceWorker();
  assert.equal(newer.nodes.pwaUpdatePanel.hidden, false);
});

test("legacy worker bytes get one persisted attempt without an invented installed release", async () => {
  const store = new Map(), first = client({store, legacy: true}); await first.api.registerServiceWorker();
  assert.equal(first.api.updateDiagnostics().waitingReleaseId, null);
  assert.match(first.api.updateDiagnostics().waitingFingerprint, /^[a-f0-9]{64}$/);
  first.api.activateWaitingWorker(); await first.change(); assert.equal(first.reloads, 1);
  const reopened = client({store, legacy: true}); await reopened.api.registerServiceWorker();
  assert.equal(reopened.nodes.pwaUpdatePanel.hidden, true); await reopened.change(); assert.equal(reopened.reloads, 0);
});

test("storage denial and failed activation do not create restart loops", async () => {
  const denied = client({storageFails: true}); await denied.api.registerServiceWorker();
  denied.api.activateWaitingWorker(); await denied.change();
  assert.equal(denied.activations, 0); assert.equal(denied.reloads, 0);
  assert.equal(denied.api.updateDiagnostics().storageAvailable, false);
  const store = new Map(), failed = client({store, activationFails: true}); await failed.api.registerServiceWorker();
  failed.api.activateWaitingWorker(); assert.equal(failed.api.updateDiagnostics().state, "activation_request_failed");
  const reopened = client({store}); await reopened.api.registerServiceWorker();
  assert.equal(reopened.nodes.pwaUpdatePanel.hidden, true);
});

test("parent claims cannot restart a canary and public attempt markers remain scope-specific", async () => {
  const store = new Map(), parent = client({store}); await parent.api.registerServiceWorker(); parent.api.activateWaitingWorker();
  const nested = client({store, base: BASE + "canaries/aaaaaaaaaaaaaaaa/"}); await nested.api.registerServiceWorker();
  assert.equal(nested.nodes.pwaUpdatePanel.hidden, false);
  const foreign = nested.worker("4444444444444444"); foreign.scriptURL = BASE + "service-worker.js";
  await nested.change(foreign); assert.equal(nested.reloads, 0);
  nested.registration.waiting = foreign;
  // Re-registering here only exercises a mismatched waiting script; no fetch or
  // activation may be justified by the parent registration's identity.
  await nested.api.registerServiceWorker();
  assert.equal(nested.api.updateDiagnostics().state, "waiting_identity_unavailable");
});

function service({cleanupFails = false, claimFails = false, skipFails = false} = {}) {
  const events = {}, stores = new Map(), deleted = [];
  let claims = 0, skips = 0;
  const meta = BASE + "__dbr_cache_meta__";
  const cache = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {addAll: async () => {}, put: async (url, response) => entries.set(typeof url === "string" ? url : url.url, response),
      match: async url => { const response = entries.get(typeof url === "string" ? url : url.url); return response && response.clone(); }};
  };
  const context = {URL, Response, self: {location: {href: BASE + "service-worker.js", origin: new URL(BASE).origin},
    registration: {scope: BASE}, addEventListener(type, fn) { events[type] = fn; },
    clients: {claim: async () => { claims++; if (claimFails) throw new Error("FABRICATED claim failure"); }},
    skipWaiting: async () => { skips++; if (skipFails) throw new Error("FABRICATED skip failure"); }},
    caches: {open: async name => cache(name), keys: async () => { if (cleanupFails) throw new Error("FABRICATED cache failure"); return [...stores.keys()]; },
      delete: async name => { deleted.push(name); return stores.delete(name); },
      match: () => { throw new Error("Origin-wide cache lookup is forbidden in this fixture"); }},
    fetch: async () => { throw new Error("FABRICATED offline"); }};
  vm.runInNewContext(workerSource.replaceAll("__DBR_PWA_RELEASE_ID__", CURRENT)
    .replace("__DBR_PRECACHE_URLS__", JSON.stringify(["./", "index.html", "../release.json", "assets/public.js"])), context);
  const info = () => { let result; events.message({data: {type: "DBR_WORKER_INFO"}, ports: [{postMessage(value) { result = value; }}]}); return result; };
  return {events, stores, deleted, info, context, meta, cache,
    get claims() { return claims; }, get skips() { return skips; },
    async activate() { let done; events.activate({waitUntil(value) { done = value; }}); await done; }};
}

test("cleanup failure still claims; claim failure completes activation and reports only safe status codes", async () => {
  const cleanup = service({cleanupFails: true}); await cleanup.activate();
  assert.equal(cleanup.claims, 1); assert.equal(cleanup.info().activation.cleanup, "failed");
  assert.equal(cleanup.info().activation.claim, "ok");
  const claim = service({claimFails: true}); await claim.activate();
  assert.equal(claim.info().activation.claim, "failed");
  assert.doesNotMatch(JSON.stringify(claim.info()), /FABRICATED|stack|errorMessage/);
});

test("activation commands extend event lifetime and contain skipWaiting rejection", async () => {
  const h = service({skipFails: true}); let done;
  h.events.message({data: {type: "DBR_ACTIVATE_UPDATE"}, waitUntil(value) { done = value; }});
  await done; assert.equal(h.skips, 1); assert.equal(h.info().activation.claim, "activation_request_failed");
});

test("cache cleanup keeps a prior own release and preserves sibling or unidentified caches", async () => {
  const h = service();
  for (const [suffix, time, scope] of [["old", 1, BASE], ["prior", 2, BASE], ["foreign", 0, BASE + "canaries/"], ["unknown", null, null]]) {
    const c = h.cache("dbr-pages-shell-v1-" + suffix);
    if (time !== null) await c.put(h.meta, new Response(JSON.stringify({cachedAt: time, scope})));
  }
  h.cache("dbr-unselected-aaaaaaaaaaaaaaaa-aaaaaaaaaaaaaaaa");
  await h.activate(); assert.deepEqual(h.deleted, ["dbr-pages-shell-v1-old"]);
});

test("root worker excludes nested-canary navigation and never serves an origin-wide fallback", async () => {
  const h = service(); let response;
  h.events.fetch({request: {method: "GET", url: BASE + "canaries/aaaaaaaaaaaaaaaa/", mode: "navigate"},
    respondWith(value) { response = value; }});
  assert.equal(response, undefined);
  await h.cache("dbr-pages-shell-v1-" + CURRENT).put(BASE, new Response("FABRICATED own shell"));
  await h.cache("foreign-cache").put(BASE, new Response("FABRICATED foreign shell"));
  h.events.fetch({request: {method: "GET", url: BASE, mode: "navigate"}, respondWith(value) { response = value; }});
  assert.equal(await (await response).text(), "FABRICATED own shell");
});

test("worker ignores private, cross-origin, config and unenumerated same-origin resources", () => {
  const h = service();
  for (const request of [{method: "POST", url: BASE}, {method: "GET", url: "https://private.example.test/resource"},
    {method: "GET", url: BASE + "config.json"}, {method: "GET", url: BASE + "not-public.json"}]) {
    h.events.fetch({request, respondWith() { assert.fail("Unexpected private/resource interception"); }});
  }
});
