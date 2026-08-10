#!/usr/bin/env node

import {copyFile, mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {inspectPaths} from "./check-repository-safety.mjs";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "dist/pages");
const DESTINATION = path.join(ROOT, "web");

function validateManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== "dbr-static-release/v1" || manifest.loaderVersion !== 1 ||
      !/^[a-f0-9]{16}$/.test(String(manifest.releaseId || "")) || !manifest.assets) {
    throw new Error("Generated Pages release manifest is invalid.");
  }
  for (const name of ["styles", "core", "highlights"]) {
    const asset = manifest.assets[name];
    const expectedPrefix = `releases/${manifest.releaseId}/`;
    if (!asset || asset.name !== name || !String(asset.path || "").startsWith(expectedPrefix) ||
        !/^sha384-[A-Za-z0-9+/]{64}$/.test(String(asset.integrity || ""))) {
      throw new Error(`Generated Pages ${name} asset is invalid.`);
    }
  }
  return manifest;
}

async function main() {
  const manifestText = await readFile(path.join(SOURCE, "release.json"), "utf8");
  const manifest = validateManifest(JSON.parse(manifestText));
  const publishedPaths = [];
  for (const asset of Object.values(manifest.assets)) {
    const source = path.join(SOURCE, asset.path);
    const destination = path.join(DESTINATION, asset.path);
    await mkdir(path.dirname(destination), {recursive: true});
    await copyFile(source, destination);
    publishedPaths.push(path.relative(ROOT, destination));
  }
  await mkdir(DESTINATION, {recursive: true});
  await writeFile(path.join(DESTINATION, "release.json"), manifestText, "utf8");
  publishedPaths.push("web/release.json");

  const violations = await inspectPaths(publishedPaths);
  if (violations.length) throw new Error(`Pages publication safety failure:\n- ${violations.join("\n- ")}`);
  process.stdout.write(`Prepared code-only Pages release ${manifest.releaseId} in web/.\n`);
}

main().catch((error) => {
  process.stderr.write(`Pages publication failed: ${error.message}\n`);
  process.exitCode = 1;
});
