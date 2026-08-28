const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function json(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8"));
}

test("bridge artifacts validate against their declared JSON Schemas", async () => {
  const {validateAgainstSchema} = await import("../scripts/lib/schema-validator.mjs");
  const schemas = Object.fromEntries([
    "reading.schema.json",
    "plan.schema.json",
    "source.schema.json",
    "commentary.schema.json",
    "daily-study-protocol.schema.json",
    "provider-policy.schema.json"
  ].map((filename) => [filename, json(`schemas/${filename}`)]));
  const cases = [
    [json("fixtures/pilot-content/plan.json"), schemas["plan.schema.json"]],
    [json("fixtures/pilot-content/source-registry.json"), schemas["source.schema.json"]],
    [json("fixtures/pilot-content/bridge-placeholder.commentary.json"), schemas["commentary.schema.json"]],
    [json("config/daily-study-protocol.json"), schemas["daily-study-protocol.schema.json"]],
    [json("config/provider-policies.example.json").policies[0], schemas["provider-policy.schema.json"]]
  ];
  cases.forEach(([value, schema]) => assert.deepEqual(validateAgainstSchema(value, schema, {externalSchemas: schemas}), []));
});

test("schema validation rejects a malformed multi-chapter reading and malformed metadata", async () => {
  const {validateAgainstSchema} = await import("../scripts/lib/schema-validator.mjs");
  const readingSchema = json("schemas/reading.schema.json");
  const commentarySchema = json("schemas/commentary.schema.json");
  const laterReading = {
    planVersion: "pilot-v1",
    dayIndex: 3,
    readingId: "GEN 002",
    kind: "chapter",
    bookId: "GEN",
    orderingRationale: "",
    chronologyBasis: "certain",
    confidence: "absolute",
    notes: "",
    sourceIds: []
  };
  const invalidReading = validateAgainstSchema(laterReading, readingSchema);
  assert.ok(invalidReading.some((error) => error.includes("readingId")));
  assert.ok(invalidReading.some((error) => error.includes("chapter")));
  assert.ok(invalidReading.some((error) => error.includes("chronologyBasis")));

  const commentary = json("fixtures/pilot-content/bridge-placeholder.commentary.json");
  commentary.unreviewedRawSource = "forbidden extra field";
  assert.ok(validateAgainstSchema(commentary, commentarySchema).some((error) => error.includes("additional property")));
});

test("commentary v3 uses one comprehensive synthesis while v2 retains fixed sections", async () => {
  const {validateAgainstSchema} = await import("../scripts/lib/schema-validator.mjs");
  const schema = json("schemas/commentary.schema.json");
  const v2 = json("fixtures/pilot-content/bridge-placeholder.commentary.json");
  const v3 = structuredClone(v2);
  v3.schemaVersion = "commentary/v3";
  delete v3.sections;
  v3.comprehensiveSynthesis = {markdown: "A single comprehensive synthesis.", sourceIds: []};
  assert.deepEqual(validateAgainstSchema(v3, schema), []);

  const missingSynthesis = structuredClone(v3);
  delete missingSynthesis.comprehensiveSynthesis;
  assert.ok(validateAgainstSchema(missingSynthesis, schema).some((error) => error.includes("comprehensiveSynthesis")));

  const mixed = structuredClone(v3);
  mixed.sections = v2.sections;
  assert.ok(validateAgainstSchema(mixed, schema).some((error) => error.includes("forbidden")));
});
