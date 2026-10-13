"use strict";

var PWA_RELEASE_ID = "__DBR_PWA_RELEASE_ID__";
var CACHE_PREFIX = "dbr-pages-shell-v1-";
var CACHE_NAME = CACHE_PREFIX + PWA_RELEASE_ID;
var CACHE_META_URL = new URL("__dbr_cache_meta__", self.location.href).toString();
var CONFIG_URL = new URL("config.json", self.location.href).toString();
var INDEX_URL = new URL("./", self.location.href).toString();
var RELEASE_MANIFEST_URL = new URL("../release.json", self.location.href).toString();
var PRECACHE_URLS = __DBR_PRECACHE_URLS__;
var ALLOWED_CACHE_URLS = new Set(PRECACHE_URLS.map(function absolute(value) {
  return new URL(value, self.location.href).toString();
}));
// A worker can be restarted without another activate event. Unknown is honest
// in that case; the current event's results are session-only diagnostics.
var ACTIVATION = {cleanup: "unknown", claim: "unknown"};

async function cacheCurrentRelease() {
  var cache = await caches.open(CACHE_NAME);
  await cache.addAll(PRECACHE_URLS);
  await cache.put(CACHE_META_URL, new Response(JSON.stringify({releaseId: PWA_RELEASE_ID, cachedAt: Date.now(), scope: self.registration.scope}), {
    headers: {"Content-Type": "application/json", "Cache-Control": "no-store"}
  }));
}

async function cacheTimestamp(cacheName) {
  try {
    var cache = await caches.open(cacheName);
    var response = await cache.match(CACHE_META_URL);
    if (!response) return null;
    var value = await response.json();
    if (value.scope && value.scope !== self.registration.scope) return null;
    return Number.isFinite(value.cachedAt) ? value.cachedAt : null;
  } catch (_error) {
    return null;
  }
}

async function pruneOldReleases() {
  var names = (await caches.keys()).filter(function readerCache(name) { return name.startsWith(CACHE_PREFIX); });
  var older = names.filter(function notCurrent(name) { return name !== CACHE_NAME; });
  var dated = await Promise.all(older.map(async function dateCache(name) {
    return {name: name, cachedAt: await cacheTimestamp(name)};
  }));
  // CacheStorage is shared by the origin. Missing/foreign metadata is not
  // permission to delete a sibling registration's cache.
  dated = dated.filter(function owned(record) { return record.cachedAt !== null; });
  dated.sort(function newestFirst(a, b) { return b.cachedAt - a.cachedAt; });
  await Promise.all(dated.slice(1).map(function deleteOld(record) { return caches.delete(record.name); }));
}

async function networkFirst(request, fallbackUrl) {
  try {
    var response = await fetch(request);
    if (response && response.ok && ALLOWED_CACHE_URLS.has(request.url)) {
      var cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    var cache = await caches.open(CACHE_NAME);
    var cached = await cache.match(request);
    if (!cached && fallbackUrl) cached = await cache.match(fallbackUrl);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  var cache = await caches.open(CACHE_NAME);
  var cached = await cache.match(request);
  if (cached) return cached;
  var response = await fetch(request);
  if (response && response.ok && ALLOWED_CACHE_URLS.has(request.url)) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("install", function install(event) {
  event.waitUntil(cacheCurrentRelease());
});

self.addEventListener("activate", function activate(event) {
  event.waitUntil((async function finishActivation() {
    ACTIVATION.cleanup = "pending";
    ACTIVATION.claim = "pending";
    try { await pruneOldReleases(); ACTIVATION.cleanup = "ok"; }
    catch (_error) { ACTIVATION.cleanup = "failed"; }
    // Best-effort public-cache cleanup must not prevent claim, or reject the
    // worker activation promise. A failed claim is visible via the handshake.
    try { await self.clients.claim(); ACTIVATION.claim = "ok"; }
    catch (_error) { ACTIVATION.claim = "failed"; }
  })());
});

self.addEventListener("message", function message(event) {
  if (event.data && event.data.type === "DBR_WORKER_INFO" && event.ports && event.ports[0]) {
    event.ports[0].postMessage({type: "DBR_WORKER_INFO", releaseId: PWA_RELEASE_ID,
      scope: self.registration.scope, activation: ACTIVATION});
  }
  if (event.data && event.data.type === "DBR_ACTIVATE_UPDATE") {
    event.waitUntil(Promise.resolve().then(function activateWaiting() { return self.skipWaiting(); }).catch(function failed() {
      ACTIVATION.claim = "activation_request_failed";
    }));
  }
});

self.addEventListener("fetch", function onFetch(event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin || request.url === CONFIG_URL) return;
  if (request.mode === "navigate") {
    // Root ./ includes nested canaries in its scope. Only serve this shell's
    // own navigation; never turn a sibling canary failure into the root app.
    var indexPath = new URL(INDEX_URL).pathname;
    if (url.pathname !== indexPath && url.pathname !== indexPath + "index.html") return;
    event.respondWith(networkFirst(request, INDEX_URL));
    return;
  }
  if (request.url === RELEASE_MANIFEST_URL) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (ALLOWED_CACHE_URLS.has(request.url)) event.respondWith(cacheFirst(request));
});
