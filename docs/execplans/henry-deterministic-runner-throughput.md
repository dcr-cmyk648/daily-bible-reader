# Deterministic Henry execution and reading throughput

## Outcome and scope

Repair unattended Matthew Henry generation so routine startup requires no improvised Git/worktree setup, interrupted work resumes deterministically, and complete readings reach the existing review lane fast enough to keep up with the calendar. User explicitly authorized this repair and adequate throughput on September 10 after the root-cause diagnosis. Preserve source quality, exact native Spark/Luna model routing, and independent review/publication.

## State and evidence

- Implementation clone: `/private/tmp/dbr-henry-runner-47fiel31/worktree`, branch `agent/henry-reliable-runner`, base `c960e12ad1c03f1019735ed335e53db31c9119a2` (latest fetched main).
- Selected project checkout is dirty historical `agent/pages-pwa-canary`; do not overwrite it. Shared private stores remain canonical and contain other scheduled work.
- Five original Luna scheduled runs after the previous repair failed before generation: September 9 17:25/23:25 and September 10 05:25/11:25/17:25 Detroit. Fetches omitted explicit elevated execution while network access was disabled. Recorded elevated retries succeeded. Identical read-only DNS lookups failed inside the sandbox and succeeded outside it. Supervisor incorrectly inferred transient DNS and added retries.
- Generation can succeed once correctly launched, but prepare, author, submit, assemble, and review handoff are loosely coordinated model actions. Latest resumed run stopped after prepare and later tried submit from the historical checkout.
- Four-verse chunks each formerly consumed an entire six-hour schedule slot. D087 needs nine chunks for 29 verses across three chapters; current safe diagnosis found eight validated, without a review handoff.
- Existing test/proof acceptance covered individual candidates, not repeated unattended invocations through complete assembly and review discovery.

## Decisions and non-goals

- Install an immutable local runtime with explicit source revision and hash manifest. A stable absolute entry command verifies it and resolves all working paths. Generation does not fetch GitHub. Installation/upgrade belongs to release maintenance; do not loosen host permissions.
- Keep small source-grounded candidate assignments and the three distinct submit-attempt ceiling. Native model writes candidates directly; no nested Codex or model substitution.
- Code owns selection, durable checkpoints, candidate admission, idempotent final assembly, and recovery. Consecutive candidates may run during one wake within a measured reading/chunk/time budget, instead of sleeping six hours between candidates.
- Preserve Spark-first/Luna eligibility, single-model-per-chapter source provenance, review assertions/transaction binding, and all private publication gates. Do not generate beyond the authorized calendar horizon or perform daily main-commentary synthesis.
- Do not modify frontend, deployed backend, authentication, ESV handling, secrets, or sharing. Preserve unrelated user edits and existing content.

## Milestones and ownership

1. Sol read-only design/discovery: map current functions, schedule demand, bounded drain design, and missing integration gates; primary owns architecture and accepts proposal.
2. Sol implements one bounded runtime/bootstrap and progress-engine milestone with fabricated regression tests. Primary owns this plan and automation definitions; no overlapping implementation or tests.
3. Sol verifies complete-reading continuation, interruption recovery (before save, after submit, before assembly), tamper/path confinement, exclusion of ineligible fallback, and capacity against actual schedule metadata. Primary reviews actual changes once.
4. Primary installs validated runtime, updates existing named native generation/review/supervisor tasks as needed, and verifies real exact-model execution from the installed entry through complete assembly and review discovery. Respect private review boundaries; never claim generation equals publication.
5. Run required repository release gates once for accepted source. Publish the authorized repair through existing channels, verify exact commit workflows, install the exact released runtime, and record operational evidence and remaining limitations in PROJECT_STATE.

## Completion evidence

- Scheduled generation can start from the installed entry with network disabled and without reading stale checkout code.
- Work survives process boundaries with no guessed temp paths, repeated completed candidates, or lost final handoff.
- Complete real reading reaches validated assembly and is discoverable by reviewer; publication remains separately approved and verified.
- Capacity report shows headroom above maximum relevant daily reading demand, including realistic candidate/retry timing and fallback overhead; distinguish theoretical capacity from observed performance.
- Passing targeted regressions, full npm run check, repository safety before staging/build, exact Pages checks, unchanged public app artifacts where expected, and exact remote release evidence.

## Progress and next action

- Root diagnosis and user authorization complete; clean current-base implementation clone created.
- Accepted Sol design: installed offline launcher plus code-owned start/advance and advisory atomic checkpoint, automatic admission/assembly and review discovery. Existing native controller semantics remain authoritative.
- Capacity metadata: D087-D092 need 9,4,5,5,5,2 chunks (30 total); bridge maximum15 chunks/reading. Four completed-reading wakes/day provides headroom over one arriving reading/day. Include existing authorized Genesis crossover in final capacity checks.
- Default per wake: one reading,16 validated chunks,48 candidate submissions, stop new leases at45min, checkpoint deadline60min. Preserve all three candidate attempts and complete deterministic final assembly even at a budget boundary. Host90min support is unverified and not assumed. Planned Luna offset2h after primary; reviewer hourly.
- Sol is sole implementation/targeted-test owner for installer, runner, minimum native changes, schema, generation prompts and tests. Primary owns plan/project state, live runtime installation, saved tasks, real proof and release. Quiet zone active: do not inspect partial code/diffs or repeat worker tests.
- Root prepared safe live preflight and published-manifest hash in `/private/tmp/dbr-henry-runner-47fiel31/preflight.json`. Canonical D087 has21 events, eight required chunks validated and final PSA150 005-006 remaining; no next lease was present. Do not rewrite prior events.
- Actual uninterrupted D087 lease-to-validation timings (8 samples, repairs included) span33-183sec, median129sec; the six-hour interrupted lease is excluded. Receipt: `observed-chunk-timing.json` beside implementation clone. This is observed evidence, not a worst-case guarantee.
- Exact saved task backups and concrete replacements are in `automation-before.json` and `automation-drafts.json` beside implementation clone. Drafts keep four Spark slots, move Luna2h later, run review hourly, and correct supervisor diagnostics. No live task has changed yet.
- Source lockfile matches previously validated dependencies; node_modules is materialized in the clean clone. Private data has not been linked into the clone or altered.
- Real acceptance has two distinct gates: an existing native Luna task resumed once with the exact installed prompt, then a naturally scheduled wake with no follow-up. There is no supported run-now API; do not mislabel a subagent or manual resumption as unattended proof. Use existing tasks, not new task creation.
- Next: review returned complete implementation and evidence once; correct material failures, then run real installed execution and final release gates.

## Primary review — first implementation returned for correction

The first milestone passed51 focused tests, but primary did NOT accept it or change live tasks. Its installed15-chunk test replaced the actual worker and reviewer modules with fake scripts, so it did not exercise real admission/ledger/assembly/discovery. The arbitrary-cwd launcher/tamper unit test is valid at its narrower scope.

Concrete correction ownership remains with Sol:

- Stage-file existence is not validated-ledger evidence. Recover a crash between staging and validated-event append instead of skipping submit forever.
- Recover final assembly when all chunks were previously validated but no runner checkpoint exists.
- Old completed checkpoints must not make a new runtime release permanently fail manifest checks. Refuse activation during an active wake and define safe historical adoption.
- Enforce60min/48-submission bounds on missing-candidate and repair branches, while always reconciling final assembly.
- Prove installed files match the declared clean source commit; do not label arbitrary working files with a supplied revision.
- Enforce one-reading pinning before new lease mutation and canonical work-item path confinement.
- Expose runtime revision, progress counts and elapsed time in safe status.
- Replace the mocked full-chain acceptance with real installed commands and fabricated source/plan/metadata through15 chunks, actual validation, authenticated ledger, actual assembly and real review work-order discovery.

No full suite, canonical installation, automation update, commit, push or generation has occurred in this repair phase. The worker is correcting this bounded milestone; primary quiet zone is active again. Exact installed reviewer command is `mhc-native reviewer work-order` (update the root draft's provisional `review` spelling before activation).

## Cortan continuation — 2026-09-12

This section supersedes the historical worker ownership, quiet-zone, and pending
correction notes above. Those are preserved migration records; no historical
worker or lease has been adopted. The dedicated Henry repair task owns source
changes in the isolated `a25e/BibleApp` worktree, based on `c960e12`. The canonical
checkout, dirty migration checkout, original implementation, private stores, and
daily devotional automation remain unchanged.

The recovered source contained later corrections beyond the rejected 51-test
milestone. It was imported and independently exercised with the actual worker,
ledger, candidate validator, assembly, and reviewer work-order modules. The
installed integration fixtures contain conspicuously fabricated commentary and
source atoms; they invoke no model, network, ESV provider, or publisher.

Additional defects corrected during Windows validation:

- The Unix shell launcher was not a native Windows entrypoint, and replacing a
  read-only launcher failed with EPERM. Commands now use the absolute Node
  executable and launcher module, with PowerShell-safe argument quoting and
  hidden bounded child processes. Immutable release files remain verified on
  every invocation; the owner-writable bootstrap is checked against its release.
- Copying working files after checking Git status left a provenance race and
  admitted ignored files. Installation now reads only exact committed Git blobs,
  excludes symlinks and non-code/private trees, and activates a checksum-addressed
  configuration/release pointer last under the runner operation lock. Reinstall
  and upgrade preserve all prior releases. Active wakes block installation.
- Repeated starts previously reset the same wake's clock/counters. The budget is
  retained through same-slot restarts; only a later slot after the prior deadline
  can resume with a new budget. A submission is reserved durably before admission
  so a crash cannot erase its budget cost. Unchanged rejected bytes are returned
  for repair without consuming another distinct candidate attempt. Three failed
  admissions recover terminalization without a fourth submission.
- A staged file alone is never treated as validated. The controller consults its
  source-bound ledger, resubmits an exact staged-but-unrecorded candidate, and
  completes assembly before permitting more generation. Missing checkpoints and
  a missing final handoff are recovered from complete authenticated work before
  the rotating selector can lease another reading.
- A pinned reading is checked before pair/lease mutation. A continuing Spark wake
  carries its recorded progress into later chapters without falsely triggering
  Luna after the old ten-minute grace period. Eligible model transfer and one
  winning model per chapter remain enforced by the native ledger.
- Work-item/checkpoint paths and existing ancestors reject traversal and Windows
  junction redirection. The installed worker confines its work store, and corrupt
  checkpoint history fails closed. Completed historical checkpoints do not pin
  subsequent runtime releases; active historical state is never silently adopted.

Limits remain one reading, 16 validated chunks, 48 submission reservations,
45 minutes for new leases, and 60 minutes for further model authoring. Native
admission still permits only three distinct rejected candidates per lease.
Deterministic finalization may finish after the authoring deadline. Status exposes
runtime revision, elapsed time, validated chunks, and remaining submission budget.

### Capacity and its limits

The factual prepared plan at this baseline has a maximum of 15 four-verse chunks
for one reading (D061, 56 verses across its chapters). D087–D092 require
9, 4, 5, 5, 5, 2 chunks; Genesis 1 requires 8. The Genesis introduction has no
verse-chunk assignment and remains in its existing independent source-link lane.
No new plan or commentary was generated to obtain these counts.

The preserved eight uninterrupted D087 observations include repairs: median
128.81 seconds, maximum 183.4 seconds per validated chunk. At those rates a
15-chunk reading projects to about 32.2 or 45.9 minutes; the last chunk can start
before the 45-minute lease cutoff at the observed maximum. Genesis 1 projects
to 17.2 or 24.5 minutes. Four available primary slots would offer theoretical
headroom over one arriving reading/day. This is historical timing evidence,
not measured Cortan model throughput or a worst-case guarantee. Exhausted model
capacity, repairs beyond those samples, and full-chapter Luna restarts can span
wakes; the independent daily study keeps its verified Henry fallback meanwhile.

### Activation handoff

See `docs/HENRY_WINDOWS_ACTIVATION.md` for the concrete source-release,
installation, paused-task, and operational acceptance sequence. Commit/push and
activation remain explicit approval gates. No real Henry material may be
created merely to demonstrate the runner. A naturally authorized reading, its
independent source-grounded review, and a later scheduled invocation must provide
operational evidence before unattended reliability is declared established.

### Final isolated release validation

`npm.cmd run check` passed 355/355 tests, 42 schemas, repository/source/content
gates, all builds and exact Pages verification. The two installed full-controller
fixtures each completed 15 chunks using the real modules, one for Spark and one
for eligible Luna. They cover no-candidate restart, stage/ledger interruption,
pin rejection before mutation, missing final handoff/checkpoint recovery, and
actual reviewer discovery. The test clock is controlled; model and network calls
are absent. Additional regressions cover budget reservation across crashes,
unchanged rejected bytes, third-failure terminalization, superseded leases,
controller/model failure separation, tampering, Windows upgrades and junctions.

`npm.cmd run publish:pages` reproduced unchanged frontend `d35abd879455dc50`
and PWA `a3cde99646bb00aa`; exact post-publication verification passed. Real
private-content validation was skipped because ignored drafts are absent in this
isolated worktree. No canonical migration validation was repeated. Source hashes
are recorded in `docs/validation/henry-windows-repair-20260912.json`.

The manager subsequently relayed explicit activation authorization. Read-only
canonical preflight is complete: zero live historical leases, D087 eight winning
chunks still valid with one fresh Luna chunk remaining, and D084 completed.
All 221 inspected work-store files remained hash-identical. Henry definitions
are absent on Cortan and must be restored with their original model/identity
bindings. The manager owns all release/install/activation mutations; see the
updated Windows activation handoff.
