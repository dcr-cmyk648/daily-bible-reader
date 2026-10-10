# WO-2 unselected reader canary and installed-iPhone gate

Prepared October 10, 2026. Production promotion and any push wait for BibleApp
Manager sequencing. Local validation is not installed-phone acceptance.

The current artifact record is `config/unselected-reader-canary.json`. It identifies
the exact immutable frontend/canary build, URL and SHA-256 of every selected
production release/PWA file. `npm run check` reconstructs and byte-compares the
unselected candidate and verifies all selected production bytes remain exact.
It does not silently accept a stale source build. Normal Pages/root-PWA publication
is refused while this explicit pending-gate record exists.

Prepare locally with repository safety first, `npm run build`, then PowerShell:

```powershell
$env:DBR_RELEASE_MODE = 'unselected'
npm.cmd run publish:pages
Remove-Item Env:DBR_RELEASE_MODE
npm.cmd run check
```

This adds immutable candidate files without selecting them. Its launcher is kept
in the existing exact endpoint-allowlisted generated-client path. Its own manifest
and worker live below `web/pwa-canary/canaries/<id>/`; they pin the candidate
frontend rather than fetching the selected root release. The worker registers
only that subdirectory and has a unique cache prefix, so activation/pruning cannot
replace the production worker or delete production caches. It reuses the same
token transport, origin, backend URL and reader/plan-bound IndexedDB format.
No production root index, worker, config, manifest or release pointer is changed.

## Final immutable artifact inventory

Canary `26cd630fe1ea0afa` pins frontend `530161d86a2c1df1` and was derived
from PWA build `e33c4ad9efa4e1d9`. Its exact URL after the safe Pages release is
[Reader canary](https://dcr-cmyk648.github.io/daily-bible-reader/web/pwa-canary/canaries/26cd630fe1ea0afa/).
The final added public assets are:

- `web/releases/530161d86a2c1df1/app.js`
- `web/releases/530161d86a2c1df1/highlights.js`
- `web/releases/530161d86a2c1df1/styles.css`
- `web/pwa-canary/assets/pwa-client.26cd630fe1ea0afa.js`
- `web/pwa-canary/canaries/26cd630fe1ea0afa/index.html`
- `web/pwa-canary/canaries/26cd630fe1ea0afa/manifest.webmanifest`
- `web/pwa-canary/canaries/26cd630fe1ea0afa/release.json`
- `web/pwa-canary/canaries/26cd630fe1ea0afa/service-worker.js`

Earlier local artifacts `072a512b377ed8a9` / `212ee4a3b501c6af` are retained
untracked and excluded from this release. Selected production remains frontend
`844ce06fb805f5f4`, PWA `8fcefb5ae56b5def`; immutable rollback version 23 and
the existing backend deployment remain unchanged.

## Manager's release sequence

1. Fetch/rebase the worker's code onto current `origin/main`; rerun safety before
   staging/building, regenerate a new immutable candidate if source changed, and
   rerun the full check. Review selected production hashes against the original
   accepted revision. Commit only reviewed safe source/tests/docs and unselected
   artifacts. A coordinated fast-forward push may serve this exact canary while
   production stays selected on its existing version. Never force push.
2. Require both GitHub workflows and verify HTTPS byte/MIME equality for every
   candidate file and unchanged selected root assets. Run the public backend
   status/invalid-code denial probes under existing authority. Backend staging,
   immutable versioning, status publication and saved automation installation
   remain manager operations; this worker has done none of them.
3. The current deployed backend strips additive heartbeat fields and returns no
   status to Shane. This canary can test installation, calendar placement, downloads,
   existing authenticated transport and the explicit **unknown heartbeat** notice
   against that backend; it cannot prove live heartbeat delivery. Do not promote
   a new production backend just to make this frontend canary pass. Local fabricated
   tests exercise the exact new sanitizer/evaluator/render contracts for both
   readers. The manager must separately sequence the immutable token-backend
   contract release and its required installed-iPhone gate, then verify the real
   heartbeat/bootstrap/readback and both readers before claiming end-to-end recovery.
4. Ask the user to open the exact URL from the current artifact record in iPhone
   Safari, add it to Home Screen as **Reader canary**, and perform the procedure
   below. Keep the existing installed production app available. No worker asks
   the user or claims acceptance on their behalf.

## Exact installed-iPhone acceptance procedure

- Cold launch **Reader canary** from its Home Screen icon. Confirm the current
  date/reading and calendar appear, and the cache/build inspector reports the
  candidate frontend ID from the artifact record.
- Force-close it and reopen from the same icon. Confirm reader identity survives
  and the date/calendar load without a manual downloaded-data clear.
- On Home, confirm the preparation notice sits after the full calendar and before
  Downloaded data. In a stale/debt state it must name the real condition; changing
  the selected date or waiting for downloads must not clear it. Dustin's message
  may show buffer counts and lane codes. Shane must never see owner action prose
  or operational codes.
- Open one prepared reading's Scripture page. Confirm the live provider text and
  required ESV notice appear. Do not copy Scripture or credentials into evidence.
- Make one intentional reversible highlight write in that reading. Confirm its
  save completes, then remove it and confirm removal. Confirm reopen still works.
- Reopen the original production Home Screen app. Confirm it still uses the
  previously selected frontend/PWA release and still opens normally. This checks
  worker/cache isolation; the version-23 rollback remains untouched.

The manager records the user's exact result and stops on any failure. A desktop
browser pass or fabricated warning test is not a substitute for these steps.

## Promotion after acceptance

Only after the user passes the exact candidate: preserve the accepted record as
release evidence, remove the pending-gate record from the working tree, run the
normal safety/build/`publish:pages`/full-check procedure, review the deliberate
production pointer/root-PWA diff, and perform the coordinated validated release.
Keep all prior immutable release directories and clients. Verify HTTPS bytes,
browser smoke and authenticated live health afterward. A failed gate promotes
nothing; retained production assets and version 23 remain the rollback.
