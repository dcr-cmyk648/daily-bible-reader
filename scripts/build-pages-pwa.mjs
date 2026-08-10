#!/usr/bin/env node

import {createHash} from "node:crypto";
import {copyFile, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {Script} from "node:vm";
import {transform, version as esbuildVersion} from "esbuild";
import {inspectPaths} from "./check-repository-safety.mjs";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "dist/pages-pwa");
const PUBLIC_CONFIG = path.join(ROOT, "config/pages-pwa-public.json");
const PWA_SCOPE_PATH = "/daily-bible-reader/web/pwa-canary/";
const MAX_PUBLIC_ASSET_BYTES = 750_000;
const GOOGLE_AUTH_GATE = `
    <section id="googleAuthGate" class="access-gate" aria-labelledby="googleAuthHeading" hidden>
      <div class="access-card">
        <p class="eyebrow">Private Google access</p>
        <h1 id="googleAuthHeading">Connect your Google account</h1>
        <p id="googleAuthExplanation">The installed reader keeps its public shell on this phone. Google authorization is still required before the private backend can be refreshed.</p>
        <p id="googleAuthStatus" class="muted" role="status" aria-live="polite">No private request has been sent.</p>
        <button id="googleAuthButton" class="primary-button" type="button">Continue with Google</button>
      </div>
    </section>`;
const PWA_UPDATE_PANEL = `
      <section id="pwaUpdatePanel" class="update-panel global-panel" aria-labelledby="pwaUpdateHeading" hidden>
        <div>
          <p class="eyebrow">Update downloaded</p>
          <h2 id="pwaUpdateHeading">A newer reader is ready</h2>
          <p>The new public shell has been verified and can replace this installed version now.</p>
        </div>
        <button id="pwaUpdateButton" class="primary-button" type="button">Restart with update</button>
      </section>`;

async function text(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

function digest(value, length = 16) {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function assertSingleReplacement(before, after, label) {
  if (before === after) throw new Error(`Could not replace ${label} in the Pages PWA.`);
  return after;
}

function validateFrontendManifest(value) {
  if (!value || value.schemaVersion !== "dbr-static-release/v1" || value.loaderVersion !== 1 ||
      !/^[a-f0-9]{16}$/.test(String(value.releaseId || "")) || !value.assets) {
    throw new Error("Build the static frontend release before building the Pages PWA.");
  }
  for (const name of ["styles", "core", "highlights"]) {
    const asset = value.assets[name];
    if (!asset || asset.name !== name || !String(asset.path || "").startsWith(`releases/${value.releaseId}/`) ||
        !/^sha384-[A-Za-z0-9+/]{64}$/.test(String(asset.integrity || "")) ||
        !Number.isInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > MAX_PUBLIC_ASSET_BYTES) {
      throw new Error(`Static frontend ${name} metadata is invalid.`);
    }
  }
  return value;
}

function validatePublicConfig(value) {
  if (!value || value.schemaVersion !== "dbr-pages-public-config/v1" || typeof value.enabled !== "boolean") {
    throw new Error("Pages PWA public configuration is invalid.");
  }
  if (value.enabled) {
    if (!/^\d{6,}-[a-z0-9_-]{12,}\.apps\.googleusercontent\.com$/.test(String(value.oauthClientId || "")) ||
        !/^[A-Za-z0-9_-]{20,}$/.test(String(value.apiDeploymentId || ""))) {
      throw new Error("Enabled Pages PWA configuration requires valid public OAuth and API deployment IDs.");
    }
  } else if (value.oauthClientId || value.apiDeploymentId) {
    throw new Error("Disabled Pages PWA configuration must not contain partial identifiers.");
  }
  const extra = Object.keys(value).filter((key) => !["schemaVersion", "enabled", "oauthClientId", "apiDeploymentId"].includes(key));
  if (extra.length) throw new Error(`Pages PWA public configuration has unexpected fields: ${extra.join(", ")}.`);
  return value;
}

function validateNoExecutableInlineScripts(html) {
  const executable = Array.from(html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi))
    .filter((match) => !/\bsrc\s*=/.test(match[0]) && !/type=["']application\/json["']/.test(match[0]));
  if (executable.length) throw new Error("Pages PWA HTML must not contain executable inline JavaScript.");
}

async function main() {
  const [sourceHtml, clientSource, workerSource, manifestText, frontendManifestText, configText] = await Promise.all([
    text("app/frontend/index.html"),
    text("app/pages-pwa/client.js"),
    text("app/pages-pwa/service-worker.js"),
    text("app/frontend/manifest.webmanifest"),
    readFile(path.join(ROOT, "dist/pages/release.json"), "utf8"),
    readFile(PUBLIC_CONFIG, "utf8")
  ]);
  const frontendManifest = validateFrontendManifest(JSON.parse(frontendManifestText));
  const publicConfig = validatePublicConfig(JSON.parse(configText));
  const pwaReleaseId = digest([
    `esbuild:${esbuildVersion};target:safari15;delivery:pages-pwa-v1`,
    sourceHtml,
    clientSource,
    workerSource,
    manifestText,
    frontendManifestText,
    configText
  ].join("\n--DBR-PWA-INPUT--\n"));
  const builtConfig = Object.freeze({...publicConfig, pwaReleaseId});
  const configuredClient = assertSingleReplacement(
    clientSource,
    clientSource.replace("__DBR_PUBLIC_CONFIG__", JSON.stringify(builtConfig)),
    "public PWA configuration"
  );
  if (configuredClient.includes("__DBR_PUBLIC_CONFIG__")) throw new Error("Pages PWA configuration placeholder remains.");
  const transformedClient = await transform(configuredClient, {
    legalComments: "none",
    lineLimit: 800,
    loader: "js",
    minify: true,
    target: "safari15"
  });
  new Script(transformedClient.code, {filename: "pages-pwa-client.js"});

  const clientFilename = `pwa-client.${pwaReleaseId}.js`;
  const precacheUrls = [
    "./",
    "index.html",
    "manifest.webmanifest",
    "assets/apple-touch-icon-180.png",
    "assets/bible-reader-icon-192.png",
    "assets/bible-reader-icon-512.png",
    `assets/${clientFilename}`,
    "../release.json",
    ...Object.values(frontendManifest.assets).map((asset) => `../${asset.path}`)
  ];
  let configuredWorker = workerSource
    .replaceAll("__DBR_PWA_RELEASE_ID__", pwaReleaseId)
    .replace("__DBR_PRECACHE_URLS__", JSON.stringify(precacheUrls));
  if (/__DBR_(?:PWA_RELEASE_ID|PRECACHE_URLS)__/.test(configuredWorker)) {
    throw new Error("Pages PWA service-worker placeholder remains.");
  }
  const transformedWorker = await transform(configuredWorker, {
    legalComments: "none",
    lineLimit: 800,
    loader: "js",
    minify: true,
    target: "safari15"
  });
  new Script(transformedWorker.code, {filename: "pages-pwa-service-worker.js"});

  const style = frontendManifest.assets.styles;
  const pwaCsp = [
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com/gsi/client",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
    "img-src 'self' data:",
    "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://script.googleapis.com",
    "frame-src https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join("; ");
  let html = sourceHtml;
  html = assertSingleReplacement(
    html,
    html.replace("    </header>\n\n    <section id=\"readerCodeGate\"", `    </header>\n${GOOGLE_AUTH_GATE}\n\n    <section id="readerCodeGate"`),
    "Google authorization gate"
  );
  html = assertSingleReplacement(
    html,
    html.replace(
      '        <a id="updateLink" class="button-link" href="#" target="_top" rel="noopener">Load latest version</a>\n      </section>',
      '        <a id="updateLink" class="button-link" href="#" target="_top" rel="noopener">Load latest version</a>\n      </section>\n' + PWA_UPDATE_PANEL
    ),
    "PWA update panel"
  );
  html = assertSingleReplacement(
    html,
    html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, `<meta http-equiv="Content-Security-Policy" content="${pwaCsp}">`),
    "PWA content security policy"
  );
  html = html.replace(/<meta http-equiv="Cache-Control"[^>]+>\s*/g, "");
  html = html.replace(/<meta http-equiv="Pragma"[^>]+>\s*/g, "");
  html = html.replace(/<meta http-equiv="Expires"[^>]+>\s*/g, "");
  html = assertSingleReplacement(
    html,
    html.replace('<link rel="stylesheet" href="styles.css">', `<link rel="stylesheet" href="../${style.path}" integrity="${style.integrity}" crossorigin="anonymous">`),
    "verified stylesheet"
  );
  html = html.replace(/<script src="boot\.js"><\/script>\s*/, "");
  html = html.replace(/<script src="\.\.\/shared\/provider-policy\.js"><\/script>\s*/, "");
  html = html.replace(/<script src="\.\.\/shared\/server-core\.js"><\/script>\s*/, "");
  html = html.replace(/<script src="app\.js"><\/script>\s*/, "");
  html = assertSingleReplacement(
    html,
    html.replace('<script src="highlights.js"></script>', `<script src="assets/${clientFilename}"></script>`),
    "versioned PWA launcher"
  );
  html = html.replaceAll('href="assets/', 'href="assets/');
  html = html.replace('<html lang="en">', `<html lang="en" data-pwa-release="${pwaReleaseId}">`);
  validateNoExecutableInlineScripts(html);
  if (/google\.script\.run|ESV_API_KEY|private-content|script\.google\.com\/macros\/s\//i.test(html)) {
    throw new Error("Pages PWA shell contains a private bridge or secret indicator.");
  }

  const pwaManifest = JSON.parse(manifestText);
  pwaManifest.id = PWA_SCOPE_PATH;
  pwaManifest.start_url = "./";
  pwaManifest.scope = "./";
  pwaManifest.display = "standalone";
  pwaManifest.orientation = "any";

  await rm(OUTPUT, {recursive: true, force: true});
  await mkdir(path.join(OUTPUT, "assets"), {recursive: true});
  await Promise.all([
    writeFile(path.join(OUTPUT, "index.html"), html, "utf8"),
    writeFile(path.join(OUTPUT, "manifest.webmanifest"), `${JSON.stringify(pwaManifest, null, 2)}\n`, "utf8"),
    writeFile(path.join(OUTPUT, "service-worker.js"), transformedWorker.code, "utf8"),
    writeFile(path.join(OUTPUT, "config.json"), `${JSON.stringify(builtConfig, null, 2)}\n`, "utf8"),
    writeFile(path.join(OUTPUT, "assets", clientFilename), transformedClient.code, "utf8"),
    copyFile(path.join(ROOT, "app/frontend/assets/apple-touch-icon-180.png"), path.join(OUTPUT, "assets/apple-touch-icon-180.png")),
    copyFile(path.join(ROOT, "app/frontend/assets/bible-reader-icon-192.png"), path.join(OUTPUT, "assets/bible-reader-icon-192.png")),
    copyFile(path.join(ROOT, "app/frontend/assets/bible-reader-icon-512.png"), path.join(OUTPUT, "assets/bible-reader-icon-512.png"))
  ]);
  const publicPaths = [
    "dist/pages-pwa/index.html",
    "dist/pages-pwa/manifest.webmanifest",
    "dist/pages-pwa/service-worker.js",
    "dist/pages-pwa/config.json",
    `dist/pages-pwa/assets/${clientFilename}`,
    "dist/pages-pwa/assets/apple-touch-icon-180.png",
    "dist/pages-pwa/assets/bible-reader-icon-192.png",
    "dist/pages-pwa/assets/bible-reader-icon-512.png"
  ];
  const violations = await inspectPaths(publicPaths);
  if (violations.length) throw new Error(`Pages PWA safety failure:\n- ${violations.join("\n- ")}`);
  process.stdout.write(`Pages PWA canary ${pwaReleaseId} built against frontend ${frontendManifest.releaseId}; Google access ${publicConfig.enabled ? "configured" : "disabled"}.\n`);
}

main().catch((error) => {
  process.stderr.write(`Pages PWA build failed: ${error.message}\n`);
  process.exitCode = 1;
});
