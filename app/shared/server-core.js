(function attachServerCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DBRServerCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function serverCoreFactory() {
  "use strict";

  const READING_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/;
  const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{15,99}$/;
  const FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;
  const READER_CODE_HASH = /^[a-f0-9]{64}$/;
  const MAX_COMMENT_LENGTH = 8000;

  function domainError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function constantTimeEqual(leftInput, rightInput) {
    const left = String(leftInput || "");
    const right = String(rightInput || "");
    const length = Math.max(left.length, right.length);
    let difference = left.length ^ right.length;
    for (let index = 0; index < length; index += 1) {
      difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
    }
    return difference === 0;
  }

  function authorizeIdentity(input) {
    const activeEmail = normalizeEmail(input && input.activeEmail);
    const effectiveEmail = normalizeEmail(input && input.effectiveEmail);
    const allowedUsers = Array.isArray(input && input.allowedUsers) ? input.allowedUsers : [];

    if (!activeEmail || !effectiveEmail) {
      throw domainError("AUTH_REQUIRED", "A verified Google user session is required.");
    }
    if (activeEmail !== effectiveEmail) {
      throw domainError("WRONG_EXECUTION_IDENTITY", "The application is not executing as the accessing user.");
    }

    const record = allowedUsers.find((user) => normalizeEmail(user && user.email) === activeEmail);
    if (!record || !record.authorId || !record.displayName) {
      throw domainError("ACCESS_DENIED", "This Google account is not authorized for this application.");
    }
    const configuredHash = String(record.readerCodeHash || "").toLowerCase();
    const presentedHash = String(input && input.presentedReaderCodeHash || "").toLowerCase();
    const enrollment = input && input.readerEnrollment && typeof input.readerEnrollment === "object"
      ? input.readerEnrollment
      : null;
    const requiredEnrollmentVersion = String(input && input.requiredEnrollmentVersion || "");
    const enrolledHash = enrollment &&
      requiredEnrollmentVersion &&
      enrollment.version === requiredEnrollmentVersion &&
      String(enrollment.authorId || "") === String(record.authorId) &&
      READER_CODE_HASH.test(String(enrollment.readerCodeHash || "").toLowerCase())
      ? String(enrollment.readerCodeHash).toLowerCase()
      : "";
    if (!READER_CODE_HASH.test(configuredHash)) {
      throw domainError("INVALID_SERVER_CONFIG", "Authorized-user reader-code configuration is invalid.");
    }
    if (!presentedHash && !enrolledHash) {
      throw domainError("READER_CODE_REQUIRED", "A reader code is required to enroll this Google account.");
    }
    const credentialHash = presentedHash || enrolledHash;
    if (!READER_CODE_HASH.test(credentialHash) || !constantTimeEqual(configuredHash, credentialHash)) {
      if (!presentedHash) throw domainError("READER_CODE_REQUIRED", "Reader-code enrollment must be renewed.");
      throw domainError("READER_CODE_INVALID", "The reader code is invalid for this Google account.");
    }
    if (String(record.authorId).length > 80 || String(record.displayName).length > 80) {
      throw domainError("INVALID_SERVER_CONFIG", "Authorized-user configuration is invalid.");
    }

    return {
      authorId: String(record.authorId),
      displayName: String(record.displayName)
    };
  }

  function authorizeTokenIdentity(input) {
    const allowedUsers = Array.isArray(input && input.allowedUsers) ? input.allowedUsers : [];
    const participants = publicParticipants(allowedUsers);
    const presentedHash = String(input && input.presentedReaderCodeHash || "").toLowerCase();
    if (!presentedHash) {
      throw domainError("READER_CODE_REQUIRED", "A private reader code is required.");
    }
    if (!READER_CODE_HASH.test(presentedHash)) {
      throw domainError("READER_CODE_INVALID", "The private reader code is invalid.");
    }

    const configuredHashes = allowedUsers.map((record) => String(record && record.readerCodeHash || "").toLowerCase());
    if (configuredHashes.some((hash) => !READER_CODE_HASH.test(hash)) ||
        new Set(configuredHashes).size !== configuredHashes.length) {
      throw domainError("INVALID_SERVER_CONFIG", "Authorized-reader token configuration is invalid.");
    }

    let matchingIndex = -1;
    configuredHashes.forEach((hash, index) => {
      if (constantTimeEqual(hash, presentedHash)) matchingIndex = matchingIndex === -1 ? index : -2;
    });
    if (matchingIndex < 0) {
      throw domainError("READER_CODE_INVALID", "The private reader code is invalid.");
    }
    return participants[matchingIndex];
  }

  function publicParticipants(allowedUsersInput) {
    const allowedUsers = Array.isArray(allowedUsersInput) ? allowedUsersInput : [];
    if (allowedUsers.length !== 2) {
      throw domainError("INVALID_SERVER_CONFIG", "Exactly two authorized readers are required.");
    }
    const participants = allowedUsers.map((record) => ({
      authorId: String(record && record.authorId || ""),
      displayName: String(record && record.displayName || "")
    }));
    if (participants.some((participant) =>
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(participant.authorId) ||
      !participant.displayName || participant.displayName.length > 80 ||
      /[\u0000-\u001F\u007F]/.test(participant.displayName)
    ) || new Set(participants.map((participant) => participant.authorId)).size !== participants.length) {
      throw domainError("INVALID_SERVER_CONFIG", "Authorized reader identities are invalid.");
    }
    return participants;
  }

  function parseManifest(manifest) {
    if (!manifest || manifest.schemaVersion !== "private-manifest/v1" ||
        !manifest.appConfigFileId || !manifest.planFileId || !manifest.sourceRegistryFileId ||
        !manifest.readings || typeof manifest.readings !== "object") {
      throw domainError("INVALID_MANIFEST", "Private content configuration is unavailable.");
    }
    const fileIds = [manifest.appConfigFileId, manifest.planFileId, manifest.sourceRegistryFileId];
    Object.values(manifest.readings).forEach((record) => {
      if (record && record.contentFileId) fileIds.push(record.contentFileId);
      if (record && record.metadataFileId) fileIds.push(record.metadataFileId);
    });
    if (fileIds.some((id) => !FILE_ID.test(String(id)))) {
      throw domainError("INVALID_MANIFEST", "Private content configuration contains an invalid file ID.");
    }
    return manifest;
  }

  function allowedManifestFileIds(manifest) {
    const parsed = parseManifest(manifest);
    const ids = new Set([parsed.appConfigFileId, parsed.planFileId, parsed.sourceRegistryFileId]);
    Object.values(parsed.readings).forEach((record) => {
      ids.add(record.contentFileId);
      ids.add(record.metadataFileId);
    });
    return ids;
  }

  function assertAllowedFileId(manifest, fileId) {
    if (!FILE_ID.test(String(fileId || "")) || !allowedManifestFileIds(manifest).has(fileId)) {
      throw domainError("FILE_NOT_ALLOWED", "Requested private file is not configured for this application.");
    }
    return fileId;
  }

  function resolveReadingFiles(manifest, readingId) {
    if (!READING_ID.test(String(readingId || ""))) {
      throw domainError("INVALID_READING", "Reading ID is invalid.");
    }
    const parsed = parseManifest(manifest);
    const record = parsed.readings[readingId];
    if (!record || !record.contentFileId || !record.metadataFileId) {
      throw domainError("READING_NOT_FOUND", "Reading is not configured.");
    }
    assertAllowedFileId(parsed, record.contentFileId);
    assertAllowedFileId(parsed, record.metadataFileId);
    return {contentFileId: record.contentFileId, metadataFileId: record.metadataFileId};
  }

  function manifestPreparedReadingIds(plan, manifest) {
    validatePlanStructure(plan);
    const parsed = parseManifest(manifest);
    const manifestIds = Object.keys(parsed.readings || {});
    if (!manifestIds.length) {
      throw domainError("INVALID_MANIFEST", "The private manifest must include a prepared reading.");
    }
    const planIds = new Set(plan.entries.map((entry) => entry.readingId));
    if (manifestIds.some((readingId) => !planIds.has(readingId))) {
      throw domainError("INVALID_MANIFEST", "The private manifest contains a reading outside the active plan.");
    }
    const prepared = [];
    let gapFound = false;
    plan.entries.forEach((entry) => {
      const configured = Object.prototype.hasOwnProperty.call(parsed.readings, entry.readingId);
      if (!configured) {
        gapFound = true;
        return;
      }
      if (gapFound) {
        throw domainError("INVALID_MANIFEST", "Prepared readings must be a contiguous prefix of the active plan.");
      }
      resolveReadingFiles(parsed, entry.readingId);
      prepared.push(entry.readingId);
    });
    if (prepared.length !== manifestIds.length) {
      throw domainError("INVALID_MANIFEST", "The private manifest has invalid prepared-reading membership.");
    }
    return prepared;
  }

  function getPlanEntry(plan, readingId) {
    if (!plan || !Array.isArray(plan.entries)) {
      throw domainError("INVALID_PLAN", "Reading plan is unavailable.");
    }
    const entry = plan.entries.find((candidate) => candidate && candidate.readingId === readingId);
    if (!entry) throw domainError("READING_NOT_FOUND", "Reading is not part of the active plan.");
    return entry;
  }

  function scriptureReadingId(request) {
    const readingId = typeof request === "string"
      ? request
      : request && typeof request === "object" && !Array.isArray(request)
        ? request.readingId
        : "";
    if (!READING_ID.test(String(readingId || ""))) {
      throw domainError("INVALID_READING", "Reading ID is invalid.");
    }
    return String(readingId);
  }

  function scriptureDisplaySegments(entry, bookMetrics, providerPolicy) {
    const passages = Array.isArray(entry && entry.passages) ? entry.passages : [];
    if (!passages.length) {
      throw domainError("CONTENT_INVALID", "The daily Scripture references are invalid.");
    }
    const maxBookFraction = Number(providerPolicy && providerPolicy.maxBookFraction);
    const maxDisplayedVerses = Number(providerPolicy && providerPolicy.maxTotalCachedVerses);
    if (!(maxBookFraction > 0 && maxBookFraction <= 1)) {
      throw domainError("INVALID_SERVER_CONFIG", "The Scripture display policy is invalid.");
    }
    if (!Number.isInteger(maxDisplayedVerses) || maxDisplayedVerses < 1) {
      throw domainError("INVALID_SERVER_CONFIG", "The Scripture total display limit is invalid.");
    }

    const segments = [];
    passages.forEach(function (passage) {
      const metrics = bookMetrics && bookMetrics[passage && passage.bookId];
      const startVerse = Number.isInteger(passage && passage.verseStart) ? passage.verseStart : 1;
      const endVerse = Number.isInteger(passage && passage.verseEnd)
        ? passage.verseEnd
        : Number(passage && passage.verseCount);
      if (!passage || !Number.isInteger(passage.verseCount) || passage.verseCount < 1 ||
          !metrics || !Number.isInteger(metrics.verseCount) || metrics.verseCount < 1 ||
          !Number.isInteger(startVerse) || !Number.isInteger(endVerse) || endVerse < startVerse ||
          endVerse - startVerse + 1 !== passage.verseCount) {
        throw domainError("PROVIDER_METRICS_MISSING", "Provider metrics are unavailable for this passage.");
      }
      const perBookLimit = Math.floor(metrics.verseCount * maxBookFraction);
      const segmentLimit = Math.min(maxDisplayedVerses, perBookLimit);
      if (segmentLimit < 1) {
        throw domainError("PROVIDER_DISPLAY_LIMIT", "This passage cannot be displayed within the provider policy.");
      }
      const segmentCount = Math.ceil(passage.verseCount / segmentLimit);
      if (segmentCount === 1) {
        segments.push({...passage});
        return;
      }
      const baseLength = Math.floor(passage.verseCount / segmentCount);
      const remainder = passage.verseCount % segmentCount;
      let cursor = startVerse;
      for (let index = 0; index < segmentCount; index += 1) {
        const verseCount = baseLength + (index < remainder ? 1 : 0);
        const verseEnd = cursor + verseCount - 1;
        segments.push({
          ...passage,
          verseStart: cursor,
          verseEnd,
          verseCount
        });
        cursor = verseEnd + 1;
      }
    });
    return segments;
  }

  function selectScripturePassages(request, entry, bookMetrics, providerPolicy) {
    if (!entry || entry.kind !== "chapter" || scriptureReadingId(request) !== entry.readingId) {
      throw domainError("INVALID_READING", "Scripture request does not match the selected reading.");
    }
    const passages = Array.isArray(entry.passages) ? entry.passages : [];
    const displaySegments = scriptureDisplaySegments(entry, bookMetrics, providerPolicy);
    const maxBookFraction = Number(providerPolicy && providerPolicy.maxBookFraction);
    const maxDisplayedVerses = Number(providerPolicy && providerPolicy.maxTotalCachedVerses);
    const totalsByBook = {};
    passages.forEach(function (passage) {
      const metrics = bookMetrics && bookMetrics[passage && passage.bookId];
      if (!passage || !Number.isInteger(passage.verseCount) || passage.verseCount < 1 ||
          !metrics || !Number.isInteger(metrics.verseCount) || metrics.verseCount < 1) {
        throw domainError("PROVIDER_METRICS_MISSING", "Provider metrics are unavailable for this passage.");
      }
      totalsByBook[passage.bookId] = (totalsByBook[passage.bookId] || 0) + passage.verseCount;
    });
    const fullReadingExceedsDisplayLimit = passages.reduce(function (total, passage) {
      return total + passage.verseCount;
    }, 0) > maxDisplayedVerses || Object.keys(totalsByBook).some(function (bookId) {
      return totalsByBook[bookId] > Math.floor(bookMetrics[bookId].verseCount * maxBookFraction);
    }) || displaySegments.length !== passages.length;
    let passageIndex = null;
    if (typeof request === "object" && request !== null && !Array.isArray(request)) {
      if (Object.keys(request).some(function (key) { return !["readingId", "passageIndex"].includes(key); }) ||
          !Number.isInteger(request.passageIndex) || request.passageIndex < 0 || request.passageIndex >= displaySegments.length) {
        throw domainError("INVALID_READING", "Scripture passage selection is invalid.");
      }
      passageIndex = request.passageIndex;
    } else if (fullReadingExceedsDisplayLimit) {
      passageIndex = 0;
    }
    const selectedPassages = passageIndex === null ? passages.slice() : [displaySegments[passageIndex]];
    if (selectedPassages.reduce(function (total, passage) { return total + passage.verseCount; }, 0) > maxDisplayedVerses) {
      throw domainError("PROVIDER_DISPLAY_LIMIT", "This passage exceeds the ESV total display limit.");
    }
    selectedPassages.forEach(function (passage) {
      const perBookLimit = Math.floor(bookMetrics[passage.bookId].verseCount * maxBookFraction);
      if (passage.verseCount > perBookLimit) {
        throw domainError("PROVIDER_DISPLAY_LIMIT", "This passage exceeds the ESV per-book display limit.");
      }
    });
    return {
      passages: selectedPassages,
      passageIndex,
      passageCount: fullReadingExceedsDisplayLimit ? displaySegments.length : passages.length,
      passageOptions: fullReadingExceedsDisplayLimit ? displaySegments : [],
      partitioned: fullReadingExceedsDisplayLimit
    };
  }

  function validatePlanStructure(plan) {
    if (!plan || !plan.planVersion || !Array.isArray(plan.entries) || !plan.entries.length) {
      throw domainError("INVALID_PLAN", "Reading plan is unavailable.");
    }
    const seenReadingIds = new Set();
    plan.entries.forEach((entry, index) => {
      if (!entry || entry.planVersion !== plan.planVersion || entry.dayIndex !== index + 1 ||
          !READING_ID.test(String(entry.readingId || "")) || seenReadingIds.has(entry.readingId)) {
        throw domainError("INVALID_PLAN", "Reading plan order or identifiers are invalid.");
      }
      const earlierIds = new Set(plan.entries.slice(0, index).map((candidate) => candidate && candidate.readingId));
      const contextReadingIds = Array.isArray(entry.contextReadingIds) ? entry.contextReadingIds : [];
      if (contextReadingIds.some((readingId) => !earlierIds.has(readingId))) {
        throw domainError("INVALID_PLAN", "Context readings must refer only to earlier plan entries.");
      }
      (Array.isArray(entry.passages) ? entry.passages : []).forEach((passage) => {
        const hasStart = Number.isInteger(passage && passage.verseStart);
        const hasEnd = Number.isInteger(passage && passage.verseEnd);
        if (hasStart !== hasEnd || (hasStart && (
          passage.verseEnd < passage.verseStart ||
          passage.verseEnd - passage.verseStart + 1 !== passage.verseCount
        ))) {
          throw domainError("INVALID_PLAN", "A partial passage range does not match its verse count.");
        }
      });
      seenReadingIds.add(entry.readingId);
    });

    if (!plan.structure) return plan;
    const expectedStreams = ["old_testament", "new_testament", "psalms", "proverbs"];
    const configuredStreams = Array.isArray(plan.structure.streams)
      ? plan.structure.streams.map((stream) => stream && stream.streamId)
      : [];
    if (configuredStreams.length !== expectedStreams.length ||
        new Set(configuredStreams).size !== expectedStreams.length ||
        expectedStreams.some((streamId) => !configuredStreams.includes(streamId))) {
      throw domainError("INVALID_PLAN", "The long-term plan must configure each of the four reading streams exactly once.");
    }
    const nextSequence = new Map(expectedStreams.map((streamId) => [streamId, 1]));
    plan.entries.forEach((entry, index) => {
      if (!nextSequence.has(entry.streamId) || entry.streamSequence !== nextSequence.get(entry.streamId)) {
        throw domainError("INVALID_PLAN", "Reading stream sequences must be contiguous in scheduled order.");
      }
      nextSequence.set(entry.streamId, entry.streamSequence + 1);
      const next = plan.entries[index + 1];
      if (entry.kind === "book_intro" && (!next || next.kind !== "chapter" || next.bookId !== entry.bookId ||
          next.chapter !== 1 || next.streamId !== entry.streamId)) {
        throw domainError("INVALID_PLAN", "Every book introduction must be followed immediately by chapter 1.");
      }
      if (entry.kind === "chapter" && entry.chapter === 1) {
        const previous = plan.entries[index - 1];
        if (!previous || previous.kind !== "book_intro" || previous.bookId !== entry.bookId ||
            previous.streamId !== entry.streamId) {
          throw domainError("INVALID_PLAN", "Chapter 1 of every book must follow its book introduction.");
        }
      }
    });
    return plan;
  }

  function validateVerseOfTheDay(selection, entry) {
    if (!entry || entry.kind !== "chapter") {
      if (selection === undefined || selection === null) return null;
      throw domainError("CONTENT_INVALID", "A book-introduction day cannot select unfetched Scripture text.");
    }
    if (!selection || typeof selection !== "object" || Array.isArray(selection) ||
        Object.keys(selection).some(function (key) { return !["bookId", "chapter", "verse"].includes(key); }) ||
        !/^[A-Z0-9]{2,5}$/.test(String(selection.bookId || "")) ||
        !Number.isInteger(selection.chapter) || selection.chapter < 1 ||
        !Number.isInteger(selection.verse) || selection.verse < 1) {
      throw domainError("CONTENT_INVALID", "Verse-of-the-day metadata is invalid.");
    }
    const passage = (Array.isArray(entry.passages) ? entry.passages : []).find(function (candidate) {
      return candidate && candidate.bookId === selection.bookId && candidate.chapter === selection.chapter;
    });
    if (!passageContainsVerse(passage, selection.verse)) {
      throw domainError("CONTENT_INVALID", "Verse of the day must belong to the configured reading.");
    }
    return {
      bookId: String(selection.bookId),
      chapter: selection.chapter,
      verse: selection.verse
    };
  }

  function passageContainsVerse(passage, verse) {
    if (!passage || !Number.isInteger(passage.verseCount) || passage.verseCount < 1 ||
        !Number.isInteger(verse) || verse < 1) return false;
    const hasRange = Number.isInteger(passage.verseStart) || Number.isInteger(passage.verseEnd);
    if (!hasRange) return verse <= passage.verseCount;
    return Number.isInteger(passage.verseStart) && Number.isInteger(passage.verseEnd) &&
      passage.verseStart >= 1 && passage.verseEnd >= passage.verseStart &&
      passage.verseCount === passage.verseEnd - passage.verseStart + 1 &&
      verse >= passage.verseStart && verse <= passage.verseEnd;
  }

  function normalizeCommentBody(value, allowEmpty) {
    const body = String(value === undefined || value === null ? "" : value)
      .replace(/\r\n?/g, "\n")
      .trim();
    if (!allowEmpty && !body) throw domainError("COMMENT_EMPTY", "Comment body is required.");
    if (body.length > MAX_COMMENT_LENGTH) {
      throw domainError("COMMENT_TOO_LARGE", `Comment body may not exceed ${MAX_COMMENT_LENGTH} characters.`);
    }
    if (/\u0000|[\u0001-\u0008\u000B\u000C\u000E-\u001F]/.test(body)) {
      throw domainError("COMMENT_INVALID", "Comment body contains unsupported control characters.");
    }
    return body;
  }

  function validateCommentRequest(payload, plan) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw domainError("INVALID_COMMENT_REQUEST", "Comment request must be an object.");
    }
    const eventType = String(payload.eventType || "");
    if (!["create", "edit", "delete"].includes(eventType)) {
      throw domainError("INVALID_COMMENT_EVENT", "Comment event type is invalid.");
    }
    const readingId = String(payload.readingId || "");
    if (!READING_ID.test(readingId)) throw domainError("INVALID_READING", "Reading ID is invalid.");
    const entry = getPlanEntry(plan, readingId);
    const planVersion = String(payload.planVersion || "");
    if (!planVersion || planVersion !== entry.planVersion || planVersion !== plan.planVersion) {
      throw domainError("PLAN_VERSION_MISMATCH", "Comment plan version does not match the active plan.");
    }
    const clientRequestId = String(payload.clientRequestId || "");
    if (!REQUEST_ID.test(clientRequestId)) {
      throw domainError("INVALID_REQUEST_ID", "Client request ID is invalid.");
    }
    const baseRevision = Number(payload.baseRevision);
    if (!Number.isInteger(baseRevision) || baseRevision < 0) {
      throw domainError("INVALID_REVISION", "Base revision is invalid.");
    }
    if (eventType === "create" && baseRevision !== 0) {
      throw domainError("INVALID_REVISION", "Create events must start at revision zero.");
    }
    const commentId = payload.commentId ? String(payload.commentId) : "";
    if (eventType !== "create" && !REQUEST_ID.test(commentId)) {
      throw domainError("INVALID_COMMENT_ID", "Existing comment ID is required.");
    }
    return {
      eventType,
      readingId,
      planVersion,
      clientRequestId,
      commentId,
      baseRevision,
      body: normalizeCommentBody(payload.body, eventType === "delete")
    };
  }

  function sortEvents(events) {
    return (Array.isArray(events) ? events : []).slice().sort((left, right) => {
      if (left.commentId === right.commentId && left.revision !== right.revision) {
        return left.revision - right.revision;
      }
      return String(left.updatedAt || "").localeCompare(String(right.updatedAt || ""));
    });
  }

  function latestEventFor(events, commentId) {
    const matching = sortEvents(events).filter((event) => event.commentId === commentId);
    return matching.length ? matching[matching.length - 1] : null;
  }

  function materializeCommentEvents(events, options) {
    const latest = new Map();
    sortEvents(events).forEach((event) => latest.set(event.commentId, event));
    const includeDeleted = Boolean(options && options.includeDeleted);
    return Array.from(latest.values())
      .filter((event) => includeDeleted || !event.deletedAt)
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
  }

  function completedReadingIds(events, input) {
    const authorId = String(input && input.authorId || "");
    const planVersion = String(input && input.planVersion || "");
    const readingIds = Array.isArray(input && input.readingIds) ? input.readingIds.map(String) : [];
    if (!authorId || !planVersion || readingIds.length > 42 || new Set(readingIds).size !== readingIds.length ||
        readingIds.some((readingId) => !READING_ID.test(readingId))) {
      throw domainError("INVALID_COMMENT_ACTIVITY", "Comment activity request is invalid.");
    }
    const requested = new Set(readingIds);
    const completed = new Set(
      materializeCommentEvents(events)
        .filter((comment) => comment.planVersion === planVersion && comment.authorId === authorId && requested.has(comment.readingId))
        .map((comment) => comment.readingId)
    );
    return readingIds.filter((readingId) => completed.has(readingId));
  }

  function participantCommentActivity(events, input) {
    const planVersion = String(input && input.planVersion || "");
    const readingIds = Array.isArray(input && input.readingIds) ? input.readingIds.map(String) : [];
    const participants = Array.isArray(input && input.participants) ? input.participants.map((participant) => ({
      authorId: String(participant && participant.authorId || ""),
      displayName: String(participant && participant.displayName || "")
    })) : [];
    if (!planVersion || readingIds.length > 42 || new Set(readingIds).size !== readingIds.length ||
        readingIds.some((readingId) => !READING_ID.test(readingId)) || participants.length !== 2 ||
        new Set(participants.map((participant) => participant.authorId)).size !== participants.length ||
        participants.some((participant) => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(participant.authorId) ||
          !participant.displayName || participant.displayName.length > 80)) {
      throw domainError("INVALID_COMMENT_ACTIVITY", "Comment activity request is invalid.");
    }
    const requested = new Set(readingIds);
    const allowedAuthors = new Set(participants.map((participant) => participant.authorId));
    const completedByReadingId = Object.fromEntries(readingIds.map((readingId) => [readingId, []]));
    materializeCommentEvents(events)
      .filter((comment) => comment.planVersion === planVersion && requested.has(comment.readingId) && allowedAuthors.has(comment.authorId))
      .forEach((comment) => {
        const authors = completedByReadingId[comment.readingId];
        if (!authors.includes(comment.authorId)) authors.push(comment.authorId);
      });
    readingIds.forEach((readingId) => {
      completedByReadingId[readingId] = participants
        .map((participant) => participant.authorId)
        .filter((authorId) => completedByReadingId[readingId].includes(authorId));
    });
    return {participants, completedByReadingId};
  }

  function applyCommentEvent(input) {
    const payload = validateCommentRequest(input && input.payload, input && input.plan);
    const identity = input && input.identity;
    const existingEvents = Array.isArray(input && input.existingEvents) ? input.existingEvents : [];
    if (!identity || !identity.authorId || !identity.displayName) {
      throw domainError("AUTH_REQUIRED", "Server-authorized identity is required.");
    }
    const existingRequest = existingEvents.find((event) =>
      event.clientRequestId === payload.clientRequestId && event.authorId === identity.authorId
    );
    if (existingRequest) return {event: existingRequest, idempotent: true};

    const now = typeof input.now === "string" ? input.now : new Date(input.now || Date.now()).toISOString();
    const idFactory = typeof input.idFactory === "function"
      ? input.idFactory
      : () => `server-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;

    if (payload.eventType === "create") {
      const commentId = String(idFactory("comment"));
      const event = {
        eventId: String(idFactory("event")),
        commentId,
        clientRequestId: payload.clientRequestId,
        planVersion: payload.planVersion,
        readingId: payload.readingId,
        eventType: "create",
        authorId: String(identity.authorId),
        displayName: String(identity.displayName),
        body: payload.body,
        baseRevision: 0,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      };
      return {event, idempotent: false};
    }

    const current = latestEventFor(existingEvents, payload.commentId);
    if (!current || current.deletedAt) {
      throw domainError("COMMENT_NOT_FOUND", "Comment is unavailable or already deleted.");
    }
    if (current.authorId !== identity.authorId) {
      throw domainError("COMMENT_FORBIDDEN", "Only the comment author may change this comment.");
    }
    if (current.readingId !== payload.readingId || current.planVersion !== payload.planVersion) {
      throw domainError("COMMENT_ASSOCIATION_MISMATCH", "Comment is attached to a different reading.");
    }
    if (current.revision !== payload.baseRevision) {
      throw domainError("REVISION_CONFLICT", "Comment changed on another client. Refresh before editing.");
    }

    const deleting = payload.eventType === "delete";
    const event = {
      eventId: String(idFactory("event")),
      commentId: current.commentId,
      clientRequestId: payload.clientRequestId,
      planVersion: current.planVersion,
      readingId: current.readingId,
      eventType: payload.eventType,
      authorId: current.authorId,
      displayName: current.displayName,
      body: deleting ? "" : payload.body,
      baseRevision: current.revision,
      revision: current.revision + 1,
      createdAt: current.createdAt,
      updatedAt: now,
      deletedAt: deleting ? now : null
    };
    return {event, idempotent: false};
  }

  function validateHighlightRequest(payload, plan) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw domainError("INVALID_HIGHLIGHT_REQUEST", "Highlight request must be an object.");
    }
    const eventType = String(payload.eventType || "");
    if (!["create", "delete"].includes(eventType)) {
      throw domainError("INVALID_HIGHLIGHT_EVENT", "Highlight event type is invalid.");
    }
    const readingId = String(payload.readingId || "");
    if (!READING_ID.test(readingId)) throw domainError("INVALID_READING", "Reading ID is invalid.");
    const entry = getPlanEntry(plan, readingId);
    if (entry.kind !== "chapter") throw domainError("INVALID_HIGHLIGHT_REFERENCE", "Only Scripture verses can be highlighted.");
    const planVersion = String(payload.planVersion || "");
    if (!planVersion || planVersion !== entry.planVersion || planVersion !== plan.planVersion) {
      throw domainError("PLAN_VERSION_MISMATCH", "Highlight plan version does not match the active plan.");
    }
    const clientRequestId = String(payload.clientRequestId || "");
    if (!REQUEST_ID.test(clientRequestId)) throw domainError("INVALID_REQUEST_ID", "Client request ID is invalid.");
    const bookId = String(payload.bookId || "");
    const chapter = Number(payload.chapter);
    const verse = Number(payload.verse);
    const passage = (Array.isArray(entry.passages) ? entry.passages : []).find((candidate) =>
      candidate && candidate.bookId === bookId && candidate.chapter === chapter
    );
    if (!/^[A-Z0-9]{2,8}$/.test(bookId) || !Number.isInteger(chapter) || chapter < 1 ||
        !Number.isInteger(verse) || !passageContainsVerse(passage, verse)) {
      throw domainError("INVALID_HIGHLIGHT_REFERENCE", "Highlighted verse is not part of this reading.");
    }
    const baseRevision = Number(payload.baseRevision);
    if (!Number.isInteger(baseRevision) || baseRevision < 0 || (eventType === "create" && baseRevision !== 0)) {
      throw domainError("INVALID_REVISION", "Highlight revision is invalid.");
    }
    const highlightId = payload.highlightId ? String(payload.highlightId) : "";
    if (eventType === "delete" && !REQUEST_ID.test(highlightId)) {
      throw domainError("INVALID_HIGHLIGHT_ID", "Existing highlight ID is required.");
    }
    return {eventType, readingId, planVersion, clientRequestId, highlightId, bookId, chapter, verse, baseRevision};
  }

  function sortHighlightEvents(events) {
    return (Array.isArray(events) ? events : []).slice().sort((left, right) => {
      if (left.highlightId === right.highlightId && left.revision !== right.revision) {
        return left.revision - right.revision;
      }
      return String(left.updatedAt || "").localeCompare(String(right.updatedAt || ""));
    });
  }

  function latestHighlightEventFor(events, highlightId) {
    const matching = sortHighlightEvents(events).filter((event) => event.highlightId === highlightId);
    return matching.length ? matching[matching.length - 1] : null;
  }

  function materializeHighlightEvents(events, options) {
    const latest = new Map();
    sortHighlightEvents(events).forEach((event) => latest.set(event.highlightId, event));
    const includeDeleted = Boolean(options && options.includeDeleted);
    return Array.from(latest.values())
      .filter((event) => includeDeleted || !event.deletedAt)
      .sort((left, right) => {
        const reference = String(left.bookId).localeCompare(String(right.bookId)) ||
          left.chapter - right.chapter || left.verse - right.verse;
        return reference || String(left.createdAt).localeCompare(String(right.createdAt));
      });
  }

  function applyHighlightEvent(input) {
    const payload = validateHighlightRequest(input && input.payload, input && input.plan);
    const identity = input && input.identity;
    const existingEvents = Array.isArray(input && input.existingEvents) ? input.existingEvents : [];
    if (!identity || !identity.authorId || !identity.displayName) {
      throw domainError("AUTH_REQUIRED", "Server-authorized identity is required.");
    }
    const existingRequest = existingEvents.find((event) =>
      event.clientRequestId === payload.clientRequestId && event.authorId === identity.authorId
    );
    if (existingRequest) return {event: existingRequest, idempotent: true};

    const now = typeof input.now === "string" ? input.now : new Date(input.now || Date.now()).toISOString();
    const idFactory = typeof input.idFactory === "function"
      ? input.idFactory
      : () => `server-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;

    if (payload.eventType === "create") {
      const alreadyActive = materializeHighlightEvents(existingEvents).find((event) =>
        event.planVersion === payload.planVersion && event.readingId === payload.readingId &&
        event.bookId === payload.bookId && event.chapter === payload.chapter && event.verse === payload.verse &&
        event.authorId === identity.authorId
      );
      if (alreadyActive) return {event: alreadyActive, idempotent: true};
      const event = {
        eventId: String(idFactory("highlight-event")),
        highlightId: String(idFactory("highlight")),
        clientRequestId: payload.clientRequestId,
        planVersion: payload.planVersion,
        readingId: payload.readingId,
        eventType: "create",
        bookId: payload.bookId,
        chapter: payload.chapter,
        verse: payload.verse,
        authorId: String(identity.authorId),
        displayName: String(identity.displayName),
        baseRevision: 0,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      };
      return {event, idempotent: false};
    }

    const current = latestHighlightEventFor(existingEvents, payload.highlightId);
    if (!current || current.deletedAt) throw domainError("HIGHLIGHT_NOT_FOUND", "Highlight is unavailable or already removed.");
    if (current.authorId !== identity.authorId) throw domainError("HIGHLIGHT_FORBIDDEN", "Only the author may remove this highlight.");
    if (current.planVersion !== payload.planVersion || current.readingId !== payload.readingId ||
        current.bookId !== payload.bookId || current.chapter !== payload.chapter || current.verse !== payload.verse) {
      throw domainError("HIGHLIGHT_ASSOCIATION_MISMATCH", "Highlight belongs to a different verse or reading.");
    }
    if (current.revision !== payload.baseRevision) {
      throw domainError("REVISION_CONFLICT", "Highlight changed on another client. Refresh before retrying.");
    }
    const event = {
      ...current,
      eventId: String(idFactory("highlight-event")),
      clientRequestId: payload.clientRequestId,
      eventType: "delete",
      baseRevision: current.revision,
      revision: current.revision + 1,
      updatedAt: now,
      deletedAt: now
    };
    return {event, idempotent: false};
  }

  function countParsedVerses(parsedRanges) {
    if (!Array.isArray(parsedRanges) || !parsedRanges.length) {
      throw domainError("INVALID_ESV_RESPONSE", "ESV response did not include a parsed range.");
    }
    return parsedRanges.reduce((total, range) => {
      if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isInteger)) {
        throw domainError("INVALID_ESV_RESPONSE", "ESV response range is invalid.");
      }
      const startChapterKey = Math.floor(range[0] / 1000);
      const endChapterKey = Math.floor(range[1] / 1000);
      if (startChapterKey !== endChapterKey) {
        throw domainError("INVALID_ESV_RESPONSE", "The pilot adapter expects one complete chapter per range.");
      }
      const startVerse = range[0] % 1000;
      const endVerse = range[1] % 1000;
      if (startVerse < 1 || endVerse < startVerse) {
        throw domainError("INVALID_ESV_RESPONSE", "ESV response verse numbers are invalid.");
      }
      return total + endVerse - startVerse + 1;
    }, 0);
  }

  function validateEsvPayload(payload, expected) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.passages) || payload.passages.length !== 1) {
      throw domainError("INVALID_ESV_RESPONSE", "ESV response did not contain one passage.");
    }
    const passage = String(payload.passages[0] || "");
    if (!passage || passage.length > 250000) {
      throw domainError("INVALID_ESV_RESPONSE", "ESV passage response size is invalid.");
    }
    const verseCount = countParsedVerses(payload.parsed);
    if (expected && expected.verseCount && verseCount !== expected.verseCount) {
      throw domainError("ESV_RANGE_MISMATCH", "ESV response did not match the configured chapter range.");
    }
    if (expected && Number.isInteger(expected.startVerse) && Number.isInteger(expected.endVerse)) {
      const parsedRange = payload.parsed.length === 1 ? payload.parsed[0] : null;
      if (!parsedRange || parsedRange[0] % 1000 !== expected.startVerse || parsedRange[1] % 1000 !== expected.endVerse) {
        throw domainError("ESV_RANGE_MISMATCH", "ESV response did not match the requested verse boundaries.");
      }
    }
    return {
      canonical: String(payload.canonical || ""),
      passage,
      verseCount
    };
  }

  return {
    MAX_COMMENT_LENGTH,
    allowedManifestFileIds,
    applyCommentEvent,
    applyHighlightEvent,
    assertAllowedFileId,
    authorizeIdentity,
    authorizeTokenIdentity,
    completedReadingIds,
    constantTimeEqual,
    countParsedVerses,
    domainError,
    getPlanEntry,
    materializeHighlightEvents,
    materializeCommentEvents,
    manifestPreparedReadingIds,
    normalizeCommentBody,
    normalizeEmail,
    parseManifest,
    passageContainsVerse,
    participantCommentActivity,
    publicParticipants,
    resolveReadingFiles,
    scriptureReadingId,
    scriptureDisplaySegments,
    selectScripturePassages,
    validateCommentRequest,
    validateEsvPayload,
    validateHighlightRequest,
    validatePlanStructure,
    validateVerseOfTheDay
  };
});
