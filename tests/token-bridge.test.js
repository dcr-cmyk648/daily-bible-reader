const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const REQUEST_ID = `rpc-${"a".repeat(32)}`;
const RESPONSE_NONCE = "b".repeat(48);

function harness() {
  const cache = new Map();
  let calls = [];
  const context = {
    JSON,
    Date,
    Number,
    String,
    Array,
    Object,
    RegExp,
    CacheService: {
      getScriptCache() {
        return {
          get(key) { return cache.get(key) || null; },
          put(key, value) { cache.set(key, String(value)); }
        };
      }
    },
    HtmlService: {
      XFrameOptionsMode: {ALLOWALL: "ALLOWALL"},
      createHtmlOutput(html) {
        return {
          html,
          frameMode: "default",
          setXFrameOptionsMode(value) { this.frameMode = value; return this; }
        };
      }
    },
    dbrError_(code, message) {
      const error = new Error(message);
      error.code = code;
      return error;
    },
    dbrPublicError_(error) {
      return {code: error && error.code || "SERVER_UNAVAILABLE", message: error && error.message || "Unavailable"};
    }
  };
  [
    "getBootstrapData", "confirmReaderAccess", "getReadingPayload", "getReadingPayloads", "getScripture",
    "listComments", "listCommentActivity", "submitCommentEvent", "listHighlights", "submitHighlightEvent",
    "forgetReaderEnrollment"
  ].forEach((name) => {
    context[name] = (...args) => {
      calls.push({name, args});
      return {ok: true, data: {name, unsafe: "</script><img src=x>"}};
    };
  });
  context.globalThis = context;
  const source = fs.readFileSync(path.join(__dirname, "../app/apps-script-token-canary/TokenBridge.gs"), "utf8");
  vm.runInNewContext(source, context, {filename: "TokenBridge.gs"});
  return {context, calls, cache};
}

function request(overrides = {}) {
  return {
    parameter: {
      action: "dbr-rpc",
      transport_version: "dbr-form-bridge/v1",
      request_id: REQUEST_ID,
      response_nonce: RESPONSE_NONCE,
      method: "getBootstrapData",
      args_json: JSON.stringify(["private-reader-code"]),
      client_origin: "https://dcr-cmyk648.github.io",
      ...overrides
    }
  };
}

test("token bridge dispatches only an allowlisted, exact-arity RPC and confines its response", () => {
  const {context, calls} = harness();
  const output = context.doPost(request());
  assert.deepEqual(calls, [{name: "getBootstrapData", args: ["private-reader-code"]}]);
  assert.equal(output.frameMode, "ALLOWALL");
  assert.match(output.html, /window\.top\.postMessage/);
  assert.match(output.html, /https:\/\/dcr-cmyk648\.github\.io/);
  assert.match(output.html, /dbr-rpc-response\/v1/);
  assert.doesNotMatch(output.html, /<img|<\/script><img/);
  assert.ok(output.html.includes("\\u003c/script\\u003e\\u003cimg"));
});

test("token bridge gives an untrusted origin no postMessage response", () => {
  const {context, calls} = harness();
  const output = context.doPost(request({client_origin: "https://evil.example"}));
  assert.equal(calls.length, 0);
  assert.doesNotMatch(output.html, /postMessage|private-reader-code/);
});

test("token bridge rejects arbitrary methods, malformed payloads, and argument smuggling", () => {
  const {context, calls} = harness();
  const arbitrary = context.doPost(request({method: "dbrReadJsonFile_"}));
  const malformed = context.doPost(request({args_json: "not json"}));
  const extraArguments = context.doPost(request({args_json: JSON.stringify(["private-reader-code", "extra"])}));
  assert.equal(calls.length, 0);
  for (const output of [arbitrary, malformed, extraArguments]) {
    assert.match(output.html, /INVALID_TRANSPORT_REQUEST/);
    assert.doesNotMatch(output.html, /private-reader-code|dbrReadJsonFile_/);
  }
});
