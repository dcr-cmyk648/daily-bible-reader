const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const core = require("../app/shared/server-core.js");
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/pilot-content/plan.json"), "utf8"));
const FIRST_READING = "CC-Y3Q4-D054";
const SECOND_READING = "CC-Y3Q4-D055";
const DUSTIN_CODE_HASH = "a".repeat(64);
const SHANE_CODE_HASH = "b".repeat(64);
const users = [
  {email: "owner@example.com", authorId: "dustin", displayName: "Dustin", readerCodeHash: DUSTIN_CODE_HASH},
  {email: "friend@example.com", authorId: "shane", displayName: "Shane", readerCodeHash: SHANE_CODE_HASH}
];

function request(overrides = {}) {
  return {
    clientRequestId: "request:1234567890abcdef",
    eventType: "create",
    planVersion: plan.planVersion,
    readingId: FIRST_READING,
    body: "A local test comment.",
    baseRevision: 0,
    authorId: "spoofed-friend",
    displayName: "Spoofed Name",
    ...overrides
  };
}

function ids() {
  let value = 0;
  return (kind) => `${kind}:${String(++value).padStart(16, "0")}`;
}

test("owner and friend identities are server-derived", () => {
  assert.deepEqual(core.authorizeIdentity({activeEmail: "OWNER@example.com", effectiveEmail: "owner@example.com", allowedUsers: users, presentedReaderCodeHash: DUSTIN_CODE_HASH}), {
    authorId: "dustin",
    displayName: "Dustin"
  });
  assert.deepEqual(core.authorizeIdentity({activeEmail: "friend@example.com", effectiveEmail: "friend@example.com", allowedUsers: users, presentedReaderCodeHash: SHANE_CODE_HASH}), {
    authorId: "shane",
    displayName: "Shane"
  });
});

test("the public reader roster contains display identities but no emails or code hashes", () => {
  assert.deepEqual(core.publicParticipants(users), [
    {authorId: "dustin", displayName: "Dustin"},
    {authorId: "shane", displayName: "Shane"}
  ]);
  assert.equal(JSON.stringify(core.publicParticipants(users)).includes("example.com"), false);
  assert.equal(JSON.stringify(core.publicParticipants(users)).includes(DUSTIN_CODE_HASH), false);
});

test("reader codes are required and tied to the matching Google identity", () => {
  assert.throws(() => core.authorizeIdentity({activeEmail: "owner@example.com", effectiveEmail: "owner@example.com", allowedUsers: users}), {code: "READER_CODE_REQUIRED"});
  assert.throws(() => core.authorizeIdentity({activeEmail: "owner@example.com", effectiveEmail: "owner@example.com", allowedUsers: users, presentedReaderCodeHash: SHANE_CODE_HASH}), {code: "READER_CODE_INVALID"});
  assert.throws(() => core.authorizeIdentity({activeEmail: "friend@example.com", effectiveEmail: "friend@example.com", allowedUsers: users, presentedReaderCodeHash: DUSTIN_CODE_HASH}), {code: "READER_CODE_INVALID"});
});

test("a verified reader code can be remembered as a per-user script enrollment", () => {
  const enrollment = {
    version: "reader-enrollment/v1",
    authorId: "dustin",
    readerCodeHash: DUSTIN_CODE_HASH
  };
  assert.deepEqual(core.authorizeIdentity({
    activeEmail: "owner@example.com",
    effectiveEmail: "owner@example.com",
    allowedUsers: users,
    presentedReaderCodeHash: "",
    readerEnrollment: enrollment,
    requiredEnrollmentVersion: "reader-enrollment/v1"
  }), {authorId: "dustin", displayName: "Dustin"});
});

test("reader enrollment is account-bound, versioned, and invalidated by code rotation", () => {
  const base = {
    activeEmail: "owner@example.com",
    effectiveEmail: "owner@example.com",
    allowedUsers: users,
    presentedReaderCodeHash: "",
    requiredEnrollmentVersion: "reader-enrollment/v1"
  };
  assert.throws(() => core.authorizeIdentity({...base, readerEnrollment: {
    version: "reader-enrollment/v1", authorId: "shane", readerCodeHash: DUSTIN_CODE_HASH
  }}), {code: "READER_CODE_REQUIRED"});
  assert.throws(() => core.authorizeIdentity({...base, readerEnrollment: {
    version: "reader-enrollment/old", authorId: "dustin", readerCodeHash: DUSTIN_CODE_HASH
  }}), {code: "READER_CODE_REQUIRED"});
  assert.throws(() => core.authorizeIdentity({...base, readerEnrollment: {
    version: "reader-enrollment/v1", authorId: "dustin", readerCodeHash: SHANE_CODE_HASH
  }}), {code: "READER_CODE_REQUIRED"});
});

test("anonymous, unauthorized, and owner-executed mismatch fail closed", () => {
  assert.throws(() => core.authorizeIdentity({activeEmail: "", effectiveEmail: "owner@example.com", allowedUsers: users}), {code: "AUTH_REQUIRED"});
  assert.throws(() => core.authorizeIdentity({activeEmail: "third@example.com", effectiveEmail: "third@example.com", allowedUsers: users}), {code: "ACCESS_DENIED"});
  assert.throws(() => core.authorizeIdentity({activeEmail: "friend@example.com", effectiveEmail: "owner@example.com", allowedUsers: users}), {code: "WRONG_EXECUTION_IDENTITY"});
});

test("Drive manifest resolves configured files and rejects arbitrary IDs", () => {
  const manifest = {
    schemaVersion: "private-manifest/v1",
    appConfigFileId: "CONFIG_FILE_12345",
    planFileId: "PLAN_FILE_1234567",
    sourceRegistryFileId: "SOURCE_FILE_12345",
    readings: {
      [FIRST_READING]: {contentFileId: "CONTENT_FILE_1234", metadataFileId: "METADATA_FILE_123"}
    }
  };
  assert.deepEqual(core.resolveReadingFiles(manifest, FIRST_READING), {
    contentFileId: "CONTENT_FILE_1234",
    metadataFileId: "METADATA_FILE_123"
  });
  assert.throws(() => core.assertAllowedFileId(manifest, "ARBITRARY_FILE_123"), {code: "FILE_NOT_ALLOWED"});
  assert.throws(() => core.resolveReadingFiles(manifest, "GEN-002"), {code: "READING_NOT_FOUND"});
});

test("create ignores frontend identity and uses server timestamp/identity", () => {
  const result = core.applyCommentEvent({
    payload: request(),
    plan,
    identity: {authorId: "owner", displayName: "Owner"},
    existingEvents: [],
    now: "2026-08-08T16:00:00.000Z",
    idFactory: ids()
  });
  assert.equal(result.event.authorId, "owner");
  assert.equal(result.event.displayName, "Owner");
  assert.equal(result.event.createdAt, "2026-08-08T16:00:00.000Z");
  assert.equal(result.event.revision, 1);
  assert.equal(result.event.readingId, FIRST_READING);
});

test("idempotent retry returns the existing event", () => {
  const first = core.applyCommentEvent({
    payload: request(), plan, identity: {authorId: "owner", displayName: "Owner"}, existingEvents: [], idFactory: ids()
  }).event;
  const retry = core.applyCommentEvent({
    payload: request(), plan, identity: {authorId: "owner", displayName: "Owner"}, existingEvents: [first], idFactory: ids()
  });
  assert.equal(retry.idempotent, true);
  assert.equal(retry.event.eventId, first.eventId);
});

test("edit appends revision and preserves creation time", () => {
  const identity = {authorId: "owner", displayName: "Owner"};
  const created = core.applyCommentEvent({payload: request(), plan, identity, existingEvents: [], now: "2026-08-08T16:00:00.000Z", idFactory: ids()}).event;
  const edited = core.applyCommentEvent({
    payload: request({
      clientRequestId: "request:2234567890abcdef",
      eventType: "edit",
      commentId: created.commentId,
      baseRevision: 1,
      body: "Revised text"
    }),
    plan,
    identity,
    existingEvents: [created],
    now: "2026-08-08T17:00:00.000Z",
    idFactory: ids()
  }).event;
  assert.equal(edited.revision, 2);
  assert.equal(edited.baseRevision, 1);
  assert.equal(edited.createdAt, created.createdAt);
  assert.equal(edited.updatedAt, "2026-08-08T17:00:00.000Z");
  assert.equal(core.materializeCommentEvents([created, edited])[0].body, "Revised text");
});

test("delete retracts latest view but retains event history", () => {
  const identity = {authorId: "owner", displayName: "Owner"};
  const created = core.applyCommentEvent({payload: request(), plan, identity, existingEvents: [], idFactory: ids()}).event;
  const deleted = core.applyCommentEvent({
    payload: request({
      clientRequestId: "request:3234567890abcdef",
      eventType: "delete",
      commentId: created.commentId,
      baseRevision: 1,
      body: "frontend body is ignored"
    }),
    plan,
    identity,
    existingEvents: [created],
    idFactory: ids()
  }).event;
  assert.equal(deleted.body, "");
  assert.ok(deleted.deletedAt);
  assert.equal(core.materializeCommentEvents([created, deleted]).length, 0);
  assert.equal(core.materializeCommentEvents([created, deleted], {includeDeleted: true}).length, 1);
});

test("batched calendar activity reports only the current reader's active comments", () => {
  const makeIds = ids();
  const dustinFirst = core.applyCommentEvent({
    payload: request(),
    plan,
    identity: {authorId: "dustin", displayName: "Dustin"},
    existingEvents: [],
    idFactory: makeIds
  }).event;
  const shaneIntro = core.applyCommentEvent({
    payload: request({clientRequestId: "request:activity-shane-1", readingId: SECOND_READING}),
    plan,
    identity: {authorId: "shane", displayName: "Shane"},
    existingEvents: [dustinFirst],
    idFactory: makeIds
  }).event;
  assert.deepEqual(core.completedReadingIds([dustinFirst, shaneIntro], {
    authorId: "dustin",
    planVersion: plan.planVersion,
    readingIds: [FIRST_READING, SECOND_READING]
  }), [FIRST_READING]);
  assert.deepEqual(core.completedReadingIds([dustinFirst, shaneIntro], {
    authorId: "shane",
    planVersion: plan.planVersion,
    readingIds: [FIRST_READING, SECOND_READING]
  }), [SECOND_READING]);
  assert.deepEqual(core.participantCommentActivity([dustinFirst, shaneIntro], {
    participants: core.publicParticipants(users),
    planVersion: plan.planVersion,
    readingIds: [FIRST_READING, SECOND_READING]
  }), {
    participants: [
      {authorId: "dustin", displayName: "Dustin"},
      {authorId: "shane", displayName: "Shane"}
    ],
    completedByReadingId: {
      [FIRST_READING]: ["dustin"],
      [SECOND_READING]: ["shane"]
    }
  });
});

test("calendar activity excludes retracted comments and rejects oversized batches", () => {
  const identity = {authorId: "dustin", displayName: "Dustin"};
  const makeIds = ids();
  const created = core.applyCommentEvent({payload: request(), plan, identity, existingEvents: [], idFactory: makeIds}).event;
  const deleted = core.applyCommentEvent({
    payload: request({
      clientRequestId: "request:activity-delete1",
      eventType: "delete",
      commentId: created.commentId,
      baseRevision: 1,
      body: ""
    }),
    plan,
    identity,
    existingEvents: [created],
    idFactory: makeIds
  }).event;
  assert.deepEqual(core.completedReadingIds([created, deleted], {
    authorId: "dustin",
    planVersion: plan.planVersion,
    readingIds: [FIRST_READING]
  }), []);
  assert.deepEqual(core.participantCommentActivity([created, deleted], {
    participants: core.publicParticipants(users),
    planVersion: plan.planVersion,
    readingIds: [FIRST_READING]
  }).completedByReadingId, {[FIRST_READING]: []});
  assert.throws(() => core.completedReadingIds([], {
    authorId: "dustin",
    planVersion: plan.planVersion,
    readingIds: Array.from({length: 43}, (_, index) => `TST-${index + 1}`)
  }), {code: "INVALID_COMMENT_ACTIVITY"});
  assert.throws(() => core.participantCommentActivity([], {
    participants: core.publicParticipants(users),
    planVersion: plan.planVersion,
    readingIds: Array.from({length: 43}, (_, index) => `TST-${index + 1}`)
  }), {code: "INVALID_COMMENT_ACTIVITY"});
});

test("two-user edit and stale revision collisions are rejected", () => {
  const owner = {authorId: "owner", displayName: "Owner"};
  const created = core.applyCommentEvent({payload: request(), plan, identity: owner, existingEvents: [], idFactory: ids()}).event;
  const editPayload = request({
    clientRequestId: "request:4234567890abcdef",
    eventType: "edit",
    commentId: created.commentId,
    baseRevision: 1,
    body: "Owner edit"
  });
  assert.throws(() => core.applyCommentEvent({payload: editPayload, plan, identity: {authorId: "friend", displayName: "Friend"}, existingEvents: [created], idFactory: ids()}), {code: "COMMENT_FORBIDDEN"});
  const edited = core.applyCommentEvent({payload: editPayload, plan, identity: owner, existingEvents: [created], idFactory: ids()}).event;
  assert.throws(() => core.applyCommentEvent({
    payload: request({...editPayload, clientRequestId: "request:5234567890abcdef"}),
    plan,
    identity: owner,
    existingEvents: [created, edited],
    idFactory: ids()
  }), {code: "REVISION_CONFLICT"});
});

test("comments cannot move to a different reading or plan", () => {
  const identity = {authorId: "owner", displayName: "Owner"};
  const created = core.applyCommentEvent({payload: request(), plan, identity, existingEvents: [], idFactory: ids()}).event;
  assert.throws(() => core.applyCommentEvent({
    payload: request({
      clientRequestId: "request:6234567890abcdef",
      eventType: "edit",
      readingId: SECOND_READING,
      commentId: created.commentId,
      baseRevision: 1
    }),
    plan,
    identity,
    existingEvents: [created],
    idFactory: ids()
  }), {code: "COMMENT_ASSOCIATION_MISMATCH"});
  assert.throws(() => core.validateCommentRequest(request({planVersion: "other-plan"}), plan), {code: "PLAN_VERSION_MISMATCH"});
});

test("HTML/script input remains inert plain data and size/control limits apply", () => {
  const malicious = '<img src=x onerror=alert(1)><script>alert("x")</script>';
  const normalized = core.validateCommentRequest(request({body: malicious}), plan);
  assert.equal(normalized.body, malicious);
  assert.throws(() => core.validateCommentRequest(request({body: "x".repeat(core.MAX_COMMENT_LENGTH + 1)}), plan), {code: "COMMENT_TOO_LARGE"});
  assert.throws(() => core.validateCommentRequest(request({body: "bad\u0000text"}), plan), {code: "COMMENT_INVALID"});
});

test("ESV parsed range count and expected range validation", () => {
  assert.equal(core.countParsedVerses([[1001001, 1001031]]), 31);
  const payload = {canonical: "Configured chapter", parsed: [[1001001, 1001031]], passages: ["mock response shape only (ESV)"]};
  assert.equal(core.validateEsvPayload(payload, {verseCount: 31}).verseCount, 31);
  assert.throws(() => core.validateEsvPayload(payload, {verseCount: 30}), {code: "ESV_RANGE_MISMATCH"});
  assert.throws(() => core.countParsedVerses([[1001031, 1002001]]), {code: "INVALID_ESV_RESPONSE"});
});

test("verse of the day is a reference inside the configured reading, never stored ESV text", () => {
  const entry = {
    kind: "chapter",
    passages: [
      {bookId: "MIC", chapter: 5, verseCount: 15},
      {bookId: "MIC", chapter: 6, verseCount: 16},
      {bookId: "MIC", chapter: 7, verseCount: 20}
    ]
  };
  assert.deepEqual(core.validateVerseOfTheDay({bookId: "MIC", chapter: 6, verse: 8}, entry),
    {bookId: "MIC", chapter: 6, verse: 8});
  assert.throws(() => core.validateVerseOfTheDay({bookId: "MIC", chapter: 4, verse: 8}, entry), {code: "CONTENT_INVALID"});
  assert.throws(() => core.validateVerseOfTheDay({bookId: "MIC", chapter: 6, verse: 17}, entry), {code: "CONTENT_INVALID"});
  assert.throws(() => core.validateVerseOfTheDay({bookId: "MIC", chapter: 6, verse: 8, text: "forbidden"}, entry), {code: "CONTENT_INVALID"});
  assert.equal(core.validateVerseOfTheDay(null, {kind: "book_intro"}), null);
});
