#!/usr/bin/env node

import {copyFile, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {inspectPaths} from "./check-repository-safety.mjs";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "dist/apps-script");
const OUTPUT = path.join(ROOT, "dist/apps-script-api-canary");

async function main() {
  const manifest = JSON.parse(await readFile(path.join(SOURCE, "appsscript.json"), "utf8"));
  delete manifest.webapp;
  manifest.executionApi = {access: "ANYONE"};
  if (manifest.webapp || manifest.executionApi.access !== "ANYONE") {
    throw new Error("Could not isolate the API-executable canary manifest.");
  }
  await rm(OUTPUT, {recursive: true, force: true});
  await mkdir(OUTPUT, {recursive: true});
  await Promise.all([
    copyFile(path.join(SOURCE, "Code.gs"), path.join(OUTPUT, "Code.gs")),
    copyFile(path.join(SOURCE, "ServerCore.gs"), path.join(OUTPUT, "ServerCore.gs")),
    copyFile(path.join(SOURCE, "Index.html"), path.join(OUTPUT, "Index.html")),
    writeFile(path.join(OUTPUT, "appsscript.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  ]);
  const paths = ["Code.gs", "ServerCore.gs", "Index.html", "appsscript.json"]
    .map((name) => `dist/apps-script-api-canary/${name}`);
  const violations = await inspectPaths(paths);
  if (violations.length) throw new Error(`API canary bundle safety failure:\n- ${violations.join("\n- ")}`);
  process.stdout.write("Separate Apps Script API-executable canary bundle built; production web-app manifest unchanged.\n");
}

main().catch((error) => {
  process.stderr.write(`Apps Script API canary build failed: ${error.message}\n`);
  process.exitCode = 1;
});
