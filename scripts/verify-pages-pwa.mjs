#!/usr/bin/env node

import {readFile, readdir, stat} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const BUILT = path.join(ROOT, "dist/pages-pwa");
const PUBLISHED = path.join(ROOT, "web/pwa-canary");

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
  const files = await filesUnder(BUILT);
  for (const relative of files) {
    const [built, published] = await Promise.all([
      readFile(path.join(BUILT, relative)),
      readFile(path.join(PUBLISHED, relative))
    ]);
    if (!built.equals(published)) throw new Error(`web/pwa-canary/${relative} does not match the current source build.`);
  }
  const config = JSON.parse(await readFile(path.join(BUILT, "config.json"), "utf8"));
  process.stdout.write(`Pages PWA canary ${config.pwaReleaseId} matches the current source build (${files.length} files).\n`);
}

main().catch((error) => {
  process.stderr.write(`Pages PWA verification failed: ${error.message}\n`);
  process.exitCode = 1;
});
