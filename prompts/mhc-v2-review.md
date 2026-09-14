# Henry v2 independent source review and publication

Use the exact work order from the installed launcher. Do not select another
reading, reset attempts, or treat generation as approval. Authoring and review
remain separate tasks. Read the complete supplied bundle, every source atom, every
sentence/evidence association, and every review concern. Check identities,
relationships, agency, negation, causation, qualifications, uncertainty, shared
range scope, readability, direct contemporary prose, and absence of copied source
wording. Vocabulary checks cannot substitute for this comparison.
Check that each record conveys the source's specific interpretation of the verse's
central identity, image, or relationship. A generic but supportable exhortation is
not a sufficient condensation when that explanation is missing. Uncited material
in the full packet must be considered for these omissions; a required citation
change belongs in the bounded packet repair, not a prose-only approval correction.

If a material source problem is found after approval, stop publication and hold
the publisher before reopening. Use the installed launcher with reviewer reopen,
--reading, --approved-sha256 (the exact current approval), --reviewer (your actual
identity), and --reason (your specific source finding). This creates a fresh
review basis while preserving all candidates, budgets, old approvals and live
versions. Read the new work order, including previous_approvals, and conduct the
complete review again; earlier prose corrections do not silently carry forward.
Use the existing bounded packet repair when citations must change. Never reopen
merely to retry generation, clear a permission block, or skip publication checks.

For action=review, write the supplied reviewPath with schema_version
mhc-evidence-approval/v2, exact reading_id and review_basis_sha256 from the bundle,
status=approved, actual reviewer and reviewed_at, specific findings, corrections,
and all required_assertions as true only after direct comparison. The assertions
object must contain exactly the supplied keys. Corrections are records with
verse_id, blurb, and reason; citations remain unchanged. If a correction would
require changing citations or unsupported substance, do not approve it. Report the
exact source/evidence issue for controlled editorial repair: write reviewPath with
schema_version=mhc-evidence-review-decision/v2, exact reading_id and
review_basis_sha256, status=changes_requested, the implicated packet_id from
source_packets, actual reviewer/reviewed_at, and specific findings. Run the returned
requestRepairCommand, then obtain the editorial work order. One such correction
per packet is allowed; it changes the approval basis and preserves the original.
Never mark assertions
true based only on deterministic validation.

Run the exact applyCommand only after that review. Its publish_required result
means the reviewed layer is in the checksum-bound library, not live. Follow the
existing authorized one-reading attachment/private bundle/publication workflow:
attach the exact newest approved library artifact, validate the private reading,
publish immutable metadata and manifest last, read both back exactly, and verify
named-reading live readiness and complete Henry. Preserve the prior published
version and broader daily study. Record the genuine manager-publication-result.json
receipt under the existing publication contract. Never manufacture a receipt from
local attachment. Run reviewer work-order again to reconcile completion.

For recover_publish, run applyCommand idempotently to recover transaction/library
work, then perform that same publication workflow. Do not repeat editorial review
or regenerate approved content. A changed source or artifact is a blocker, not an
excuse to rebind the existing approval.

For editorial_attention, source-compare the exact failed candidate and supplied
packet. The separate editorial repair contract permits one recorded reviewer
correction for that exhausted packet. It is not a replenished model attempt. Keep
the underlying author model's provenance and provide concrete findings. If it
cannot be corrected confidently from the exposed source, report the blocker.

Read packetPath and candidatePath (the latter stores the exact rejected JSON as
an inert bytes string). Write repairPath with schema_version
mhc-evidence-editorial-repair/v2, input_sha256 and rejected_sha256 copied from the
packet, status=approved, actual reviewer and reviewed_at, specific findings, and
candidate containing the complete corrected candidate in its original minimal
schema. This correction is limited to the supplied packet. Run repairCommand.
The correction is preserved with reviewer provenance and does not replenish the
author's budget. Remaining packets return to the assigned author; the complete
reading still needs the separate final review and publication above.

Keep source text, prose, private resource IDs, paths and secrets out of public
output. Report the reading ID, stage, actual outcome, and blocker concisely.
