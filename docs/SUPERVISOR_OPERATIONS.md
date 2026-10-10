# BibleApp deterministic supervisor operations

Stage A: installed observed-state kernel. The accepted full design and later
stage gates are in `docs/execplans/deterministic-service-supervisor.md`.
BibleApp Manager owns release sequencing, runtime activation and automation
definitions. Do not install this from a dirty checkout or point a scheduled
automation at a floating worktree.

## What Stage A actually does

The verified installed `tick --role preparation|review-audit` takes a fenced role
lease, reads the exact four mapped BibleApp automation definitions, measures the
authenticated current-through-T+7 app payloads, reads only forward Henry job
state, creates an EDF selection and durably stages a WO-2 status candidate.
`status` reads the verified event chain from any working directory. Hash-linked
event appends are authoritative; intermediate files do not become completion.
Installation and execution exclude each other. A live or unknown process retains
its lease even after expiry; only proven dead processes permit reacquisition.
Interrupted abandoned temporary files are ignored, never admitted as events.

Stage A does not dispatch an author, approve content, upload a candidate, update
the live manifest, alter an automation or deploy the reader. Its JSON always says
`published: false`. `handoff_pending` describes remaining work, never service
completion. A blocked notice is **staged locally**, not delivered to the app.
Drive delivery and readback belong to Stage B. Existing daily/Henry/reviewer
lanes keep their accepted production workflow until their manager-owned routing
change. Do not describe this stage as completion of the supervisor architecture.

The heartbeat uses WO-2's exact `preparation-status/v1`/`service-buffer/v1`
contracts and four lane keys. An unexpected pause in an expected-active lane is
blocked; a baseline-approved Henry pause remains intentional. A healthy reading
audit does not revoke an outstanding external service/approval block. No-op
heartbeat is staged only after fresh full-forward evidence. No paid API, model
probe, Scripture RPC, comment RPC or Google write occurs in Stage A.

## Installation inventory and commands

Dependencies: accepted WO-1 code/configuration and accepted WO-2
`scripts/lib/preparation-status.mjs` must be available in the named clean source
commit. The installer refuses a missing status helper. Locked Node 22+ is
required. This stage's runtime has no new npm dependency or credential.

Save the exact existing four role-to-file mappings in an ignored private JSON
file. `lane` values are `daily`, `henry_primary`, `henry_recovery`, `review`;
`file` is each existing automation's absolute `automation.toml` path. Use the
observed installed IDs; do not discover membership by a fuzzy name, map an
unrelated project, or copy private automation exports into Git. The installer
reads scalar/array JSON-compatible TOML fields, rejects duplicates/unsupported
format and captures status/schedule/project/model/effort/prompt digest privately.
The observed inline `target = { type = "project", project_id = "…" }` table is
parsed strictly, in either field order; absent/duplicate/unsupported targets block.
A changed project binding is drift even when CWD and prompt remain unchanged.
It never edits those definitions. Unexpectedly changed definitions after install
produce a configuration block instead of silently adopting the new state.

After manager sequencing, use the exact accepted clean commit and verified
canonical private stores. Example placeholders are not literal destinations:

```text
node scripts/install-service-supervisor.mjs
  --project-root <existing-canonical-project>
  --revision <accepted-40-character-commit>
  --inventory <existing-ignored-four-role-mapping.json>
```

The installer verifies clean HEAD and reads original committed blobs using Git's
binary batch interface; mutable working files are not release input. It verifies
the four canonical private-store directories, refuses active supervisor/native
writers, copies an immutable hash-addressed release and configuration, retains
the preceding pointer and switches `current.json` last. Daily and review remain
ACTIVE. Stage A installs only the observation runtime and leaves their existing
scheduled commands untouched. Manager records a bounded idle-window proof and
uses `assertNoWriters` before installation, because legacy publishers do not yet
take the new lock. A scheduled wake or active/unknown writer ends that window;
do not bypass a guard or infer safety from an expiring lease alone.

The installer returns the absolute stable launcher path. Save it privately and
verify through that path, including a working directory outside the repository:

```text
node <installed-absolute-launcher.mjs> status
node <installed-absolute-launcher.mjs> tick --role review-audit
node <installed-absolute-launcher.mjs> tick --role preparation
```

Each launch checks pointer/config hashes and every release file, then executes
the verified code. The code derives the canonical private roots from the verified
configuration rather than CWD. Private status candidates, original manifest
baseline hashes and receipts remain under
`private-content/automation/service-supervisor/state/runs/`; no connector ID or
private path enters ordinary tick stdout. Inspect those exact local records when
preparing the later publication handoff. Never upload a Stage A candidate blindly:
Stage B must re-fetch and merge the current live manifest before pointer update.

The runtime installer records the existing public assets but does not build or
publish them. No shell/backend identity or release pointer changes. Preserve
WO-2's installed-iPhone gate if its shell-visible release is in the same commit.

## Rollback and verification

Retain previous `runtime/pointer-history/<sha256>.json` and all releases, journal
events, Henry histories, candidate bytes, approvals and publication receipts.
The rollback command restores a **verified Stage A runtime pointer** only; it
does not restore or change automation definitions, private content or the app.

```text
node scripts/rollback-service-supervisor.mjs
  --project-root <existing-canonical-project>
  --pointer-sha256 <retained-prior-pointer-sha256>
```

Verify/drain active writers in a known scheduler window under manager sequencing;
keep daily/review ACTIVE. The command validates
the prior release/configuration/launcher before promotion, preserves the outgoing
pointer, fences installation, restores launcher/pointer last and appends rollback
events. Invalid/missing retained bytes fail closed. Do not reset the journal,
leases or author budgets, install v1 over v2 jobs, or restore unsupported old
models. Stage C/D require the separate compatible four-automation rollback in
the ExecPlan; this command is not a substitute for that migration.

Required release checks are repository safety before staging/build, focused
supervisor tests, `npm run check`, and unchanged public byte verification. The
suite uses fabricated health, source wording, automation files and private stores;
installed-launcher tests invoke `status` only, with no live credentials/models.
The installer can be exercised on an isolated fabricated clean Git commit.
Only a fresh installed tick against authorized existing stores proves live
observation compatibility. Only Stage B's exact Drive readback plus actual
authenticated named-reading/full-service health proves publication. Sustained
unattended reliability remains the seven-normal-publication acceptance gate.

## October 10 Stage A release evidence

Rebased onto released WO-1 `fe7bb36` and WO-2 `466058d`. All 14 supervisor
regressions and the combined `npm run check` pass: 508 tests, 43 schemas,
repository safety and exact public-byte verification. The real accepted WO-2
helper retains an unrelated lane error during a healthy preparation observation.
Selected frontend `844ce06fb805f5f4` / PWA `8fcefb5ae56b5def` stay unchanged;
the WO-2 unselected canary remains `26cd630fe1ea0afa`.

Manager verified the installed WO-1 models at 15:13 UTC and resumed both Henry
author lanes. Installation inventory must use that accepted post-WO-1 state,
including its current exact prompts, rather than an unsupported Spark incident
export. The manager's ignored four-lane rollback snapshot has SHA-256
`96efc14869542be95ce0de0436b1d50fc6f508a49167d375f186fd4e8fa9e0c4`;
its paths, resource IDs, prose and definition bytes remain private.

Stage A source `ea80c52` is released. Manager owns the bounded idle-window writer
proof/drain, exact clean source installation, installed status/observation proof
and release sequencing. The old backend still strips new heartbeat fields;
Stage B must distinguish exact private-manifest delivery from reader visibility
until WO-2's phone/backend gate passes. No fixture success changes live readiness.

Automatic approval review rejected a proposed temporary daily pause because it
contradicts the user's requirement that daily and review stay ACTIVE. No pause
was applied. Do not retry it through file edits, a different tool or an indirect
route. Stage B/C/D activation requires a proven drain, known scheduler window
and fenced routing while those two definitions remain ACTIVE. Pausing the two
Henry author definitions during the accepted two-role consolidation remains the
separate authorized migration step; preserve all writer locks and schedules.
