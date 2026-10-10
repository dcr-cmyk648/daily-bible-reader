#!/usr/bin/env node
// Produces a private candidate only. Publish with fresh pointer comparison and readback.
import fs from "node:fs/promises";
import path from "node:path";
import {preparationStatusCandidate} from "./lib/preparation-status.mjs";
const args = process.argv.slice(2);
const resolveBlocker = args.at(-1) === "--resolve-blocker";
if (resolveBlocker) args.pop();
const [state, summary = "", action = "", flag, receiptPath, ...extra] = args;
if (!["running", "blocked", "approval_required", "ready"].includes(state) ||
    extra.length || (flag && (flag !== "--heartbeat" || !receiptPath)) ||
    [summary, action].some(value => value.length > 240 || /[\u0000-\u001f]/.test(value))) {
  throw new Error("Usage: node scripts/prepare-service-status.mjs running|blocked|approval_required|ready summary action [--heartbeat private-receipt.json] [--resolve-blocker]");
}
const base = path.resolve("private-content/private-manifest.json");
const manifest = JSON.parse(await fs.readFile(base, "utf8"));
const heartbeat = receiptPath ? JSON.parse(await fs.readFile(path.resolve(receiptPath), "utf8")) : undefined;
manifest.preparationStatus = preparationStatusCandidate(manifest.preparationStatus, {state, summary, action, heartbeat, resolveBlocker});
const dir = path.resolve("private-content/automation/staging/service-status");
await fs.mkdir(dir, {recursive: true});
await fs.writeFile(path.join(dir, "manifest-candidate.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({state: manifest.preparationStatus.state, candidatePrepared: true, published: false}));
