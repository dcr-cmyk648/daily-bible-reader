#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import path from "node:path";
const npmCli = process.env.npm_execpath;
if (!npmCli || !path.isAbsolute(npmCli)) throw new Error("Run through npm run check:published.");
const result = spawnSync(process.execPath, [npmCli, "run", "check"], {
  cwd: process.cwd(), stdio: "inherit", windowsHide: true,
  env: {...process.env, DBR_PRIVATE_VALIDATION_SCOPE: "manifest"}
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
