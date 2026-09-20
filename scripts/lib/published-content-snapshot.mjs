import {copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {reconcileManifestBackedPrefix} from "./active-calendar.mjs";

// Publication validation has its own exact file set. A draft awaiting publication
// in the shared store must neither enter this snapshot nor block another reading.
export async function withPublishedContentSnapshot({root, consume}) {
  const json = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
  const [manifest, privatePlan, activePlan, appConfig] = await Promise.all([
    json("private-content/private-manifest.json"),
    json("fixtures/pilot-content/plan.json"),
    json("config/active-calendar/celebration-bridge-long-term-active.json"),
    json("fixtures/pilot-content/app-config.json")
  ]);
  if (manifest.schemaVersion !== "private-manifest/v1" || !manifest.readings ||
      Array.isArray(manifest.readings)) throw new Error("PUBLISHED_MANIFEST_INVALID");
  const result = reconcileManifestBackedPrefix({
    privatePlan, activePlan, appConfig, manifestReadingIds: Object.keys(manifest.readings)
  });
  if (result.changed) throw new Error("PUBLISHED_PREFIX_RECONCILIATION_REQUIRED");
  const files = privatePlan.entries.flatMap(({readingId}) => {
    if (!/^[A-Za-z0-9_-]+$/.test(readingId) ||
        !manifest.readings[readingId]?.contentFileId || !manifest.readings[readingId]?.metadataFileId) {
      throw new Error("PUBLISHED_READING_BINDING_INVALID");
    }
    return [readingId + ".md", readingId + ".metadata.json"];
  });
  const source = path.join(root, "private-content/bridge/celebration-y3q4");
  const present = (await readdir(source)).filter((name) => !name.startsWith("."));
  const excluded = present.filter((name) => !files.includes(name));
  const temp = await mkdtemp(path.join(os.tmpdir(), "bibleapp-published-validation-"));
  const contentDir = path.join(temp, "content");
  try {
    await mkdir(contentDir);
    for (const filename of files) {
      const from = path.join(source, filename);
      const stat = await lstat(from);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("PUBLISHED_INPUT_NOT_REGULAR");
      await copyFile(from, path.join(contentDir, filename));
    }
    // The same strict validator runs on this complete snapshot. Missing, corrupt,
    // unreviewed, uncited, hash-mismatched and extra admitted files still fail.
    return await consume({contentDir, excludedCount: excluded.length, readingCount: privatePlan.entries.length});
  } finally {
    if (path.dirname(temp) !== path.resolve(os.tmpdir()) ||
        !path.basename(temp).startsWith("bibleapp-published-validation-")) throw new Error("SNAPSHOT_CLEANUP_PATH_INVALID");
    await rm(temp, {recursive: true, force: true});
  }
}
