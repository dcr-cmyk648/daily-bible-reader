# Henry v2: operation and acceptance

Version: `mhc-evidence-author/v2`. Implemented September 13, 2026 following the
user's explicit approval of the pipeline replacement. Release/installation and
real scheduled publication evidence are recorded separately in PROJECT_STATE.

The October 10 WO-1 configuration/retry contract supersedes historical Spark
operational wording below: see
[Henry recovery release](execplans/henry-recovery-release-2026-10-10.md).
The primary is `gpt-6-luna` at medium; retained fallback is `gpt-5.6-luna` at low.
Activation remains pending genuine installed preflight and manager sequencing.

## October 11 source repair and author holds

The accepted `955b2f6` atomizer already prevents excluded Scripture from returning
through fallback. Compilation additionally rejects a commentary atom matching
the normalized unit's recorded excluded-Scripture hash; contaminated v3 caches
fail closed without replacement. The October 11 approved GEN19 policy applies
only to `LTP-0032-GEN-019` verses 15–18 and the four exact source ID/hash pairs
`024-025:a002`–`a005`. It preserves indexed ranges, adds those atoms to the existing
12–14 context, and displays both original source ranges as shared treatment.
`no-distinct-comment` means no covering indexed unit, not absence of Henry's
related discussion. Archive/atom/range drift rejects compilation. The normal
marker, requirement, citation, copy, packet and review gates remain unchanged.

An optional private `automation/mhc-author-holds.json` follows
`schemas/mhc-author-holds.schema.json` and binds holds to the active plan and exact
reading IDs. The manager changes this local record only under the normal native
lock while authoring is quiescent. Invalid schema, unknown reading or wrong plan
fails closed. Missing records mean no holds. A hold removes author eligibility;
it grants no source/model authority, never expires automatically, and cannot
clear forward debt or authorize historical work. Later eligible forward readings
can proceed through normal selection and dispatch. Clearing a hold restores the
ordinary earliest-eligible order. A genuinely eligible GEN19 still precedes PSA4.
An active generating owner remains protected, including a held owner; another
author cannot claim concurrent work. Held job histories, leases, attempts,
partial inputs, cooldowns and budgets remain untouched. Global runtime, source,
authentication and configuration failures still block normally. Review and
publication retain their independent source-bound gates.

## What changes

The author produces one representation: verse records containing sentences and
their supporting evidence IDs. Code supplies scope, source labels, quotations,
citations, model metadata and hashes. There is no generated fact ledger, protected
ordinary vocabulary, copied quotation field, or hidden post-generation hydration.

Packets follow natural Henry source-range boundaries, at most eight verses and
96 KiB of serialized source packet. Full commentary atoms are deduplicated within
each packet, retaining surrounding context. Evidence is never truncated to make
an oversized packet fit; a source-preparation error must be corrected explicitly.
Every packet and final reading has exact verse completeness. Verse-focused runtime
records retain honest direct/shared/no-distinct-comment scope. No runtime AI or
app shell change is introduced.

The compiler preserves the existing verified normalized source path. Missing or
explicitly recognized legacy v1/v2 normalization is rebuilt **in memory** from
the already-present archive and extracted module after checking their recorded
hashes. No download, arbitrary book request, cache overwrite, or corpus generation
occurs. Current normalized v3 corruption fails closed. Embedded source Scripture
transcription stays outside author packets and runtime disclosure.

Mechanical admission checks schema, exact ordered verse coverage, packet identity,
allowed source citations, evidence for explicit identity/relationship requirements,
length and source-copy risk. Required-evidence diagnostics give the actual eligible
evidence IDs. Ordinary word overlap is not a semantic gate. Missing material detail
and target-treatment concerns are explicit independent-review tasks. This is the
approved replacement of the old fact/vocabulary admission contract, not a claim
that semantic checks are unnecessary.

## One reading lifecycle

Stage C's native interface advertises `selectionBindingVersion =
"requested-reading/v1"` from `mhc-v2-author-session.mjs`. Under the same native
runner lock, call `selectAuthorWorkV2(ctx, {requestedReadingId}, now)` from
`mhc-v2-service.mjs` to inspect the exact native selection and its `authorLane`
without claiming work. Pass that lane to `runAuthorSession(ctx, {lane,
codexExecutable, maxReadings: 1, requestedReadingId}, dependencies)`. Actual
preflight runs before `startV2(ctx, lane, now, {requestedReadingId})` can mutate
jobs. Wrong reading, lane or current-through-T+7 scope returns action `none`,
code `V2_REQUESTED_READING_MISMATCH`, without configuration rebinds, lease expiry
events, ownership wake increments or claims. Omitted requests retain the original
selection and catch-up behavior; an exact request requires `maxReadings: 1`.
Guarded housekeeping is restricted to that reading. It does not expire or rebind
unrelated jobs, including retained past or out-of-window artifacts.
The guarded selector and guarded start share an opt-in EDF choice across queued,
proven fallback and new/dependency candidates. An earlier exhausted fallback can
therefore select Luna ahead of a later primary queue. A retained generating owner
still stays pinned. Default lane calls keep their original queue-first ordering.

A daily study awaiting its Henry library may additionally pass
`requestedDailyWorkOrder: {path, sha256, dailyJobId}` to both selection and author
session. The path must be the exact private
`private-content/automation/staging/<readingId>/supervisor/orders/<sha256>.json`.
Native admission checks the raw file hash, rolling work-order schema, deterministic
work-order identity, `prepare_publish` action, exact plan/reading, same Detroit
effective/issue day, target date and seven-day guards. It then verifies the existing
same-project supervisor journal: its latest preparation `observation` must name
that EDF reading/action/date, its latest daily state must be `waiting_henry` with
the same job and work-order reference, and its accepted `daily-synthesis` execution
must match the author session/thread and unchanged response bytes. Stage C must
append this observation before dispatch. The reference cannot displace an active
native owner or earlier eligible queued, fallback or new-reading selection.

This narrow path can create one source-authoring job before the devotional is
remotely published. It records `daily_dependency_admitted` provenance and retains
the original budgets, source verification, independent review and library
finalization. It creates no quota fallback or remote content, plan or manifest
write. Remote devotional publication retains its independent review, prefix and
content-first/manifest-last gates. This reference requires an exact reading and
one-reading cap; the ordinary backfill callers never consult it.

Stage D uses the separate `historicalSelectionBindingVersion =
"historical-selection/v1"` marker (exported by both native service and author
modules). Under the same native lock, call
`selectHistoricalAuthorWorkV2(ctx, {}, now)` for the original manifest-backed
target and lane. Optional `{requestedReadingId, lane}` constrain that selection;
they cannot choose a different target or owner. Native code performs authenticated
live health itself and requires all eight current-through-T+7 devotional and Henry
layers complete. It uses the original selector's cooldowns, forward-debt priority,
active owner, queue-first ordering and controller-proven fallback eligibility.

For action `selected`, pass `requestedReadingId: selected.readingId`,
`lane: selected.authorLane`, `maxReadings: 1` and
`requestedHistoricalAuthorization: selected.historicalAuthorization` to
`runAuthorSession`. Keep the exact object in the same loaded native module/process:
it is a native in-memory reference, not a JSON work order. Copies, serialized
receipts and model-provided health Booleans confer no authority. The reference
expires after five minutes and binds the reading, owner, Detroit day, project,
release, runtime manifest, configuration and plan. After actual author preflight,
dispatch repeats authenticated health and the original selection before any job
mutation. Missing/stale health, changed selection or owner, invalid references
and unpublished/nonhistorical targets reject without job or ownership-counter
writes. Historical and daily dependency admission cannot be combined.

The default legacy `author-run` / `startV2` route now enforces the same actual
forward-buffer prerequisite before historical author admission. It projects the
original selector and maintenance without writes, then authenticates current
through T+7 health twice before any historical job initialization, model rebind,
lease/owner transition, session or candidate work. Only eight complete devotional
and Henry readings admit the original historical selector, cooldowns and owner.
Incomplete health restricts both selection and maintenance to forward chapters;
with no eligible forward author it returns `none` / `forward_preparation_pending`,
without approval status, a healthy claim, an author failure or historical mutation.
An existing historical writer also stays untouched while preparation is pending.
All packet, reading, run and deadline budgets remain unchanged. The exact requested
forward/daily and in-process historical interfaces retain their existing gates.

The queue keeps immutable published job directories as evidence without treating
them as pending debt when the existing exact publication check verifies the
receipt, current metadata, approved artifact and attached runtimes. Stale,
unreadable, unresolved and reopened jobs remain pending. This read-only view
changes no event heads, budgets or cooldowns and grants no forward-health authority.

Accepted historical dispatch records the fresh measurement hash and timestamp
in `historical_authorization_admitted` history. Existing attempts, sessions,
leases, per-packet submissions, review and publication gates remain authoritative;
this reference does not renew them. The native immutable installer now includes
the allowlisted public backend config needed for its authenticated health closure.
Tests inject fabricated health transports and authors; source validation never
performs a live model/API probe. Manager owns installation and live acceptance.

The verified launcher reports child spawn errors, signals, missing exit status
and silent nonzero exits as stdout-only `mhc-native-launch-result/v1` failures.
`runtime_launch` / `launch_failed` preserves only allowlisted spawn-error and
signal enums plus the actual exit status. It suppresses interrupted child output
and leaves dispatch unverified; it grants no replay or budget reset. Normal
structured controller results retain their original bytes and exit status.

Independent native writers read and validate the canonical supervisor event chain
before claiming the runner lock and again before entering its mutation callback.
Every retained `native_source_state` transaction stays exclusive through `ready`,
`dispatched`, `captured` and `prepared`; only its own `complete` or `failed` state
releases it. Unknown source phases, malformed or unreadable existing journals and
redirected paths fail closed without repair. A genuinely absent supervisor directory
retains standalone behavior. Native author/job/review/recovery entries repeat the
guard; inspection/preflight locks grant no mutation authority. Native status
inspection observes partial jobs without creating missing job/event directories.
Every legacy reviewer command holds the same runner lock through its child writes.
The supervisor's
source reservation must use the same native lock before recording its initial
`ready` event, so a source transaction cannot begin beside an existing writer.

The ignored `private-content/automation/mhc-v2/<readingId>/` directory contains:

- immutable `input.json` with source, plan, scope and packet hashes;
- an append-only, sequential, hash-linked `events/` history whose latest committed
  event is the authoritative job state;
- exact immutable submitted bytes and per-attempt diagnostics;
- the writable candidate file for only the currently assigned author packet;
- immutable source-review bundles, optional editorial derivatives, approval and
  final approved runtime artifacts; and
- the existing canonical-application transaction under that reading's job.

There is no separate mutable checkpoint or completion pointer for v2. An event
append commits the transition. Writes use verified canonical paths and atomic
replacement; source, candidate, review and event hashes are rechecked. A durable
submission reservation occurs before admission, so interruption cannot erase its
cost. A successful admission replaces the packet's current diagnostic with success
while every historical error remains preserved by candidate hash.

The principal phases are queued, generating, fallback_pending, editorial_attention,
review_pending, approved, publishing and published. The active authoring reading
stays pinned until it finishes or explicitly hands off. Other eligible forward
readings may advance while an earlier one awaits fallback/review/publication.
Forward debt still prevents historical backlog from taking priority. Unpublished
studies and book introductions remain the separate daily service's responsibility.
An editorial repair with remaining packets returns to the resumable queue; it
cannot become a second active authoring job. The current author finishes before
the oldest queued continuation resumes with its preserved model and budgets.
Review selection puts current-window work before historical recovery, then
prioritizes approved publication recovery within each tier.

## Models, retries and editorial exceptions

Spark remains exact `gpt-5.3-codex-spark` at medium reasoning. Luna remains exact
`gpt-5.6-luna` at low reasoning. There are no nested model calls or new providers.
Each source packet permits one initial submission and one repair. Unchanged
rejected bytes do not spend another attempt. An authoring wake permits at most
32 submissions and sixty minutes; restarting the same lane/slot preserves its
deadline and spent budget. Successful packets are reused across wakes.

Luna becomes eligible after recorded actual Spark candidate exhaustion, or an exact
provider refusal that Spark is unsupported with the current ChatGPT account.
The latter requires a failed structured provider event, no successful response or
tool activity, and checksum-bound execution evidence rechecked before the chapter
transfers to Luna. Candidate counts and original events remain unchanged.
A missing Spark run, source error, persistence failure or host authorization denial
does not create fallback eligibility. This deliberately removes the ambiguous
missed-primary inference from v2. Source/controller/permission failures require
repair of their own cause rather than model substitution.

For an exact provider rejection requiring a newer Codex client, an explicitly
authorized operator may run the installed `recover-client-upgrade --reading ID
--prior-codex OLD_EXECUTABLE --codex-executable NEW_EXECUTABLE` command. It requires
zero submitted/accepted candidates, no response output, the exact failed current
packet/session receipt, a distinct newer CLI binary, and no earlier client recovery.
It preserves the failed bytes, deadlines and budgets, recording both executable
hashes/versions and failure evidence. The next author invocation must use that
exact new binary and unchanged failure evidence. It receives one distinct dispatch;
scheduled tasks must not invoke this operator recovery or choose another model.

One model still owns a chapter. An eligible Luna transfer retains the original
Spark artifacts but uses Luna for that chapter. On reaching a new chapter, the
controller hands it to its assigned owner, rather than asking Luna to author under
Spark metadata. Mixed-model readings preserve exact chapter provenance through the
existing runtime and library contracts.

After Luna's two rejected candidates, a complete substantive draft may receive
one explicit, source-compared editorial correction for that packet. It binds the
exact last rejection, input and reviewer findings and preserves both original and
corrected artifacts. Empty, malformed or incomplete original drafts cannot be
silently completed and labeled as Luna output. An editorial correction does not
replenish model attempts; final independent reading review remains required.

The final reviewer can also request a bounded packet correction when otherwise
mechanically accepted prose has wrong evidence or interpretation. That decision
binds the exact review basis and findings. The original accepted candidate remains
preserved, the correction receives explicit editorial provenance, and the changed
reading must be reviewed against a new approval basis. No packet can receive an
unlimited sequence of editorial corrections.

Existing v1 terminal attempts and their cooldown timestamps are preserved. The
shared legacy cooldown selector runs before any new v2 reading is created. Old
validated partial chunks remain intact as historical artifacts; the new natural
packet contract does not silently import them as approved v2 output. A legacy
reading started under v2 after its cooldown uses the new contract explicitly;
this one-time migration can repeat earlier partial work. Routine v2 restarts
reuse their own accepted packets without regeneration.

An explicitly approved operator recovery may use `migrate-current --reading ID
--legacy-attempt-sha256 HASH --reason TEXT` through the installed launcher. It is
limited to today's manifest-published chapter with a retained v1
`NATIVE_CANDIDATE_UNRESOLVED` model failure, no v2 job, no outstanding legacy review,
and no other active author. It binds the exact legacy attempt-file bytes and saves
the approval reason before creating one queued v2 migration. It never edits the
legacy file, resets a v2 budget, substitutes a model, or bypasses review/publication.
Repeated invocation returns the existing job. Scheduled tasks must never invoke it.
This exception requires specific operator authorization; ordinary selection retains
the legacy cooldown.

The scheduled controller has no network or model calls. Its author packet contains
public-domain MHC commentary and public reference/hash metadata. Private storage
does not make those source paragraphs private user data. The generation contract
explains this distinction and points to the verified compiler so execution review
can inspect the actual payload and local operation rather than infer a transfer
from the storage path. No global trust or approval setting is changed.

## Review and publication

October 10 Genesis 15 incident: all four problematic canonical packets have already
received their one native editorial repair. The remaining verse-1 packet has no
mechanical finding. Two supervisor review responses are spent; ordinary retries
and additional packet repairs remain forbidden. The manager accepted a separate,
single source-bound final review exception, documented in
[supervisor authoring](SUPERVISOR_AUTHORING.md). It uses an immutable manager receipt
binding both runtime closures/configs, exact source/native head/review basis, both
failed raw responses, all ten original mechanical findings and prior thread evidence.
Only one independent ephemeral Sol 6.1/high ChatGPT response is admitted, with no
response repair or retry. All eight assertions and existing prose, source-copy,
schema, native approval, library and publication checks remain authoritative.
The supervisor retains unresolved Henry debt while eligible contiguous daily work
continues; this exception neither changes the native author prompt nor repins fd.

The independent reviewer receives every sentence/evidence association, full source
packets including uncited material needed to evaluate omissions, exact runtime
drafts, concerns and editorial provenance. Approval binds the exact review basis,
named reviewer, timestamp, findings and all eight explicit source-quality assertions.
It cannot be inferred from mechanical admission. Source-reporting prose and source
copying remain blocked at final approval. Bounded prose corrections are immutable,
reviewed derivatives; they cannot silently change cited atoms.

Apply uses the existing native transaction and reviewed-library finalizer to
produce the same portable runtime format consumed by the daily/publication tools.
Then the authorized existing publisher attaches that exact artifact, validates
the private reading, publishes immutable metadata and the manifest last, performs
exact readback and live Henry readiness checks, and writes its genuine receipt.

The v2 job reaches published only when that receipt matches the current reading
pointer and exact metadata bytes **and** the attached runtime exactly matches the
job's approved artifact. Local attachment alone is insufficient. A stale receipt
or different attachment reopens publication verification debt. Already-approved
transaction/library/publication interruptions resume without reauthoring.

When a reviewer discovers a source error after approval, the publisher first
pauses any in-flight publication. The installed `reviewer reopen` command requires
the exact current approval SHA-256, actual reviewer identity, and a specific reason.
It appends an approval-revocation event and returns the reading to full review.
Accepted candidates, attempt budgets, source inputs, old approvals, transactions,
receipts and live files remain unchanged. The new bundle includes earlier review
findings/corrections, but requires a fresh approval against its changed basis.
Citation changes still use the same bounded packet editorial repair; reopening
does not replenish those allowances. Each revised approval has an isolated
transaction directory, preserving both the old committed transaction and the
finalizer's exact-one transaction guarantee. A stale approval hash cannot revoke
a newer approval. This path is for material editorial findings, not automatic
retries or permission workarounds.

Legacy review handoffs remain recoverable through the installed reviewer. When
there is no v2 review work, it consults the retained legacy work-order handler and
returns its v1 review instructions. Explicit legacy prepare/apply/finalize review
commands remain available; legacy generation is not the v2 execution route.

## Activation

The release manager owns the existing explicit release authorization. From the
exact clean accepted commit, use the existing installer with these additional
arguments (actual configured private roots and automation IDs stay private):

```text
node scripts/install-mhc-native-runtime.mjs
  --project-root <existing-canonical-project>
  --revision <exact-accepted-40-character-commit>
  --spark-automation-id <existing-spark-automation>
  --luna-automation-id <existing-luna-automation>
  --pipeline v2
```

The installer verifies committed blobs, writes an immutable release/configuration,
and switches the current pointer last. Under its operation lock it refuses an
active v1 wake, a leased legacy work item, or an active v2 authoring session. Old
source releases, v1 history, approved content, receipts and live fallbacks survive.
A silent v1 reinstall over v2 jobs is refused; rollback needs an explicit compatible
migration and cannot simply reinterpret the new state as legacy state.

Align the daily/private-publication bootstrap to the same accepted commit and run
its real private-store validation before activation. Existing current-through-T+7
priority, exact models, cadence, reviewer identity, private publisher, sharing and
app deployment identities remain. Update the existing saved task prose from:

- Spark and Luna: `prompts/mhc-v2-generation-runner.md`, with their existing exact
  absolute Node/launcher command and respective `spark` or `luna` argument.
- Reviewer: `prompts/mhc-v2-review-runner.md`, with its existing exact absolute
  Node/launcher `reviewer work-order` command.
- Supervisor, if already active: `prompts/mhc-v2-supervisor.md`, retaining its
  existing schedule and reading the installed controller's status.

Those tasks follow the private paths/commands returned by code. Do not append the
obsolete fact-brief, three-attempt, Git-fetch or one-chunk-per-wake instructions.
Do not create duplicate automations. The installed `status` command reports stage,
accepted/total batches, submission count and current local publication proof.

## Validation and user testing

The fabricated suite exercises the actual compiler, event store, author continuation,
review, canonical transaction, library finalization and exact publication gate.
It includes an installed immutable launcher from an isolated fabricated Git commit,
arbitrary working directory, source and approval tampering, two-model fallback,
editorial derivatives, cooldowns, interruption after reservation, missing final
handoff, diagnostic recovery, wrong published attachment, and rollback refusal.
No fixture contains real Scripture or Henry wording; no test calls a model or
publishes to Google.

Read-only real-input compilation on September 13 succeeded for D090 (20 verses,
four packets), D091 (18 verses, three packets), D092 (six verses, two packets), and
Genesis 1 (31 verses, ten packets). Maximum packet sizes in those cases range from
about 15 to 32 KiB. These checks prove source preparation, not model quality or
published readiness.

The release requires repository safety, `npm run check`, deterministic Pages
verification, exact installed revision/configuration, and the canonical private
publication-workspace compatibility check. Public shell/backend assets should be
unchanged. During the next devotional days record actual authoring calls, repairs,
review corrections, elapsed time, publication receipt and reader-visible results.
Seven consecutive normal scheduled publications without manual restarts remain
the reliability acceptance target. Installation or fabricated tests alone do not
meet it. The user's requested live trial begins only after explicit activation;
neither this document nor the implementation claims that future runs have passed.

The generation scheduler now coordinates `author-run --lane spark|luna
--codex-executable <approved absolute CLI>`. The coordinator does not author.
The installed adapter recompiles the current packet from verified public-domain
source, compares every atom and rejects non-commentary inputs before transmission
to the exact OpenAI author through the existing ChatGPT login. It disables child
shell, apps, plugins, subagents, web and configured MCP servers. No API-key fallback
is allowed. Structured response transport uses its own schema adaptation; strict
candidate validation is unchanged. Actual response hashes and execution outcomes
remain private. Each packet/attempt/session dispatch occurs at most once, including
transport failures. The existing lock, one-reading limit, session deadline,
candidate budgets, independent review and exact publication receipt remain gates.
The saved coordinator model may differ from the actual author model; only the
model in the real child execution authors the attributed condensation.

Connector inventory and its disabled-state verification run with the same
apps/plugins restrictions as the author, before selecting or starting a job.
Transport checkpoints persist a queued state without altering session deadlines
or budgets, permitting a safe compatible runtime update while no writer is active.
For the one retained initial CLI configuration rejection, the installer accepts
`--recover-unstarted-transport <readingId>` only under its existing global lock.
It requires zero candidates/submissions, one exact failed execution, empty model
events, no output file, the known pre-start configuration error, a different
accepted revision, and no previous recovery. It preserves the failed bytes and
all session history, appends an audit event, and permits one separately addressed
dispatch. An active, uncertain or actually started model cannot use this recovery.

For publication byte checks, use the original raw connector file bytes rather
than its normalized readable-text field. Preserve raw baselines privately. If
parsed manifests are identical but line endings differ, reconcile the canonical
mirror to the observed live bytes and validate it; do not interpret formatting
as a changed reading or overwrite a newer semantic update.

Before declaring a manifest conflict, execute byte/hash and parsed deep-equality
comparisons against the current canonical `private-content/private-manifest.json`.
Keep the actual raw connector bytes privately and use `Buffer.equals`, SHA-256
and `util.isDeepStrictEqual`. Old publication receipts, staging manifest candidates,
visual inspection of IDs and normalized connector text are not comparison evidence.
A semantic-conflict report must identify differing field paths from an executed
comparison. Re-fetch the live manifest immediately before its final pointer update.

## Ranged daily passages — September 27, 2026

Source normalization verifies the complete source chapter independently of the scheduled passage. An explicit verseStart/verseEnd is validated within that chapter, and its count must match the range. Author requests, evidence targeting and the assembled runtime use those exact verse numbers. Full-chapter inputs retain their existing hashes. The regression suite covers beginning, middle and ending ranges through independent approval and immutable library finalization; malformed ranges and out-of-bounds source requests fail closed. This fixes the Psalm 2/Proverbs 1:1–8 source blocker without generating commentary beyond the assigned range or changing author/reviewer budgets.
