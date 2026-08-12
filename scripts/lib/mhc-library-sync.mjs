import {createHash} from "node:crypto";
import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {assertSchemaValid} from "./schema-validator.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function confinedPath(root, relativePath, label) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`${label} must be a non-empty relative path.`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${label} escapes the Henry library root.`);
  }
  return resolved;
}

async function verifiedJson(filePath, expectedSha256, label) {
  const bytes = await readFile(filePath);
  const digest = sha256(bytes);
  if (expectedSha256 && digest !== expectedSha256) {
    throw new Error(`${label} checksum mismatch: expected ${expectedSha256}, received ${digest}.`);
  }
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  return {value, bytes, digest};
}

export async function loadLatestHenryReading({libraryRoot, readingId, runtimeSchemaPath}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/.test(String(readingId || ""))) {
    throw new Error("A stable reading ID is required.");
  }
  const root = path.resolve(libraryRoot);
  const pointerResult = await verifiedJson(path.join(root, "current.json"), null, "Henry library pointer");
  const pointer = pointerResult.value;
  if (pointer.schema_version !== "mhc-library-pointer/v1" ||
      typeof pointer.catalog_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(pointer.catalog_sha256)) {
    throw new Error("Henry library pointer is unsupported or incomplete.");
  }
  const catalogPath = confinedPath(root, pointer.catalog_file, "Henry catalog path");
  const catalogResult = await verifiedJson(catalogPath, pointer.catalog_sha256, "Henry library catalog");
  const catalog = catalogResult.value;
  if (catalog.schema_version !== "mhc-library-catalog/v1" || catalog.plan_version !== pointer.plan_version ||
      !Array.isArray(catalog.readings)) {
    throw new Error("Henry library catalog is unsupported or does not match its pointer.");
  }
  const descriptor = catalog.readings.find((candidate) => candidate.reading_id === readingId);
  if (!descriptor) throw new Error(`The Henry library has no current artifact for ${readingId}.`);
  if (!/^[a-f0-9]{64}$/.test(String(descriptor.sha256 || ""))) {
    throw new Error(`${readingId} has no valid content checksum in the Henry catalog.`);
  }
  const readingPath = confinedPath(root, descriptor.file, `${readingId} artifact path`);
  const readingResult = await verifiedJson(readingPath, descriptor.sha256, `${readingId} Henry artifact`);
  const reading = readingResult.value;
  if (reading.schema_version !== "mhc-portable-reading/v1" || reading.reading_id !== readingId ||
      reading.plan_version !== pointer.plan_version || reading.contains_scripture !== false ||
      !Array.isArray(reading.chapters) || reading.chapters.length < 1 || reading.chapters.length > 5) {
    throw new Error(`${readingId} is not a safe Henry portable reading.`);
  }
  const runtimeSchema = JSON.parse(await readFile(runtimeSchemaPath, "utf8"));
  const runtimes = reading.chapters.map((chapter, index) => {
    const runtime = chapter && chapter.runtime;
    assertSchemaValid(runtime, runtimeSchema, {label: `${readingId} latest Henry runtime ${index + 1}`});
    if (!["in_review", "approved"].includes(runtime.review_status)) {
      throw new Error(`${readingId} newest Henry artifact is ${runtime.review_status}; review it before attachment.`);
    }
    return runtime;
  });
  return {
    pointer,
    catalog,
    descriptor,
    reading,
    runtime: runtimes.length === 1 ? runtimes[0] : null,
    runtimes,
    artifactPath: readingPath,
    artifactSha256: readingResult.digest
  };
}

export function sameHenryRuntime(left, right) {
  return sha256(Buffer.from(JSON.stringify(left || null))) ===
    sha256(Buffer.from(JSON.stringify(right || null)));
}

export async function syncLatestHenryRuntime({
  libraryRoot,
  readingId,
  metadataPath,
  runtimeSchemaPath,
  checkOnly = false
}) {
  const latest = await loadLatestHenryReading({libraryRoot, readingId, runtimeSchemaPath});
  const metadataText = await readFile(metadataPath, "utf8");
  const metadata = JSON.parse(metadataText);
  if (metadata.readingId !== readingId) {
    throw new Error(`${metadataPath} belongs to ${metadata.readingId || "an unknown reading"}, not ${readingId}.`);
  }
  const current = Array.isArray(metadata.verseCommentaries)
    ? metadata.verseCommentaries
    : metadata.verseCommentary ? [metadata.verseCommentary] : [];
  const changed = !sameHenryRuntime(current, latest.runtimes);
  if (checkOnly && changed) {
    const attachedVersion = current.length
      ? current.map((runtime) => `${runtime.prompt_version} at ${runtime.generation_timestamp}`).join(", ")
      : "none";
    const latestVersion = latest.runtimes
      .map((runtime) => `${runtime.prompt_version} at ${runtime.generation_timestamp}`).join(", ");
    throw new Error(`${readingId} has stale Henry commentary (attached ${attachedVersion}; latest ${latestVersion}).`);
  }
  if (changed && !checkOnly) {
    if (latest.runtimes.length === 1) {
      metadata.verseCommentary = latest.runtimes[0];
      delete metadata.verseCommentaries;
    } else {
      metadata.verseCommentaries = latest.runtimes;
      delete metadata.verseCommentary;
    }
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  }
  return {
    changed,
    readingId,
    promptVersion: latest.runtimes.map((runtime) => runtime.prompt_version).join(","),
    generationTimestamp: latest.runtimes.map((runtime) => runtime.generation_timestamp).sort().at(-1),
    chapterCount: latest.runtimes.length,
    artifactSha256: latest.artifactSha256,
    metadataPath
  };
}
