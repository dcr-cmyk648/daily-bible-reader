#!/usr/bin/env node

import {readFile, readdir} from "node:fs/promises";
import {createRequire} from "node:module";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import {assertSchemaValid} from "./lib/schema-validator.mjs";
import {buildCompleteBridgeSchedule} from "./lib/bridge-extension.mjs";
import {buildLongTermCandidate, validateLongTermCandidate} from "./lib/long-term-schedule.mjs";

const require = createRequire(import.meta.url);
const providerPolicy = require("../app/shared/provider-policy.js");
const ROOT = process.cwd();
const REQUIRED_SECTIONS = [
  "brief-overview",
  "literary-structure",
  "historical-cultural-context",
  "language-textual-details",
  "major-theological-themes",
  "broad-agreement",
  "interpretive-disagreements",
  "canonical-connections",
  "historical-reception",
  "contemporary-questions",
  "takeaways",
  "source-notes"
];

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

function sourceIdsFromCommentary(commentary) {
  const ids = new Set();
  commentary.dailyIntroduction.sourceIds.forEach((id) => ids.add(id));
  commentary.commentarySummary.paragraphs.forEach((paragraph) => paragraph.sourceIds.forEach((id) => ids.add(id)));
  commentary.practicalTakeaway.sourceIds.forEach((id) => ids.add(id));
  (commentary.sections || []).forEach((section) => section.sourceIds.forEach((id) => ids.add(id)));
  (commentary.comprehensiveSynthesis?.sourceIds || []).forEach((id) => ids.add(id));
  commentary.claims.forEach((claim) => claim.sourceIds.forEach((id) => ids.add(id)));
  if (commentary.henrySourceLink && commentary.henrySourceLink.sourceId) ids.add(commentary.henrySourceLink.sourceId);
  return ids;
}

function validateCommentary(commentary, readingId, registry) {
  assert(commentary.schemaVersion === "commentary/v2", `${readingId}: commentary schema version`);
  assert(commentary.readingId === readingId, `${readingId}: commentary association`);
  assert(commentary.publicationStatus === "placeholder", `${readingId}: Git fixture must remain a placeholder`);
  assert(commentary.generation.humanReviewStatus === "not_started", `${readingId}: placeholder review status`);
  assert(commentary.generation.contentHash === null, `${readingId}: placeholder must not claim a content hash`);
  assert(commentary.dailyIntroduction.markdown.length > 0, `${readingId}: placeholder daily orientation`);
  assert(Array.isArray(commentary.commentarySummary.paragraphs), `${readingId}: placeholder commentary summary`);
  assert(commentary.practicalTakeaway.markdown.length > 0, `${readingId}: placeholder practical takeaway`);
  assert(commentary.verseOfTheDay && Number.isInteger(commentary.verseOfTheDay.chapter) &&
    Number.isInteger(commentary.verseOfTheDay.verse), `${readingId}: placeholder verse reference`);
  assert(commentary.coverage.consultedCount === 0 && commentary.coverage.includedCount === 0, `${readingId}: placeholder must not claim sources`);
  const sectionIds = commentary.sections.map((section) => section.sectionId);
  assert(new Set(sectionIds).size === sectionIds.length, `${readingId}: unique section IDs`);
  REQUIRED_SECTIONS.forEach((sectionId) => assert(sectionIds.includes(sectionId), `${readingId}: missing ${sectionId}`));
  const registryById = new Map(registry.sources.map((source) => [source.sourceId, source]));
  for (const sourceId of sourceIdsFromCommentary(commentary)) {
    const source = registryById.get(sourceId);
    assert(source, `${readingId}: cited source ${sourceId} is absent`);
    assert(["consulted", "included"].includes(source.summaryUseStatus), `${readingId}: cited source ${sourceId} is not consulted/included`);
  }
  commentary.claims.forEach((claim) => {
    assert(claim.sourceIds.length > 0, `${readingId}: claim without a source`);
    assert(claim.singleSource === (claim.sourceIds.length === 1), `${readingId}: single-source flag mismatch`);
  });
  const serialized = JSON.stringify(commentary);
  assert(!/"(?:rawText|rawSourceText|fullCommentaryText|sourceText)"\s*:/.test(serialized), `${readingId}: forbidden raw source field`);
}

async function main() {
  const schemaFiles = (await readdir(path.join(ROOT, "schemas"))).filter((name) => name.endsWith(".json"));
  assert(schemaFiles.length >= 6, "Expected six or more schema files.");
  const schemas = {};
  for (const filename of schemaFiles) {
    const schema = await json(`schemas/${filename}`);
    assert(schema.$schema === "https://json-schema.org/draft/2020-12/schema", `${filename}: JSON Schema draft`);
    assert(schema.$id && schema.title, `${filename}: schema identity/title`);
    schemas[filename] = schema;
  }

  const [plan, fullBridgeSchedule, config, deploymentConfig, registry, placeholder, referencePlan, policies, manifestExample, appsManifest, longTermInput, longTermCandidate] = await Promise.all([
    json("fixtures/pilot-content/plan.json"),
    json("config/bridge-schedules/celebration-y3q4-bridge-full.json"),
    json("fixtures/pilot-content/app-config.json"),
    json("config/app-config.example.json"),
    json("fixtures/pilot-content/source-registry.json"),
    json("fixtures/pilot-content/bridge-placeholder.commentary.json"),
    json("config/reference-plans/celebration-y3q4.json"),
    json("config/provider-policies.example.json"),
    json("config/private-manifest.example.json"),
    json("app/apps-script/appsscript.json"),
    json("config/long-term-plan/four-stream-candidate-input.json"),
    json("config/long-term-plan/four-stream-candidate.json")
  ]);

  assertSchemaValid(plan, schemas["plan.schema.json"], {label: "Pilot plan", externalSchemas: schemas});
  assertSchemaValid(fullBridgeSchedule, schemas["plan.schema.json"], {label: "Complete bridge schedule", externalSchemas: schemas});
  assertSchemaValid(longTermCandidate, schemas["plan.schema.json"], {label: "Long-term review candidate", externalSchemas: schemas});
  assertSchemaValid(registry, schemas["source.schema.json"], {label: "Source registry", externalSchemas: schemas});
  assertSchemaValid(placeholder, schemas["commentary.schema.json"], {label: "Bridge commentary placeholder", externalSchemas: schemas});
  policies.policies.forEach((policy, index) => assertSchemaValid(policy, schemas["provider-policy.schema.json"], {
    label: `Provider policy ${index + 1}`,
    externalSchemas: schemas
  }));

  assert(plan.schemaVersion === "plan/v1", "Plan schema version.");
  assert(fullBridgeSchedule.entries.length === 39 && fullBridgeSchedule.entries.at(-1).readingId === "CC-Y3Q4-D092",
    "Complete bridge schedule must end at D092.");
  const regeneratedFullBridgeSchedule = buildCompleteBridgeSchedule({
    plan,
    appConfig: config,
    referencePlan,
    metrics: await json("config/reference-plans/celebration-y3q4-chapter-metrics.json")
  });
  assert(JSON.stringify(fullBridgeSchedule) === JSON.stringify(regeneratedFullBridgeSchedule),
    "Compiled bridge schedule must exactly match the deterministic reference-plan build.");
  const regeneratedLongTermCandidate = buildLongTermCandidate(longTermInput).plan;
  validateLongTermCandidate(longTermCandidate, longTermInput);
  assert(JSON.stringify(longTermCandidate) === JSON.stringify(regeneratedLongTermCandidate),
    "Long-term review candidate must exactly match deterministic generation.");
  assert(longTermCandidate.candidateMetadata.reviewOnly === true && longTermCandidate.entries.length === 1255,
    "Long-term schedule must remain a complete review-only candidate.");
  const firstSourcePlanDay = 54;
  const activeThroughSourcePlanDay = plan.entries.at(-1).sourcePlanDay;
  const detroitToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
  const civilDay = (value) => Math.floor(Date.parse(`${value}T00:00:00Z`) / 86400000);
  const authorizedThroughSourcePlanDay = Math.min(92, firstSourcePlanDay +
    Math.max(0, civilDay(detroitToday) - civilDay(config.sharedStartDate)) + config.futureLookaheadDays);
  assert(activeThroughSourcePlanDay <= authorizedThroughSourcePlanDay,
    "Tracked bridge may not exceed the current Detroit T+7 horizon.");
  const bridgeIds = Array.from({length: activeThroughSourcePlanDay - firstSourcePlanDay + 1}, (_, index) =>
    `CC-Y3Q4-D${String(index + firstSourcePlanDay).padStart(3, "0")}`);
  const fullBridgeIds = Array.from({length: 39}, (_, index) =>
    `CC-Y3Q4-D${String(index + firstSourcePlanDay).padStart(3, "0")}`);
  assert(plan.planVersion === "celebration-y3q4-bridge-2026-v1", "Bridge plan version.");
  assert(plan.entries.length === bridgeIds.length, "Tracked rolling bridge must end at its declared active horizon.");
  assert(JSON.stringify(plan.entries.map((entry) => entry.readingId)) === JSON.stringify(bridgeIds), "Bridge reading IDs and order.");
  assert(JSON.stringify(fullBridgeSchedule.entries.map((entry) => entry.readingId)) === JSON.stringify(fullBridgeIds),
    "Compiled bridge schedule must include every factual source day through D092.");
  assert(new Set(plan.entries.map((entry) => entry.readingId)).size === bridgeIds.length, "Reading IDs must be stable and unique.");
  plan.entries.forEach((entry, index) => {
    assert(entry.dayIndex === index + 1, "Plan day indexes must be contiguous.");
    assert(entry.sourcePlanDay === index + firstSourcePlanDay, "Source-plan day mapping must stay contiguous.");
    assert(entry.planVersion === plan.planVersion, "Entry plan version mismatch.");
    assert(entry.kind === "chapter" && entry.passages.length >= 1, "Every bridge entry must contain chapter references.");
    assert(entry.bookId === entry.passages[0].bookId && entry.chapter === entry.passages[0].chapter, "Primary passage mismatch.");
    assert(["event", "composition", "traditional", "pragmatic"].includes(entry.chronologyBasis), "Chronology basis invalid.");
  });
  assert(plan.entries[0].passages.length === 2 && plan.entries[1].passages.length === 3, "Multi-chapter bridge days must remain grouped.");
  assert(config.displayTranslation === "ESV" && config.runtimeAI === false, "ESV-only and no-runtime-AI config.");
  assert(config.timezone === "America/Detroit", "Pilot timezone.");
  assert(config.sharedStartDateMode === "fixed" && config.sharedStartDate === "2026-08-08", "Bridge start date.");
  assert(config.futureReadingsLocked === true && config.futureLookaheadDays === 7, "Seven future readings must be visible.");
  assert(config.offlineReadingWindowDays === 8 && config.preparedAheadDays === 7 &&
    config.privateContentCacheMaxAgeSeconds === 1209600, "Device target must retain today plus seven future private studies without expiring T+7 before its day arrives.");
  assert(JSON.stringify(config.testingReadingIds) === JSON.stringify(bridgeIds), "Testing override is restricted to bridge readings.");
  assert(deploymentConfig.sharedStartDateMode === "fixed", "Deployment example must use an explicit shared start date.");
  assert(deploymentConfig.futureLookaheadDays === 7 && deploymentConfig.offlineReadingWindowDays === 8 &&
    deploymentConfig.preparedAheadDays === 7 && deploymentConfig.privateContentCacheMaxAgeSeconds === 1209600,
    "Deployment example rolling lookahead/offline window.");

  assert(referencePlan.schemaVersion === "reference-plan/v1" && referencePlan.dayCount === 92, "Reference schedule identity/count.");
  assert(referencePlan.days.length === 92, "Reference schedule must store exactly 92 factual day mappings.");
  referencePlan.days.forEach((day, index) => {
    assert(day.day === index + 1 && Array.isArray(day.references) && day.references.length >= 1, "Reference schedule day order.");
  });
  fullBridgeSchedule.entries.forEach((entry) => {
    const factualReferences = referencePlan.days[entry.sourcePlanDay - 1].references;
    assert(factualReferences.length === entry.passages.length,
      `${entry.readingId}: active passage count must match the factual reference plan`);
  });

  assert(registry.schemaVersion === "source-registry/v1", "Registry schema version.");
  assert(new Set(registry.sources.map((source) => source.sourceId)).size === registry.sources.length, "Unique source IDs.");
  registry.sources.forEach((source) => {
    if (["consulted", "included"].includes(source.summaryUseStatus)) {
      assert(source.accessDate && source.accessMethod, `${source.sourceId}: consulted source requires access evidence`);
    }
  });
  plan.entries.forEach((entry) => validateCommentary({
    ...placeholder,
    readingId: entry.readingId,
    verseOfTheDay: {bookId: entry.passages[0].bookId, chapter: entry.passages[0].chapter, verse: 1}
  }, entry.readingId, registry));
  assert(/FABRICATED DEVELOPMENT TEXT/.test(await readFile(path.join(ROOT, "app/frontend/app.js"), "utf8")),
    "Local adapter must clearly mark fabricated Scripture.");

  const policy = providerPolicy.validatePolicy(policies.policies[0]);
  assert(policy.policyVersion === "esv-api-2026-08-15-v5-bounded-offline" && policy.maxCacheAgeSeconds === 691200,
    "Verified bounded-offline provider policy version/age.");
  assert(policy.maxTotalCachedVerses === 500 && policy.maxBookFraction === 0.5, "ESV cache maxima.");
  assert(policy.offlinePersistenceAllowed === true && policy.refreshBehavior === "network_first", "Bridge ESV must use bounded network-first persistence.");
  assert(policy.downloadAllowed === false && policy.bulkCopyAllowed === false, "ESV download/bulk-copy controls.");
  assert(policy.requiredAttribution.notice.includes("Users may not copy or download more than 500 verses"), "Required ESV notice.");

  assert(manifestExample.schemaVersion === "private-manifest/v1", "Private manifest example version.");
  assert(Object.keys(manifestExample.readings).every((readingId) => bridgeIds.includes(readingId)),
    "Manifest example may name only active bridge readings.");
  assert(appsManifest.webapp.executeAs === "USER_ACCESSING" && appsManifest.webapp.access === "ANYONE", "Fail-closed Apps Script deployment identity.");
  assert(!appsManifest.webapp.access.includes("ANONYMOUS"), "Anonymous Apps Script access is forbidden.");
  const scopes = new Set(appsManifest.oauthScopes);
  [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/userinfo.email"
  ].forEach((scope) => assert(scopes.has(scope), `Missing Apps Script scope ${scope}`));
  assert(!scopes.has("https://www.googleapis.com/auth/drive"), "Broad Drive write scope is forbidden.");

  const code = await readFile(path.join(ROOT, "app/apps-script/Code.gs"), "utf8");
  new vm.Script(code, {filename: "Code.gs"});
  assert(!/console\.(?:log|warn|error)\s*\(/.test(code), "Apps Script code must not log private payloads.");
  assert(!/USER_DEPLOYING|ANYONE_ANONYMOUS/.test(code), "Apps Script code must not suggest unsafe deployment mode.");
  ["getBootstrapData", "getReadingPayload", "getScripture", "listComments", "submitCommentEvent", "listHighlights", "submitHighlightEvent", "forgetReaderEnrollment"].forEach((functionName) =>
    assert(new RegExp(`function ${functionName}\\(readerCode(?:,|\\))`).test(code), `${functionName} must require the reader code first`)
  );
  assert(/presentedReaderCodeHash:\s*presentedReaderCodeHash/.test(code), "Apps Script must hash and bind the reader code server-side.");
  assert(/PropertiesService\.getUserProperties\(\)/.test(code) && /DBR_READER_ENROLLMENT/.test(code), "Apps Script must support per-user reader enrollment.");
  assert(/readerCodeHash:\s*presentedReaderCodeHash/.test(code), "Per-user enrollment may store only the verified reader-code hash.");
  assert(!/Logger\.log\s*\(/.test(code), "Apps Script must not log reader codes or private payloads.");
  assert(/DBR_COMPLETE_BRIDGE_SCHEDULE/.test(code), "Apps Script must compile the full factual bridge schedule separately from private Drive content.");

  const ignore = await readFile(path.join(ROOT, ".gitignore"), "utf8");
  ["private-content/", "private-commentary/", "research/raw/", ".clasp.json", "config/*.local.json", "dist/"].forEach((entry) =>
    assert(ignore.includes(entry), `.gitignore missing ${entry}`)
  );

  process.stdout.write(`Content validation passed (${schemaFiles.length} schemas, ${bridgeIds.length} private-prefix readings, ${fullBridgeIds.length} scheduled bridge readings, 92-day reference schedule, fabricated Scripture only).\n`);
}

main().catch((error) => {
  process.stderr.write(`Content validation failed: ${error.message}\n`);
  process.exitCode = 1;
});
