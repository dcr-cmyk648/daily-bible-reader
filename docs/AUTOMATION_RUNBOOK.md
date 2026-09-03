# Daily content automation runbook

This runbook operates the authorized current-through-T+7 lane. Every work order still authorizes exactly one reading and one atomic publication. A caught-up run prepares only the newly entering T+7 reading; a recovery run reevaluates after each successful exact readback and may drain earlier missing or stale readings sequentially until the eight-reading horizon is complete. It never runs inside the reader and never uses an OpenAI API key. Work in an isolated task worktree. A scheduled run may begin in a dirty shared checkout; leave it untouched, fetch and verify `origin/main`, and create a temporary worktree from that ref. Resolve the canonical checkout from the absolute Git common directory, then link the ignored private directories to its existing stores. Verify those targets before creating the ignored links; never create empty substitute stores. Do not generate or publish from the dirty shared checkout.

## 1. Resolve the exact work order

```sh
npm run study:next
```

Validate the result against `schemas/rolling-study-work-order.schema.json`.

- `none`: the whole current-through-T+7 horizon is ready; run the lightweight validation/readback audit and report no change.
- `plan_complete`: report completion; do not invent a next plan.
- `prepare_publish`: work only on `reading.readingId`, which is the earliest missing or stale record in the current-through-T+7 horizon.

The complete active calendar is compiled into the current backend, so the daily lane never invents a calendar entry. `planExtensionRequired` now refers only to the separate rollback-compatible private prepared-prefix plan. If it is true and the named reading is the next contiguous private-prefix entry, run `npm run prefix:extend -- --today <YYYY-MM-DD>` immediately before manifest promotion. The command atomically advances both the prepared plan and `testingReadingIds`; it rejects reordered, unknown, or ahead-of-plan configuration. If a prior interrupted run already advanced the plan but left that allowlist as a shorter exact prefix, rerunning the command repairs only the allowlist and does not append another reading. If an earlier prefix entry is missing, stop and report that first gap rather than skipping it. This preserves older deployments' exact private plan/manifest contract without changing the compiled calendar schedule.

## 2. Prepare the complete study

Invoke `$draft-daily-commentary` with the unchanged rolling work order. Read all workflow documents required by the skill. Work only in ignored private staging and the canonical ignored source registry.

The daily surface needs a brief standalone orientation, ESV reference only, one coherent main synthesis, one representative verse reference, and a concrete one-sentence action. The deep study uses custom headings suited to the passage and numbered citations. Set `generation.contentProtocolVersion` to the canonical `daily-study-protocol/v1` and record exactly one `componentAssessments.historicalContext` decision. When meaningful reading-specific archaeological or historical evidence exists, set it to `included` and add both exact H3 layers: `### Archaeological and historical context` as a concise preview and `### Archaeological and historical context — expanded study` as a separately researched dossier. Set it to `not_material` only with a concise rationale and neither layer. A prepared study with the preview must also have the expanded dossier, which uses distinct materially fuller prose, at least two custom H4 topical headings, evidence-versus-inference boundaries, inline claim citations, and a nearby bibliography; never duplicate or mechanically stretch the preview. Writing should be content-rich and readable, aimed at highly educated Christian readers, confessional without pretending difficult evidence does not exist, and practical without filler. Secular or anti-supernatural critical proposals appear only when notably influential and are assessed rather than treated as neutral default explanations. Spark remains limited to the Matthew Henry verse-by-verse layer, not either historical-context layer.

For the Henry layer, write the unchanged one-reading `mhc-ensure-request/v1` packet to ignored private staging, validate it against `schemas/mhc-ensure.schema.json`, and run:

```sh
npm run mhc:ensure -- --request private-content/automation/staging/<readingId>/mhc-ensure-request.json
node scripts/review-mhc-schedule.mjs prepare --reading <readingId>
```

The request must name only the rolling work order's reading, use `gpt-5.3-codex-spark`, and retain `only_if_missing: true`. Ensure resolves from the complete active calendar only after verifying the fixture-backed prepared plan as its exact ordered prefix; an out-of-prefix request may contain only the immediate next active-calendar entry. This lookup never extends the prefix or moves the manifest. The interactive `schedule-next` command intentionally accepts only today or tomorrow and is not the T+7 automation entrypoint.

Read the complete private `audit.md`, compare every condensation with its cited atom(s), and correct the general generation controller before regenerating if a recurring defect exists. Record any isolated wording corrections in the candidate, retain their reasons, set the candidate to `approved` only after the complete comparison, and apply that one hash-bound record once. Do not apply an `in_review` candidate and then prepare a second approval record: the canonical approval must remain bound to the raw generated bytes and retain every correction so later rebuilds can replay it.

```sh
node scripts/review-mhc-schedule.mjs apply \
  --reading <readingId> \
  --review private-commentary/mhc/schedule/<readingId>/review-candidate.json
node scripts/sync-latest-mhc.mjs \
  --reading <readingId> \
  --metadata private-content/bridge/celebration-y3q4/<readingId>.metadata.json
```

The apply command rejects stale/reordered generation bytes and updates the checksum-bound private Henry library. A later schedule rebuild must reproduce the reviewed wording by replaying the same canonical approval and corrections against the raw generation. The bundle/sync step always follows that newest reviewed library pointer.

If Spark has a model-execution failure (including quota, availability, or process/no-output failure), the controller may retry only exact Luna once at low reasoning and record both attempts' provenance. Sol, Terra, and every other model are forbidden. If both model attempts fail, add or retain a `henrySourceLink` to a verified HTTPS page containing the complete public-domain chapter commentary, bind it to the consulted Matthew Henry source record, and validate that link as the reading's explicit fallback; the independently researched orientation, historical context, main synthesis, and takeaway continue. Deterministic request, source, checksum, schema, security, repository, review, and publication failures do not retry another model.

## 3. Validate and promote atomically

Compute the commentary hash from the exact Markdown bytes, set the metadata to `in_review` only after primary review, and run:

```sh
npm run validate:sources
npm run validate:private
npm run safety
npm run check
```

Build the private content bundle. Upload versioned content/config/plan/registry files first. Update the single private manifest only after every target exists. Re-read the files from Drive, compare exact hashes/bytes, verify the manifest refers to the new files, and confirm sharing did not broaden. The previous manifest remains the rollback pointer until the final update.

When using the connected Google Drive file-upload tool, treat its MIME choice as transport metadata and trust only exact byte readback. On 2026-08-22, raw JSON uploaded with `application/json` arrived as an empty file; the same bytes uploaded as `text/plain` read back exactly and remained parseable by the Apps Script byte/JSON loader. Never promote the manifest after an empty, transformed, or otherwise mismatched upload, regardless of the reported upload success.

If tracked code/plan metadata changed, commit intentionally, push `main`, publish the code-only Pages artifact, and update the existing token Apps Script backend if required. Never move the immutable USER_ACCESSING production deployment pointer. Never commit private content, ESV wording, source atoms, identifiers, codes, or secrets.

## 4. Reevaluate and report

After—and only after—exact Drive readback proves the named reading is live, rerun `npm run study:next`. If it returns another `prepare_publish`, repeat Sections 1–3 for only that new work order. The loop is bounded by the eight-reading horizon and stops immediately on the first generation, review, validation, upload, sharing, or readback failure. It must never skip a gap or move beyond T+7. When the result is `none` or `plan_complete`, the primary preparation lane is finished.

Report every reading/date repaired in order, source categories and limitations, Henry generation/review status, tests/gates, Drive readback, resulting ready-through date, commit, Pages release, and any failure. Do not include private IDs, reader codes, comments, ESV wording, or copyrighted source text.

## 5. One-reading protocol refresh backfill

Only after the T+7 lane reports `none` or `plan_complete` and exact Drive readback is verified, run:

```sh
npm run study:protocol-backfill:next
```

Validate the result against `schemas/protocol-backfill-work-order.schema.json`.

- `deferred`: the T+7 horizon is not ready; do not inspect historical work.
- `none`: every already-read manifest-backed study is current under `daily-study-protocol/v1`.
- `refresh_review_publish`: perform one complete primary-reviewed refresh of only the named prior reading, selected most-recent-first. It must preserve the stable reading ID and therefore existing comments/highlights; retain and revalidate the newest reviewed Henry artifact or verified fallback; preserve prior versions; and never store ESV wording. Reconsider the synthesis, sources, citations, and historical-context assessment rather than merely adding version metadata. Upload versioned content and metadata first, update the manifest last, then verify exact Drive bytes and unchanged narrow sharing.

This lane is higher priority than Henry-only backfill. It may select one reading only and never alters backend authorization, sharing, comments, highlights, or plan placement.

## 6. Opportunistic Henry backfill

After—and only after—the T+7 lane is complete and verified and the protocol-refresh lane reports `none`, inspect the one-reading Henry-backfill queue:

```sh
npm run mhc:backfill:next
```

Validate the result against `schemas/mhc-backfill-work-order.schema.json`. The queue scans active-plan order and selects only the earliest manifest-published chapter whose metadata still contains a valid `henrySourceLink`. It verifies the checksum-bound private Henry library before reporting one of four actions:

- `none`: no published fallback remains;
- `generate_review_publish`: the artifact is missing, so persist the embedded one-reading ensure request in ignored private storage and invoke `npm run mhc:ensure`;
- `review_attach_publish`: a generated artifact exists but still needs complete atom-by-atom primary review and approval;
- `attach_publish`: a previously approved artifact needs only checksum revalidation, attachment, validation, and atomic private republication.

If the T+7 lane already observed a Spark model-execution failure, do not probe Spark again in the backfill lane. A backfill failure after the controller has exhausted its narrow Spark→Luna route is a safe deferral: retain the full-source link, leave the library and live manifest unchanged, and let the next daily task select the same reading. A successful generation still requires the same hash-bound review process described above. `npm run mhc:sync-latest` removes the fallback only while attaching the verified reviewed runtime. Upload versioned metadata first and replace the private manifest last. This lane never rewrites the orientation, multi-source synthesis, takeaway, or Scripture reference.

## Failure rules

- A Spark model-execution failure receives one Luna-low attempt; two failed model attempts use only the documented full-source-link fallback. Deterministic request, source, checksum, schema, security, repository, review, and publication failures leave the reading non-ready and retry the same work order.
- Backfill is lower priority than the end-to-end T+7 lane, processes at most one separate reading per run, and retains its working fallback on every failure.
- A Drive upload failure leaves the old manifest current.
- Missing local private storage or a dirty checkout stops publication.
- A single work order never generates a second reading. A recovery run may obtain the next work order only after successful exact readback; it never skips a gap, reads comments, calls the ESV API, or weakens a gate.
- If the Mac misses the run, the app's first-gap warning remains the independent alert.
