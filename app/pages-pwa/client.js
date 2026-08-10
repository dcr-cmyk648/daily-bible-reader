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
  var API_ROOT = "https://script.googleapis.com/v1/scripts/";
  var TOKEN_SKEW_MS = 60000;
  var TOKEN_FLAG = "dbr-google-consent-v1";
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
  var REQUIRED_SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/userinfo.email"
  ];
  var bootFinished = false;
  var tokenClient = null;
  var accessToken = "";
  var tokenExpiresAt = 0;
  var tokenWaiters = [];
  var updateRegistration = null;
  var reloadingForUpdate = false;

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
    if (!value || value.schemaVersion !== "dbr-pages-public-config/v1" || value.enabled !== true ||
        !/^\d{6,}-[a-z0-9_-]{12,}\.apps\.googleusercontent\.com$/.test(String(value.oauthClientId || "")) ||
        !/^[A-Za-z0-9_-]{20,}$/.test(String(value.apiDeploymentId || "")) ||
        !/^[a-f0-9]{16}$/.test(String(value.pwaReleaseId || ""))) {
      throw new Error("The Pages canary is not configured for private Google access.");
    }
    return Object.freeze({
      schemaVersion: value.schemaVersion,
      enabled: true,
      oauthClientId: value.oauthClientId,
      apiDeploymentId: value.apiDeploymentId,
      pwaReleaseId: value.pwaReleaseId
    });
  }

  function authGate(message, busy) {
    var gate = element("googleAuthGate");
    var button = element("googleAuthButton");
    if (gate) gate.hidden = false;
    if (button) button.disabled = Boolean(busy);
    setText("googleAuthStatus", message || "Authorize this installed reader to contact the private backend.");
    setText("authStatus", accessTokenIsFresh() ? "Google connected" : "Google authorization needed");
  }

  function hideAuthGate() {
    var gate = element("googleAuthGate");
    if (gate) gate.hidden = true;
    var button = element("googleAuthButton");
    if (button) button.disabled = false;
    setText("authStatus", "Google connected");
  }

  function accessTokenIsFresh() {
    return Boolean(accessToken) && tokenExpiresAt - Date.now() > TOKEN_SKEW_MS;
  }

  function rejectTokenWaiters(message) {
    var waiting = tokenWaiters.splice(0);
    waiting.forEach(function rejectWaiter(waiter) {
      waiter.reject(new Error(message || "Google authorization was not completed."));
    });
  }

  function resolveTokenWaiters() {
    if (!accessTokenIsFresh()) return;
    var waiting = tokenWaiters.splice(0);
    waiting.forEach(function resolveWaiter(waiter) {
      waiter.resolve(accessToken);
    });
  }

  function clearToken(message) {
    accessToken = "";
    tokenExpiresAt = 0;
    authGate(message || "Google authorization is needed to refresh private data.", false);
  }

  function getAccessToken() {
    if (accessTokenIsFresh()) return Promise.resolve(accessToken);
    authGate("Continue with Google to refresh private readings and shared activity.", false);
    return new Promise(function waitForToken(resolve, reject) {
      tokenWaiters.push({resolve: resolve, reject: reject});
    });
  }

  function tokenCallback(response) {
    if (!response || response.error || !response.access_token) {
      authGate("Google authorization was not completed. Retry when you are ready.", false);
      rejectTokenWaiters("Google authorization was not completed.");
      return;
    }
    var seconds = Number(response.expires_in || 0);
    var granted = new Set(String(response.scope || "").split(/\s+/).filter(Boolean));
    var missingScope = REQUIRED_SCOPES.some(function missing(scope) { return !granted.has(scope); });
    if (!Number.isFinite(seconds) || seconds < 60 || missingScope) {
      authGate("Google returned an unusable authorization. Please retry.", false);
      rejectTokenWaiters(missingScope
        ? "Google did not grant every permission required by the private reader."
        : "Google authorization expired before it could be used.");
      return;
    }
    accessToken = String(response.access_token);
    tokenExpiresAt = Date.now() + seconds * 1000;
    try {
      root.localStorage && root.localStorage.setItem(TOKEN_FLAG, "yes");
    } catch (_error) {}
    hideAuthGate();
    resolveTokenWaiters();
  }

  function loadGoogleIdentity() {
    return new Promise(function load(resolve, reject) {
      if (root.google && root.google.accounts && root.google.accounts.oauth2) {
        resolve();
        return;
      }
      var script = root.document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.referrerPolicy = "no-referrer";
      script.onload = function onload() {
        if (root.google && root.google.accounts && root.google.accounts.oauth2) resolve();
        else reject(new Error("Google authorization support did not initialize."));
      };
      script.onerror = function onerror() {
        reject(new Error("Google authorization support could not be loaded."));
      };
      root.document.head.appendChild(script);
    });
  }

  function requestAuthorization(promptValue) {
    if (!tokenClient) {
      authGate("Google authorization is still loading. Retry in a moment.", false);
      return;
    }
    authGate("Waiting for Google authorization…", true);
    try {
      tokenClient.requestAccessToken({prompt: promptValue === undefined ? "consent" : promptValue});
    } catch (_error) {
      authGate("Google authorization could not be opened. Retry from Safari.", false);
    }
  }

  function initializeIdentity(config) {
    return loadGoogleIdentity().then(function ready() {
      tokenClient = root.google.accounts.oauth2.initTokenClient({
        client_id: config.oauthClientId,
        scope: REQUIRED_SCOPES.join(" "),
        include_granted_scopes: true,
        callback: tokenCallback,
        error_callback: function errorCallback() {
          authGate("Google authorization was interrupted. Retry when you are ready.", false);
          rejectTokenWaiters("Google authorization was interrupted.");
        }
      });
      var button = element("googleAuthButton");
      if (button) button.addEventListener("click", function onAuthorize() { requestAuthorization(""); });
      authGate("Continue with Google to connect the private backend. Saved readings can open while you authorize.", false);
      var previouslyConsented = false;
      try {
        previouslyConsented = root.localStorage && root.localStorage.getItem(TOKEN_FLAG) === "yes";
      } catch (_error) {}
      if (previouslyConsented) root.setTimeout(function silentRenewal() { requestAuthorization(""); }, 0);
    });
  }

  function executionFailure(payload, status) {
    var message = "The private backend request failed.";
    var code = status === 401 ? "AUTH_REQUIRED" : status === 403 ? "ACCESS_DENIED" : "SERVER_ERROR";
    if (payload && payload.error) {
      var details = Array.isArray(payload.error.details) ? payload.error.details : [];
      var scriptError = details.find(function findDetail(detail) { return detail && detail.errorMessage; });
      message = scriptError && scriptError.errorMessage || payload.error.message || message;
      if (scriptError && scriptError.errorType) code = String(scriptError.errorType);
    }
    var error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
  }

  async function execute(config, method, args) {
    if (!ALLOWED_METHODS.has(method)) throw new Error("The requested backend operation is not allowlisted.");
    var serialized = JSON.stringify(args || []);
    if (serialized.length > 150000) throw new Error("The backend request is too large.");
    var token = await getAccessToken();
    var response = await root.fetch(API_ROOT + encodeURIComponent(config.apiDeploymentId) + ":run", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({function: method, parameters: args || [], devMode: false}),
      cache: "no-store",
      credentials: "omit",
      redirect: "error"
    });
    var payload = null;
    try {
      payload = await response.json();
    } catch (_error) {}
    if (response.status === 401) clearToken("Google authorization expired. Continue again to resume synchronization.");
    if (!response.ok || payload && payload.error) throw executionFailure(payload, response.status);
    if (!payload || payload.done !== true || !payload.response || !("result" in payload.response)) {
      throw new Error("The private backend returned an invalid response.");
    }
    return payload.response.result;
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
              if (typeof failureHandler === "function") failureHandler({message: error && error.message || "Server request failed."});
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
    if (updateRegistration && updateRegistration.waiting) {
      updateRegistration.waiting.postMessage({type: "DBR_ACTIVATE_UPDATE"});
    }
  }

  function showUpdate(registration) {
    updateRegistration = registration;
    var panel = element("pwaUpdatePanel");
    if (panel) panel.hidden = false;
  }

  async function registerServiceWorker() {
    if (!root.navigator || !root.navigator.serviceWorker) return;
    var registration = await root.navigator.serviceWorker.register("service-worker.js", {scope: "./", updateViaCache: "none"});
    if (root.document && root.document.documentElement) root.document.documentElement.dataset.pwaServiceWorker = "registered";
    if (registration.waiting) showUpdate(registration);
    registration.addEventListener("updatefound", function updateFound() {
      var worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", function stateChanged() {
        if (worker.state === "installed" && root.navigator.serviceWorker.controller) showUpdate(registration);
      });
    });
    root.navigator.serviceWorker.addEventListener("controllerchange", function controllerChanged() {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      root.location.reload();
    });
    registration.update().catch(function ignoreUpdateFailure() {});
  }

  async function start() {
    installBootBridge();
    var config = validateConfig(BUILD_CONFIG);
    installAppsScriptShim(config);
    authGate("Loading Google authorization. Saved readings can open while this finishes.", true);
    var updateButton = element("pwaUpdateButton");
    if (updateButton) updateButton.addEventListener("click", activateWaitingWorker);
    registerServiceWorker().catch(function serviceWorkerUnavailable() {
      if (root.document && root.document.documentElement) root.document.documentElement.dataset.pwaServiceWorker = "unavailable";
    });
    var identityReady = initializeIdentity(config).catch(function identityFailed(error) {
      authGate(error && error.message || "Google authorization is unavailable.", false);
    });
    var release = await fetchRelease();
    root.DBRStaticRelease = {releaseId: release.releaseId, source: "pages-pwa"};
    await loadScript(release.core);
    await loadScript(release.highlights);
    await identityReady;
  }

  return {
    start: start,
    showFatal: showFatal,
    validateConfig: validateConfig,
    validateRelease: validateRelease,
    createRunner: createRunner,
    execute: execute,
    clearToken: clearToken,
    tokenCallback: tokenCallback,
    requiredScopes: REQUIRED_SCOPES.slice(),
    allowedMethods: Array.from(ALLOWED_METHODS)
  };
});
