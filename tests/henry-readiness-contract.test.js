const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const dailyPrompt = fs.readFileSync(path.join(root, "prompts/daily-study-scheduled-task.md"), "utf8");
const henryPrompt = fs.readFileSync(path.join(root, "prompts/henry-backfill-scheduled-task.md"), "utf8");
const runbook = fs.readFileSync(path.join(root, "docs/AUTOMATION_RUNBOOK.md"), "utf8");

test("historical Henry backfill has an independent prompt and both lanes report failures safely", () => {
  assert.doesNotMatch(dailyPrompt, /mhc:backfill:next/);
  assert.match(dailyPrompt, /Do not run `mhc:ensure`/);
  assert.equal((dailyPrompt.match(/mhc:ensure/g) || []).length, 1);
  assert.match(dailyPrompt, /Historical Henry fallback debt belongs only to the independent Henry-backfill task/);
  assert.match(dailyPrompt, /Henry generation is not a prerequisite in this daily lane/);
  assert.match(dailyPrompt, /henryLayerStatus=fallback/);
  assert.match(dailyPrompt, /currentHorizonHenryLayer\.status=debt/);
  assert.match(dailyPrompt, /Continue the independently researched orientation, synthesis, review, validation, and publication/);
  assert.match(dailyPrompt, /prior manifest remains live/);
  assert.match(dailyPrompt, /lane=daily_t_plus_7/);
  assert.match(henryPrompt, /npm run mhc:backfill:next/);
  assert.match(henryPrompt, /at most one manifest-backed verified fallback/);
  assert.match(henryPrompt, /lane=henry_backfill/);
  assert.match(henryPrompt, /prior manifest remains live/);
  assert.match(henryPrompt,/generated-candidate admission failure may run one exact `gpt-5\.6-luna`/);
  assert.match(henryPrompt,/controller\/bootstrap\/host-policy/);
  assert.match(runbook, /Henry backfill is an independent scheduled lane/);
  assert.match(runbook, /two failed model attempts retain the documented full-source-link fallback/);
  assert.match(runbook, /report Henry debt without changing daily-study readiness/);
});

test("prospective drafting guidance requires material named disagreements in the main synthesis", () => {
  const skill = fs.readFileSync(path.join(root, ".agents/skills/draft-daily-commentary/SKILL.md"), "utf8");
  assert.match(skill, /best-supported interpretive point directly/);
  assert.match(skill, /named positions materially change how the passage is read/);
  assert.match(skill, /Do not use vague recurring boilerplate such as “scholars debate”/);
});
