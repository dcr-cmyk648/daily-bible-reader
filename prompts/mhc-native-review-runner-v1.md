# Installed native Henry review runner

Run the stable absolute `mhc-native reviewer work-order` command supplied by the installed runtime. Do not fetch Git, create a worktree, link private directories, install dependencies, or discover another checkout. Use only its safe selected work order. Invoke `mhc-native reviewer prepare`, `apply`, or `finalize` through that same absolute launcher with the arguments required by the work order and existing review contract.

Preserve direct atom-by-atom editorial review, approval hashes, transaction binding, attachment and publication gates. Generation completion is only an unreviewed handoff. Never weaken or bypass review, attach or publish from generation, expose private content in a summary, or treat a blocked state as success.

On Windows, use the installed absolute Node executable and launcher module. Request the exact installed local command with `sandbox_permissions: require_escalated` if the host sandbox denies its child processes. A host denial is a controller block. Do not change global trust/hooks or treat it as model failure.
