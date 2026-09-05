const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const prompt = fs.readFileSync(path.join(root, "prompts/daily-study-scheduled-task.md"), "utf8");
const runbook = fs.readFileSync(path.join(root, "docs/AUTOMATION_RUNBOOK.md"), "utf8");

test("the post-horizon contract attempts one Henry fallback repair before optional protocol refresh", () => {
  const promptHenry = prompt.indexOf("11. Only after the complete current-through-T+7 horizon");
  const promptProtocol = prompt.indexOf("12. After that one Henry inspection or attempt");
  assert.ok(promptHenry >= 0 && promptProtocol > promptHenry);
  assert.match(prompt.slice(promptHenry, promptProtocol), /npm run mhc:backfill:next/);
  assert.match(prompt.slice(promptHenry, promptProtocol), /at most one selected Henry-only backfill before any protocol refresh/);
  assert.match(prompt.slice(promptProtocol), /whether it is `none`, succeeds, or safely retains a fallback/);
  assert.match(runbook, /Henry backfill is lower priority than the end-to-end T\+7 lane, precedes the optional protocol refresh/);
  assert.match(runbook, /two failed model attempts retain the documented full-source-link fallback/);
  assert.match(runbook, /report Henry debt without changing daily-study readiness/);
});

test("prospective drafting guidance requires material named disagreements in the main synthesis", () => {
  const skill = fs.readFileSync(path.join(root, ".agents/skills/draft-daily-commentary/SKILL.md"), "utf8");
  assert.match(skill, /best-supported interpretive point directly/);
  assert.match(skill, /named positions materially change how the passage is read/);
  assert.match(skill, /Do not use vague recurring boilerplate such as “scholars debate”/);
});
