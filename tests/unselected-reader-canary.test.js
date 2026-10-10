const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {createHash} = require("node:crypto");
const root = path.resolve(__dirname, "..");
const recordPath = path.join(root, "config/unselected-reader-canary.json");
const pending = fs.existsSync(recordPath);
const read = name => fs.readFileSync(path.join(root, name));

test("unselected canary keeps production byte-identical and resolves integrity-checked assets from its own manifest", {skip: !pending}, async () => {
  const record = JSON.parse(fs.readFileSync(recordPath));
  const base = `web/pwa-canary/canaries/${record.id}/`;
  for (const [name, hash] of Object.entries(record.productionHashes)) {
    assert.equal(createHash("sha256").update(read(name)).digest("hex"), hash, name);
  }
  const context = {URL, Date, JSON, Promise, Set, Map, Proxy, Uint8Array, setTimeout, clearTimeout,
    location: {href: record.url, origin: new URL(record.url).origin}};
  vm.runInNewContext(read(`web/pwa-canary/assets/pwa-client.${record.id}.js`).toString(), context);
  const release = JSON.parse(read(base + "release.json"));
  const checked = context.DBRPagesPwa.validateRelease(release);
  assert.equal(checked.core.url, new URL("/daily-bible-reader/web/" + release.assets.core.path, record.url).href);
  release.assets.core.path = "https://evil.example.test/app.js";
  assert.throws(() => context.DBRPagesPwa.validateRelease(release), /allowlist/);
  const fetched = [], scripts = [], registrations = [];
  context.fetch = async url => {fetched.push(url); return {ok: true, json: async () => JSON.parse(read(base + "release.json"))};};
  context.document = {documentElement: {dataset: {}}, getElementById: () => null, createElement: () => ({}),
    body: {appendChild: element => {scripts.push(element.src); element.onload();}}};
  context.navigator = {serviceWorker: {register: async (url, options) => {
    registrations.push({url, scope: options.scope}); return {addEventListener() {}, update: async () => {}};
  }, addEventListener() {}}};
  await context.DBRPagesPwa.start();
  assert.deepEqual(fetched, [`/daily-bible-reader/web/pwa-canary/canaries/${record.id}/release.json`]);
  assert.equal(scripts.length, 2); assert.equal(scripts[0], checked.core.url);
  assert.deepEqual(registrations, [{url: "service-worker.js", scope: "./"}]);
  const html = read(base + "index.html").toString();
  assert.match(html, new RegExp(`src="../../assets/pwa-client\\.${record.id}\\.js"`));
  assert.ok(html.indexOf('id="calendarWeeks"') < html.indexOf('id="contentReadinessAlert"'));
  assert.ok(html.indexOf('id="contentReadinessAlert"') < html.indexOf('id="storageHeading"'));
});

test("canary worker activation cannot prune production caches or cache a private response", {skip: !pending}, async () => {
  const record = JSON.parse(fs.readFileSync(recordPath));
  const events = {}, deleted = [], requests = [];
  const names = ["dbr-pages-shell-v1-fabricated-old", "dbr-pages-shell-v1-fabricated-current",
    `dbr-unselected-${record.id}-${record.id}`];
  const context = {URL, Set, Date, JSON, Response,
    self: {location: {href: record.url + "service-worker.js"}, addEventListener: (type, listener) => {events[type] = listener;},
      clients: {claim: async () => {}}, skipWaiting() {}},
    caches: {keys: async () => names, delete: async name => {deleted.push(name);}, open: async () => ({addAll: async urls => {requests.push(...urls);}, put: async () => {}})}};
  vm.runInNewContext(read(`web/pwa-canary/canaries/${record.id}/service-worker.js`).toString(), context);
  let finished;
  events.activate({waitUntil: promise => {finished = promise;}}); await finished;
  assert.deepEqual(deleted, []);
  events.install({waitUntil: promise => {finished = promise;}}); await finished;
  assert.ok(requests.includes("release.json"));
  assert.ok(requests.every(url => !/google|private-content|reader-code/i.test(url)));
  let intercepted = false;
  const respondWith = () => {intercepted = true;};
  events.fetch({request: {method: "POST", url: record.url}, respondWith});
  events.fetch({request: {method: "GET", url: "https://private.example.test/data"}, respondWith});
  assert.equal(intercepted, false);
});
