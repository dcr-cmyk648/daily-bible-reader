# Durable offline publication validation

This helper fixes loss of validation evidence when a reviewing chat or its tool
call ends during a long check. The observed October 12 Matthew 7 command combined
six gates in one PowerShell call, supplied no explicit tool yield, and returned
exit `-1` after 109,507 ms. The separate chat failure reported model capacity.
The npm wrapper itself has no timeout; the evidence does not identify an npm
timeout. Matthew 7 was subsequently recovered and verified. This repair neither
repeats that publication nor changes its review.

The helper starts a hidden detached Node worker and returns its run directory
and PID promptly. It executes only offline validation. It never invokes a model,
publishes to Drive, changes a native job, attaches canonical Henry records,
updates a bootstrap, or manages an automation. Successful offline validation
still leaves publication held for the existing exact-one publisher, immutable
versions, manifest-last write, exact raw readback, authenticated named health and
native published reconciliation.

## Independent immutable installation

The manager installs these two files from an accepted, checked Git commit into
a separate private helper release, preserving their relative paths:

- `scripts/publication-validation.mjs`
- `scripts/lib/publication-validation.mjs`

The helper is invoked by its absolute installed path, outside the unchanged
`63283db` daily workspace. Its manifest is independent of both the frozen daily
base plus two overlays and the accepted native Henry `dde81ae`/205-file release.
No daily or native repin is required. Installation and saved reviewer-prompt
changes remain manager steps.

The accepted helper manifest has `schemaVersion` equal to
`publication-validation-helper/v1`, the full 40-hex `sourceRevision`, and exactly
two `files` entries, each with its relative `path` above and actual byte
`sha256`. Pin the manifest's actual byte SHA-256 in the saved invocation.
Start, worker and status all verify the manifest and both installed files.
Do not use the manifest digest as a file digest or construct it from uncommitted
working-copy bytes. Preserve old installs and run receipts.

## Exact admitted request

The manager first completes ordinary independent review, approved native apply,
canonical attachment, prefix reconciliation and accepted workspace setup. It
then prepares a private `publication-validation-request/v1` JSON file with
these fields:

| Field | Required binding |
|---|---|
| `readingId` | Exact approved reading, already present in the published-prefix plan and manifest |
| `workspace` | Absolute existing isolated validation workspace; unchanged daily code and overlays |
| `workspaceCodeSha256` | Helper's complete code/dependency inventory fingerprint |
| `npmCli` | Absolute verified npm CLI JavaScript file, executed using the current absolute Node executable |
| `nodeSha256`, `npmSha256` | Actual byte digests of that Node executable and npm CLI |
| `artifacts` | Exact `{role,path,sha256}` file bindings described below |
| `privateTrees` | Exact `{role,path,sha256}` directory inventory bindings, including `henryLibrary` |
| `manifestReadingMapSha256` | SHA-256 of `JSON.stringify(manifest.readings,null,2) + "\n"` |

Every artifact path is absolute. Required roles are `approval`, `candidate`,
`content`, `manifest`, `registry`, `coverage` and `evidence`. `approval` is the
genuine current approved artifact and `evidence` is the genuine source/review
basis, rather than an invented approval or diagnostic. Add individually named
artifact/tree roles for other admitted source, native input, pointer/config and
work-order dependencies. Names must be unique. The five workspace roles bind
these existing paths:

- `candidate`: `private-content/bridge/celebration-y3q4/<readingId>.metadata.json`
- `content`: `private-content/bridge/celebration-y3q4/<readingId>.md`
- `manifest`: `private-content/private-manifest.json`
- `registry`: `research/working/bridge-source-registry.json`
- `coverage`: `research/working/BRIDGE_SOURCE_COVERAGE.md`

`henryLibrary` binds the exact verified library directory used by the ordinary
bundle builder. Its inventory includes all files, not just the current pointer.
Explicit root junctions are resolved; redirects below input-tree roots fail.
The complete validated prefix's Markdown and metadata are bound as well, so a
change to another prepared reading invalidates reuse. Missing plan readings,
wrong candidate reading/content hash and unreviewed candidate status fail.
Approval and evidence must name that reading, and approval must actually be
approved. Native v2 approvals must exactly match the candidate's attached runtime
records and the supplied evidence's input/review-basis digests. Daily approval
content/metadata digests, when present, must match the candidate files.
This mechanical request does not replace semantic independent review or confer
publication authority. Root must supply the actual approval and its dependencies.

The read-only `fingerprint --workspace PATH` command returns
`workspaceCodeSha256`. Its inventory covers `scripts`, `schemas`, `app`,
`config`, `fixtures`, `prompts`, `tests`, `web`, `node_modules`, `package.json`
and `package-lock.json`, including added/missing files. `fingerprint --tree PATH`
returns a private tree's `sha256`. Hash request, executable, artifact and helper
manifest **bytes** independently. Do not weaken the inventory to obtain reuse.

## Start and bounded polling

Use an absolute installed Node/helper path. Example variable names below stand
for the manager's verified private paths and actual 64-hex byte hashes:

```powershell
& $validationNode $validationCli start --request $validationRequest --request-sha256 $validationRequestSha --runs-root $validationRuns --helper-manifest $validationManifest --helper-sha256 $validationManifestSha
& $validationNode $validationCli status --run $validationRun --request-sha256 $validationRequestSha --helper-manifest $validationManifest --helper-sha256 $validationManifestSha
```

`start` launches just one validation worker; it does not wait for the six checks.
Retain its exact `run` path and reuse `status` rather than starting duplicate
workers. Keep tool calls short, using `exec_command` with an explicit short
`yield_time_ms` and polling any returned exec session. Do not recombine checks
in a long foreground command or wait more than 60 seconds in one tool call.
Status observes current evidence and returns immediately after local verification;
no model-generated final report is needed.

| CLI result | Meaning |
|---|---|
| start exit 0 | Worker launched; validation and publication still held |
| status exit 2 | Queued/running, fresh heartbeat and verified live worker where available |
| status exit 1 | Durable blocker; publication held |
| status exit 0 | All six gates and completion evidence verified for identical inputs; publication still held |

A passed receipt can be reused through status only while the same request hash,
helper pin, executable bytes, complete workspace code, approved artifacts,
private trees, entire manifest reading map, prepared prefix, gate logs, copied
bundle inputs/code and bundle
remain identical. Changing approved inputs requires a new admitted request and
run. Missing completion, negative/null exit, signal, launch failure, unknown
process identity, changed inputs or logs, killed/stale worker and deadline expiry
all fail closed. An earlier blocker always wins over a later success file.

## Gate sequence and deadlines

The worker runs the existing workspace commands sequentially, with a separate
durable start/result and private log for each:

1. `npm run validate:sources -- research/working/bridge-source-registry.json`
2. `npm run validate:private -- --require --manifest-backed`
3. `npm run validate`
4. `npm run safety`
5. `npm run check:published` — unchanged full check, manifest-backed private scope
6. `npm run bundle:private -- --manifest-backed` — private copy only

The Node/npm executables are absolute and hash bound. Environment inheritance is
limited to OS/process necessities and the fixed manifest scope; provider keys,
`NODE_OPTIONS` and model/billing overrides are not passed. These commands have no
live provider or model step. Check output streams directly to log files rather
than a bounded subprocess output buffer.

Default step deadlines are 3, 5, 3, 3, 15 and 5 minutes respectively, with a
35-minute total deadline, 5-second heartbeat and 45-second stale/startup grace.
The full published check can legitimately take more than three minutes and a
native fixture more than 100 seconds. These deadlines are helper-owned, explicit
and independent of the parent tool/chat. The production CLI accepts no arbitrary
commands, timeout override or alternate gate list.
The total watchdog includes hashing and snapshot creation and allows only a
15-second cleanup grace before terminating a stuck worker. Windows atomic file
replacement retries are bounded below one second and retain the previous complete
receipt; a persistent receipt-write error becomes a blocker.

The existing bundle script can synchronize attached Henry data. To prevent a
daemon from changing canonical attachments, its gate runs in a private copied
workspace with copied prefix, registry, coverage, manifest and pinned library.
The copied metadata must remain byte-identical after bundling. Any proposed
synchronization blocks validation for ordinary attachment/review handling outside
the worker. Copied code and all bundle inputs are verified before and after that
gate and again before reusing a passed receipt. The bundle remains private and
`approvedForPublication:false`.

## Durable evidence and interruption

Each private `PV-<uuid>` directory contains the exact `request.json`, pinned
`context.json`, `launch.json`, worker log, atomic `receipt.json`, six gate logs,
copied bundle workspace and final `completion.json`. Completion binds the final
receipt bytes, approved-input fingerprint and request digest. `status.json` is an
atomic observed status. The first atomic `blocker.json` persists a safe explicit
`STATUS FOR USER:` message even if the worker dies or cannot write its final
receipt. All returned statuses keep `publicationHeld:true`; only fully verified
completion returns `validationReady:true`.

Liveness uses actual Windows process creation time (Linux process start ticks),
not PID alone. Status detects a dead worker or expired heartbeat/deadline and
persists the blocker before attempting cleanup. Windows cleanup uses hidden
`taskkill /T /F` for identity-verified process trees, including an orphaned active
gate after worker death. Linux gate groups are detached and killed as groups.
Reused PIDs are never killed. Unsupported or unavailable process identity fails
closed. A hard-killed worker may leave a running receipt; status makes its blocker
durable rather than interpreting that receipt as successful.
Status also retains each attempted cleanup result, including failed termination.

Keep requests, mappings, logs, receipts, copies and bundles in ignored private
storage. They may contain private paths, IDs or validation diagnostics. Return
only safe status prose and artifact paths to the manager; never commit these
outputs or copy private data into `web/`. No recurring timer, resource, ACL,
automation definition or installed runtime is created by this helper.

Fabricated regression tests exercise detached launch/CLI polling, nested process
interruption and orphan cleanup, stale/reused PIDs, gate/signal/timeout failures,
mutated approvals/candidates/mappings/code/library, missing completion, changed
logs/bundles, bundle isolation and held publication. The manager separately owns
installation and actual live validation of existing approved Matthew 7; tests
do not duplicate its publication.
