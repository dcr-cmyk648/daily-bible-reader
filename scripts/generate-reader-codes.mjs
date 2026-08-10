#!/usr/bin/env node

import {createHash, randomBytes} from "node:crypto";
import {chmod, mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function createRecord(authorId, displayName) {
  const readerCode = `DBR-${authorId.toUpperCase()}-${randomBytes(18).toString("base64url")}`;
  return {
    authorId,
    displayName,
    readerCode,
    readerCodeHash: createHash("sha256").update(readerCode, "utf8").digest("hex")
  };
}

const records = [
  createRecord("dustin", "Dustin"),
  createRecord("shane", "Shane")
];

const outputFlag = process.argv.indexOf("--output");
if (outputFlag >= 0) {
  const requestedPath = process.argv[outputFlag + 1];
  if (!requestedPath || requestedPath.startsWith("-")) {
    throw new Error("--output requires a file path.");
  }
  const outputPath = path.resolve(process.cwd(), requestedPath);
  await mkdir(path.dirname(outputPath), {recursive: true});
  await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`, {encoding: "utf8", mode: 0o600, flag: "wx"});
  await chmod(outputPath, 0o600);
  process.stderr.write(`Reader codes written with owner-only permissions to ${requestedPath}. Do not commit, upload, log, or paste this file into chat.\n`);
} else {
  process.stderr.write(
    "Generated locally. Give each reader only their own code, put only readerCodeHash in Script Properties, and do not save this output in Git or chat.\n"
  );
  process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
}
