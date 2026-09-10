import assert from "node:assert/strict";
import test from "node:test";
import {entryIsEndToEndPrepared, expectedVerseCommentaryShardCount, selectedVerseMatchesEntry, verseMetadataMatchesEntry} from "../scripts/validate-private-content.mjs";

const genesisIntroduction = {
  readingId: "LTP-0001-GEN-INTRO",
  kind: "book_intro",
  bookId: "GEN",
  representativeVerse: {bookId: "GEN", chapter: 1, verse: 1}
};

test("private validation recognizes active-calendar book introductions without chapter passages", () => {
  assert.equal(entryIsEndToEndPrepared(genesisIntroduction), true);
  assert.equal(expectedVerseCommentaryShardCount(genesisIntroduction), 0);
  assert.equal(selectedVerseMatchesEntry(genesisIntroduction, {bookId: "GEN", chapter: 1, verse: 1}), true);
  assert.equal(selectedVerseMatchesEntry(genesisIntroduction, {bookId: "GEN", chapter: 1, verse: 2}), false);
  assert.equal(selectedVerseMatchesEntry(genesisIntroduction, {bookId: "EXO", chapter: 1, verse: 1}), false);
  assert.equal(verseMetadataMatchesEntry(genesisIntroduction, {}), true);
  assert.equal(verseMetadataMatchesEntry(genesisIntroduction, {verseOfTheDay: {bookId: "GEN", chapter: 1, verse: 1}}), false);
});

test("private validation treats long-term chapters without source-plan days as prepared", () => {
  assert.equal(entryIsEndToEndPrepared({readingId: "CC-Y3Q4-D056", sourcePlanDay: 56, kind: "chapter"}), false);
  assert.equal(entryIsEndToEndPrepared({readingId: "CC-Y3Q4-D057", sourcePlanDay: 57, kind: "chapter"}), true);
  assert.equal(entryIsEndToEndPrepared({
    readingId: "LTP-0002-GEN-001", dayIndex: 41, kind: "chapter",
    passages: [{bookId: "GEN", chapter: 1, verseCount: 31}]
  }), true);
});

test("private validation retains chapter shard and selected-verse rules", () => {
  const chapter = {
    readingId: "TST-CHAPTER",
    kind: "chapter",
    passages: [
      {bookId: "TST", chapter: 1, verseCount: 3},
      {bookId: "TST", chapter: 2, verseCount: 2}
    ]
  };
  assert.equal(expectedVerseCommentaryShardCount(chapter), 2);
  assert.equal(selectedVerseMatchesEntry(chapter, {bookId: "TST", chapter: 2, verse: 2}), true);
  assert.equal(selectedVerseMatchesEntry(chapter, {bookId: "TST", chapter: 2, verse: 3}), false);
});
