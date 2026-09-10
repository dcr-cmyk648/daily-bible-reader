import {createRequire} from "node:module";
import {randomBytes} from "node:crypto";

const require = createRequire(import.meta.url);
const readerApp = require("../../app/frontend/app.js");

const TOKEN_ORIGIN = "https://dcr-cmyk648.github.io";
const BRIDGE_VERSION = "dbr-form-bridge/v1";
const BRIDGE_CHANNEL = "dbr-rpc-response/v1";
const TOKEN_ENDPOINT = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
const TOKEN_RESPONSE_ORIGIN = /^(?:https:\/\/script\.google\.com|https:\/\/script\.googleusercontent\.com|https:\/\/n-[a-z0-9-]+-script\.googleusercontent\.com)$/;
// Large reviewed private-commentary payloads can exceed the bridge response
// limit when the whole current-through-T+7 window is requested at once.
const HORIZON_PAYLOAD_BATCH_SIZE = 4;

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeHorizonPayloadBatch(planVersion, requestedBatches, batches) {
  const requestedIds = requestedBatches.flat();
  if (new Set(requestedIds).size !== requestedIds.length || requestedBatches.length !== batches.length) {
    throw failure("LIVE_HEALTH_PAYLOAD_BATCH_INVALID");
  }
  const payloads = Object.create(null);
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const requestedIdsInBatch = requestedBatches[index];
    if (!isObjectRecord(batch) || batch.planVersion !== planVersion || !isObjectRecord(batch.payloads)) {
      throw failure("LIVE_HEALTH_PAYLOAD_BATCH_INVALID");
    }
    const payloadIds = Object.keys(batch.payloads);
    if (payloadIds.length !== requestedIdsInBatch.length ||
        payloadIds.some((readingId) => !requestedIdsInBatch.includes(readingId)) ||
        payloadIds.some((readingId) => Object.prototype.hasOwnProperty.call(payloads, readingId))) {
      throw failure("LIVE_HEALTH_PAYLOAD_BATCH_INVALID");
    }
    Object.assign(payloads, batch.payloads);
  }
  if (Object.keys(payloads).length !== requestedIds.length ||
      requestedIds.some((readingId) => !Object.prototype.hasOwnProperty.call(payloads, readingId))) {
    throw failure("LIVE_HEALTH_PAYLOAD_BATCH_INVALID");
  }
  return {planVersion, payloads};
}

export function validateLiveHealthCredentials(input) {
  if (!input || input.schemaVersion !== "dbr-live-health-credentials/v1" ||
      !TOKEN_ENDPOINT.test(safeString(input.backendWebAppUrl)) ||
      safeString(input.readerCode).trim().length < 12 || safeString(input.readerCode).trim().length > 128 ||
      /[\u0000-\u001F\u007F]/.test(safeString(input.readerCode))) {
    throw failure("LIVE_HEALTH_CREDENTIALS_INVALID");
  }
  return {
    backendWebAppUrl: input.backendWebAppUrl,
    readerCode: input.readerCode
  };
}

export function liveHealthCredentialsFromStores(publicConfig, readerCodes) {
  const dustin = Array.isArray(readerCodes)
    ? readerCodes.find((record) => record && record.authorId === "dustin")
    : null;
  if (!publicConfig || publicConfig.schemaVersion !== "dbr-pages-public-config/v2" ||
      publicConfig.enabled !== true || !dustin) {
    throw failure("LIVE_HEALTH_CREDENTIALS_INVALID");
  }
  return validateLiveHealthCredentials({
    schemaVersion: "dbr-live-health-credentials/v1",
    backendWebAppUrl: publicConfig.backendWebAppUrl,
    readerCode: dustin.readerCode
  });
}

function randomHex(byteLength, randomBytesFn) {
  return randomBytesFn(byteLength).toString("hex");
}

function decodeEscapesOnce(input) {
  let output = "";
  for (let index = 0; index < input.length; index += 1) {
    const character = input.charAt(index);
    if (character !== "\\" || index + 1 >= input.length) {
      output += character;
      continue;
    }
    const next = input.charAt(index + 1);
    if (next === "x" && /^[0-9a-f]{2}$/i.test(input.slice(index + 2, index + 4))) {
      output += String.fromCodePoint(Number.parseInt(input.slice(index + 2, index + 4), 16));
      index += 3;
    } else if (next === "u" && /^[0-9a-f]{4}$/i.test(input.slice(index + 2, index + 6))) {
      output += String.fromCodePoint(Number.parseInt(input.slice(index + 2, index + 6), 16));
      index += 5;
    } else if ({n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v"}[next]) {
      output += {n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v"}[next];
      index += 1;
    } else {
      output += next;
      index += 1;
    }
  }
  return output;
}

function parseJsonObject(fragment) {
  if (fragment.charAt(0) !== "{") return null;
  let depth = 0;
  let quote = false;
  let escaped = false;
  for (let index = 0; index < fragment.length; index += 1) {
    const character = fragment.charAt(index);
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") quote = false;
      continue;
    }
    if (character === "\"") quote = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(fragment.slice(0, index + 1));
        } catch (_) {
          return null;
        }
      }
    }
  }
  return null;
}

function parseBridgePayload(html) {
  const marker = "window.top.postMessage(";
  const source = String(html || "");
  const start = source.indexOf(marker);
  if (start < 0) throw failure("LIVE_HEALTH_BRIDGE_INVALID");
  let fragment = source.slice(start + marker.length);
  // HtmlService may return the script body directly or with its JavaScript
  // string escapes encoded again. Decode only until a complete leading JSON
  // object can be parsed, with a strict small bound.
  for (let layer = 0; layer <= 3; layer += 1) {
    const parsed = parseJsonObject(fragment);
    if (parsed) return parsed;
    fragment = decodeEscapesOnce(fragment);
  }
  throw failure("LIVE_HEALTH_BRIDGE_INVALID");
}

export async function callLiveHealthBridge(credentials, method, args, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const randomBytesFn = options.randomBytesFn || randomBytes;
  if (typeof fetchImpl !== "function") throw failure("LIVE_HEALTH_TRANSPORT_UNAVAILABLE");
  const requestId = `rpc-${randomHex(16, randomBytesFn)}`;
  const responseNonce = randomHex(24, randomBytesFn);
  const body = new URLSearchParams({
    action: "dbr-rpc",
    transport_version: BRIDGE_VERSION,
    request_id: requestId,
    response_nonce: responseNonce,
    method,
    args_json: JSON.stringify(args),
    client_origin: TOKEN_ORIGIN
  });
  let response;
  try {
    response = await fetchImpl(credentials.backendWebAppUrl, {method: "POST", body, redirect: "follow"});
  } catch (_) {
    throw failure("LIVE_HEALTH_TRANSPORT_UNAVAILABLE");
  }
  if (!response || !response.ok || !TOKEN_RESPONSE_ORIGIN.test(new URL(response.url || credentials.backendWebAppUrl).origin)) {
    throw failure("LIVE_HEALTH_TRANSPORT_UNAVAILABLE");
  }
  const payload = parseBridgePayload(await response.text());
  if (payload.channel !== BRIDGE_CHANNEL || payload.requestId !== requestId || payload.responseNonce !== responseNonce) {
    throw failure("LIVE_HEALTH_BRIDGE_INVALID");
  }
  if (payload.ok !== true || !("result" in payload)) throw failure("LIVE_HEALTH_BACKEND_REJECTED");
  const rpc = payload.result;
  if (!rpc || rpc.ok !== true || !("data" in rpc)) throw failure("LIVE_HEALTH_BACKEND_REJECTED");
  return rpc.data;
}

export function evaluateLiveHorizon(bootstrap, payloadBatch, now = new Date()) {
  try {
    const plan = bootstrap && bootstrap.plan;
    const config = bootstrap && bootstrap.config;
    const schedule = readerApp.calculateSchedule(plan, config, now);
    const entries = plan && Array.isArray(plan.entries) ? plan.entries : [];
    const startIndex = schedule.status === "before_start" ? 0 : schedule.status === "pilot_complete"
      ? entries.length : Math.max(0, schedule.calendarDayIndex - 1);
    const horizon = entries.slice(startIndex, startIndex + 8);
    const prepared = readerApp.preparedReadingIdSet(bootstrap, plan);
    const payloads = payloadBatch && payloadBatch.payloads && typeof payloadBatch.payloads === "object"
      ? payloadBatch.payloads : {};
    if (!payloadBatch || payloadBatch.planVersion !== plan.planVersion) throw failure("LIVE_HEALTH_PAYLOAD_BATCH_INVALID");
    const missingPreparedReadingIds = horizon.filter((entry) => !prepared.has(entry.readingId)).map((entry) => entry.readingId);
    const missingPayloadReadingIds = horizon.filter((entry) => !Object.prototype.hasOwnProperty.call(payloads, entry.readingId))
      .map((entry) => entry.readingId);
    const componentFailures = horizon.flatMap((entry) => {
      const report = readerApp.readingPreparationReport(payloads[entry.readingId], entry);
      return report.prepared ? [] : [{readingId: entry.readingId, missingComponentIds: report.missingComponentIds}];
    });
    return {
      status: !missingPreparedReadingIds.length && !missingPayloadReadingIds.length && !componentFailures.length ? "ready" : "not_ready",
      effectiveDate: readerApp.calendarDateInTimeZone(now, config.timezone),
      target: horizon.length,
      readingIds: horizon.map((entry) => entry.readingId),
      preparedCount: horizon.filter((entry) => prepared.has(entry.readingId)).length,
      missingPreparedReadingIds,
      missingPayloadReadingIds,
      componentFailures
    };
  } catch (error) {
    if (error && error.code && String(error.code).startsWith("LIVE_HEALTH_")) throw error;
    throw failure("LIVE_HEALTH_BOOTSTRAP_INVALID");
  }
}

export function evaluateHenryLayerReadiness(bootstrap, payloadBatch, now = new Date()) {
  try {
    const plan = bootstrap && bootstrap.plan;
    const config = bootstrap && bootstrap.config;
    const schedule = readerApp.calculateSchedule(plan, config, now);
    const entries = plan && Array.isArray(plan.entries) ? plan.entries : [];
    const startIndex = schedule.status === "before_start" ? 0 : schedule.status === "pilot_complete"
      ? entries.length : Math.max(0, schedule.calendarDayIndex - 1);
    const horizon = entries.slice(startIndex, startIndex + 8).filter((entry) => entry.kind === "chapter");
    const payloads = payloadBatch && payloadBatch.payloads && typeof payloadBatch.payloads === "object"
      ? payloadBatch.payloads : {};
    const completeReadingIds = [];
    const fallbackReadingIds = [];
    const unavailableReadingIds = [];
    horizon.forEach((entry) => {
      const payload = payloads[entry.readingId];
      const report = readerApp.readingPreparationReport(payload, entry);
      if (readerApp.hasCompleteHenryVerseLayer(payload, entry)) completeReadingIds.push(entry.readingId);
      else if (report.prepared && report.components.find((component) => component.id === "henry")?.ready) fallbackReadingIds.push(entry.readingId);
      else unavailableReadingIds.push(entry.readingId);
    });
    return {
      status: unavailableReadingIds.length ? "unavailable" : fallbackReadingIds.length ? "debt" : "complete",
      target: horizon.length,
      completeCount: completeReadingIds.length,
      debtCount: fallbackReadingIds.length,
      completeReadingIds,
      fallbackReadingIds,
      unavailableReadingIds
    };
  } catch (_) {
    throw failure("LIVE_HEALTH_HENRY_STATUS_INVALID");
  }
}

export function evaluateLiveReading(bootstrap, payloadBatch, readingId) {
  try {
    if (typeof readingId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(readingId)) {
      throw failure("LIVE_HEALTH_READING_ID_INVALID");
    }
    const plan = bootstrap && bootstrap.plan;
    const entries = Array.isArray(plan?.entries) ? plan.entries : [];
    const matches = entries.filter((entry) => entry && entry.readingId === readingId);
    if (matches.length !== 1) throw failure("LIVE_HEALTH_READING_ID_INVALID");
    const prepared = readerApp.preparedReadingIdSet(bootstrap, plan);
    if (!prepared.has(readingId)) throw failure("LIVE_HEALTH_READING_NOT_PREPARED");
    if (!payloadBatch || payloadBatch.planVersion !== plan.planVersion || !payloadBatch.payloads || typeof payloadBatch.payloads !== "object") {
      throw failure("LIVE_HEALTH_PAYLOAD_BATCH_INVALID");
    }
    const payloadIds = Object.keys(payloadBatch.payloads);
    if (payloadIds.some((id) => id !== readingId)) throw failure("LIVE_HEALTH_PAYLOAD_BATCH_INVALID");
    const payload = payloadBatch.payloads[readingId];
    if (!payload) {
      return {status:"not_ready",readingId,prepared:true,missingPayload:true,missingComponentIds:[],henryLayerStatus:"unavailable"};
    }
    const report = readerApp.readingPreparationReport(payload, matches[0]);
    const henryLayerStatus = readerApp.hasCompleteHenryVerseLayer(payload, matches[0]) ? "complete" :
      report.components.find((component) => component.id === "henry")?.ready ? "fallback" : "unavailable";
    return {status:report.prepared ? "ready" : "not_ready",readingId,prepared:true,missingPayload:false,missingComponentIds:report.missingComponentIds,henryLayerStatus};
  } catch (error) {
    if (error?.code && String(error.code).startsWith("LIVE_HEALTH_")) throw error;
    throw failure("LIVE_HEALTH_BOOTSTRAP_INVALID");
  }
}

export async function verifyLiveReading(credentials, readingId, options = {}) {
  const bootstrap = await callLiveHealthBridge(credentials, "getBootstrapData", [credentials.readerCode], options);
  let plan, matches, prepared;
  try {
    plan = bootstrap && bootstrap.plan;
    matches = Array.isArray(plan?.entries) ? plan.entries.filter((entry) => entry && entry.readingId === readingId) : [];
    prepared = readerApp.preparedReadingIdSet(bootstrap, plan);
  } catch (_) {
    throw failure("LIVE_HEALTH_BOOTSTRAP_INVALID");
  }
  if (matches.length !== 1 || !prepared.has(readingId)) {
    return evaluateLiveReading(bootstrap, {planVersion: plan?.planVersion, payloads:{}}, readingId);
  }
  const payloadBatch = await callLiveHealthBridge(credentials, "getReadingPayloads", [credentials.readerCode, [readingId]], options);
  return evaluateLiveReading(bootstrap, payloadBatch, readingId);
}

export async function verifyLiveHorizon(credentials, options = {}) {
  const bootstrap = await callLiveHealthBridge(credentials, "getBootstrapData", [credentials.readerCode], options);
  const schedule = readerApp.calculateSchedule(bootstrap.plan, bootstrap.config, options.now || new Date());
  const entries = bootstrap.plan.entries || [];
  const startIndex = schedule.status === "before_start" ? 0 : schedule.status === "pilot_complete"
    ? entries.length : Math.max(0, schedule.calendarDayIndex - 1);
  const horizonIds = entries.slice(startIndex, startIndex + 8).map((entry) => entry.readingId);
  const requestedBatches = [];
  for (let index = 0; index < horizonIds.length; index += HORIZON_PAYLOAD_BATCH_SIZE) {
    requestedBatches.push(horizonIds.slice(index, index + HORIZON_PAYLOAD_BATCH_SIZE));
  }
  const payloadBatches = [];
  for (const readingIds of requestedBatches) {
    payloadBatches.push(await callLiveHealthBridge(credentials, "getReadingPayloads", [credentials.readerCode, readingIds], options));
  }
  const payloadBatch = requestedBatches.length
    ? mergeHorizonPayloadBatch(bootstrap.plan.planVersion, requestedBatches, payloadBatches)
    : {planVersion: bootstrap.plan.planVersion, payloads: {}};
  const now = options.now || new Date();
  return {
    ...evaluateLiveHorizon(bootstrap, payloadBatch, now),
    currentHorizonHenryLayer: {
      scope: "current_through_t_plus_7_chapters",
      ...evaluateHenryLayerReadiness(bootstrap, payloadBatch, now)
    }
  };
}
