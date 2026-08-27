const assert = require("node:assert/strict");
const {execFile} = require("node:child_process");
const {promisify} = require("node:util");
const path = require("node:path");
const test = require("node:test");

const run = promisify(execFile);

test("general content gate accepts the inactive v2 Psalm/Proverbs candidate", async () => {
  const {stdout, stderr} = await run(process.execPath, ["scripts/validate-content.mjs"], {
    cwd: path.join(__dirname, "..")
  });
  assert.equal(stderr, "");
  assert.match(stdout, /Content validation passed/);
});
