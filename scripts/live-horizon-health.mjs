#!/usr/bin/env node

import {readFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {liveHealthCredentialsFromStores, verifyLiveHorizon} from "./lib/live-horizon-health.mjs";

const PUBLIC_CONFIG_PATH = path.join(process.cwd(), "config", "pages-pwa-public.json");
const READER_CODES_PATH = path.join(process.cwd(), "private-content", "reader-codes.json");

function report(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main() {
  if (process.argv.length !== 2) throw Object.assign(new Error("LIVE_HEALTH_ARGUMENTS_INVALID"), {code: "LIVE_HEALTH_ARGUMENTS_INVALID"});
  let credentials;
  try {
    const [publicConfig, readerCodes] = await Promise.all([
      readFile(PUBLIC_CONFIG_PATH, "utf8").then(JSON.parse),
      readFile(READER_CODES_PATH, "utf8").then(JSON.parse)
    ]);
    credentials = liveHealthCredentialsFromStores(publicConfig, readerCodes);
  } catch (_) {
    throw Object.assign(new Error("LIVE_HEALTH_CREDENTIALS_INVALID"), {code: "LIVE_HEALTH_CREDENTIALS_INVALID"});
  }
  const result = await verifyLiveHorizon(credentials);
  report(result);
  if (result.status !== "ready") process.exitCode = 1;
}

main().catch((error) => {
  report({status: "error", code: error && error.code || "LIVE_HEALTH_FAILED"});
  process.exitCode = 1;
});
