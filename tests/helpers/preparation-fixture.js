// All prose and IDs here are conspicuously fabricated; no Scripture is stored.
function preparationFixture() {
  const entries = Array.from({length: 16}, (_, index) => ({readingId: `FABRICATED-BUFFER-${index + 1}`,
    dayIndex: index + 1, kind: "chapter", bookId: "NAM", chapter: 1,
    passages: [{bookId: "NAM", chapter: 1, verseCount: 1}]}));
  const sourceIds = ["fabricated-one", "fabricated-two"];
  const prose = "Fabricated test-only prose describes an artificial preparation fixture with enough words to exercise the validator without reproducing any Scripture or actual devotional commentary from the private service.";
  const payload = entry => ({commentary: {schemaVersion: "commentary/v3", readingId: entry.readingId,
    publicationStatus: "published", generation: {humanReviewStatus: "approved", contentHash: "a".repeat(64)},
    dailyIntroduction: {markdown: prose, sourceIds}, commentarySummary: {paragraphs: [{markdown: prose, sourceIds}]},
    practicalTakeaway: {markdown: "Consider this fabricated test-only response today.", sourceIds},
    comprehensiveSynthesis: {markdown: Array(5).fill(prose).join(" "), sourceIds},
    verseOfTheDay: {bookId: "NAM", chapter: 1, verse: 1},
    verseCommentary: {schema_version: "mhc-runtime/v1", validation_status: "valid", review_status: "approved",
      source_id: "fabricated-henry", source_version: "fabricated-v1", source_archive_sha256: "b".repeat(64),
      source_manifest_ref: "FABRICATED SOURCE", worker_model: "fabricated-test", prompt_version: "fabricated-v1",
      generation_timestamp: "2026-10-05T19:00:00Z", label: "Fabricated Henry layer",
      book_id: "NAM", chapter: 1, source_layer_note: "Fabricated test-only source layer supports this artificial readiness fixture.",
      source_atoms: {atom: {source_atom_id: "atom", source_unit_id: "unit", source_reference_label: "Fabricated source",
        sequence: 1, atom_type: "commentary", text_sha256: "c".repeat(64), text: "Fabricated source atom supports the test record."}},
      records: {"NAM.1.1": {blurb: "Fabricated verse commentary exercises a complete artificial record.",
        coverage_type: "direct", scope_note: "Fabricated scope.", source_unit_ids: ["unit"], source_atom_ids: ["atom"], source_reference_label: "Fabricated source"}}}
  }, sources: sourceIds.map(sourceId => ({sourceId, title: "Fabricated source", urlOrCitation: "https://example.test/fixture"}))});
  const fallback = entry => {
    const result = payload(entry);
    delete result.commentary.verseCommentary;
    result.commentary.henrySourceLink = {sourceId: sourceIds[0], title: "Fabricated full-commentary link",
      url: "https://example.test/full-commentary", note: "Fabricated fallback for a missing condensed layer."};
    return result;
  };
  return {entries, payload, fallback};
}
module.exports = {preparationFixture};
