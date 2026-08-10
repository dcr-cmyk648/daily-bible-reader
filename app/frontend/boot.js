(function installDailyBibleReaderBoot(root) {
  "use strict";

  var startupTimer = null;
  var completionTimer = null;
  var coreHasStarted = false;
  var finished = false;
  var explicitFailure = "";

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

  function safeReloadUrl() {
    var candidate = String(root.document && root.document.referrer || "");
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/(?:exec|dev)(?:[?#]|$)/.test(candidate)) return "";
    var withoutHash = candidate.split("#")[0];
    return withoutHash + (withoutHash.indexOf("?") === -1 ? "?" : "&") + "appRecovery=" + Date.now();
  }

  function showRecovery() {
    if (finished) return;
    var status = element("syncStatus");
    if (status) status.textContent = "Startup interrupted";
    var banner = element("stateBanner");
    if (!banner) return;
    banner.hidden = false;
    banner.dataset.state = "error";
    while (banner.firstChild) banner.removeChild(banner.firstChild);
    var message = root.document.createElement("p");
    message.textContent = explicitFailure || (coreHasStarted
      ? "The reader started but did not finish secure loading. Close and reopen the Home Screen app; if this repeats, use the recovery link."
      : "The application code did not start. Close and reopen the Home Screen app; if this repeats, use the recovery link.");
    banner.appendChild(message);
    var reloadUrl = safeReloadUrl();
    if (reloadUrl) {
      var link = root.document.createElement("a");
      link.className = "button-link";
      link.href = reloadUrl;
      link.target = "_top";
      link.rel = "noopener";
      link.textContent = "Reload reader safely";
      banner.appendChild(link);
    }
  }

  function arm() {
    markStartupMilestone("shellVisible");
    var status = element("syncStatus");
    if (status && status.textContent === "Starting…") status.textContent = "Loading application…";
    startupTimer = root.setTimeout(showRecovery, 8000);
  }

  root.DBRBoot = {
    phase: function phase(message) {
      if (finished) return;
      var status = element("syncStatus");
      if (status && message) status.textContent = String(message);
    },
    fail: function fail(message) {
      if (finished) return;
      explicitFailure = String(message || "The reader could not start.");
      if (startupTimer !== null) root.clearTimeout(startupTimer);
      if (completionTimer !== null) root.clearTimeout(completionTimer);
      showRecovery();
    },
    coreStarted: function coreStarted() {
      if (finished || coreHasStarted) return;
      markStartupMilestone("applicationCodeLoaded");
      coreHasStarted = true;
      if (startupTimer !== null) root.clearTimeout(startupTimer);
      completionTimer = root.setTimeout(showRecovery, 45000);
    },
    ready: function ready() {
      finished = true;
      if (startupTimer !== null) root.clearTimeout(startupTimer);
      if (completionTimer !== null) root.clearTimeout(completionTimer);
    }
  };

  if (root.document) {
    if (root.document.getElementById("appMain")) arm();
    else root.document.addEventListener("DOMContentLoaded", arm, {once: true});
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
