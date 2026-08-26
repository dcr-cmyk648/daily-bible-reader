import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {candidateMetrics, buildLongTermCandidate, renderLongTermDailySchedule, validateLongTermCandidate} from "../scripts/lib/long-term-schedule.mjs";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "config", "long-term-plan", "four-stream-candidate-input.json");
const CANDIDATE_PATH = path.join(ROOT, "config", "long-term-plan", "four-stream-candidate.json");
const DAILY_SCHEDULE_PATH = path.join(ROOT, "docs", "reports", "long-term-four-stream-daily-schedule.md");

async function load(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("long-term candidate is deterministic and exactly matches the checked-in review artifact", async () => {
  const [input, tracked] = await Promise.all([load(INPUT_PATH), load(CANDIDATE_PATH)]);
  const first = buildLongTermCandidate(input);
  const second = buildLongTermCandidate(input);
  assert.deepEqual(first.plan, second.plan);
  assert.deepEqual(first.plan, tracked);
  assert.equal(validateLongTermCandidate(first.plan, input), true);
  assert.equal(first.plan.entries.length, 1255);
  assert.equal(first.plan.entries[0].civilDate, "2026-09-16");
  assert.equal(first.plan.entries.at(-1).civilDate, "2030-02-21");
  assert.equal(first.plan.candidateMetadata.scheduleSha256, "d209d9067b677ffb161ae62c8f3d31b7c00c6d3b0772fe115eaf45abe289d057");
});

test("long-term daily review schedule is deterministic, inactive, and complete", async () => {
  const [input, tracked] = await Promise.all([load(INPUT_PATH), readFile(DAILY_SCHEDULE_PATH, "utf8")]);
  const {plan} = buildLongTermCandidate(input);
  assert.equal(tracked, renderLongTermDailySchedule({plan}));
  assert.match(tracked, /\*\*Status:\*\* review only; inactive candidate\./);
  const rows = tracked.match(/^\| 20\d{2}-\d{2}-\d{2} \| \d+ \| [^|]+ \| [^|]+ \|$/gm) || [];
  assert.equal(rows.length, 1255);
  assert.equal(rows[0], "| 2026-09-16 | 1 | Old Testament | Genesis overview |");
  assert.equal(rows.at(-1), "| 2030-02-21 | 1255 | Old Testament | Malachi 4 |");
});

test("long-term candidate preserves full canon coverage, Sunday policy, and book-introduction adjacency", async () => {
  const input = await load(INPUT_PATH);
  const {plan} = buildLongTermCandidate(input);
  const expectedBooks = Object.values(input.streams).flat();
  assert.equal(new Set(expectedBooks).size, 66);
  assert.equal(new Set(plan.entries.map((entry) => entry.readingId)).size, plan.entries.length);
  assert.deepEqual(plan.entries.slice(0, 2).map((entry) => [entry.kind, entry.bookId, entry.chapter || null]), [
    ["book_intro", "GEN", null], ["chapter", "GEN", 1]
  ]);
  plan.entries.forEach((entry, index) => {
    assert.equal(entry.dayIndex, index + 1);
    if (new Date(`${entry.civilDate}T00:00:00Z`).getUTCDay() === 0) assert.match(entry.streamId, /^(psalms|proverbs)$/);
  });
  expectedBooks.forEach((bookId) => {
    const entries = plan.entries.filter((entry) => entry.bookId === bookId);
    assert.equal(entries.filter((entry) => entry.kind === "book_intro").length, 1);
    const introIndex = plan.entries.findIndex((entry) => entry.bookId === bookId && entry.kind === "book_intro");
    assert.equal(plan.entries[introIndex + 1].bookId, bookId);
    assert.equal(plan.entries[introIndex + 1].chapter, 1);
  });
  const metrics = candidateMetrics(plan, plan.candidateMetadata.nonSundayMinorExceptions);
  assert.ok(metrics.finishSpreadDays <= 14, `finish spread ${metrics.finishSpreadDays} should remain within the review tolerance`);
  assert.equal(metrics.maximumRuns.new_testament, 2);
  metrics.consecutiveNtExceptions.forEach((run) => {
    assert.equal(run.length, 2);
    assert.equal(run.reason, "mandatory introduction-to-chapter-1 adjacency");
    const [intro, chapter] = plan.entries.slice(run.startDayIndex - 1, run.endDayIndex);
    assert.equal(intro.kind, "book_intro");
    assert.equal(chapter.kind, "chapter");
    assert.equal(intro.bookId, chapter.bookId);
    assert.equal(chapter.chapter, 1);
  });
  assert.deepEqual(plan.entries.filter((entry) => entry.bookId === "PRO" && entry.kind === "chapter").map((entry) => entry.passages[0].verseStart), Array(31).fill(1));
});

test("long-term validator rejects repetition, omission, date drift, broken adjacency, and undisclosed minor placement", async () => {
  const input = await load(INPUT_PATH);
  const {plan} = buildLongTermCandidate(input);
  const mutate = (change) => {
    const copy = structuredClone(plan);
    change(copy);
    assert.throws(() => validateLongTermCandidate(copy, input));
  };
  mutate((copy) => { copy.entries[2].readingId = copy.entries[1].readingId; });
  mutate((copy) => { copy.entries.splice(100, 1); });
  mutate((copy) => { copy.entries[20].civilDate = "2026-10-99"; });
  mutate((copy) => {
    const intro = copy.entries.find((entry) => entry.kind === "book_intro" && entry.bookId === "GEN");
    const index = copy.entries.indexOf(intro);
    copy.entries[index + 1].chapter = 2;
  });
  mutate((copy) => {
    const sunday = copy.entries.find((entry) => new Date(`${entry.civilDate}T00:00:00Z`).getUTCDay() === 0);
    sunday.streamId = "old_testament";
  });
  mutate((copy) => { copy.candidateMetadata.nonSundayMinorExceptions = []; });
  mutate((copy) => {
    const ntPair = copy.entries.findIndex((entry, index) => entry.streamId === "new_testament" && copy.entries[index + 1]?.streamId === "new_testament");
    copy.entries[ntPair + 2].streamId = "new_testament";
  });
});
