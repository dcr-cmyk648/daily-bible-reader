#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import {readFile} from "node:fs/promises";
import {nativeReviewWorkOrder} from "./lib/mhc-native-review-work-order.mjs";

const root = process.cwd();
const json = file => readFile(file, "utf8").then(JSON.parse);

async function main() {
  if (process.argv.length !== 2) throw new Error("Usage: npm run mhc:native:review:work-order");
  const [plan, appConfig, handoffSchema, transactionSchema, approvalSchema, candidateSchema, reviewSchema] = await Promise.all([
    json(path.join(root,"fixtures/pilot-content/plan.json")), json(path.join(root,"fixtures/pilot-content/app-config.json")),
    json(path.join(root,"schemas/mhc-native-review-handoff.schema.json")), json(path.join(root,"schemas/mhc-native-review-transaction.schema.json")),
    json(path.join(root,"schemas/mhc-native-review-approval.schema.json")), json(path.join(root,"schemas/mhc-native-review-candidate.schema.json")), json(path.join(root,"schemas/mhc-schedule-review.schema.json"))
  ]);
  const report = await nativeReviewWorkOrder({root,workRoot:path.join(root,"private-content/automation/mhc-native-work-items"),privateRoot:path.join(root,"private-content"),canonicalRoot:path.join(root,"private-commentary/mhc"),libraryRoot:path.join(root,"private-commentary/mhc/stores/library"),transactionRoot:path.join(root,"private-content/automation/mhc-native-work-items/transactions"),plan,appConfig,handoffSchema,transactionSchema,approvalSchema,candidateSchema,reviewSchema,runtimeSchemaPath:path.join(root,"schemas/mhc-runtime.schema.json")});
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
main().catch(error => { process.stderr.write(`Native review work order failed: ${error.message}\n`); process.exitCode = 1; });
