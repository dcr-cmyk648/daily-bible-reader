# BibleApp exact connector handoff

Run only the saved absolute installed supervisor launcher and the named role.
Read its current JSON. The supervisor owns selection, scope, author/review gates,
budgets, artifact paths, retries and publication state. Do not call a model, create
another task, infer a destination, edit content, pause daily/review, or change a
schedule/configuration. Keep all native results, downloads and receipts private.

When code returns `dispatch_required`, read the exact operation file and run the
installed `publication-dispatch` for that transaction/operation. Call exactly the
returned Google Drive tool with its exact arguments once. Save the complete native
result beneath this transaction's `connector-results/` private directory. Run
`publication-receipt` on that file, then `publication-resume` with the returned
receipt path. Continue only the exact next handoff, at most 32 operations total.
Never summarize or reconstruct raw file bytes. The materializer handles the scoped
reference returned by raw fetch; tool acknowledgement is not readback proof.

For `await_receipt`, use the recorded operation ID/SHA/dispatch epoch. If the
original native result exists, materialize/resume it. If dispatch outcome is
unknown, save an exact-bound `uncertain` receipt and resume once; then execute
`publication-reconcile`. Never dispatch the old mutation again or recreate an
unknown version. A missing/ambiguous reconciliation remains blocked for manager
attention. A denied action is `denied`; transport without a definitive result is
`uncertain`. Do not convert either to success.

For `health_pending`, invoke the installed `publication-health` once; it requires
fresh remote readback. Stop at a bounded failure, reconciliation debt, capability
block, operation budget, or complete result. Report precise result fields: private
manifest storage differs from authenticated heartbeat delivery. Never claim full
service ready, reading published or heartbeat delivered from local staging,
fixtures, an upload acknowledgement, or a backend that stripped the fields.
