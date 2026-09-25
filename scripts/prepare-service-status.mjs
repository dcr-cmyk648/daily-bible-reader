#!/usr/bin/env node
// Produces a private candidate only. Publish with fresh pointer comparison and readback.
import fs from "node:fs/promises";
import path from "node:path";
const [state, summary = "", action = ""] = process.argv.slice(2);
if (!["running", "blocked", "approval_required", "ready"].includes(state) ||
    [summary, action].some(value => value.length > 240 || /[\u0000-\u001f]/.test(value))) {
  throw new Error("Usage: node scripts/prepare-service-status.mjs running|blocked|approval_required|ready summary action");
}
const base = path.resolve("private-content/private-manifest.json");
const manifest = JSON.parse(await fs.readFile(base, "utf8"));
manifest.preparationStatus = {schemaVersion: "preparation-status/v1", state, summary, action, updatedAt: new Date().toISOString()};
const dir = path.resolve("private-content/automation/staging/service-status");
await fs.mkdir(dir, {recursive: true});
await fs.writeFile(path.join(dir, "manifest-candidate.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({state, candidatePrepared: true, published: false}));
