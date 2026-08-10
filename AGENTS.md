# Daily Bible Reader agent instructions

Read `README.md`, `PROJECT_STATE.md`, and the documents linked there before making changes. Repository files are durable project memory.

- Keep real commentary, source extracts, ESV passage text, credentials, Google IDs, user emails, and comment exports out of Git.
- The active pre-launch bridge contains only `CC-Y3Q4-D054` through `CC-Y3Q4-D060`. Only D054–D056 may contain substantive bridge syntheses; D057–D060 remain explicit preparation placeholders until requested. The full 92-day Celebration schedule may exist only as factual reference metadata. Do not generate later commentary or the new long-term plan without explicit approval.
- Use fabricated, conspicuously labeled Scripture in tests and fixtures. Production ESV access is server-side only.
- Keep the deployed app free of runtime AI. Commentary is researched, reviewed, and published offline one reading at a time.
- Preserve the `USER_ACCESSING` Apps Script model, server-derived identity, Drive permission gate, explicit two-user allowlist, and append-only comment revisions. Fail closed.
- Run `npm run check` after substantive changes. Run the repository-safety check before staging or building.
- Treat `docs/RELEASE_STABILITY.md` as a release gate. Never weaken the generated-line ceiling, bypass immutable canary/rollback discipline, or promote a shell/storage/authentication change without the required installed-iPhone check.
- A user request to update or change the app includes standing approval to deploy the validated code-only update to the existing Apps Script deployment. Still require explicit approval to create Google/ESV resources, change deployment identity/access, commit, push, upload unrelated private content, change sharing, or perform any other external mutation. Publishing the exact private reading content expressly requested in that update is in scope after validation.
- Update `PROJECT_STATE.md` at the end of substantial work.

Detailed policy lives in `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/CONTENT_AND_RIGHTS.md`, `docs/EDITORIAL_STANCE.md`, `docs/COMMENTARY_WORKFLOW.md`, and `docs/RELEASE_STABILITY.md`.
