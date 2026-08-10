#!/usr/bin/env node

import {copyFile, mkdir, readFile, readdir, stat} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {inspectPaths} from "./check-repository-safety.mjs";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "dist/pages-pwa");
const DESTINATION = path.join(ROOT, "web/pwa-canary");

async function filesUnder(directory, prefix = "") {
  const names = await readdir(directory);
  const output = [];
  for (const name of names) {
    const relative = path.join(prefix, name);
    const absolute = path.join(directory, name);
    const info = await stat(absolute);
    if (info.isDirectory()) output.push(...await filesUnder(absolute, relative));
    else if (info.isFile()) output.push(relative);
  }
  return output;
}

async function main() {
  const config = JSON.parse(await readFile(path.join(SOURCE, "config.json"), "utf8"));
  if (!/^[a-f0-9]{16}$/.test(String(config.pwaReleaseId || ""))) {
    throw new Error("Build the Pages PWA before publishing it.");
  }
  const files = await filesUnder(SOURCE);
  for (const relative of files) {
    const destination = path.join(DESTINATION, relative);
    await mkdir(path.dirname(destination), {recursive: true});
    await copyFile(path.join(SOURCE, relative), destination);
  }
  const published = files.map((relative) => path.relative(ROOT, path.join(DESTINATION, relative)));
  const violations = await inspectPaths(published);
  if (violations.length) throw new Error(`Pages PWA publication safety failure:\n- ${violations.join("\n- ")}`);
  process.stdout.write(`Prepared Pages PWA canary ${config.pwaReleaseId} in web/pwa-canary/ without deleting prior versioned assets.\n`);
}

main().catch((error) => {
  process.stderr.write(`Pages PWA publication failed: ${error.message}\n`);
  process.exitCode = 1;
});
