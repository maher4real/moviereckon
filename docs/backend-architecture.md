# MovieReckon backend architecture

Decision: use the existing Next.js and TypeScript application on Vercel Node.js
Functions with Fluid compute, backed by MongoDB. This fits the current workload
and continues the decision in [the refactor plan](refactor-plan.md#backend-decision).

## Workloads and products

| Workload | Backend | Current implementation |
| --- | --- | --- |
| Authentication, accounts, watchlists, preferences, feedback and comments | Next.js Node.js Functions + MongoDB | Existing `/api/auth/*`, `/api/better-auth/*` and `/api/user/*` contracts |
| Personalized recommendations | Next.js Node.js Functions + MongoDB | Persisted taste profiles, signed cursors, feed sessions, replayable batches, deliveries and generation leases |
| Public catalog and ratings requests | Next.js Node.js Functions + CDN caching | TMDB proxy and images; `/api/reckon-meter` uses public cache headers |
| Avatars and uploads | Vercel Blob | Existing avatar upload implementation |
| Bounded catalog refresh | Vercel Cron + MongoDB queue and leases | Authenticated daily `/api/import/watch-sources`, with saved progress and bounded processing |
| On-demand provider lookups | Node.js Functions | Existing authenticated fetch/resolve endpoints, upstream timeouts and streamed search progress |

Next.js serves the frontend and backend in the same deployment. Pages API wrappers
continue to delegate to `src/backend/api`, while newer endpoints use App Router
route handlers. Node.js supports the MongoDB driver and the existing server
libraries. The Vercel project currently selects Node.js 24.x.

The TypeScript link resolver runs on Vercel. An explicitly configured,
authenticated Python worker remains optional; automatic local Python startup is
only used outside Vercel. Final media is served from the provider directly.

## Connections and shared state

Each Node.js instance shares one in-flight MongoDB connection promise and one
connected client. Simultaneous cold requests wait for the same connection and
index bootstrap. A failed connection closes its pool and clears the failed
promise so later requests can retry. Normal requests leave the client open.

The pool defaults to 10 operation connections per MongoDB server, allows zero
minimum connections, closes idle operation sockets after 60 seconds and limits
waiting for a connection to 5 seconds. `MONGODB_MAX_POOL_SIZE` accepts 1–100.
MongoDB monitoring sockets are additional, and every function instance has its
own pool. Tune the limit against Atlas connection capacity and observed load.

MongoDB stores authentication/session state, recommendation state, import jobs,
leases and production rate-limit buckets. Production rate limits use atomic
shared counters and return `503` if the limiter is unavailable. Local development
and tests use bounded in-memory counters. Process-local caches are disposable
optimizations; they cannot provide cross-instance coordination.

Index bootstrap remains enabled for compatibility with existing deployments.
Only set `MONGODB_SKIP_INDEX_BOOTSTRAP=true` when the required unique and TTL
indexes are already provisioned externally. A versioned migration runner remains
future work, as recorded in the refactor plan.

## Execution budgets

`vercel.json` explicitly enables Fluid compute and configures Pages API budgets:

| Routes | Maximum duration |
| --- | --- |
| Health, TMDB, TMDB images and administration | 30 seconds |
| Authentication and Better Auth | 60 seconds |
| User API, including recommendation generation | 300 seconds |

Existing App Router exports retain 300 seconds for importing and streamed source
search and 60 seconds for resolution. All configured values fit the current
Hobby Fluid compute ceiling. The daily Cron schedule remains `0 0 * * *` (UTC).
The importer authenticates with `CRON_SECRET`, limits each catalog's processing
budget to 210 seconds and persists unfinished jobs for a later invocation.

Keep Functions close to the actual Atlas primary region. The connected project
metadata does not expose the Atlas location, so this change preserves the
project's region rather than selecting one from the developer's location.

## Deployment validation

Configure `MONGODB_URI`, `MONGODB_DB_NAME`, the existing auth secrets and security
controls, `TMDB_API_KEY`, `BLOB_READ_WRITE_TOKEN` for avatars, and `CRON_SECRET`
for imports in the applicable Vercel environments. Keep preview data isolated
from production. Use `.env.example` for the complete configuration contract.

Before production rollout, run `npm run check`. On a preview deployment, verify
sign-in and session refresh, a watchlist write and reload, recommendation cursor
continuation, and an authenticated import against preview data. Check function
errors, duration and Atlas connections in Vercel and Atlas observability.
`GET /api/health` checks MongoDB reachability and required production security
settings and reports the production limiter as `mongodb`.

The current change does not provision infrastructure or deploy the application.
Fixtures establish concurrency and retry behavior; they do not establish live
Atlas capacity, authentication configuration or recommendation relevance.

## When to add another service

Use Vercel Workflow when a job needs durable multi-step retries, sleeps or
external events across invocations. Use Vercel Queues when measured demand calls
for buffered fan-out. Consider Redis when measurements show MongoDB cache or
rate-limit latency is the bottleneck. Independently built components can use
Vercel Services when they should deploy and roll back together. Current bounded
imports and HTTP APIs fit the existing application.

## References

- [Vercel backend frameworks](https://vercel.com/docs/frameworks/backend)
- [Fluid compute and concurrent invocations](https://vercel.com/docs/fluid-compute)
- [Function limits](https://vercel.com/docs/functions/limitations)
- [Function configuration](https://vercel.com/docs/project-configuration/vercel-json#functions)
- [MongoDB connection pools](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/)
