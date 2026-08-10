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

test("Apps Script batches the seven-day commentary window behind one authorization", () => {
  const code = fs.readFileSync(path.join(__dirname, "../app/apps-script/Code.gs"), "utf8");
  const batch = code.slice(code.indexOf("function getReadingPayloads"), code.indexOf("function dbrBuildReadingPayload_"));
  assert.match(batch, /dbrAuthorizedContext_\(readerCode\)/);
  assert.match(batch, /readingIds\.length > 7/);
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

test("content readiness requires consecutive reviewed studies and exposes the first gap", () => {
  const ready = (readingId) => ({commentary: {
    readingId,
    publicationStatus: "draft",
    generation: {humanReviewStatus: "approved", contentHash: "a".repeat(64)}
  }});
  const placeholder = {commentary: {
    readingId: "CC-Y3Q4-D057",
    publicationStatus: "placeholder",
    generation: {humanReviewStatus: "not_started", contentHash: null}
  }};
  assert.equal(app.readingContentIsPrepared(ready("CC-Y3Q4-D054")), true);
  assert.equal(app.readingContentIsPrepared(placeholder), false);
  assert.equal(app.readingContentIsPrepared({commentary: {
    readingId: "CC-Y3Q4-D055",
    publicationStatus: "draft",
    generation: {humanReviewStatus: "in_review", contentHash: "b".repeat(64)}
  }}), true);
  assert.equal(app.readingContentIsPrepared({commentary: {
    readingId: "CC-Y3Q4-D055",
    publicationStatus: "draft",
    generation: {humanReviewStatus: "changes_requested", contentHash: "b".repeat(64)}
  }}), false);
  assert.equal(app.readingContentIsPrepared({commentary: {
    readingId: "CC-Y3Q4-D055",
    publicationStatus: "draft",
    generation: {humanReviewStatus: "approved", contentHash: null}
  }}), false);
  assert.equal(app.readingContentIsPrepared(null), false);

  const entries = [54, 55, 56, 57].map((day) => ({readingId: `CC-Y3Q4-D0${day}`, dayIndex: day - 53}));
  const payloads = new Map([
    [entries[0].readingId, ready(entries[0].readingId)],
    [entries[1].readingId, ready(entries[1].readingId)],
    [entries[2].readingId, placeholder],
    [entries[3].readingId, ready(entries[3].readingId)]
  ]);
  const readiness = app.evaluateContentReadiness(entries, payloads, 0, 3);
  assert.equal(readiness.consecutiveReady, 2);
  assert.equal(readiness.state, "warning");
  assert.equal(readiness.nextGapEntry.readingId, entries[2].readingId);
  assert.equal(app.evaluateContentReadiness(entries, payloads, 2, 3).state, "critical");
  assert.equal(app.evaluateContentReadiness(entries, payloads, 3, 3).state, "green");
  assert.deepEqual(app.evaluateContentReadiness(entries, payloads, entries.length, 3), {
    consecutiveReady: 0,
    target: 0,
    readyThroughEntry: null,
    nextGapEntry: null,
    state: "green"
  });

  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  assert.match(source, /Preparation alert: \$\{readiness\.consecutiveReady\}\/\$\{readiness\.target\}/);
  assert.match(source, /contentDiagnosticsArePrivateToOwner/);
});

test("selected calendar days show a validated reference without storing ESV wording", () => {
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
  assert.match(html, /id="selectedDayVerse"/);
  assert.ok(html.indexOf('id="selectedDayVerse"') < html.indexOf('id="openSelectedReading"'));
  assert.match(html, /The exact ESV wording appears after you open the reading|Checking saved study metadata/);
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
    assert.match(source, new RegExp(`appsScriptRpc\\(\"${name}\", state\\.readerCode`));
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

test("daily page puts one cited article first and exposes custom collapsed deep-study sections after discussion", () => {
  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const orderedIds = ["overviewContent", "scriptureSection", "commentarySummary", "verseOfDaySection", "practicalTakeaway", "mainSourceDisclosure", "discussionCard", "finishReading", "extendedStudy", "comprehensiveSynthesis", "sourceAuditDisclosure", "sourceList"];
  const positions = orderedIds.map((id) => html.indexOf(`id="${id}"`));
  positions.forEach((position) => assert.ok(position >= 0));
  for (let index = 1; index < positions.length; index += 1) assert.ok(positions[index] > positions[index - 1]);
  assert.match(html, /<article id="commentarySummary"/);
  assert.match(html, /class="extended-study-panel"/);
  assert.match(html, /<details id="sourceAuditDisclosure"/);
  assert.match(html, /<details id="mainSourceDisclosure"/);
  assert.equal(/<details id="sourceAuditDisclosure"[^>]*\sopen(?:\s|>)/.test(html), false);
  assert.match(appSource, /renderSourceCitations\(dailyIntroduction\.sourceIds/);
  assert.match(appSource, /renderCommentarySummary\(commentarySummary, citationIndex\)/);
  assert.match(appSource, /renderInlineCitedParagraph\(paragraph\.markdown/);
  assert.match(appSource, /renderComprehensiveSections\(comprehensive\)/);
  assert.match(appSource, /disclosure\.className = "deep-dive-disclosure"/);
  assert.doesNotMatch(appSource, /commentary-summary-paragraph/);
  assert.doesNotMatch(html, /Key commentary insights/);
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
  assert.match(stance, /contextReadingIds/);
  assert.match(workflow, /do not manufacture neutrality or spend the reader's time on fringe catalogues/);
  assert.match(workflow, /do not repeat the same background dispute chapter after chapter/);
  assert.match(validator, /DEPENDENT_CROSS_REFERENCE/);
  assert.match(validator, /assertStandalone\(paragraph\.markdown/);
  assert.doesNotMatch(validator, /main all-sources synthesis must cite every included source/);
});

test("numeric commentary citations reveal and focus the numbered source note", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  assert.match(source, /function appendNumberedCitations\(container, sourceIds, citationIndex\)/);
  assert.match(source, /function renderInlineCitedParagraph\(markdown, sourceIds, citationIndex, container\)/);
  assert.match(source, /\{\\\{cite:/);
  assert.match(source, /disclosure\.open = true;/);
  assert.match(source, /note\.scrollIntoView\(\{block: "center"\}\);/);
  assert.match(source, /note\.focus\(\{preventScroll: true\}\);/);
  assert.match(source, /function normalizedComprehensiveSynthesis\(commentary, isBookIntroduction\)/);
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
  assert.match(source, /addEventListener\("pageshow"[\s\S]*?resumeOnlineWork\(\)/);
  assert.match(source, /addEventListener\("visibilitychange"[\s\S]*?visibilityState === "visible"[\s\S]*?resumeOnlineWork\(\)/);
  assert.match(source, /if \(state\.calendarSyncPromise\) return state\.calendarSyncPromise/);
});

test("cached calendar and commentary render before background authorization while writes stay gated", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  assert.match(source, /cachedBootstrapForCredential\(credential\)[\s\S]*?installBootstrap\(cached, \{cached: true\}\)[\s\S]*?confirmServerAccess/);
  assert.match(source, /function serverCallsAllowed\(\)/);
  assert.match(source, /async function flushOutbox\(\) \{\s*if \(!serverCallsAllowed\(\)\)/);
  const cacheFlow = source.slice(source.indexOf("async function readingPayloadWithCache"), source.indexOf("async function loadScripture"));
  assert.ok(cacheFlow.indexOf("cachedPrivatePayload(readingId)") < cacheFlow.indexOf("state.adapter.getReadingPayload(readingId)"));
  assert.match(source, /clearPrivateDataAfterAccessFailure\(\)/);
});

test("calendar uses a compact monthly selector with two-reader dots and a date-specific action", () => {
  const html = fs.readFileSync(path.join(__dirname, "../app/frontend/index.html"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../app/frontend/styles.css"), "utf8");
  assert.match(source, /function buildMonthCalendar\(/);
  assert.match(source, /function selectCalendarDate\(date, options\)/);
  assert.match(source, /completionSet\(day\.entry\.readingId\)/);
  assert.match(source, /button\.dataset\.readingId = canOpen/);
  assert.match(source, /openReading\(readingId\)/);
  assert.doesNotMatch(source, /configureDevelopmentControls|openOverrideReading|readingOverride/);
  assert.match(css, /\.calendar-day\s*\{[^}]*min-height:\s*3\.15rem/s);
  assert.match(css, /\.participant-color-0/);
  assert.match(css, /\.participant-color-1/);
  assert.match(html, /id="previousMonth"/);
  assert.match(html, /id="nextMonth"/);
  assert.match(html, /id="openSelectedReading"/);
  assert.doesNotMatch(html, /Last week|This week|Next week/);
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
  assert.match(server, /UrlFetchApp\.fetchAll\(requests\)/);
  assert.match(server, /cacheAllowed:\s*false/);
});

test("local private-draft preview is localhost-only and restricted to the seven bridge IDs", () => {
  const server = fs.readFileSync(path.join(__dirname, "../scripts/dev-server.mjs"), "utf8");
  const frontend = fs.readFileSync(path.join(__dirname, "../app/frontend/app.js"), "utf8");
  const builder = fs.readFileSync(path.join(__dirname, "../scripts/build-apps-script.mjs"), "utf8");
  assert.match(server, /const HOST = "127\.0\.0\.1";/);
  assert.match(server, /\^\\\/__private\\\/reading\\\/\(CC-Y3Q4-D05\[4-9\]\|CC-Y3Q4-D060\)\\\.json\$/);
  assert.match(frontend, /\/\* DBR_LOCAL_ADAPTER_START \*\/[\s\S]*privateDraftMode\(\)[\s\S]*\/\* DBR_LOCAL_ADAPTER_END \*\//);
  assert.match(builder, /DBR_LOCAL_ADAPTER_START[\s\S]*DBR_LOCAL_ADAPTER_END/);
  assert.match(server, /\^\\\/__mhc\\\/reading\\\/\(intro-GEN\|GEN-001\)\\\.json\$/);
  assert.match(server, /FABRICATED UI TEST — not Matthew Henry commentary/);
  assert.match(server, /mhcRuntimeOrFabricated/);
  assert.match(server, /private-commentary", "mhc", "stores", "current-window/);
  assert.match(server, /\/__mhc\/window\/manifest\.json/);
  assert.match(server, /Matthew Henry window-store checksum mismatch/);
  assert.match(server, /portable\.chapters\.length === 1/);
  assert.match(frontend, /\/\* DBR_LOCAL_ADAPTER_START \*\/[\s\S]*mhcPilotMode\(\)[\s\S]*\/\* DBR_LOCAL_ADAPTER_END \*\//);
  assert.match(builder, /privateDraft\|mhcPilot/);
  assert.match(builder, /__\(\?:private\|mhc\)/);
});
