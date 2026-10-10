# Deterministic supervisor private publication — Stage B

This stage adds the code-owned connector protocol to released Stage A. Manager
owns the exact resource bindings, reviewed release, installed runtime and genuine
one-reading acceptance. Fixture success, local approval and upload acknowledgement
are never a publication claim. Daily and review remain ACTIVE; use a known quiet
scheduler window and retain every existing writer guard. Legacy daily/review
publishers do not automatically acquire this journal's lock. Stage D owns their
eventual fenced routing; until then a Stage B live trial needs a proven drain and
fresh remote comparisons, without a rejected temporary daily pause workaround.

## Installation and existing resources

Install a clean accepted commit with the existing four-ACTIVE mapping:

```text
node scripts/install-service-supervisor.mjs --project-root <canonical project>
  --revision <accepted commit> --inventory <private four-role mapping>
  --stage B --resources <private existing-resource bindings.json>
```

The manager may add `--publication-input-root <existing validated publisher root>`
when approved content/metadata and registry live in the established publisher's
private input store. This root supplies only private input bytes; all executable
validation code comes from the immutable supervisor release. Approvals, native
jobs, source archive/library and canonical manifest remain at the canonical root.
Installation checks both roots for redirects. No floating checkout code is run.
Recapture the actual four ACTIVE definitions after the accepted e9a2740 Henry pin
update; use its retained accepted rollback snapshot, preserving the earlier one.

The private resource object contains `manifest` and `folder`. Each binds observed
`fileId`, `mimeType`, `parents` and `permissionsSha256`. Read metadata for the exact
existing manifest and content-version folder first. Preserve the existing MIME;
the real manifest is `text/plain`, not an assumed `application/json`. The folder
is `application/vnd.google-apps.folder`. No resource creation, sharing mutation,
permission tool, ownership change or alternate destination is reachable.

`permissionsDigest` binds actual observed user/group principal and role evidence.
The connector normalizes permissions and omits Google's permission IDs; use the
observed email principal when present, never fabricate an ID. Unknown principal,
public/domain sharing, absent permission evidence or changed parent/MIME/role
blocks. The normalized provider omits `trashed`; no synthetic false value is
inserted. A reported true value blocks. This provider visibility limit is backed
by exact raw readback and authenticated named-payload health, not a claim that an
omitted field was observed. Resource bindings and all principal evidence stay
private. Manager must validate the version folder's observed sharing separately.

Installer and rollback refuse any active, uncertain or health-pending publication
after the Node lease has ended. Drain/reconcile first; changing the runtime pin
never resets a transaction, attempt budget or lease. Pending transactions remain
bound to their original exact source revision. Stage A rollback cannot be used
to discard uncertain publication work.

## One code-owned operation at a time

The installed `tick --role preparation|review-audit` measures/stages a fresh
heartbeat and opens its delivery transaction, or returns the one pending handoff.
It does not generate or substantively review a study. Existing author/reviewer
interfaces remain until Stage C. An independently approved reading is started by:

```text
node <installed launcher> publication-start --role review-audit
  --request <canonical-private-relative publication-request.json>
```

The request is `supervisor-publication-request/v1`: one `readingId`, `component`
(`daily` or `henry`), canonical-private `approvalPath` and exact raw
`approvalSha256`. A protocol refresh additionally binds `workOrderPath` and
`workOrderSha256`. Code derives all artifact paths and version names, accepts no
caller-selected Drive ID, and snapshots exact approved bytes. Daily approval
requires distinct author/reviewer sessions, all substantive assertions and exact
content/metadata/registry hashes. Henry requires the existing independently
approved publishing-phase job, unchanged verified source input and exact approved
runtime attachments. Neither path marks an unreviewed candidate publishable.

Admission, every write dispatch, fresh manifest merge and final verification read
the current authoritative approval again. Henry reads the real hash-linked native
job, recomputes the current source input, hashes the raw archive and compares the
selected checksum-bound library artifact with approved runtimes. A changed library
catalog for another reading is harmless; replacement of this selected artifact
blocks. A read-only Genesis 14 check of these real inputs took 790 ms and changed
no canonical bytes. No stale-file shortcut replaces these checks.

Daily also requires the latest `daily_state` journal event for that reading:
`service-supervisor-daily-state/v1`, phase `approved` or `publishing`, exact approval
path/hash, content/metadata/registry hashes, distinct author/reviewer session IDs
and a confined, unchanged research-evidence path/hash. Stage C owns creation of
that substantive research/review record. A standalone approval JSON without this
current job cannot authorize Stage B daily publication. Revocation with unchanged
approval bytes blocks the next write durably and cannot refresh the attempt budget.

Admission uses an isolated release-code validation snapshot, derives a contiguous
private prefix, and runs the complete existing private source/content validator.
It never modifies canonical tracked fixtures or a floating publication checkout.
New daily publication extends the prefix by only its one immediately appendable
reading within T+7. Historical Henry is continuation of an existing approved native
job; historical protocol refresh needs its unchanged valid original work order.
Both require fresh fully complete forward health before historical writes. The
retained selectors and their original cooldown/budgets remain the only new
historical-authoring authority in Stage C; no new long-term plan is admitted.

Handoff stdout contains an exact private operation path, ID and SHA-256. Execute:

```text
node <installed launcher> publication-dispatch --transaction <id> --operation <id:ordinal>
```

This verifies immutable bytes/scope and records dispatch before returning exactly
one authorized tool and arguments. The outer task calls that tool once, saves the
complete native result under the transaction's `connector-results/` directory,
and asks code to construct the receipt:

```text
node <installed launcher> publication-receipt --transaction <id>
  --native-result publications/<id>/connector-results/<ordinal>.json
node <installed launcher> publication-resume --transaction <id>
  --receipt <returned state-relative receipt path>
```

Only `google_drive_get_file_metadata`, raw `google_drive_fetch`, immutable-version
`google_drive_upload_file`, same-ID manifest `google_drive_update_file`, and exact
reconciliation `google_drive_search` can be returned. Do not reinterpret paths,
edit approved bytes, select another tool/destination, improvise shell commands,
or combine operations. Maximum 32 operations, one read-transport retry per purpose
and two manifest rebases per transaction are durable bounds.

The raw fetch uses `download_raw_file:true, include_base64:false`. The observed
connector returns a scoped `file_uri`, not a local path or readable text. The
materializer accepts only that reference's matching `sediment` ID and bounded
`oaiusercontent.com/files/<uuid>/raw` origin. It follows no redirect and sends no
API credential/cookie. It copies the original byte stream into the private download
root, verifies provider length/limits and records SHA-256. This is retrieval of
the connector's returned file, not a direct Drive API or separately billed model
route. Signed references never enter stdout, a journal or Git. No inline base64
or normalized readable-text reconstruction is used.

## Publication and interruption behavior

Code checks manifest/folder metadata, fresh raw baseline and approval first. Every
content/metadata/registry/prefix version is uploaded into the existing folder,
metadata checked and downloaded as exact raw bytes before any pointer write.
Immediately before pointer mutation it fetches the live manifest again and merges
only the named reading/configuration and owning heartbeat lane, preserving other
reading pointers and lane errors. Same-reading/configuration conflicts block;
unrelated changes permit at most two fresh rebases. No stale whole-manifest rollback
is available. Connector files.update has no demonstrated atomic CAS: serialize
managed writers and retain the explicit outside-editor race limitation.

After pointer upload: unchanged metadata, exact candidate-byte readback, fresh
named-reading health, expected content/version/Henry runtime binding and actual
full-service measurement are required. Full forward readiness is independent of
one successful reading. The local mirror is updated only if its own baseline has
not changed. Henry's existing publication receipt is emitted only after those
proofs; it remains consumable by the original native controller.

A lost result returns `await_receipt`; dispatch replay is refused. Recover the
original operation/epoch and record an explicit `uncertain` receipt, then:

```text
node <installed launcher> publication-reconcile --transaction <id>
```

Unknown version creation is searched by the exact immutable name in the grounded
folder, then metadata/raw-hash checked. Missing/ambiguous search never creates a
duplicate. Unknown pointer mutation is reconciled only through metadata and exact
candidate readback, without another update. Definitive denial blocks. Post-pointer
errors retain reconciliation/health debt and never erase the remote pointer.
A terminal same-approval block cannot open a fresh transaction on the same source
revision and replenish publication attempts. Later observations surface durable
publication failures as a factual block; a changed review/code repair must be
explicitly accepted before a new attempt. Status delivery can still report that
block through its separate owning-lane heartbeat when the connector is available.
`publication-health` always re-fetches current remote metadata/bytes before a
health retry; old local delivery receipts cannot prove a newer remote state.

Result fields are precise: `manifestDelivered` and `heartbeatStored` describe
confirmed private bytes; `heartbeatDelivered` requires authenticated bootstrap
visibility; `published` requires a fully verified named reading. The currently
deployed old backend strips the new heartbeat fields. A verified content publication
may therefore complete with `readerVisible:false`, `heartbeatDelivered:false`, and
`SUPERVISOR_HEARTBEAT_NOT_READER_VISIBLE`. This preserves content preparation while
honestly retaining the separate WO-2 phone/backend visibility gate. It is never a
claim that the app received fields the backend omitted.
Visibility compares the entire supported sanitized status (lanes, errors, buffer,
timestamps and derived fields); matching only `state` or `lastRunAt` is insufficient.

## Evidence and remaining release gates

Manager installed Stage A `ea80c52` and executed both arbitrary-CWD shadow roles:
four actual ACTIVE definitions accepted, review selected Genesis 14 and preparation
selected Psalm 3, both `handoff_pending`, no error, no publication. Actual health
remains 3/8 devotionals, 0/8 Henry, two devotional future days, zero complete future
days. Genesis 14's five validated batches are now independently reviewed and its
six-submission native job is publishing; attachment and publication remain the
manager's genuine acceptance run.

An October 10 read-only native connector check grounded normalized metadata and
materialized all 11,960 live manifest bytes. They exactly matched the canonical
private mirror (SHA-256 `58ce7f0afa617b8096cafb645faa766ebad370b50a65988705a9168526d95284`).
The private proof retains the native response and raw file; no Drive write or model
call occurred. The actual isolated validation snapshot also passed all 66 published
private-prefix studies while leaving the canonical manifest unchanged. It granted
no primary review or publication approval. Publication fixtures include real native
event-chain revocation with unchanged approval bytes, source/archive/library
fencing, durable daily revocation and separate private input roots. Final combined
check after rebasing onto e9a2740 passed 526 tests,
44 schemas, repository safety and unchanged selected/unselected public-byte
verification. Fabricated protocol, historical-scope, native-reference and installed
handoff tests do not substitute for the manager's genuine one-reading acceptance.
Stage B runtime/automation activation and Stage C bounded author/review delivery
remain separately sequenced. Preserve selected production assets and all prior
public releases; this supervisor stage does not deploy WO-2's shell/backend.
