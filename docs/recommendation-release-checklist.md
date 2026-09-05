# Recommendation release checks

Status: implementation and local QA are in progress. This checklist is not a deployment or a completed restore rehearsal.

## Reproducible local checks

Use Node 22 and the committed lockfile. Stop the local Next server before rebuilding its `.next` directory.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm ls --depth=0
npm audit
git diff --check
```

Start the built artifact with `npm start`. Verify Movies, Series, Upcoming, Search and Reckon at 1440px, 820px and 390px. Follow selected controls through request parameters to returned titles. Include rapid changes, back/forward, direct links, provider-region changes, initial errors, continuation errors and retry. Check actual poster loading, keyboard focus and browser errors after requests settle.

Mocked authentication/catalog browser checks establish UI behavior only. Separately exercise staging login, logout, session refresh, account switching, OAuth and email flows before releasing the upgraded auth packages. Never use another person's account or delete existing user data as a test fixture.

## Database protocol validation

The default test run skips the 12 native-Mongo integration tests across feed protocol, taste controls and account lifecycle suites. To opt in with a credential allowed to create and remove a disposable database:

```sh
MOVIERECKON_RUN_DB_QA=1 npx vitest run src/test/recommendation-feed.integration.test.ts src/test/recommendation-controls.integration.test.ts src/test/account-lifecycle.integration.test.ts
```

Supply `MONGODB_URI` through the environment or the existing local environment file; do not paste it into logs or command arguments. The test generates a `moviereckon_qa_` database name, checks it is empty, writes an ownership marker and cleans up only that generated database. It never selects the application database for test writes.

The September 5 attempt connected but failed the disposable namespace access check with MongoDB code 8000 before writing a marker or data. A subsequent run against a checksum-verified official MongoDB 8.0.29 binary, bound to loopback as a disposable single-node replica set, passed all three native-driver protocol tests. Four additional native taste-control tests also pass, covering reset boundaries, persisted edits, temporary suppression and an older rebuild overlapping newer feedback. Generated test databases were removed. This verifies local replay/concurrency behavior; staging permissions and deployed multi-instance behavior remain separate gates. A successful `/api/health` ping alone does not establish these properties.

## Configuration and data lifecycle

- `NEXT_PUBLIC_RECOMMENDATIONS_V2=true` explicitly enables the new client feed. This is a build-time public flag, not a secret. Unset/false retains the legacy endpoint; there is no silent fallback after a v2 request fails. For v2 QA, stop the server, run `NEXT_PUBLIC_RECOMMENDATIONS_V2=true npm run build`, then start that artifact. Changing the variable only on `npm start` does not change an already-built client bundle. Keep the legacy and v2 cache namespaces isolated, and verify both modes before rollout.
- Configure a server-only `RECOMMENDATIONS_CURSOR_SECRET` of at least 32 characters, consistent across instances. The handler also accepts existing sufficiently long auth secrets, but a dedicated secret makes rotation independent. Rotation invalidates existing cursors; the UI must offer a fresh session.
- Current v2 sessions expire after 45 minutes. Expiry is checked by the API; TTL cleanup is asynchronous.
- User-derived state includes `user_taste_profiles`, `recommendation_sessions`, `recommendation_batches` and `recommendation_deliveries`. Export/deletion/reset handling must stay in sync with any additional collections.
- Unique and TTL indexes for v2 state bootstrap with the shared Mongo schema connection setup, before the feed handler runs. A versioned deployment-migration runner and durable rebuild jobs remain open work; do not report them as deployed.
- `/api/health` checks Mongo connectivity and selected security configuration. Its `local-memory` rate limiter is not a shared multi-instance limiter, and the endpoint does not measure recommendation supply, ranking quality or upstream health.

## Quality and performance gate

Use consented human relevance judgments and a frozen held-out comparison set to assess Precision@20, NDCG@20 and language/interest coverage. Behavioral fixtures must remain separate from the human evaluation; a thousand unique test IDs proves pagination behavior, not taste accuracy. Record baseline and candidate retrieval recall before tuning the ranker.

Measure first useful page, cached continuation p95, upstream calls per 100 delivered titles, source failures, rejection/repetition rates and profile lag in staging. The plan's two-second first page, 500ms cached continuation and 10% relative NDCG uplift are targets, not measured results.

## Restore and rollback rehearsal

Vercel cron delivery can be missed or duplicated, and failed invocations are not retried automatically. Durable job retries and leases must therefore live in the application. Deployment rollback also does not restore cron settings: separately verify or disable the active schedule during a rollback. [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs)

Use a daily default schedule unless the deployment supports more frequent execution. Current Hobby scheduling is once daily with hourly precision; frequent profile refresh needs a supported scheduler or worker. Do not assume a paid hosting plan. [Vercel scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)

Before production data migrations, record the deployment's backup mechanism, retention, recovery-point target and recovery-time target with its owner. Restore a selected snapshot into a separately named isolated environment, verify document counts and representative library/preferences records, and exercise read-only application access. Record elapsed restore time and observed data loss window. Do not restore over the live database as a rehearsal.

Retain the previous deployable artifact and its lockfile. Rehearse switching traffic back while preserving authoritative user interactions. New derived collections should remain additive so rollback does not require deleting library data. Verify session invalidation and account isolation on both versions. Do not remove auth compatibility routes until deployed consumer and authentication checks pass.

Record the actual environment, build revision, commands, results and unresolved blockers when these checks are performed. No production deployment, backup restoration, traffic experiment or rollback rehearsal has been performed by the current local QA.
