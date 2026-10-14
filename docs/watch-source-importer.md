# Watch source importer

The importer discovers new and updated HDHub posts, collects every published
quality and watch button in their download sections, matches content using TMDB,
and stores a durable snapshot in MongoDB. The lookup API reads those snapshots;
it never scrapes on a viewer request. Video traffic stays with the external host.

## Configuration

Use the existing `MONGODB_URI`, `MONGODB_DB_NAME`, and `TMDB_API_KEY`. Add a separate
random `CRON_SECRET` of at least 32 characters to the server environment. Never
use a `NEXT_PUBLIC_` variable for this secret. The optional configuration is:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HDHUB_BASE_URL` | `https://new7.hdhub4u.cl` | Current public HTTPS origin |
| `WATCH_IMPORTER_ENABLED` | enabled | Set `false` to disable imports |
| `WATCH_IMPORT_BATCH_SIZE` | 20 | Max post jobs per invocation; range 1–100 |
| `WATCH_IMPORT_CONCURRENCY` | 3 | Parallel post workers; range 1–5 |
| `WATCH_IMPORT_DISCOVERY_PAGES` | 2 | Recent index pages; range 1–10 |
| `WATCH_IMPORT_REFRESH_HOURS` | 24 | Refresh interval for matched pages; range 1–168 |

The current public WordPress REST posts endpoint returned 403 during verification,
so discovery uses the home page and `/page/2/` etc. Only same-origin post paths
are queued. Request timeouts, response size limits and redirect restrictions
bound fetches. The importer does not execute source scripts or fetch video files.

`vercel.json` schedules one daily production invocation at 00:00 UTC. This works
with [Vercel Hobby's daily cron limit](https://vercel.com/docs/cron-jobs/usage-and-pricing). For hourly imports on a plan supporting
them, change the schedule to `0 * * * *`. An external scheduler can also call
the protected GET endpoint hourly. Vercel sends `Authorization: Bearer CRON_SECRET`
automatically, as described in [Vercel's cron authentication documentation](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs); an external scheduler must supply that header. Local development
does not run cron automatically.

## Run and preview

Signed-in users see **Fetch links** in each movie and series detail
page's action row. Clicking it opens a results dialog and runs an import for
that TMDB title only. Watch players, download qualities and additional quality
collections appear separately, including episode/season labels for series.

The button calls `POST /api/watch-sources/fetch` using the existing HttpOnly
user session, a trusted Origin and the AJAX header. It never receives the cron
secret. The server requires authentication and limits each user to
six requests per minute. `TMDB_API_KEY` and `MONGODB_URI` are required; `CRON_SECRET`
is only needed by the scheduled/bearer endpoint below.

Automatic per-title discovery checks previously saved source pages and the
configured recent-release index pages. HDHub's JS search proxy returned 403 to
server requests during verification. For a title outside those indexes, paste
its source-page URL in the dialog and use **Fetch from page**. The server fetches
the title's canonical identity from TMDB and imports only matching candidates;
a supplied page for a different movie/series returns a validation error. This
manual action does not enqueue or import unrelated catalog entries.

The body for the session endpoint is:

```json
{ "contentId": 1078605, "contentType": "movie", "sourceUrl": "/weapons-2025-hindi-studio-dub-bluray-full-movie/" }
```

`sourceUrl` is optional and must belong to `HDHUB_BASE_URL`. Without it the server
discovers candidates automatically. The response distinguishes imported,
partially refreshed, not-found and busy states and includes the saved sources
directly, avoiding stale cached lookup responses after a manual import.

`GET /api/import/watch-sources` discovers recent pages, enqueues them, and
processes a bounded batch. It requires the cron bearer secret. Responses report
discovery, queued/processed counts, updated/unchanged pages, matches, pending
matches, review items, errors and remaining due jobs. `skipped: true` indicates
another run holds the database lease or the importer is disabled.

`POST /api/import/watch-sources` with the same bearer header accepts:

```json
{
  "urls": ["/weapons-2025-hindi-studio-dub-bluray-full-movie/"],
  "dryRun": true
}
```

A dry run returns parsed links and matching results without MongoDB writes.
It accepts up to 10 URLs. With `dryRun: false`, up to 100 supplied URLs are queued
for refresh, and a bounded batch of those pages is processed. Subsequent runs
process remaining jobs. Send `{}` to POST to run normal discovery.

All manually supplied URLs must belong to `HDHUB_BASE_URL`. URL credentials,
non-HTTP links, IP literals, and cross-origin fetch redirects are rejected.

## Read sources for a MovieReckon title

```text
GET /api/watch-sources?contentType=movie&contentId=123
GET /api/watch-sources?contentType=tv&contentId=456&season=1
GET /api/watch-sources?contentType=tv&contentId=456&season=1&episode=2
```

`contentId` is the TMDB ID. The response contains source-page URLs, check times,
and link records with `kind` (`download`, `watch`, `collection`), quality,
resolution, codec, bit depth, size, formats, languages, season/episode scope and
`verification: "unverified"`. A watch link is a published player-page destination,
not a verified direct MP4/HLS URL. Collection links point to additional quality
pages; they remain labeled as collections and are not crawled on another origin.

Series-wide links and season packs are excluded from an episode lookup. An
explicit episode range is retained as `episode-range`, including its boundaries.
No missing episodes are synthesized. Saved links are visible to regular viewers
on the movie and TV detail pages, without triggering an import. Movies have a
Watch movie section. TV shows display episode links on their matching episode
cards, with separate season options that follow the selected season. Series-wide
players appear in Watch series. Download and collection options are expandable.
The page reads one cached snapshot per title rather than making a request for
every episode. Fetching links updates that snapshot in the page immediately.
Fetch links is available to signed-in users on the same detail pages; it is not part of
the Cinema admin panel. An embedded playback integration is separate.

## Matching and persistence

An IMDb ID is resolved with TMDB `/find`. Only one result of the expected media
type is assigned. Without an IMDb ID, a unique exact normalized title and release
year can match. Ambiguous or insufficient metadata is stored for review rather
than attached to a similar title. Pending/review pages retry every six hours so
new TMDB records can be matched later. Matching is independent of catalog caching:
the source appears when MovieReckon displays that TMDB title.

Mongo collections:

- `watch_source_pages`: one record per provider/post path, including link snapshot,
  match, validators, content hash, status, errors, and next check time.
- `watch_source_discovery`: cached discovered URLs and conditional-request validators.
- `watch_import_state`: atomic run lease and last run counters.

The importer uses conditional GETs, hashes parsed content rather than ads/sidebar
HTML, reuses known matches, and collapses repeated TMDB lookups within a run.
Discovery cannot reset an existing page's refresh time. Failures back off from
15 minutes up to 48 hours and preserve the last successful link snapshot.
Queue and match indexes are created before an import starts. Overlapping runs
are excluded using a Mongo lease; work stops starting new pages before the
function deadline and unfinished jobs remain due for the next run.

Changing `HDHUB_BASE_URL` keeps post identities stable across domain rotations.
Redirects to a different domain fail until that origin is configured explicitly.
Old pages are periodically refreshed even when they leave the recent-post index.
This is incremental discovery with a seed mechanism, not a full historical crawl.
Source layout changes may require parser updates, and scraping success does not
establish whether third-party playback or iframe embedding works.
