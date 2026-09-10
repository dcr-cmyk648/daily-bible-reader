const assert = require("node:assert/strict");
const {execFile, spawnSync} = require("node:child_process");
const {promisify} = require("node:util");
const {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const run = promisify(execFile);

test("general content gate accepts the 41-entry active-calendar prefix without leaking Genesis metrics into the bridge build", async () => {
  const {stdout, stderr} = await run(process.execPath, ["scripts/validate-content.mjs"], {
    cwd: path.join(__dirname, "..")
  });
  assert.equal(stderr, "");
  assert.match(stdout, /Content validation passed \(\d+ schemas, 41 private-prefix readings, 39 scheduled bridge readings/);
});

test("general content gate rejects a drifted long-term entry in the rolling prefix", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dbr-validate-content-"));
  try {
    for (const directory of ["app", "config", "fixtures", "schemas", "scripts"]) {
      cpSync(path.join(__dirname, "..", directory), path.join(root, directory), {recursive: true});
    }
    cpSync(path.join(__dirname, "..", ".gitignore"), path.join(root, ".gitignore"));
    const planPath = path.join(root, "fixtures", "pilot-content", "plan.json");
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    plan.entries.at(-1).bookId = "EXO";
    writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
    const result = spawnSync(process.execPath, ["scripts/validate-content.mjs"], {cwd: root, encoding: "utf8"});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Tracked private plan must exactly match the immutable active-calendar prefix/);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});
