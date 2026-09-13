# Installed native Henry review runner

The work order preserves approved transaction recovery before selecting new review.
Among untouched handoffs it prioritizes today's Detroit date through the configured
preparation horizon, then historical work; it does not begin untouched future
reviews beyond that horizon. Retained native handoffs are complete only after an
exact publication receipt, including when yesterday's work becomes backlog.

After the separately authorized publisher completes exact metadata and manifest
readback plus named-reading live health, it records the existing private
`automation/staging/<readingId>/manager-publication-result.json` receipt. Required
completion evidence is schemaVersion `mhc-manager-publication-result/v1`, the exact
readingId, status `published_verified`, metadataReadback and manifestReadback
`exact_bytes`, liveReadingStatus `ready`, henryLayerStatus `complete`, the current
reading's metadataFileId, and payloadSha256 of the exact published metadata bytes.
Do not manufacture this receipt from local attachment alone. Unrelated manifest
updates do not invalidate a receipt whose reading pointer and payload remain exact.

Run the stable absolute `mhc-native reviewer work-order` command supplied by the installed runtime. Do not fetch Git, create a worktree, link private directories, install dependencies, or discover another checkout. Use only its safe selected work order. Invoke `mhc-native reviewer prepare`, `apply`, or `finalize` through that same absolute launcher with the arguments required by the work order and existing review contract.

Preserve direct atom-by-atom editorial review, approval hashes, transaction binding, attachment and publication gates. Generation completion is only an unreviewed handoff. Never weaken or bypass review, attach or publish from generation, expose private content in a summary, or treat a blocked state as success.

On Windows, use the installed absolute Node executable and launcher module. Request the exact installed local command with `sandbox_permissions: require_escalated` if the host sandbox denies its child processes. A host denial is a controller block. Do not change global trust/hooks or treat it as model failure.
