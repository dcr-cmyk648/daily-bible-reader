#!/usr/bin/env node

import {copyFile, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {inspectPaths} from "./check-repository-safety.mjs";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "dist/apps-script");
const OUTPUT = path.join(ROOT, "dist/apps-script-token-canary");

function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || source.indexOf(startMarker, start + startMarker.length) >= 0) {
    throw new Error(`Could not isolate ${label} in the generated Apps Script source.`);
  }
  return source.slice(0, start) + replacement.trim() + "\n\n" + source.slice(end + 2);
}

const STATUS_DO_GET = `function doGet() {
  return HtmlService.createHtmlOutput(
    "<!doctype html><title>Daily Bible Reader backend</title>" +
    "<p>This private reader backend accepts application requests only.</p>"
  ).setTitle("Daily Bible Reader backend");
}`;

const TOKEN_AUTHORIZATION = `function dbrAuthorizedContext_(readerCode) {
  const raw = PropertiesService.getScriptProperties().getProperty(DBR_PROPERTIES.authorizedUsers);
  let allowedUsers;
  try {
    allowedUsers = raw ? JSON.parse(raw) : [];
  } catch (_) {
    throw dbrError_("ACCESS_DENIED", "Authorized readers are not configured.");
  }
  const presentedReaderCodeHash = dbrHashReaderCode_(readerCode);
  const identity = DBRServerCore.authorizeTokenIdentity({
    allowedUsers: allowedUsers,
    presentedReaderCodeHash: presentedReaderCodeHash
  });
  DBR_TOKEN_RATE_KEY_ = presentedReaderCodeHash.slice(0, 24);
  return {
    identity: identity,
    participants: DBRServerCore.publicParticipants(allowedUsers),
    readerEnrollmentRemembered: false
  };
}`;

const TOKEN_FORGET = `function forgetReaderEnrollment(readerCode) {
  return dbrRpc_(function () {
    dbrAuthorizedContext_(readerCode);
    return {forgotten: true};
  });
}`;

const TOKEN_RATE_LIMIT = `function dbrEnforceRateLimit_(bucket, maximum, windowSeconds) {
  if (!/^[a-f0-9]{24}$/.test(DBR_TOKEN_RATE_KEY_)) {
    throw dbrError_("ACCESS_DENIED", "Private reader authorization is unavailable.");
  }
  const cache = CacheService.getScriptCache();
  const now = Date.now();
  const key = "rate:" + DBR_TOKEN_RATE_KEY_ + ":" + bucket + ":" + Math.floor(now / (windowSeconds * 1000));
  let count = Number(cache.get(key) || 0);
  if (!Number.isFinite(count) || count < 0) count = 0;
  if (count >= maximum) throw dbrError_("RATE_LIMITED", "Too many requests.");
  cache.put(key, String(count + 1), windowSeconds + 5);
}`;

async function main() {
  let code = await readFile(path.join(SOURCE, "Code.gs"), "utf8");
  const manifest = JSON.parse(await readFile(path.join(SOURCE, "appsscript.json"), "utf8"));
  const bridge = await readFile(path.join(ROOT, "app/apps-script-token-canary/TokenBridge.gs"), "utf8");

  code = replaceSection(code, "function doGet() {", "\n\nfunction getBootstrapData", STATUS_DO_GET, "web-app entry point");
  code = replaceSection(code, "function forgetReaderEnrollment(readerCode) {", "\n\nfunction getReadingPayload", TOKEN_FORGET, "token-only forget operation");
  code = replaceSection(code, "function dbrAuthorizedContext_(readerCode) {", "\n\nfunction dbrReadPrivateState_", TOKEN_AUTHORIZATION, "authorization function");
  code = replaceSection(code, "function dbrEnforceRateLimit_(bucket, maximum, windowSeconds) {", "\n\nfunction dbrCommentSheet_", TOKEN_RATE_LIMIT, "rate limiter");
  code = code
    .replace("Enter the reader code assigned to this Google account.", "Enter your private reader code.")
    .replace("That reader code is not valid for this Google account.", "That private reader code is not valid.");
  const appUrlPattern = /ScriptApp\.getService\(\)\.getUrl\(\)/g;
  const appUrlMatches = code.match(appUrlPattern) || [];
  if (appUrlMatches.length !== 2) throw new Error("Could not isolate token-canary update URLs.");
  code = code.replace(appUrlPattern, '"https://dcr-cmyk648.github.io/daily-bible-reader/web/pwa-canary/"');

  delete manifest.executionApi;
  manifest.webapp = {access: "ANYONE_ANONYMOUS", executeAs: "USER_DEPLOYING"};
  manifest.oauthScopes = (manifest.oauthScopes || []).filter((scope) => scope !== "https://www.googleapis.com/auth/userinfo.email");
  if (manifest.executionApi || manifest.webapp.access !== "ANYONE_ANONYMOUS" ||
      manifest.webapp.executeAs !== "USER_DEPLOYING" || manifest.oauthScopes.some((scope) => scope.endsWith("/userinfo.email"))) {
    throw new Error("Could not isolate the owner-executed token canary manifest.");
  }
  if (/Session\.getActiveUser|DBRServerCore\.authorizeIdentity\(/.test(code.slice(
    code.indexOf("function dbrAuthorizedContext_"),
    code.indexOf("function dbrReadPrivateState_")
  ))) {
    throw new Error("Token canary retained accessing-user authorization in its active authorization function.");
  }

  await rm(OUTPUT, {recursive: true, force: true});
  await mkdir(OUTPUT, {recursive: true});
  await Promise.all([
    writeFile(path.join(OUTPUT, "Code.gs"), code, "utf8"),
    copyFile(path.join(SOURCE, "ServerCore.gs"), path.join(OUTPUT, "ServerCore.gs")),
    writeFile(path.join(OUTPUT, "TokenBridge.gs"), bridge, "utf8"),
    writeFile(path.join(OUTPUT, "appsscript.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  ]);
  const paths = ["Code.gs", "ServerCore.gs", "TokenBridge.gs", "appsscript.json"]
    .map((name) => `dist/apps-script-token-canary/${name}`);
  const violations = await inspectPaths(paths);
  if (violations.length) throw new Error(`Token canary bundle safety failure:\n- ${violations.join("\n- ")}`);
  process.stdout.write("Separate owner-executed Apps Script token-web-app canary built; production source and manifest unchanged.\n");
}

main().catch((error) => {
  process.stderr.write(`Apps Script token canary build failed: ${error.message}\n`);
  process.exitCode = 1;
});
