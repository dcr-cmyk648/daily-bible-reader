#!/usr/bin/env node
import {createHash} from "node:crypto";
import {readFile, rename, writeFile} from "node:fs/promises";
import path from "node:path";
import {reconcileManifestBackedPrefix} from "./lib/active-calendar.mjs";

const ROOT = process.cwd();
const args = process.argv.slice(2);
let dryRun = false;
for (const arg of args) {
  if (arg === "--dry-run") dryRun = true;
  else if (["--help", "-h"].includes(arg)) {
    process.stdout.write("Usage: node scripts/reconcile-manifest-prefix.mjs [--dry-run]\n");
    process.exit(0);
  } else throw new Error("Usage: node scripts/reconcile-manifest-prefix.mjs [--dry-run]");
}
const json = (file) => readFile(path.join(ROOT, file), "utf8").then(JSON.parse);
const [privatePlan, activePlan, appConfig, manifest] = await Promise.all([
  json("fixtures/pilot-content/plan.json"),
  json("config/active-calendar/celebration-bridge-long-term-active.json"),
  json("fixtures/pilot-content/app-config.json"),
  json("private-content/private-manifest.json")
]);
if (manifest?.schemaVersion !== "private-manifest/v1" || !manifest.readings || Array.isArray(manifest.readings)) {
  throw new Error("A valid private manifest reading map is required.");
}
const result = reconcileManifestBackedPrefix({
  privatePlan, activePlan, appConfig, manifestReadingIds: Object.keys(manifest.readings)
});
for (const entry of result.plan.entries) {
  const base = path.join(ROOT, "private-content", "bridge", "celebration-y3q4", entry.readingId);
  const [markdown, metadata] = await Promise.all([
    readFile(`${base}.md`), readFile(`${base}.metadata.json`, "utf8").then(JSON.parse)
  ]);
  const hash = createHash("sha256").update(markdown).digest("hex");
  if (metadata.readingId !== entry.readingId || metadata.generation?.contentHash !== hash) {
    throw new Error(`Local private-content validation failed for ${entry.readingId}.`);
  }
}
if (!dryRun && result.changed) {
  const planTarget = path.join(ROOT, "fixtures/pilot-content/plan.json");
  const configTarget = path.join(ROOT, "fixtures/pilot-content/app-config.json");
  const suffix = `.tmp-${process.pid}`;
  await Promise.all([
    writeFile(`${planTarget}${suffix}`, `${JSON.stringify(result.plan, null, 2)}\n`),
    writeFile(`${configTarget}${suffix}`, `${JSON.stringify(result.appConfig, null, 2)}\n`)
  ]);
  // Admission may temporarily be narrower, never broader: move the plan first.
  // A rerun repairs the still-short exact allowlist if the second rename fails.
  await rename(`${planTarget}${suffix}`, planTarget);
  await rename(`${configTarget}${suffix}`, configTarget);
}
process.stdout.write(`${JSON.stringify({
  lane: "daily_t_plus_7", action: result.changed && !dryRun ? "reconciled" : "none",
  state: dryRun ? "validated_dry_run" : result.changed ? "manifest_prefix_current" : "already_current",
  readyThroughReadingId: result.readyThroughReadingId, priorManifestState: "manifest_unchanged"
})}\n`);
