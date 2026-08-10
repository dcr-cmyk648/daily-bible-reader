#!/usr/bin/env node

import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import process from "node:process";
import {transform, version as esbuildVersion} from "esbuild";
import {inspectPaths} from "./check-repository-safety.mjs";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "dist/apps-script");

async function text(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function binary(relativePath) {
  return readFile(path.join(ROOT, relativePath));
}

function assertSingleReplacement(before, after, label) {
  if (before === after) throw new Error(`Could not replace ${label} while building Apps Script HTML.`);
  return after;
}

async function main() {
  const [sourceHtml, css, providerPolicy, serverCore, app, code, manifest, touchIcon] = await Promise.all([
    text("app/frontend/index.html"),
    text("app/frontend/styles.css"),
    text("app/shared/provider-policy.js"),
    text("app/shared/server-core.js"),
    text("app/frontend/app.js"),
    text("app/apps-script/Code.gs"),
    text("app/apps-script/appsscript.json"),
    binary("app/frontend/assets/apple-touch-icon-180.png")
  ]);
  for (const [label, source] of [["provider policy", providerPolicy], ["server core", serverCore], ["frontend", app]]) {
    if (/<\/script/i.test(source)) throw new Error(`${label} contains a closing script token and cannot be inlined safely.`);
  }

  const buildId = createHash("sha256")
    .update([
      `esbuild:${esbuildVersion};target:safari15;minify:true`,
      sourceHtml,
      css,
      providerPolicy,
      serverCore,
      app,
      code,
      manifest,
      touchIcon.toString("base64")
    ].join("\n--DBR-BUILD-INPUT--\n"))
    .digest("hex")
    .slice(0, 16);

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
  productionApp = productionApp.replaceAll("__DBR_BUILD_ID__", buildId);
  const touchIconData = `data:image/png;base64,${touchIcon.toString("base64")}`;
  const productionCode = code
    .replaceAll("__DBR_BUILD_ID__", buildId)
    .replaceAll("__DBR_FAVICON_DATA_URL__", touchIconData);
  if (productionApp.includes("__DBR_BUILD_ID__") || productionCode.includes("__DBR_BUILD_ID__") ||
      productionCode.includes("__DBR_FAVICON_DATA_URL__")) {
    throw new Error("Could not inject the production build ID and favicon.");
  }
  if (/fixtures\/|GEN-001\.mock/i.test(productionApp)) {
    throw new Error("Production frontend still contains a development fixture reference.");
  }

  const [{code: productionJavaScript}, {code: productionCss}] = await Promise.all([
    transform(`${providerPolicy}\n${productionApp}`, {
      legalComments: "none",
      loader: "js",
      minify: true,
      target: "safari15"
    }),
    transform(css, {
      legalComments: "none",
      loader: "css",
      minify: true,
      target: "safari15"
    })
  ]);

  let html = sourceHtml;
  html = assertSingleReplacement(
    html,
    html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, '<meta http-equiv="Content-Security-Policy" content="default-src https://script.google.com https://*.googleusercontent.com; script-src \'unsafe-inline\' https://script.google.com https://*.googleusercontent.com; style-src \'unsafe-inline\'; img-src data: https:; connect-src https://script.google.com https://*.googleusercontent.com; frame-src https://accounts.google.com https://script.google.com https://*.googleusercontent.com; object-src \'none\'; base-uri \'none\'; form-action \'none\'">'),
    "content security policy"
  );
  html = html.replace(/\s*<link rel="manifest" href="manifest\.webmanifest">/, "");
  html = html.replace(/\s*<link rel="apple-touch-icon"[^>]+>/, "");
  html = html.replace(/\s*<link rel="icon"[^>]+>/, "");
  html = assertSingleReplacement(html, html.replace('<link rel="stylesheet" href="styles.css">', `<style>\n${productionCss}\n</style>`), "stylesheet");
  html = html.replace(/\s*<script src="\.\.\/shared\/provider-policy\.js"><\/script>/, "");
  html = html.replace(/\s*<script src="\.\.\/shared\/server-core\.js"><\/script>/, "");
  html = assertSingleReplacement(
    html,
    html.replace('<script src="app.js"></script>', `<script>\n${productionJavaScript}\n</script>`),
    "frontend scripts"
  );

  await rm(OUTPUT, {recursive: true, force: true});
  await mkdir(OUTPUT, {recursive: true});
  await Promise.all([
    writeFile(path.join(OUTPUT, "Index.html"), html, "utf8"),
    writeFile(path.join(OUTPUT, "Code.gs"), productionCode, "utf8"),
    writeFile(path.join(OUTPUT, "ServerCore.gs"), serverCore, "utf8"),
    writeFile(path.join(OUTPUT, "appsscript.json"), manifest, "utf8")
  ]);
  const outputs = ["dist/apps-script/Index.html", "dist/apps-script/Code.gs", "dist/apps-script/ServerCore.gs", "dist/apps-script/appsscript.json"];
  const violations = await inspectPaths(outputs);
  if (violations.length) throw new Error(`Generated bundle safety failure:\n- ${violations.join("\n- ")}`);
  if (/fixtures\/|GEN-001\.mock|private-content|privateDraft|\/__private\/|ESV_API_KEY\s*[=:]\s*["'][^"']{12,}/i.test(html)) {
    throw new Error("Generated HTML contains a fixture/private/secret indicator.");
  }
  const htmlBytes = Buffer.byteLength(html, "utf8");
  process.stdout.write(
    `Apps Script bundle ${buildId} built and inspected at dist/apps-script (code only; ${htmlBytes} HTML bytes).\n`
  );
}

main().catch((error) => {
  process.stderr.write(`Apps Script build failed: ${error.message}\n`);
  process.exitCode = 1;
});
