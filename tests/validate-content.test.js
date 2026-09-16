const assert = require("node:assert/strict");
const {execFile, spawnSync} = require("node:child_process");
const {promisify} = require("node:util");
const {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const run = promisify(execFile);

test("general content gate accepts the current active-calendar prefix without leaking long-term metrics into the bridge build", async () => {
  const plan = JSON.parse(readFileSync(path.join(__dirname, "../fixtures/pilot-content/plan.json"), "utf8"));
  const {stdout, stderr} = await run(process.execPath, ["scripts/validate-content.mjs"], {
    cwd: path.join(__dirname, "..")
  });
  assert.equal(stderr, "");
  assert.match(stdout, new RegExp(`Content validation passed \\(\\d+ schemas, ${plan.entries.length} private-prefix readings, 39 scheduled bridge readings`));
});

test("content and historical protocol gates survive successive valid private-prefix extensions", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dbr-growing-prefix-"));
  try {
    for (const directory of ["app", "config", "fixtures", "schemas", "scripts", "tests"]) {
      cpSync(path.join(__dirname, "..", directory), path.join(root, directory), {recursive: true});
    }
    cpSync(path.join(__dirname, "..", ".gitignore"), path.join(root, ".gitignore"));
    const planPath = path.join(root, "fixtures/pilot-content/plan.json");
    const config = JSON.parse(readFileSync(path.join(root, "fixtures/pilot-content/app-config.json"), "utf8"));
    const active = JSON.parse(readFileSync(path.join(root, "config/active-calendar/celebration-bridge-long-term-active.json"), "utf8"));
    // The simulated extension date must also be the validator's clock. Otherwise
    // filling the real T+7 buffer makes this test's next extension look premature.
    const clockPath = path.join(root, "fabricated-validation-clock.cjs");
    function validateOn(civilDate) {
      const instant = `${civilDate}T16:00:00.000Z`; // Within this Detroit civil day across DST.
      writeFileSync(clockPath, `const ActualDate = Date;\nconst instant = ${JSON.stringify(instant)};\nglobalThis.Date = class extends ActualDate {\n  constructor(...args) { super(...(args.length ? args : [instant])); }\n  static now() { return ActualDate.parse(instant); }\n};\n`);
      return spawnSync(process.execPath, ["--require", clockPath, "scripts/validate-content.mjs"], {cwd: root, encoding: "utf8"});
    }
    for (let step = 0; step < 2; step += 1) {
      const before = JSON.parse(readFileSync(planPath, "utf8"));
      const next = active.entries[before.entries.length];
      const date = new Date(`${next.civilDate}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - config.futureLookaheadDays);
      const extended = spawnSync(process.execPath, ["scripts/extend-active-prefix.mjs", "--today", date.toISOString().slice(0, 10)], {cwd: root, encoding: "utf8"});
      assert.equal(extended.status, 0, extended.stderr);
      const validation = validateOn(date.toISOString().slice(0, 10));
      assert.equal(validation.status, 0, validation.stderr);
      assert.match(validation.stdout, new RegExp(`${before.entries.length + 1} private-prefix readings, 39 scheduled bridge readings`));
      const tooEarly = new Date(date);
      tooEarly.setUTCDate(tooEarly.getUTCDate() - 1);
      const rejected = validateOn(tooEarly.toISOString().slice(0, 10));
      assert.equal(rejected.status, 1);
      assert.match(rejected.stderr, /Tracked private prefix may not exceed the current Detroit T\+7 horizon/);
      const protocol = spawnSync(process.execPath, ["--test", "tests/protocol-refresh-backfill.test.js"], {cwd: root, encoding: "utf8"});
      assert.equal(protocol.status, 0, protocol.stdout + protocol.stderr);
    }
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
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
