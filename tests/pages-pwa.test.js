const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PUBLIC_OAUTH_ID = ["123456789012-", "abcdefghijklmnop", ".apps.googleusercontent.com"].join("");
const PUBLIC_DEPLOYMENT_ID = ["AbCdEfGhIjKlMnOpQrSt", "UvWxYz_12345"].join("");
const CONFIG = {
  schemaVersion: "dbr-pages-public-config/v1",
  enabled: true,
  oauthClientId: PUBLIC_OAUTH_ID,
  apiDeploymentId: PUBLIC_DEPLOYMENT_ID,
  pwaReleaseId: "0123456789abcdef"
};
const TOKEN = "test-access-token-kept-in-memory-only";
const GRANTED_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/script.external_request",
  "https://www.googleapis.com/auth/userinfo.email"
].join(" ");

function source() {
  return fs.readFileSync(path.join(__dirname, "../app/pages-pwa/client.js"), "utf8")
    .replace("__DBR_PUBLIC_CONFIG__", JSON.stringify(CONFIG));
}

function harness(fetchImpl) {
  const storage = new Map();
  const context = {
    URL,
    Date,
    JSON,
    Promise,
    Set,
    Proxy,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    location: {
      href: "https://reader.example.test/daily-bible-reader/web/pwa-canary/",
      origin: "https://reader.example.test",
      reload() {}
    },
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    fetch: fetchImpl || (async () => ({
      ok: true,
      status: 200,
      json: async () => ({done: true, response: {result: {ok: true}}})
    }))
  };
  context.globalThis = context;
  vm.runInNewContext(source(), context, {filename: "pages-pwa-client.js"});
  return {api: context.DBRPagesPwa, context, storage};
}

test("Pages PWA validates only the narrow public Google configuration", () => {
  const {api} = harness();
  assert.equal(api.validateConfig(CONFIG).apiDeploymentId, CONFIG.apiDeploymentId);
  assert.throws(() => api.validateConfig({...CONFIG, enabled: false}), /not configured/);
  assert.throws(() => api.validateConfig({...CONFIG, oauthClientId: "not-a-client"}), /not configured/);
  assert.throws(() => api.validateConfig({...CONFIG, apiDeploymentId: "short"}), /not configured/);
});

test("Apps Script API adapter keeps its OAuth token in memory and forwards an allowlisted RPC", async () => {
  let request;
  const {api, storage} = harness(async (url, options) => {
    request = {url, options};
    return {ok: true, status: 200, json: async () => ({done: true, response: {result: {ok: true, data: {value: 7}}}})};
  });
  api.tokenCallback({access_token: TOKEN, expires_in: 3600, scope: GRANTED_SCOPES});
  const response = await api.execute(CONFIG, "getBootstrapData", ["reader-code"]);
  assert.equal(response.data.value, 7);
  assert.equal(request.url, `https://script.googleapis.com/v1/scripts/${CONFIG.apiDeploymentId}:run`);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(JSON.parse(request.options.body), {
    function: "getBootstrapData",
    parameters: ["reader-code"],
    devMode: false
  });
  assert.deepEqual(Array.from(storage.entries()), [["dbr-google-consent-v1", "yes"]]);
  assert.equal(JSON.stringify(Array.from(storage.entries())).includes(TOKEN), false);
  await assert.rejects(api.execute(CONFIG, "arbitraryServerFunction", []), /not allowlisted/);
});

test("google.script.run compatibility runners keep concurrent handlers isolated", async () => {
  const {api} = harness(async (_url, options) => {
    const body = JSON.parse(options.body);
    return {ok: true, status: 200, json: async () => ({done: true, response: {result: body.function}})};
  });
  api.tokenCallback({access_token: TOKEN, expires_in: 3600, scope: GRANTED_SCOPES});
  const runner = api.createRunner(CONFIG, null, null);
  const values = [];
  await Promise.all([
    new Promise((resolve) => runner.withSuccessHandler((value) => { values.push(`a:${value}`); resolve(); }).getBootstrapData("a")),
    new Promise((resolve) => runner.withSuccessHandler((value) => { values.push(`b:${value}`); resolve(); }).listComments("b", "reading"))
  ]);
  assert.deepEqual(values.sort(), ["a:getBootstrapData", "b:listComments"]);
});

test("Apps Script API adapter clears an expired token and fails closed on 401", async () => {
  const {api, storage} = harness(async () => ({
    ok: false,
    status: 401,
    json: async () => ({error: {message: "Invalid Credentials"}})
  }));
  api.tokenCallback({access_token: TOKEN, expires_in: 3600, scope: GRANTED_SCOPES});
  await assert.rejects(api.execute(CONFIG, "confirmReaderAccess", ["reader-code"]), /Invalid Credentials/);
  assert.equal(storage.get("dbr-google-consent-v1"), "yes");
  assert.equal(JSON.stringify(Array.from(storage.entries())).includes(TOKEN), false);
});

test("Pages release validation confines integrity-checked assets to one immutable release", () => {
  const {api} = harness();
  const asset = (name, filename) => ({
    name,
    path: `releases/0123456789abcdef/${filename}`,
    integrity: `sha384-${"A".repeat(64)}`,
    bytes: 100
  });
  const manifest = {
    schemaVersion: "dbr-static-release/v1",
    loaderVersion: 1,
    releaseId: "0123456789abcdef",
    assets: {
      styles: asset("styles", "styles.css"),
      core: asset("core", "app.js"),
      highlights: asset("highlights", "highlights.js")
    }
  };
  assert.equal(api.validateRelease(manifest).releaseId, manifest.releaseId);
  manifest.assets.core.path = "https://evil.example/app.js";
  assert.throws(() => api.validateRelease(manifest), /allowlist/);
});

test("service worker caches only enumerated public shell assets and retains one rollback cache", () => {
  const worker = fs.readFileSync(path.join(__dirname, "../app/pages-pwa/service-worker.js"), "utf8");
  assert.match(worker, /ALLOWED_CACHE_URLS\.has\(request\.url\)/);
  assert.match(worker, /request\.url === CONFIG_URL\) return/);
  assert.match(worker, /request\.url === RELEASE_MANIFEST_URL/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /dated\.slice\(1\)/);
  assert.match(worker, /DBR_ACTIVATE_UPDATE/);
  assert.doesNotMatch(worker, /api\.esv\.org|script\.googleapis\.com|oauth2\.googleapis\.com/);
});

test("Pages PWA build keeps the canary isolated from the stable frontend release", () => {
  const build = fs.readFileSync(path.join(__dirname, "../scripts/build-pages-pwa.mjs"), "utf8");
  const publish = fs.readFileSync(path.join(__dirname, "../scripts/publish-pages-pwa.mjs"), "utf8");
  assert.match(build, /dist\/pages\/release\.json/);
  assert.match(build, /dist\/pages-pwa/);
  assert.match(publish, /web\/pwa-canary/);
  assert.doesNotMatch(publish, /\brm\s*\(/);
});

test("API-executable build is separate from the production USER_ACCESSING manifest", () => {
  const production = JSON.parse(fs.readFileSync(path.join(__dirname, "../app/apps-script/appsscript.json"), "utf8"));
  const builder = fs.readFileSync(path.join(__dirname, "../scripts/build-apps-script-api-canary.mjs"), "utf8");
  assert.deepEqual(production.webapp, {access: "ANYONE", executeAs: "USER_ACCESSING"});
  assert.equal(production.executionApi, undefined);
  assert.match(builder, /delete manifest\.webapp/);
  assert.match(builder, /manifest\.executionApi = \{access: "ANYONE"\}/);
  assert.match(builder, /dist\/apps-script-api-canary/);
});
