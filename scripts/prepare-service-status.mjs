#!/usr/bin/env node
// Produces a private candidate only. Publish with fresh pointer comparison and readback.
import fs from "node:fs/promises";
import path from "node:path";
import {preparationStatusAfterPublication, preparationStatusCandidate} from "./lib/preparation-status.mjs";
import {liveHealthCredentialsFromStores, verifyLiveHorizon, verifyLiveReading} from "./lib/live-horizon-health.mjs";
const args = process.argv.slice(2);
const resolveBlocker = args.at(-1) === "--resolve-blocker";
if (resolveBlocker) args.pop();
const [state, summary = "", action = "", flag, receiptPath, ...extra] = args;
const afterPublication = state === "--after-publication";
if ((!afterPublication && !["running", "blocked", "approval_required", "ready"].includes(state)) ||
    (afterPublication && (args.length !== 3 || resolveBlocker || !["daily", "review"].includes(summary) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(action))) ||
    extra.length || (flag && (flag !== "--heartbeat" || !receiptPath)) ||
    [summary, action].some(value => value.length > 240 || /[\u0000-\u001f]/.test(value))) {
  throw new Error("Usage: node scripts/prepare-service-status.mjs --after-publication daily|review readingId OR running|blocked|approval_required|ready summary action [--heartbeat private-receipt.json] [--resolve-blocker]");
}
const base = path.resolve("private-content/private-manifest.json");
const manifest = JSON.parse(await fs.readFile(base, "utf8"));
if (afterPublication) {
  const [lane, readingId] = [summary, action];
  if (!Object.hasOwn(manifest.readings || {}, readingId)) throw new Error("PREPARATION_PUBLICATION_READBACK_REQUIRED");
  const readJson = file => fs.readFile(file, "utf8").then(JSON.parse);
  const credentials = liveHealthCredentialsFromStores(await readJson("config/pages-pwa-public.json"),
    await readJson("private-content/reader-codes.json"));
  const options = {fetchImpl: (url, init) => fetch(url, {...init, signal: AbortSignal.timeout(45000)})};
  const named = await verifyLiveReading(credentials, readingId, options);
  const health = await verifyLiveHorizon(credentials, options);
  manifest.preparationStatus = preparationStatusAfterPublication(manifest.preparationStatus, {lane, readingId, named, health});
} else {
  const heartbeat = receiptPath ? JSON.parse(await fs.readFile(path.resolve(receiptPath), "utf8")) : undefined;
  manifest.preparationStatus = preparationStatusCandidate(manifest.preparationStatus, {state, summary, action, heartbeat, resolveBlocker});
}
const dir = path.resolve("private-content/automation/staging/service-status");
await fs.mkdir(dir, {recursive: true});
await fs.writeFile(path.join(dir, "manifest-candidate.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({state: manifest.preparationStatus.state, candidatePrepared: true, published: false}));
