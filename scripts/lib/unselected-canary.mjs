import {createHash} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {Script} from "node:vm";
import {transform} from "esbuild";
import {inspectPaths} from "../check-repository-safety.mjs";

const ROOT = process.cwd();
const WEB = "/daily-bible-reader/web/";
const RECORD = "config/unselected-reader-canary.json";
const sha = value => createHash("sha256").update(value).digest("hex");
const read = relative => readFile(path.join(ROOT, relative));

async function expectedCanary() {
  const frontend = JSON.parse(await read("dist/pages/release.json"));
  const config = JSON.parse(await read("dist/pages-pwa/config.json"));
  const id = sha(config.pwaReleaseId + "unselected-reader-canary/v1").slice(0, 16);
  const base = `web/pwa-canary/canaries/${id}/`;
  const clientName = `pwa-client.${id}.js`;
  let client = (await read("app/pages-pwa/client.js")).toString();
  client = client.replace("__DBR_PUBLIC_CONFIG__", JSON.stringify({...config, pwaReleaseId: id}))
    .replace('var FRONTEND_MANIFEST_URL = "../release.json";', `var FRONTEND_MANIFEST_URL = "${WEB}pwa-canary/canaries/${id}/release.json";`)
    .replace('new URL(FRONTEND_MANIFEST_URL, root.location.href)', `new URL("${WEB}", root.location.href)`)
    .replace('new URL("../releases/" + value.releaseId + "/", root.location.href)', `new URL("${WEB}releases/" + value.releaseId + "/", root.location.href)`);
  if (client.includes('var FRONTEND_MANIFEST_URL = "../release.json";') || client.includes("__DBR_PUBLIC_CONFIG__")) {
    throw new Error("CANARY_CLIENT_REPLACEMENT_FAILED");
  }
  const compile = async (source, filename) => {
    const result = await transform(source, {legalComments: "none", lineLimit: 800, minify: true, target: "safari15", loader: "js"});
    new Script(result.code, {filename});
    if (result.code.split("\n").some(line => line.length > 1200)) throw new Error("CANARY_GENERATED_LINE_LIMIT");
    return Buffer.from(result.code);
  };
  let html = (await read("dist/pages-pwa/index.html")).toString();
  html = html.replaceAll(config.pwaReleaseId, id)
    .replaceAll('href="../releases/', 'href="../../../releases/')
    .replaceAll('href="assets/', 'href="../../assets/')
    .replace(`src="assets/pwa-client.${id}.js"`, `src="../../assets/${clientName}"`);
  const manifest = JSON.parse(await read("dist/pages-pwa/manifest.webmanifest"));
  manifest.id = `${WEB}pwa-canary/canaries/${id}/`;
  manifest.name = "Bible Reader — recovery canary";
  manifest.short_name = "Reader canary";
  for (const icon of manifest.icons || []) icon.src = "../../" + icon.src;
  const urls = ["./", "index.html", "manifest.webmanifest", "release.json",
    `../../assets/${clientName}`, ...["apple-touch-icon-180.png", "bible-reader-icon-192.png", "bible-reader-icon-512.png"].map(name => "../../assets/" + name),
    ...Object.values(frontend.assets).map(asset => "../../../" + asset.path)];
  const worker = (await read("app/pages-pwa/service-worker.js")).toString()
    .replaceAll("__DBR_PWA_RELEASE_ID__", id).replace("__DBR_PRECACHE_URLS__", JSON.stringify(urls))
    .replace('var CACHE_PREFIX = "dbr-pages-shell-v1-";', `var CACHE_PREFIX = "dbr-unselected-${id}-";`)
    .replace('new URL("../release.json", self.location.href)', 'new URL("release.json", self.location.href)');
  const files = new Map([
    [base + "index.html", Buffer.from(html)],
    [base + "manifest.webmanifest", Buffer.from(JSON.stringify(manifest, null, 2) + "\n")],
    [base + "release.json", await read("dist/pages/release.json")],
    [base + "service-worker.js", await compile(worker, "canary-service-worker.js")],
    [`web/pwa-canary/assets/${clientName}`, await compile(client, "canary-client.js")]
  ]);
  for (const asset of Object.values(frontend.assets)) files.set("web/" + asset.path, await read("dist/pages/" + asset.path));
  for (const name of ["apple-touch-icon-180.png", "bible-reader-icon-192.png", "bible-reader-icon-512.png"]) {
    files.set("web/pwa-canary/assets/" + name, await read("dist/pages-pwa/assets/" + name));
  }
  return {id, frontendReleaseId: frontend.releaseId, builtPwaReleaseId: config.pwaReleaseId, files,
    url: "https://dcr-cmyk648.github.io" + manifest.id};
}

async function productionFiles() {
  const release = JSON.parse(await read("web/release.json"));
  const config = JSON.parse(await read("web/pwa-canary/config.json"));
  return ["web/release.json", ...Object.values(release.assets).map(asset => "web/" + asset.path),
    ...["index.html", "config.json", "manifest.webmanifest", "service-worker.js"].map(name => "web/pwa-canary/" + name),
    ...["apple-touch-icon-180.png", "bible-reader-icon-192.png", "bible-reader-icon-512.png"].map(name => "web/pwa-canary/assets/" + name),
    `web/pwa-canary/assets/pwa-client.${config.pwaReleaseId}.js`];
}

export async function prepareUnselectedCanary() {
  const candidate = await expectedCanary();
  // Regenerating a candidate must never silently rebaseline changed production.
  if (await hasUnselectedCanary()) {
    const previous = JSON.parse(await read(RECORD));
    if (previous.schemaVersion !== "unselected-reader-canary/v1" || previous.installedPhoneAcceptance !== "pending") {
      throw new Error("CANARY_PRODUCTION_GUARD_MISMATCH");
    }
    for (const [name, hash] of Object.entries(previous.productionHashes || {})) {
      if (sha(await read(name)) !== hash) throw new Error(`CANARY_PRODUCTION_CHANGED: ${name}`);
    }
  }
  const productionHashes = {};
  for (const name of await productionFiles()) productionHashes[name] = sha(await read(name));
  for (const [name, bytes] of candidate.files) {
    let existing;
    try { existing = await read(name); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (existing && !existing.equals(bytes)) throw new Error(`CANARY_IMMUTABILITY_CONFLICT: ${name}`);
    if (!existing) {
      await mkdir(path.dirname(path.join(ROOT, name)), {recursive: true});
      await writeFile(path.join(ROOT, name), bytes);
    }
  }
  const record = {schemaVersion: "unselected-reader-canary/v1", id: candidate.id,
    frontendReleaseId: candidate.frontendReleaseId, builtPwaReleaseId: candidate.builtPwaReleaseId,
    url: candidate.url, installedPhoneAcceptance: "pending", productionHashes};
  await writeFile(path.join(ROOT, RECORD), JSON.stringify(record, null, 2) + "\n");
  const violations = await inspectPaths([...candidate.files.keys(), RECORD]);
  if (violations.length) throw new Error(`CANARY_SAFETY_FAILED: ${violations.join("; ")}`);
  await verifyUnselectedCanary();
  process.stdout.write(`Prepared unselected canary ${candidate.id}: ${candidate.url}\n`);
}

export async function hasUnselectedCanary() {
  try { await read(RECORD); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

export async function verifyUnselectedCanary() {
  const record = JSON.parse(await read(RECORD));
  const candidate = await expectedCanary();
  if (record.schemaVersion !== "unselected-reader-canary/v1" || record.id !== candidate.id ||
      record.frontendReleaseId !== candidate.frontendReleaseId || record.builtPwaReleaseId !== candidate.builtPwaReleaseId ||
      record.url !== candidate.url || record.installedPhoneAcceptance !== "pending") throw new Error("CANARY_BUILD_RECORD_MISMATCH");
  const selected = await productionFiles();
  if (JSON.stringify(Object.keys(record.productionHashes).sort()) !== JSON.stringify(selected.sort())) throw new Error("CANARY_PRODUCTION_GUARD_MISMATCH");
  for (const name of selected) if (sha(await read(name)) !== record.productionHashes[name]) throw new Error(`CANARY_PRODUCTION_CHANGED: ${name}`);
  for (const [name, bytes] of candidate.files) if (!(await read(name)).equals(bytes)) throw new Error(`CANARY_BYTES_MISMATCH: ${name}`);
  const violations = await inspectPaths([...candidate.files.keys(), RECORD]);
  if (violations.length) throw new Error("CANARY_SAFETY_FAILED");
  process.stdout.write(`Unselected canary ${candidate.id} exactly matches source; all selected production files remain unchanged.\n`);
}
