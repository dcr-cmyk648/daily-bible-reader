#!/usr/bin/env node

import {readFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {assertSchemaValid} from "./lib/schema-validator.mjs";

const ROOT = process.cwd();
const DEFAULT_REGISTRY = "fixtures/pilot-content/source-registry.json";
const CONSULTED_STATUSES = new Set(["consulted", "included"]);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function normalizedLocator(value) {
  return value.trim().toLowerCase().replace(/^https?:\/\/(?:www\.)?/, "").replace(/\/$/, "");
}

export function validateRegistryProvenance(registry) {
  const ids = new Set();
  const locators = new Map();

  for (const source of registry.sources) {
    assert(!ids.has(source.sourceId), `${source.sourceId}: duplicate source ID`);
    ids.add(source.sourceId);

    const locator = normalizedLocator(source.urlOrCitation);
    const prior = locators.get(locator);
    assert(!prior, `${source.sourceId}: duplicates locator already used by ${prior}`);
    locators.set(locator, source.sourceId);

    if (CONSULTED_STATUSES.has(source.summaryUseStatus)) {
      assert(source.accessDate, `${source.sourceId}: consulted source requires accessDate`);
      assert(source.accessMethod, `${source.sourceId}: consulted source requires accessMethod`);
      assert(!/(?:search result|snippet only|catalog only|publisher metadata only)/i.test(source.accessMethod),
        `${source.sourceId}: discovery metadata cannot establish consultation`);
    }

    if (source.summaryUseStatus === "included") {
      assert(source.includedReadings.length > 0, `${source.sourceId}: included source needs at least one reading ID`);
    } else {
      assert(source.includedReadings.length === 0,
        `${source.sourceId}: only a source included in a completed synthesis may claim includedReadings`);
    }

    if (["copyrighted", "unknown"].includes(source.rightsStatus)) {
      assert(source.rawTextStorageAllowed === false,
        `${source.sourceId}: copyrighted/unknown-rights raw text storage must be disabled`);
    }

    if (source.rawTextStorageAllowed) {
      assert(["public_domain", "open_license"].includes(source.rightsStatus),
        `${source.sourceId}: raw storage requires public-domain or open-license status`);
      assert(source.license, `${source.sourceId}: raw storage requires an exact license statement`);
      assert(source.allowedUses.some((use) => /stor|redistribut|reproduc/i.test(use)),
        `${source.sourceId}: raw storage requires an explicit allowed use`);
    }

    if (source.summaryUseStatus.startsWith("excluded_")) {
      assert(source.qualityTier === "excluded" || source.summaryUseStatus === "excluded_rights",
        `${source.sourceId}: quality/duplicate exclusions must use the excluded tier`);
    }

    const criticalPerspective = (source.traditionOrPerspective || []).some((perspective) =>
      /(?:modern critical|historical-critical|classic critical)/i.test(String(perspective))
    );
    if (criticalPerspective) {
      assert(source.affiliationContext, `${source.sourceId}: critical source requires verified or explicitly unclear affiliation context`);
      assert(source.synthesisPriority, `${source.sourceId}: critical source requires an explicit synthesis role`);
      if (source.summaryUseStatus === "inaccessible") {
        assert(source.synthesisPriority === "inventory_only",
          `${source.sourceId}: inaccessible critical source must remain inventory-only`);
      }
      if (source.affiliationContext === "secular_academic") {
        assert(source.synthesisPriority !== "core",
          `${source.sourceId}: secular critical work may supply context or a major counterposition, not the confessional core`);
      }
    }

    const serialized = JSON.stringify(source);
    assert(!/"(?:rawText|rawSourceText|fullCommentaryText|sourceText|quotation)"\s*:/.test(serialized),
      `${source.sourceId}: registry contains a forbidden raw-source or quotation field`);
  }

  return {
    total: registry.sources.length,
    byStatus: Object.fromEntries([...new Set(registry.sources.map((source) => source.summaryUseStatus))]
      .sort()
      .map((status) => [status, registry.sources.filter((source) => source.summaryUseStatus === status).length])),
    byTier: Object.fromEntries([...new Set(registry.sources.map((source) => source.qualityTier))]
      .sort()
      .map((tier) => [tier, registry.sources.filter((source) => source.qualityTier === tier).length]))
  };
}

async function main() {
  const requestedPath = process.argv[2] || DEFAULT_REGISTRY;
  const registryPath = path.resolve(ROOT, requestedPath);
  const [registryText, schemaText] = await Promise.all([
    readFile(registryPath, "utf8"),
    readFile(path.join(ROOT, "schemas/source.schema.json"), "utf8")
  ]);
  const registry = JSON.parse(registryText);
  const schema = JSON.parse(schemaText);

  assertSchemaValid(registry, schema, {label: `Source registry ${requestedPath}`});
  const report = validateRegistryProvenance(registry);
  process.stdout.write(`Source registry validation passed (${report.total} sources; ` +
    `${Object.entries(report.byStatus).map(([status, count]) => `${status}=${count}`).join(", ") || "empty"}).\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`Source registry validation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
