(function installStaticReaderAssets(root) {
  "use strict";

  var LOADER_VERSION = 1;
  var MANIFEST_URL = "__DBR_PAGES_MANIFEST_URL__";
  var ASSET_ORIGIN = "__DBR_PAGES_ORIGIN__";
  var RELEASE_PATH_PREFIX = "__DBR_PAGES_RELEASE_PATH_PREFIX__";
  var CACHE_KEY = "dbr-code-release-v1";
  var LOAD_TIMEOUT_MS = 15000;
  var activeReleaseId = "";

  function phase(message) {
    if (root.DBRBoot && typeof root.DBRBoot.phase === "function") root.DBRBoot.phase(message);
    else {
      var status = root.document && root.document.getElementById("syncStatus");
      if (status) status.textContent = message;
    }
  }

  function fail(message) {
    if (root.DBRBoot && typeof root.DBRBoot.fail === "function") {
      root.DBRBoot.fail(message);
      return;
    }
    var status = root.document && root.document.getElementById("syncStatus");
    if (status) status.textContent = "Startup interrupted";
    var banner = root.document && root.document.getElementById("stateBanner");
    if (banner) {
      banner.hidden = false;
      banner.dataset.state = "error";
      banner.textContent = message;
    }
  }

  function releaseUrl(releaseId, path) {
    var candidate = new URL(String(path || ""), MANIFEST_URL);
    var expectedPrefix = RELEASE_PATH_PREFIX + releaseId + "/";
    if (candidate.origin !== ASSET_ORIGIN || !candidate.pathname.startsWith(expectedPrefix) ||
        candidate.search || candidate.hash) {
      throw new Error("Static release contained an invalid asset path.");
    }
    return candidate.toString();
  }

  function validateAsset(releaseId, asset, expectedName) {
    if (!asset || asset.name !== expectedName ||
        !/^sha384-[A-Za-z0-9+/]{64}$/.test(String(asset.integrity || "")) ||
        !Number.isInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > 500000) {
      throw new Error("Static release metadata was invalid.");
    }
    return {
      name: expectedName,
      url: releaseUrl(releaseId, asset.path),
      integrity: asset.integrity,
      bytes: asset.bytes
    };
  }

  function validateManifest(value) {
    if (!value || value.schemaVersion !== "dbr-static-release/v1" ||
        value.loaderVersion !== LOADER_VERSION || !/^[a-f0-9]{16}$/.test(String(value.releaseId || "")) ||
        !value.assets) {
      throw new Error("Static release manifest was invalid.");
    }
    var releaseId = value.releaseId;
    return {
      schemaVersion: value.schemaVersion,
      loaderVersion: value.loaderVersion,
      releaseId: releaseId,
      assets: {
        styles: validateAsset(releaseId, value.assets.styles, "styles"),
        core: validateAsset(releaseId, value.assets.core, "core"),
        highlights: validateAsset(releaseId, value.assets.highlights, "highlights")
      }
    };
  }

  function readCachedManifest() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(CACHE_KEY);
      return raw ? validateManifest(JSON.parse(raw)) : null;
    } catch (_) {
      try {
        if (root.localStorage) root.localStorage.removeItem(CACHE_KEY);
      } catch (_) {}
      return null;
    }
  }

  function rememberManifest(manifest) {
    try {
      if (root.localStorage) root.localStorage.setItem(CACHE_KEY, JSON.stringify(manifest));
    } catch (_) {}
  }

  function withTimeout(promise, message) {
    return new Promise(function bounded(resolve, reject) {
      var timer = root.setTimeout(function timeout() { reject(new Error(message)); }, LOAD_TIMEOUT_MS);
      promise.then(function done(value) {
        root.clearTimeout(timer);
        resolve(value);
      }, function failed(error) {
        root.clearTimeout(timer);
        reject(error);
      });
    });
  }

  function fetchCurrentManifest() {
    var separator = MANIFEST_URL.indexOf("?") === -1 ? "?" : "&";
    var url = MANIFEST_URL + separator + "loader=" + LOADER_VERSION + "&t=" + Date.now();
    return withTimeout(root.fetch(url, {
      cache: "no-store",
      credentials: "omit",
      mode: "cors",
      redirect: "error",
      referrerPolicy: "no-referrer"
    }).then(function checked(response) {
      if (!response.ok || response.type === "opaque") throw new Error("Static release manifest was unavailable.");
      return response.json();
    }).then(validateManifest), "Static release manifest timed out.");
  }

  function loadStylesheet(asset) {
    return withTimeout(new Promise(function stylesheetPromise(resolve, reject) {
      var link = root.document.createElement("link");
      link.rel = "stylesheet";
      link.href = asset.url;
      link.integrity = asset.integrity;
      link.crossOrigin = "anonymous";
      link.dataset.dbrRelease = activeReleaseId;
      link.onload = function loaded() { resolve(); };
      link.onerror = function failed() {
        link.remove();
        reject(new Error("Static stylesheet failed to load."));
      };
      root.document.head.appendChild(link);
    }), "Static stylesheet timed out.");
  }

  function loadScript(asset) {
    return withTimeout(new Promise(function scriptPromise(resolve, reject) {
      var script = root.document.createElement("script");
      script.src = asset.url;
      script.integrity = asset.integrity;
      script.crossOrigin = "anonymous";
      script.referrerPolicy = "no-referrer";
      script.dataset.dbrRelease = activeReleaseId;
      script.onload = function loaded() { resolve(); };
      script.onerror = function failed() {
        script.remove();
        reject(new Error("Static application asset failed to load."));
      };
      root.document.body.appendChild(script);
    }), "Static application asset timed out.");
  }

  async function installRelease(manifest, source) {
    activeReleaseId = manifest.releaseId;
    root.DBRStaticRelease = {releaseId: manifest.releaseId, source: source, loaderVersion: LOADER_VERSION};
    phase(source === "network" ? "Loading current application…" : "Loading saved application…");
    await Promise.all([
      loadStylesheet(manifest.assets.styles),
      loadScript(manifest.assets.core)
    ]);
    if (!root.DailyBibleReader || typeof root.DailyBibleReader.init !== "function") {
      throw new Error("Static application code did not initialize.");
    }
    rememberManifest(manifest);
    loadScript(manifest.assets.highlights).catch(function optionalHighlightFailure() {});
  }

  async function start() {
    var cached = readCachedManifest();
    var current = null;
    try {
      phase("Checking application release…");
      current = await fetchCurrentManifest();
      await installRelease(current, "network");
      return;
    } catch (_) {
      if (cached && (!current || cached.releaseId !== current.releaseId)) {
        try {
          await installRelease(cached, "saved");
          return;
        } catch (_) {}
      }
    }
    fail("The code-only application assets could not be loaded. Private data remains closed. Check the connection and reopen the reader.");
  }

  if (!root.document || typeof root.fetch !== "function") {
    fail("This browser cannot load the private reader application.");
    return;
  }
  start();
})(typeof globalThis !== "undefined" ? globalThis : this);
