#!/usr/bin/env node

import {readFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const BUILT = path.join(ROOT, "dist/pages");
const PUBLISHED = path.join(ROOT, "web");

async function same(relativePath) {
  const [built, published] = await Promise.all([
    readFile(path.join(BUILT, relativePath)),
    readFile(path.join(PUBLISHED, relativePath))
  ]);
  return built.equals(published);
}

async function main() {
  const builtManifest = JSON.parse(await readFile(path.join(BUILT, "release.json"), "utf8"));
  const publishedManifest = JSON.parse(await readFile(path.join(PUBLISHED, "release.json"), "utf8"));
  if (JSON.stringify(builtManifest) !== JSON.stringify(publishedManifest)) {
    throw new Error("web/release.json does not match the current source build; run npm run publish:pages.");
  }
  const paths = ["release.json", ...Object.values(builtManifest.assets || {}).map((asset) => asset.path)];
  for (const relativePath of paths) {
    if (!await same(relativePath)) {
      throw new Error(`${relativePath} does not match the current source build; run npm run publish:pages.`);
    }
  }
  process.stdout.write(`Code-only Pages release ${builtManifest.releaseId} matches the current source build.\n`);
}

main().catch((error) => {
  process.stderr.write(`Pages verification failed: ${error.message}\n`);
  process.exitCode = 1;
});
