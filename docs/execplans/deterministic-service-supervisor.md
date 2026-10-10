# Deterministic BibleApp service supervisor

Status: accepted by BibleApp Manager October 10, 2026; implementation A–D authorized
in this worktree/chat. Each stage stops for manager release sequencing. Automation
changes remain manager-owned; preserve WO-2's installed-iPhone gate. Design and
later substantive
implementation use the explicitly requested Sol 6.1/high. No additional workers.

## Purpose and acceptance

Replace prompt-directed orchestration with a Node supervisor that executes the
service lifecycle. Codex remains the scheduler, the research/author/reviewer host,
and the operator of the existing Drive connector. The supervisor selects work,
dispatches bounded schema-output Codex subprocesses, reserves budgets, classifies
failure, validates artifacts, stages exact connector operations, verifies their
receipts and measures actual reader-visible health. Returning a work list while
leaving those decisions to an agent is not the completed architecture.

Success means the actual Detroit today-through-T+7 window contains eight reviewed
devotionals and complete Henry layers under the existing component rules, with
fresh authenticated health evidence and functioning scheduled preparation and
independent review. A valid fallback permits devotional publication but remains
Henry debt. At a plan endpoint the target is the actual remaining scheduled
readings; never invent dates or enlarge the approved plan. Seven normal scheduled
verified publications without manual restart remain the reliability acceptance
test; installation, mock tests and one manual recovery do not satisfy it.

Authority: the canonical October 10 recovery order, `docs/SERVICE_AUTHORITY.md`,
`AGENTS.md`, `docs/COMMENTARY_WORKFLOW.md`, `docs/CONTENT_AND_RIGHTS.md`,
`docs/EDITORIAL_STANCE.md`, `docs/SECURITY.md`, `docs/RELEASE_STABILITY.md`,
`docs/HENRY_V2_OPERATIONS.md` and `docs/DAILY_RUNTIME_OPERATIONS.md`. Canonical
recovery and current checkpoints may be ahead of this clean worktree. Do not copy
the dirty canonical checkout or adopt its unreviewed changes as runtime code.

## Observed baseline and work-order boundaries

The recovery order's October 10 authenticated measurement is 3/8 devotionals,
0/8 complete Henry layers, two future devotional days and zero complete future
days. This is incident evidence, not a new health measurement made by this worker.
The saved local automation definitions were read without modification:

| Existing automation name | Eastern schedule | Saved coordinator | Observed state |
| --- | --- | --- | --- |
| Prepare Daily Bible Reader T+7 - Cortan | 03:00, 15:00 | gpt-6-astra/high | ACTIVE |
| Backfill Daily Bible Reader Henry | 05:15, 17:15 | gpt-5.6-terra/low | PAUSED |
| Backfill Daily Bible Reader Henry Luna fallback | 07:25, 19:25 | gpt-5.6-terra/low | PAUSED |
| Review and publish Daily Bible Reader Henry | 08:15, 20:15 | gpt-5.6-terra/high | ACTIVE |

These coordinator settings do not prove which child authored a Henry packet.
WO-1 owns the approved move to `gpt-6-luna`, CLI preflight, model configuration,
transport classification, expiring ownership, retry ceilings, bounded Henry drain
and runtime repin. Its released interface and installed proof must be consumed,
not reimplemented in WO-3. No second Henry model is automatically authorized.
WO-2 owns the additive `preparation-status/v1` heartbeat contract, its four lane
receipts and `service-buffer/v1` measurements, status helper and frontend evaluator.
WO-3 supplies validated observations to that contract; it
does not fork thresholds, rewrite `app/frontend/app.js`, or compete for those
files. WO-4 owns historical documentation cleanup. Its current checkpoint can
replace old narratives without changing this plan's invariants.

Proposed new ownership is concentrated in `scripts/service-supervisor.mjs`,
`scripts/lib/service-supervisor*.mjs`, `schemas/service-supervisor*.schema.json`,
`tests/service-supervisor*.test.js`, two new thin prompt files, and an immutable
supervisor installer. Narrow adapters call the accepted daily/Henry/status
interfaces. Changes to old launchers, schemas or package scripts are coordinated
with their owners after rebase. Each stage records its exact accepted revisions
and supported interfaces in a private installation receipt.

## Runtime and durable authority

Run from a pristine, manager-installed immutable release with locked dependencies
and the four existing verified private-store junctions. An absolute stable launcher
verifies the release manifest and current pointer before importing code. It never
executes source from the dirty canonical checkout, fetches a floating revision at
each wake, creates an empty replacement private store, or installs packages while
processing a reading. Compatible upgrades switch the installed pointer last while
no old writer, author session or connector transaction is active.

Store private supervisor state under ignored
`private-content/automation/service-supervisor/`: hash-linked append-only events,
immutable inputs/results, private automation inventory, fenced leases, connector
transactions, health observations and migration receipts. Rebuilt indexes are
caches. Henry v2's existing event history remains authoritative for its candidate
attempts, accepted packets, review and approved artifacts. The supervisor records
references/hashes to that history instead of maintaining another Henry budget.
Daily jobs receive equivalent reservation, immutable result and approval records.
No public document contains actual Google IDs, reader credentials, research notes,
commentary, source extracts, execution logs or automation exports.

Use separate preparation, review and publication locks with a short global event
append lock. Never hold the global lock through a model or connector call. A
lease includes run ID, owner role, process-start identity, expiry and monotonic
fencing epoch. Every callback verifies the current epoch before advancing state.
An expired lease is recoverable only after its process has exited or has been
boundedly stopped and confirmed absent; expiry alone must not create two writers.
An uncertain live process blocks that resource visibly. Honor WO-1's ownership
expiry of at most 24 hours and its tighter session deadlines. A reviewer may work
while an author runs; only one publisher may change the shared manifest at once.
All legacy managed publishers must participate in that publication lock before
enabling mixed-mode rollout.

## State machine and execution loop

Run states are `starting`, `observing`, `executing`, `awaiting_connector`,
`budget_exhausted`, `blocked`, and `finished`. `finished` has an explicit outcome:
`healthy_noop`, `verified_progress`, or `handoff_pending`; only the first can imply
a healthy unchanged service, and only when full fresh health passes. Process exit
zero is not evidence of service readiness. Technical blockers remain blockers,
while `approval_required` identifies a precise unresolved decision outside the
standing authority or a real approval denial.

Each daily/Henry component follows this lifecycle:

| State | Deterministic next action and exit condition |
| --- | --- |
| observed_debt | Verify plan scope, input and existing artifact; reuse valid output or queue a bounded action. |
| queued | Run accepted capability/billing/source preflight, reserve budget and acquire fenced ownership. |
| authoring | Dispatch the exact schema contract once per reservation; persist raw result before admission. |
| admission | Apply strict local validators; accept, use a permitted bounded repair, or record scoped debt/blocker. |
| review_pending | Preparation cannot approve; independent review selects the exact immutable basis. |
| reviewing | Validate reviewer execution and findings; source-bound approval or bounded changes_requested. |
| approved | Recheck approval hash and latest eligible library; stage the one-reading publication bundle. |
| publishing | Journal content uploads/readbacks, fresh-manifest merge and pointer-last promotion. |
| verification_pending | Obtain exact manifest and payload readback, then authenticated named-reading health. |
| published | Commit a genuine bound receipt; only then select a new contiguous daily gap. |
| debt / blocked | Preserve all work and fallbacks; record error scope, retry eligibility and explicit resumption predicate. |

`publishing` and `verification_pending` always reconcile first after interruption;
they never imply reauthoring. `changes_requested` invalidates the old approval for
its changed basis. Corrections preserve originals and use existing Henry limits;
they cannot grant new author attempts. Already published content is not repeatedly
regenerated because the supervisor is restarted.

Conceptual interface (to be implemented, not commands available today):

```text
service-supervisor tick --role preparation|review-audit
service-supervisor resume --handoff <opaque-token> --receipt <confined-file>
service-supervisor status
service-supervisor audit --fixtures <confined-test-input>
```

`tick` performs preflight, intake/reconciliation, fresh observed health, EDF
selection, dispatch/admission or review, bundling and heartbeat staging in code.
It continues internally until budget, a role boundary, failure or a connector
operation requires yielding. Its schema result contains only an enumerated
action, safe outcome, handoff token and exact confined instruction/receipt paths.
`resume` validates the expected handoff and observed bytes, records the event and
continues the same loop. The automation does not choose the next reading, infer
retry eligibility from stderr, manufacture approval or decide which manifest to
upload. Startup failure handling in the stable launcher stages a safe status if
the main supervisor/helper cannot load; if connector publication also fails, it
reports that delivery failed and never claims an in-app notice exists.

## Daily plus Henry earliest-deadline-first selection

Derive civil dates in `America/Detroit` from the accepted complete active calendar,
not host UTC midnight, source reading numbers, or a test clock. Deadline is the
reading's Detroit start of day. Recompute today/T+7 on every selection and before
dispatch/promotion, including a wake that crosses midnight or DST. A changed plan
identity invalidates dependent work rather than silently retargeting it.

Build one work graph from the actual manifest/payload observations, `study:next`,
the accepted Henry debt selector, pending review and unfinished publication.
Order runnable nodes by `(schedule date, phase rank, stable reading ID)`; phase
rank within one date is reconcile uncertain publication, publish approved work,
independent review, missing/stale daily study, then Henry packet preparation.
Dependencies override phase rank. The review role selects only review/publication
nodes; preparation selects authoring and already-independently-approved publication
nodes. Author session continuation may finish its bounded current packet before
reselection; a new later reading never preempts an earlier runnable node.

A missing daily study must extend only the exact next contiguous prepared prefix.
Henry may prepare the same authorized daily reading's verified source packet, but
cannot publish a metadata pointer before the daily base exists. A daily study can
publish with an honest validated full-Henry fallback while independent Henry work
waits. Unpublished later daily drafts do not enter a manifest-backed snapshot.
When today's Henry is blocked by its bounded author budget, WO-1 may mark that
component as retained fallback debt and advance another eligible Henry reading.
This never clears the blocker or invents substitute prose. Configuration/model
unavailability blocks that model's dispatch globally; independent daily work and
review of previously generated artifacts may still progress.

Stop the daily recovery drain at its first daily research/review/validation or
publication failure; do not skip a broken prefix. Every successful one-reading
promotion/readback/named-health cycle must reevaluate before taking another gap.
No historical generation or protocol refresh is scheduled until the full forward
horizon is genuinely healthy. Manager acceptance retains the already-authorized
historical backlog/protocol selectors afterward, under their original cooldowns,
scope, review and publication bounds; consolidation must not strand that backlog.
No new long-term plan or enlarged generation scope is authorized.

Proposed initial preparation ceiling: 90 minutes total, at most three distinct
reading work orders per wake, and at most 32 Henry submissions across that wake.
Each Henry session retains its existing 60-minute ceiling and per-packet initial
plus one-repair allowance; take the smaller remaining cap at every dispatch.
Daily research, synthesis and review each permit one initial response plus one
distinct validation-guided correction for the same bound input, provisionally
20/20/15 minutes per call, within the run deadline. Review/audit ceiling is
90 minutes and at most three reading reviews/publications. Reserve five minutes
for health/status and stop initiating long work before that reserve is consumed.
These are manager-reviewable limits, not authority to increase existing budgets.
Durable reservations precede spawn; timeout/crash/restart does not refund them.
Reuse accepted output, and report remaining deadline/budget from code. A large
reading may span wakes. Published-per-wake throughput is measured, never promised.

## Bounded Codex research, author and review contracts

Use only the existing ChatGPT-authenticated local Codex subprocess route, never an
SDK, API gateway, paid proxy, `exec-server` API integration or API-key fallback.
Before any probe or model dispatch: verify the regular executable/version/hash,
the installed configuration/provider route, and `codex login status` under the
same sanitized environment. Require ChatGPT login and fail closed on unknown or
API billing. Remove API credential overrides (including `OPENAI_API_KEY` and
`CODEX_API_KEY`) and inspect effective provider configuration without dumping
credentials. Pin ChatGPT-only authentication for this local invocation where the
installed CLI supports it, without changing global settings. Included subscription
usage and already-owned Codex credits are allowed; never purchase/top up credits,
enable recharge or switch accounts. Quota exhaustion leaves resumable debt.
The transcription-only user key is never read or used for this service.

The repository already implements `exec --model`, explicit reasoning configuration,
`--json`, `--output-schema`, `--output-last-message` and stdin prompts. Official
[non-interactive documentation](https://learn.chatgpt.com/docs/non-interactive-mode)
describes schema-bound final outputs and reuse of saved authentication; official
[authentication documentation](https://learn.chatgpt.com/docs/auth) distinguishes
ChatGPT subscription access from billed API-key access. Neither establishes this
machine's model availability; WO-1's authenticated capability proof is required.
Revalidate flags against the accepted installed CLI before activation. Do not copy
documentation examples that disable approvals or supply API credentials.

Every contract binds schema version, task ID, reading ID, exact passage scope,
input SHA-256, prompt version, assigned model/effort and dispatch reservation.
Code computes identifiers/hashes/provenance; returned values must match, never
authorize another destination, path, command, model, budget or publication. Use
`additionalProperties: false`, length/item ceilings and strict local schema
validation even if transport uses a compatible reduced schema. Child events must
show real completion and permitted tools only; JSON-looking prose or exit zero
does not establish completion. Preserve raw outputs privately, reject malformed,
truncated, unexpected tool, missing or tampered output, and never extract commands
from generated prose. Invocation uses argv with stdin, no shell interpolation.

| Contract | Input and output | Tools / acceptance |
| --- | --- | --- |
| daily-research/v1 | One work order, public references, verified allowed source inputs and editorial contract; output source records with actual access evidence, inclusion proposals, claim/evidence map, coverage limits and unavailable works. | Lawful web consultation only where capability is proven; shell, apps, MCP, other agents and publication disabled. Consulted status requires actual opened source/tool evidence, not snippets or invented hashes. |
| daily-synthesis/v1 | Verified research bundle, cited lawful notes, one passage scope and page-shape contract; output full private draft metadata, Markdown, claims/source associations, component assessments and coverage. | No tools; primary daily author evaluates/synthesizes/edits, never the Henry author. Existing commentary/source/private validators plus direct review apply. |
| henry-author | WO-1's current verified MHC 2.2 packet/instructions and existing candidate schema; output only verse sentences/evidence IDs. | Existing restricted author adapter; complete ordered verses, evidence scope, source hashes, required identities, copy-risk and budgets remain code gates. `gpt-6-luna` at the accepted configured effort; no alternate model. |
| independent-review/v1 | Exact daily or Henry review basis, all source evidence including omissions, original candidates and corrections; output approved/changes_requested/blocked, bound findings and required assertion results. | Fresh reviewer invocation/run identity distinct from the author; no connector, shell, apps or nested workers. Approval is a verified reviewer event, never an author self-label or mechanical check. |

Manager acceptance specifies `gpt-6.1-sol`/high for new daily research/synthesis
and substantive independent-review subprocesses. Substantive evidence assessment
warrants high effort under the general-purpose delegation policy. Preserve existing
automation coordinators until manager stage-D migration. Do not use the Henry
author for main commentary. The October 10 architecture explicitly
requests bounded Codex research/synthesis steps; stage acceptance must reconcile
`AGENTS.md`, the daily skill and saved prompt's older “primary task” wording with
that role before child dispatch is enabled. This is a named architecture migration,
not implicit authority for arbitrary delegation or transfer of private user data.
Stage A can ship while primary daily authoring continues under its existing rules.
No research subcontractor, nested child or new user-visible thread is added here.

Research may consume only lawfully accessible reading-specific material. Exclude
credentials, private Google IDs, reader comments/emails and Scripture transcription
from every child packet. Lawful modern-source notes stay private; do not transmit
raw personal libraries or bulk source texts under Henry's public-domain approval.
Public source leads can be discovered by bounded web events, but code validates
their recorded provenance and a substantive reviewer assesses independence,
meaning, rights and theological weighting. If the accepted CLI cannot provide
auditable lawful consultation, block that automated research route explicitly;
never pretend a tool-free model researched the sources.

Review/audit retains the existing independent reviewer automation identity and
saved model/effort unless the manager accepts an explicit policy-compliant change.
If a reviewer subprocess is used, specify its model and effort from the accepted
role config, validate them against delegation policy, and never inherit the parent.
The saved Terra reviewer is an existing lane, not authorization to choose Terra
for new delegates. A new substantive reviewer subprocess may use Sol 6.1/high
under the manager's explicit stage acceptance. Record that choice
and reason in the installation packet, and keep author and reviewer sessions
separate. No autonomous Astra xhigh/max escalation is permitted.

## Deterministic gates and failure classification

Keep schedule/horizon/prefix checks, source-module verification, exact verse scope,
schemas, citation referential integrity, source access evidence, rights flags,
ESV/secret exclusion, content hashes, review bindings, immutable library selection,
attempt/deadline/lease controls, repository safety, bundle validation, destination
checks, byte readback, manifest preservation and actual health in code. Editorial
truth, omission, prose quality and responsible theological weighting require
substantive source review; passing a schema never replaces it.

| Failure | Supervisor decision |
| --- | --- |
| Unsupported model, provider 4xx, newer-CLI requirement, missing executable/helper or invalid route | First failure blocks affected capability with WO-1's configuration classification. No transport retry or claimed normal completion. |
| Genuine temporary transport failure | Reuse WO-1's ceiling of two consecutive checkpoints and ownership release; bounded retry uses a new recorded execution key, never replays an uncertain dispatch. |
| Started dispatch with no certain terminal result | Reconcile process/events/output; retain reservation. If evidence remains uncertain, block, never resubmit blindly. |
| Invalid candidate or semantic review rejection | Only remaining bound repair allowance; exhausted work stays debt/editorial attention with original bytes preserved. |
| Source/hash/schema/approval corruption | Block dependent artifact; no fallback model, false consultation or weakened validator. |
| Real host/connector approval denial | Preserve exact failed stage privately, publish safe approval_required if possible, and report genuine status-delivery failure. No policy bypass. |
| Busy ownership across wakes | WO-1's expiry/two-wake escalation; healthy in-process work is pending, an unrecoverable stale owner is red. |
| Budget deadline or eligible quota limit | Checkpoint reusable work with a definite eligible wake/resumption predicate; not published, not ready, no API fallback. |
| Connector timeout or manifest conflict | Reconcile exact operation/readback under publication fencing; no blind second create/update and no wholesale stale-manifest rollback. |

Every blocker records scope (`global`, role, reading, packet, or transaction), safe
code, first/last occurrence and concrete clearing condition. A fresh healthy audit
cannot clear an unresolved error in another role. Unexpected exit, tool denial and
configuration errors do not become “normal completed coordinator outcomes.”

## Connector publication as a resumable protocol

Node has no Google credentials and does not call Drive directly. The outer Codex
automation loads the supervisor's verified handoff and performs only its next
operation using the existing connected Google Drive tools and current destination.
At implementation time use the connected Drive skill for actual operations.
Supervisor instructions are derived from local trusted inputs; generated author
content cannot insert an operation. One connector operation is outstanding at a
time, with immutable intent, transaction ID, operation ordinal, lease epoch,
expected bytes/length/hash, private destination binding and approval basis.

The outer loop remains thin: execute returned operation, preserve raw connector
result/download bytes in the confined receipt path, call `resume`, repeat. Code
validates results against intent and performs all state advancement. Connector
IDs remain inside ignored handoffs, never public stdout. Destination ownership,
parent/root and unchanged restricted permissions must be checked using existing
trusted configuration; no new folder, sharing change, scope or service account.
Immutable one-reading versions in the established store are allowed publication,
not a new destination. Never use connector normalized text as exact-byte proof.

Publication states and restart behavior:

1. **Stage** the exact independently approved one-reading bundle and snapshot;
   resolve the newest checksum-bound reviewed Henry artifact or honest fallback.
   Validate source/private/schema/rights/safety and existing full publication gate.
   Newly extending daily candidates use strict validation; Henry-only changes use
   the exact manifest-backed snapshot and preserve unrelated unfinished drafts.
2. **Upload content first**, one immutable file/version per intended artifact;
   re-fetch raw bytes and compare hash, length, JSON parse and content binding.
   After a timeout, identify the matching intended version using recorded result
   evidence and exact bytes. If identity cannot be resolved, stop visibly instead
   of issuing a duplicate create. Reuse proven versions after restart.
3. **Fetch fresh manifest** immediately before promotion. Compare raw bytes and
   parsed deep equality to the canonical mirror, record changed field paths, and
   reconcile harmless formatting differences to live bytes. Preserve all unrelated
   pointers and the newest WO-2 status fields. A changed same-reading review/base
   requires renewed validation; never automatically merge two editorial versions.
4. **Prepare pointer-last update** under the shared publisher lock and fenced
   lease, changing only the named reading and its required plan/config/registry
   pointers or status fields. Prefix extension is exactly one contiguous reading.
   Recheck scope/approval and fresh baseline; bounded unrelated semantic changes
   may rebuild the candidate against new live data, but retry cap is two rebases.
   A same-reading conflict or continued churn becomes blocked.
5. **Read back exact manifest and payload** before any completion event. If
   interrupted after update, test whether the intended pointers already exist and
   resume verification. Never interpret a create/update response as proof.
6. **Run authenticated named-reading health** through the existing server path,
   checking devotional components and the attached Henry result. A daily fallback
   must report debt; Henry publication must report complete and match its approved
   artifact. Commit the genuine receipt and reconcile the existing Henry job.
7. **Reevaluate**, then run full `service:live-health` at wake end and whenever no
   runnable forward debt remains. Persist/publish observed coverage even if
   incomplete. Only its complete devotional-plus-Henry result can set ready.

The existing Drive connector does not supply a demonstrated atomic compare-and-
swap for the manifest. This protocol serializes all managed writers and performs
immediate pre/post readback; it must not claim immunity to an outside editor's
simultaneous write. Unexpected external changes stop promotion/recovery for
reconciliation. A genuine bad promoted reading requires rollback of that reading's
transaction against the freshest manifest, preserving unrelated later changes.
Never restore a whole stale manifest blindly. Later horizon gaps are not evidence
that a previously verified reading is corrupt. Final-horizon failures trigger
the existing recovery/rollback policy after determining which promoted artifact
actually failed; do not erase valid publications to make a report look green.
A revoked approval fences in-flight publication before any next connector write.

## Heartbeat, actual health and paused-lane detection

Consume WO-2's final schema/evaluator and `service-buffer/v1` semantics. Preserve
`schemaVersion: preparation-status/v1` and its exact lane keys: `daily`,
`henry_primary`, `henry_recovery`, `review`. The two automation roles are execution
owners, not replacement public lane keys: preparation reports its daily and
primary-Henry component outcomes; review/audit reports review. Record recovery
only when the accepted recovery path actually runs; a retained paused automation
must not manufacture a successful recovery receipt. Use the helper's optional
`--heartbeat` receipt with `lane`, `lastOutcome`, `lastErrorCode` and `buffer`.
Its allowed outcomes are `running`, `success`, `no_op`, `blocked`, `error`; map
internal pending/budget states to those enums without inventing publication.
Pass `serviceBufferReport` output intact: its reading IDs, effective date, target,
consecutive devotional/complete counts, future-day counts, fallback IDs,
devotional/Henry gaps and `measurementComplete` supply the measured contract.
Do not replace that report with counters inferred from the local job queue.
`success`/`no_op` advance the helper's `lastSuccessAt`, so supply them only after
the required role gates pass; overall service ready remains separately gated.
Every run,
including clean no-op, records `lastRunAt`; only successfully completed required
gates advance `lastSuccessAt`. Per-role `lastAttemptAt`, `lastOutcome`,
`lastErrorCode` and measured buffer counts are merged without erasing the other
role's newer observation or unresolved blocker. Preserve the reader's combined
manifest/payload decision: later payload observations cannot hide a manifest gap.
Track observation time, source
manifest hash and measurement completeness privately; unknown/stale measurements
must not acquire healthy counts. Henry fallback is not a complete verse layer;
book introductions use the accepted component rules, not invented chapter tests.
Count consecutive complete future days from tomorrow, rather than scattered
prepared entries or today's devotional membership.

WO-2 owns these requested warning rules: green at least five complete future
days with heartbeat under 30 hours; amber at three/four days or any Henry fallback;
red at at most two days, heartbeat older than 30 hours, or an unresolved explicit
service/approval block. Red overrides amber/green. Boundary, missing heartbeat,
unknown-health and terminal-plan behavior must share WO-2's tested decision.
`ready` still requires the entire actual target, not merely green's five-day
threshold. Safe details go to Dustin, short actual-condition copy to Shane.

At startup and before finish, inspect the saved definitions for the exact privately
mapped BibleApp role IDs. Compare actual status, schedule, project, model/effort,
prompt/runtime digest and last observed execution with the manager's migration
baseline. Parse TOML using an installed local parser or a tested strictly bounded
format; do not run TOML as code, infer membership from a broad name match, or edit
automation files. Record `AUTOMATION_UNEXPECTEDLY_PAUSED` as a red service block
when a role expected ACTIVE is paused/missing. A missing/unreadable inventory or
drift is an explicit health-unknown/configuration block. Publish through the same
fresh-manifest status protocol; never silently resume/edit an automation.

The two current Henry pauses are intentional until WO-1 installation and approved
preflight; do not report those exact baseline pauses as an unexpected failure.
After consolidation their expected state remains PAUSED as retained rollback
definitions. Daily/review remain ACTIVE; installation needs a proven idle window
and fenced routing without bypassing writer guards. Record a private maintenance
receipt with the known next scheduled wakes. A past proposed temporary daily
pause was rejected by automatic approval review; do not retry it indirectly.
Manager-coordinated permitted Henry consolidation pauses need an explicit private
bounded maintenance record and expire; they must not permanently suppress red.
If both active automations or the PC stop, no process can publish new status. The
reader's independent >30-hour heartbeat-age check is the only remaining signal.
Keep that limitation explicit. In-app notice only: no email, MailApp scope,
backend timer, OS scheduler, global watchdog or unrelated automation mutation.

## Two thin Codex-owned automations

Update the two existing daily/reviewer definitions in place; retain the two Henry
definitions paused for rollback. No duplicate recurring task or new credential.
Keep the preparation schedule 03:00/15:00 and independent review/audit schedule
08:15/20:15 Eastern initially, preserving the user's reduced-volume preference.
The preparation automation owns both daily and Henry author work under EDF and
can publish previously independently approved artifacts; review/audit performs
fresh independent review, publication/recovery, combined-health measurement and
heartbeat even when its queue is empty. Preparation never approves its own output.
Supervisor cannot change saved automation definitions; BibleApp Manager owns them.

Proposed saved prompts (absolute launcher/config paths supplied privately at install):

> Preparation: Run the accepted BibleApp supervisor's preparation tick. Execute
> only its verified connector handoffs through the existing Drive connector,
> preserve the exact receipts, and resume until code returns its final outcome.
> Honor SERVICE_AUTHORITY and the installed spending/privacy/release restrictions.
> Do not select readings, retry models, alter budgets/automations, or self-approve.
> Report only verified progress or the specific block; archive healthy unchanged
> completed executions only after durable receipts are saved.

> Review/audit: Run the accepted BibleApp supervisor's review-audit tick. Maintain
> independent review and execute only its verified existing-Drive handoffs, saving
> exact receipts and resuming until final outcome. Preserve SERVICE_AUTHORITY and
> the installed spending/privacy/release restrictions. Audit heartbeat and actual
> complete buffer even with no review work. Report new failures, required action
> or worsening coverage; archive healthy unchanged completed executions only after
> receipts are saved. Never alter other automations or invent publication proof.

Long source/editorial contracts are pinned files loaded by code, not copied into
12–17 KB automation prompts. Do not archive actual blocks or pending approval.
Successful unchanged maintenance stays quiet. Avoid promising that all host-tool
approval reviews disappear: consolidating mechanics into code reduces calls but
cannot override real per-command or connector enforcement.

## Independently releasable delivery stages

| Stage | Deliverable and activation | Acceptance and rollback |
| --- | --- | --- |
| A: observed state and execution kernel | New journal, role/lease locks, deterministic outcomes, shared WO-2 heartbeat adapter and read-only EDF shadow report. Existing four lanes still perform accepted work; no new authors/connector writes except accepted status protocol. | Fabricated Oct 3–5 sequence uses WO-1 classification and becomes visible blocked in one wake; shadow result matches live debt. Disable new entry point and retain existing lane pins. |
| B: exact connector executor | Supervisor builds/validates one-reading transactions, accepts exact connector receipts and drives publication/recovery in daily/review outer tasks; all managed publishers use the same lock. Existing authoring persists. | Interrupt at every upload/pointer/readback boundary; resume once without regeneration or duplicate publication. Fresh-manifest concurrency fixtures and real approved named-reading readback pass. Revert publisher routing, reconcile outstanding transaction first. |
| C: bounded author/reviewer execution | Accepted WO-1 adapter plus daily schema research/synthesis and independent review executor; code owns dispatch/budgets/admission/repair and role separation. Enable new path per role, initially cap one reading, then accepted cap three. | Fake executables prove route/key/model gates, budget persistence and tool limits with no paid calls; manager-approved ChatGPT-only probe and one existing authorized real reading prove installed path. Roll back role routing; preserve accepted outputs/budgets and use compatible existing review/publisher. |
| D: consolidate two automations | After A–C installed and factual health verified, manager updates existing daily/reviewer prompts and accepted pins, pauses the two legacy Henry definitions and activates the two mapped roles. Retain original four definitions privately. | Saved-state readback, installed arbitrary-CWD launch, fresh actual health, next scheduled wake and seven-publication trial. Restore compatible four-lane definitions/pins and state as described below. |

Each stage can be committed, installed and operated without enabling a later stage.
Stage A is diagnostic scaffolding, not a claim the completed supervisor exists.
Stage B/C cannot be called delivered if a prompt still selects retries, bundles or
failure classes. No stage becomes a service-ready claim merely by returning exit
zero. WO-1 release/proof and WO-2 contract acceptance are dependencies before their
interfaces activate. WO-2's shell-visible release retains its installed-iPhone
gate; this worker cannot waive that gate while shipping backend-only tooling.

## Manager release, migration and rollback inventory

Before every coordinated release: inspect clean diff, fetch/rebase `origin/main`,
resolve conflicts without dirty-canonical overlays, run repository safety before
staging/building, run `npm run check`, and fast-forward-only push after manager
sequencing. Verify CI and exact accepted installed code/config/dependencies.
Backend/tooling-only stages should leave public asset bytes unchanged; any changed
reader/backend artifact invokes the full build/Pages/canary/live-byte/browser gate
and applicable installed-iPhone gate. Preserve all `web/releases/` directories,
generated line ceilings and immutable version-23 USER_ACCESSING rollback. Never
repoint production to a token version. Normal private publication does not deploy
the reader shell.

Manager saves this private inventory before mutation, then reads it back:

| Inventory item | Preserve and verify |
| --- | --- |
| Four BibleApp definitions | Exact automation ID, name, kind, schedule/timezone, local project, model/effort, status, prompt bytes/digest, notification policy and installed launcher/config. Save both incident baseline and post-WO-1 accepted four-lane rollback baseline. |
| Non-BibleApp definitions | Before/after read-only digests and status inventory; all remain as the user left them, currently paused. Never batch-edit by project inference or change an unrelated schedule. |
| Runtimes | Daily, Henry, publisher and supervisor exact revisions, release/config manifests, pointer bytes, executable version/hash, accepted interfaces and private-store junction targets. Retain every prior release. |
| Durable work | All Henry events, sessions/reservations, author results, source/review bases, approvals, transactions, receipts and supervisor events; append compatibility mappings, do not rewrite history. |
| Publication/service | Fresh raw private manifest and payload proofs, unchanged restricted access, last good status/health observation, existing rollback release/version; backups remain private. |

Migration sequence is manager-owned:

1. Install/revalidate WO-1 and prove the exact approved Henry route before resuming
   any Henry author. Keep non-BibleApp definitions unchanged. Record the accepted
   four-lane rollback snapshot, which may differ from October 10's incident state.
2. Install each accepted supervisor stage side by side. Shadow audits are read-only;
   production state mutations start only on the accepted fenced adapter route.
   Validate existing private stores and retained legacy review recovery.
3. For consolidation, keep daily/review ACTIVE and use a bounded known scheduler
   window plus fenced routing. Drain/reconcile active sessions and connector
   transactions. Refuse installation while any writer or uncertain dispatch
   remains active; a scheduled wake invalidates the idle-window proof. Pause only
   the two Henry definitions during the separately accepted two-role migration.
4. Update only the existing daily and reviewer definitions with private absolute
   launchers and the two thin prompts. Preserve their named project, schedules and
   coordinator models unless an explicit accepted change is recorded. Keep legacy
   Henry definitions PAUSED and bind the new expected-status map before resuming.
5. Activate review/audit first to reconcile/review retained work, then preparation.
   Re-read actual definitions and launch both accepted installed roles. Verify
   heartbeat/status readback and authenticated actual buffer; report any gap.
6. After the next scheduled preparation/review wakes, verify real events and live
   counts. Continue the seven-publication trial and record throughput/latency,
   retries, semantic corrections and stop causes; no unrelated wakeups/alerts.

Rollback is a controlled routing change, not deletion or restoration of old content:

1. Pause the two new BibleApp roles, fence/drain active execution, reconcile any
   manifest update whose outcome is uncertain and publish a factual safe block.
2. Disable supervisor dispatch with the retained installation pointer/config.
   Never install v1 over v2 jobs or reset attempts. Export a compatibility report
   showing how each pending daily/Henry job, review and publication maps to the
   accepted four-lane interfaces. If a new job cannot be safely represented, retain
   it parked under its event history and run only compatible old-role actions;
   do not replay it. Stage C's release requires this round-trip fixture in advance.
3. Restore the four definitions in place from the **post-WO-1 accepted rollback
   snapshot**, including exact schedules/prompts/models and compatible runtime
   pins. Do not restore unsupported Spark or outdated Luna simply because an older
   incident export contains them. If no valid four-lane author capability exists,
   restore the incident operating state: daily/review active, both Henry authors
   paused, red factual Henry block. “All four restored” does not mean force ACTIVE.
4. Resume only roles whose restored expected state is ACTIVE and preflight passes;
   restore the matching role-health map. Preserve independent review, current
   published content, immutable Drive versions, comments/highlights and all old
   public releases. Compare non-BibleApp definitions to their exact before digests.
5. Run the installed preflight, exact pending-publication reconciliation and fresh
   `service:live-health`; publish observed heartbeat/coverage and report actual
   state. Rollback does not grant ready or erase the incident history.

## Validation and next handoff

Tests use conspicuously fabricated Scripture, source prose, references, IDs,
connector responses, automation TOML and fake Codex binaries. No test calls a real
model, Google write or separately billed API. Cover EDF ties/dependencies, civil
date/DST and midnight rechecks, prefix refusal, fallback debt, paused-role maps,
unknown/stale health, no-op heartbeat, cross-role merge, model 4xx versus timeout,
lease expiry with live process, two-wake ownership escalation, crash after budget
reservation, changed output/approval, review independence, interrupted raw-byte
readback, unrelated/same-reading manifest conflicts, denied connector action,
status-publication failure and stage-C four-lane round-trip rollback. Run the
installed launcher from an arbitrary CWD and verify source/config hash rejection.

Live acceptance uses only already-authorized existing destinations and the verified
ChatGPT billing route. Do not invoke a live model to discover billing or buy capacity.
Fresh authenticated `service:live-health` reports factual component coverage and
does not fetch/store ESV or comments. A manager must distinguish fixture success,
installed route proof, one real reading and sustained unattended operation.

- [x] Read recovery order, canonical service authority/checkpoint, worktree policies
  and current saved automation metadata; inspect existing adapters and health gates.
- [x] Draft executable lifecycle, contracts, connector recovery, stage boundaries
  and migration/rollback inventory for manager review.
- [x] Manager accepted plan and authorized stages A–D on October 10: new daily and
  reviewer children Sol 6.1/high, Henry WO-1 Luna, no additional workers.
- [ ] Implement/validate/release stages A–D with manager sequencing and exact pins.
- [ ] Verify next scheduled wakes and seven ordinary publications.

Stage A ea80c52 is released and installed; both arbitrary-CWD roles accepted the
four ACTIVE definitions and staged truthful status. Stage B adds immutable native
connector handoffs, raw readback, current-state approval/source/library fences and
verified health. Its release/install/one-reading acceptance is manager-sequenced;
continue Stage C bounded role implementation after that code release. Bind Henry
integration to the manager's installed ephemeral e9a2740 runtime and recaptured
ACTIVE inventory. Compatible post-WO-1 rollback remains a release gate. Stage
acceptance alone changes no automation state or live service readiness.
