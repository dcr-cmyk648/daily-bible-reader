#!/usr/bin/env node

import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {assertSchemaValid} from "./lib/schema-validator.mjs";
import {buildMhcBackfillWorkOrder, selectMhcBackfillCandidate} from "./lib/mhc-backfill-work-order.mjs";

const ROOT = process.cwd();
const PRIVATE_CONTENT = path.join(ROOT, "private-content");
const LIBRARY_ROOT = path.join(ROOT, "private-commentary", "mhc", "stores", "library");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readJson(filePath, optional = false) {
  try { return JSON.parse(await readFile(filePath, "utf8")); }
  catch (error) { if (optional && error.code === "ENOENT") return null; throw error; }
}

function confinedPath(root, relativePath, label) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`${label} must be a non-empty relative path.`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${label} escapes the private Henry library.`);
  }
  return resolved;
}

function lowestReviewState(runtimes) {
  const statuses = runtimes.map((runtime) => runtime.review_status);
  if (statuses.includes("unreviewed") || statuses.includes("changes_requested")) return "unreviewed";
  if (statuses.includes("in_review")) return "in_review";
  if (statuses.length && statuses.every((status) => status === "approved")) return "approved";
  throw new Error("The current Henry artifact has an unsupported review-state combination.");
}

async function loadLibraryState(readingId, planVersion) {
  const pointer = await readJson(path.join(LIBRARY_ROOT, "current.json"), true);
  if (!pointer) return "missing";
  const activationSchema = await readJson(path.join(ROOT, "schemas", "mhc-activation.schema.json"));
  assertSchemaValid(pointer, {...activationSchema, $ref: "#/$defs/pointer"}, {label: "Henry library pointer"});
  if (pointer.plan_version !== planVersion) throw new Error("Henry library pointer does not match the active plan.");
  const catalogPath = confinedPath(LIBRARY_ROOT, pointer.catalog_file, "Henry catalog path");
  const catalogBytes = await readFile(catalogPath);
  if (sha256(catalogBytes) !== pointer.catalog_sha256) throw new Error("Henry library catalog checksum mismatch.");
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  assertSchemaValid(catalog, {...activationSchema, $ref: "#/$defs/catalog"}, {label: "Henry library catalog"});
  const descriptor = catalog.readings.find((item) => item.reading_id === readingId);
  if (!descriptor) return "missing";
  const readingPath = confinedPath(LIBRARY_ROOT, descriptor.file, `${readingId} artifact path`);
  const readingBytes = await readFile(readingPath);
  if (sha256(readingBytes) !== descriptor.sha256) throw new Error(`${readingId} Henry artifact checksum mismatch.`);
  const reading = JSON.parse(readingBytes.toString("utf8"));
  const [storeSchema, runtimeSchema] = await Promise.all([
    readJson(path.join(ROOT, "schemas", "mhc-window-store.schema.json")),
    readJson(path.join(ROOT, "schemas", "mhc-runtime.schema.json"))
  ]);
  assertSchemaValid(reading, {...storeSchema, $ref: "#/$defs/reading"}, {
    label: `${readingId} portable Henry artifact`,
    externalSchemas: {"mhc-runtime.schema.json": runtimeSchema}
  });
  if (reading.plan_version !== planVersion || reading.reading_id !== readingId || reading.contains_scripture !== false) {
    throw new Error(`${readingId} Henry artifact does not match the active plan or storage policy.`);
  }
  return lowestReviewState(reading.chapters.map((chapter) => chapter.runtime));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--compact", "--help", "-h"].includes(arg))) {
    throw new Error("Usage: node scripts/mhc-backfill-work-order.mjs [--compact]");
  }
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write("Usage: node scripts/mhc-backfill-work-order.mjs [--compact]\n");
    return;
  }
  const [plan, manifest, schema] = await Promise.all([
    readJson(path.join(ROOT, "fixtures", "pilot-content", "plan.json")),
    readJson(path.join(PRIVATE_CONTENT, "private-manifest.json")),
    readJson(path.join(ROOT, "schemas", "mhc-backfill-work-order.schema.json"))
  ]);
  const metadataByReadingId = new Map();
  await Promise.all(plan.entries.map(async (entry) => {
    const metadata = await readJson(path.join(PRIVATE_CONTENT, "bridge", "celebration-y3q4", `${entry.readingId}.metadata.json`), true);
    if (metadata) metadataByReadingId.set(entry.readingId, metadata);
  }));
  const candidate = selectMhcBackfillCandidate({
    plan,
    metadataByReadingId,
    manifestReadingIds: Object.keys(manifest.readings || {})
  });
  const libraryState = candidate ? await loadLibraryState(candidate.entry.readingId, plan.planVersion) : null;
  const workOrder = buildMhcBackfillWorkOrder({
    plan,
    candidate,
    libraryState,
    issuedAt: new Date().toISOString()
  });
  assertSchemaValid(workOrder, schema, {label: "Matthew Henry backfill work order"});
  process.stdout.write(`${JSON.stringify(workOrder, null, args.includes("--compact") ? 0 : 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Matthew Henry backfill work order failed: ${error.message}\n`);
  process.exitCode = 1;
});
