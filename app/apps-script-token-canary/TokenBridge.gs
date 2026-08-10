/**
 * Public web-app transport for the isolated Pages PWA canary.
 *
 * The deployment executes as its owner. A high-entropy reader code is the
 * bearer credential; dbrAuthorizedContext_ maps its hash to Dustin or Shane.
 * This file never logs request fields or reflects an arbitrary destination.
 */

const DBR_TOKEN_BRIDGE_ORIGIN = "https://dcr-cmyk648.github.io";
const DBR_TOKEN_BRIDGE_VERSION = "dbr-form-bridge/v1";
const DBR_TOKEN_BRIDGE_CHANNEL = "dbr-rpc-response/v1";
const DBR_TOKEN_BRIDGE_MAX_REQUEST_BYTES = 150000;
const DBR_TOKEN_BRIDGE_METHODS = {
  getBootstrapData: {fn: getBootstrapData, argumentCount: 1},
  confirmReaderAccess: {fn: confirmReaderAccess, argumentCount: 1},
  getReadingPayload: {fn: getReadingPayload, argumentCount: 2},
  getReadingPayloads: {fn: getReadingPayloads, argumentCount: 2},
  getScripture: {fn: getScripture, argumentCount: 2},
  listComments: {fn: listComments, argumentCount: 2},
  listCommentActivity: {fn: listCommentActivity, argumentCount: 2},
  submitCommentEvent: {fn: submitCommentEvent, argumentCount: 2},
  listHighlights: {fn: listHighlights, argumentCount: 2},
  submitHighlightEvent: {fn: submitHighlightEvent, argumentCount: 2},
  forgetReaderEnrollment: {fn: forgetReaderEnrollment, argumentCount: 1}
};

var DBR_TOKEN_RATE_KEY_ = "";

function doPost(event) {
  const parameters = event && event.parameter || {};
  const clientOrigin = String(parameters.client_origin || "");
  if (clientOrigin !== DBR_TOKEN_BRIDGE_ORIGIN) return dbrTokenBridgeSilentResponse_();

  const requestId = String(parameters.request_id || "");
  const responseNonce = String(parameters.response_nonce || "");
  try {
    if (parameters.action !== "dbr-rpc" || parameters.transport_version !== DBR_TOKEN_BRIDGE_VERSION ||
        !/^rpc-[a-f0-9]{32}$/.test(requestId) || !/^[a-f0-9]{48}$/.test(responseNonce)) {
      throw dbrError_("INVALID_TRANSPORT_REQUEST", "Private reader request is invalid.");
    }
    dbrTokenBridgeGlobalRateLimit_();
    const method = String(parameters.method || "");
    const operation = DBR_TOKEN_BRIDGE_METHODS[method];
    if (!operation) throw dbrError_("INVALID_TRANSPORT_REQUEST", "Private reader operation is not allowed.");
    const serialized = String(parameters.args_json || "");
    if (!serialized || serialized.length > DBR_TOKEN_BRIDGE_MAX_REQUEST_BYTES) {
      throw dbrError_("INVALID_TRANSPORT_REQUEST", "Private reader request is too large.");
    }
    let args;
    try {
      args = JSON.parse(serialized);
    } catch (_) {
      throw dbrError_("INVALID_TRANSPORT_REQUEST", "Private reader request is invalid.");
    }
    if (!Array.isArray(args) || args.length !== operation.argumentCount || typeof args[0] !== "string") {
      throw dbrError_("INVALID_TRANSPORT_REQUEST", "Private reader request arguments are invalid.");
    }
    const result = operation.fn.apply(null, args);
    return dbrTokenBridgeResponse_(requestId, responseNonce, {ok: true, result: result});
  } catch (error) {
    const publicError = dbrPublicError_(error);
    return dbrTokenBridgeResponse_(requestId, responseNonce, {ok: false, error: publicError});
  }
}

function dbrTokenBridgeGlobalRateLimit_() {
  const cache = CacheService.getScriptCache();
  const now = Date.now();
  const windowSeconds = 60;
  const key = "token-bridge-global:" + Math.floor(now / (windowSeconds * 1000));
  let count = Number(cache.get(key) || 0);
  if (!Number.isFinite(count) || count < 0) count = 0;
  if (count >= 600) throw dbrError_("RATE_LIMITED", "Too many requests.");
  cache.put(key, String(count + 1), windowSeconds + 5);
}

function dbrTokenBridgeResponse_(requestId, responseNonce, body) {
  const payload = {
    channel: DBR_TOKEN_BRIDGE_CHANNEL,
    requestId: String(requestId || ""),
    responseNonce: String(responseNonce || ""),
    ok: body && body.ok === true
  };
  if (payload.ok) payload.result = body.result;
  else payload.error = body && body.error || {code: "SERVER_UNAVAILABLE", message: "The server could not complete the request."};
  const payloadJson = dbrTokenBridgeSafeJson_(payload);
  const originJson = dbrTokenBridgeSafeJson_(DBR_TOKEN_BRIDGE_ORIGIN);
  const html = "<!doctype html><title>Reader response</title><script>window.top.postMessage(" +
    payloadJson + "," + originJson + ");<\/script>";
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function dbrTokenBridgeSilentResponse_() {
  return HtmlService.createHtmlOutput("<!doctype html><title>Unavailable</title>");
}

function dbrTokenBridgeSafeJson_(value) {
  return JSON.stringify(value)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
