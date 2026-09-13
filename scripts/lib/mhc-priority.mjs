import {createHash} from "node:crypto";
import {lstat,readFile} from "node:fs/promises";
import path from "node:path";
import {assertSchemaValid} from "./schema-validator.mjs";

export const HENRY_CALENDAR_PATH = "config/active-calendar/celebration-bridge-long-term-active.json";
export const HENRY_SELECTION_POLICY = "forward_chronological_then_historical_least_recent";

async function privateJson(file) {
  try {
    const stat=await lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink())throw new Error("Henry priority evidence must be a regular private file.");
    const bytes=await readFile(file);
    return {value:JSON.parse(bytes),bytes};
  } catch(error) { if(error.code==="ENOENT")return null;throw error; }
}

export async function hasHenryPublicationReceipt({privateRoot,readingId,manifest}) {
  try {
    const receipt=await privateJson(path.join(privateRoot,"automation/staging",readingId,"manager-publication-result.json"));
    const metadata=await privateJson(path.join(privateRoot,"bridge/celebration-y3q4",`${readingId}.metadata.json`));
    const r=receipt?.value;
    return Boolean(metadata&&metadata.value.readingId===readingId&&r?.schemaVersion==="mhc-manager-publication-result/v1"&&
      r.readingId===readingId&&r.status==="published_verified"&&r.metadataReadback==="exact_bytes"&&r.manifestReadback==="exact_bytes"&&
      r.liveReadingStatus==="ready"&&r.henryLayerStatus==="complete"&&typeof r.metadataFileId==="string"&&
      r.metadataFileId===manifest?.readings?.[readingId]?.metadataFileId&&
      r.payloadSha256===createHash("sha256").update(metadata.bytes).digest("hex"));
  }catch{return false;}
}

export async function pendingHenryHandoffs({privateRoot,plan,manifest,handoffSchema}) {
  const pending=new Set();
  for(const entry of plan.entries){
    if(!manifest.readings?.[entry.readingId]||entry.kind!=="chapter")continue;
    const handoff=await privateJson(path.join(privateRoot,"automation/mhc-native-work-items/review-staging",entry.readingId,"review-handoff.json"));
    if(!handoff)continue;
    assertSchemaValid(handoff.value,handoffSchema,{label:"Henry priority handoff"});
    if(handoff.value.reading_id!==entry.readingId||handoff.value.plan_version!==plan.planVersion)throw new Error("Henry priority handoff identity is mismatched.");
    if(!await hasHenryPublicationReceipt({privateRoot,readingId:entry.readingId,manifest}))pending.add(entry.readingId);
  }
  return pending;
}

export async function loadHenryPlan(trackedRoot) {
  const json = async relative => JSON.parse(await readFile(path.join(trackedRoot, relative), "utf8"));
  const [prefix, appConfig] = await Promise.all([json("fixtures/pilot-content/plan.json"), json("fixtures/pilot-content/app-config.json")]);
  let active;
  try { active = await json(HENRY_CALENDAR_PATH); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    if(prefix.calendarRevision)throw new Error("Henry runtime is missing its activated factual calendar.");
    return {plan:prefix, appConfig};
  }
  const checksum = createHash("sha256").update(JSON.stringify(active.entries)).digest("hex");
  if (active.planVersion !== prefix.planVersion || active.calendarRevision !== checksum ||
      !Array.isArray(prefix.entries) || prefix.entries.length > active.entries.length ||
      prefix.entries.some((entry,index) => JSON.stringify(entry) !== JSON.stringify(active.entries[index]))) {
    throw new Error("Henry factual calendar does not match its immutable prepared-prefix baseline.");
  }
  const seen = new Set();
  for (const [index,entry] of active.entries.entries()) {
    if (entry.planVersion !== active.planVersion || entry.dayIndex !== index + 1 ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(entry.readingId) || seen.has(entry.readingId)) {
      throw new Error("Henry factual calendar has invalid or duplicate entries.");
    }
    seen.add(entry.readingId);
  }
  return {plan:active, appConfig};
}

export function henryPriorityWindow(appConfig, now = new Date()) {
  const current = new Date(now), start = appConfig?.sharedStartDate;
  const lookaheadDays = appConfig?.futureLookaheadDays;
  if (!Number.isInteger(lookaheadDays) || lookaheadDays < 0 || lookaheadDays > 7) {
    throw new Error("Henry selection requires the configured 0–7 day preparation horizon.");
  }
  if (!Number.isFinite(current.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(String(start || "")) ||
      !Number.isFinite(Date.parse(`${start}T00:00:00Z`)) || new Date(`${start}T00:00:00Z`).toISOString().slice(0,10) !== start) {
    throw new Error("Henry selection requires a valid clock and fixed shared start date.");
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {timeZone:"America/Detroit",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(current).map(p=>[p.type,p.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const currentDay = 1 + (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
  const horizonDate = new Date(Date.parse(`${today}T00:00:00Z`) + lookaheadDays * 86400000).toISOString().slice(0,10);
  return {today,horizonDate,currentDay,horizonDay:currentDay+lookaheadDays};
}
