# Henry recovery release contract — October 10, 2026

WO-1 implements the manager's recovery work order. The manager resolved the initial
child approval denial under the original trusted human instruction and verified
both models through this exact preflight at 10:55 Eastern on October 10. Both codes
are null, state is available, and the receipt is preserved privately. No real
authoring is claimed. Activation remains gated on the released installed runtime;
the manager owns installed preflight, live health and author automation resumption.

## Configuration and interfaces

The single primary value is `AUTHOR_MODEL` in
`scripts/lib/mhc-v2-author-config.mjs`, currently `gpt-6-luna`. The installer binds
it as `author_model` in the immutable runtime config. The compatibility lane name
remains `spark`, with medium reasoning. The existing `luna` fallback remains
`gpt-5.6-luna`, low reasoning, eligible only after recorded candidate exhaustion.
No additional fallback was introduced. Changing either model requires user authority.

New jobs capture both models in their hash-linked state. Existing submitted work
retains legacy model provenance. A never-authored stale job can record an explicit
configuration rebind to the approved primary without clearing failure history,
candidate counts, old session budgets or deadlines. Existing source/review hashes,
the independent reviewer and manifest-last exact-byte publication remain gates.

`author-preflight --codex-executable ABSOLUTE_PATH` checks the executable, existing
ChatGPT login, connector isolation, then one trivial structured probe per configured
model. It claims no reading and sends no Henry source. `author-run --lane spark|luna
--codex-executable ABSOLUTE_PATH [--max-readings 1|2|3]` calls this same preflight
first. API-key variables and endpoint overrides are removed; ChatGPT login is
forced and shell/apps/plugins/subagents/web/MCP capabilities are disabled.

Provider 4xx, model refusals, missing executables and invalid local configuration
return `state: blocked`, a safe static reason and `V2_AUTHOR_MODEL_UNAVAILABLE`.
The same classifier runs on current and retained failed author receipts. Generic
transport checkpoints are bounded to two per lease; repeated/uncertain dispatches
are never replayed. On exhaustion the job becomes blocked fallback-retained debt,
releasing active ownership so a later wake can select the next forward reading.
Two other-owner wakes also escalate. Author leases expire within 24 hours, while
the existing one-hour session deadline and submission budgets remain unchanged.
An accepted candidate resets consecutive transport/ownership counts.

The default author run drains up to three forward readings in date order under
one shared one-hour run deadline and the existing per-reading admission budgets.
Every completed reading remains `review_pending`; it is never counted as published.
Historical work can run singly after forward debt clears, not as catch-up overflow.

For WO-2, failures stage the existing private `manifest-candidate.json` with
`preparationStatus.state: blocked`, safe summary/action and timestamp, preserving
existing status extension fields and every reading pointer. Output includes
`statusCandidatePath` and `statusPublished: false`; it never claims an in-app notice
was delivered. Missing local manifests report `V2_STATUS_MANIFEST_MISSING`.
The existing status publisher must fetch/merge concurrent live pointers and verify
exact bytes. WO-2's heartbeat writer remains responsible for lane timestamps,
buffer counts and no-op heartbeats. WO-3 can consume `readings[]`, each reading's
stage/code/action, and `preflightReceiptPath`, then request independent review and
publication through the existing connector. No automation is changed here.

The immutable runtime also includes exactly `app/shared/server-core.js` (WO-2's
status-helper dependency) and `app/frontend/app.js` (Node live-health dependency).
These two explicit source paths receive the same committed-blob manifest hashes,
path confinement, byte-length and launcher verification as scripts. Arbitrary app
paths are not accepted. This packaging does not deploy or execute AI in the reader.
The installed author stages safe blocked status itself; the accepted immutable
status helper or the same-pin publication workspace owns heartbeat/status preparation.
The bootstrapped publication workspace owns live-health execution with existing
private/public configuration and reader credentials; no health credentials are
installed into the immutable release. WO-3 may later expose verified supervisor
commands against that same dependency closure. Publication remains in Codex through
the existing Drive connector. The Henry publication bootstrap pin must include
accepted WO-2 code before using its extended heartbeat contract.

## Coordinated installation and verification

The manager cleared WO-1 for the next coordinated release after reviewing the
candidate. Immediately before that release, fetch/rebase origin/main, run safety
before staging/building, rerun `npm run check`, and use only a non-force fast-forward
push. Install only from the exact clean accepted commit. Public assets should be
unchanged; no frontend/backend deployment or iPhone gate is triggered by WO-1 alone.

The observed author executable is
`C:\Users\rowla\AppData\Local\Programs\OpenAI\Codex\bin\codex.exe`, version
`0.162.1`, and `login status` reports `Logged in using ChatGPT`. Thus no CLI package
installation is needed. That read-only result is not model availability proof.

The exact local preflight entry used by the manager is:

```powershell
node scripts/mhc-author-preflight.mjs --codex-executable 'C:\Users\rowla\AppData\Local\Programs\OpenAI\Codex\bin\codex.exe'
```

It returns checksum-addressed private receipts. Both models must have completed
structured turns before real author dispatch. Verify the receipt's executable hash,
version, model/effort and ChatGPT-only billing route. The denied child command has
no receipt; the successful manager run has immutable private receipt SHA-256
`1dc92c06a983e49e25924151a9e8139a0b2dc66cbd161bdbafdcb93ccec77d61`.
It records gpt-6-luna/medium at 14:55:18 UTC and gpt-5.6-luna/low at 14:55:25 UTC,
both available through the binary/hash/login listed below. Do not check that private
receipt into Git or resume authors based on fabricated fixtures.

The exact denied shell command was:

```powershell
node scripts/mhc-author-preflight.mjs --codex-executable 'C:\Users\rowla\AppData\Local\Programs\OpenAI\Codex\bin\codex.exe' > .henry-preflight.log 2>&1
```

Automatic reviewer reason, verbatim: "This performs live author-model availability
probes through an authenticated external Codex service; the transcript does not
contain trusted user approval for live provider testing or model-credit consumption,
despite the payload being trivial." The worker did not retry. The manager then
checked billing/configuration evidence and the original human instruction directly;
its authorized probe succeeded without another human approval. The denial is
historical, not a current model-availability block.

Read-only proof: CLI 0.162.1, `Logged in using ChatGPT`; binary SHA-256
`dd13bdb162a184fa04039488b234a8258ef9b76f84e926c505d5742b19249a6a`.
The local config has no `[model_providers.openai]` override. Effective exec arguments
set `model_provider="openai"`, `forced_login_method="chatgpt"`, and exact model/effort;
the adapter removes OPENAI_API_KEY, CODEX_API_KEY, OPENAI_BASE_URL and
CODEX_ACCESS_TOKEN environment overrides. No API-key plaintext was read or exposed.

To preserve the existing automation IDs, resolve them from the current immutable
runtime config without editing the dirty canonical checkout:

```powershell
$henryProject = 'C:\Users\rowla\Projects\BibleApp'
$henryRuntime = Join-Path $henryProject 'private-content/automation/mhc-runtime'
$henryPointer = Get-Content -Raw (Join-Path $henryRuntime 'current.json') | ConvertFrom-Json
$henryConfig = Get-Content -Raw (Join-Path $henryRuntime ('config-' + $henryPointer.config_sha256 + '.json')) | ConvertFrom-Json
$henryRevision = git rev-parse HEAD # exact clean accepted recovery commit
node scripts/install-mhc-native-runtime.mjs --project-root $henryProject --revision $henryRevision --spark-automation-id $henryConfig.spark_automation_id --luna-automation-id $henryConfig.luna_automation_id --pipeline v2
node (Join-Path $henryRuntime 'launcher.mjs') status
node (Join-Path $henryRuntime 'launcher.mjs') author-preflight --codex-executable 'C:\Users\rowla\AppData\Local\Programs\OpenAI\Codex\bin\codex.exe'
```

The installer retains its global-lock/active-writer gates, installs committed blobs,
checks the status helper is present, and activates the pointer last. The launcher
verifies release/config/launcher hashes and helper membership before execution.
Record the exact commit, manifest SHA-256 and config SHA-256 from `current.json`.
The worker owns the targeted canonical `scripts/start-cortan-daily-workspace.ps1`
revision update and its verification after push, as explicitly directed by the
manager. All other dirty canonical files and the independent daily-study bootstrap
remain untouched. The Henry publication bootstrap must pin the accepted revision, retaining
its four private junction checks; the independent daily-study pin stays unchanged.
This worker supplies exact installed hashes/configuration without editing automations.

Manager owns saved commands and author resumption. Both author lanes remain paused
until the released installed preflight actually passes. Daily preparation and
review remain active; non-BibleApp automation state remains untouched. Authenticated
combined service health and seven days of scheduled publication evidence remain
separate acceptance checks; local tests cannot establish buffer recovery.
