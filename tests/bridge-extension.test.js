import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

import {authorizedBridgeSourceDay, buildBridgeExtension} from "../scripts/lib/bridge-extension.mjs";

const json = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

test("the bridge may append exactly the reading entering the Detroit T+7 window", () => {
  const plan = json("fixtures/pilot-content/plan.json");
  const appConfig = json("fixtures/pilot-content/app-config.json");
  const referencePlan = json("config/reference-plans/celebration-y3q4.json");
  const metrics = json("config/reference-plans/celebration-y3q4-chapter-metrics.json");
  assert.equal(authorizedBridgeSourceDay({plan, appConfig, today: "2026-08-14"}), 67);
  const result = buildBridgeExtension({plan, appConfig, referencePlan, metrics, sourceDay: 67, today: "2026-08-14"});
  assert.equal(result.entry.readingId, "CC-Y3Q4-D067");
  assert.deepEqual(result.entry.passages, [
    {bookId: "HAG", chapter: 1, verseCount: 15},
    {bookId: "HAG", chapter: 2, verseCount: 23}
  ]);
  assert.equal(result.plan.entries.length, plan.entries.length + 1);
  assert.equal(result.appConfig.testingReadingIds.at(-1), "CC-Y3Q4-D067");
});

test("the bridge cannot skip ahead or exceed the seven-day authorization", () => {
  const plan = json("fixtures/pilot-content/plan.json");
  const appConfig = json("fixtures/pilot-content/app-config.json");
  const referencePlan = json("config/reference-plans/celebration-y3q4.json");
  const metrics = json("config/reference-plans/celebration-y3q4-chapter-metrics.json");
  assert.throws(() => buildBridgeExtension({plan, appConfig, referencePlan, metrics, sourceDay: 68, today: "2026-08-14"}), /append exactly/);
  assert.throws(() => buildBridgeExtension({plan, appConfig, referencePlan, metrics, sourceDay: 67, today: "2026-08-13"}), /T\+7 horizon/);
});
