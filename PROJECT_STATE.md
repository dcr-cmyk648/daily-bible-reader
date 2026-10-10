# Project state — October 10, 2026

## Service recovery status

Authenticated service health recorded in the recovery plan is **not ready**: 3/8
devotionals prepared (October 10–12), 0/8 complete Henry verse layers, two
devotional future days, and no complete future days. October 13–17 is missing;
Genesis 14, Psalm 3/Proverbs, and Genesis 15 have fallback-only Henry layers.
This is the latest verified checkpoint; rerun live health before any service claim.

Recovery findings and work orders: [recovery plan](docs/execplans/service-recovery-2026-10-10.md).
Apply standing authority while preserving privacy, source review, atomic publication,
access/sharing, immutable rollback and release gates in the policies below.

## Current sequencing

- WO-1 e9a2740 is installed; manager verified both ChatGPT author models at 16:19
  UTC. Both Henry lanes ACTIVE; exact e9 inventory/rollback remain private.
- WO-2 466058d is released as an unselected canary; phone/backend promotion pending.
- WO-3 A–D accepted. Stage A ea80c52 installed; B publication/source/revocation
  gates pass 526 combined tests and real read-only Genesis 14 authority proof.
  Manager sequences B install/publication; daily/review ACTIVE. [B protocol](docs/SUPERVISOR_PUBLICATION.md).
- WO-4 owns documentation hygiene. Non-BibleApp automations remain untouched.

The 2026-10-01 highlight cleanup supplies selected production assets.
Earlier checkpoints: [archive](docs/reports/state-archive-2026-09.md).
Historical evidence: [reliability report](docs/reports/service-reliability-2026-09-28.md).

## WO-2 checked unselected canary

Released 466058d based on WO-1 fe7bb36: heartbeat/buffer status, shared short notices,
Dustin operational detail and one manifest-plus-payload evaluator are implemented.
Daily/no-op/retry receipts retain other-lane and legacy blockers; downloaded
payloads cannot hide known manifest/Henry gaps. Fabricated October 6/8/10,
cross-lane, CLI and cache-isolation regressions pass. Combined check: 494 tests.

Canary 26cd630fe1ea0afa pins frontend 530161d86a2c1df1; selected frontend
844ce06fb805f5f4 / PWA 8fcefb5ae56b5def remain byte-identical. See
[contract](docs/PREPARATION_HEARTBEAT.md) and [phone/release procedure](docs/execplans/wo2-reader-canary-acceptance.md).
Manager cleared safe source/unselected-assets push. No backend deployment,
private publication or saved automation change. The old backend strips heartbeat:
live delivery needs the manager's backend/phone gate and scheduled-wake readback.

## Required policy references

WO-1 Stage C native extension adds the `requested-reading/v1` capability marker,
read-only native lane selection and a preflight-before-mutation exact-reading
guard. A hash-bound rolling daily dependency can prepare one private Henry library
before remote devotional publication, only with the same journal's EDF selection,
`waiting_henry` state and accepted synthesis evidence. Default backfill behavior
is retained. Manager owns runtime installation, pin updates, real preflight and
service acceptance; this source change makes no live readiness claim. Interface:
[Henry operations](docs/HENRY_V2_OPERATIONS.md#one-reading-lifecycle).

`AGENTS.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`,
`docs/CONTENT_AND_RIGHTS.md`, `docs/EDITORIAL_STANCE.md`,
`docs/COMMENTARY_WORKFLOW.md`, and `docs/RELEASE_STABILITY.md` remain authoritative.
Do not treat archived operational reports as current permission or readiness.

## WO-1 current accepted runtime

e9a2740 preserves approved gpt-6-luna primary (medium), gpt-5.6-luna fallback
(low), ChatGPT-only preflight, bounded retries, 24-hour leases, three-reading
drain and independent review; author/probe execs now use --ephemeral. Legacy
provenance/budgets survive explicit rebinds; status/health dependencies are pinned.
Manager's 16:19 UTC installed CLI 0.162.1 probe verified both models via ChatGPT,
with no API fallback. Only Henry prompt pins changed; all four definitions ACTIVE.
Genesis 14 has five reviewed batches, six submissions and a publishing-phase
approved job; manager owns remaining attachment/publication and live health.
Commands/interfaces: [Henry recovery release](docs/execplans/henry-recovery-release-2026-10-10.md).
