(function attachDailyBibleReaderPagesPwa(root, factory) {
  "use strict";
  var api = factory(root);
  root.DBRPagesPwa = api;
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root.document) {
    var start = function start() {
      api.start().catch(function onStartupFailure(error) {
        api.showFatal(error && error.message ? error.message : "The Pages reader could not start.");
      });
    };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, {once: true});
    else start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function dailyBibleReaderPagesPwaFactory(root) {
  "use strict";

  var BUILD_CONFIG = __DBR_PUBLIC_CONFIG__;
  var FRONTEND_MANIFEST_URL = "../release.json";
  var RPC_CHANNEL = "dbr-rpc-response/v1";
  var RPC_TRANSPORT_VERSION = "dbr-form-bridge/v1";
  var RPC_TIMEOUT_MS = 45000;
  var ALLOWED_METHODS = new Set([
    "getBootstrapData",
    "confirmReaderAccess",
    "getReadingPayload",
    "getReadingPayloads",
    "getScripture",
    "listComments",
    "listCommentActivity",
    "submitCommentEvent",
    "listHighlights",
    "submitHighlightEvent",
    "forgetReaderEnrollment"
  ]);
  var bootFinished = false;
  var pendingRequests = new Map();
  var responseListenerInstalled = false;
  var updateRegistration = null;
  var reloadingForUpdate = false;
  var waitingIdentity = null;
  var activationTarget = null;
  var silentActivationWorker = null;
  var updateInspection = 0;
  var updateDiagnostics = {state: "starting", storageAvailable: true};

  function updateScope() {
    return new URL("./", root.location.href).pathname;
  }

  function updateMarkerKey() {
    return "dbr-public-shell-update/v1:" + updateScope();
  }

  function readUpdateAttempt() {
    try {
      var value = JSON.parse(root.localStorage.getItem(updateMarkerKey()) || "null");
      if (value && (value.key === "release:" + value.releaseId && /^[a-f0-9]{16}$/.test(value.releaseId || "") ||
          /^legacy:[a-f0-9]{64}$/.test(value.key || "") && value.releaseId === null) &&
          typeof value.reloadIssued === "boolean") return value;
    } catch (_error) { updateDiagnostics.storageAvailable = false; }
    return null;
  }

  function saveUpdateAttempt(value) {
    try {
      root.localStorage.setItem(updateMarkerKey(), JSON.stringify(value));
      return true;
    } catch (_error) { updateDiagnostics.storageAvailable = false; return false; }
  }

  function publicUpdateDiagnostics() {
    return Object.assign({shellReleaseId: BUILD_CONFIG.pwaReleaseId, scopePath: updateScope()}, updateDiagnostics);
  }

  function recordUpdateState(state) {
    updateDiagnostics.state = state;
    var node = element("pwaUpdateInspector");
    if (node) {
      node.hidden = false;
      node.textContent = JSON.stringify(publicUpdateDiagnostics(), null, 2);
    }
  }

  function workerInfo(worker) {
    return new Promise(function identify(resolve) {
      if (!worker || !root.MessageChannel) return resolve(null);
      var channel = new root.MessageChannel();
      var finished = false;
      function finish(value) {
        if (finished) return;
        finished = true;
        root.clearTimeout(timer);
        channel.port1.close();
        channel.port2.close();
        resolve(value);
      }
      var timer = root.setTimeout(function noWorkerReply() { finish(null); }, 1200);
      channel.port1.onmessage = function replied(event) {
        var value = event.data;
        if (value && value.type === "DBR_WORKER_INFO" && typeof value.releaseId === "string" && /^[a-f0-9]{16}$/.test(value.releaseId) &&
            updateRegistration && value.scope === updateRegistration.scope) finish(value);
      };
      try { worker.postMessage({type: "DBR_WORKER_INFO"}, [channel.port2]); }
      catch (_error) { finish(null); }
    });
  }

  async function identifyWaitingWorker(worker) {
    var url = new URL(worker.scriptURL);
    if (url.href !== new URL("service-worker.js", root.location.href).href) throw new Error("WORKER_SCOPE_MISMATCH");
    var info = await workerInfo(worker);
    if (info) return {key: "release:" + info.releaseId, releaseId: info.releaseId, worker: worker};
    // Old workers cannot answer. Fingerprint the public script for a bounded
    // legacy attempt, without pretending these network bytes identify its
    // installed release. Only a worker reply authorizes silent same-release use.
    if (!root.AbortController) throw new Error("WORKER_IDENTITY_UNAVAILABLE");
    var controller = new root.AbortController();
    var timeout = root.setTimeout(function identityFetchExpired() { controller.abort(); }, 8000);
    var bytes;
    try {
      var response = await root.fetch(url.href, {cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal});
      if (!response.ok) throw new Error("WORKER_IDENTITY_UNAVAILABLE");
      bytes = await response.arrayBuffer();
    } finally { root.clearTimeout(timeout); }
    if (bytes.byteLength > 750000) throw new Error("WORKER_IDENTITY_UNAVAILABLE");
    var digest = await root.crypto.subtle.digest("SHA-256", bytes);
    var hex = Array.from(new Uint8Array(digest)).map(function byte(value) { return value.toString(16).padStart(2, "0"); }).join("");
    return {key: "legacy:" + hex, releaseId: null, worker: worker};
  }

  function markStartupMilestone(name) {
    var metrics = root.DBRStartupMetrics;
    if (!metrics || metrics.schemaVersion !== "startup-timing/v1" ||
        !metrics.milestones || typeof metrics.milestones !== "object") {
      metrics = {schemaVersion: "startup-timing/v1", milestones: {}};
      root.DBRStartupMetrics = metrics;
    }
    if (Number.isFinite(metrics.milestones[name])) return;
    if (root.performance && typeof root.performance.now === "function") {
      metrics.milestones[name] = Math.max(0, Math.round(root.performance.now()));
    }
  }

  function element(id) {
    return root.document && root.document.getElementById(id);
  }

  function setText(id, value) {
    var node = element(id);
    if (node) node.textContent = String(value || "");
  }

  function installBootBridge() {
    root.DBRBoot = {
      phase: function phase(message) {
        if (!bootFinished && message) setText("syncStatus", message);
      },
      fail: function fail(message) {
        showFatal(message || "The application code did not start.");
      },
      coreStarted: function coreStarted() {
        markStartupMilestone("applicationCodeLoaded");
        if (!bootFinished) setText("syncStatus", "Opening saved reader…");
      },
      ready: function ready() {
        bootFinished = true;
      }
    };
  }

  function showFatal(message) {
    bootFinished = true;
    setText("syncStatus", "Startup interrupted");
    var banner = element("stateBanner");
    if (banner) {
      banner.hidden = false;
      banner.dataset.state = "error";
      banner.textContent = String(message || "The Pages reader could not start.");
    }
  }

  function validateConfig(value) {
    if (!value || value.schemaVersion !== "dbr-pages-public-config/v2" || value.enabled !== true ||
        !/^[a-f0-9]{16}$/.test(String(value.pwaReleaseId || ""))) {
      throw new Error("The Pages canary is not configured for its private reader bridge.");
    }
    var backendUrl = String(value.backendWebAppUrl || "");
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(backendUrl)) {
      throw new Error("The Pages canary is not configured for its private reader bridge.");
    }
    return Object.freeze({
      schemaVersion: value.schemaVersion,
      enabled: true,
      backendWebAppUrl: backendUrl,
      pwaReleaseId: value.pwaReleaseId
    });
  }

  function randomHex(byteCount) {
    if (!root.crypto || typeof root.crypto.getRandomValues !== "function") {
      throw new Error("Secure request identifiers are unavailable in this browser.");
    }
    var bytes = new Uint8Array(byteCount);
    root.crypto.getRandomValues(bytes);
    return Array.from(bytes, function toHex(value) { return value.toString(16).padStart(2, "0"); }).join("");
  }

  function allowedResponseOrigin(value) {
    try {
      var url = new URL(String(value || ""));
      return url.protocol === "https:" && (
        url.hostname === "script.google.com" ||
        url.hostname === "script.googleusercontent.com" ||
        /^n-[a-z0-9-]+-script\.googleusercontent\.com$/.test(url.hostname)
      );
    } catch (_error) {
      return false;
    }
  }

  function bridgeError(input, fallback) {
    var error = new Error(input && input.message || fallback || "The private backend request failed.");
    error.code = input && input.code || "SERVER_UNAVAILABLE";
    return error;
  }

  function cleanupRequest(requestId) {
    var pending = pendingRequests.get(requestId);
    if (!pending) return null;
    pendingRequests.delete(requestId);
    root.clearTimeout(pending.timeoutId);
    if (pending.form && typeof pending.form.remove === "function") pending.form.remove();
    if (pending.iframe && typeof pending.iframe.remove === "function") pending.iframe.remove();
    return pending;
  }

  function handleBridgeMessage(event) {
    if (!event || !allowedResponseOrigin(event.origin) || !event.data || event.data.channel !== RPC_CHANNEL) return false;
    var requestId = String(event.data.requestId || "");
    var pending = pendingRequests.get(requestId);
    if (!pending || String(event.data.responseNonce || "") !== pending.responseNonce) return false;
    cleanupRequest(requestId);
    if (event.data.ok !== true || !("result" in event.data)) {
      pending.reject(bridgeError(event.data.error, "The private backend returned an invalid response."));
      return true;
    }
    pending.resolve(event.data.result);
    return true;
  }

  function installResponseListener() {
    if (responseListenerInstalled) return;
    root.addEventListener("message", handleBridgeMessage);
    responseListenerInstalled = true;
  }

  function hiddenInput(name, value) {
    var input = root.document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    return input;
  }

  function execute(config, method, args) {
    if (!ALLOWED_METHODS.has(method)) throw new Error("The requested backend operation is not allowlisted.");
    var serialized = JSON.stringify(args || []);
    if (serialized.length > 150000) throw new Error("The backend request is too large.");
    if (!root.document || !root.document.body) throw new Error("The private backend bridge is unavailable.");
    installResponseListener();
    var requestId = "rpc-" + randomHex(16);
    var responseNonce = randomHex(24);
    var frameName = "dbr_rpc_" + randomHex(12);
    var iframe = root.document.createElement("iframe");
    iframe.name = frameName;
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("inert", "");
    iframe.tabIndex = -1;
    iframe.style.position = "fixed";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.left = "-1px";
    iframe.style.top = "-1px";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.border = "0";
    iframe.style.clipPath = "inset(50%)";
    iframe.referrerPolicy = "no-referrer";
    iframe.title = "Private reader response";
    var form = root.document.createElement("form");
    form.hidden = true;
    form.method = "POST";
    form.action = config.backendWebAppUrl;
    form.target = frameName;
    form.acceptCharset = "UTF-8";
    [
      ["action", "dbr-rpc"],
      ["transport_version", RPC_TRANSPORT_VERSION],
      ["request_id", requestId],
      ["response_nonce", responseNonce],
      ["method", method],
      ["args_json", serialized],
      ["client_origin", root.location.origin]
    ].forEach(function addField(field) { form.appendChild(hiddenInput(field[0], field[1])); });
    root.document.body.appendChild(iframe);
    root.document.body.appendChild(form);
    return new Promise(function waitForResponse(resolve, reject) {
      var timeoutId = root.setTimeout(function timedOut() {
        cleanupRequest(requestId);
        reject(bridgeError({code: "SERVER_UNAVAILABLE", message: "The private backend did not respond. Retry when your connection is stable."}));
      }, RPC_TIMEOUT_MS);
      pendingRequests.set(requestId, {
        responseNonce: responseNonce,
        iframe: iframe,
        form: form,
        timeoutId: timeoutId,
        resolve: resolve,
        reject: reject
      });
      root.setTimeout(function submitAfterInsertion() {
        try {
          form.submit();
        } catch (_error) {
          cleanupRequest(requestId);
          reject(bridgeError({code: "SERVER_UNAVAILABLE", message: "The private backend request could not be sent."}));
        }
      }, 0);
    });
  }

  function createRunner(config, successHandler, failureHandler) {
    var target = {};
    return new Proxy(target, {
      get: function get(_target, property) {
        if (property === "then") return undefined;
        if (property === "withSuccessHandler") {
          return function withSuccessHandler(handler) { return createRunner(config, handler, failureHandler); };
        }
        if (property === "withFailureHandler") {
          return function withFailureHandler(handler) { return createRunner(config, successHandler, handler); };
        }
        if (typeof property !== "string" || !ALLOWED_METHODS.has(property)) return undefined;
        return function runMethod() {
          var args = Array.prototype.slice.call(arguments);
          execute(config, property, args).then(
            function succeeded(value) { if (typeof successHandler === "function") successHandler(value); },
            function failed(error) {
              if (typeof failureHandler === "function") failureHandler(bridgeError(error, "Server request failed."));
            }
          );
        };
      }
    });
  }

  function installAppsScriptShim(config) {
    root.google = root.google || {};
    root.google.script = root.google.script || {};
    root.google.script.run = createRunner(config, null, null);
  }

  function validateRelease(value) {
    if (!value || value.schemaVersion !== "dbr-static-release/v1" || value.loaderVersion !== 1 ||
        !/^[a-f0-9]{16}$/.test(String(value.releaseId || "")) || !value.assets) {
      throw new Error("The public frontend release is invalid.");
    }
    var manifestUrl = new URL(FRONTEND_MANIFEST_URL, root.location.href);
    var releasePrefix = new URL("../releases/" + value.releaseId + "/", root.location.href).pathname;
    function asset(name) {
      var input = value.assets[name];
      var url = new URL(String(input && input.path || ""), manifestUrl);
      if (!input || input.name !== name || url.origin !== root.location.origin ||
          !url.pathname.startsWith(releasePrefix) || url.search || url.hash ||
          !/^sha384-[A-Za-z0-9+/]{64}$/.test(String(input.integrity || ""))) {
        throw new Error("The public frontend asset allowlist is invalid.");
      }
      return {name: name, url: url.toString(), integrity: input.integrity};
    }
    return {releaseId: value.releaseId, styles: asset("styles"), core: asset("core"), highlights: asset("highlights")};
  }

  async function fetchRelease() {
    var response = await root.fetch(FRONTEND_MANIFEST_URL, {cache: "no-store", credentials: "omit", redirect: "error"});
    if (!response.ok) throw new Error("The public frontend release could not be loaded.");
    return validateRelease(await response.json());
  }

  function loadScript(asset) {
    return new Promise(function load(resolve, reject) {
      var script = root.document.createElement("script");
      script.src = asset.url;
      script.integrity = asset.integrity;
      script.crossOrigin = "anonymous";
      script.referrerPolicy = "no-referrer";
      script.onload = resolve;
      script.onerror = function onerror() { reject(new Error("A verified public application asset could not be loaded.")); };
      root.document.body.appendChild(script);
    });
  }

  function activateWaitingWorker() {
    if (!waitingIdentity || !updateRegistration || updateRegistration.waiting !== waitingIdentity.worker) return;
    var previous = readUpdateAttempt();
    if (previous && previous.key === waitingIdentity.key) return;
    // Persist before messaging: a new page/process must know this attempt even
    // when WebKit repeats a waiting worker or controllerchange after reopening.
    var attempt = {key: waitingIdentity.key, releaseId: waitingIdentity.releaseId, reloadIssued: false};
    if (!saveUpdateAttempt(attempt)) {
      hideUpdate();
      recordUpdateState("restart_disabled_storage_unavailable");
      return;
    }
    activationTarget = waitingIdentity;
    hideUpdate();
    recordUpdateState("activation_requested");
    try { activationTarget.worker.postMessage({type: "DBR_ACTIVATE_UPDATE"}); }
    catch (_error) { recordUpdateState("activation_request_failed"); }
  }

  function hideUpdate() {
    var panel = element("pwaUpdatePanel");
    if (panel) panel.hidden = true;
  }

  async function inspectWaitingWorker() {
    var inspection = ++updateInspection;
    var worker = updateRegistration.waiting;
    if (!worker) { hideUpdate(); recordUpdateState("no_waiting_worker"); return; }
    var identity;
    try { identity = await identifyWaitingWorker(worker); }
    catch (_error) { hideUpdate(); recordUpdateState("waiting_identity_unavailable"); return; }
    if (inspection !== updateInspection || worker !== updateRegistration.waiting) return;
    waitingIdentity = identity;
    updateDiagnostics.waitingReleaseId = identity.releaseId;
    updateDiagnostics.waitingFingerprint = identity.releaseId ? null : identity.key.slice(7);
    var previous = readUpdateAttempt();
    updateDiagnostics.attemptReleaseId = previous && previous.releaseId;
    updateDiagnostics.reloadIssued = Boolean(previous && previous.reloadIssued);
    if (identity.releaseId === BUILD_CONFIG.pwaReleaseId) {
      hideUpdate();
      recordUpdateState("same_release_activation");
      if (silentActivationWorker === worker) return;
      silentActivationWorker = worker;
      try { worker.postMessage({type: "DBR_ACTIVATE_UPDATE"}); }
      catch (_error) { recordUpdateState("activation_request_failed"); }
      return;
    }
    if (previous && previous.key === identity.key) {
      hideUpdate();
      recordUpdateState("repeat_attempt_suppressed");
      return;
    }
    var panel = element("pwaUpdatePanel");
    if (panel) panel.hidden = false;
    recordUpdateState(identity.releaseId ? "update_available" : "legacy_update_available");
  }

  function rememberControllerInfo(info) {
    updateDiagnostics.controllerReleaseId = info && info.releaseId;
    if (info && info.activation) {
      updateDiagnostics.cleanup = ["pending", "ok", "failed"].includes(info.activation.cleanup) ? info.activation.cleanup : "unknown";
      updateDiagnostics.claim = ["pending", "ok", "failed", "activation_request_failed"].includes(info.activation.claim) ? info.activation.claim : "unknown";
    }
  }

  async function controllerChanged() {
    var controller = root.navigator.serviceWorker.controller;
    var info = await workerInfo(controller);
    if (controller !== root.navigator.serviceWorker.controller) return;
    rememberControllerInfo(info);
    var attempt = readUpdateAttempt();
    // First install, silent same-release activation and another registration's
    // claim are not user restart requests. Never reload them automatically.
    if (!activationTarget || !attempt || attempt.reloadIssued || reloadingForUpdate) {
      recordUpdateState(attempt && attempt.reloadIssued ? "restart_already_issued" : "controller_changed_without_restart");
      return;
    }
    if (controller !== activationTarget.worker && (!info || info.releaseId !== activationTarget.releaseId)) {
      recordUpdateState("unexpected_controller");
      return;
    }
    attempt.reloadIssued = true;
    if (!saveUpdateAttempt(attempt)) { recordUpdateState("restart_disabled_storage_unavailable"); return; }
    reloadingForUpdate = true;
    recordUpdateState("restart_issued");
    root.location.reload();
  }

  async function registerServiceWorker() {
    if (!root.navigator || !root.navigator.serviceWorker) return;
    root.navigator.serviceWorker.addEventListener("controllerchange", function changed() {
      controllerChanged().catch(function failed() { recordUpdateState("controller_inspection_failed"); });
    });
    var registration = await root.navigator.serviceWorker.register("service-worker.js", {scope: "./", updateViaCache: "none"});
    updateRegistration = registration;
    if (root.document && root.document.documentElement) root.document.documentElement.dataset.pwaServiceWorker = "registered";
    registration.addEventListener("updatefound", function updateFound() {
      var worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", function stateChanged() {
        if (worker.state === "installed") inspectWaitingWorker().catch(function failed() { recordUpdateState("waiting_identity_unavailable"); });
      });
    });
    await inspectWaitingWorker();
    var controller = root.navigator.serviceWorker.controller;
    var info = await workerInfo(controller);
    if (controller === root.navigator.serviceWorker.controller) {
      rememberControllerInfo(info);
      recordUpdateState(updateDiagnostics.state);
    }
    registration.update().catch(function ignoreUpdateFailure() {});
  }

  async function start() {
    markStartupMilestone("shellVisible");
    installBootBridge();
    var config = validateConfig(BUILD_CONFIG);
    installAppsScriptShim(config);
    setText("authStatus", "Private reader ready");
    var updateButton = element("pwaUpdateButton");
    if (updateButton) updateButton.addEventListener("click", activateWaitingWorker);
    registerServiceWorker().catch(function serviceWorkerUnavailable() {
      if (root.document && root.document.documentElement) root.document.documentElement.dataset.pwaServiceWorker = "unavailable";
    });
    var release = await fetchRelease();
    root.DBRStaticRelease = {releaseId: release.releaseId, source: "pages-pwa"};
    await loadScript(release.core);
    await loadScript(release.highlights);
  }

  return {
    start: start,
    showFatal: showFatal,
    validateConfig: validateConfig,
    validateRelease: validateRelease,
    createRunner: createRunner,
    execute: execute,
    handleBridgeMessage: handleBridgeMessage,
    allowedResponseOrigin: allowedResponseOrigin,
    registerServiceWorker: registerServiceWorker,
    activateWaitingWorker: activateWaitingWorker,
    updateDiagnostics: publicUpdateDiagnostics,
    allowedMethods: Array.from(ALLOWED_METHODS)
  };
});
