# Distinct historical-context depth

## Goal

Replace the duplicated Page 1 historical-context presentation with a genuine two-level research product: a concise contextual orientation near the top of Page 1 and a separate, substantially fuller archaeological/historical dossier below Discussion and navigation. Apply the new contract to James 1 (`CC-Y3Q4-D072`) and Zechariah 4 (`CC-Y3Q4-D073`), then publish the validated code and private-content revisions.

## Requirements

- Keep the existing upper and lower Page 1 placements.
- The upper panel renders only a concise `### Archaeological and historical context` section.
- The lower panel renders only a distinct `### Archaeological and historical context — expanded study` section.
- The expanded study must provide materially more evidence and explanation, use scan-friendly custom subheadings, distinguish direct evidence from inference, and retain claim-level citations plus a complete nearby bibliography.
- Both sections are removed from the Page 3 comprehensive synthesis.
- A legacy reading with only the concise section may show the upper panel, but must hide the lower panel rather than repeat the same text.
- James 1 and Zechariah 4 receive directly researched, source-grounded expanded studies; their existing orientation, daily synthesis, takeaway, verse selection, Henry layer, and unrelated deep-study sections remain unchanged unless a factual correction is necessary.
- Future validation must reject duplicated context layers and require a substantive expanded layer whenever a prepared reading includes the concise context section.

## Constraints and non-goals

- Keep ESV wording, credentials, private resource IDs, reader codes, comments, and private commentary out of Git and public artifacts.
- Do not change Apps Script authentication, deployment identity, Sheet/Drive sharing, ESV policy, or browser-storage schema.
- Do not turn the historical dossier into routine skeptical criticism. Prefer traceable institutional, archaeological, primary-text, academic-reference, and responsibly used church-affiliated sources; state what evidence establishes and what remains inference.
- Do not generate or revise unrelated daily studies.
- Private content remains in ignored local files and is published to existing restricted Drive files content-first and manifest-last.

## Relevant repository state

- `main` is currently `64f88fc6da67ca8e615720d0277b80b7cc532603`.
- The current frontend extracts every archaeology/history H3 into one `context.markdown` value and renders that identical text in both Page 1 panels.
- D072 and D073 each currently contain one concise historical-context H3 and therefore expose the duplication.
- Current immutable public releases are frontend `0121107ee1111b6e` and PWA `0560c7f327750077`.

## Decisions

- Use a portable paired-heading convention inside the existing comprehensive Markdown rather than adding a second private file or runtime schema field.
- Classify the exact ordinary heading as the preview and the exact `— expanded study` heading as the lower dossier.
- Never synthesize or truncate one layer into the other at runtime; each layer is authored and cited independently.
- Hide a missing expanded layer instead of silently falling back to the preview.
- Enforce distinct normalized prose, meaningful added depth, multiple scan-visible H4 subheadings, and inline citations in the expanded layer for prepared readings.

## Milestones

1. **Rendering and validation contract** — update the partition/render logic, focused frontend tests, private-content validator tests, and durable workflow documentation.
2. **Two-reading research revision** — directly consult and inventory useful sources, write distinct expanded dossiers for D072 and D073, update metadata/source registry/coverage/version/hash, and preserve protected fields.
3. **Validation and release** — run focused tests, private validation/bundle, repository safety, build/Pages publication, and the full check; commit and push the code-only release.
4. **Private publication and verification** — update existing restricted Drive payloads first and manifest last, verify exact-byte readback and unchanged access, then verify live public artifact bytes/MIME and content refresh behavior.

## Acceptance criteria

- The same context prose cannot appear in both panels for a valid prepared reading.
- The upper panel remains concise and useful without opening the lower panel.
- The lower panel is clearly more detailed, independently authored, organized by topical subheadings, and fully auditable through numbered citations and source notes.
- Readings without context show neither panel; legacy summary-only readings show no lower-panel duplicate.
- D072 and D073 pass schema, provenance, citation, rights, hash, and private-bundle validation.
- Public build artifacts contain no private content and pass the release-stability gates.
- The live phone reader can refresh to the new private versions without clearing downloaded data.

## Validation

- Focused frontend partition/render regression tests.
- Focused validator tests for paired headings, non-duplication, added depth, H4 structure, and inline citations.
- `node scripts/validate-private-content.mjs --require`
- `npm run bundle:private`
- `npm run safety`
- `npm run build`
- `npm run publish:pages`
- `npm run check`
- Exact tracked-artifact comparison, live HTTPS byte/MIME verification, and restricted Drive exact-byte/permission readback.

## Progress

- [x] User identified that the two panels currently repeat one synthesis and clarified that the lower panel should expose a genuinely less-summarized research layer.
- [x] Root cause confirmed: both surfaces render the same extracted `context.markdown`.
- [x] Implement the distinct rendering and validation contract. Exact heading classification now yields independent preview/expanded units, hides a missing lower layer, clears stale availability state, and removes both layers from Page 3. The private validator requires distinct prose, material added depth, at least two H4 subheadings, and inline citations. Focused frontend tests passed 51/51; JavaScript syntax and diff checks passed.
- [x] Research and revise D072/D073 private content locally. James 1 now has a 755-word four-part expanded dossier behind its 204-word preview. Zechariah 4 now has a 945-word five-part dossier behind its 216-word preview, adding direct Israel Antiquities Authority and British Museum evidence with explicit limits. Metadata, provenance, versions, hashes, and the 182-record registry pass integrated validation.
- [x] Publish private content content-first and the manifest last. Exact Drive readback matched all six local files byte for byte, preserved each parent, preserved owner-only reading/metadata/registry access, retained the manifest's single reader grant, and found no broad permission.
- [x] Build and validate the code-only release. Repository safety inspected 271 files; 24 schemas, 23 prepared studies, 26 syntheses, 182 sources, 236 tests, and exact Pages artifact verification passed. Prepared releases are frontend `0ddb985f7d7adef0` and PWA `2cdc4cede6ed8fde`; Apps Script is unchanged.
- [x] Commit and push code release `d497f2f`. Pages deployment `32989978197` passed, and all eight live shell/immutable files matched committed bytes with their expected MIME types. The repository CI-equivalent `npm run check` passed locally before publication; the documentation-only closeout commit remains to be pushed.

## Exact next action

Hand the installed-phone review back to Dustin. The expected result is a concise upper context preview and a materially fuller, topically divided lower dossier for James 1 and Zechariah 4 without clearing downloaded data.
