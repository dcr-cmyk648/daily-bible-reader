#!/usr/bin/env node

import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import process from "node:process";
import {Script} from "node:vm";
import {transform, version as esbuildVersion} from "esbuild";
import {inspectPaths} from "./check-repository-safety.mjs";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "dist/apps-script");
// Apps Script serves the HTML inside a Google-managed iframe. The installed
// iPhone reader repeatedly rejected minified script lines just above 50,000
// characters while otherwise equivalent deployed artifacts below that boundary
// executed. Keep generated lines close to the known-good unminified releases so
// a small feature can never cross that platform-sensitive cliff again.
const INLINE_SCRIPT_LINE_LIMIT = 800;
const MAX_GENERATED_LINE_LENGTH = 1200;

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
  const [sourceHtml, css, providerPolicy, serverCore, boot, app, highlights, code, manifest, touchIcon] = await Promise.all([
    text("app/frontend/index.html"),
    text("app/frontend/styles.css"),
    text("app/shared/provider-policy.js"),
    text("app/shared/server-core.js"),
    text("app/frontend/boot.js"),
    text("app/frontend/app.js"),
    text("app/frontend/highlights.js"),
    text("app/apps-script/Code.gs"),
    text("app/apps-script/appsscript.json"),
    binary("app/frontend/assets/apple-touch-icon-180.png")
  ]);
  for (const [label, source] of [["provider policy", providerPolicy], ["server core", serverCore], ["boot", boot], ["frontend", app], ["highlights", highlights]]) {
    if (/<\/script/i.test(source)) throw new Error(`${label} contains a closing script token and cannot be inlined safely.`);
  }

  const buildId = createHash("sha256")
    .update([
      `esbuild:${esbuildVersion};target:safari15;minify:true;lineLimit:${INLINE_SCRIPT_LINE_LIMIT}`,
      sourceHtml,
      css,
      providerPolicy,
      serverCore,
      boot,
      app,
      highlights,
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

  const [{code: productionBoot}, {code: productionJavaScript}, {code: productionHighlights}, {code: productionCss}] = await Promise.all([
    transform(boot, {
      legalComments: "none",
      lineLimit: INLINE_SCRIPT_LINE_LIMIT,
      loader: "js",
      minify: true,
      target: "safari12"
    }),
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

  let html = sourceHtml;
  html = assertSingleReplacement(
    html,
    html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, '<meta http-equiv="Content-Security-Policy" content="default-src https://script.google.com https://*.googleusercontent.com; script-src \'unsafe-inline\' https://script.google.com https://*.googleusercontent.com; style-src \'unsafe-inline\'; img-src data: https:; connect-src https://script.google.com https://*.googleusercontent.com; frame-src https://accounts.google.com https://script.google.com https://*.googleusercontent.com; object-src \'none\'; base-uri \'none\'; form-action \'none\'">'),
    "content security policy"
  );
  html = html.replace(/\s*<link rel="manifest" href="manifest\.webmanifest">/, "");
  html = html.replace(/\s*<link rel="apple-touch-icon"[^>]+>/, "");
  html = html.replace(/\s*<link rel="icon"[^>]+>/, "");
  html = assertSingleReplacement(
    html,
    html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${productionCss}\n</style>`),
    "stylesheet"
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
    // A replacement callback is mandatory: minified JavaScript can contain `$&`,
    // which String.replace would otherwise expand to the matched script tag.
    html.replace('<script src="app.js"></script>', () => `<script>\n${productionJavaScript}\n</script>`),
    "frontend scripts"
  );
  html = assertSingleReplacement(
    html,
    html.replace('<script src="highlights.js"></script>', () => `<script>\n${productionHighlights}\n</script>`),
    "optional highlight enhancement"
  );

  const inlineScripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
  if (inlineScripts.length !== 3) {
    throw new Error(`Expected three isolated production inline scripts; found ${inlineScripts.length}.`);
  }
  inlineScripts.forEach((source, index) => {
    const longestLine = Math.max(...source.split("\n").map((line) => line.length));
    if (longestLine > MAX_GENERATED_LINE_LENGTH) {
      throw new Error(
        `Generated inline JavaScript ${index + 1} has a ${longestLine}-character line; ` +
        `the release ceiling is ${MAX_GENERATED_LINE_LENGTH}.`
      );
    }
    try {
      new Script(source, {filename: `Index.inline-${index + 1}.js`});
    } catch (error) {
      throw new Error(`Generated inline JavaScript ${index + 1} is invalid: ${error.message}`);
    }
  });

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
  const scriptDiagnostics = inlineScripts.map((source) => {
    const longestLine = Math.max(...source.split("\n").map((line) => line.length));
    return `${Buffer.byteLength(source, "utf8")}B/${longestLine}ch`;
  }).join(", ");
  process.stdout.write(
    `Apps Script bundle ${buildId} built and inspected at dist/apps-script ` +
    `(code only; ${htmlBytes} HTML bytes; inline scripts ${scriptDiagnostics}).\n`
  );
}

main().catch((error) => {
  process.stderr.write(`Apps Script build failed: ${error.message}\n`);
  process.exitCode = 1;
});
