const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const app = require("../app/frontend/app.js");

test("offline outbox compacts edits into an unsynced create", () => {
  const items = [
    {clientRequestId: "create:1234567890123456", localTempId: "temp:12345678901234567", eventType: "create", body: "first", queuedAt: "2026-08-08T10:00:00Z"},
    {clientRequestId: "edit:12345678901234567", localTempId: "temp:12345678901234567", eventType: "edit", body: "second", queuedAt: "2026-08-08T10:01:00Z"}
  ];
  const compacted = app.compactOutbox(items);
  assert.equal(compacted.length, 1);
  assert.equal(compacted[0].eventType, "create");
  assert.equal(compacted[0].body, "second");
});

test("offline create followed by delete disappears before sync", () => {
  const items = [
    {clientRequestId: "create:1234567890123456", localTempId: "temp:12345678901234567", eventType: "create", body: "first", queuedAt: "2026-08-08T10:00:00Z"},
    {clientRequestId: "delete:123456789012345", localTempId: "temp:12345678901234567", eventType: "delete", body: "", queuedAt: "2026-08-08T10:01:00Z"}
  ];
  assert.deepEqual(app.compactOutbox(items), []);
});

test("retained sync failures distinguish service publication, discussion store, transport, and payload faults", () => {
  assert.equal(app.contentServiceFailure({code: "CONTENT_INVALID"}), true);
  assert.equal(app.contentServiceFailure({code: "SOURCE_REGISTRY_INVALID"}), true);
  assert.equal(app.commentStoreFailure({code: "COMMENT_STORE_UNAVAILABLE"}), true);
  assert.equal(app.retainedCalendarFailureStatus({code: "CONTENT_INVALID"}),
    "Study service update is incomplete · saved calendar retained");
  assert.equal(app.retainedCalendarFailureStatus({code: "COMMENT_STORE_BUSY"}),
    "Shared discussion is unavailable · saved calendar retained");
  assert.match(app.retainedCalendarFailureStatus({code: "SERVER_TIMEOUT"}), /^Offline/);
  assert.equal(app.retainedOutboxFailureStatus({code: "CONTENT_INVALID"}),
    "Study service update is incomplete · comment saved locally");
  assert.equal(app.retainedOutboxFailureStatus({code: "COMMENT_STORE_UNAVAILABLE"}),
    "Shared discussion is unavailable · comment saved locally");
  assert.equal(app.retainedOutboxFailureStatus({code: "REVISION_CONFLICT"}),
    "Comment update needs attention · saved locally");
});

test("cached-shell confirmation waits for authoritative bootstrap before dependent work and keeps failures retained", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const refresh = source.slice(source.indexOf("async function refreshBootstrapAfterConfirmation"), source.indexOf("async function confirmServerAccess"));
  const confirm = source.slice(source.indexOf("async function confirmServerAccess"), source.indexOf("async function startAuthorizedApplication"));
  const calendar = source.slice(source.indexOf("async function syncCalendarCompletion"), source.indexOf("function showHome"));
  const outbox = source.slice(source.indexOf("async function flushOutbox"), source.indexOf("async function syncSharedActivity"));
  assert.match(refresh, /await state\.adapter\.getBootstrapData\(\)/);
  assert.match(refresh, /return true;/);
  assert.match(refresh, /contentServiceFailure\(error\)[\s\S]*?saved data retained/);
  assert.doesNotMatch(refresh, /startConfirmedBackgroundWork/);
  assert.ok(confirm.indexOf("await refreshBootstrapAfterConfirmation(expectedAuthorId)") <
    confirm.indexOf("state.serverAccessConfirmed = true"));
  assert.ok(confirm.indexOf("state.serverAccessConfirmed = true") < confirm.indexOf("startConfirmedBackgroundWork()"));
  assert.match(calendar, /catch \(error\) \{[\s\S]*?explicitAccessFailure\(error\)[\s\S]*?state\.serverAccessConfirmed = false;[\s\S]*?handleFatalError\(error\)/);
  assert.match(calendar, /retainedCalendarFailureStatus\(error\)/);
  assert.match(outbox, /catch \(error\) \{[\s\S]*?explicitAccessFailure\(error\)[\s\S]*?state\.serverAccessConfirmed = false;[\s\S]*?handleFatalError\(error\)/);
  assert.match(outbox, /await state\.store\.put\("commentOutbox", \{\.\.\.item, status: "error"/);
  assert.match(outbox, /retainedOutboxFailureStatus\(error\)/);
});

test("prepared-library catalog preserves plan order, grouped occurrences, exact partial coverage, and normal future locks", () => {
  const plan = {
    planVersion: "library-test/v1",
    bookMetrics: {
      GEN: {chapterCount: 2, verseCount: 56},
      PRO: {chapterCount: 2, verseCount: 55},
      HAG: {chapterCount: 2, verseCount: 38}
    },
    entries: [
      {planVersion: "library-test/v1", dayIndex: 1, readingId: "intro-GEN", kind: "book_intro", bookId: "GEN"},
      {planVersion: "library-test/v1", dayIndex: 2, readingId: "GEN-001-002", kind: "chapter", bookId: "GEN", chapter: 1,
        passages: [{bookId: "GEN", chapter: 1, verseCount: 31}, {bookId: "GEN", chapter: 2, verseCount: 25}]},
      {planVersion: "library-test/v1", dayIndex: 3, readingId: "PRO-001-A", kind: "chapter", bookId: "PRO", chapter: 1,
        passages: [{bookId: "PRO", chapter: 1, verseStart: 1, verseEnd: 8, verseCount: 8}]},
      {planVersion: "library-test/v1", dayIndex: 4, readingId: "PRO-001-B", kind: "chapter", bookId: "PRO", chapter: 1,
        passages: [{bookId: "PRO", chapter: 1, verseStart: 9, verseEnd: 16, verseCount: 8}]},
      {planVersion: "library-test/v1", dayIndex: 5, readingId: "PRO-002", kind: "chapter", bookId: "PRO", chapter: 2,
        passages: [{bookId: "PRO", chapter: 2, verseCount: 32}]},
      {planVersion: "library-test/v1", dayIndex: 6, readingId: "HAG-001", kind: "chapter", bookId: "HAG", chapter: 1,
        passages: [{bookId: "HAG", chapter: 1, verseCount: 15}]}
    ]
  };
  const catalog = app.buildPreparedLibraryCatalog(plan, new Set(["intro-GEN", "GEN-001-002", "PRO-001-A", "PRO-001-B"]));
  assert.deepEqual(["GEN", "2SA", "ECC", "HAB", "MAT", "1CO", "3JN", "REV"].map(app.bookNameForId), [
    "Genesis", "2 Samuel", "Ecclesiastes", "Habakkuk", "Matthew", "1 Corinthians", "3 John", "Revelation"
  ]);
  assert.deepEqual(catalog.books.map((book) => book.bookId), ["GEN", "PRO", "HAG"]);
  const genesis = catalog.books[0];
  assert.equal(genesis.prepared, true);
  assert.deepEqual(genesis.resources.filter((resource) => resource.prepared).map((resource) => [resource.label, resource.readingId]), [
    ["Overview", "intro-GEN"], ["Chapter 1", "GEN-001-002"], ["Chapter 2", "GEN-001-002"]
  ]);
  const proverbs = catalog.books[1];
  assert.deepEqual(proverbs.resources.map((resource) => [resource.label, resource.prepared]), [
    ["Overview", false], ["Chapter 1:1–8", true], ["Chapter 1:9–16", true], ["Chapter 2", false]
  ]);
  assert.equal(catalog.books[2].prepared, false);
  assert.equal(app.catalogResourceByKey(catalog, "GEN-001-002:passage:1").readingId, "GEN-001-002");
  assert.throws(() => app.buildPreparedLibraryCatalog(plan, ["not-in-plan"]), /Prepared library membership/);

  const config = {timezone: "America/Detroit", sharedStartDateMode: "fixed", sharedStartDate: "2026-09-16", futureReadingsLocked: true, futureLookaheadDays: 0, pastReadingsAvailable: true};
  const normal = app.calculateSchedule(plan, config, new Date("2026-09-16T12:00:00Z"), "PRO-001-A");
  assert.equal(normal.selectedEntry.readingId, "intro-GEN");
  assert.equal(normal.locked, false);
  const preparedIds = new Set(["intro-GEN", "GEN-001-002", "PRO-001-A", "PRO-001-B"]);
  const library = app.calculateLibrarySchedule(plan, config, new Date("2026-09-16T12:00:00Z"), "PRO-001-A", preparedIds);
  assert.equal(library.selectedEntry.readingId, "PRO-001-A");
  assert.equal(library.locked, false);
  assert.equal(library.libraryMode, true);
  assert.throws(() => app.calculateLibrarySchedule(plan, config, new Date("2026-09-16T12:00:00Z"), "PRO-002", preparedIds), /not prepared/);
  assert.equal(app.libraryPositionLabel(plan.entries[1], app.catalogResourceByKey(catalog, "GEN-001-002:passage:1"), plan.entries.length),
    "Library · Genesis · Chapter 2 · day 2 of 6");
  const bridgeEntry = {planVersion: "celebration-y3q4-bridge-2026-v1", dayIndex: 2, sourcePlanDay: 55, readingId: "CC-Y3Q4-D055"};
  const longTermEntry = {planVersion: "celebration-y3q4-bridge-2026-v1", dayIndex: 40, readingId: "LTP-0001-GEN-INTRO"};
  assert.equal(app.occurrencePositionLabel(plan.entries[1], plan.entries.length, "library"), "day 2 of 6");
  assert.equal(app.occurrencePositionLabel(bridgeEntry, 1263, "library"), "bridge day 2 of 1263");
  assert.equal(app.occurrencePositionLabel(longTermEntry, 1263, "library"), "long-term day 1 of 1224");
  assert.equal(app.occurrencePositionLabel(plan.entries[1], plan.entries.length, "selected"), "Day 2 of 6");
  assert.equal(app.occurrencePositionLabel(bridgeEntry, 1263, "selected"), "Original plan day 55 of 92 · Bridge day 2 of 1263");
  assert.equal(app.occurrencePositionLabel(longTermEntry, 1263, "reading"), "Four-stream plan · day 1 of 1224");

  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../app/frontend/styles.css"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const headerCssStart = css.indexOf(".app-header {");
  const headerCss = css.slice(headerCssStart, css.indexOf("}", headerCssStart) + 1);
  const mobileCss = css.slice(css.indexOf("@media (max-width: 35rem)"));
  assert.match(html, /id="libraryPicker"[^>]*aria-label="Prepared study library"/);
  assert.match(html, /id="libraryBookSelect" aria-label="Book"/);
  assert.match(html, /id="libraryResourceSelect" aria-label="Chapter or overview"/);
  assert.match(html, /id="libraryOpenButton"[^>]*>Open</);
  assert.match(css, /\.library-picker\s*\{[\s\S]*?grid-template-columns/);
  assert.match(css, /\.library-picker select,[\s\S]*?min-height:\s*2\.75rem/);
  assert.match(headerCss, /position:\s*static;/);
  assert.doesNotMatch(headerCss, /position:\s*(?:sticky|fixed);/);
  assert.match(css, /\.brand-button\s*\{[^}]*white-space:\s*nowrap;/);
  assert.match(mobileCss, /\.app-header\s*\{[^}]*grid-template-columns:\s*minmax\(10rem,\s*0\.95fr\)\s+minmax\(0,\s*1\.05fr\);/);
  assert.match(mobileCss, /\.header-status\s*\{[^}]*max-width:\s*none;/);
  assert.match(mobileCss, /\.reading-toolbar\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\);/);
  assert.match(mobileCss, /\.reading-position strong\s*\{[^}]*text-overflow:\s*clip;[^}]*white-space:\s*normal;/);
  assert.match(source, /function buildPreparedLibraryCatalog\(/);
  assert.match(source, /function calculateLibrarySchedule\(/);
  assert.match(source, /openReading\(resource\.readingId, \{libraryMode: true, libraryResource: resource\}\)/);
  assert.match(source, /libraryMode\s*\?\s*calculateLibrarySchedule/);
  assert.match(source, /function libraryPositionLabel\(/);
  assert.match(source, /Library · \$\{resourceLabel\}/);
});

test("an explicit prepared grouped chapter selection stays isolated without changing ordinary grouped reading", () => {
  const entry = {
    kind: "chapter",
    readingId: "MIC-003-004",
    bookId: "MIC",
    passages: [
      {bookId: "MIC", chapter: 3, verseCount: 12},
      {bookId: "MIC", chapter: 4, verseCount: 13}
    ]
  };
  const bookMetrics = {MIC: {chapterCount: 7, verseCount: 105}};
  const policy = {maxBookFraction: 0.5, maxTotalCachedVerses: 500};

  const ordinary = app.scriptureRequestSelection(entry, bookMetrics, policy);
  assert.equal(ordinary.partitioned, false);
  assert.equal(ordinary.passageIndex, null);
  assert.deepEqual(ordinary.requestedPassages.map((passage) => passage.chapter), [3, 4]);

  const libraryChapterFour = app.scriptureRequestSelection(entry, bookMetrics, policy, 1);
  assert.equal(libraryChapterFour.partitioned, false);
  assert.equal(libraryChapterFour.passageIndex, 1);
  assert.deepEqual(libraryChapterFour.requestedPassages.map((passage) => passage.chapter), [4]);
  assert.equal(app.esvUrlForPassages(libraryChapterFour.requestedPassages), "https://www.esv.org/Micah+4/");
  assert.equal(app.scriptureResponseMatchesRequest({partitioned: false, passageIndex: 1}, 1), true);
  assert.equal(app.scriptureResponseMatchesRequest({partitioned: false, passageIndex: 0}, 1), false);
  assert.equal(app.scriptureResponseMatchesRequest({partitioned: false, passageIndex: 0}, null), true);

  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  assert.match(source, /const \{partitioned, displaySegments, passageIndex, requestedPassages\} = selection;/);
  assert.match(source, /remembered && remembered\.passageIndex === passageIndex/);
  assert.match(source, /function scriptureResponseMatchesRequest\(/);
  assert.match(source, /Number\.isInteger\(scripture\.passageIndex\)\s*\? scripture\.passageIndex/);
});

test("numbered Scripture rendering supports isolated shared highlights and partial verse units", () => {
  assert.deepEqual(app.splitNumberedVerses("[7] First line.\n\n[8] Second line.\nContinued."), [
    {verse: 7, text: "First line."},
    {verse: 8, text: "Second line.\nContinued."}
  ]);
  assert.equal(app.verseBelongsToPassage({verseStart: 7, verseEnd: 9, verseCount: 3}, 8), true);
  assert.equal(app.verseBelongsToPassage({verseStart: 7, verseEnd: 9, verseCount: 3}, 6), false);
  assert.equal(app.verseBelongsToPassage({verseStart: 7, verseEnd: 9, verseCount: 4}, 8), false);
  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../app/frontend/styles.css"), "utf8");
  const frontend = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const highlights = fs.readFileSync(path.join(__dirname, "../app/frontend/highlights.js"), "utf8");
  assert.match(html, /id="highlightPopover"/);
  assert.match(html, /id="highlightAction"/);
  assert.match(html, /id="verseCommentaryBlurb"/);
  assert.match(html, /id="verseCommentarySource"/);
  assert.match(html, /id="verseCommentaryFallbackLink"/);
  assert.match(html, />Read Henry</);
  assert.match(html, /Matthew Henry — condensed paraphrase/);
  assert.match(css, /data-highlight-reader-0/);
  assert.match(css, /data-highlight-reader-1/);
  assert.match(frontend, /const DB_VERSION = 4/);
  assert.doesNotMatch(frontend, /highlightOutbox|highlightSnapshot|highlightEvents: "eventId"/);
  assert.match(frontend, /registerHighlightEnhancer/);
  assert.match(highlights, /api\.registerHighlightEnhancer/);
  assert.match(highlights, /api\.listCurrentHighlights/);
  assert.match(highlights, /api\.submitCurrentHighlightEvent/);
  assert.match(highlights, /context\.verseCommentary/);
  assert.match(highlights, /context\.henrySourceLink/);
  assert.match(highlights, /sourceAtoms\.appendChild/);
  assert.match(highlights, /paragraph\.textContent = atom\.text/);
  assert.match(highlights, /selectedTrigger/);
  assert.ok(html.indexOf('<script src="app.js"></script>') < html.indexOf('<script src="highlights.js"></script>'));
});

test("precomputed Matthew Henry shards are accepted only with complete chapter-local coverage", () => {
  const entry = {kind: "chapter", bookId: "GEN", passages: [{bookId: "GEN", chapter: 1, verseCount: 2}]};
  const atomId = "fabricated-source:GEN:001:001-002:a001";
  const record = (verse) => ({
    blurb: `Fabricated commentary summary ${verse} for schema testing only.`,
    coverage_type: "range-derived",
    scope_note: "Henry treats verses 1–2 together.",
    source_unit_ids: ["fabricated-source:GEN:001:001-002"],
    source_atom_ids: [atomId],
    source_reference_label: "Genesis 1:1–2"
  });
  const shard = {
    schema_version: "mhc-runtime/v1",
    source_id: "fabricated-source",
    source_version: "test",
    source_archive_sha256: "a".repeat(64),
    source_manifest_ref: "source-manifest.json",
    worker_model: "fabricated-model",
    prompt_version: "fabricated-prompt/v1",
    generation_timestamp: "2026-08-10T12:00:00.000Z",
    validation_status: "valid",
    review_status: "unreviewed",
    label: "Matthew Henry — condensed paraphrase",
    book_id: "GEN",
    chapter: 1,
    source_layer_note: "Fabricated exact commentary excerpt for interface schema testing only.",
    source_atoms: {
      [atomId]: {
        source_atom_id: atomId,
        source_unit_id: "fabricated-source:GEN:001:001-002",
        source_reference_label: "Genesis 1:1–2",
        sequence: 1,
        atom_type: "commentary",
        text: "FABRICATED COMMENTARY SOURCE ATOM FOR INTERFACE TESTING ONLY.",
        text_sha256: "b".repeat(64)
      }
    },
    records: {"GEN.1.1": record(1), "GEN.1.2": record(2)}
  };
  assert.equal(app.normalizedVerseCommentaryShard(shard, entry), shard);
  assert.equal(app.normalizedVerseCommentaryShard({...shard, records: {"GEN.1.1": record(1)}}, entry), null);
  assert.equal(app.normalizedVerseCommentaryShard({...shard, validation_status: "unvalidated"}, entry), null);
  assert.equal(app.normalizedVerseCommentaryShard({...shard, records: {
    "GEN.1.1": {...record(1), source_atom_ids: ["fabricated:unknown"]},
    "GEN.1.2": record(2)
  }}, entry), null);
});

test("highlight toggles paint immediately and reconcile from the write response", () => {
  const highlights = fs.readFileSync(path.join(__dirname, "../app/frontend/highlights.js"), "utf8");
  const toggle = highlights.slice(
    highlights.indexOf("async function toggleHighlight"),
    highlights.indexOf("function render(nextContext)")
  );
  assert.ok(toggle.indexOf("applyHighlightState();") < toggle.indexOf("await api.submitCurrentHighlightEvent(payload)"));
  assert.match(toggle, /pending:\s*true/);
  assert.match(toggle, /result\s*&&\s*result\.event/);
  assert.match(toggle, /highlights\s*=\s*priorHighlights/);
  assert.doesNotMatch(toggle, /await\s+refreshHighlights\s*\(/);
});

test("highlight sheet retries stale access before fabricated add/remove without Safari 12-missing DOM APIs", async () => {
  const highlights = fs.readFileSync(path.join(__dirname, "../app/frontend/highlights.js"), "utf8");
  class FakeNode {
    constructor() {
      this.children = [];
      this.parentNode = null;
      this.dataset = {};
      this.attributes = new Map();
      this.listeners = new Map();
      this.hidden = false;
      this.textContent = "";
    }
    get firstChild() { return this.children[0] || null; }
    get lastElementChild() { return this.children[this.children.length - 1] || null; }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    append(...children) { children.forEach((child) => this.appendChild(child)); }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; return child; }
    replaceChild(replacement, child) {
      const index = this.children.indexOf(child);
      this.children[index] = replacement;
      child.parentNode = null;
      replacement.parentNode = this;
      return child;
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    async click() { return this.listeners.get("click") && this.listeners.get("click")({}); }
    querySelector(selector) { return find(this, selector); }
    focus(options) {
      if (options) throw new Error("Safari 12 focus options are unavailable");
      this.focused = true;
    }
  }
  const findAll = (node, selector, results = []) => {
    const matches = selector === ".scripture-verse" ? node.className === "scripture-verse" :
      selector === ".mock-verses" ? node.className === "mock-verses" : false;
    if (matches) results.push(node);
    node.children.forEach((child) => findAll(child, selector, results));
    return results;
  };
  const find = (node, selector) => findAll(node, selector)[0] || null;
  const nodes = new Map();
  const make = (id) => { const node = new FakeNode(); nodes.set(id, node); return node; };
  ["highlightPopover", "highlightPopoverReference", "highlightPopoverList", "highlightClose",
    "highlightAction", "highlightStatus", "highlightHelp", "verseCommentaryDetails",
    "verseCommentaryUnavailable", "verseCommentaryFallback", "verseCommentaryFallbackLink",
    "verseCommentaryFallbackNote", "verseCommentarySource", "verseCommentarySourceAtoms",
    "verseCommentaryLabel", "verseCommentaryBlurb", "verseCommentaryReference",
    "verseCommentaryScope", "verseCommentaryScopeRow", "verseCommentarySourceNote", "scriptureContent"]
    .forEach(make);
  nodes.get("highlightPopover").hidden = true;
  const section = new FakeNode();
  section.className = "scripture-passage";
  const mockList = new FakeNode();
  mockList.className = "mock-verses";
  section.appendChild(mockList);
  nodes.get("scriptureContent").appendChild(section);
  let enhancer;
  let sequence = 0;
  let recoveryAttempts = 0;
  const context = {
    DailyBibleReader: {
      registerHighlightEnhancer(value) { enhancer = value; },
      splitNumberedVerses() { return []; },
      listCurrentHighlights: async () => [],
      ensureCurrentHighlightAccess: async () => {
        recoveryAttempts += 1;
        return recoveryAttempts > 1;
      },
      createRequestId() { sequence += 1; return `fabricated-${sequence}`; },
      submitCurrentHighlightEvent: async (payload) => ({event: {
        ...payload, highlightId: "fabricated-highlight", authorId: "dustin", displayName: "Dustin",
        revision: 1, updatedAt: "2026-08-30T12:00:00.000Z", deletedAt: payload.eventType === "delete" ? "2026-08-30T12:00:01.000Z" : null
      }})
    },
    document: {
      createElement() { return new FakeNode(); },
      getElementById(id) { return nodes.get(id); },
      querySelectorAll(selector) {
        return selector === "#scriptureContent .scripture-passage" ? [section] : findAll(nodes.get("scriptureContent"), selector);
      },
      contains() { return true; },
      addEventListener() {}
    },
    Intl,
    Date,
    Promise
  };
  context.globalThis = context;
  vm.runInNewContext(highlights, context, {filename: "highlights.js"});
  enhancer.render({
    readingId: "FABRICATED-001",
    planVersion: "fabricated/v1",
    scripture: {isMock: true, passages: [{bookId: "FAB", chapter: 1, canonical: "Fabricated 1", verses: ["FABRICATED TEST VERSE."]}]},
    participants: [{authorId: "dustin", displayName: "Dustin"}, {authorId: "shane", displayName: "Shane"}],
    session: {authorId: "dustin", displayName: "Dustin"},
    online: false
  });
  await Promise.resolve();
  const verse = find(nodes.get("scriptureContent"), ".scripture-verse");
  await verse.click();
  assert.equal(nodes.get("highlightPopover").hidden, false);
  assert.equal(nodes.get("highlightClose").focused, true);
  assert.equal(nodes.get("highlightAction").disabled, false);
  await nodes.get("highlightAction").click();
  assert.equal(recoveryAttempts, 2);
  assert.equal(verse.attributes.get("data-highlight-reader-0"), "true");
  await Promise.resolve();
  await Promise.resolve();
  await nodes.get("highlightAction").click();
  assert.equal(verse.attributes.get("data-highlight-reader-0"), "false");
});

test("cached-shell sync paths retry once despite a false offline browser hint", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const highlights = fs.readFileSync(path.join(__dirname, "../app/frontend/highlights.js"), "utf8");
  const recovery = source.slice(source.indexOf("async function recoverServerAccess"), source.indexOf("async function readingPayloadWithCache"));
  assert.match(recovery, /if \(serverCallsAllowed\(\)\) return true;/);
  assert.match(recovery, /state\.adapter\.kind !== "apps-script"/);
  assert.doesNotMatch(recovery, /root\.navigator && root\.navigator\.onLine === false/);
  assert.match(recovery, /lastAccessRecoveryFailureAt/);
  assert.match(recovery, /now - state\.lastAccessRecoveryFailureAt < 15000/);
  assert.match(recovery, /confirmServerAccess\(\{[\s\S]*?hadCachedShell: true/);
  assert.match(recovery, /if \(explicitAccessFailure\(error\)\) \{\s*handleFatalError\(error\);\s*return null;/);
  assert.match(source, /if \(state\.authorizationPromise\) return state\.authorizationPromise;/);
  const resumeApplication = source.slice(source.indexOf("function resumeApplication"), source.indexOf("function focusCommentComposer"));
  assert.match(resumeApplication, /resumeOnlineWork\(\);/);
  assert.doesNotMatch(resumeApplication, /navigator\.onLine/);
  ["syncCalendarCompletion", "refreshComments", "flushOutbox"].forEach((name) => {
    const start = source.indexOf(`async function ${name}`);
    const end = source.indexOf("\n  async function", start + 1);
    const body = source.slice(start, end === -1 ? source.length : end);
    assert.ok(body.indexOf("await recoverServerAccess()") < body.indexOf("state.adapter."));
    assert.match(body, /if \(access === null\) return;\s*if \(!access\)/);
  });
  assert.match(source, /async function ensureCurrentHighlightAccess\(readingId, options\)[\s\S]*?return recoverServerAccess\(options\);/);
  assert.match(highlights, /api\.ensureCurrentHighlightAccess\(context\.readingId, \{force: true\}\)/);
});

test("a signed-in reader's active or queued comment marks only that reading complete", () => {
  const comments = [
    {commentId: "comment:1234567890123456", readingId: "intro-GEN", authorId: "dustin", deletedAt: null},
    {commentId: "comment:2234567890123456", readingId: "GEN-001", authorId: "shane", deletedAt: null}
  ];
  assert.equal(app.readingHasActiveComment(comments, [], "dustin", "intro-GEN"), true);
  assert.equal(app.readingHasActiveComment(comments, [], "dustin", "GEN-001"), false);
  assert.equal(app.readingHasActiveComment(comments, [{
    clientRequestId: "create:1234567890123456",
    localTempId: "local:12345678901234567",
    eventType: "create",
    readingId: "GEN-001",
    queuedAt: "2026-08-08T10:00:00Z"
  }], "dustin", "GEN-001"), true);
});

test("a pending retraction removes completion when it is the reader's only comment", () => {
  const comments = [{
    commentId: "comment:1234567890123456",
    readingId: "intro-GEN",
    authorId: "dustin",
    deletedAt: null
  }];
  const pendingDelete = [{
    clientRequestId: "delete:1234567890123456",
    eventType: "delete",
    commentId: "comment:1234567890123456",
    readingId: "intro-GEN",
    queuedAt: "2026-08-08T10:00:00Z"
  }];
  assert.equal(app.readingHasActiveComment(comments, pendingDelete, "dustin", "intro-GEN"), false);
});

test("request IDs are retry-safe identifiers", () => {
  const one = app.createRequestId("comment-create");
  const two = app.createRequestId("comment-create");
  assert.notEqual(one, two);
  assert.ok(one.length >= 16);
  assert.match(one, /^[A-Za-z0-9][A-Za-z0-9_.:-]+$/);
});

test("malformed or legacy comment drafts never render as the word undefined", () => {
  assert.equal(app.normalizedDraftBody(undefined), "");
  assert.equal(app.normalizedDraftBody(null), "");
  assert.equal(app.normalizedDraftBody({}), "");
  assert.equal(app.normalizedDraftBody({body: undefined}), "");
  assert.equal(app.normalizedDraftBody({body: "saved words"}), "saved words");
});

test("blocked iPhone IndexedDB startup falls back instead of freezing the reader", async () => {
  const priorIndexedDb = globalThis.indexedDB;
  const request = {};
  globalThis.indexedDB = {
    open() {
      setTimeout(() => request.onblocked(), 0);
      return request;
    }
  };
  try {
    const store = await app.createBrowserStore(100);
    assert.equal(store.mode, "memory");
    assert.equal(await store.get("deviceCredentials", "reader-code"), null);
  } finally {
    if (priorIndexedDb === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = priorIndexedDb;
  }
});

test("shared highlights do not force an IndexedDB schema upgrade on installed readers", async () => {
  const priorIndexedDb = globalThis.indexedDB;
  const request = {};
  let requestedVersion = null;
  globalThis.indexedDB = {
    open(_name, version) {
      requestedVersion = version;
      setTimeout(() => {
        request.result = {close() {}, transaction() { throw new Error("Not used in this probe."); }};
        request.onsuccess();
      }, 0);
      return request;
    }
  };
  try {
    const store = await app.createBrowserStore(100);
    assert.equal(requestedVersion, 4);
    assert.equal(store.mode, "indexeddb");
  } finally {
    if (priorIndexedDb === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = priorIndexedDb;
  }
});

test("production startup uses a bounded code-only Pages loader instead of an inline application core", () => {
  const frontend = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const boot = fs.readFileSync(path.join(__dirname, "../app/frontend/boot.js"), "utf8");
  const loader = fs.readFileSync(path.join(__dirname, "../app/frontend/static-loader.js"), "utf8");
  const buildScript = fs.readFileSync(path.join(__dirname, "../scripts/build-apps-script.mjs"), "utf8");
  assert.match(frontend, /document\.readyState === "loading"/);
  assert.match(frontend, /addEventListener\("DOMContentLoaded", start, \{once: true\}\)/);
  assert.match(frontend, /document\.getElementById\("appMain"\)\) start\(\)/);
  assert.match(frontend, /setSyncStatus\("Preparing…"\)/);
  assert.match(frontend, /"SERVER_TIMEOUT"/);
  assert.match(boot, /Loading application…/);
  assert.match(boot, /setTimeout\(showRecovery, 8000\)/);
  assert.match(boot, /setTimeout\(showRecovery, 45000\)/);
  assert.match(boot, /Reload reader safely/);
  assert.match(boot, /phase: function phase/);
  assert.match(boot, /fail: function fail/);
  assert.match(loader, /credentials: "omit"/);
  assert.match(loader, /cache: "no-store"/);
  assert.match(loader, /redirect: "error"/);
  assert.match(loader, /candidate\.origin !== ASSET_ORIGIN/);
  assert.match(loader, /candidate\.pathname\.startsWith\(expectedPrefix\)/);
  assert.match(loader, /sha384-/);
  assert.match(loader, /root\.localStorage\.setItem\(CACHE_KEY/);
  assert.match(loader, /root\.DailyBibleReader/);
  assert.match(buildScript, /target: "safari15"/);
  assert.match(buildScript, /target: "safari12"/);
  assert.match(buildScript, /const INLINE_SCRIPT_LINE_LIMIT = 800/);
  assert.match(buildScript, /const MAX_GENERATED_LINE_LENGTH = 1200/);
  assert.match(buildScript, /lineLimit: INLINE_SCRIPT_LINE_LIMIT/);
  assert.match(buildScript, /maximum > MAX_GENERATED_LINE_LENGTH/);
  assert.match(buildScript, /Buffer\.byteLength\(html, "utf8"\)/);
  assert.doesNotMatch(buildScript, /MAX_PRODUCTION_HTML_BYTES/);
  assert.match(buildScript, /const PAGES_ORIGIN = "https:\/\/dcr-cmyk648\.github\.io"/);
  assert.match(buildScript, /delivery:pages-assets-v1/);
  assert.match(buildScript, /static application loader/);
  assert.match(buildScript, /inlineScripts\.length !== 2/);
  assert.match(buildScript, /inlineScripts\.forEach/);
});

test("frontend renders untrusted content without innerHTML sinks", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  assert.equal(/\.innerHTML\s*=|insertAdjacentHTML|document\.write\s*\(/.test(source), false);
  assert.equal(/root\.(?:prompt|confirm)\s*\(/.test(source), false);
  assert.ok(source.includes("textContent"));
  assert.ok(source.includes("beginInlineEdit"));
  assert.ok(source.includes("Confirm retract"));
});

test("HTML shell is semantic, mobile-ready, and includes calendar plus ESV controls", () => {
  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../app/frontend/styles.css"), "utf8");
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<main[^>]*class="page-shell"[^>]*>/);
  assert.match(html, /<h1 id="readingTitle"/);
  assert.match(html, /id="calendarWeeks"/);
  assert.match(html, /id="calendarMonthHeading"/);
  assert.match(html, /id="selectedDayCompletion"/);
  assert.match(html, /id="openSelectedReading"/);
  assert.doesNotMatch(html, /Development only|developmentControls|readingOverride|openOverrideReading/);
  assert.match(html, /id="readingPageIntro"/);
  assert.match(html, /id="readingPageText"/);
  assert.match(html, /id="readingPageCommentary"/);
  assert.match(html, /id="finishReading"/);
  assert.match(html, /data-shared-across-pages="true"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="esvNotice"/);
  assert.match(html, /https:\/\/www\.esv\.org\//);
  assert.equal(/serviceWorker\.register/.test(html), false);
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s);
});

test("icon assets are complete while Apps Script exposes only its supported favicon fallback", () => {
  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../app/frontend/manifest.webmanifest"), "utf8"));
  const buildScript = fs.readFileSync(path.join(__dirname, "../scripts/build-apps-script.mjs"), "utf8");
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="assets\/apple-touch-icon-180\.png"/);
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && /maskable/.test(icon.purpose)));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && /maskable/.test(icon.purpose)));
  assert.match(buildScript, /PAGES_FAVICON_URL = `\$\{PAGES_ORIGIN\}\/daily-bible-reader\/app\/frontend\/assets\/apple-touch-icon-180\.png`/);
  assert.match(buildScript, /html\.replace\(\/\\s\*<link rel="manifest"/);
  assert.match(buildScript, /html\.replace\(\/\\s\*<link rel="apple-touch-icon"/);
  assert.doesNotMatch(buildScript, /data:image\/png;base64/);
  assert.match(buildScript, /__DBR_FAVICON_DATA_URL__/);
});

test("published Pages release is code-only, content-addressed, and integrity-checked", () => {
  const manifestPath = path.join(__dirname, "../web/release.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.schemaVersion, "dbr-static-release/v1");
  assert.equal(manifest.loaderVersion, 1);
  assert.match(manifest.releaseId, /^[a-f0-9]{16}$/);
  for (const [name, asset] of Object.entries(manifest.assets)) {
    assert.equal(asset.name, name);
    assert.match(asset.path, new RegExp(`^releases/${manifest.releaseId}/[^/]+$`));
    const bytes = fs.readFileSync(path.join(__dirname, "../web", asset.path));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(`sha384-${crypto.createHash("sha384").update(bytes).digest("base64")}`, asset.integrity);
  }
  const core = fs.readFileSync(path.join(__dirname, "../web", manifest.assets.core.path), "utf8");
  assert.doesNotMatch(core, /privateDraft|\/__private\/|fixtures\//);
  assert.doesNotMatch(core, /__DBR_BUILD_ID__|__DBR_DELIVERY_MODE__/);
});

test("Apps Script source uses user identity, configured IDs, locking, and no payload logging", () => {
  const code = fs.readFileSync(path.join(__dirname, "../app/apps-script/Code.gs"), "utf8");
  new vm.Script(code, {filename: "Code.gs"});
  assert.match(code, /Session\.getActiveUser\(\)\.getEmail\(\)/);
  assert.match(code, /Session\.getEffectiveUser\(\)\.getEmail\(\)/);
  assert.match(code, /DriveApp\.getFileById\(/);
  assert.match(code, /LockService\.getScriptLock\(\)/);
  assert.match(code, /PropertiesService\.getScriptProperties\(\)/);
  assert.match(code, /PropertiesService\.getUserProperties\(\)/);
  assert.match(code, /function confirmReaderAccess\(readerCode\)/);
  assert.match(code, /CacheService\.getUserCache\(\)/);
  assert.match(code, /ttlSeconds:\s*30/);
  assert.match(code, /\[manifestId, cached\.manifest\.appConfigFileId, cached\.manifest\.planFileId\]/);
  assert.match(code, /DBR_READER_ENROLLMENT/);
  assert.match(code, /readerCodeHash:\s*presentedReaderCodeHash/);
  assert.match(code, /function listHighlights\(readerCode, readingId\)/);
  assert.match(code, /function submitHighlightEvent\(readerCode, payload\)/);
  assert.match(code, /const DBR_HIGHLIGHT_COLUMNS/);
  assert.match(code, /dbrAssertHighlightHeader_/);
  assert.equal(/readerCode:\s*normalizedReaderCode/.test(code), false);
  assert.equal(/console\.(?:log|warn|error)\s*\(/.test(code), false);
  assert.equal(/Logger\.log\s*\(/.test(code), false);
});

test("Apps Script doGet uses only HtmlOutput-supported meta tags", () => {
  const code = fs.readFileSync(path.join(__dirname, "../app/apps-script/Code.gs"), "utf8");
  const allowedNames = new Set([
    "apple-mobile-web-app-capable",
    "google-site-verification",
    "mobile-web-app-capable",
    "viewport"
  ]);
  const observedNames = [];
  let observedFavicon = "";
  const output = {
    evaluate() {
      return this;
    },
    setTitle() {
      return this;
    },
    setFaviconUrl(url) {
      observedFavicon = url;
      return this;
    },
    addMetaTag(name) {
      if (!allowedNames.has(name)) {
        throw new Error(`Unsupported Apps Script meta tag: ${name}`);
      }
      observedNames.push(name);
      return this;
    }
  };
  const context = vm.createContext({
    HtmlService: {
      createHtmlOutputFromFile() {
        return output;
      }
    }
  });

  new vm.Script(`${code}\ndoGet();`, {filename: "Code.gs"}).runInContext(context);
  assert.deepEqual(observedNames, [
    "viewport",
    "apple-mobile-web-app-capable",
    "mobile-web-app-capable"
  ]);
  assert.equal(observedFavicon, "__DBR_FAVICON_DATA_URL__");
});

test("Apps Script accepts both legacy and current commentary metadata during migration", () => {
  const code = fs.readFileSync(path.join(__dirname, "../app/apps-script/Code.gs"), "utf8");
  assert.match(code, /DBR_COMMENTARY_SCHEMA_VERSIONS\s*=\s*\["commentary\/v1", "commentary\/v2", "commentary\/v3"\]/);
  assert.match(code, /DBR_COMMENTARY_SCHEMA_VERSIONS\.includes\(metadata\.schemaVersion\)/);
});

test("Apps Script batches today plus seven prepared readings behind one authorization", () => {
  const code = fs.readFileSync(path.join(__dirname, "../app/apps-script/Code.gs"), "utf8");
  const batch = code.slice(code.indexOf("function getReadingPayloads"), code.indexOf("function dbrBuildReadingPayload_"));
  assert.match(batch, /dbrAuthorizedContext_\(readerCode\)/);
  assert.match(batch, /readingIds\.length > DBR_PRIVATE_BATCH_MAX/);
  assert.match(code, /const DBR_PRIVATE_BATCH_MAX = 8/);
  assert.match(batch, /sourceRegistryFileId/);
  assert.match(batch, /dbrBuildReadingPayload_\(privateState, registry, readingId\)/);
  assert.equal((batch.match(/dbrReadPrivateState_/g) || []).length, 1);
});

test("frontend source contains no ESV key, alternate translation, or real passage payload", () => {
  const files = ["app/frontend/index.html", "app/frontend/app.js", "app/frontend/styles.css"];
  const source = files.map((file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8")).join("\n");
  assert.equal(/ESV_API_KEY|Authorization:\s*["']Token\s+[A-Za-z0-9]/.test(source), false);
  assert.equal(/\b(?:KJV|NIV|BSB|WEB)\b/.test(source), false);
  assert.equal(/In the beginning, God created|Let there be light/i.test(source), false);
});

test("versioned update links are restricted to Apps Script deployment URLs", () => {
  const build = "0123456789abcdef";
  assert.equal(
    app.safeVersionedAppUrl("https://script.google.com/macros/s/DEPLOYMENT_123/exec", build),
    `https://script.google.com/macros/s/DEPLOYMENT_123/exec?appBuild=${build}`
  );
  assert.equal(app.safeVersionedAppUrl("https://example.com/reader", build), null);
  assert.equal(app.safeVersionedAppUrl("javascript:alert(1)", build), null);
  assert.equal(app.safeVersionedAppUrl("https://script.google.com/macros/s/DEPLOYMENT_123/exec", "not-a-build"), null);
});

test("private offline commentary expires and is plan-version scoped", () => {
  const now = Date.parse("2026-08-08T16:00:00Z");
  const record = {
    payload: {commentary: {readingId: "GEN-001"}},
    planVersion: "pilot-genesis-v1",
    expiresAt: "2026-08-15T16:00:00Z"
  };
  assert.equal(app.privateRecordIsFresh(record, now, "pilot-genesis-v1"), true);
  assert.equal(app.privateRecordIsFresh(record, now, "different-plan"), false);
  assert.equal(app.privateRecordIsFresh(record, Date.parse("2026-08-15T16:00:00Z"), "pilot-genesis-v1"), false);
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  assert.match(source, /mock-private-draft/);
  assert.match(source, /!record\.cacheContext && context === "apps-script"/);
});

test("cached bootstrap is time-limited and bound to the saved reader identity", () => {
  const now = Date.parse("2026-08-08T16:00:00Z");
  const record = {
    readingId: "__app-bootstrap__",
    schemaVersion: "bootstrap-cache/v1",
    authorId: "dustin",
    expiresAt: "2026-08-15T16:00:00Z",
    payload: {session: {authorId: "dustin", displayName: "Dustin"}}
  };
  assert.equal(app.bootstrapRecordIsFresh(record, now, {authorId: "dustin"}), true);
  assert.equal(app.bootstrapRecordIsFresh(record, now, {authorId: "shane"}), false);
  assert.equal(app.bootstrapRecordIsFresh(record, Date.parse(record.expiresAt), {authorId: "dustin"}), false);
});

test("content readiness requires every end-to-end study component and exposes the first gap", () => {
  const entry = (readingId, dayIndex) => ({
    readingId,
    dayIndex,
    kind: "chapter",
    bookId: "NAM",
    chapter: 1,
    passages: [{bookId: "NAM", chapter: 1, verseCount: 2}]
  });
  const sourceIds = ["source-one", "source-two"];
  const ready = (planEntry) => ({
    commentary: {
      schemaVersion: "commentary/v3",
      commentaryVersion: `${planEntry.readingId}-v1`,
      readingId: planEntry.readingId,
      publicationStatus: "draft",
      dailyIntroduction: {
        markdown: "Nahum addresses God's patient justice and dependable refuge. Read the chapter as one argument in which judgment on violent power and safety for those who trust God belong together.",
        sourceIds
      },
      commentarySummary: {paragraphs: [{
        markdown: "The chapter deliberately holds divine patience, power, judgment, and protection together. Its storm imagery is theological rather than decorative: no imperial strength can resist God, yet the same Judge knows those who take refuge in him.",
        sourceIds
      }]},
      practicalTakeaway: {markdown: "Bring one present fear under God's trustworthy rule today.", sourceIds: ["source-one"]},
      verseOfTheDay: {bookId: "NAM", chapter: 1, verse: 1},
      comprehensiveSynthesis: {
        markdown: Array.from({length: 12}, () => "Nahum's opening poem places the fall of predatory power within the character of the covenant God, joining moral seriousness to concrete refuge for faithful people.").join(" "),
        sourceIds
      },
      verseCommentary: {
        schema_version: "mhc-runtime/v1",
        source_id: "fabricated-henry-fixture",
        source_version: "test-v1",
        source_archive_sha256: "b".repeat(64),
        source_manifest_ref: "FABRICATED TEST SOURCE",
        worker_model: "test",
        prompt_version: "test-v1",
        generation_timestamp: "2026-08-10T12:00:00Z",
        validation_status: "valid",
        review_status: "approved",
        label: "Matthew Henry — condensed paraphrase",
        book_id: "NAM",
        chapter: 1,
        source_layer_note: "Fabricated source excerpts support this test-only condensation.",
        source_atoms: {
          atom1: {source_unit_id: "unit1", source_reference_label: "Test unit 1", text: "Fabricated commentary source text for the first verse."},
          atom2: {source_unit_id: "unit2", source_reference_label: "Test unit 2", text: "Fabricated commentary source text for the second verse."}
        },
        records: {
          "NAM.1.1": {
            blurb: "Henry connects divine rule with practical confidence under pressure.",
            scope_note: "Direct test note.",
            source_unit_ids: ["unit1"],
            source_atom_ids: ["atom1"],
            source_reference_label: "Test unit 1"
          },
          "NAM.1.2": {
            blurb: "Henry treats judgment as morally serious rather than arbitrary force.",
            scope_note: "Direct test note.",
            source_unit_ids: ["unit2"],
            source_atom_ids: ["atom2"],
            source_reference_label: "Test unit 2"
          }
        }
      },
      coverage: {consultedCount: 2, includedCount: 2},
      generation: {humanReviewStatus: "approved", contentHash: "a".repeat(64)}
    },
    sources: sourceIds.map((sourceId) => ({
      sourceId,
      title: `Fabricated ${sourceId}`,
      urlOrCitation: `https://example.test/${sourceId}`
    }))
  });
  const placeholder = {commentary: {
    readingId: "CC-Y3Q4-D057",
    publicationStatus: "placeholder",
    generation: {humanReviewStatus: "not_started", contentHash: null}
  }};
  const first = entry("CC-Y3Q4-D054", 1);
  const complete = ready(first);
  assert.equal(app.readingContentIsPrepared(complete, first), true);
  assert.deepEqual(app.readingPreparationReport(complete, first).missingComponentIds, []);
  assert.equal(app.readingContentIsPrepared(placeholder, first), false);
  const missingHenry = structuredClone(complete);
  delete missingHenry.commentary.verseCommentary;
  assert.equal(app.readingContentIsPrepared(missingHenry, first), false);
  assert.ok(app.readingPreparationReport(missingHenry, first).missingComponentIds.includes("henry"));
  missingHenry.commentary.henrySourceLink = {
    sourceId: "source-one",
    title: "Read the fabricated full commentary",
    url: "https://example.test/henry/full",
    note: "A verified full public-domain link replaces the unavailable test-only condensation."
  };
  assert.equal(app.readingContentIsPrepared(missingHenry, first), true);
  assert.equal(app.readingPreparationReport(missingHenry, first).components.find((component) => component.id === "henry").ready, true);
  const missingFullSource = structuredClone(complete);
  delete missingFullSource.commentary.verseCommentary.source_atoms.atom1;
  assert.equal(app.readingContentIsPrepared(missingFullSource, first), false);
  const missingSources = structuredClone(complete);
  missingSources.sources = [];
  assert.equal(app.readingContentIsPrepared(missingSources, first), false);
  const reviewRejected = structuredClone(complete);
  reviewRejected.commentary.generation.humanReviewStatus = "changes_requested";
  assert.equal(app.readingContentIsPrepared(reviewRejected, first), false);
  assert.equal(app.privatePayloadNeedsBlockingRefresh(placeholder), true);
  assert.equal(app.privatePayloadNeedsBlockingRefresh(complete), false);
  const revised = structuredClone(complete);
  revised.commentary.generation.contentHash = "c".repeat(64);
  assert.notEqual(app.privatePayloadRevision(complete), app.privatePayloadRevision(revised));
  const revisedHenry = structuredClone(complete);
  revisedHenry.commentary.verseCommentary.generation_timestamp = "2026-08-11T13:18:26.238Z";
  assert.notEqual(app.privatePayloadRevision(complete), app.privatePayloadRevision(revisedHenry));
  assert.equal(app.readingContentIsPrepared(null), false);

  const entries = [54, 55, 56, 57].map((day) => entry(`CC-Y3Q4-D0${day}`, day - 53));
  const payloads = new Map([
    [entries[0].readingId, ready(entries[0])],
    [entries[1].readingId, ready(entries[1])],
    [entries[2].readingId, placeholder],
    [entries[3].readingId, ready(entries[3])]
  ]);
  const readiness = app.evaluateContentReadiness(entries, payloads, 0, 3);
  assert.equal(readiness.consecutiveReady, 2);
  assert.equal(readiness.state, "warning");
  assert.equal(readiness.nextGapEntry.readingId, entries[2].readingId);
  assert.ok(readiness.nextGapReport.missingComponentIds.includes("orientation"));
  assert.equal(app.evaluateContentReadiness(entries, payloads, 2, 3).state, "critical");
  assert.equal(app.evaluateContentReadiness(entries, payloads, 3, 3).state, "green");
  assert.deepEqual(app.evaluateContentReadiness(entries, payloads, entries.length, 3), {
    consecutiveReady: 0,
    target: 0,
    readyThroughEntry: null,
    nextGapEntry: null,
    nextGapReport: null,
    reports: [],
    state: "green"
  });

  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  assert.match(source, /The first later gap is \$\{gapDescription\}/);
  assert.match(source, /offlineStatus\.dataset\.state = contentCount === windowEntries\.length/);
  assert.doesNotMatch(source, /Tomorrow's full study is not yet prepared/);
  assert.match(source, /contentDiagnosticsArePrivateToOwner/);
  assert.match(source, /async function revalidateOpenReading\(entry\)/);
  assert.match(source, /Study updated to the newest version/);
});

test("selected calendar days show a validated reference and may render session-memory ESV", () => {
  const entry = {
    readingId: "CC-Y3Q4-D055",
    kind: "chapter",
    passages: [{bookId: "MIC", chapter: 5, verseCount: 15}]
  };
  const payload = {commentary: {readingId: entry.readingId, verseOfTheDay: {bookId: "MIC", chapter: 5, verse: 2}}};
  assert.deepEqual(app.selectedDayVerseSelection(payload, entry), {bookId: "MIC", chapter: 5, verse: 2});
  assert.equal(app.selectedDayVerseSelection({commentary: {readingId: entry.readingId, verseOfTheDay: {bookId: "MIC", chapter: 6, verse: 1}}}, entry), null);
  assert.equal(app.selectedDayVerseSelection({commentary: {readingId: "CC-Y3Q4-D054", verseOfTheDay: {bookId: "MIC", chapter: 5, verse: 2}}}, entry), null);
  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  assert.match(html, /id="selectedDayVerse"/);
  assert.ok(html.indexOf('id="selectedDayVerse"') < html.indexOf('id="openSelectedReading"'));
  assert.match(html, /id="selectedDayVerseText"/);
  assert.match(html, /id="selectedDayVerseNotice"/);
  assert.match(source, /verseTextFromScripture\(scripture, selection\)/);
  assert.match(source, /ESV · prefetched in memory for this session/);
  assert.doesNotMatch(source, /The exact ESV wording appears after you open the reading/);
});

test("today and tomorrow are the only priority warm readings", () => {
  const entries = [1, 2, 3, 4].map((dayIndex) => ({readingId: `TEST-${dayIndex}`, dayIndex, kind: "chapter"}));
  const plan = {entries};
  assert.deepEqual(app.priorityReadingEntries(plan, {status: "active", calendarDayIndex: 2}).map((entry) => entry.readingId), [
    "TEST-2",
    "TEST-3"
  ]);
  assert.deepEqual(app.priorityReadingEntries(plan, {status: "before_start", calendarDayIndex: -2}).map((entry) => entry.readingId), [
    "TEST-1",
    "TEST-2"
  ]);
  assert.deepEqual(app.priorityReadingEntries(plan, {status: "pilot_complete", calendarDayIndex: 5}), []);

  const scripture = {
    translation: "ESV",
    passages: [{bookId: "MIC", chapter: 5, passage: "[1] First.\n\n[2] Selected verse."}]
  };
  assert.equal(app.verseTextFromScripture(scripture, {bookId: "MIC", chapter: 5, verse: 2}), "Selected verse.");
  assert.equal(app.verseTextFromScripture(scripture, {bookId: "MIC", chapter: 6, verse: 2}), "");
  const mock = {
    isMock: true,
    translation: "MOCK",
    passages: [{bookId: "PRO", chapter: 31, verseStart: 10, verses: ["Fabricated ten.", "Fabricated eleven."]}]
  };
  assert.equal(app.verseTextFromScripture(mock, {bookId: "PRO", chapter: 31, verse: 11}), "Fabricated eleven.");

  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  assert.match(source, /const HOT_READING_COUNT = 2/);
  assert.match(source, /scriptureMemoryByReadingId: new Map\(\)/);
  assert.match(source, /async function warmPriorityWindow\(\)/);
  assert.match(source, /state\.adapter\.getReadingPayloads/);
  const priorityWarmSource = source.slice(
    source.indexOf("async function warmPriorityWindow()"),
    source.indexOf("async function prefetchOfflineWindow()")
  );
  assert.match(priorityWarmSource, /getReadingPayloads\(entries\.map\(\(entry\) => entry\.readingId\)\)/);
  assert.match(priorityWarmSource, /private-content revision cannot remain hidden behind the offline retention window/);
  assert.doesNotMatch(priorityWarmSource, /renderContentReadiness\(/);
  assert.match(priorityWarmSource, /scripturePrefetchPassageIndex\(entry, state\.plan\.bookMetrics, state\.policy\)/);
  assert.match(priorityWarmSource, /retainFullPassage: false/);
  assert.match(priorityWarmSource, /persist: false/);
  assert.doesNotMatch(priorityWarmSource, /missingPayloads/);
  const offlineWarmSource = source.slice(
    source.indexOf("async function prefetchOfflineWindow()"),
    source.indexOf("function scheduleOfflinePrefetch()")
  );
  assert.match(offlineWarmSource, /getReadingPayloads\(readingIds\)/);
  assert.match(offlineWarmSource, /preparedEntries\.map\(\(entry\) => entry\.readingId\)/);
  assert.match(offlineWarmSource, /Revalidate the whole current-plus-seven window/);
  assert.match(offlineWarmSource, /let authenticatedPayloadWindow = false/);
  assert.match(offlineWarmSource, /authenticatedPayloadWindow = true/);
  assert.match(offlineWarmSource, /if \(authenticatedPayloadWindow\) \{\s*renderContentReadiness\(currentContentReadiness\(payloadByReadingId\)\)/);
  assert.match(offlineWarmSource, /scriptureRetentionTargetCount/);
  assert.match(offlineWarmSource, /keep the first chapter ready and stream later chapters/);
  assert.doesNotMatch(offlineWarmSource, /missingEntries/);
  assert.match(source, /state\.adapter\.listComments/);
  assert.match(source, /getScriptureForReading\(entry, \{/);
  assert.match(source, /scriptureMemoryOnly: false/);
  assert.match(source, /scripturePersistentEntries: scripture\.length/);
});

test("startup diagnostics are session-only and strip unapproved fields", () => {
  const snapshot = app.startupTimingSnapshot({
    schemaVersion: "startup-timing/v1",
    milestones: {
      shellVisible: 10.2,
      applicationCodeLoaded: 30.6,
      cachedCalendarVisible: 55.1,
      authorizationConfirmed: 100.4,
      freshDataSynchronized: 140.8,
      scriptureVisible: 190.2,
      privateCommentBody: 999
    }
  });
  assert.equal(snapshot.sessionOnly, true);
  assert.equal(snapshot.elapsedMs.shellVisible, 10);
  assert.equal(snapshot.phaseDurationsMs.shellToApplicationCode, 21);
  assert.equal(snapshot.phaseDurationsMs.calendarToAuthorization, 45);
  assert.equal(snapshot.phaseDurationsMs.authorizationToFreshSync, 41);
  assert.equal(Object.hasOwn(snapshot.elapsedMs, "privateCommentBody"), false);
  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  assert.match(html, /Startup timings reset on every launch, stay in memory, and are never sent anywhere/);
});

test("every production RPC accepts the reader code as its first argument while enrollment may satisfy it", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  ["getBootstrapData", "getReadingPayload", "getReadingPayloads", "getScripture", "listComments", "listCommentActivity", "submitCommentEvent", "listHighlights", "submitHighlightEvent", "forgetReaderEnrollment"].forEach((name) => {
    assert.match(source, new RegExp(`appsScriptRpc\\(\\s*\"${name}\",\\s*state\\.readerCode`));
  });
});

test("reader-code gate recognizes complete pasted values and rejects incomplete input", () => {
  assert.equal(app.readerCodeLooksReady("short"), false);
  assert.equal(app.readerCodeLooksReady(" 123456789012 "), true);
  assert.equal(app.readerCodeLooksReady(`12345678901\n2`), false);
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  assert.match(source, /\["input", "change", "keyup"\]/);
  assert.match(source, /addEventListener\("paste"/);
  assert.match(source, /navigator\.storage\.persist\(\)/);
});

test("clear-data flow resets the visible offline-pack status", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  assert.match(source, /offlinePackStatus"\)\.textContent = "Downloaded reading data cleared\./);
  assert.match(source, /const credential = await state\.store\.get\("deviceCredentials", "reader-code"\);[\s\S]*state\.store\.clearAll\(\);[\s\S]*state\.store\.put\("deviceCredentials", credential\)/);
  assert.match(source, /async function forgetReaderAccess\(\)/);
  assert.match(source, /state\.adapter\.forgetReaderEnrollment\(\)/);
});

test("daily page puts one uninterrupted executive synthesis first and exposes cited deep-study sections after discussion", () => {
  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const orderedIds = ["overviewContent", "historicalContextPreviewDisclosure", "scriptureSection", "commentarySummary", "verseOfDaySection", "practicalTakeaway", "mainSourceDisclosure", "discussionCard", "finishReading", "historicalContextPanel", "historicalContextDisclosure", "historicalContextSourceDisclosure", "extendedStudy", "comprehensiveSynthesis", "deepSourceDisclosure", "sourceAuditDisclosure", "sourceList"];
  const positions = orderedIds.map((id) => html.indexOf(`id="${id}"`));
  positions.forEach((position) => assert.ok(position >= 0));
  for (let index = 1; index < positions.length; index += 1) assert.ok(positions[index] > positions[index - 1]);
  assert.match(html, /<article id="commentarySummary"/);
  assert.match(html, /class="extended-study-panel"/);
  assert.match(html, /<details id="sourceAuditDisclosure"/);
  assert.match(html, /<details id="mainSourceDisclosure"/);
  assert.equal(/<details id="sourceAuditDisclosure"[^>]*\sopen(?:\s|>)/.test(html), false);
  assert.match(appSource, /renderSourceCitations\(dailyIntroduction\.sourceIds/);
  assert.match(appSource, /renderCommentarySummary\(commentarySummary\)/);
  assert.match(appSource, /node\.textContent = withoutInlineCitations\(paragraph\.markdown\)/);
  assert.match(appSource, /const mainPageCitationIndex = buildPageCitationIndex/);
  assert.match(appSource, /const deepPageCitationIndex = buildPageCitationIndex/);
  assert.doesNotMatch(appSource, /appendNumberedCitations\(element\("practicalTakeaway"\)/);
  assert.match(appSource, /renderComprehensiveSections\(comprehensive, deepCitationIndex\)/);
  assert.match(appSource, /renderHistoricalContextPanels\(comprehensivePartition\.context, sources \|\| \[\]\)/);
  assert.match(appSource, /renderSafeMarkdown\(section\.markdown, body, citationIndex\)/);
  assert.match(appSource, /renderDeepSourceNotes\(deepCitationIndex\)/);
  assert.match(html, /<ul id="mainSourceNotes"/);
  assert.match(appSource, /disclosure\.className = "deep-dive-disclosure"/);
  assert.doesNotMatch(appSource, /commentary-summary-paragraph/);
  assert.doesNotMatch(html, /Key commentary insights/);
  const css = fs.readFileSync(path.join(__dirname, "../app/frontend/styles.css"), "utf8");
  assert.match(css, /\.commentary-summary,\s*\n\.commentary-body,\s*\n\.takeaway-content\s*\{\s*\n\s*font-family:\s*Georgia/);
  assert.match(appSource, /link\.target = "_blank";/);
  assert.match(appSource, /link\.rel = "noopener noreferrer";/);
});

test("Page 3 derives a selected verse from live Scripture without storing provider wording", () => {
  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  const frontend = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "../schemas/commentary.schema.json"), "utf8"));
  const fabricated = "[1] Fabricated first verse.\n\n[2] Fabricated second verse,\nwith a preserved line.\n\n[3] Fabricated third verse.";
  assert.equal(app.extractNumberedVerseText(fabricated, 2), "Fabricated second verse,\nwith a preserved line.");
  assert.equal(app.extractNumberedVerseText(fabricated, 4), "");
  const entry = {kind: "chapter", passages: [{bookId: "MIC", chapter: 3, verseCount: 12}, {bookId: "MIC", chapter: 4, verseCount: 13}]};
  assert.deepEqual(app.normalizedVerseOfTheDay({bookId: "MIC", chapter: 4, verse: 5}, entry), {bookId: "MIC", chapter: 4, verse: 5});
  assert.equal(app.normalizedVerseOfTheDay({bookId: "MIC", chapter: 5, verse: 1}, entry), null);
  assert.equal(app.verseReferenceLabel({bookId: "MIC", chapter: 4, verse: 5}), "Micah 4:5");
  assert.match(html, /<blockquote id="verseOfDayText"/);
  assert.match(html, /id="verseOfDayNotice"/);
  assert.match(frontend, /renderVerseOfTheDay\(scripture\)/);
  assert.match(frontend, /extractNumberedVerseText\(passage\.passage, selection\.verse\)/);
  assert.deepEqual(Object.keys(schema.properties.verseOfTheDay.properties), ["bookId", "chapter", "verse"]);
  assert.equal(Object.hasOwn(schema.properties.verseOfTheDay.properties, "text"), false);
});

test("comprehensive Markdown becomes individually selectable passage-specific sections", () => {
  const sections = app.splitComprehensiveSections(
    "## Comprehensive synthesis\n\n### Authority under judgment\n\nFirst body.\n\n### Peace after judgment\n\nSecond body."
  );
  assert.deepEqual(sections, [
    {title: "Authority under judgment", markdown: "First body."},
    {title: "Peace after judgment", markdown: "Second body."}
  ]);
});

test("historical context keeps concise and expanded layers independent while removing both from Page 3", () => {
  const markdown = "### Literary movement\n\nA reading-focused observation.{{cite:literary_source,shared_source}}\n\n### Archaeological and historical context\n\nA concise historical orientation.{{cite:preview_source}}\n\n### Archaeological and historical context — expanded study\n\n#### Material setting\n\nA fuller historical discussion.{{cite:expanded_source,shared_source}}\n\n#### Evidence and inference\n\nA distinct evidence boundary.{{cite:expanded_source}}\n\n### Canonical connections\n\nA canonical observation.{{cite:canonical_source}}";
  const partition = app.partitionComprehensiveSynthesis({
    markdown,
    sourceIds: ["literary_source", "preview_source", "expanded_source", "shared_source", "canonical_source"]
  });
  assert.match(partition.context.preview.markdown, /concise historical orientation/);
  assert.deepEqual(partition.context.preview.sourceIds, ["preview_source"]);
  assert.match(partition.context.expanded.markdown, /fuller historical discussion/);
  assert.deepEqual(partition.context.expanded.sourceIds, ["expanded_source", "shared_source"]);
  assert.equal(partition.comprehensive.markdown.includes("Archaeological and historical context"), false);
  assert.equal(partition.comprehensive.markdown.includes("preview_source"), false);
  assert.equal(partition.comprehensive.markdown.includes("expanded_source"), false);
  assert.deepEqual(partition.comprehensive.sourceIds, ["literary_source", "shared_source", "canonical_source"]);
  const noContext = app.partitionComprehensiveSynthesis({markdown: "### Literary movement\n\nOnly this section.", sourceIds: ["literary_source"]});
  assert.equal(noContext.context.preview, null);
  assert.equal(noContext.context.expanded, null);
  assert.equal(noContext.comprehensive.markdown, "### Literary movement\n\nOnly this section.");
  const legacyPreview = app.partitionComprehensiveSynthesis({
    markdown: "### Archaeological and historical context\n\nA legacy concise context.{{cite:preview_source}}",
    sourceIds: ["preview_source"]
  });
  assert.match(legacyPreview.context.preview.markdown, /legacy concise context/);
  assert.equal(legacyPreview.context.expanded, null);

  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const previewPosition = html.indexOf('id="historicalContextPreviewDisclosure"');
  const contextPosition = html.indexOf('id="historicalContextPanel"');
  assert.ok(previewPosition > html.indexOf('id="overviewSources"'));
  assert.ok(previewPosition < html.indexOf('id="discussionCard"'));
  assert.ok(contextPosition > html.indexOf('id="discussionCard"'));
  assert.ok(contextPosition > html.indexOf('id="finishReading"'));
  assert.ok(contextPosition < html.indexOf('id="extendedStudy"'));
  assert.match(html, /<details id="historicalContextPreviewDisclosure"[^>]*hidden>/);
  assert.match(html, /<section id="historicalContextPanel"[^>]*hidden>/);
  assert.match(html, /<details id="historicalContextDisclosure" class="deep-dive-disclosure">/);
  assert.match(html, /<details id="historicalContextSourceDisclosure" class="deep-source-disclosure">/);
  assert.match(source, /renderSafeMarkdown\(context\.expanded\.markdown, element\("historicalContextContent"\), contextCitationIndex\)/);
  assert.match(source, /renderSafeMarkdown\(withoutInlineCitations\(context\.preview\.markdown\), element\("historicalContextPreviewContent"\)\)/);
  assert.match(source, /renderSourceCitations\(context\.preview\.sourceIds, sources \|\| \[\], element\("historicalContextPreviewSources"\)\)/);
  assert.match(source, /"historicalContextSourceDisclosure",\n\s+"historical-context-source-note"/);
  assert.match(source, /historicalContextPanel\.hidden = nextPage !== 0 \|\| historicalContextPanel\.dataset\.available !== "true"/);
  assert.match(source, /historicalContextPreview\.hidden = nextPage !== 0 \|\| historicalContextPreview\.dataset\.available !== "true"/);
  assert.match(source, /preview\.hidden = true;\n\s*preview\.open = false;/);
  assert.match(source, /preview\.open = false;\n\s*delete preview\.dataset\.available;/);
  assert.match(source, /element\("historicalContextPreviewDisclosure"\)\.open = false;/);
  assert.match(source, /clearHistoricalContextPanel\(\);/);
});

test("editorial contract requires practical prose and confessional evidentiary weighting", () => {
  const stance = fs.readFileSync(path.join(__dirname, "../docs/EDITORIAL_STANCE.md"), "utf8");
  const workflow = fs.readFileSync(path.join(__dirname, "../docs/COMMENTARY_WORKFLOW.md"), "utf8");
  const validator = fs.readFileSync(path.join(__dirname, "../scripts/validate-private-content.mjs"), "utf8");
  assert.match(stance, /Use plain, precise language/);
  assert.match(stance, /must stand alone in the context of that day's Scripture/);
  assert.match(stance, /practical payoff clear/);
  assert.match(stance, /Methodological naturalism is not a neutral baseline/);
  assert.match(stance, /predictive prophecy is impossible/);
  assert.match(stance, /very strong positive evidence/);
  assert.match(workflow, /pretentious diction or tightly packed jargon/);
  assert.match(workflow, /Make the payoff explicit/);
  assert.match(workflow, /Source breadth does not imply equal epistemic weight/);
  assert.match(workflow, /must not force every included contextual or counterposition source into the main path/);
  assert.match(workflow, /assumed prophecy, miracle, or divine action was impossible/);
  assert.match(stance, /church-confessional and Christian academic sources/);
  assert.match(stance, /must never mention internal “rules,” prompts, source quotas, or editorial instructions/);
  assert.match(stance, /Default to an achievable inward focus/);
  assert.match(stance, /Reject vague moral heroics such as “fix an injustice,”/);
  assert.match(workflow, /attitude, temptation, motive, habit of attention, or response to watch in oneself/);
  assert.match(workflow, /aimed mainly at correcting other people/);
  assert.match(stance, /contextReadingIds/);
  assert.match(workflow, /do not manufacture neutrality or spend the reader's time on fringe catalogues/);
  assert.match(workflow, /do not repeat the same background dispute chapter after chapter/);
  assert.match(validator, /DEPENDENT_CROSS_REFERENCE/);
  assert.match(validator, /summaryParagraphs\.map\(\(paragraph\) => paragraph\.markdown\)\.join\("\\n\\n"\)/);
  assert.match(validator, /executive synthesis needs 2–6 connected prose paragraphs/);
  assert.match(validator, /executive synthesis must contain 220–600 words/);
  assert.match(validator, /const readings = plan\.entries\.map/);
  assert.match(validator, /substantive: true/);
  assert.match(validator, /prepared: entry\.sourcePlanDay >= 57/);
  assert.match(validator, /const preparedCount = readings\.filter/);
  assert.match(validator, /const synthesisCount = readings\.filter/);
  assert.match(validator, /externalSchemas: \{"mhc-runtime\.schema\.json": mhcRuntimeSchema\}/);
  assert.match(validator, /attached verse commentary must cover every configured verse exactly once/);
  assert.match(validator, /reviewed Matthew Henry shards or a verified full-commentary link/);
  assert.match(validator, /HISTORICAL_CONTEXT_PREVIEW_HEADING/);
  assert.match(validator, /HISTORICAL_CONTEXT_EXPANDED_HEADING/);
  assert.match(validator, /function validateHistoricalContextDepth/);
  assert.match(validator, /prepared historical-context preview requires an expanded study/);
  assert.match(validator, /historical-context preview and expanded study must use distinct prose/);
  assert.match(validator, /expanded historical context must add materially more depth/);
  assert.match(validator, /at least two distinct H4 topical subheadings/);
  assert.match(validator, /expanded historical context needs inline citation markers/);
  assert.doesNotMatch(validator, /main all-sources synthesis must cite every included source/);
});

test("the daily synthesis hides provenance markers while deep citations reveal and focus source notes", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  const validator = fs.readFileSync(path.join(__dirname, "../scripts/validate-private-content.mjs"), "utf8");
  assert.match(source, /function appendInlineCitedText\(container, markdown, citationIndex\)/);
  assert.match(source, /function withoutInlineCitations\(markdown\)/);
  assert.match(source, /node\.textContent = withoutInlineCitations\(paragraph\.markdown\)/);
  assert.match(source, /function buildPageCitationIndex\(summary, practicalTakeaway, comprehensive, sources\)/);
  assert.match(source, /\{\\\{cite:/);
  assert.match(source, /disclosure\.open = true;/);
  assert.match(source, /link\.href = `#\$\{citationIndex\.noteIdPrefix\}-\$\{number\}`/);
  assert.match(source, /note\.scrollIntoView\(\{block: "center"\}\);/);
  assert.match(source, /note\.focus\(\{preventScroll: true\}\);/);
  assert.match(source, /function normalizedComprehensiveSynthesis\(commentary, isBookIntroduction\)/);
  assert.match(html, /id="deepSourceDisclosure"/);
  assert.match(html, /id="deepSourceNotes"/);
  assert.match(html, /Sources informing the daily synthesis/);
  assert.match(validator, /prepared comprehensive inline citations must cover its declared source set/);
});

test("the entire application uses an explicit dark palette with readable controls", () => {
  const css = fs.readFileSync(path.join(__dirname, "../app/frontend/styles.css"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  assert.match(css, /:root\s*\{\s*color-scheme:\s*dark;/);
  assert.equal(/prefers-color-scheme:\s*dark/.test(css), false);
  assert.match(css, /\.status-pill,\s*\.coverage-indicator\s*\{[\s\S]*?color:\s*#dceae4;/);
  assert.match(css, /\.major-disclosure > summary\s*\{\s*color:\s*#dceae4;/);
  assert.match(css, /button\s*\{[\s\S]*?color:\s*#e5f1ec;/);
  assert.match(css, /a\s*\{\s*color:\s*#a3d7c4;/);
  assert.match(html, /<meta name="color-scheme" content="dark">/);
  assert.match(html, /<meta name="theme-color" content="#0b1110">/);
});

test("calendar completion is batched and each opened reading background-syncs its discussion", () => {
  const frontend = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "../app/apps-script/Code.gs"), "utf8");
  assert.match(frontend, /async function syncCalendarCompletion\(\)/);
  assert.match(frontend, /state\.adapter\.listCommentActivity\(readingIds\)/);
  assert.match(frontend, /state\.calendarWindow\.days\.filter\(\(day\) => day\.entry\)/);
  assert.doesNotMatch(frontend, /state\.calendarWindow\.days\.filter\(\(day\) => day\.entry && day\.accessible\)/);
  assert.match(frontend, /refreshComments\(\{background: true, readingId: entry\.readingId\}\)/);
  assert.match(server, /function listCommentActivity\(readerCode, readingIds\)/);
  assert.match(server, /readingIds\.length > 42/);
  assert.match(server, /completedByReadingId:/);
  assert.match(frontend, /state\.calendarParticipants/);
});

test("confirmed access refreshes progress before a delayed batched offline preparation", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const startup = source.slice(source.indexOf("function startConfirmedBackgroundWork()"), source.indexOf("async function confirmServerAccess"));
  assert.ok(startup.indexOf("syncCalendarCompletion().catch") < startup.indexOf("scheduleOfflinePrefetch();"));
  assert.match(source, /getReadingPayloads: \(readingIds\) => appsScriptRpc\("getReadingPayloads"/);
  assert.match(source, /state\.adapter\.getReadingPayloads\(readingIds\)/);
  assert.match(source, /function scheduleOfflinePrefetch\(\)[\s\S]*?requestIdleCallback[\s\S]*?setTimeout/);
  assert.match(source, /function showHome\(options\)[\s\S]*?resumeOnlineWork\(\)/);
  assert.match(source, /addEventListener\("pageshow", resumeApplication\)/);
  assert.match(source, /addEventListener\("visibilitychange"[\s\S]*?visibilityState === "visible"[\s\S]*?resumeApplication\(\)/);
  assert.match(source, /if \(state\.calendarSyncPromise\) return state\.calendarSyncPromise/);
});

test("a suspended installed reader advances the selected day at Detroit midnight", () => {
  assert.equal(app.calendarDateInTimeZone("2026-08-21T03:59:00.000Z", "America/Detroit"), "2026-08-20");
  assert.equal(app.calendarDateInTimeZone("2026-08-21T04:01:00.000Z", "America/Detroit"), "2026-08-21");
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const refresh = source.slice(source.indexOf("function refreshCurrentCalendarDate()"), source.indexOf("function showHome(options)"));
  assert.match(refresh, /state\.activeCalendarDate === todayDate/);
  assert.match(refresh, /state\.schedule = calculateSchedule\(state\.plan, state\.config, now\)/);
  assert.match(refresh, /state\.calendarMonthDate = dateOnlyFromParts/);
  assert.match(refresh, /state\.selectedCalendarDate = todayDate/);
  assert.match(source, /function resumeApplication\(\)[\s\S]*?refreshCurrentCalendarDate\(\)[\s\S]*?renderCalendar\(\)/);
  assert.match(source, /root\.addEventListener\("online", resumeApplication\)/);
  assert.match(source, /root\.addEventListener\("pageshow", resumeApplication\)/);
});

test("mobile comment composition keeps direct text focus and cannot be stolen by late reading setup", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../app/frontend/styles.css"), "utf8");
  const loadReading = source.slice(source.indexOf("async function loadReading"), source.indexOf("async function warmPriorityWindow"));
  assert.match(html, /id="commentBody"[^>]*inputmode="text"[^>]*autocapitalize="sentences"/);
  assert.match(css, /textarea\s*\{[\s\S]*?touch-action:\s*auto;[\s\S]*?user-select:\s*text;/);
  assert.match(source, /function focusCommentComposer\(\)[\s\S]*?composer\.focus\(\)/);
  assert.match(source, /commentBody\.addEventListener\("pointerup", focusCommentComposer\)/);
  assert.ok(loadReading.indexOf("await loadDraft(entry.readingId)") < loadReading.indexOf("readingPayloadWithCache(entry.readingId)"));
  assert.doesNotMatch(loadReading, /readingTitle"\)\.focus/);
});

test("page changes expose the active reading step below any visible app header", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  const navigation = source.slice(source.indexOf("function setReadingPage"), source.indexOf("function refreshCurrentCalendarDate"));
  assert.match(html, /id="readingProgress" class="reading-progress"/);
  assert.match(navigation, /progress\.getBoundingClientRect\(\)\.top/);
  assert.match(navigation, /appHeader\.getBoundingClientRect\(\)\.bottom/);
  assert.match(navigation, /root\.scrollTo\(\{top: Math\.max\(0, targetTop\), behavior: "auto"\}\)/);
  assert.doesNotMatch(navigation, /heading\.scrollIntoView/);
});

test("cached calendar and commentary render before background authorization while writes stay gated", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  assert.match(source, /cachedBootstrapForCredential\(credential\)[\s\S]*?installBootstrap\(cached, \{cached: true\}\)[\s\S]*?confirmServerAccess/);
  assert.match(source, /function serverCallsAllowed\(\)/);
  assert.match(source, /async function flushOutbox\(\) \{\s*const access = await recoverServerAccess\(\);\s*if \(access === null\) return;/);
  const cacheFlow = source.slice(source.indexOf("async function readingPayloadWithCache"), source.indexOf("async function loadScripture"));
  assert.ok(cacheFlow.indexOf("cachedPrivatePayload(readingId)") < cacheFlow.indexOf("state.adapter.getReadingPayload(readingId)"));
  assert.match(source, /clearPrivateDataAfterAccessFailure\(\)/);
});

test("cached readings paint first, then use one confirmed recovery to rerender authoritative commentary", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const cacheFlow = source.slice(source.indexOf("async function readingPayloadWithCache"), source.indexOf("function syncScriptureMemoryWindow"));
  const revalidation = source.slice(source.indexOf("async function revalidateOpenReading"), source.indexOf("function syncScriptureMemoryWindow"));
  const loadReading = source.slice(source.indexOf("async function loadReading"), source.indexOf("async function warmPriorityWindow"));
  assert.match(cacheFlow, /if \(cached\) return \{payload: cached, source: "cache"\};/);
  assert.match(cacheFlow, /const access = await recoverServerAccess\(\);/);
  assert.doesNotMatch(revalidation, /navigator\.onLine/);
  assert.match(revalidation, /state\.readingRevalidationById\.get\(entry\.readingId\)/);
  assert.match(revalidation, /await persistPrivatePayload\(entry\.readingId, payload\);/);
  assert.doesNotMatch(revalidation, /renderCommentary\(/);
  assert.match(revalidation, /if \(explicitAccessFailure\(error\)\) \{\s*state\.serverAccessConfirmed = false;\s*handleFatalError\(error\);\s*return \{state: "denied"\};/);
  assert.match(loadReading, /setSyncStatus\("Saved reading shown · checking for updates"\)/);
  assert.match(loadReading, /retryOpenReadingSync\(\)\.catch/);
  assert.ok(loadReading.indexOf("retryOpenReadingSync().catch") <
    loadReading.indexOf("refreshComments({background: true, readingId: entry.readingId})"));
  assert.match(loadReading, /refresh\.state === "refreshed"\) setSyncStatus\("Reading synchronized"\)/);
  assert.match(loadReading, /refresh\.state === "retryable"\) setSyncStatus\("Saved reading shown · secure sync retry available"\)/);
  assert.match(source, /renderHistoricalContextPanels\(comprehensivePartition\.context, sources \|\| \[\]\)/);
});

test("reading Sync and resume retry the open payload without duplicate commentary renders", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const persist = source.slice(source.indexOf("async function persistPrivatePayload"), source.indexOf("function mayUseOfflineFallback"));
  const revalidation = source.slice(source.indexOf("async function revalidateOpenReading"), source.indexOf("function syncScriptureMemoryWindow"));
  const manualSync = source.slice(source.indexOf("async function syncSharedActivity"), source.indexOf("async function updateCacheInspector"));
  const resume = source.slice(source.indexOf("function resumeOnlineWork"), source.indexOf("function resumeApplication"));
  assert.match(persist, /privatePayloadRevision\(previous\) !== privatePayloadRevision\(payload\)[\s\S]*?renderCommentary\(commentary, payload\.sources \|\| state\.sources \|\| \[\]\)/);
  assert.doesNotMatch(revalidation, /renderCommentary\(/);
  assert.match(manualSync, /const access = await recoverServerAccess\(\{force: true\}\);\s*if \(access === null\) return;/);
  assert.match(manualSync, /if \(!access\) \{[\s\S]*?secure sync retry available/);
  assert.ok(manualSync.indexOf("await recoverServerAccess({force: true})") < manualSync.indexOf("await retryOpenReadingSync()"));
  assert.match(manualSync, /const refresh = await retryOpenReadingSync\(\);/);
  assert.match(manualSync, /await flushOutbox\(\);/);
  assert.match(source, /refreshComments"\)\.addEventListener\("click", \(\) => syncSharedActivity\(\)\.catch/);
  assert.match(source, /syncOutbox"\)\.addEventListener\("click", \(\) => syncSharedActivity\(\)\.catch/);
  assert.match(resume, /recoverServerAccess\(\)\.then\(\(access\) => \{\s*if \(access === true\) resumeOnlineWork\(\);/);
  assert.match(resume, /else retryOpenReadingSync\(\)\.catch/);
  assert.ok((source.match(/state\.readingRevalidationById = new Map\(\);/g) || []).length >= 2);
});

test("calendar uses a compact monthly selector with two-reader dots and a date-specific action", () => {
  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../app/frontend/styles.css"), "utf8");
  assert.match(source, /function buildMonthCalendar\(/);
  assert.match(source, /function selectCalendarDate\(date, options\)/);
  assert.match(source, /completionSet\(day\.entry\.readingId\)/);
  assert.match(source, /button\.dataset\.prepared = hasPreparedReading\(day\.entry\) \? "true" : "false"/);
  assert.match(source, /prepared \? "Study prepared" : "Study preparation pending"/);
  assert.match(source, /calendar-prepared-swatch[\s\S]*Sage background = study prepared/);
  assert.match(source, /Filled dot = commented/);
  assert.match(source, /button\.dataset\.readingId = canOpen/);
  assert.match(source, /openReading\(readingId\)/);
  assert.doesNotMatch(source, /configureDevelopmentControls|openOverrideReading|readingOverride/);
  assert.match(css, /\.calendar-day\s*\{[^}]*min-height:\s*3\.15rem/s);
  assert.match(css, /\.calendar-day\[data-prepared="true"\]\s*\{[^}]*background:/s);
  assert.match(css, /\.calendar-prepared-swatch\s*\{[^}]*background:/s);
  assert.ok(css.indexOf('.calendar-day[data-prepared="true"]') < css.indexOf('.calendar-day[data-selected="true"]'));
  assert.match(css, /\.participant-color-0/);
  assert.match(css, /\.participant-color-1/);
  assert.match(html, /id="previousMonth"/);
  assert.match(html, /id="nextMonth"/);
  assert.match(html, /id="openSelectedReading"/);
  assert.ok(html.indexOf('id="selectedDayCard"') < html.indexOf('id="calendarHeading"'));
  assert.match(html, /id="homeView"[^>]*aria-labelledby="selectedDayTitle"/);
  assert.match(html, /<h1 id="selectedDayTitle"[^>]*tabindex="-1"/);
  assert.match(source, /element\("skipLink"\)\.href = "#selectedDayTitle"/);
  assert.match(source, /element\("selectedDayTitle"\)\.focus\(\{preventScroll: true\}\)/);
  assert.doesNotMatch(html, /Last week|This week|Next week/);
});

test("successful ESV rendering omits the informational banner above Scripture", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const successRender = source.slice(source.indexOf('element("translationLabel").textContent = "Page 2 · ESV Scripture"'), source.indexOf("async function persistScripture"));
  assert.match(successRender, /scriptureState\.hidden = sourceLabel !== "cache"/);
  assert.match(successRender, /Saved ESV text is shown from this device/);
  assert.doesNotMatch(successRender, /Official ESV text retrieved for this screen/);
  assert.match(source, /function renderScriptureUnavailable\(message\)[\s\S]*scriptureState\.hidden = false/);
  assert.match(source, /Retrieving official ESV text through the authenticated server/);
});

test("reading navigation is three pages and Finished returns to the calendar", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  assert.match(source, /function setReadingPage\(pageIndex, options\)/);
  assert.match(source, /element\("finishReading"\)\.addEventListener\("click", \(\) => showHome\(\)\)/);
  assert.match(source, /entry\.kind === "book_intro" \? "Book intro" : "Scripture"/);
  assert.match(source, /element\("bookIntroductionSection"\)\.hidden = entry\.kind !== "book_intro"/);
});

test("a multi-chapter bridge day stays one reading and one Scripture page", () => {
  const frontend = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "../app/apps-script/Code.gs"), "utf8");
  const micah = {kind: "chapter", bookId: "MIC", passages: [{bookId: "MIC", chapter: 3}, {bookId: "MIC", chapter: 4}]};
  assert.equal(app.titleForEntry(micah), "Micah 3–4");
  assert.match(frontend, /passages\.forEach\(\(passage\) =>/);
  assert.match(frontend, /section\.className = "scripture-passage"/);
  assert.match(frontend, /scripturePassageTabs/);
  assert.match(frontend, /loadScripture\(entry, \{passageIndex: index\}\)/);
  assert.match(server, /UrlFetchApp\.fetchAll\(requests\)/);
  assert.match(server, /selectScripturePassages/);
  assert.match(server, /cacheAllowed:\s*true/);

  const habakkuk = {
    kind: "chapter",
    bookId: "HAB",
    passages: [
      {bookId: "HAB", chapter: 1, verseCount: 17},
      {bookId: "HAB", chapter: 2, verseCount: 20},
      {bookId: "HAB", chapter: 3, verseCount: 19}
    ]
  };
  assert.equal(app.readingRequiresPartitionedScripture(habakkuk, {HAB: {verseCount: 56}}, {maxBookFraction: 0.5}), true);
  assert.equal(app.scripturePrefetchPassageIndex(habakkuk, {HAB: {verseCount: 56}}, {maxBookFraction: 0.5}), 0);
  assert.equal(app.scriptureRetentionTargetCount(habakkuk, {HAB: {verseCount: 56}}, {maxBookFraction: 0.5}), 1);
  assert.equal(app.scripturePassageIndexForSelection(habakkuk, {bookId: "HAB", chapter: 3, verse: 17}), 2);
  assert.equal(app.esvUrlForPassages(habakkuk.passages),
    "https://www.esv.org/Habakkuk+1%3B+Habakkuk+2%3B+Habakkuk+3/");

  const haggai = {
    kind: "chapter",
    bookId: "HAG",
    passages: [{bookId: "HAG", chapter: 2, verseCount: 23}]
  };
  const haggaiSegments = app.scriptureDisplaySegments(haggai, {HAG: {verseCount: 38}}, {
    maxBookFraction: 0.5,
    maxTotalCachedVerses: 500
  });
  assert.deepEqual(haggaiSegments.map((passage) => [passage.verseStart, passage.verseEnd, passage.verseCount]), [
    [1, 12, 12], [13, 23, 11]
  ]);
  assert.equal(app.readingRequiresPartitionedScripture(haggai, {HAG: {verseCount: 38}}, {
    maxBookFraction: 0.5,
    maxTotalCachedVerses: 500
  }), true);
  assert.equal(app.esvUrlForPassages([haggaiSegments[1]]), "https://www.esv.org/Haggai+2%3A13-23/");
  assert.match(frontend, /const displaySegments = scriptureDisplaySegments\(entry, state\.plan && state\.plan\.bookMetrics, state\.policy\)/);
  assert.match(frontend, /cacheKey: `ESV:\$\{scripture\.readingId\}:\$\{passageIndex\}`/);
});

test("unavailable Scripture state is a full exact-passage link", () => {
  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  const frontend = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../app/frontend/styles.css"), "utf8");
  assert.match(html, /<a id="scriptureState" class="inline-state scripture-state-link" aria-live="polite">/);
  const unavailable = frontend.slice(frontend.indexOf("function renderScriptureUnavailable"), frontend.indexOf("function highlightContext"));
  assert.match(unavailable, /scriptureState\.href = exactUrl/);
  assert.match(unavailable, /scriptureState\.target = "_blank"/);
  assert.match(unavailable, /Open the exact passage on ESV\.org/);
  assert.match(css, /\.scripture-state-link\[href\]/);
});

test("transient Scripture failures retry once without retrying policy failures", async () => {
  let transientCalls = 0;
  const recovered = await app.requestScriptureWithRetry(async () => {
    transientCalls += 1;
    return transientCalls === 1
      ? {available: false, code: "ESV_UNAVAILABLE"}
      : {available: true, translation: "MOCK"};
  }, 0);
  assert.equal(transientCalls, 2);
  assert.equal(recovered.available, true);
  assert.equal(app.scriptureFailureMayRetry({code: "SERVER_TIMEOUT"}), true);
  assert.equal(app.scriptureFailureMayRetry(new Error("connection reset")), true);

  let policyCalls = 0;
  const refused = await app.requestScriptureWithRetry(async () => {
    policyCalls += 1;
    return {available: false, code: "PROVIDER_DISPLAY_LIMIT"};
  }, 0);
  assert.equal(policyCalls, 1);
  assert.equal(refused.code, "PROVIDER_DISPLAY_LIMIT");
  assert.equal(app.scriptureFailureMayRetry({code: "READER_CODE_INVALID"}), false);
});

test("local private-draft preview is localhost-only and restricted to active plan IDs", () => {
  const server = fs.readFileSync(path.join(__dirname, "../scripts/dev-server.mjs"), "utf8");
  const frontend = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const builder = fs.readFileSync(path.join(__dirname, "../scripts/build-apps-script.mjs"), "utf8");
  assert.match(server, /const HOST = "127\.0\.0\.1";/);
  assert.match(server, /config\/active-calendar\/celebration-bridge-long-term-active\.json/);
  assert.match(server, /const ACTIVE_READING_IDS = ACTIVE_PLAN\.entries\.map/);
  assert.match(server, /ACTIVE_READING_IDS\.includes\(privateReading\[1\]\)/);
  assert.match(frontend, /\/\* DBR_LOCAL_ADAPTER_START \*\/[\s\S]*privateDraftMode\(\)[\s\S]*\/\* DBR_LOCAL_ADAPTER_END \*\//);
  assert.match(builder, /DBR_LOCAL_ADAPTER_START[\s\S]*DBR_LOCAL_ADAPTER_END/);
  assert.match(server, /\^\\\/__mhc\\\/reading\\\/\(intro-GEN\|GEN-001\)\\\.json\$/);
  assert.match(server, /FABRICATED UI TEST — not Matthew Henry commentary/);
  assert.match(server, /mhcRuntimeOrFabricated/);
  assert.match(server, /private-commentary", "mhc", "stores", "current-window/);
  assert.match(server, /\/__mhc\/window\/manifest\.json/);
  assert.match(server, /Matthew Henry window-store checksum mismatch/);
  assert.match(server, /Array\.isArray\(portable\.chapters\).*portable\.chapters\.length/s);
  assert.match(frontend, /\/\* DBR_LOCAL_ADAPTER_START \*\/[\s\S]*mhcPilotMode\(\)[\s\S]*\/\* DBR_LOCAL_ADAPTER_END \*\//);
  assert.match(builder, /privateDraft\|mhcPilot/);
  assert.match(builder, /__\(\?:private\|mhc\)/);
});
