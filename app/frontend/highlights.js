(function installSharedVerseHighlights(root) {
  "use strict";

  var api = root.DailyBibleReader;
  if (!api || typeof api.registerHighlightEnhancer !== "function" || !root.document) return;

  var context = null;
  var highlights = [];
  var selectedReference = null;
  var selectedTrigger = null;
  var refreshToken = 0;
  var writeToken = 0;
  var writing = false;
  var statusMessage = "";

  function element(id) {
    return root.document.getElementById(id);
  }

  function referenceKey(reference) {
    return reference ? reference.bookId + ":" + reference.chapter + ":" + reference.verse : "";
  }

  function participantIndex(authorId) {
    var participants = context && context.participants || [];
    return participants.findIndex(function findParticipant(participant) {
      return participant.authorId === authorId;
    });
  }

  function referenceLabel(reference) {
    var passages = context && context.scripture && context.scripture.passages || [];
    var passage = passages.find(function findPassage(candidate) {
      return candidate.bookId === reference.bookId && Number(candidate.chapter) === reference.chapter;
    });
    return passage && passage.canonical
      ? passage.canonical + ":" + reference.verse
      : reference.bookId + " " + reference.chapter + ":" + reference.verse;
  }

  function activeAt(reference) {
    var key = referenceKey(reference);
    return highlights.filter(function matchingHighlight(highlight) {
      return !highlight.deletedAt && referenceKey(highlight) === key;
    });
  }

  function formatTimestamp(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Time unavailable";
    return new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeStyle: "short"}).format(date);
  }

  function closePopover(restoreFocus) {
    var trigger = selectedTrigger;
    selectedReference = null;
    selectedTrigger = null;
    var popover = element("highlightPopover");
    if (popover) popover.hidden = true;
    if (restoreFocus !== false && trigger && root.document.contains(trigger)) {
      trigger.focus({preventScroll: true});
    }
  }

  function commentaryFor(reference) {
    var shard = context && context.verseCommentary;
    if (!shard || !shard.records) return null;
    return shard.records[reference.bookId + "." + reference.chapter + "." + reference.verse] || null;
  }

  function applyHighlightState() {
    root.document.querySelectorAll(".scripture-verse").forEach(function updateVerse(button) {
      var reference = {
        bookId: button.dataset.bookId,
        chapter: Number(button.dataset.chapter),
        verse: Number(button.dataset.verse)
      };
      var active = activeAt(reference);
      [0, 1].forEach(function updateReader(index) {
        var marked = active.some(function byReader(highlight) {
          return participantIndex(highlight.authorId) === index;
        });
        button.setAttribute("data-highlight-reader-" + index, marked ? "true" : "false");
      });
      var names = (context && context.participants || []).filter(function markedParticipant(participant) {
        return active.some(function authored(highlight) { return highlight.authorId === participant.authorId; });
      }).map(function participantName(participant) { return participant.displayName; });
      var verseText = button.lastElementChild ? button.lastElementChild.textContent : "";
      button.setAttribute("aria-label", referenceLabel(reference) + ". " + verseText +
        (commentaryFor(reference)
          ? " Precomputed Matthew Henry summary available."
          : context && context.henrySourceLink
            ? " Full Matthew Henry commentary link available."
            : " Commentary unavailable.") +
        (names.length ? " Highlighted by " + names.join(" and ") + "." : " Not highlighted.") +
        " Open verse details.");
    });
    if (selectedReference && !element("highlightPopover").hidden) renderPopover();
  }

  function verseButton(passage, record) {
    var button = root.document.createElement("button");
    button.type = "button";
    button.className = "scripture-verse";
    button.dataset.bookId = passage.bookId;
    button.dataset.chapter = String(passage.chapter);
    button.dataset.verse = String(record.verse);
    var number = root.document.createElement("span");
    number.className = "scripture-verse-number";
    number.textContent = String(record.verse);
    number.setAttribute("aria-hidden", "true");
    var text = root.document.createElement("span");
    text.textContent = record.text;
    button.append(number, text);
    button.addEventListener("click", function selectVerse() {
      selectedReference = {bookId: passage.bookId, chapter: Number(passage.chapter), verse: record.verse};
      selectedTrigger = button;
      renderPopover();
      element("highlightClose").focus({preventScroll: true});
    });
    return button;
  }

  function verseList(passage, records) {
    var list = root.document.createElement("div");
    list.className = "scripture-verse-list";
    records.forEach(function addVerse(record) { list.appendChild(verseButton(passage, record)); });
    return list;
  }

  function enhanceRenderedScripture() {
    var scripture = context && context.scripture;
    var passages = scripture && Array.isArray(scripture.passages) ? scripture.passages : [];
    var sections = Array.from(root.document.querySelectorAll("#scriptureContent .scripture-passage"));
    var rendered = 0;
    passages.forEach(function enhancePassage(passage, index) {
      var section = sections[index];
      if (!section) return;
      var records = [];
      if (scripture.isMock === true && Array.isArray(passage.verses)) {
        var start = Number.isInteger(passage.verseStart) ? passage.verseStart : 1;
        records = passage.verses.map(function mockRecord(text, verseIndex) {
          return {verse: start + verseIndex, text: String(text)};
        });
        var mockList = section.querySelector(".mock-verses");
        if (mockList && records.length) mockList.replaceWith(verseList(passage, records));
      } else {
        records = api.splitNumberedVerses(passage.passage);
        var pre = section.querySelector("pre");
        if (pre && records.length) pre.replaceWith(verseList(passage, records));
      }
      rendered += records.length;
    });
    var help = element("highlightHelp");
    if (help) help.hidden = rendered === 0;
    applyHighlightState();
  }

  function renderPopover() {
    if (!selectedReference || !context) return closePopover(false);
    var popover = element("highlightPopover");
    var active = activeAt(selectedReference).slice().sort(function byParticipant(left, right) {
      return participantIndex(left.authorId) - participantIndex(right.authorId);
    });
    element("highlightPopoverReference").textContent = referenceLabel(selectedReference);
    renderVerseCommentary();
    var list = element("highlightPopoverList");
    list.replaceChildren();
    if (!active.length) {
      var empty = root.document.createElement("p");
      empty.textContent = "Neither reader has highlighted this verse.";
      list.appendChild(empty);
    } else {
      active.forEach(function addHighlight(highlight) {
        var row = root.document.createElement("div");
        row.className = "highlight-person";
        var swatch = root.document.createElement("span");
        swatch.className = "highlight-person-swatch participant-color-" + Math.max(0, participantIndex(highlight.authorId));
        swatch.setAttribute("aria-hidden", "true");
        var copy = root.document.createElement("div");
        var name = root.document.createElement("strong");
        name.textContent = highlight.displayName;
        var time = root.document.createElement("span");
        time.textContent = highlight.pending ? "Saving…" : "Highlighted " + formatTimestamp(highlight.updatedAt);
        copy.append(name, time);
        row.append(swatch, copy);
        list.appendChild(row);
      });
    }
    var own = active.find(function currentReader(highlight) {
      return context.session && highlight.authorId === context.session.authorId;
    });
    var action = element("highlightAction");
    action.textContent = own ? "Remove my highlight" : "Highlight this verse";
    action.dataset.action = own ? "delete" : "create";
    action.disabled = writing || !context.online;
    element("highlightStatus").textContent = writing
      ? "Saving this change…"
      : statusMessage || (context.online
        ? "Highlights are shared with both readers; each person keeps their own color."
        : "Shared highlights require a confirmed connection.");
    popover.hidden = false;
  }

  function renderVerseCommentary() {
    var record = commentaryFor(selectedReference);
    var shard = context && context.verseCommentary;
    var details = element("verseCommentaryDetails");
    var unavailable = element("verseCommentaryUnavailable");
    var fallback = element("verseCommentaryFallback");
    var fallbackLink = element("verseCommentaryFallbackLink");
    var fallbackNote = element("verseCommentaryFallbackNote");
    var source = element("verseCommentarySource");
    var sourceAtoms = element("verseCommentarySourceAtoms");
    source.open = false;
    sourceAtoms.replaceChildren();
    if (!record) {
      var sourceLink = context && context.henrySourceLink;
      element("verseCommentaryLabel").textContent = "Matthew Henry commentary";
      element("verseCommentaryBlurb").textContent = "";
      element("verseCommentaryReference").textContent = "";
      element("verseCommentaryScope").textContent = "";
      element("verseCommentaryScopeRow").hidden = true;
      element("verseCommentarySourceNote").textContent = "";
      source.hidden = true;
      details.hidden = true;
      if (fallback) fallback.hidden = !sourceLink;
      if (fallbackNote) fallbackNote.textContent = sourceLink ? sourceLink.note : "";
      if (sourceLink && fallbackLink) {
        fallbackLink.href = sourceLink.url;
        fallbackLink.textContent = sourceLink.title;
      }
      unavailable.hidden = Boolean(sourceLink && fallback && fallbackLink);
      return;
    }
    if (fallback) fallback.hidden = true;
    if (fallbackNote) fallbackNote.textContent = "";
    element("verseCommentaryLabel").textContent = shard.label;
    element("verseCommentaryBlurb").textContent = record.blurb;
    element("verseCommentaryReference").textContent = record.source_reference_label;
    element("verseCommentaryScope").textContent = record.scope_note;
    element("verseCommentaryScopeRow").hidden = record.coverage_type !== "no-distinct-comment";
    var atoms = (record.source_atom_ids || []).map(function resolveAtom(atomId) {
      return shard.source_atoms && shard.source_atoms[atomId];
    }).filter(Boolean);
    source.hidden = atoms.length === 0;
    element("verseCommentarySourceNote").textContent = shard.source_layer_note ||
      "Exact public-domain commentary excerpt used for this condensation; embedded Scripture transcription is omitted.";
    atoms.forEach(function appendAtom(atom) {
      var paragraph = root.document.createElement("p");
      paragraph.className = "verse-commentary-source-atom";
      paragraph.textContent = atom.text;
      sourceAtoms.appendChild(paragraph);
    });
    details.hidden = false;
    unavailable.hidden = true;
  }

  async function refreshHighlights() {
    if (!context || !context.online) return;
    var readingId = context.readingId;
    var token = ++refreshToken;
    try {
      var records = await api.listCurrentHighlights(readingId);
      if (!context || context.readingId !== readingId || token !== refreshToken) return;
      highlights = Array.isArray(records) ? records.filter(function active(record) { return record && !record.deletedAt; }) : [];
      applyHighlightState();
    } catch (_) {
      if (selectedReference && !element("highlightPopover").hidden) {
        element("highlightStatus").textContent = "Shared highlights are temporarily unavailable; the reading remains usable.";
      }
    }
  }

  async function toggleHighlight() {
    if (writing || !context || !context.online || !selectedReference) return;
    var operationContext = context;
    var operationReference = {
      bookId: selectedReference.bookId,
      chapter: selectedReference.chapter,
      verse: selectedReference.verse
    };
    var operationToken = ++writeToken;
    ++refreshToken;
    writing = true;
    statusMessage = "";
    var priorHighlights = highlights.slice();
    try {
      var active = activeAt(operationReference);
      var own = active.find(function currentReader(highlight) {
        return context.session && highlight.authorId === context.session.authorId;
      });
      var payload = own ? {
        clientRequestId: api.createRequestId("highlight-delete"),
        eventType: "delete",
        planVersion: own.planVersion,
        readingId: own.readingId,
        highlightId: own.highlightId,
        bookId: own.bookId,
        chapter: own.chapter,
        verse: own.verse,
        baseRevision: own.revision
      } : {
        clientRequestId: api.createRequestId("highlight-create"),
        eventType: "create",
        planVersion: context.planVersion,
        readingId: context.readingId,
        bookId: operationReference.bookId,
        chapter: operationReference.chapter,
        verse: operationReference.verse,
        baseRevision: 0
      };
      var pendingId = "pending:" + payload.clientRequestId;
      highlights = own
        ? highlights.filter(function removeOptimisticHighlight(highlight) {
          return highlight.highlightId !== own.highlightId;
        })
        : highlights.concat({
          highlightId: pendingId,
          clientRequestId: payload.clientRequestId,
          planVersion: payload.planVersion,
          readingId: payload.readingId,
          eventType: "create",
          bookId: payload.bookId,
          chapter: payload.chapter,
          verse: payload.verse,
          authorId: context.session.authorId,
          displayName: context.session.displayName,
          revision: 0,
          createdAt: "",
          updatedAt: "",
          deletedAt: null,
          pending: true
        });
      applyHighlightState();

      var result = await api.submitCurrentHighlightEvent(payload);
      if (operationToken !== writeToken || context !== operationContext) return;
      var serverEvent = result && result.event;
      if (!serverEvent || !serverEvent.highlightId) throw new Error("Highlight write returned no event.");
      highlights = highlights.filter(function replaceOptimisticHighlight(highlight) {
        return highlight.highlightId !== pendingId &&
          highlight.highlightId !== serverEvent.highlightId &&
          (!own || highlight.highlightId !== own.highlightId);
      });
      if (!serverEvent.deletedAt) highlights.push(serverEvent);
    } catch (_) {
      if (operationToken !== writeToken || context !== operationContext) return;
      highlights = priorHighlights;
      statusMessage = "The highlight could not be changed. Check the connection and retry.";
    } finally {
      if (operationToken === writeToken && context === operationContext) {
        writing = false;
        applyHighlightState();
      }
    }
  }

  function render(nextContext) {
    ++writeToken;
    context = nextContext;
    highlights = [];
    selectedReference = null;
    selectedTrigger = null;
    writing = false;
    statusMessage = "";
    closePopover(false);
    var help = element("highlightHelp");
    if (help) help.hidden = true;
    if (!context || !context.scripture) return;
    enhanceRenderedScripture();
    refreshHighlights();
  }

  element("highlightClose").addEventListener("click", function closeFromButton() { closePopover(true); });
  element("highlightAction").addEventListener("click", toggleHighlight);
  root.document.addEventListener("keydown", function closeOnEscape(event) {
    if (event.key === "Escape" && !element("highlightPopover").hidden) closePopover(true);
  });
  api.registerHighlightEnhancer({render: render});
})(typeof globalThis !== "undefined" ? globalThis : this);
