#!/usr/bin/env node

import {readFile, writeFile, chmod} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const PRIVATE_ROOT = path.join(ROOT, "private-content");

async function readJson(name) {
  return JSON.parse(await readFile(path.join(PRIVATE_ROOT, name), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const [inputs, state, codes] = await Promise.all([
  readJson("deployment-inputs.json"),
  readJson("external-state.json"),
  readJson("reader-codes.json")
]);

assert(validEmail(inputs.dustinGoogleAccount), "Set dustinGoogleAccount in private-content/deployment-inputs.json.");
assert(validEmail(inputs.shaneGoogleAccount), "Set shaneGoogleAccount in private-content/deployment-inputs.json.");
assert(state.drive && state.drive.privateManifestFileId, "Private manifest ID is missing from external state.");
assert(state.comments && state.comments.spreadsheetId, "Comments Sheet ID is missing from external state.");

const byAuthor = Object.fromEntries(codes.map((record) => [record.authorId, record]));
assert(byAuthor.dustin && byAuthor.shane, "Reader-code file must contain Dustin and Shane records.");
assert([byAuthor.dustin, byAuthor.shane].every((record) => /^[a-f0-9]{64}$/.test(record.readerCodeHash)),
  "Reader-code hashes are invalid.");

const authorizedUsers = [
  {
    email: inputs.dustinGoogleAccount.toLowerCase(),
    authorId: "dustin",
    displayName: "Dustin",
    readerCodeHash: byAuthor.dustin.readerCodeHash
  },
  {
    email: inputs.shaneGoogleAccount.toLowerCase(),
    authorId: "shane",
    displayName: "Shane",
    readerCodeHash: byAuthor.shane.readerCodeHash
  }
];

const properties = {
  PRIVATE_MANIFEST_FILE_ID: state.drive.privateManifestFileId,
  COMMENTS_SPREADSHEET_ID: state.comments.spreadsheetId,
  COMMENTS_SHEET_NAME: "comment-events",
  AUTHORIZED_USERS_JSON: JSON.stringify(authorizedUsers)
};

const outputPath = path.join(PRIVATE_ROOT, "script-properties.json");
await writeFile(outputPath, `${JSON.stringify(properties, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
await chmod(outputPath, 0o600);
process.stderr.write("Private Script Properties file written with owner-only permissions. ESV_API_KEY is intentionally absent and must be entered directly in Apps Script.\n");
