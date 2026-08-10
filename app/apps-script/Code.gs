/**
 * Daily Bible Reader Apps Script backend.
 *
 * Production secrets and Google resource IDs belong only in Script Properties.
 * Every browser-callable function returns a small RPC envelope and fails closed.
 */

const DBR_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/script.external_request",
  "https://www.googleapis.com/auth/userinfo.email"
];

const DBR_PROPERTIES = {
  manifestFileId: "PRIVATE_MANIFEST_FILE_ID",
  commentsSpreadsheetId: "COMMENTS_SPREADSHEET_ID",
  commentsSheetName: "COMMENTS_SHEET_NAME",
  highlightsSheetName: "HIGHLIGHTS_SHEET_NAME",
  authorizedUsers: "AUTHORIZED_USERS_JSON",
  esvApiKey: "ESV_API_KEY"
};

const DBR_BUILD_ID = "__DBR_BUILD_ID__";
const DBR_FAVICON_URL = "__DBR_FAVICON_DATA_URL__";
const DBR_COMMENTARY_SCHEMA_VERSIONS = ["commentary/v1", "commentary/v2", "commentary/v3"];
const DBR_READER_ENROLLMENT = {
  propertyKey: "DBR_READER_ENROLLMENT",
  version: "reader-enrollment/v1"
};
const DBR_PRIVATE_STATE_CACHE = {
  key: "private-state-v1",
  ttlSeconds: 30
};

const DBR_COMMENT_COLUMNS = [
  "event_id",
  "comment_id",
  "client_request_id",
  "plan_version",
  "reading_id",
  "event_type",
  "author_id",
  "display_name",
  "body_json",
  "base_revision",
  "revision",
  "created_at",
  "updated_at",
  "deleted_at",
  "received_at"
];
const DBR_HIGHLIGHT_COLUMNS = [
  "event_id",
  "highlight_id",
  "client_request_id",
  "plan_version",
  "reading_id",
  "event_type",
  "book_id",
  "chapter",
  "verse",
  "author_id",
  "display_name",
  "base_revision",
  "revision",
  "created_at",
  "updated_at",
  "deleted_at",
  "received_at"
];

const DBR_ESV_POLICY = {
  provider: "Crossway ESV API",
  translation: "ESV",
  policyVersion: "esv-api-2026-08-08-v3-network-only",
  verifiedAt: "2026-08-08",
  termsUrl: "https://api.esv.org/",
  maxVersesPerRequest: 500,
  maxTotalCachedVerses: 500,
  maxBookFraction: 0.5,
  maxCacheAgeSeconds: 0,
  offlinePersistenceAllowed: false,
  refreshBehavior: "network_every_open",
  downloadAllowed: false,
  bulkCopyAllowed: false,
  apiKeyMayReachClient: false,
  requiredAttribution: {
    label: "ESV",
    notice: "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated into any other language.\n\nUsers may not copy or download more than 500 verses of the ESV Bible or more than one half of any book of the ESV Bible.",
    linkUrl: "https://www.esv.org/"
  }
};

const DBR_BOOK_NAMES = {
  "1PE": "1 Peter",
  MIC: "Micah",
  NAM: "Nahum",
  PRO: "Proverbs"
};
const DBR_BRIDGE_READING_IDS = [
  "CC-Y3Q4-D054",
  "CC-Y3Q4-D055",
  "CC-Y3Q4-D056",
  "CC-Y3Q4-D057",
  "CC-Y3Q4-D058",
  "CC-Y3Q4-D059",
  "CC-Y3Q4-D060"
];

function doGet() {
  const output = HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Daily Bible Reader")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover")
    .addMetaTag("apple-mobile-web-app-capable", "yes")
    .addMetaTag("mobile-web-app-capable", "yes");
  try {
    // Apps Script ignores favicon link tags written directly in an HTML file.
    // setFaviconUrl applies the icon to the outer HtmlOutput document instead.
    output.setFaviconUrl(DBR_FAVICON_URL);
  } catch (_) {
    // An icon-delivery failure must never prevent the private reader from opening.
  }
  return output;
}

function getBootstrapData(readerCode) {
  return dbrRpc_(function () {
    const context = dbrAuthorizedContext_(readerCode);
    const privateState = dbrReadPrivateState_(context);
    return {
      mode: "apps-script",
      appBuildId: DBR_BUILD_ID,
      appUrl: ScriptApp.getService().getUrl(),
      config: privateState.config,
      plan: privateState.plan,
      providerPolicy: DBR_ESV_POLICY,
      session: context.identity,
      participants: context.participants,
      readerEnrollmentRemembered: context.readerEnrollmentRemembered,
      sources: []
    };
  });
}

function confirmReaderAccess(readerCode) {
  return dbrRpc_(function () {
    const context = dbrAuthorizedContext_(readerCode);
    const manifestId = PropertiesService.getScriptProperties().getProperty(DBR_PROPERTIES.manifestFileId);
    if (!manifestId) throw dbrError_("CONTENT_ACCESS_DENIED", "Private manifest is not configured.");
    // Reading and parsing the configured manifest proves that Drive still grants
    // this accessing user the content gate; no plan or commentary is returned.
    DBRServerCore.parseManifest(dbrReadJsonFile_(manifestId, 150000, "CONTENT_ACCESS_DENIED"));
    return {
      appBuildId: DBR_BUILD_ID,
      appUrl: ScriptApp.getService().getUrl(),
      session: context.identity,
      participants: context.participants,
      readerEnrollmentRemembered: context.readerEnrollmentRemembered
    };
  });
}

function forgetReaderEnrollment(readerCode) {
  return dbrRpc_(function () {
    dbrAuthorizedContext_(readerCode);
    PropertiesService.getUserProperties().deleteProperty(DBR_READER_ENROLLMENT.propertyKey);
    return {forgotten: true};
  });
}

function getReadingPayload(readerCode, readingId) {
  return dbrRpc_(function () {
    const context = dbrAuthorizedContext_(readerCode);
    dbrEnforceRateLimit_("reading", 120, 60);
    const privateState = dbrReadPrivateState_(context);
    const registry = dbrReadJsonFile_(privateState.manifest.sourceRegistryFileId, 1000000, "SOURCE_REGISTRY_INVALID");
    return dbrBuildReadingPayload_(privateState, registry, readingId);
  });
}

function getReadingPayloads(readerCode, readingIds) {
  return dbrRpc_(function () {
    const context = dbrAuthorizedContext_(readerCode);
    dbrEnforceRateLimit_("reading-batch", 20, 60);
    const privateState = dbrReadPrivateState_(context);
    if (!Array.isArray(readingIds) || readingIds.length < 1 || readingIds.length > 7) {
      throw dbrError_("INVALID_READING", "Reading batch is invalid.");
    }
    const normalized = readingIds.map(function (readingId) { return String(readingId || ""); });
    if (new Set(normalized).size !== normalized.length) {
      throw dbrError_("INVALID_READING", "Reading batch is invalid.");
    }
    normalized.forEach(function (readingId) {
      DBRServerCore.getPlanEntry(privateState.plan, readingId);
    });
    const registry = dbrReadJsonFile_(privateState.manifest.sourceRegistryFileId, 1000000, "SOURCE_REGISTRY_INVALID");
    const payloads = {};
    normalized.forEach(function (readingId) {
      payloads[readingId] = dbrBuildReadingPayload_(privateState, registry, readingId);
    });
    return {planVersion: privateState.plan.planVersion, payloads: payloads};
  });
}

function dbrBuildReadingPayload_(privateState, registry, readingId) {
  const entry = DBRServerCore.getPlanEntry(privateState.plan, readingId);
  const files = DBRServerCore.resolveReadingFiles(privateState.manifest, readingId);
  const contentMarkdown = dbrReadTextFile_(files.contentFileId, 800000);
  if (/<\/?(?:script|iframe|object|embed|style)\b/i.test(contentMarkdown)) {
    throw dbrError_("CONTENT_INVALID", "Private commentary contains unsupported raw HTML.");
  }
  const metadata = dbrReadJsonFile_(files.metadataFileId, 500000, "CONTENT_INVALID");
  if (!metadata || metadata.readingId !== entry.readingId ||
      !DBR_COMMENTARY_SCHEMA_VERSIONS.includes(metadata.schemaVersion)) {
    throw dbrError_("CONTENT_MISMATCH", "Private commentary did not match the selected reading.");
  }
  metadata.verseOfTheDay = DBRServerCore.validateVerseOfTheDay(metadata.verseOfTheDay, entry);
  const commentary = dbrMergeCommentaryMarkdown_(metadata, contentMarkdown);
  const sourceIds = dbrCommentarySourceIds_(commentary, entry);
  const sources = dbrFilterAndValidateSources_(registry, sourceIds);
  return {commentary: commentary, sources: sources};
}

function getScripture(readerCode, readingId) {
  return dbrRpc_(function () {
    const context = dbrAuthorizedContext_(readerCode);
    dbrEnforceRateLimit_("scripture", 60, 60);
    const privateState = dbrReadPrivateState_(context);
    const entry = DBRServerCore.getPlanEntry(privateState.plan, readingId);
    if (entry.kind !== "chapter") {
      return {available: false, code: "NOT_A_CONFIGURED_CHAPTER"};
    }
    const requestedPassages = Array.isArray(entry.passages) ? entry.passages : [];
    if (!requestedPassages.length || requestedPassages.length > 5) {
      throw dbrError_("CONTENT_INVALID", "The daily Scripture references are invalid.");
    }
    const versesByBook = {};
    requestedPassages.forEach(function (passage) {
      const hasRange = Number.isInteger(passage && passage.verseStart) || Number.isInteger(passage && passage.verseEnd);
      if (!passage || !DBR_BOOK_NAMES[passage.bookId] || !Number.isInteger(passage.chapter) ||
          !Number.isInteger(passage.verseCount) || passage.verseCount < 1 ||
          passage.verseCount > DBR_ESV_POLICY.maxVersesPerRequest ||
          (hasRange && (!Number.isInteger(passage.verseStart) || !Number.isInteger(passage.verseEnd) ||
            passage.verseEnd < passage.verseStart || passage.verseCount !== passage.verseEnd - passage.verseStart + 1))) {
        throw dbrError_("CONTENT_INVALID", "A daily Scripture reference is invalid.");
      }
      const metrics = privateState.plan.bookMetrics && privateState.plan.bookMetrics[passage.bookId];
      if (!metrics || !Number.isInteger(metrics.verseCount) || !Number.isInteger(metrics.chapterCount) ||
          passage.chapter > metrics.chapterCount) {
        throw dbrError_("PROVIDER_METRICS_MISSING", "Provider metrics are unavailable for this passage.");
      }
      versesByBook[passage.bookId] = (versesByBook[passage.bookId] || 0) + passage.verseCount;
    });
    Object.keys(versesByBook).forEach(function (bookId) {
      const bookVerseCount = privateState.plan.bookMetrics[bookId].verseCount;
      if (versesByBook[bookId] > Math.floor(bookVerseCount * DBR_ESV_POLICY.maxBookFraction)) {
        throw dbrError_("PROVIDER_DISPLAY_LIMIT", "This combined reading exceeds the ESV per-book display limit.");
      }
    });
    const apiKey = PropertiesService.getScriptProperties().getProperty(DBR_PROPERTIES.esvApiKey);
    if (!apiKey) return {available: false, code: "ESV_NOT_CONFIGURED"};
    const requests = requestedPassages.map(function (passage) {
      const reference = DBR_BOOK_NAMES[passage.bookId] + " " + passage.chapter +
        (Number.isInteger(passage.verseStart) ? ":" + passage.verseStart + "-" + passage.verseEnd : "");
      const query = [
        "q=" + encodeURIComponent(reference),
        "include-passage-references=true",
        "include-verse-numbers=true",
        "include-first-verse-numbers=true",
        "include-footnotes=false",
        "include-footnote-body=false",
        "include-headings=false",
        "include-short-copyright=true",
        "include-copyright=false",
        "include-passage-horizontal-lines=false",
        "include-heading-horizontal-lines=false",
        "line-length=0"
      ].join("&");
      return {
        url: "https://api.esv.org/v3/passage/text/?" + query,
        method: "get",
        headers: {Authorization: "Token " + apiKey},
        muteHttpExceptions: true,
        followRedirects: false
      };
    });
    const responses = UrlFetchApp.fetchAll(requests);
    if (responses.some(function (response) { return response.getResponseCode() !== 200; })) {
      return {available: false, code: "ESV_UNAVAILABLE"};
    }
    let validatedPassages;
    try {
      validatedPassages = responses.map(function (response, index) {
        const requested = requestedPassages[index];
        const reference = DBR_BOOK_NAMES[requested.bookId] + " " + requested.chapter +
          (Number.isInteger(requested.verseStart) ? ":" + requested.verseStart + "-" + requested.verseEnd : "");
        const parsed = JSON.parse(response.getContentText("UTF-8"));
        const validated = DBRServerCore.validateEsvPayload(parsed, {
          verseCount: requested.verseCount,
          startVerse: Number.isInteger(requested.verseStart) ? requested.verseStart : 1,
          endVerse: Number.isInteger(requested.verseEnd) ? requested.verseEnd : requested.verseCount
        });
        return {
          bookId: requested.bookId,
          chapter: requested.chapter,
          verseStart: Number.isInteger(requested.verseStart) ? requested.verseStart : 1,
          verseEnd: Number.isInteger(requested.verseEnd) ? requested.verseEnd : requested.verseCount,
          canonical: validated.canonical,
          passage: validated.passage,
          verseCount: validated.verseCount,
          bookVerseCount: privateState.plan.bookMetrics[requested.bookId].verseCount,
          esvUrl: "https://www.esv.org/" + reference.replace(/\s+/g, "+") + "/"
        };
      });
    } catch (error) {
      return {available: false, code: "ESV_INVALID_RESPONSE"};
    }
    return {
      available: true,
      readingId: entry.readingId,
      translation: "ESV",
      canonical: validatedPassages.map(function (passage) { return passage.canonical; }).join("; "),
      passages: validatedPassages,
      verseCount: validatedPassages.reduce(function (total, passage) { return total + passage.verseCount; }, 0),
      fetchedAt: new Date().toISOString(),
      esvUrl: validatedPassages[0].esvUrl,
      policyVersion: DBR_ESV_POLICY.policyVersion,
      cacheAllowed: false
    };
  });
}

function listComments(readerCode, readingId) {
  return dbrRpc_(function () {
    const context = dbrAuthorizedContext_(readerCode);
    dbrEnforceRateLimit_("comments-read", 120, 60);
    const privateState = dbrReadPrivateState_(context);
    DBRServerCore.getPlanEntry(privateState.plan, readingId);
    const events = dbrReadCommentEvents_().filter(function (event) {
      return event.readingId === readingId && event.planVersion === privateState.plan.planVersion;
    });
    return DBRServerCore.materializeCommentEvents(events);
  });
}

function listCommentActivity(readerCode, readingIds) {
  return dbrRpc_(function () {
    const context = dbrAuthorizedContext_(readerCode);
    dbrEnforceRateLimit_("comment-activity", 60, 60);
    const privateState = dbrReadPrivateState_(context);
    if (!Array.isArray(readingIds) || readingIds.length > 42) {
      throw dbrError_("INVALID_COMMENT_ACTIVITY", "Comment activity request is invalid.");
    }
    const uniqueReadingIds = Array.from(new Set(readingIds.map(function (readingId) { return String(readingId || ""); })));
    if (uniqueReadingIds.length !== readingIds.length) {
      throw dbrError_("INVALID_COMMENT_ACTIVITY", "Comment activity request is invalid.");
    }
    uniqueReadingIds.forEach(function (readingId) {
      DBRServerCore.getPlanEntry(privateState.plan, readingId);
    });
    const events = dbrReadCommentEvents_();
    const activity = DBRServerCore.participantCommentActivity(events, {
      participants: context.participants,
      planVersion: privateState.plan.planVersion,
      readingIds: uniqueReadingIds
    });
    return {
      planVersion: privateState.plan.planVersion,
      participants: activity.participants,
      completedByReadingId: activity.completedByReadingId,
      completedReadingIds: uniqueReadingIds.filter(function (readingId) {
        return activity.completedByReadingId[readingId].includes(context.identity.authorId);
      })
    };
  });
}

function submitCommentEvent(readerCode, payload) {
  return dbrRpc_(function () {
    const context = dbrAuthorizedContext_(readerCode);
    dbrEnforceRateLimit_("comments-write", 30, 60);
    const privateState = dbrReadPrivateState_(context);
    DBRServerCore.validateCommentRequest(payload, privateState.plan);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) throw dbrError_("COMMENT_STORE_BUSY", "Discussion is busy; retry shortly.");
    try {
      const events = dbrReadCommentEvents_();
      const result = DBRServerCore.applyCommentEvent({
        payload: payload,
        plan: privateState.plan,
        identity: context.identity,
        existingEvents: events,
        now: new Date().toISOString(),
        idFactory: function (kind) { return kind + ":" + Utilities.getUuid(); }
      });
      if (!result.idempotent) dbrAppendCommentEvent_(result.event);
      return result;
    } finally {
      lock.releaseLock();
    }
  });
}

function listHighlights(readerCode, readingId) {
  return dbrRpc_(function () {
    const context = dbrAuthorizedContext_(readerCode);
    dbrEnforceRateLimit_("highlights-read", 120, 60);
    const privateState = dbrReadPrivateState_(context);
    DBRServerCore.getPlanEntry(privateState.plan, readingId);
    const events = dbrReadHighlightEvents_().filter(function (event) {
      return event.readingId === readingId && event.planVersion === privateState.plan.planVersion;
    });
    return DBRServerCore.materializeHighlightEvents(events);
  });
}

function submitHighlightEvent(readerCode, payload) {
  return dbrRpc_(function () {
    const context = dbrAuthorizedContext_(readerCode);
    dbrEnforceRateLimit_("highlights-write", 60, 60);
    const privateState = dbrReadPrivateState_(context);
    DBRServerCore.validateHighlightRequest(payload, privateState.plan);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) throw dbrError_("HIGHLIGHT_STORE_BUSY", "Highlights are busy; retry shortly.");
    try {
      const events = dbrReadHighlightEvents_();
      const result = DBRServerCore.applyHighlightEvent({
        payload: payload,
        plan: privateState.plan,
        identity: context.identity,
        existingEvents: events,
        now: new Date().toISOString(),
        idFactory: function (kind) { return kind + ":" + Utilities.getUuid(); }
      });
      if (!result.idempotent) dbrAppendHighlightEvent_(result.event);
      return result;
    } finally {
      lock.releaseLock();
    }
  });
}

function dbrRpc_(operation) {
  try {
    return {ok: true, data: operation()};
  } catch (error) {
    return {ok: false, error: dbrPublicError_(error)};
  }
}

function dbrPublicError_(error) {
  const allowed = {
    AUTH_REQUIRED: "Authorization is required.",
    ACCESS_DENIED: "This account is not authorized.",
    WRONG_EXECUTION_IDENTITY: "The deployment is not running as the accessing user.",
    READER_CODE_REQUIRED: "Enter the reader code assigned to this Google account.",
    READER_CODE_INVALID: "That reader code is not valid for this Google account.",
    CONTENT_ACCESS_DENIED: "Private content is unavailable to this account.",
    READING_NOT_FOUND: "Reading is unavailable.",
    INVALID_READING: "Reading request is invalid.",
    PLAN_VERSION_MISMATCH: "The reading plan changed; refresh before commenting.",
    COMMENT_EMPTY: "Comment body is required.",
    COMMENT_TOO_LARGE: "Comment body is too large.",
    COMMENT_INVALID: "Comment body is invalid.",
    INVALID_REQUEST_ID: "Comment request ID is invalid.",
    INVALID_COMMENT_ID: "Comment ID is invalid.",
    INVALID_REVISION: "Comment revision is invalid.",
    INVALID_COMMENT_ACTIVITY: "Comment activity request is invalid.",
    COMMENT_NOT_FOUND: "Comment is unavailable or already deleted.",
    COMMENT_FORBIDDEN: "Only the author may change this comment.",
    COMMENT_ASSOCIATION_MISMATCH: "Comment belongs to a different reading.",
    REVISION_CONFLICT: "Comment changed on another client; refresh before editing.",
    COMMENT_STORE_BUSY: "Discussion is busy; retry shortly.",
    COMMENT_STORE_UNAVAILABLE: "Discussion storage is unavailable.",
    INVALID_HIGHLIGHT_REQUEST: "Highlight request is invalid.",
    INVALID_HIGHLIGHT_EVENT: "Highlight action is invalid.",
    INVALID_HIGHLIGHT_REFERENCE: "Highlighted verse is not part of this reading.",
    INVALID_HIGHLIGHT_ID: "Highlight identifier is invalid.",
    HIGHLIGHT_NOT_FOUND: "Highlight is unavailable or already removed.",
    HIGHLIGHT_FORBIDDEN: "Only the reader who added a highlight may remove it.",
    HIGHLIGHT_ASSOCIATION_MISMATCH: "Highlight belongs to a different verse or reading.",
    HIGHLIGHT_STORE_BUSY: "Highlights are busy; retry shortly.",
    HIGHLIGHT_STORE_UNAVAILABLE: "Shared highlight storage is unavailable.",
    RATE_LIMITED: "Too many requests; retry shortly.",
    ESV_RANGE_MISMATCH: "Scripture response did not match the configured chapter.",
    INVALID_ESV_RESPONSE: "Scripture provider returned an invalid response.",
    PROVIDER_METRICS_MISSING: "Scripture cache metrics are unavailable.",
    CONTENT_INVALID: "Private commentary is invalid.",
    CONTENT_MISMATCH: "Private commentary does not match this reading.",
    SOURCE_REGISTRY_INVALID: "Source registry is invalid."
  };
  const code = error && error.code && allowed[error.code] ? error.code : "SERVER_UNAVAILABLE";
  return {code: code, message: allowed[code] || "The server could not complete the request."};
}

function dbrError_(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function dbrAuthorizationReady_() {
  const info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL, DBR_REQUIRED_SCOPES);
  return info.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.NOT_REQUIRED;
}

function dbrHashReaderCode_(readerCode) {
  const normalized = String(readerCode || "").trim();
  if (!normalized) throw dbrError_("READER_CODE_REQUIRED", "Reader code is required.");
  if (normalized.length < 12 || normalized.length > 128 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw dbrError_("READER_CODE_INVALID", "Reader code format is invalid.");
  }
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    normalized,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (value) {
    const unsigned = value < 0 ? value + 256 : value;
    return unsigned.toString(16).padStart(2, "0");
  }).join("");
}

function dbrReadReaderEnrollment_() {
  const raw = PropertiesService.getUserProperties().getProperty(DBR_READER_ENROLLMENT.propertyKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

function dbrAuthorizedContext_(readerCode) {
  if (!dbrAuthorizationReady_()) throw dbrError_("AUTH_REQUIRED", "Authorization is required.");
  const activeEmail = Session.getActiveUser().getEmail();
  const effectiveEmail = Session.getEffectiveUser().getEmail();
  const raw = PropertiesService.getScriptProperties().getProperty(DBR_PROPERTIES.authorizedUsers);
  let allowedUsers;
  try {
    allowedUsers = raw ? JSON.parse(raw) : [];
  } catch (error) {
    throw dbrError_("ACCESS_DENIED", "Authorized users are not configured.");
  }
  const normalizedReaderCode = String(readerCode || "").trim();
  const presentedReaderCodeHash = normalizedReaderCode ? dbrHashReaderCode_(normalizedReaderCode) : "";
  const readerEnrollment = dbrReadReaderEnrollment_();
  const identity = DBRServerCore.authorizeIdentity({
    activeEmail: activeEmail,
    effectiveEmail: effectiveEmail,
    allowedUsers: allowedUsers,
    presentedReaderCodeHash: presentedReaderCodeHash,
    readerEnrollment: readerEnrollment,
    requiredEnrollmentVersion: DBR_READER_ENROLLMENT.version
  });
  if (presentedReaderCodeHash) {
    PropertiesService.getUserProperties().setProperty(DBR_READER_ENROLLMENT.propertyKey, JSON.stringify({
      version: DBR_READER_ENROLLMENT.version,
      authorId: identity.authorId,
      readerCodeHash: presentedReaderCodeHash,
      enrolledAt: new Date().toISOString()
    }));
  }
  return {
    identity: identity,
    participants: DBRServerCore.publicParticipants(allowedUsers),
    readerEnrollmentRemembered: true
  };
}

function dbrReadPrivateState_() {
  const manifestId = PropertiesService.getScriptProperties().getProperty(DBR_PROPERTIES.manifestFileId);
  if (!manifestId) throw dbrError_("CONTENT_ACCESS_DENIED", "Private manifest is not configured.");
  try {
    let userCache = null;
    let cached = null;
    try {
      userCache = CacheService.getUserCache();
      const raw = userCache.get(DBR_PRIVATE_STATE_CACHE.key);
      cached = raw ? JSON.parse(raw) : null;
    } catch (_) {
      cached = null;
    }
    if (cached && cached.manifestFileId === manifestId && cached.manifest && cached.config && cached.plan) {
      // Cache avoids reparsing three Drive blobs during a burst of related RPCs,
      // but file access is still checked under the accessing user's identity.
      [manifestId, cached.manifest.appConfigFileId, cached.manifest.planFileId].forEach(function (fileId) {
        DriveApp.getFileById(fileId).getId();
      });
      dbrValidatePrivateConfig_(cached.config, cached.plan);
      return {manifest: cached.manifest, config: cached.config, plan: cached.plan};
    }
    const manifest = DBRServerCore.parseManifest(dbrReadJsonFile_(manifestId, 150000, "CONTENT_ACCESS_DENIED"));
    const config = dbrReadJsonFile_(manifest.appConfigFileId, 150000, "CONTENT_ACCESS_DENIED");
    const plan = dbrReadJsonFile_(manifest.planFileId, 500000, "CONTENT_ACCESS_DENIED");
    dbrValidatePrivateConfig_(config, plan);
    if (userCache) {
      try {
        userCache.put(DBR_PRIVATE_STATE_CACHE.key, JSON.stringify({
          manifestFileId: manifestId,
          manifest: manifest,
          config: config,
          plan: plan
        }), DBR_PRIVATE_STATE_CACHE.ttlSeconds);
      } catch (_) {
        // Cache is an optimization only; Drive remains canonical.
      }
    }
    return {manifest: manifest, config: config, plan: plan};
  } catch (error) {
    if (error && error.code) throw error;
    throw dbrError_("CONTENT_ACCESS_DENIED", "Private content is unavailable to this account.");
  }
}

function dbrValidatePrivateConfig_(config, plan) {
  if (!config || config.schemaVersion !== "app-config/v1" || config.displayTranslation !== "ESV" || config.runtimeAI !== false) {
    throw dbrError_("CONTENT_INVALID", "Application configuration is invalid.");
  }
  if (!["fixed", "testing_today"].includes(config.sharedStartDateMode) ||
      !Number.isInteger(config.futureLookaheadDays) || config.futureLookaheadDays < 0 || config.futureLookaheadDays > 7 ||
      !Number.isInteger(config.offlineReadingWindowDays) || config.offlineReadingWindowDays < 1 || config.offlineReadingWindowDays > 7 ||
      !Number.isInteger(config.privateContentCacheMaxAgeSeconds) || config.privateContentCacheMaxAgeSeconds < 0 ||
      config.privateContentCacheMaxAgeSeconds > 604800) {
    throw dbrError_("CONTENT_INVALID", "Schedule or offline configuration is invalid.");
  }
  if (!plan || plan.schemaVersion !== "plan/v1" || plan.planVersion !== "celebration-y3q4-bridge-2026-v1" ||
      !Array.isArray(plan.entries) || plan.entries.length !== DBR_BRIDGE_READING_IDS.length) {
    throw dbrError_("CONTENT_INVALID", "Bridge plan must contain exactly the approved seven readings.");
  }
  try {
    DBRServerCore.validatePlanStructure(plan);
  } catch (error) {
    throw dbrError_("CONTENT_INVALID", "Reading-plan structure is invalid.");
  }
  plan.entries.forEach(function (entry, index) {
    if (!entry || entry.readingId !== DBR_BRIDGE_READING_IDS[index] || entry.dayIndex !== index + 1 ||
        entry.kind !== "chapter" || !Array.isArray(entry.passages) || !entry.passages.length ||
        entry.passages.length > 5 || entry.bookId !== entry.passages[0].bookId ||
        entry.chapter !== entry.passages[0].chapter) {
      throw dbrError_("CONTENT_INVALID", "Bridge plan order or passage configuration is invalid.");
    }
  });
}

function dbrReadTextFile_(fileId, maxBytes) {
  try {
    const file = DriveApp.getFileById(fileId);
    const size = file.getSize();
    if (size > maxBytes) throw dbrError_("CONTENT_INVALID", "Private file is too large.");
    const text = file.getBlob().getDataAsString("UTF-8");
    if (text.length > maxBytes) throw dbrError_("CONTENT_INVALID", "Private file is too large.");
    return text;
  } catch (error) {
    if (error && error.code) throw error;
    throw dbrError_("CONTENT_ACCESS_DENIED", "Private file is unavailable.");
  }
}

function dbrReadJsonFile_(fileId, maxBytes, errorCode) {
  const text = dbrReadTextFile_(fileId, maxBytes);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw dbrError_(errorCode || "CONTENT_INVALID", "Private JSON file is invalid.");
  }
}

function dbrSlug_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function dbrMergeCommentaryMarkdown_(metadata, markdown) {
  const copy = JSON.parse(JSON.stringify(metadata));
  const sections = {};
  let currentTitle = "";
  let currentLines = [];
  function flush() {
    if (currentTitle) sections[dbrSlug_(currentTitle)] = currentLines.join("\n").trim();
    currentLines = [];
  }
  String(markdown || "").replace(/\r\n?/g, "\n").split("\n").forEach(function (line) {
    const heading = /^##\s+(.+)$/.exec(line.trim());
    if (heading) {
      flush();
      currentTitle = heading[1].trim();
    } else if (!/^#\s+/.test(line.trim())) {
      currentLines.push(line);
    }
  });
  flush();
  copy.sections = (copy.sections || []).map(function (section) {
    const replacement = sections[dbrSlug_(section.title)];
    if (replacement) section.markdown = replacement;
    return section;
  });
  const overview = sections["brief-overview"];
  if (overview) copy.overview = overview;
  const comprehensiveSynthesis = sections["comprehensive-synthesis"];
  if (copy.comprehensiveSynthesis && comprehensiveSynthesis) {
    copy.comprehensiveSynthesis.markdown = comprehensiveSynthesis;
  }
  if ((!copy.keyInsights || !copy.keyInsights.length) && copy.commentarySummary && copy.commentarySummary.paragraphs) {
    const paragraphs = copy.commentarySummary.paragraphs;
    const sourceIds = new Set();
    paragraphs.forEach(function (paragraph) {
      (paragraph.sourceIds || []).forEach(function (id) { sourceIds.add(id); });
    });
    copy.keyInsights = paragraphs.length ? [{
      insightId: "commentary-summary-compat",
      title: "Commentary summary",
      markdown: paragraphs.map(function (paragraph) { return paragraph.markdown; }).join("\n\n"),
      sourceIds: Array.from(sourceIds)
    }] : [];
  }
  return copy;
}

function dbrCommentarySourceIds_(commentary, entry) {
  const ids = new Set(entry.sourceIds || []);
  const dailyIntroduction = commentary.dailyIntroduction || {};
  (dailyIntroduction.sourceIds || []).forEach(function (id) { ids.add(id); });
  const commentarySummary = commentary.commentarySummary || {};
  (commentarySummary.paragraphs || []).forEach(function (paragraph) {
    (paragraph.sourceIds || []).forEach(function (id) { ids.add(id); });
  });
  const practicalTakeaway = commentary.practicalTakeaway || {};
  (practicalTakeaway.sourceIds || []).forEach(function (id) { ids.add(id); });
  const comprehensiveSynthesis = commentary.comprehensiveSynthesis || {};
  (comprehensiveSynthesis.sourceIds || []).forEach(function (id) { ids.add(id); });
  (commentary.sections || []).forEach(function (section) {
    (section.sourceIds || []).forEach(function (id) { ids.add(id); });
  });
  (commentary.claims || []).forEach(function (claim) {
    (claim.sourceIds || []).forEach(function (id) { ids.add(id); });
  });
  return Array.from(ids);
}

function dbrFilterAndValidateSources_(registry, sourceIds) {
  if (!registry || registry.schemaVersion !== "source-registry/v1" || !Array.isArray(registry.sources)) {
    throw dbrError_("SOURCE_REGISTRY_INVALID", "Source registry is invalid.");
  }
  const byId = {};
  registry.sources.forEach(function (source) {
    if (!source || !source.sourceId || byId[source.sourceId]) throw dbrError_("SOURCE_REGISTRY_INVALID", "Source registry IDs are invalid.");
    byId[source.sourceId] = source;
  });
  return sourceIds.map(function (id) {
    const source = byId[id];
    if (!source || !["consulted", "included"].includes(source.summaryUseStatus)) {
      throw dbrError_("SOURCE_REGISTRY_INVALID", "A cited source is not eligible for synthesis use.");
    }
    return source;
  });
}

function dbrEnforceRateLimit_(bucket, maximum, windowSeconds) {
  const props = PropertiesService.getUserProperties();
  const key = "rate:" + bucket;
  const now = Date.now();
  let state = {startedAt: now, count: 0};
  try {
    const raw = props.getProperty(key);
    if (raw) state = JSON.parse(raw);
  } catch (error) {
    state = {startedAt: now, count: 0};
  }
  if (!state.startedAt || now - state.startedAt >= windowSeconds * 1000) state = {startedAt: now, count: 0};
  if (state.count >= maximum) throw dbrError_("RATE_LIMITED", "Too many requests.");
  state.count += 1;
  props.setProperty(key, JSON.stringify(state));
}

function dbrCommentSheet_() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty(DBR_PROPERTIES.commentsSpreadsheetId);
  const sheetName = props.getProperty(DBR_PROPERTIES.commentsSheetName) || "comment-events";
  if (!spreadsheetId) throw dbrError_("COMMENT_STORE_UNAVAILABLE", "Comment Sheet is not configured.");
  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) throw dbrError_("COMMENT_STORE_UNAVAILABLE", "Comment Sheet tab is unavailable.");
    dbrAssertCommentHeader_(sheet);
    return sheet;
  } catch (error) {
    if (error && error.code) throw error;
    throw dbrError_("COMMENT_STORE_UNAVAILABLE", "Comment Sheet is unavailable to this account.");
  }
}

function dbrAssertCommentHeader_(sheet) {
  if (sheet.getLastRow() < 1) throw dbrError_("COMMENT_STORE_UNAVAILABLE", "Comment Sheet header is missing.");
  const header = sheet.getRange(1, 1, 1, DBR_COMMENT_COLUMNS.length).getDisplayValues()[0];
  if (header.some(function (value, index) { return value !== DBR_COMMENT_COLUMNS[index]; })) {
    throw dbrError_("COMMENT_STORE_UNAVAILABLE", "Comment Sheet header does not match the application schema.");
  }
}

function dbrReadCommentEvents_() {
  const sheet = dbrCommentSheet_();
  const rowCount = sheet.getLastRow() - 1;
  if (rowCount <= 0) return [];
  if (rowCount > 10000) throw dbrError_("COMMENT_STORE_UNAVAILABLE", "Comment history exceeds the pilot limit.");
  const rows = sheet.getRange(2, 1, rowCount, DBR_COMMENT_COLUMNS.length).getValues();
  return rows.map(dbrCommentRowToEvent_).filter(function (event) { return event.eventId && event.commentId; });
}

function dbrCommentRowToEvent_(row) {
  let body = "";
  try {
    body = JSON.parse(String(row[8] || "\"\""));
  } catch (error) {
    throw dbrError_("COMMENT_STORE_UNAVAILABLE", "Stored comment body is invalid.");
  }
  return {
    eventId: String(row[0] || ""),
    commentId: String(row[1] || ""),
    clientRequestId: String(row[2] || ""),
    planVersion: String(row[3] || ""),
    readingId: String(row[4] || ""),
    eventType: String(row[5] || ""),
    authorId: String(row[6] || ""),
    displayName: String(row[7] || ""),
    body: String(body || ""),
    baseRevision: Number(row[9]),
    revision: Number(row[10]),
    createdAt: String(row[11] || ""),
    updatedAt: String(row[12] || ""),
    deletedAt: row[13] ? String(row[13]) : null
  };
}

function dbrAppendCommentEvent_(event) {
  const sheet = dbrCommentSheet_();
  const row = [
    event.eventId,
    event.commentId,
    event.clientRequestId,
    event.planVersion,
    event.readingId,
    event.eventType,
    event.authorId,
    event.displayName,
    JSON.stringify(event.body),
    event.baseRevision,
    event.revision,
    event.createdAt,
    event.updatedAt,
    event.deletedAt || "",
    new Date().toISOString()
  ];
  const range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length);
  range.setNumberFormat("@");
  range.setValues([row]);
  SpreadsheetApp.flush();
}

function dbrHighlightSheet_() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty(DBR_PROPERTIES.commentsSpreadsheetId);
  const sheetName = props.getProperty(DBR_PROPERTIES.highlightsSheetName) || "highlight-events";
  if (!spreadsheetId) throw dbrError_("HIGHLIGHT_STORE_UNAVAILABLE", "Shared Sheet is not configured.");
  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) throw dbrError_("HIGHLIGHT_STORE_UNAVAILABLE", "Highlight Sheet tab is unavailable.");
    dbrAssertHighlightHeader_(sheet);
    return sheet;
  } catch (error) {
    if (error && error.code) throw error;
    throw dbrError_("HIGHLIGHT_STORE_UNAVAILABLE", "Shared highlights are unavailable to this account.");
  }
}

function dbrAssertHighlightHeader_(sheet) {
  if (sheet.getLastRow() < 1) throw dbrError_("HIGHLIGHT_STORE_UNAVAILABLE", "Highlight Sheet header is missing.");
  const header = sheet.getRange(1, 1, 1, DBR_HIGHLIGHT_COLUMNS.length).getDisplayValues()[0];
  if (header.some(function (value, index) { return value !== DBR_HIGHLIGHT_COLUMNS[index]; })) {
    throw dbrError_("HIGHLIGHT_STORE_UNAVAILABLE", "Highlight Sheet header does not match the application schema.");
  }
}

function dbrReadHighlightEvents_() {
  const sheet = dbrHighlightSheet_();
  const rowCount = sheet.getLastRow() - 1;
  if (rowCount <= 0) return [];
  if (rowCount > 20000) throw dbrError_("HIGHLIGHT_STORE_UNAVAILABLE", "Highlight history exceeds the personal-app limit.");
  const rows = sheet.getRange(2, 1, rowCount, DBR_HIGHLIGHT_COLUMNS.length).getValues();
  return rows.map(dbrHighlightRowToEvent_).filter(function (event) { return event.eventId && event.highlightId; });
}

function dbrHighlightRowToEvent_(row) {
  return {
    eventId: String(row[0] || ""),
    highlightId: String(row[1] || ""),
    clientRequestId: String(row[2] || ""),
    planVersion: String(row[3] || ""),
    readingId: String(row[4] || ""),
    eventType: String(row[5] || ""),
    bookId: String(row[6] || ""),
    chapter: Number(row[7]),
    verse: Number(row[8]),
    authorId: String(row[9] || ""),
    displayName: String(row[10] || ""),
    baseRevision: Number(row[11]),
    revision: Number(row[12]),
    createdAt: String(row[13] || ""),
    updatedAt: String(row[14] || ""),
    deletedAt: row[15] ? String(row[15]) : null
  };
}

function dbrAppendHighlightEvent_(event) {
  const sheet = dbrHighlightSheet_();
  const row = [
    event.eventId,
    event.highlightId,
    event.clientRequestId,
    event.planVersion,
    event.readingId,
    event.eventType,
    event.bookId,
    event.chapter,
    event.verse,
    event.authorId,
    event.displayName,
    event.baseRevision,
    event.revision,
    event.createdAt,
    event.updatedAt,
    event.deletedAt || "",
    new Date().toISOString()
  ];
  const range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length);
  range.setNumberFormat("@");
  range.setValues([row]);
  SpreadsheetApp.flush();
}
