import {createHash} from "node:crypto";

const CANON = `
GEN|Genesis|31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26
EXO|Exodus|22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38
LEV|Leviticus|17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34
NUM|Numbers|54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13
DEU|Deuteronomy|46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12
JOS|Joshua|18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33
JDG|Judges|36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25
RUT|Ruth|22,23,18,22
1SA|1 Samuel|28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,43,15,23,29,22,44,25,12,25,11,31,13
2SA|2 Samuel|27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25
1KI|1 Kings|53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,54
2KI|2 Kings|18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30
1CH|1 Chronicles|54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30
2CH|2 Chronicles|17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23
EZR|Ezra|11,70,13,24,17,22,28,36,15,44
NEH|Nehemiah|11,20,32,23,19,19,73,18,38,39,36,47,31
EST|Esther|22,23,15,17,14,14,10,17,32,3
JOB|Job|22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17
PSA|Psalms|6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6
PRO|Proverbs|33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31
ECC|Ecclesiastes|18,26,22,16,20,12,29,17,18,20,10,14
SNG|Song of Solomon|17,17,11,16,16,13,13,14
ISA|Isaiah|31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24
JER|Jeremiah|19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34
LAM|Lamentations|22,22,66,22,22
EZK|Ezekiel|28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35
DAN|Daniel|21,49,30,37,31,28,28,27,27,21,45,13
HOS|Hosea|11,23,5,19,15,11,16,14,17,15,12,14,16,9
JOL|Joel|20,32,21
AMO|Amos|15,16,15,13,27,14,17,14,15
OBA|Obadiah|21
JON|Jonah|17,10,10,11
MIC|Micah|16,13,12,13,15,16,20
NAM|Nahum|15,13,19
HAB|Habakkuk|17,20,19
ZEP|Zephaniah|18,15,20
HAG|Haggai|15,23
ZEC|Zechariah|21,13,10,14,11,15,14,23,17,12,17,14,9,21
MAL|Malachi|14,17,18,6
MAT|Matthew|25,22,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,45,39,51,46,74,66,20
MRK|Mark|45,28,35,40,43,56,36,37,50,52,33,44,37,72,47,20
LUK|Luke|80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53
JHN|John|51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25
ACT|Acts|26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31
ROM|Romans|32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27
1CO|1 Corinthians|31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24
2CO|2 Corinthians|24,17,18,18,21,18,16,24,15,18,33,21,14
GAL|Galatians|24,21,29,31,26,18
EPH|Ephesians|23,22,21,32,33,24
PHP|Philippians|30,30,21,23
COL|Colossians|29,23,25,18
1TH|1 Thessalonians|10,20,13,18,28
2TH|2 Thessalonians|12,17,18
1TI|1 Timothy|20,15,16,16,25,21
2TI|2 Timothy|18,26,17,22
TIT|Titus|16,15,15
PHM|Philemon|25
HEB|Hebrews|14,18,19,16,14,20,28,13,28,39,40,29,25
JAS|James|27,26,18,17,20
1PE|1 Peter|25,25,22,19,14
2PE|2 Peter|21,22,18
1JN|1 John|10,29,24,21,21
2JN|2 John|13
3JN|3 John|15
JUD|Jude|25
REV|Revelation|20,29,22,11,14,17,17,13,21,11,19,18,18,20,8,21,18,24,21,15,27,21
`;

const BOOKS = new Map(CANON.trim().split("\n").map((line) => {
  const [bookId, title, counts] = line.split("|");
  const chapterVerseCounts = counts.split(",").map(Number);
  return [bookId, {bookId, title, chapterVerseCounts, verseCount: chapterVerseCounts.reduce((sum, value) => sum + value, 0)}];
}));

const REPRESENTATIVE_VERSES = {
  GEN:[1,1], EXO:[20,3], LEV:[19,2], NUM:[6,24], DEU:[6,4], JOS:[24,15], JDG:[21,25], RUT:[1,16], "1SA":[16,7], "2SA":[7,16], "1KI":[18,21], "2KI":[17,13], "1CH":[16,34], "2CH":[7,14], EZR:[7,10], NEH:[8,10], EST:[4,14], JOB:[19,25], PSA:[23,1], PRO:[3,5], ECC:[12,13], SNG:[2,16], ISA:[9,6], JER:[29,11], LAM:[3,22], EZK:[36,26], DAN:[7,14], HOS:[6,6], JOL:[2,13], AMO:[5,24], OBA:[1,15], JON:[2,9], MIC:[6,8], NAM:[1,7], HAB:[2,4], ZEP:[3,17], HAG:[2,9], ZEC:[4,6], MAL:[3,10], MAT:[28,19], MRK:[10,45], LUK:[19,10], JHN:[3,16], ACT:[1,8], ROM:[8,28], "1CO":[13,13], "2CO":[5,17], GAL:[2,20], EPH:[2,8], PHP:[4,13], COL:[3,17], "1TH":[5,16], "2TH":[3,3], "1TI":[6,12], "2TI":[3,16], TIT:[3,5], PHM:[1,6], HEB:[12,2], JAS:[1,5], "1PE":[5,7], "2PE":[1,3], "1JN":[1,9], "2JN":[1,6], "3JN":[1,4], JUD:[1,3], REV:[21,4]
};

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SOURCE_IDS = {
  old_testament: ["bible_api_web_structure_2026_08_26", "tgc_old_testament_order_2026_08_26", "tgc_historical_books_2026_08_26"],
  new_testament: ["bible_api_web_structure_2026_08_26", "tgc_new_testament_order_2026_08_26"],
  psalms: ["bible_api_web_structure_2026_08_26", "tgc_old_testament_order_2026_08_26"],
  proverbs: ["bible_api_web_structure_2026_08_26", "tgc_old_testament_order_2026_08_26"]
};
const MAX_FINISH_SPREAD_DAYS = 14;
const BOOK_PLACEMENTS = {
  GEN: ["event", "high", "Genesis opens the plan because its creation, fall, flood, and patriarchal narrative supplies the canonical and historical frame for the remaining Bible."],
  JOB: ["pragmatic", "low", "Job is placed after Genesis as an early patriarchal-era possibility, while its setting and composition remain too disputed for a firmer claim."],
  EXO: ["event", "medium", "Exodus resumes the Pentateuch's narrated sequence after the patriarchal setting provisionally associated with Job."], LEV: ["event", "high", "Leviticus continues Sinai legislation without separating it from Exodus."], NUM: ["event", "high", "Numbers continues Israel's wilderness journey after Sinai."], DEU: ["event", "high", "Deuteronomy concludes Moses' wilderness addresses immediately before entry into Canaan."],
  JOS: ["event", "high", "Joshua follows Deuteronomy's entry-and-conquest setting."], JDG: ["event", "high", "Judges follows the settlement era narrated in Joshua."], RUT: ["event", "medium", "Ruth is located in the judges period named by its opening setting."], "1SA": ["event", "high", "1 Samuel moves from the judges era into Samuel, Saul, and David."], "2SA": ["event", "high", "2 Samuel continues David's reign from 1 Samuel."],
  SNG: ["pragmatic", "low", "Song of Solomon is provisionally placed near the united monarchy by its Solomonic association; dating and authorship remain disputed."], ECC: ["pragmatic", "low", "Ecclesiastes follows Song as another wisdom book traditionally associated with Solomon, without claiming a settled composition date."], "1KI": ["event", "high", "1 Kings resumes the united monarchy and then the divided kingdom after David."], "2KI": ["event", "high", "2 Kings continues the divided kingdoms through the exile."], "1CH": ["composition", "medium", "1 Chronicles retells the monarchy after Kings; its placement preserves the historical sequence while acknowledging its later shaping."], "2CH": ["composition", "medium", "2 Chronicles continues the Chronicler's retelling through exile and the Cyrus decree."],
  JON: ["event", "medium", "Jonah is placed early among the prophets because its named Nineveh mission is commonly associated with the eighth-century Assyrian period."], AMO: ["event", "medium", "Amos follows in the eighth-century northern-kingdom setting specified in its superscription."], HOS: ["event", "medium", "Hosea remains with the late northern-kingdom crisis reflected in its royal notices."], ISA: ["event", "medium", "Isaiah is placed with Judah's eighth-century kings, while later portions and compositional questions remain acknowledged rather than settled."], MIC: ["event", "medium", "Micah is paired with the same eighth-century Judah setting named in its opening."], NAM: ["event", "medium", "Nahum is placed after the fall of Thebes and before Nineveh's fall, the historical interval normally inferred from the book's own allusion."], ZEP: ["event", "medium", "Zephaniah is placed in Josiah's reign before the Babylonian crisis."], HAB: ["event", "medium", "Habakkuk is provisionally located as Babylon rises against Judah, a setting inferred from its announced Chaldean threat."], JER: ["event", "high", "Jeremiah follows through Judah's final decades and Jerusalem's fall."], LAM: ["event", "high", "Lamentations follows Jerusalem's destruction because its poems mourn that catastrophe."], EZK: ["event", "high", "Ezekiel continues the exilic setting from the Babylonian deportation."],
  DAN: ["pragmatic", "low", "Daniel is kept in the exile-to-Persia sequence of its narrative setting while authorship and final-form dating remain disputed."], OBA: ["pragmatic", "low", "Obadiah is provisionally placed after Jerusalem's fall because its Edom oracle is often read in that setting, though its date is debated."], JOL: ["pragmatic", "low", "Joel remains a deliberately provisional late placement because internal dating evidence is disputed."], HAG: ["event", "high", "Haggai is placed in the early Persian restoration by its dated oracles."], ZEC: ["event", "high", "Zechariah follows Haggai in the early restoration era indicated by its dated visions and temple context."], EZR: ["event", "medium", "Ezra follows the restoration prophets as a narrative of return, temple rebuilding, and reform."], EST: ["event", "medium", "Esther is placed in the Persian-diaspora period between the return narratives without treating its precise chronology as settled."], NEH: ["event", "medium", "Nehemiah follows Ezra as the later Persian-period rebuilding and reform account."], MAL: ["event", "medium", "Malachi closes the OT stream as a post-exilic prophetic voice, though its precise date remains approximate."],
  MAT: ["event", "high", "Matthew begins the NT stream with Jesus' life and commission."], MRK: ["event", "high", "Mark remains alongside the Gospel narratives before the church's expansion in Acts."], LUK: ["event", "high", "Luke precedes Acts because the two-volume narrative explicitly continues from Jesus' ministry to the church."], JHN: ["event", "high", "John remains with the Gospel witness to Jesus before Acts."], ACT: ["event", "high", "Acts completes the narrative bridge from the risen Christ's commission to the apostolic mission."],
  JAS: ["composition", "medium", "James leads the letters as a traditional early-Jewish-Christian correspondence placement; exact dating remains debated."], GAL: ["composition", "medium", "Galatians follows as an early Pauline letter in this pragmatic composition-aware sequence."], "1TH": ["composition", "medium", "1 Thessalonians is placed among the earliest widely dated Pauline letters."], "2TH": ["composition", "medium", "2 Thessalonians follows its paired Thessalonian correspondence, while relative dating remains debated."], "1CO": ["composition", "medium", "1 Corinthians begins the Corinthian correspondence in the middle Pauline mission period."], "2CO": ["composition", "medium", "2 Corinthians follows its linked Corinthian correspondence."], ROM: ["composition", "medium", "Romans follows the Corinthian letters as a mature Pauline letter commonly connected with the end of that mission phase."], COL: ["composition", "medium", "Colossians begins the prison-letter grouping in this traditional composition-aware proposal."], PHM: ["composition", "medium", "Philemon remains adjacent to Colossians because both are traditionally associated with the same imprisonment and personnel."], EPH: ["composition", "medium", "Ephesians follows within the traditional prison-letter grouping; authorship and date are marked as debated rather than resolved."], PHP: ["composition", "medium", "Philippians completes this provisional prison-letter grouping."], "1TI": ["composition", "medium", "1 Timothy begins the Pastoral sequence in its traditional post-mission placement."], TIT: ["composition", "medium", "Titus remains with the Pastorals as a closely related church-order letter."], "2TI": ["composition", "medium", "2 Timothy follows as the traditional final Pauline testament; exact reconstruction remains debated."], HEB: ["composition", "medium", "Hebrews follows the Pauline/Pastoral group as an early Christian homily-letter whose authorship is unresolved."], "1PE": ["composition", "medium", "1 Peter leads the Petrine letters in their traditional apostolic association."], "2PE": ["composition", "medium", "2 Peter follows 1 Peter as the paired Petrine witness while date and authorship remain disputed."], JUD: ["composition", "medium", "Jude precedes the Johannine letters because of its traditional early-Christian placement and literary relation to 2 Peter."], "1JN": ["composition", "medium", "1 John begins the Johannine letters before its shorter companion letters."], "2JN": ["composition", "medium", "2 John follows 1 John within the Johannine corpus."], "3JN": ["composition", "medium", "3 John follows the other Johannine letters."], REV: ["composition", "medium", "Revelation closes the NT stream as the final canonical apocalypse; its precise date is debated."],
  PSA: ["traditional", "medium", "Psalms retain canonical order unless a later review adopts a well-supported historical placement."], PRO: ["traditional", "medium", "Proverbs retain canonical chapter order as coherent bounded units."]
};

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dayOfWeek(date) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function bookChronology(streamId, bookId) {
  const placement = BOOK_PLACEMENTS[bookId];
  if (!placement) throw new Error(`No placement rationale is defined for ${bookId}.`);
  return {chronologyBasis: placement[0], confidence: placement[1]};
}

function rationale(streamId, bookId, index) {
  return BOOK_PLACEMENTS[bookId][2];
}

function buildUnits(input, streamId) {
  const units = [];
  input.streams[streamId].forEach((bookId, bookIndex) => {
    const book = BOOKS.get(bookId);
    if (!book) throw new Error(`No canonical metrics are available for ${bookId}.`);
    const chronology = bookChronology(streamId, bookId);
    const [chapter, verse] = REPRESENTATIVE_VERSES[bookId];
    units.push({kind: "book_intro", bookId, representativeVerse: {bookId, chapter, verse}, chronology, bookIndex,
      unitLabel: `${book.title} overview`, orderingRationale: rationale(streamId, bookId, bookIndex),
      notes: "Review-only book introduction; page 2 is the portable overview and page 3 centers the book's historical, canonical, and contextual fit."});
    book.chapterVerseCounts.forEach((verseCount, chapterIndex) => {
      const chapterNumber = chapterIndex + 1;
      const passage = streamId === "proverbs"
        ? {bookId, chapter: chapterNumber, verseStart: 1, verseEnd: verseCount, verseCount}
        : {bookId, chapter: chapterNumber, verseCount};
      units.push({kind: "chapter", bookId, chapter: chapterNumber, passages: [passage], chronology, bookIndex,
        unitLabel: `${book.title} ${chapterNumber}`, orderingRationale: rationale(streamId, bookId, bookIndex),
        notes: streamId === "proverbs" ? "Canonical chapter retained as one coherent bounded Proverbs range." : "One complete canonical chapter."});
    });
  });
  return units;
}

function chooseMinor(cursors, units, slotOrdinal, proverbsSlotOrdinals) {
  const streamId = proverbsSlotOrdinals.has(slotOrdinal) ? "proverbs" : "psalms";
  if (cursors[streamId] >= units[streamId].length) throw new Error(`Minor-stream pacing exhausted ${streamId} at slot ${slotOrdinal}.`);
  return streamId;
}

function availableMajorStreams(cursors, units, previousStream) {
  let candidates = ["old_testament", "new_testament"].filter((streamId) => cursors[streamId] < units[streamId].length);
  if (previousStream === "new_testament") {
    const nonNt = candidates.filter((streamId) => streamId !== "new_testament");
    if (nonNt.length) candidates = nonNt;
  }
  return candidates;
}

function chooseMajor(cursors, units, previousStream, nextDayHasMinor, tomorrowSaturday, permittedStreams = null) {
  let candidates = availableMajorStreams(cursors, units, previousStream);
  if (permittedStreams) candidates = candidates.filter((streamId) => permittedStreams.includes(streamId));
  if (!candidates.length) return null;
  const safe = candidates.filter((streamId) => !(nextDayHasMinor && units[streamId][cursors[streamId]]?.kind === "book_intro"));
  if (safe.length) candidates = safe;
  if (tomorrowSaturday && !nextDayHasMinor) {
    let introductions = candidates.filter((streamId) => units[streamId][cursors[streamId]]?.kind === "book_intro");
    if (introductions.length) candidates = introductions;
  }
  return candidates.sort((left, right) => (cursors[left] / units[left].length) - (cursors[right] / units[right].length) || left.localeCompare(right))[0];
}

function majorWouldConflictNextMinor(cursors, units, previousStream) {
  const candidates = availableMajorStreams(cursors, units, previousStream);
  return candidates.length > 0 && candidates.every((streamId) => units[streamId][cursors[streamId]]?.kind === "book_intro");
}

function canReachMinorSlot(cursors, units, previousStream, selectedStream, majorSlotsAfterSelection) {
  const selectedUnit = units[selectedStream][cursors[selectedStream]];
  if (!selectedUnit) return false;
  const nextCursors = {...cursors, [selectedStream]: cursors[selectedStream] + 1};
  const nextForcedStream = selectedUnit.kind === "book_intro" ? selectedStream : null;
  function walk(stateCursors, statePrevious, forcedStream, remainingSlots) {
    if (remainingSlots === 0) return forcedStream === null;
    if (forcedStream) {
      const unit = units[forcedStream][stateCursors[forcedStream]];
      if (!unit) return false;
      const updated = {...stateCursors, [forcedStream]: stateCursors[forcedStream] + 1};
      return walk(updated, forcedStream, unit.kind === "book_intro" ? forcedStream : null, remainingSlots - 1);
    }
    for (const streamId of availableMajorStreams(stateCursors, units, statePrevious)) {
      const unit = units[streamId][stateCursors[streamId]];
      if (!unit || (remainingSlots === 1 && unit.kind === "book_intro")) continue;
      const updated = {...stateCursors, [streamId]: stateCursors[streamId] + 1};
      if (walk(updated, streamId, unit.kind === "book_intro" ? streamId : null, remainingSlots - 1)) return true;
    }
    return false;
  }
  return walk(nextCursors, selectedStream, nextForcedStream, majorSlotsAfterSelection);
}

function entryFromUnit({input, unit, streamId, streamSequence, dayIndex, date}) {
  const book = BOOKS.get(unit.bookId);
  return {
    planVersion: input.planVersion,
    dayIndex,
    civilDate: date,
    readingId: `LTP-${String(dayIndex).padStart(4, "0")}-${unit.bookId}-${unit.kind === "book_intro" ? "INTRO" : String(unit.chapter).padStart(3, "0")}`,
    kind: unit.kind,
    bookId: unit.bookId,
    streamId,
    streamSequence,
    unitLabel: unit.unitLabel,
    ...(unit.kind === "book_intro" ? {representativeVerse: unit.representativeVerse} : {chapter: unit.chapter, passages: unit.passages}),
    orderingRationale: unit.orderingRationale,
    chronologyBasis: unit.chronology.chronologyBasis,
    confidence: unit.chronology.confidence,
    notes: unit.notes,
    sourceIds: SOURCE_IDS[streamId],
    ...(unit.kind === "chapter" && unit.chapter === 1 ? {contextReadingIds: [`LTP-${String(dayIndex - 1).padStart(4, "0")}-${unit.bookId}-INTRO`]} : {})
  };
}

export function buildLongTermCandidate(input) {
  const units = Object.fromEntries(["old_testament", "new_testament", "psalms", "proverbs"].map((streamId) => [streamId, buildUnits(input, streamId)]));
  const cursors = Object.fromEntries(Object.keys(units).map((streamId) => [streamId, 0]));
  const streamSequences = Object.fromEntries(Object.keys(units).map((streamId) => [streamId, 0]));
  const totalDays = Object.values(units).reduce((sum, list) => sum + list.length, 0);
  const minorTotal = units.psalms.length + units.proverbs.length;
  const sundays = Array.from({length: totalDays}, (_, index) => index + 1)
    .filter((dayIndex) => dayOfWeek(addDays(input.startDate, dayIndex - 1)) === 0);
  const minorSlots = new Set(sundays);
  // Start Psalms and Proverbs on the Saturdays immediately before the first two
  // Sundays. That preserves the mandatory intro -> chapter 1 adjacency without
  // spending Monday slots; two later balancing slots complete the full corpus.
  const firstTwoSaturdays = Array.from({length: totalDays}, (_, index) => index + 1)
    .filter((dayIndex) => dayOfWeek(addDays(input.startDate, dayIndex - 1)) === 6)
    .slice(0, 2);
  const forcedMinorStreams = new Map([
    [firstTwoSaturdays[0], "psalms"], [firstTwoSaturdays[0] + 1, "psalms"],
    [firstTwoSaturdays[1], "proverbs"], [firstTwoSaturdays[1] + 1, "proverbs"]
  ]);
  const optionalMinorSlots = new Set([sundays[Math.floor(sundays.length / 3)] + 1, sundays[Math.floor(2 * sundays.length / 3)] + 1]);
  [...forcedMinorStreams.keys(), ...optionalMinorSlots].forEach((dayIndex) => minorSlots.add(dayIndex));
  if (minorSlots.size !== minorTotal) throw new Error("Minor-stream cadence slots do not equal the Psalm/Proverbs unit count.");
  // Reserve Psalms slots 1–2 and Proverbs slots 3–4 for their respective
  // introduction/chapter-1 pairs. Distribute the remaining Proverbs chapters
  // across the remaining minor slots, deliberately retaining Proverbs 31 for
  // the final minor slot so all four streams close within the review tolerance.
  const proverbsSlotOrdinals = new Set([3, 4]);
  const remainingProverbs = units.proverbs.length - proverbsSlotOrdinals.size;
  const remainingMinorSlots = minorTotal - 4;
  for (let index = 1; index <= remainingProverbs; index += 1) {
    proverbsSlotOrdinals.add(4 + Math.ceil((index * remainingMinorSlots) / remainingProverbs));
  }
  if (proverbsSlotOrdinals.size !== units.proverbs.length || !proverbsSlotOrdinals.has(minorTotal)) {
    throw new Error("Proverbs slot allocation is not complete or does not retain the final minor slot.");
  }
  const entries = [];
  const nonSundayMinorExceptions = [];
  let forcedStream = "old_testament";
  let previousStream = null;
  let minorSlotOrdinal = 0;
  while (entries.length < totalDays) {
    const dayIndex = entries.length + 1;
    const civilDate = addDays(input.startDate, dayIndex - 1);
    const sunday = dayOfWeek(civilDate) === 0;
    let streamId;
    const nextMinorSlot = Array.from(minorSlots).filter((candidate) => candidate > dayIndex).sort((left, right) => left - right)[0] || null;
    const majorSlotsAfterSelection = nextMinorSlot === null ? Number.MAX_SAFE_INTEGER : nextMinorSlot - dayIndex - 1;
    const viableMajorStreams = nextMinorSlot === null ? null : availableMajorStreams(cursors, units, previousStream)
      .filter((candidate) => canReachMinorSlot(cursors, units, previousStream, candidate, majorSlotsAfterSelection));
    if (forcedStream) streamId = forcedStream;
    else if (forcedMinorStreams.has(dayIndex)) streamId = forcedMinorStreams.get(dayIndex);
    else if (minorSlots.has(dayIndex)) streamId = chooseMinor(cursors, units, minorSlotOrdinal + 1, proverbsSlotOrdinals);
    else if (nextMinorSlot !== null && viableMajorStreams.length === 0 && majorWouldConflictNextMinor(cursors, units, previousStream)) {
      const replacement = [...optionalMinorSlots].filter((candidate) => candidate > dayIndex).sort((left, right) => right - left)[0];
      if (!replacement) throw new Error(`No declared balancing slot remains to preserve Sunday Psalm/Proverbs cadence after ${civilDate}.`);
      optionalMinorSlots.delete(replacement);
      minorSlots.delete(replacement);
      minorSlots.add(dayIndex);
      streamId = chooseMinor(cursors, units, minorSlotOrdinal + 1, proverbsSlotOrdinals);
    } else streamId = chooseMajor(cursors, units, previousStream,
      minorSlots.has(dayIndex + 1), dayOfWeek(addDays(civilDate, 1)) === 6, viableMajorStreams);
    if (!streamId) throw new Error(`No stream available on ${civilDate}.`);
    const unit = units[streamId][cursors[streamId]];
    if (!unit) throw new Error(`No ${streamId} unit available on ${civilDate}.`);
    if (sunday && !["psalms", "proverbs"].includes(streamId)) throw new Error(`Sunday ${civilDate} did not receive a Psalm or Proverbs unit (forced ${forcedStream || "none"}).`);
    if (!minorSlots.has(dayIndex) && ["psalms", "proverbs"].includes(streamId)) throw new Error(`${civilDate} received an undeclared Psalm/Proverbs exception.`);
    if (["psalms", "proverbs"].includes(streamId)) {
      minorSlotOrdinal += 1;
      const expectedMinor = chooseMinor(cursors, units, minorSlotOrdinal, proverbsSlotOrdinals);
      if (streamId !== expectedMinor) throw new Error(`${civilDate} violates the deterministic Psalm/Proverbs slot allocation.`);
      if (!sunday) nonSundayMinorExceptions.push({dayIndex, civilDate, streamId,
        reason: forcedMinorStreams.has(dayIndex) ? "scheduled book-introduction/chapter-1 adjacency design" :
          forcedStream ? "mandatory introduction-to-chapter-1 adjacency" : "proportional Sunday-cadence balancing"});
    }
    cursors[streamId] += 1;
    streamSequences[streamId] += 1;
    entries.push(entryFromUnit({input, unit, streamId, streamSequence: streamSequences[streamId], dayIndex, date: civilDate}));
    forcedStream = unit.kind === "book_intro" ? streamId : null;
    previousStream = streamId;
  }
  const bookMetrics = Object.fromEntries([...BOOKS.values()].map((book) => [book.bookId, {verseCount: book.verseCount, chapterCount: book.chapterVerseCounts.length, versification: "Protestant chapter and verse numbering; factual structural metadata only"}]));
  const scheduleBytes = JSON.stringify(entries);
  const scheduleSha256 = sha256(scheduleBytes);
  const inputSha256 = sha256(JSON.stringify(input));
  const plan = {
    schemaVersion: "plan/v1",
    planVersion: input.planVersion,
    title: input.title,
    canonId: input.canonId,
    structure: {oneReadingUnitPerDay: true, bookIntroductionPolicy: "immediately_before_chapter_1", interweavingStrategy: "proportional_four_stream", targetFinishTogether: true,
      streams: Object.entries(units).map(([streamId, list]) => ({streamId, unitCount: list.length, orderingRule: input.reviewNotes[streamId]}))},
    candidateMetadata: {reviewOnly: true, timezone: input.timezone, startDate: input.startDate, sundayPolicy: input.sundayPolicy,
      inputSha256, scheduleSha256, nonSundayMinorExceptions},
    entries,
    bookMetrics
  };
  return {plan, units, nonSundayMinorExceptions};
}

export function candidateMetrics(plan, nonSundayMinorExceptions = []) {
  const streamIds = ["old_testament", "new_testament", "psalms", "proverbs"];
  const byStream = Object.fromEntries(streamIds.map((streamId) => [streamId, plan.entries.filter((entry) => entry.streamId === streamId)]));
  const finish = Object.fromEntries(streamIds.map((streamId) => [streamId, byStream[streamId].at(-1).civilDate]));
  const finishNumbers = Object.values(finish).map((date) => Date.parse(`${date}T00:00:00Z`) / 86400000);
  const runs = [];
  let start = 0;
  while (start < plan.entries.length) {
    let end = start;
    while (end + 1 < plan.entries.length && plan.entries[end + 1].streamId === plan.entries[start].streamId) end += 1;
    runs.push({streamId: plan.entries[start].streamId, startDayIndex: start + 1, endDayIndex: end + 1, length: end - start + 1});
    start = end + 1;
  }
  const sundayEntries = plan.entries.filter((entry) => dayOfWeek(entry.civilDate) === 0);
  const ntRuns = runs.filter((run) => run.streamId === "new_testament" && run.length > 1);
  const consecutiveNtExceptions = ntRuns.map((run) => {
    const first = plan.entries[run.startDayIndex - 1];
    const second = plan.entries[run.startDayIndex];
    const validPair = run.length === 2 && first.kind === "book_intro" && second.kind === "chapter" && first.bookId === second.bookId && second.chapter === 1;
    return {...run, reason: validPair ? "mandatory introduction-to-chapter-1 adjacency" : "invalid: exceeds the permitted NT introduction/chapter-1 pair"};
  });
  return {totalDays: plan.entries.length, startDate: plan.entries[0].civilDate, endDate: plan.entries.at(-1).civilDate,
    readingsByStream: Object.fromEntries(streamIds.map((streamId) => [streamId, byStream[streamId].length])), finishDates: finish,
    finishSpreadDays: Math.max(...finishNumbers) - Math.min(...finishNumbers), sundayAllocation: Object.fromEntries(["psalms", "proverbs"].map((streamId) => [streamId, sundayEntries.filter((entry) => entry.streamId === streamId).length])),
    sundayCount: sundayEntries.length, nonSundayMinorExceptions, consecutiveNtExceptions,
    maximumRuns: Object.fromEntries(streamIds.map((streamId) => [streamId, Math.max(...runs.filter((run) => run.streamId === streamId).map((run) => run.length))]))};
}

export function validateLongTermCandidate(plan, input) {
  const expectedBooks = new Set(Object.values(input.streams).flat());
  if (expectedBooks.size !== 66) throw new Error("Candidate input must contain each Protestant-canon book exactly once.");
  if (expectedBooks.size !== BOOKS.size || [...expectedBooks].some((bookId) => !BOOKS.has(bookId))) throw new Error("Candidate input must equal the 66-book Protestant canon.");
  const entriesByBook = new Map();
  plan.entries.forEach((entry, index) => {
    if (entry.dayIndex !== index + 1 || entry.civilDate !== addDays(input.startDate, index)) throw new Error("Candidate has a date or day-index gap.");
    if (new Date(`${entry.civilDate}T00:00:00Z`).toISOString().slice(0, 10) !== entry.civilDate) throw new Error("Candidate has an invalid civil date.");
    const list = entriesByBook.get(entry.bookId) || [];
    list.push(entry);
    entriesByBook.set(entry.bookId, list);
    if (dayOfWeek(entry.civilDate) === 0 && !["psalms", "proverbs"].includes(entry.streamId)) throw new Error(`Sunday ${entry.civilDate} lacks a Psalm/Proverbs unit.`);
  });
  if (entriesByBook.size !== expectedBooks.size || [...entriesByBook.keys()].some((bookId) => !expectedBooks.has(bookId))) throw new Error("Candidate contains a non-canonical or duplicate book assignment.");
  for (const bookId of expectedBooks) {
    const book = BOOKS.get(bookId);
    const entries = entriesByBook.get(bookId) || [];
    const intros = entries.filter((entry) => entry.kind === "book_intro");
    if (intros.length !== 1) throw new Error(`${bookId} must have one book introduction.`);
    if (!intros[0].representativeVerse || intros[0].representativeVerse.bookId !== bookId) throw new Error(`${bookId} introduction lacks its representative verse reference.`);
    const introIndex = plan.entries.indexOf(intros[0]);
    const next = plan.entries[introIndex + 1];
    if (!next || next.kind !== "chapter" || next.bookId !== bookId || next.chapter !== 1) throw new Error(`${bookId} introduction is not adjacent to chapter 1.`);
    const chapters = entries.filter((entry) => entry.kind === "chapter");
    if (chapters.length !== book.chapterVerseCounts.length || chapters.some((entry, index) => entry.chapter !== index + 1)) throw new Error(`${bookId} chapter coverage is not exact.`);
    chapters.forEach((entry, index) => {
      const passage = entry.passages[0];
      if (!passage || passage.verseCount !== book.chapterVerseCounts[index]) throw new Error(`${bookId} ${index + 1} verse count drift.`);
      if (bookId === "PRO" && (passage.verseStart !== 1 || passage.verseEnd !== book.chapterVerseCounts[index])) throw new Error(`Proverbs ${index + 1} range is incomplete.`);
    });
  }
  const ids = plan.entries.map((entry) => entry.readingId);
  if (new Set(ids).size !== ids.length) throw new Error("Candidate has duplicate reading IDs.");
  for (const [streamId, expectedOrder] of Object.entries(input.streams)) {
    const streamEntries = plan.entries.filter((entry) => entry.streamId === streamId);
    const observedOrder = [...new Set(streamEntries.map((entry) => entry.bookId))];
    if (JSON.stringify(observedOrder) !== JSON.stringify(expectedOrder)) throw new Error(`${streamId} book order drift.`);
    if (streamEntries.some((entry, index) => entry.streamSequence !== index + 1)) throw new Error(`${streamId} sequence drift.`);
  }
  const disclosed = plan.candidateMetadata?.nonSundayMinorExceptions || [];
  const actualExceptions = plan.entries.filter((entry) => dayOfWeek(entry.civilDate) !== 0 && ["psalms", "proverbs"].includes(entry.streamId))
    .map((entry) => `${entry.dayIndex}:${entry.civilDate}:${entry.streamId}`);
  const declaredExceptions = disclosed.map((entry) => `${entry.dayIndex}:${entry.civilDate}:${entry.streamId}`);
  if (JSON.stringify(actualExceptions) !== JSON.stringify(declaredExceptions)) throw new Error("Non-Sunday Psalm/Proverbs exceptions are not fully disclosed.");
  const metrics = candidateMetrics(plan, disclosed);
  if (metrics.finishSpreadDays > MAX_FINISH_SPREAD_DAYS) throw new Error(`Candidate finish spread ${metrics.finishSpreadDays} exceeds ${MAX_FINISH_SPREAD_DAYS} days.`);
  if (metrics.maximumRuns.new_testament > 2 || metrics.consecutiveNtExceptions.some((run) => run.reason.startsWith("invalid:"))) {
    throw new Error("Candidate permits an invalid consecutive New Testament run.");
  }
  if (plan.entries[0].kind !== "book_intro" || plan.entries[0].bookId !== "GEN" ||
    plan.entries[1]?.kind !== "chapter" || plan.entries[1]?.bookId !== "GEN" || plan.entries[1]?.chapter !== 1) {
    throw new Error("Candidate must begin with the Genesis introduction followed by Genesis 1.");
  }
  return true;
}

export function renderCandidateReport({input, plan, metrics}) {
  const bookOrder = Object.entries(input.streams).map(([streamId, books]) => `### ${streamId.replaceAll("_", " ")}\n\n${books.map((bookId, index) => `${index + 1}. ${BOOKS.get(bookId).title} — ${rationale(streamId, bookId, index)} (${bookChronology(streamId, bookId).confidence} confidence)`).join("\n")}`).join("\n\n");
  const proverbs = plan.entries.filter((entry) => entry.bookId === "PRO" && entry.kind === "chapter").map((entry) => {
    const p = entry.passages[0];
    return `${entry.civilDate}: Proverbs ${p.chapter}:${p.verseStart}–${p.verseEnd}`;
  }).join("\n");
  const yearly = new Map();
  const monthly = new Map();
  plan.entries.forEach((entry) => { const year = entry.civilDate.slice(0, 4); yearly.set(year, (yearly.get(year) || 0) + 1); });
  plan.entries.forEach((entry) => { const month = entry.civilDate.slice(0, 7); monthly.set(month, (monthly.get(month) || 0) + 1); });
  return `# Four-stream long-term plan — review candidate\n\n**Status:** review only; not active, published, or available to the app.\n\n- Plan version: \`${plan.planVersion}\`\n- Civil start: ${metrics.startDate} (${input.timezone})\n- Civil end: ${metrics.endDate}\n- Total daily units: ${metrics.totalDays}\n- Schedule SHA-256: \`${plan.candidateMetadata.scheduleSha256}\`\n- Input SHA-256: \`${plan.candidateMetadata.inputSha256}\`\n\n## Review metrics\n\n| Metric | Value |\n|---|---:|\n| OT units | ${metrics.readingsByStream.old_testament} |\n| NT units | ${metrics.readingsByStream.new_testament} |\n| Psalm units | ${metrics.readingsByStream.psalms} |\n| Proverbs units | ${metrics.readingsByStream.proverbs} |\n| Sundays | ${metrics.sundayCount} |\n| Sunday Psalms / Proverbs | ${metrics.sundayAllocation.psalms} / ${metrics.sundayAllocation.proverbs} |\n| Stream finish spread | ${metrics.finishSpreadDays} days |\n| Max OT / NT run | ${metrics.maximumRuns.old_testament} / ${metrics.maximumRuns.new_testament} |\n\nFinish dates: OT ${metrics.finishDates.old_testament}; NT ${metrics.finishDates.new_testament}; Psalms ${metrics.finishDates.psalms}; Proverbs ${metrics.finishDates.proverbs}.\n\n## Cadence exceptions\n\n${metrics.nonSundayMinorExceptions.length ? metrics.nonSundayMinorExceptions.map((item) => `- Day ${item.dayIndex} (${item.civilDate}): ${item.streamId.replaceAll("_", " ")} — ${item.reason}.`).join("\n") : "None."}\n\n${metrics.consecutiveNtExceptions.length ? `### Consecutive NT runs\n\n${metrics.consecutiveNtExceptions.map((item) => `- Days ${item.startDayIndex}–${item.endDayIndex} (${item.length} units): ${item.reason}.`).join("\n")}` : "No consecutive NT runs."}\n\n## Stream order and confidence\n\n${bookOrder}\n\n## Psalm policy\n\nPsalms remain in canonical order in this candidate. Historically associated placement is deferred unless a later review determines that a specific association is sufficiently supported; no disputed superscription has been treated as decisive.\n\n## Every Proverbs range\n\n${proverbs}\n\n## Calendar summary\n\n### Monthly\n\n${[...monthly.entries()].map(([month, count]) => `- ${month}: ${count} scheduled days.`).join("\n")}\n\n### Yearly\n\n${[...yearly.entries()].map(([year, count]) => `- ${year}: ${count} scheduled days.`).join("\n")}\n\n## Sources and limits\n\n${input.sourceMetadata.map((source) => `- **${source.title}** (${source.accessDate}) — ${source.url}. ${source.use}`).join("\n")}\n\nWhole-book chronology is approximate and disputed. The source IDs in the candidate identify the public structural and orientation sources used to construct this review artifact; they do not claim that any one source resolves every date or authorship question.\n`;
}

const STREAM_DISPLAY_NAMES = {
  old_testament: "Old Testament",
  new_testament: "New Testament",
  psalms: "Psalms",
  proverbs: "Proverbs"
};

function markdownTableCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

/**
 * Render the inactive candidate as a compact, month-grouped review artifact.
 * This consumes the already-built candidate and deliberately does not affect
 * its serialized JSON, ordering, hash, or activation state.
 */
export function renderLongTermDailySchedule({plan}) {
  const monthlyEntries = new Map();
  plan.entries.forEach((entry) => {
    const month = entry.civilDate.slice(0, 7);
    const entries = monthlyEntries.get(month) || [];
    entries.push(entry);
    monthlyEntries.set(month, entries);
  });
  const months = [...monthlyEntries.entries()].map(([month, entries]) => {
    const rows = entries.map((entry) => `| ${entry.civilDate} | ${entry.dayIndex} | ${STREAM_DISPLAY_NAMES[entry.streamId]} | ${markdownTableCell(entry.unitLabel)} |`).join("\n");
    return `## ${month}\n\n| Date | Day | Stream | Reading |\n|---|---:|---|---|\n${rows}`;
  }).join("\n\n");
  return `# Four-stream long-term daily schedule\n\n**Status:** review only; inactive candidate. This is not published or available to the app.\n\n- Plan version: \`${plan.planVersion}\`\n- Civil range: ${plan.candidateMetadata.startDate} through ${plan.entries.at(-1).civilDate} (${plan.candidateMetadata.timezone})\n- Daily units: ${plan.entries.length}\n- Schedule SHA-256: \`${plan.candidateMetadata.scheduleSha256}\`\n\nThis phone-readable artifact is generated from the inactive candidate. Reviewing it does not activate, publish, or prepare any reading.\n\n${months}\n`;
}
