const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../app/shared/server-core.js");

for (const [chapter, verseCount] of [[2, 23], [22, 46], [26, 75]]) {
test(`Matthew ${chapter}'s scheduled complete chapter accepts its final verse and complete provider range`, () => {
  const active = JSON.parse(fs.readFileSync(path.join(__dirname, "../config/active-calendar/celebration-bridge-long-term-active.json"), "utf8"));
  const reading = active.entries.find((entry) => entry.bookId === "MAT" && entry.chapter === chapter);
  if (chapter === 2) assert.equal(reading.civilDate, "2026-09-28");
  assert.equal(reading.passages[0].verseCount, verseCount);
  assert.equal(reading.streamContributions[0].passages[0].verseCount, verseCount);
  assert.equal(core.passageContainsVerse(reading.passages[0], verseCount), true);
  assert.equal(core.passageContainsVerse(reading.passages[0], verseCount + 1), false);
  const chapterKey = 40000000 + chapter * 1000;
  const fabricated = {
    canonical: "FABRICATED Matthew provider-range fixture",
    passages: ["FABRICATED SCRIPTURE PLACEHOLDER. No biblical text."],
    parsed: [[chapterKey + 1, chapterKey + verseCount]]
  };
  assert.equal(core.validateEsvPayload(fabricated, {
    verseCount: reading.passages[0].verseCount, startVerse: 1, endVerse: reading.passages[0].verseCount
  }).verseCount, verseCount);
  assert.throws(() => core.validateEsvPayload({...fabricated, parsed: [[chapterKey + 1, chapterKey + verseCount - 1]]}, {
    verseCount: reading.passages[0].verseCount, startVerse: 1, endVerse: reading.passages[0].verseCount
  }), {code: "ESV_RANGE_MISMATCH"});
});
}
