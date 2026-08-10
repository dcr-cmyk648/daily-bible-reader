const test = require("node:test");
const assert = require("node:assert/strict");

function source(overrides = {}) {
  return {
    sourceId: "source_one",
    urlOrCitation: "https://example.test/source-one",
    accessDate: "2026-08-08",
    accessMethod: "Opened and read the complete work from the named edition.",
    rightsStatus: "copyrighted",
    license: null,
    allowedUses: ["Bibliographic citation and conservative synthesis."],
    rawTextStorageAllowed: false,
    summaryUseStatus: "consulted",
    qualityTier: "strong",
    includedReadings: [],
    ...overrides
  };
}

async function validator() {
  return import("../scripts/validate-source-registry.mjs");
}

test("source inventory accepts evidenced consultation without claiming inclusion", async () => {
  const {validateRegistryProvenance} = await validator();
  const report = validateRegistryProvenance({sources: [source()]});
  assert.deepEqual(report.byStatus, {consulted: 1});
});

test("search snippets and publisher metadata cannot establish consultation", async () => {
  const {validateRegistryProvenance} = await validator();
  assert.throws(
    () => validateRegistryProvenance({sources: [source({accessMethod: "Publisher metadata only"})]}),
    /discovery metadata cannot establish consultation/
  );
});

test("only included sources can claim a pilot reading", async () => {
  const {validateRegistryProvenance} = await validator();
  assert.throws(
    () => validateRegistryProvenance({sources: [source({includedReadings: ["GEN-001"]})]}),
    /only a source included in a completed synthesis/
  );
  assert.throws(
    () => validateRegistryProvenance({sources: [source({summaryUseStatus: "included"})]}),
    /included source needs at least one reading ID/
  );
});

test("copyrighted source records cannot enable raw-text storage", async () => {
  const {validateRegistryProvenance} = await validator();
  assert.throws(
    () => validateRegistryProvenance({sources: [source({rawTextStorageAllowed: true})]}),
    /copyrighted\/unknown-rights raw text storage must be disabled/
  );
});

test("duplicate locators and raw-source fields are rejected", async () => {
  const {validateRegistryProvenance} = await validator();
  assert.throws(
    () => validateRegistryProvenance({sources: [source(), source({sourceId: "source_two", urlOrCitation: "https://www.example.test/source-one/"})]}),
    /duplicates locator/
  );
  assert.throws(
    () => validateRegistryProvenance({sources: [source({quotation: "A copied passage"})]}),
    /forbidden raw-source or quotation field/
  );
});

test("critical sources require an affiliation and a bounded synthesis role", async () => {
  const {validateRegistryProvenance} = await validator();
  const critical = {
    traditionOrPerspective: ["modern critical scholarship"],
    affiliationContext: "christian_academic",
    synthesisPriority: "major_counterposition"
  };
  assert.equal(validateRegistryProvenance({sources: [source(critical)]}).total, 1);
  assert.throws(
    () => validateRegistryProvenance({sources: [source({traditionOrPerspective: ["historical-critical"]})]}),
    /requires verified or explicitly unclear affiliation context/
  );
  assert.throws(
    () => validateRegistryProvenance({sources: [source({
      ...critical,
      affiliationContext: "secular_academic",
      synthesisPriority: "core"
    })]}),
    /may supply context or a major counterposition/
  );
});
