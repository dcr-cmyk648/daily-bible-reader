#!/usr/bin/env node

import {createHash} from "node:crypto";
import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {Script} from "node:vm";
import {transform, version as esbuildVersion} from "esbuild";
import {inspectPaths} from "./check-repository-safety.mjs";

const ROOT = process.cwd();
const APPS_SCRIPT_OUTPUT = path.join(ROOT, "dist/apps-script");
const PAGES_OUTPUT = path.join(ROOT, "dist/pages");
const INLINE_SCRIPT_LINE_LIMIT = 800;
const MAX_GENERATED_LINE_LENGTH = 1200;
const STATIC_LOADER_VERSION = 1;
const PAGES_ORIGIN = "https://dcr-cmyk648.github.io";
const PAGES_ROOT_PATH = "/daily-bible-reader/web/";
const PAGES_MANIFEST_URL = `${PAGES_ORIGIN}${PAGES_ROOT_PATH}release.json`;
const PAGES_RELEASE_PATH_PREFIX = `${PAGES_ROOT_PATH}releases/`;
const PAGES_FAVICON_URL = `${PAGES_ORIGIN}/daily-bible-reader/app/frontend/assets/apple-touch-icon-180.png`;

const CRITICAL_CSS = `
:root{color-scheme:dark;background:#0b1110;color:#eef3ef}
html,body{margin:0;min-height:100%;background:#0b1110;color:#eef3ef}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.app-header{display:flex;justify-content:space-between;gap:1rem;padding:1rem 1.25rem;border-bottom:1px solid #365149}
.page-shell{padding:1.25rem;max-width:72rem;margin:0 auto}
.eyebrow{color:#d9a875;text-transform:uppercase;letter-spacing:.13em;font-size:.75rem;font-weight:700}
.status-pill,.sync-label,.muted{color:#b8c3bf}
.state-banner{padding:1rem;border:1px solid #8f5555;border-radius:.75rem;background:#3c2426;color:#ffd9d9}
[hidden]{display:none!important}
`;

async function text(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

function assertSingleReplacement(before, after, label) {
  if (before === after) throw new Error(`Could not replace ${label} while building production output.`);
  return after;
}

function digest(algorithm, value, length) {
  const output = createHash(algorithm).update(value).digest(length ? "hex" : "base64");
  return length ? output.slice(0, length) : output;
}

function assetRecord(name, releaseId, filename, source) {
  return {
    name,
    path: `releases/${releaseId}/${filename}`,
    integrity: `sha384-${digest("sha384", source)}`,
    bytes: Buffer.byteLength(source, "utf8")
  };
}

function longestLine(source) {
  return Math.max(...source.split("\n").map((line) => line.length));
}

function validateInlineScript(source, index) {
  const maximum = longestLine(source);
  if (maximum > MAX_GENERATED_LINE_LENGTH) {
    throw new Error(
      `Generated inline JavaScript ${index + 1} has a ${maximum}-character line; ` +
      `the release ceiling is ${MAX_GENERATED_LINE_LENGTH}.`
    );
  }
  try {
    new Script(source, {filename: `Index.inline-${index + 1}.js`});
  } catch (error) {
    throw new Error(`Generated inline JavaScript ${index + 1} is invalid: ${error.message}`);
  }
}

async function main() {
  const [sourceHtml, css, providerPolicy, serverCore, boot, staticLoader, app, highlights, code, manifest] = await Promise.all([
    text("app/frontend/index.html"),
    text("app/frontend/styles.css"),
    text("app/shared/provider-policy.js"),
    text("app/shared/server-core.js"),
    text("app/frontend/boot.js"),
    text("app/frontend/static-loader.js"),
    text("app/frontend/app.js"),
    text("app/frontend/highlights.js"),
    text("app/apps-script/Code.gs"),
    text("app/apps-script/appsscript.json")
  ]);

  for (const [label, source] of [["provider policy", providerPolicy], ["server core", serverCore], ["boot", boot], ["static loader", staticLoader], ["frontend", app], ["highlights", highlights]]) {
    if (/<\/script/i.test(source)) throw new Error(`${label} contains a closing script token and cannot be embedded safely.`);
  }

  const frontendReleaseId = digest("sha256", [
    `esbuild:${esbuildVersion};target:safari15;minify:true;lineLimit:${INLINE_SCRIPT_LINE_LIMIT};delivery:pages-assets-v1`,
    sourceHtml,
    css,
    providerPolicy,
    app,
    highlights
  ].join("\n--DBR-FRONTEND-INPUT--\n"), 16);

  let productionApp = assertSingleReplacement(
    app,
    app.replace(
      /\/\* DBR_LOCAL_ADAPTER_START \*\/[\s\S]*?\/\* DBR_LOCAL_ADAPTER_END \*\//,
      `function localAdapter() {
    throw appError("Authenticated Apps Script is required by this production build.", "BRIDGE_UNAVAILABLE");
  }`
    ),
    "local development adapter"
  );
  productionApp = productionApp
    .replaceAll("__DBR_BUILD_ID__", frontendReleaseId)
    .replaceAll("__DBR_DELIVERY_MODE__", "pages-assets");
  if (productionApp.includes("__DBR_BUILD_ID__") || productionApp.includes("__DBR_DELIVERY_MODE__")) {
    throw new Error("Could not inject the static frontend release identity.");
  }
  if (/fixtures\/|GEN-001\.mock|privateDraft|\/__private\//i.test(productionApp)) {
    throw new Error("Production frontend still contains a development/private route.");
  }

  const [{code: productionJavaScript}, {code: productionHighlights}, {code: productionCss}] = await Promise.all([
    transform(`${providerPolicy}\n${productionApp}`, {
      legalComments: "none",
      lineLimit: INLINE_SCRIPT_LINE_LIMIT,
      loader: "js",
      minify: true,
      target: "safari15"
    }),
    transform(highlights, {
      legalComments: "none",
      lineLimit: INLINE_SCRIPT_LINE_LIMIT,
      loader: "js",
      minify: true,
      target: "safari12"
    }),
    transform(css, {
      legalComments: "none",
      lineLimit: INLINE_SCRIPT_LINE_LIMIT,
      loader: "css",
      minify: true,
      target: "safari15"
    })
  ]);

  new Script(productionJavaScript, {filename: "pages-core.js"});
  new Script(productionHighlights, {filename: "pages-highlights.js"});
  const releaseManifest = {
    schemaVersion: "dbr-static-release/v1",
    loaderVersion: STATIC_LOADER_VERSION,
    releaseId: frontendReleaseId,
    assets: {
      styles: assetRecord("styles", frontendReleaseId, "styles.css", productionCss),
      core: assetRecord("core", frontendReleaseId, "app.js", productionJavaScript),
      highlights: assetRecord("highlights", frontendReleaseId, "highlights.js", productionHighlights)
    }
  };

  await rm(PAGES_OUTPUT, {recursive: true, force: true});
  const releaseOutput = path.join(PAGES_OUTPUT, "releases", frontendReleaseId);
  await mkdir(releaseOutput, {recursive: true});
  await Promise.all([
    writeFile(path.join(PAGES_OUTPUT, "release.json"), `${JSON.stringify(releaseManifest, null, 2)}\n`, "utf8"),
    writeFile(path.join(releaseOutput, "app.js"), productionJavaScript, "utf8"),
    writeFile(path.join(releaseOutput, "highlights.js"), productionHighlights, "utf8"),
    writeFile(path.join(releaseOutput, "styles.css"), productionCss, "utf8")
  ]);

  const serverBuildId = digest("sha256", [
    `esbuild:${esbuildVersion};shell:pages-assets-v1;loader:${STATIC_LOADER_VERSION};lineLimit:${INLINE_SCRIPT_LINE_LIMIT}`,
    sourceHtml,
    CRITICAL_CSS,
    boot,
    staticLoader,
    serverCore,
    code,
    manifest,
    PAGES_MANIFEST_URL,
    PAGES_FAVICON_URL
  ].join("\n--DBR-SERVER-INPUT--\n"), 16);

  const productionCode = code
    .replaceAll("__DBR_BUILD_ID__", serverBuildId)
    .replaceAll("__DBR_FAVICON_DATA_URL__", PAGES_FAVICON_URL);
  if (productionCode.includes("__DBR_BUILD_ID__") || productionCode.includes("__DBR_FAVICON_DATA_URL__")) {
    throw new Error("Could not inject the server build ID and static favicon URL.");
  }

  const configuredLoader = staticLoader
    .replaceAll("__DBR_PAGES_MANIFEST_URL__", PAGES_MANIFEST_URL)
    .replaceAll("__DBR_PAGES_ORIGIN__", PAGES_ORIGIN)
    .replaceAll("__DBR_PAGES_RELEASE_PATH_PREFIX__", PAGES_RELEASE_PATH_PREFIX);
  if (/__DBR_PAGES_[A-Z_]+__/.test(configuredLoader)) {
    throw new Error("Could not inject the static asset allowlist into the Apps Script loader.");
  }
  const [{code: productionBoot}, {code: productionLoader}] = await Promise.all([
    transform(boot, {
      legalComments: "none",
      lineLimit: INLINE_SCRIPT_LINE_LIMIT,
      loader: "js",
      minify: true,
      target: "safari12"
    }),
    transform(configuredLoader, {
      legalComments: "none",
      lineLimit: INLINE_SCRIPT_LINE_LIMIT,
      loader: "js",
      minify: true,
      target: "safari15"
    })
  ]);

  let html = sourceHtml;
  const csp = `default-src 'none'; script-src 'unsafe-inline' ${PAGES_ORIGIN} https://script.google.com https://*.googleusercontent.com; style-src 'unsafe-inline' ${PAGES_ORIGIN}; img-src data: ${PAGES_ORIGIN}; connect-src ${PAGES_ORIGIN} https://script.google.com https://*.googleusercontent.com; frame-src https://accounts.google.com https://script.google.com https://*.googleusercontent.com; object-src 'none'; base-uri 'none'; form-action 'none'`;
  html = assertSingleReplacement(
    html,
    html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, `<meta http-equiv="Content-Security-Policy" content="${csp}">`),
    "content security policy"
  );
  html = html.replace(/\s*<link rel="manifest" href="manifest\.webmanifest">/, "");
  html = html.replace(/\s*<link rel="apple-touch-icon"[^>]+>/, "");
  html = html.replace(/\s*<link rel="icon"[^>]+>/, "");
  html = assertSingleReplacement(
    html,
    html.replace('<link rel="stylesheet" href="styles.css">', `<style id="dbrCriticalStyles">${CRITICAL_CSS}</style>`),
    "critical stylesheet"
  );
  html = html.replace(/\s*<script src="\.\.\/shared\/provider-policy\.js"><\/script>/, "");
  html = html.replace(/\s*<script src="\.\.\/shared\/server-core\.js"><\/script>/, "");
  html = assertSingleReplacement(
    html,
    html.replace('<script src="boot.js"></script>', () => `<script>\n${productionBoot}\n</script>`),
    "startup watchdog"
  );
  html = assertSingleReplacement(
    html,
    html.replace('<script src="app.js"></script>', () => `<script>\n${productionLoader}\n</script>`),
    "static application loader"
  );
  html = html.replace(/\s*<script src="highlights\.js"><\/script>/, "");

  const inlineScripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
  if (inlineScripts.length !== 2) {
    throw new Error(`Expected only the watchdog and static loader inline; found ${inlineScripts.length} scripts.`);
  }
  inlineScripts.forEach(validateInlineScript);
  if (/dailyBibleReaderFactory|function productionAdapter|DBR_LOCAL_ADAPTER_START/.test(html)) {
    throw new Error("Apps Script HTML still contains the application core instead of the static loader.");
  }

  await rm(APPS_SCRIPT_OUTPUT, {recursive: true, force: true});
  await mkdir(APPS_SCRIPT_OUTPUT, {recursive: true});
  await Promise.all([
    writeFile(path.join(APPS_SCRIPT_OUTPUT, "Index.html"), html, "utf8"),
    writeFile(path.join(APPS_SCRIPT_OUTPUT, "Code.gs"), productionCode, "utf8"),
    writeFile(path.join(APPS_SCRIPT_OUTPUT, "ServerCore.gs"), serverCore, "utf8"),
    writeFile(path.join(APPS_SCRIPT_OUTPUT, "appsscript.json"), manifest, "utf8")
  ]);

  const outputPaths = [
    "dist/apps-script/Index.html",
    "dist/apps-script/Code.gs",
    "dist/apps-script/ServerCore.gs",
    "dist/apps-script/appsscript.json",
    "dist/pages/release.json",
    `dist/pages/releases/${frontendReleaseId}/app.js`,
    `dist/pages/releases/${frontendReleaseId}/highlights.js`,
    `dist/pages/releases/${frontendReleaseId}/styles.css`
  ];
  const violations = await inspectPaths(outputPaths);
  if (violations.length) throw new Error(`Generated bundle safety failure:\n- ${violations.join("\n- ")}`);
  if (/fixtures\/|GEN-001\.mock|private-content|privateDraft|\/__private\/|ESV_API_KEY\s*[=:]\s*["'][^"']{12,}/i.test(html + productionJavaScript)) {
    throw new Error("Generated public output contains a fixture/private/secret indicator.");
  }

  const htmlBytes = Buffer.byteLength(html, "utf8");
  const scriptDiagnostics = inlineScripts.map((source) => `${Buffer.byteLength(source, "utf8")}B/${longestLine(source)}ch`).join(", ");
  const assetDiagnostics = Object.values(releaseManifest.assets).map((asset) => `${asset.name}:${asset.bytes}B`).join(", ");
  process.stdout.write(
    `Hybrid bundle built: server ${serverBuildId}, frontend ${frontendReleaseId}; ` +
    `Apps Script HTML ${htmlBytes}B with inline ${scriptDiagnostics}; Pages ${assetDiagnostics}.\n`
  );
}

main().catch((error) => {
  process.stderr.write(`Production build failed: ${error.message}\n`);
  process.exitCode = 1;
});
