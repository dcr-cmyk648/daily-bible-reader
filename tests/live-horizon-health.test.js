const test = require("node:test");
const assert = require("node:assert/strict");

const healthModule = import("../scripts/lib/live-horizon-health.mjs");
const FABRICATED_DEPLOYMENT_ID = "fabricatedLiveHealthEndpoint123456789";
const FABRICATED_ENDPOINT = `https://script.google.com/macros/s/${FABRICATED_DEPLOYMENT_ID}/exec`;

function entry(dayIndex) {
  return {
    readingId: `TST-${String(dayIndex).padStart(3, "0")}`,
    dayIndex,
    planVersion: "fabricated-live-health/v1",
    kind: "chapter",
    bookId: "NAM",
    chapter: dayIndex,
    passages: [{bookId: "NAM", chapter: dayIndex, verseCount: 2}]
  };
}

function payload(reading) {
  const sourceIds = ["fabricated-source-one", "fabricated-source-two"];
  return {
    commentary: {
      schemaVersion: "commentary/v3",
      readingId: reading.readingId,
      publicationStatus: "published",
      generation: {humanReviewStatus: "approved", contentHash: "a".repeat(64)},
      dailyIntroduction: {markdown: "Fabricated orientation gives this test reading a clear purpose, useful context, and enough non-Scripture test words for the complete preparation boundary used by the reader.", sourceIds},
      commentarySummary: {paragraphs: [{markdown: "Fabricated synthesis provides enough test-only prose to prove that the live health command delegates to the same reader preparation validator rather than trusting manifest membership.", sourceIds}]},
      practicalTakeaway: {markdown: "Practice one fabricated, specific test response today.", sourceIds: [sourceIds[0]]},
      verseOfTheDay: {bookId: "NAM", chapter: reading.chapter, verse: 1},
      comprehensiveSynthesis: {markdown: Array.from({length: 8}, () => "Fabricated detailed test synthesis explains a non-Scripture readiness invariant with enough words to satisfy the reader component validator.").join(" "), sourceIds},
      verseCommentary: {
        schema_version: "mhc-runtime/v1", validation_status: "valid", review_status: "approved", book_id: "NAM", chapter: reading.chapter,
        source_layer_note: "Fabricated test-only source layer note for validator coverage.",
        source_atoms: {
          first: {source_unit_id: "first", source_reference_label: "Fabricated source", text: "Fabricated source atom for first test verse."},
          second: {source_unit_id: "second", source_reference_label: "Fabricated source", text: "Fabricated source atom for second test verse."}
        },
        records: {
          [`NAM.${reading.chapter}.1`]: {blurb: "Fabricated Henry test blurb for the first verse.", scope_note: "Test scope.", source_reference_label: "Fabricated source", source_unit_ids: ["first"], source_atom_ids: ["first"]},
          [`NAM.${reading.chapter}.2`]: {blurb: "Fabricated Henry test blurb for the second verse.", scope_note: "Test scope.", source_reference_label: "Fabricated source", source_unit_ids: ["second"], source_atom_ids: ["second"]}
        }
      }
    },
    sources: sourceIds.map((sourceId) => ({sourceId, title: "Fabricated source", urlOrCitation: `https://example.test/${sourceId}`}))
  };
}

function bootstrap() {
  const entries = Array.from({length: 10}, (_, index) => entry(index + 1));
  return {
    config: {timezone: "America/Detroit", sharedStartDateMode: "fixed", sharedStartDate: "2026-09-04", futureLookaheadDays: 7},
    plan: {schemaVersion: "compact-plan/v1", planVersion: "fabricated-live-health/v1", entries},
    preparedReadingIds: entries.map((reading) => reading.readingId)
  };
}

test("live horizon evaluation uses the reader validator for all Detroit current-through-T+7 payloads", async () => {
  const {evaluateLiveHorizon} = await healthModule;
  const boot = bootstrap();
  const horizon = boot.plan.entries.slice(0, 8);
  const batch = {planVersion: boot.plan.planVersion, payloads: Object.fromEntries(horizon.map((reading) => [reading.readingId, payload(reading)]))};
  const result = evaluateLiveHorizon(boot, batch, new Date("2026-09-04T16:00:00.000Z"));
  assert.deepEqual(result, {
    status: "ready", effectiveDate: "2026-09-04", target: 8,
    readingIds: horizon.map((reading) => reading.readingId), preparedCount: 8,
    missingPreparedReadingIds: [], missingPayloadReadingIds: [], componentFailures: []
  });

  boot.preparedReadingIds = boot.preparedReadingIds.slice(0, 7);
  const prefixGap = evaluateLiveHorizon(boot, batch, new Date("2026-09-04T16:00:00.000Z"));
  assert.equal(prefixGap.status, "not_ready");
  assert.deepEqual(prefixGap.missingPreparedReadingIds, [horizon[7].readingId]);
  boot.preparedReadingIds = boot.plan.entries.map((reading) => reading.readingId);
  delete batch.payloads[horizon[4].readingId];
  const missing = evaluateLiveHorizon(boot, batch, new Date("2026-09-04T16:00:00.000Z"));
  assert.equal(missing.status, "not_ready");
  assert.deepEqual(missing.missingPayloadReadingIds, [horizon[4].readingId]);
  assert.deepEqual(missing.componentFailures, [{readingId: horizon[4].readingId, missingComponentIds: ["metadata", "orientation", "henry", "main-synthesis", "verse-of-the-day", "takeaway", "comprehensive-synthesis", "sources"]}]);
});

test("live bridge keeps the stored credential in POST bodies and fetches exactly the horizon", async () => {
  const {verifyLiveHorizon, liveHealthCredentialsFromStores} = await healthModule;
  const credentials = liveHealthCredentialsFromStores({
    schemaVersion: "dbr-pages-public-config/v2",
    enabled: true,
    backendWebAppUrl: FABRICATED_ENDPOINT
  }, [{
    authorId: "dustin",
    displayName: "Dustin",
    readerCode: "DBR-DUSTIN-fabricated_reader_code_123456789"
  }]);
  const boot = bootstrap();
  const horizon = boot.plan.entries.slice(0, 8);
  const calls = [];
  const fetchImpl = async (_url, request) => {
    const fields = Object.fromEntries(request.body.entries());
    calls.push(fields);
    const result = fields.method === "getBootstrapData"
      ? boot
      : {planVersion: boot.plan.planVersion, payloads: Object.fromEntries(horizon.map((reading) => [reading.readingId, payload(reading)]))};
    const response = {
      channel: "dbr-rpc-response/v1",
      requestId: fields.request_id,
      responseNonce: fields.response_nonce,
      ok: true,
      result: {ok: true, data: result}
    };
    const escapedResponse = JSON.stringify(JSON.stringify(response)).slice(1, -1);
    return {ok: true, url: "https://script.googleusercontent.com/macros/echo", text: async () => `<!doctype html><script>window.top.postMessage(${escapedResponse},\"https://dcr-cmyk648.github.io\");</script>`};
  };
  const result = await verifyLiveHorizon(credentials, {fetchImpl, now: new Date("2026-09-04T16:00:00.000Z"), randomBytesFn: (length) => Buffer.alloc(length, 7)});
  assert.equal(result.status, "ready");
  assert.deepEqual(calls.map((call) => call.method), ["getBootstrapData", "getReadingPayloads"]);
  assert.deepEqual(JSON.parse(calls[1].args_json).slice(1)[0], horizon.map((reading) => reading.readingId));
  assert.equal(calls.every((call) => call.client_origin === "https://dcr-cmyk648.github.io"), true);
});

test("live bridge rejects an inner backend failure instead of treating it as bootstrap data", async () => {
  const {callLiveHealthBridge, validateLiveHealthCredentials} = await healthModule;
  const credentials = validateLiveHealthCredentials({
    schemaVersion: "dbr-live-health-credentials/v1",
    backendWebAppUrl: FABRICATED_ENDPOINT,
    readerCode: "DBR-DUSTIN-fabricated_reader_code_123456789"
  });
  const fetchImpl = async (_url, request) => {
    const fields = Object.fromEntries(request.body.entries());
    const response = {
      channel: "dbr-rpc-response/v1",
      requestId: fields.request_id,
      responseNonce: fields.response_nonce,
      ok: true,
      result: {ok: false, error: {code: "CONTENT_INVALID", message: "Private details must not be emitted."}}
    };
    return {
      ok: true,
      url: "https://script.googleusercontent.com/macros/echo",
      text: async () => `<!doctype html><script>window.top.postMessage(${JSON.stringify(response)},"https://dcr-cmyk648.github.io");</script>`
    };
  };
  await assert.rejects(
    callLiveHealthBridge(credentials, "getBootstrapData", [credentials.readerCode], {
      fetchImpl,
      randomBytesFn: (length) => Buffer.alloc(length, 9)
    }),
    (error) => error && error.code === "LIVE_HEALTH_BACKEND_REJECTED" && !error.message.includes("Private details")
  );
});
