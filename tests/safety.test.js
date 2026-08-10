const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("staged safety scanner reserves enough output buffer for app icons", () => {
  const source = fs.readFileSync(path.join(__dirname, "../scripts/check-repository-safety.mjs"), "utf8");
  assert.match(source, /maxBuffer:\s*8 \* 1024 \* 1024/);
});

test("repository scanner flags secrets, ESV payloads, and raw-source fields", async () => {
  const safety = await import("../scripts/check-repository-safety.mjs");
  const literalSecret = ['const api', 'Key = "real-secret-value-123456";'].join("");
  const structuredEsv = ['{"translation":"', 'ESV","passage":"stored chapter"}'].join("");
  const knownEsvSignature = ["In the beginning", "God created the heavens and the earth"].join(", ");
  assert.ok(safety.inspectText("config/app.local.json", literalSecret).length > 0);
  assert.ok(safety.inspectText("fixtures/bad.json", structuredEsv).includes("structured ESV text payload"));
  assert.ok(safety.inspectText("fixtures/bad.json", '{"rawSourceText":"full commentary"}').includes("forbidden raw-source field"));
  assert.ok(safety.inspectText("app/data.json", JSON.stringify({text: knownEsvSignature})).includes("likely ESV passage wording"));
});

test("repository scanner permits conspicuous mock fixture and provider metadata", async () => {
  const safety = await import("../scripts/check-repository-safety.mjs");
  assert.deepEqual(safety.inspectText("fixtures/mock-scripture/test.json", '{"translation":"MOCK","isMock":true,"verses":["fabricated; no biblical wording"]}'), []);
  assert.deepEqual(safety.inspectText("config/provider.json", '{"translation":"ESV","policyVersion":"example","apiKeyMayReachClient":false}'), []);
});
