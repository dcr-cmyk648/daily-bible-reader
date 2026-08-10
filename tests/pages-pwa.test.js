const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PUBLIC_DEPLOYMENT_ID = ["AbCdEfGhIjKlMnOpQrSt", "UvWxYz_12345"].join("");
const CONFIG = {
  schemaVersion: "dbr-pages-public-config/v2",
  enabled: true,
  backendWebAppUrl: `https://script.google.com/macros/s/${PUBLIC_DEPLOYMENT_ID}/exec`,
  pwaReleaseId: "0123456789abcdef"
};

function source() {
  return fs.readFileSync(path.join(__dirname, "../app/pages-pwa/client.js"), "utf8")
    .replace("__DBR_PUBLIC_CONFIG__", JSON.stringify(CONFIG));
}

function fields(form) {
  return Object.fromEntries(form.children.map((input) => [input.name, input.value]));
}

function harness(onSubmit) {
  const listeners = new Map();
  const appended = [];
  let randomValue = 0;
  function node(tagName) {
    return {
      tagName: tagName.toUpperCase(),
      children: [],
      removed: false,
      appendChild(child) { this.children.push(child); return child; },
      setAttribute(name, value) { this[name] = String(value); },
      remove() { this.removed = true; },
      submit() { if (onSubmit) onSubmit(this, emit); }
    };
  }
  const document = {
    body: {
      appendChild(child) { appended.push(child); return child; }
    },
    createElement: node,
    getElementById() { return null; }
  };
  function emit(origin, data) {
    (listeners.get("message") || []).forEach((listener) => listener({origin, data}));
  }
  const context = {
    URL,
    Date,
    JSON,
    Promise,
    Set,
    Map,
    Proxy,
    Uint8Array,
    setTimeout,
    clearTimeout,
    location: {
      href: "https://reader.example.test/daily-bible-reader/web/pwa-canary/",
      origin: "https://reader.example.test",
      reload() {}
    },
    crypto: {
      getRandomValues(array) {
        for (let index = 0; index < array.length; index += 1) array[index] = (++randomValue) % 256;
        return array;
      }
    },
    addEventListener(type, listener) {
      const current = listeners.get(type) || [];
      current.push(listener);
      listeners.set(type, current);
    }
  };
  context.globalThis = context;
  vm.runInNewContext(source(), context, {filename: "pages-pwa-client.js"});
  context.document = document;
  return {api: context.DBRPagesPwa, context, appended, emit};
}

test("Pages PWA validates only the narrow public token-bridge configuration", () => {
  const {api} = harness();
  assert.equal(api.validateConfig(CONFIG).backendWebAppUrl, CONFIG.backendWebAppUrl);
  assert.throws(() => api.validateConfig({...CONFIG, enabled: false}), /not configured/);
  assert.throws(() => api.validateConfig({...CONFIG, backendWebAppUrl: "https://evil.example/exec"}), /not configured/);
  assert.throws(() => api.validateConfig({...CONFIG, backendWebAppUrl: `${CONFIG.backendWebAppUrl}?code=secret`}), /not configured/);
});

test("form bridge keeps the bearer code in a POST body and accepts only a nonce-bound Google response", async () => {
  let request;
  const {api} = harness((form, emit) => {
    request = form;
    const sent = fields(form);
    emit("https://evil.example", {
      channel: "dbr-rpc-response/v1",
      requestId: sent.request_id,
      responseNonce: sent.response_nonce,
      ok: true,
      result: {ok: true, data: {value: "evil"}}
    });
    emit("https://script.googleusercontent.com", {
      channel: "dbr-rpc-response/v1",
      requestId: sent.request_id,
      responseNonce: "0".repeat(48),
      ok: true,
      result: {ok: true, data: {value: "wrong nonce"}}
    });
    emit("https://script.googleusercontent.com", {
      channel: "dbr-rpc-response/v1",
      requestId: sent.request_id,
      responseNonce: sent.response_nonce,
      ok: true,
      result: {ok: true, data: {value: 7}}
    });
  });
  const readerCode = "private-reader-code-123456789";
  const response = await api.execute(CONFIG, "getBootstrapData", [readerCode]);
  const sent = fields(request);
  assert.equal(response.data.value, 7);
  assert.equal(request.method, "POST");
  assert.equal(request.action, CONFIG.backendWebAppUrl);
  assert.equal(request.action.includes(readerCode), false);
  assert.equal(sent.method, "getBootstrapData");
  assert.equal(sent.transport_version, "dbr-form-bridge/v1");
  assert.equal(sent.client_origin, "https://reader.example.test");
  assert.deepEqual(JSON.parse(sent.args_json), [readerCode]);
  assert.match(sent.request_id, /^rpc-[a-f0-9]{32}$/);
  assert.match(sent.response_nonce, /^[a-f0-9]{48}$/);
  assert.throws(() => api.execute(CONFIG, "arbitraryServerFunction", []), /not allowlisted/);
});

test("google.script.run compatibility runners isolate concurrent response handlers", async () => {
  const {api} = harness((form, emit) => {
    const sent = fields(form);
    const delay = sent.method === "getBootstrapData" ? 8 : 1;
    setTimeout(() => emit("https://n-example-app-script.googleusercontent.com", {
      channel: "dbr-rpc-response/v1",
      requestId: sent.request_id,
      responseNonce: sent.response_nonce,
      ok: true,
      result: sent.method
    }), delay);
  });
  const runner = api.createRunner(CONFIG, null, null);
  const values = [];
  await Promise.all([
    new Promise((resolve) => runner.withSuccessHandler((value) => { values.push(`a:${value}`); resolve(); }).getBootstrapData("a-long-reader-code")),
    new Promise((resolve) => runner.withSuccessHandler((value) => { values.push(`b:${value}`); resolve(); }).listComments("b-long-reader-code", "reading"))
  ]);
  assert.deepEqual(values.sort(), ["a:getBootstrapData", "b:listComments"]);
});

test("form bridge accepts the Apps Script sandbox host without trusting lookalikes", () => {
  const {api} = harness();
  assert.equal(api.allowedResponseOrigin("https://script.google.com"), true);
  assert.equal(api.allowedResponseOrigin("https://script.googleusercontent.com"), true);
  assert.equal(api.allowedResponseOrigin("https://n-7q3wu4vxxyue6hjyaynkgp73l4jlih4o3l3nony-0lu-script.googleusercontent.com"), true);
  assert.equal(api.allowedResponseOrigin("https://abc.script.googleusercontent.com"), false);
  assert.equal(api.allowedResponseOrigin("https://n-example-script.googleusercontent.com.evil.test"), false);
  assert.equal(api.allowedResponseOrigin("http://n-example-script.googleusercontent.com"), false);
});

test("form bridge propagates a bounded public transport error", async () => {
  const {api} = harness((form, emit) => {
    const sent = fields(form);
    emit("https://script.google.com", {
      channel: "dbr-rpc-response/v1",
      requestId: sent.request_id,
      responseNonce: sent.response_nonce,
      ok: false,
      error: {code: "RATE_LIMITED", message: "Too many requests; retry shortly."}
    });
  });
  await assert.rejects(api.execute(CONFIG, "confirmReaderAccess", ["reader-code-long-enough"]), (error) => {
    assert.equal(error.code, "RATE_LIMITED");
    assert.equal(error.message, "Too many requests; retry shortly.");
    return true;
  });
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

test("service worker caches only enumerated public shell assets and never private responses", () => {
  const worker = fs.readFileSync(path.join(__dirname, "../app/pages-pwa/service-worker.js"), "utf8");
  assert.match(worker, /ALLOWED_CACHE_URLS\.has\(request\.url\)/);
  assert.match(worker, /request\.url === CONFIG_URL\) return/);
  assert.match(worker, /request\.url === RELEASE_MANIFEST_URL/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /dated\.slice\(1\)/);
  assert.match(worker, /DBR_ACTIVATE_UPDATE/);
  assert.doesNotMatch(worker, /api\.esv\.org|script\.google\.com|script\.googleapis\.com/);
});

test("Pages PWA build keeps the canary isolated from the stable frontend release", () => {
  const build = fs.readFileSync(path.join(__dirname, "../scripts/build-pages-pwa.mjs"), "utf8");
  const publish = fs.readFileSync(path.join(__dirname, "../scripts/publish-pages-pwa.mjs"), "utf8");
  assert.match(build, /dist\/pages\/release\.json/);
  assert.match(build, /dist\/pages-pwa/);
  assert.match(publish, /web\/pwa-canary/);
  assert.doesNotMatch(publish, /\brm\s*\(/);
});

test("Pages startup timing stays in memory and records only named milestones", () => {
  const client = fs.readFileSync(path.join(__dirname, "../app/pages-pwa/client.js"), "utf8");
  const frontend = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  assert.match(client, /markStartupMilestone\("shellVisible"\)/);
  assert.match(client, /markStartupMilestone\("applicationCodeLoaded"\)/);
  assert.match(frontend, /markStartupMilestone\(options && options\.cached \? "cachedCalendarVisible" : "calendarVisible"\)/);
  assert.match(frontend, /markStartupMilestone\("authorizationConfirmed"\)/);
  assert.match(frontend, /markStartupMilestone\("freshDataSynchronized"\)/);
  assert.match(frontend, /markStartupMilestone\("scriptureVisible"\)/);
  assert.doesNotMatch(client, /localStorage.*DBRStartupMetrics|fetch\([^\n]*DBRStartupMetrics/);
});

test("token web-app build is separate from the production USER_ACCESSING manifest", () => {
  const production = JSON.parse(fs.readFileSync(path.join(__dirname, "../app/apps-script/appsscript.json"), "utf8"));
  const builder = fs.readFileSync(path.join(__dirname, "../scripts/build-apps-script-token-canary.mjs"), "utf8");
  const bridge = fs.readFileSync(path.join(__dirname, "../app/apps-script-token-canary/TokenBridge.gs"), "utf8");
  assert.deepEqual(production.webapp, {access: "ANYONE", executeAs: "USER_ACCESSING"});
  assert.equal(production.executionApi, undefined);
  assert.match(builder, /ANYONE_ANONYMOUS/);
  assert.match(builder, /USER_DEPLOYING/);
  assert.match(builder, /dist\/apps-script-token-canary/);
  assert.match(bridge, /DBR_TOKEN_BRIDGE_METHODS/);
  assert.match(bridge, /setXFrameOptionsMode\(HtmlService\.XFrameOptionsMode\.ALLOWALL\)/);
  assert.doesNotMatch(bridge, /Logger\.|console\.|Session\.getActiveUser/);
});
