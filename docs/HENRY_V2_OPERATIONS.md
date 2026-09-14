# Henry v2: operation and acceptance

Version: `mhc-evidence-author/v2`. Implemented September 13, 2026 following the
user's explicit approval of the pipeline replacement. Release/installation and
real scheduled publication evidence are recorded separately in PROJECT_STATE.

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

Luna becomes eligible only after a recorded actual Spark candidate exhaustion.
A missing Spark run, source error, persistence failure or host authorization denial
does not create fallback eligibility. This deliberately removes the ambiguous
missed-primary inference from v2. Source/controller/permission failures require
repair of their own cause rather than model substitution.

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
