export const HISTORICAL_CONTEXT_PREVIEW_HEADING = "Archaeological and historical context";
export const HISTORICAL_CONTEXT_EXPANDED_HEADING = "Archaeological and historical context — expanded study";

const INLINE_CITATION = /\{\{cite:([A-Za-z0-9_.:-]+(?:\s*,\s*[A-Za-z0-9_.:-]+)*)\}\}/g;

function wordCount(text) {
  return String(text || "").replace(INLINE_CITATION, "").trim().split(/\s+/).filter(Boolean).length;
}

function normalizedProse(text) {
  return String(text || "").replace(INLINE_CITATION, "")
    .replace(/^#{1,6}\s+/gm, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function protocolDescriptorIsValid(protocol) {
  return Boolean(protocol && protocol.schemaVersion === "daily-study-protocol/v1" &&
    typeof protocol.protocolVersion === "string" && protocol.protocolVersion &&
    Array.isArray(protocol.requiredGenerationFields) && protocol.requiredGenerationFields.length === 1 &&
    protocol.requiredGenerationFields[0] === "contentProtocolVersion" &&
    Array.isArray(protocol.requiredComponentAssessments) && protocol.requiredComponentAssessments.length === 1 &&
    protocol.requiredComponentAssessments[0] === "historicalContext" &&
    protocol.historicalContext && Array.isArray(protocol.historicalContext.includedRequires) &&
    protocol.historicalContext.includedRequires[0] === HISTORICAL_CONTEXT_PREVIEW_HEADING &&
    protocol.historicalContext.includedRequires[1] === HISTORICAL_CONTEXT_EXPANDED_HEADING &&
    Array.isArray(protocol.historicalContext.notMaterialRequires) &&
    protocol.historicalContext.notMaterialRequires[0] === "rationale" &&
    protocol.historicalContext.notMaterialRequires[1] === "no_context_layers");
}

export function levelThreeSections(markdown) {
  const text = String(markdown || "");
  const headings = [...text.matchAll(/^###\s+(.+)$/gm)];
  return headings.map((match, index) => ({
    title: match[1].trim(),
    body: text.slice(match.index + match[0].length, headings[index + 1]?.index ?? text.length).trim()
  }));
}

function expandedContextIsDistinctAndSubstantive(preview, expanded) {
  const previewWords = wordCount(preview.body);
  const expandedWords = wordCount(expanded.body);
  const topicalHeadings = [...expanded.body.matchAll(/^####\s+(.+)$/gm)].map((match) => match[1].trim());
  return normalizedProse(preview.body) !== normalizedProse(expanded.body) &&
    expandedWords >= Math.max(previewWords * 2, previewWords + 120) &&
    topicalHeadings.length >= 2 && new Set(topicalHeadings).size === topicalHeadings.length &&
    /\{\{cite:[A-Za-z0-9_.:-]+(?:\s*,\s*[A-Za-z0-9_.:-]+)*\}\}/.test(expanded.body);
}

export function evaluateContentProtocolFreshness({metadata, markdownBytes, protocol}) {
  if (!protocolDescriptorIsValid(protocol)) return {current: false, reasonCode: "protocol_descriptor_invalid"};
  const generation = metadata && metadata.generation;
  if (!generation || generation.contentProtocolVersion !== protocol.protocolVersion) {
    return {current: false, reasonCode: "content_protocol_version_missing_or_stale"};
  }
  const assessment = metadata && metadata.componentAssessments && metadata.componentAssessments.historicalContext;
  if (!assessment || typeof assessment !== "object") {
    return {current: false, reasonCode: "historical_context_assessment_missing"};
  }
  const markdown = markdownBytes === null || markdownBytes === undefined ? "" : Buffer.from(markdownBytes).toString("utf8");
  const sections = levelThreeSections(markdown);
  const previews = sections.filter((section) => section.title === HISTORICAL_CONTEXT_PREVIEW_HEADING);
  const expanded = sections.filter((section) => section.title === HISTORICAL_CONTEXT_EXPANDED_HEADING);
  if (previews.length > 1 || expanded.length > 1) {
    return {current: false, reasonCode: "historical_context_headings_ambiguous"};
  }
  if (assessment.status === "included") {
    if (previews.length !== 1 || expanded.length !== 1 ||
        !expandedContextIsDistinctAndSubstantive(previews[0], expanded[0])) {
      return {current: false, reasonCode: "historical_context_included_invalid"};
    }
    return {current: true, reasonCode: "current_protocol"};
  }
  if (assessment.status === "not_material") {
    if (typeof assessment.rationale !== "string" || assessment.rationale.trim().length < 12 || previews.length || expanded.length) {
      return {current: false, reasonCode: "historical_context_not_material_invalid"};
    }
    return {current: true, reasonCode: "current_protocol"};
  }
  return {current: false, reasonCode: "historical_context_assessment_invalid"};
}
