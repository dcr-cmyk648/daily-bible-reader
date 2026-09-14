# Henry reliability review and replacement proposal

Date: 2026-09-13. Reviewed source: `30cfc0b`. Status: diagnosis and proposed design;
no replacement pipeline, generation run, or production change has been made.

## Decision

Replace the authoring contract and consolidate the offline job lifecycle. Retain
the verified source archive, source hashes, private storage boundary, reviewed
runtime format, immutable publication, and exact readback controls.

A stronger generator might reduce candidate errors, but model choice alone cannot
repair failures before generation or after approval. The present evidence does
not establish that Spark is incapable of the actual editorial task. It establishes
that the combined authoring contract and delivery process have not demonstrated
reliable unattended completion. Another prompt exception or larger retry allowance
is insufficient as the durable answer.

The product requirement is straightforward: when a reader taps a verse, show a
faithful, readable condensation of the relevant Henry treatment, with honest range
scope and access to its evidence. The implementation has turned that into several
interdependent generation, normalization, validation, scheduling, and publication
contracts. Correct source interpretation still needs editorial judgment; the
model should not also have to reproduce controller bookkeeping.

## Evidence and limits

Read-only inspection used retained private artifacts and public code/history.
No private prose, exact source wording, credentials, or private resource IDs are
included here. Counts are a September 13 snapshot, not a controlled benchmark.
The historical corpus mixes versions, calibrations, retries, and partial jobs.
Files and events must not be treated as independent model calls or failed studies.

| Observation | What it establishes |
|---|---|
| Legacy job directories retain 207 rejected prose snapshots; fact directories retain 294 rejected fact-brief snapshots. | Repeated generation/validation repair has been substantial. These 501 snapshots are not 501 failed readings. |
| A broad classification of 1,350 retained legacy validation files found 1,807 error occurrences; 879 concern required terms or qualification cues carried as terms. | Vocabulary-contract failures are prominent in the retained diagnostics. Duplicate diagnostics and historical versions prevent a failure-rate estimate. |
| Seven native reading ledgers contain 31 leases, 18 validation events, 10 recorded model-failure events, and 9 missed-primary events. | There are both successful candidates and real operational failures. A missed-primary event does not prove model unavailability; the 10 model-failure labels also need their underlying cause examined. |
| Four of those validation events are Spark; fourteen are Luna. | Both models can produce admitted candidates. Different assignments, versions, and fallback selection make comparison of model success rates invalid. |
| Fourteen of the eighteen retained work items whose latest matching ledger event is validated still contain a failure `validation.json`. | File presence and the last error file are misleading status indicators. The authenticated ledger is authoritative; diagnostics should be explicitly tied to an attempt and superseded by success. |
| D084 and D087 have retained publisher receipts reporting exact metadata/manifest readback and complete Henry layers. | Complete reviewed publication is possible. This inspection read existing receipts; it did not make a fresh live request or prove unattended reliability. |
| Name-matched Henry/MHC files include 23 script/library modules, 26 schemas, and 30 prompt files. | Multiple historical modes and contracts remain. File count is a maintenance indicator, not itself a defect or a count of active runtime components. |

The error grouping is deliberately coarse: messages may match several concepts,
and each was assigned to its first matching category. It identifies an engineering
priority, not how many drafts were substantively wrong. Twenty-four local reading
metadata files contain a Henry attachment, but local attachment alone is not proof
of publication; that count is excluded from operational success claims.

### Today's concrete failure

D090, James 5, needs five four-verse chunks. Two have validated. The third exhausted
three distinct submissions and has no complete-reading review handoff. Its recorded
cooldown ends September 14 at 07:29:34 Eastern. This review did not reset it.

Pure validation of the unchanged third candidate reproduced exactly one error:
an omitted explicit identity. Inspection established that the required identity is:

- present in the verse draft;
- present in the submitted required fact statements and required-term fields;
- absent from the exact snippets selected for those required facts;
- present in evidence exposed to the worker, which it did not select; and
- removed from the protected anchors during deterministic evidence hydration.

This is a real evidence-selection error, compounded by an unhelpful diagnostic.
Adding the word again cannot repair the supporting citation. Nor should the identity
guard simply be disabled. The author needs the missing evidence requirement and its
eligible snippet IDs identified directly.

The failing compact input is about 10 KB; the full internal source view is about
180 KB. There is no evidence that this particular failure is a context-size limit.
Its four-verse assignment crosses Henry's James 5:1–11 and 5:12–20 source treatments.
That boundary is a design consideration, not a proven cause of this error.

A limited feasibility check of all 31 retained native work items found no request
requiring more than three target atoms: the maximum was two, as was the maximum
number of required identities. This sample does not support claiming that the
one-to-three-fact contract was mathematically impossible. It also does not prove
that all future inputs are feasible or that compact evidence preserves all needed
context.

### Failures outside generation

The repair history documents distinct faults:

1. **Startup and authorization:** sandboxed fetch failures diagnosed as transient
   DNS, stale checkout instructions, failed saves through private-directory links,
   and a September 13 Spark launcher denied before execution. A better writer
   cannot fix these. The denial is not Spark quota exhaustion.
2. **Authoring interface:** previously shallow nested schemas and conflicting
   fact/writer prompts led to missing fields and obsolete fields. Later candidates
   encounter exact-evidence, vocabulary, scope, and editorial-admission errors.
3. **Continuation:** the earlier design spent one six-hour slot per four-verse
   chunk. Missing checkpoints/handoffs, stage-versus-ledger crashes, and model-pair
   rules could strand successful work. Several of these have since been repaired.
4. **Review and publication:** a legacy link-only audit was misclassified as broken
   native approval state; a finalizer compared mixed-model provenance using a
   different ordering from its producer. D087 had approved content but still could
   not finish publication until those downstream defects were corrected.
5. **Readiness and prioritization:** an installed stale schedule prefix hid newer
   work, and a local attachment could be confused with published completion. The
   latest priority/receipt release addresses those defects, but is not evidence
   that future authoring succeeds.

These are documented in the linked repair plans below and the recent commits.
They are not all asserted to remain unfixed. Successive fixes exposed the next
failure boundary, which explains the experience of repeated repairs without a
consistently working daily feature.

## Why the trials multiply

The legacy pipeline separately extracted facts and wrote prose. Each stage could
repair, with additional paths for smaller verse chunks and atom-specific recovery.
The native worker combines both outputs into one candidate but retains much of
the same validation machinery.

The current native limits are three distinct rejected submissions per chunk,
sixteen accepted chunks and forty-eight submission reservations per wake, one
reading per wake, forty-five minutes for new leases, and sixty minutes for model
authoring. Spark/Luna fallback, scheduled wakes, and reading cooldowns are separate
mechanisms. Forty-eight is a ceiling, not a target or evidence of forty-eight model
calls. A scheduled no-op is not a new candidate attempt.

The same-model repairs are often correlated: the same source selection and ambiguous
error can produce a slightly different draft with the same underlying problem.
Waiting twenty-four hours does not make a deterministic evidence error easier.
The cooldown prevents unbounded spending; it is not a content-repair strategy.
Likewise, preserving one model per chapter can require fallback to rebuild a chapter
instead of completing only its missing chunk. That tradeoff should be measured.

Complete-reading reliability also differs from chunk reliability. As an illustration
only, independent 95% per-chunk completion would yield about 77% completion for five
chunks and 46% for fifteen. Actual failures are not independent, and 95% is not a
measured result here. The relevant target is complete, reviewed publication before
the reading date, not how quickly successful chunks run.

## What the validator can and cannot establish

Each fact currently has eleven required fields. The worker supplies facts and prose
together. `hydrateFactBriefEvidence` subsequently reclassifies relevance, prunes
facts, replaces evidence text, and rewrites protected terms before prose admission.
Some normalization is sensible, but changes to the semantic writing contract after
authoring make repair difficult. Native diagnostics do not show that transformation.

A fabricated, in-memory experiment exercised only
`validateFactBoundChapterOutput`, with valid citation/label scaffolding:

- Fact: **FABRICATED: the caretaker distributes parcels to needy households.**
- Protected term: **distributes**.
- Faithful alternative: **FABRICATED: the caretaker hands out parcels to needy
  households.** Result: rejected for missing the protected term.
- Reversed assertion: **FABRICATED: it is false that the caretaker distributes
  parcels to needy households.** Result: accepted by this subcheck.

This is not a demonstrated bypass of complete admission or independent review.
It shows precisely why lexical overlap cannot establish semantic fidelity. Exact
names can be useful guards, but ordinary vocabulary matching creates false alarms
while failing to verify agency, negation, causation, or qualification. Existing
independent source review remains essential.

Zero warnings is also not equivalent to editorial correctness. Suspicious overlap,
unsupported names, bad source scope, and writing style should have distinct outcomes
and accountable review. This proposal does not authorize weakening current gates.

## Proposed replacement

### 1. Compile the evidence before asking for prose

Retain the trusted source normalization and hashing. Build a bounded packet around
Henry's natural treatment/subsection boundaries, splitting long treatments by a
measured evidence budget. Keep exact requested verse coverage and explicit direct,
range-derived, or no-distinct-comment mapping. Never manufacture a distinct Henry
claim just to make neighboring verse records different.

The compiler supplies canonical IDs, labels, parent relationships, source spans,
and a visible list of important identity/relationship/qualification requirements
with eligible supporting spans. Verify that mandatory evidence is available before
generation. Preserve enough surrounding commentary to resolve references and
alternatives. Semantic selection of what is important must be reviewable; regex
hints are not a substitute for reading the source.

Source grouping changes the authoring batch, not the verse-focused app experience.
Whether fewer natural groups actually improve performance must be measured; long
treatments must not become unbounded chapter prompts.

### 2. Ask the author for one representation

Proposed minimal output: each requested verse ID with ordered sentences, each
containing its prose and supporting evidence IDs. Code assembles the blurb and
derives the existing runtime's citations, labels, scope metadata, and hashes.

Remove the parallel generated fact statement, category, relevance enum, copied
quotation, and arbitrary must-include-term contract from the author's output.
Exact evidence text is resolved from immutable IDs by code. The author still has
to select evidence that supports each sentence; that is the real editorial work.
Multi-claim sentences must be reviewed against all their cited evidence.

Keep meaningful identity, relationship, uncertainty, and direct-prose requirements.
Check them against the source and resulting prose without silently changing the
authoring contract after submission. The evidence pack itself is versioned.

### 3. Separate mechanical rejection from editorial review

Missing/extra verses, invalid citations, changed source hashes, invalid schema,
privacy violations, and artifact tampering remain hard failures. Return structured
diagnostics naming the failed constraint, actual value, and permitted repair.

Semantic support, omitted material qualifications, misleading scope, and prose
quality receive independent source comparison. Review can reject or request a
bounded correction, with reasons tied to specific evidence. Any reviewed correction
creates an immutable derivative with clear provenance. Do not automatically pass
uncertain material or let an author approve its own output.

Source-overlap and editorial heuristics should distinguish proven violations from
reviewable suspicions. Any change to today's autonomous zero-warning policy needs
explicit acceptance criteria and a reviewed policy/code change first.

### 4. Give the job one authoritative lifecycle

Use one durable per-reading job record and append-only attempt history, referencing
immutable input, candidate, review, and publication artifacts. Phases should be
explicit: evidence ready, generating, review pending, approved, publishing, and
published. A blocked phase carries its cause and resumption condition. Scheduler
wakes resume the job; a wake is not the identity of the content.

Generate one runtime from approved content. Compatibility catalogs and attachments
are derived outputs, not competing authorities. Preserve the existing immutable
publisher and manifest-last/readback guarantees. A job is complete only after the
publisher's exact receipt matches the approved artifact and live Henry readiness.

This can be implemented with the existing local filesystem and atomic operations;
a new database or hosted orchestration service is not inherently necessary. Retire
legacy entry points from the active execution path rather than adding another live
controller beside them. Preserve old artifacts and rollback tooling.

### 5. Retry by cause and measure the deadline

Keep separate authorization/controller, transport/capacity, mechanical candidate,
editorial, and publication failures. Authorization denial stops until the required
approval exists. A fixed source/contract mismatch stops for correction. Transient
transport can use bounded backoff. Content repair must target a diagnosed defect.

Start a pilot with one authoring attempt plus one evidence-directed repair, followed
by editorial escalation rather than blind repeat generation. This is a proposed v2
budget, not permission to replenish any current terminal lease. Record all calls,
rejected drafts, editorial interventions, and wait time.

Monitor the current-through-T+7 Henry coverage separately from ordinary study
readiness. Track oldest unresolved date, time spent at each stage, completed readings
per day, and the exact blocker. Alert on threatened reading deadlines. A source-link
fallback is useful degraded service, but never counts as condensed-Henry completion.

## Alternatives and model decision

| Alternative | Assessment |
|---|---|
| Larger model, unchanged pipeline | Worth a controlled comparison if authorized; cannot solve launcher authorization, stranded state, or publication bugs. No controlled evidence yet that it is sufficient. |
| More retries or more frequent wakes | May help capacity incidents, but repeats deterministic defects and increases artifacts/cost. Not the primary fix. |
| Rewrite orchestration while retaining the current authoring contract | Could fix continuation but retain the dominant evidence/vocabulary repair churn. Incomplete solution. |
| Simplified source-grounded authoring plus one job lifecycle | Recommended. Removes duplicated authoring work while retaining source review and delivery integrity. Requires a real pilot before replacement. |
| One generic chapter summary | Reduces generation, but fails the verse-focused product requirement. Do not substitute it silently. |
| Precompute the entire commentary corpus | Could remove daily generation from the critical path eventually, but requires new scope approval, a quality benchmark, and a maintenance strategy. It does not fix a bad authoring contract; current T+7 limits remain. |

Do not select a model from these historical counts. Compare the old and simplified
contracts on the same sources using the currently authorized exact Spark first.
Evaluate Luna separately under its existing eligibility rules. A stronger-model
authoring comparison would require an explicit change to the current exact-model
policy and authorized execution. This review invokes no model and recommends no
unmeasured model as the proven solution.

## Migration and acceptance

1. **Freeze the measurement contract.** Success means every requested verse has
   reviewed Henry coverage and the exact published artifact is ready before its
   reading date. Record generation completion separately. Preserve current good
   chunks, terminal failures, approvals, receipts, live fallbacks, and daily study
   preparation. An architectural proposal does not authorize bypassing cooldowns
   or a rejected runner command.
2. **Build v2 as an isolated offline pilot.** Start with packet compilation, the
   smaller author output, and a compatibility exporter to the existing runtime.
   Use fabricated fixtures for mechanical tests. No live queue switch, public app
   change, new cloud resource, or bulk source generation is needed for this stage.
3. **Run an authorized private paired evaluation.** Use at least ten representative
   source groups covering at least one hundred verse records from already approved
   or currently eligible material: direct verses, shared ranges, identity details,
   alternative interpretations, long treatments, poetry, and multi-chapter readings.
   Include previously difficult cases; hold some cases out from prompt tuning.
   Preparation of historical comparison material must remain within separately
   authorized evaluation scope. Do not extend daily preparation beyond T+7.
4. **Compare outcomes, not only admission.** Blind the reviewer to contract/model
   where practical. Score unsupported claims, omitted material detail, changed
   certainty, wrong scope, readability, and citation fidelity. Count all authoring
   and repair calls, review time, interruptions, and total elapsed time. Proposed
   pilot gate: all mechanical integrity checks pass, no material source errors
   survive independent review, at least 90% of records need no substantive editorial
   correction after at most one repair, and material repair/intervention work falls
   by at least half against the paired baseline without worse source fidelity.
   These are proposed pilot thresholds, not measured results or a statistical proof.
5. **Test the full job lifecycle.** Exercise crash-before-save, save-before-event,
   review interruption, publish-before-receipt, duplicate wake, missing permission,
   source change, and partial model failure. Resume from the last verified artifact
   without repeated generation, duplicate publication, or silently reset budgets.
6. **Migrate one eligible reading at a time.** Use an explicit job owner/version to
   prevent old and new pipelines from both leasing it. Adopt legacy artifacts only
   after exact compatibility and review checks; leave historical artifacts intact.
   An existing blocked reading cannot be reissued under v2 merely to evade its
   terminal attempt state. Obtain the required migration/execution authorization.
7. **Require operational proof.** At least seven consecutive normally scheduled
   eligible readings must complete authoring, independent review, exact publication,
   and reader-visible refresh before their dates without manual restarts or source
   code patches. Include a multi-chapter case when the authorized calendar supplies
   one. If it does not, retain that limitation instead of generating out of scope.
   A private content check must confirm every requested verse record; an installed
   reader must show the current Henry revision without a manual cache clear.
8. **Retire the old active route only after acceptance.** Keep immutable content and
   rollback tooling. Reconcile the operating documentation to one current procedure.
   `npm run check` and the release gates are necessary for code changes, but neither
   installation nor fabricated passing tests substitutes for step 7.

For this two-reader application, a bounded independent editor finishing a diagnosed
exception is a reasonable controlled operational fallback. Its interventions must
be counted honestly; repeated coding intervention is not autonomous success.

## Authorization and work performed in this review

The September 13 automatic approval rejection concerned the Spark launcher, which
writes private candidate/progress state. It reported that trusted direct execution
authorization was absent and prohibited achieving the same result through a
workaround. The earlier request to resume generation remains unanswered. This
review performed read-only historical analysis, unchanged-candidate pure validation,
and fabricated in-memory counterexamples. It did not restart generation, alter
automation, reset attempts, publish content, or change the deployed app.

Only this report and the project-state handoff are changed. Today's missing Henry
layer is still an unresolved operational issue; this document does not claim to
have repaired it.

Validation: unchanged-candidate replay and both fabricated lexical counterexamples
ran successfully as diagnostic experiments. `git diff --check` passed. Repository
safety passed with 413 files inspected after allowing its read-only Git subprocess
outside the sandbox. No application code changed, so the full application suite
was not rerun for this documentation-only review.

## Evidence map

- `scripts/lib/mhc-native-worker.mjs`: compact evidence selection, candidate
  normalization/exposure, hydration and admission chain.
- `scripts/lib/mhc-pipeline.mjs`: fact hydration, required terms, source/relevance
  and prose validators.
- `scripts/mhc-pipeline.mjs`: retained legacy stage repair and fallback paths.
- `scripts/mhc-native-worker.mjs`: submit failure diagnostics, staged success,
  ledger events, review application, library finalization.
- `scripts/lib/mhc-native-runner.mjs` and `mhc-native-state.mjs`: wake budgets,
  continuation, model pairing and terminal attempts.
- `scripts/lib/mhc-priority.mjs`: exact publication-receipt completion gate.
- `prompts/mhc-native-candidate-packet-v2.md`: current combined authoring contract.
- `schemas/mhc-native-candidate.schema.json`: eleven-field fact shape.
- Ignored `private-commentary/mhc/{jobs,fact-briefs,schedule}`: retained historical
  output/validation snapshots and review audits.
- Ignored `private-content/automation/mhc-native-work-items/{ledger,review-staging}`
  and per-item directories: native attempts, candidates, validation and handoffs.
- Ignored publisher receipts under `private-content/automation/staging/`.
- [Earlier persistence/contract review](repair-luna-henry-save-and-contract.md).
- [Runner and throughput review](henry-deterministic-runner-throughput.md).
- [Current pipeline reference](../MATTHEW_HENRY_PIPELINE.md).
- [Release gate](../RELEASE_STABILITY.md).
