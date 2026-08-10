const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ORIGIN = "https://assets.example.test";
const ROOT_PATH = "/daily-bible-reader/web/";
const RELEASE_ID = "0123456789abcdef";
const INTEGRITY = `sha384-${"A".repeat(64)}`;

function loaderSource() {
  return fs.readFileSync(path.join(__dirname, "../app/frontend/static-loader.js"), "utf8")
    .replaceAll("__DBR_PAGES_MANIFEST_URL__", `${ORIGIN}${ROOT_PATH}release.json`)
    .replaceAll("__DBR_PAGES_ORIGIN__", ORIGIN)
    .replaceAll("__DBR_PAGES_RELEASE_PATH_PREFIX__", `${ROOT_PATH}releases/`);
}

function manifest(overrides = {}) {
  const asset = (name, filename) => ({
    name,
    path: `releases/${RELEASE_ID}/${filename}`,
    integrity: INTEGRITY,
    bytes: 100
  });
  return {
    schemaVersion: "dbr-static-release/v1",
    loaderVersion: 1,
    releaseId: RELEASE_ID,
    assets: {
      styles: asset("styles", "styles.css"),
      core: asset("core", "app.js"),
      highlights: asset("highlights", "highlights.js")
    },
    ...overrides
  };
}

function harness({fetchImpl, cachedManifest} = {}) {
  const storage = new Map();
  if (cachedManifest) storage.set("dbr-code-release-v1", JSON.stringify(cachedManifest));
  const appended = [];
  const phases = [];
  const failures = [];
  const context = {
    URL,
    Date,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); }
    },
    DBRBoot: {
      phase(value) { phases.push(value); },
      fail(value) { failures.push(value); }
    },
    fetch: fetchImpl || (async () => ({ok: true, type: "cors", json: async () => manifest()})),
    document: {
      createElement(tagName) {
        return {
          tagName,
          dataset: {},
          remove() {},
          set rel(value) { this._rel = value; },
          set href(value) { this._href = value; },
          set src(value) { this._src = value; },
          set integrity(value) { this._integrity = value; },
          set crossOrigin(value) { this._crossOrigin = value; },
          set referrerPolicy(value) { this._referrerPolicy = value; }
        };
      },
      getElementById() { return null; },
      head: {
        appendChild(node) {
          appended.push(node._href);
          queueMicrotask(() => node.onload());
        }
      },
      body: {
        appendChild(node) {
          appended.push(node._src);
          if (node._src.endsWith("/app.js")) context.DailyBibleReader = {init() {}};
          queueMicrotask(() => node.onload());
        }
      }
    }
  };
  context.globalThis = context;
  vm.runInNewContext(loaderSource(), context, {filename: "static-loader.js"});
  return {context, storage, appended, phases, failures};
}

test("static loader installs the exact-origin integrity release and remembers it", async () => {
  const result = harness();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(result.failures, []);
  assert.equal(result.context.DBRStaticRelease.releaseId, RELEASE_ID);
  assert.equal(result.context.DBRStaticRelease.source, "network");
  assert.deepEqual(result.appended, [
    `${ORIGIN}${ROOT_PATH}releases/${RELEASE_ID}/styles.css`,
    `${ORIGIN}${ROOT_PATH}releases/${RELEASE_ID}/app.js`,
    `${ORIGIN}${ROOT_PATH}releases/${RELEASE_ID}/highlights.js`
  ]);
  assert.equal(JSON.parse(result.storage.get("dbr-code-release-v1")).releaseId, RELEASE_ID);
});

test("static loader rejects a manifest asset outside the immutable release path", async () => {
  const hostile = manifest();
  hostile.assets.core.path = "https://evil.example/app.js";
  const result = harness({fetchImpl: async () => ({ok: true, type: "cors", json: async () => hostile})});
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(result.appended.length, 0);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /Private data remains closed/);
});

test("static loader uses the last validated immutable release after a manifest outage", async () => {
  const result = harness({
    cachedManifest: manifest(),
    fetchImpl: async () => { throw new Error("offline"); }
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(result.failures, []);
  assert.equal(result.context.DBRStaticRelease.source, "saved");
  assert.ok(result.appended.some((url) => url.endsWith("/app.js")));
});
