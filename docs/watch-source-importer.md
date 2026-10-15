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

## Direct playback and external pages

### Python resolver and deferred UI

Movie/series details render before the watch-source module or saved-source request begins. The source area loads after two animation frames and an idle callback (800 ms deadline), with a circular loading indicator. Imports remain explicit **Fetch links** actions. Every episode uses the same cached title snapshot, and mounting/focusing another episode does not trigger another refresh. A manual import cancels any pending saved read before replacing that cache, so a late read cannot overwrite fresh links.

The fetch flow stays inline with its loading, error, retry and optional source-page field. Download qualities display as rows; **Get file link** checks only the selected file, then reveals its download action. Fetching/importing a title never resolves all final files in parallel.

`scripts/resolve_watch_links.py` is an independent Python 3.10+ resolver using the standard library. It accepts one JSON object `{ "title": "The Trap", "link": { ...savedWatchSourceLink } }` on stdin and returns `{ "downloads": [...] }`. Use `npm run resolve:links < /path/to/input.json`. It preserves the provider allowlists, title/episode/quality/codec matching, expiry checks, document caps and headers/one-byte probes used by the TypeScript resolver. It executes no third-party scripts and downloads no full media files.

`WATCH_SOURCE_RESOLVER=auto` starts the Python script only when a local **Get file link** request arrives, and uses TypeScript if Python is absent. `WATCH_SOURCE_RESOLVER=typescript` explicitly selects the existing engine. `WATCH_SOURCE_RESOLVER=python` requires a working Python executable locally or a configured worker. Each request selects one engine; a provider failure does not launch a second scrape in another language. No Python process starts during page loading or an ordinary saved-source lookup.

On Vercel, do not assume Python can be spawned inside a Node.js function. To use Python there, run `npm run worker:links` on a separate Python host, set `WATCH_SOURCE_PYTHON_SECRET` (32+ characters) on both services, and set `WATCH_SOURCE_PYTHON_URL=https://your-worker/resolve` on the app. The worker binds to `127.0.0.1:8765` by default; use a TLS reverse proxy for remote access. It accepts authenticated POST requests only and limits active resolutions to two. Without a worker, auto mode retains TypeScript on Vercel. `WATCH_SOURCE_PYTHON_BIN` selects a local executable. `WATCH_SOURCE_CA_BUNDLE` adds a trusted CA bundle; TLS verification always remains enabled.

Run Python checks with `python3 -B -m unittest discover -s scripts -p '*_test.py'`.

**Get file link** resolves supported HubCDN and HubDrive downloads on demand. HubCDN's published redirect data is decoded without loading its advertising page; HubDrive's file button is followed only through the known HubCloud and Gamerxyt paths. Only the published R2 storage buttons are considered. Returned filenames must match the selected title, season/episode or season pack, resolution and known codec. A HEAD probe (or a one-byte range for a signed GET URL) checks file headers and availability. HTML responses, redirects, wrong episodes, ambiguous targets and expired URLs are rejected. This checks filenames/headers, not the movie's contents. The final file goes directly from the storage host to the viewer; the API never buffers/proxies the full video. File links are generated when requested and can be refreshed because signed URLs expire. Other domains and unsupported/challenged flows retain their external-page option.

The document CSP allows HTTPS connections/media and local blob media/workers so HLS can run after SPA navigation. This broadens the connection/media destinations for rotating media hosts; script nonces and the existing frame allowlist remain enforced. No provider scripts are embedded in the player.

Imported labels such as WATCH or 1080p describe the publisher's link; they do not prove that the URL is a working video. Most saved URLs lead to third-party player/download pages. Those pages are now collapsed under **External sites · may show ads** in both detail pages and fetch results.

**Play here** uses a native video element for HTTPS MP4/WebM files and native HLS or a lazily loaded hls.js player for HLS. It supports movie links and explicitly scoped single-episode links. Season packs and episode ranges are never substituted for a single episode. HLS quality and audio choices come from the actual manifest. Published MP4/WebM, MKV/MOV/AVI and ZIP/RAR/7z URLs have **Open / save file**; cross-origin servers and browsers determine whether they save or open. HLS manifests are not offered as movie downloads.

The signed-in `POST /api/watch-sources/resolve` endpoint accepts only a content ID/type and saved link ID, with origin/AJAX checks and a 20/minute per-user limit. It resolves Play4u movie pages by reading their published JSON and comparing both TMDB and IMDb identity. It does not execute provider scripts, follow ad chains, or fetch arbitrary URLs. Resolution happens on play, returns `no-store`, and is not persisted because stream URLs can expire. Other provider adapters, including hash-based Hubstream episode pages and scripted HDStream pages, are not implemented; they remain external fallbacks.

All video/manifest/segment traffic goes from the browser to the media host. Vercel serves the app and the small resolution response, not a media proxy. The host can still reject playback because of CORS, referrer restrictions, expiry or outages. A successful JSON resolution is not verification of playback, language, quality or movie contents. Playback errors stay inside the app and never automatically open the provider's ad page. Existing saved links need no migration for this UI; newly discovered file links are picked up by **Fetch links**.
