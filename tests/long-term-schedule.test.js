import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {candidateMetrics, buildLongTermCandidate, renderLongTermDailySchedule, validateLongTermCandidate} from "../scripts/lib/long-term-schedule.mjs";
import {ACTIVE_PLAN_VERSION, buildActiveCalendar, compactActiveCalendar, extendActivePrefix} from "../scripts/lib/active-calendar.mjs";
import {validateAgainstSchema} from "../scripts/lib/schema-validator.mjs";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "config", "long-term-plan", "four-stream-candidate-input.json");
const CANDIDATE_PATH = path.join(ROOT, "config", "long-term-plan", "four-stream-candidate.json");
const DAILY_SCHEDULE_PATH = path.join(ROOT, "docs", "reports", "long-term-four-stream-daily-schedule.md");
const PROVERB_CHAPTER_LENGTHS = [33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31];

async function load(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function contributions(entry) {
  return entry.streamContributions;
}

test("v2 long-term candidate is deterministic, inactive, and exactly matches its checked-in artifact", async () => {
  const [input, tracked] = await Promise.all([load(INPUT_PATH), load(CANDIDATE_PATH)]);
  const first = buildLongTermCandidate(input);
  const second = buildLongTermCandidate(input);
  assert.deepEqual(first.plan, second.plan);
  assert.deepEqual(first.plan, tracked);
  assert.equal(validateLongTermCandidate(first.plan, input), true);
  assert.equal(first.plan.entries.length, 1224);
  assert.equal(first.plan.entries[0].civilDate, "2026-09-16");
  assert.equal(first.plan.entries.at(-1).civilDate, "2030-01-21");
  assert.equal(first.plan.candidateMetadata.scheduleSha256, "79b9dfd88851fdf4e852490cae8ff9e9605af7c3a081309d96a94077a44d0be8");
  assert.equal(first.plan.candidateMetadata.reviewOnly, true);
  assert.equal(first.plan.candidateMetadata.sundayPolicy, "proportional_psalm_days_with_proverbs_pairing");
});

test("v2 daily review schedule is deterministic, inactive, and lists every daily slot", async () => {
  const [input, tracked] = await Promise.all([load(INPUT_PATH), readFile(DAILY_SCHEDULE_PATH, "utf8")]);
  const {plan} = buildLongTermCandidate(input);
  assert.equal(tracked, renderLongTermDailySchedule({plan}));
  assert.match(tracked, /\*\*Status:\*\* review only; inactive candidate\./);
  const rows = tracked.match(/^\| 20\d{2}-\d{2}-\d{2} \| \d+ \| [^|]+ \| [^|]+ \| (?:\d+|—) \|$/gm) || [];
  assert.equal(rows.length, 1224);
  assert.equal(rows[0], "| 2026-09-16 | 1 | Old Testament | Genesis overview | — |");
  assert.equal(rows.at(-1), "| 2030-01-21 | 1224 | Old Testament | Malachi 4 | 6 |");
  assert.match(tracked, /Psalms \+ Proverbs \| Psalms 2 \+ Proverbs 1:1–8 \| 20/);
});

test("v2 exposes complete logical streams and exact Psalm/Proverbs pairing constraints", async () => {
  const input = await load(INPUT_PATH);
  const {plan} = buildLongTermCandidate(input);
  const all = plan.entries.flatMap((entry) => contributions(entry).map((contribution) => ({entry, contribution})));
  const byStream = Object.fromEntries(["old_testament", "new_testament", "psalms", "proverbs"].map((streamId) => [streamId, all.filter((item) => item.contribution.streamId === streamId)]));
  assert.deepEqual(Object.fromEntries(Object.entries(byStream).map(([streamId, items]) => [streamId, items.length])), {old_testament: 785, new_testament: 287, psalms: 151, proverbs: 110});
  assert.ok(plan.entries.every((entry) => Array.isArray(entry.streamContributions) && entry.streamContributions.length >= 1));
  plan.entries.forEach((entry) => {
    const [primary, ...secondary] = contributions(entry);
    assert.deepEqual([entry.streamId, entry.streamSequence, entry.kind, entry.bookId, entry.chapter], [primary.streamId, primary.streamSequence, primary.kind, primary.bookId, primary.chapter]);
    assert.deepEqual(entry.passages || [], [primary, ...secondary].flatMap((contribution) => contribution.passages || []));
  });
  const psalmIntro = byStream.psalms.find((item) => item.contribution.kind === "book_intro");
  const proverbsIntro = byStream.proverbs.find((item) => item.contribution.kind === "book_intro");
  assert.equal(plan.entries[plan.entries.indexOf(psalmIntro.entry) + 1].chapter, 1);
  assert.ok(contributions(plan.entries[plan.entries.indexOf(proverbsIntro.entry) + 1]).some((item) => item.streamId === "proverbs" && item.chapter === 1 && item.passages[0].verseStart === 1));
  let expectedChapter = 1;
  let expectedVerse = 1;
  byStream.proverbs.filter((item) => item.contribution.kind === "chapter").forEach(({entry, contribution}) => {
    const range = contribution.passages[0];
    const psalm = contributions(entry).find((item) => item.streamId === "psalms");
    assert.ok(psalm.passages[0].verseCount < 20);
    assert.ok(psalm.passages[0].verseCount + range.verseCount <= 20);
    assert.equal(range.chapter, expectedChapter);
    assert.equal(range.verseStart, expectedVerse);
    if (range.verseEnd === PROVERB_CHAPTER_LENGTHS[expectedChapter - 1]) { expectedChapter += 1; expectedVerse = 1; } else expectedVerse = range.verseEnd + 1;
  });
  assert.deepEqual([expectedChapter, expectedVerse], [32, 1]);
  const metrics = candidateMetrics(plan, plan.candidateMetadata.nonSundayMinorExceptions);
  assert.equal(metrics.finishSpreadDays, 3);
  assert.equal(metrics.maximumRuns.new_testament, 2);
});

test("v2 validator rejects duplicate/gapped contributions, broken introduction adjacency, and overloaded pairings", async () => {
  const input = await load(INPUT_PATH);
  const {plan} = buildLongTermCandidate(input);
  const mutate = (change) => {
    const copy = structuredClone(plan);
    change(copy);
    assert.throws(() => validateLongTermCandidate(copy, input));
  };
  mutate((copy) => { copy.entries[2].readingId = copy.entries[1].readingId; });
  mutate((copy) => { copy.entries.splice(100, 1); });
  mutate((copy) => { copy.entries[1].chapter = 2; copy.entries[1].streamContributions[0].chapter = 2; });
  mutate((copy) => {
    const paired = copy.entries.find((entry) => entry.streamContributions.length === 2);
    paired.streamContributions[1].passages[0].verseCount += 1;
  });
  mutate((copy) => { copy.entries.find((entry) => entry.streamContributions.length === 2).streamContributions.pop(); });
  mutate((copy) => { copy.candidateMetadata.sundayOtherStreamExceptions.pop(); });
  mutate((copy) => { copy.candidateMetadata.sundayPolicy = "one_psalm_or_proverbs_unit"; });
  mutate((copy) => { copy.entries[2].streamId = "new_testament"; });
  mutate((copy) => { copy.entries.find((entry) => entry.streamContributions.length === 2).passages.reverse(); });
});

test("active calendar transforms the locked v2 candidate without mutating it", async () => {
  const [bridge, candidate] = await Promise.all([
    load(path.join(ROOT, "config", "bridge-schedules", "celebration-y3q4-bridge-full.json")), load(CANDIDATE_PATH)
  ]);
  const before = JSON.stringify(candidate);
  const {plan, activation} = buildActiveCalendar({bridge, candidate});
  assert.equal(JSON.stringify(candidate), before);
  assert.equal(plan.planVersion, ACTIVE_PLAN_VERSION);
  assert.equal(plan.entries.length, 1263);
  assert.equal(plan.entries[38].readingId, "CC-Y3Q4-D092");
  assert.equal(plan.entries[39].readingId, "LTP-0001-GEN-INTRO");
  assert.equal(plan.entries[39].dayIndex, 40);
  assert.equal(plan.bookMetrics.PSA.versification, bridge.bookMetrics.PSA.versification);
  assert.equal(plan.bookMetrics.GEN.versification, candidate.bookMetrics.GEN.versification);
  assert.equal(activation.activatedSourcePlanVersion, candidate.planVersion);
  assert.equal(activation.activatedSourceScheduleSha256, candidate.candidateMetadata.scheduleSha256);
  assert.equal(compactActiveCalendar(plan).entries[39].orderingRationale, undefined);
  const prefix = structuredClone(plan);
  prefix.entries = prefix.entries.slice(0, 39);
  const appConfig = {sharedStartDate: "2026-08-08"};
  const [planSchema, readingSchema] = await Promise.all([
    load(path.join(ROOT, "schemas", "plan.schema.json")), load(path.join(ROOT, "schemas", "reading.schema.json"))
  ]);
  assert.deepEqual(validateAgainstSchema(prefix, planSchema, {externalSchemas: {"reading.schema.json": readingSchema}}), []);
  prefix.entries.forEach((entry) => assert.deepEqual(validateAgainstSchema(entry, readingSchema), []));
  assert.ok(prefix.bookMetrics.GEN);

  const introPrefix = extendActivePrefix({privatePlan: prefix, activePlan: plan, appConfig, today: "2026-09-16", lookaheadDays: 7});
  assert.equal(introPrefix.entries.at(-1).readingId, "LTP-0001-GEN-INTRO");
  assert.ok(introPrefix.bookMetrics.GEN);
  const genesisPrefix = extendActivePrefix({privatePlan: introPrefix, activePlan: plan, appConfig, today: "2026-09-17", lookaheadDays: 7});
  assert.equal(genesisPrefix.entries.at(-1).readingId, "LTP-0002-GEN-001");
  assert.deepEqual(validateAgainstSchema(genesisPrefix, planSchema, {externalSchemas: {"reading.schema.json": readingSchema}}), []);
  genesisPrefix.entries.forEach((entry) => assert.deepEqual(validateAgainstSchema(entry, readingSchema), []));

  assert.throws(() => extendActivePrefix({privatePlan: prefix, activePlan: plan, appConfig, today: "bad", lookaheadDays: 7}), /YYYY/);
  assert.throws(() => extendActivePrefix({privatePlan: prefix, activePlan: plan, appConfig, today: "2026-09-31", lookaheadDays: 7}), /YYYY/);
  assert.throws(() => extendActivePrefix({privatePlan: prefix, activePlan: plan, appConfig, today: "2026-09-01", lookaheadDays: 7}), /horizon/);
  assert.throws(() => extendActivePrefix({privatePlan: prefix, activePlan: plan, appConfig, today: "2026-09-16", lookaheadDays: "7"}), /Lookahead/);
  assert.throws(() => extendActivePrefix({privatePlan: prefix, activePlan: plan, appConfig, today: "2026-09-16", lookaheadDays: 8}), /Lookahead/);
  const reordered = structuredClone(prefix); [reordered.entries[0], reordered.entries[1]] = [reordered.entries[1], reordered.entries[0]];
  assert.throws(() => extendActivePrefix({privatePlan: reordered, activePlan: plan, appConfig, today: "2026-09-16", lookaheadDays: 7}), /exactly/);
  const skipped = structuredClone(prefix); skipped.entries.splice(1, 1);
  assert.throws(() => extendActivePrefix({privatePlan: skipped, activePlan: plan, appConfig, today: "2026-09-16", lookaheadDays: 7}), /exactly/);
  const tampered = structuredClone(prefix); tampered.entries[0].bookId = "BAD";
  assert.throws(() => extendActivePrefix({privatePlan: tampered, activePlan: plan, appConfig, today: "2026-09-16", lookaheadDays: 7}), /exactly/);

  const malformedCli = spawnSync(process.execPath, ["scripts/extend-active-prefix.mjs", "--unknown"], {cwd: ROOT, encoding: "utf8"});
  assert.notEqual(malformedCli.status, 0);
  assert.match(malformedCli.stderr, /Usage/);
});
