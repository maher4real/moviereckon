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
| `HDHUB_BASE_URL` | `https://new8.hdhub4u.cl` | Current public HTTPS origin |
| `WATCH_IMPORTER_ENABLED` | enabled | Set `false` to disable imports |
| `WATCH_IMPORT_BATCH_SIZE` | 20 | Max post jobs per invocation; range 1–100 |
| `WATCH_IMPORT_CONCURRENCY` | 3 | Parallel post workers; range 1–5 |
| `WATCH_IMPORT_DISCOVERY_PAGES` | 2 | Recent index pages; range 1–10 |
| `WATCH_IMPORT_REFRESH_HOURS` | 24 | Refresh interval for matched pages; range 1–168 |

The current public WordPress REST posts endpoint returned 403 during verification,
so discovery uses the published `/sitemap.xml` post indexes, supplemented by the home page and `/page/2/` etc. Archive indexes are cached in MongoDB for six hours, with conditional revalidation and stale snapshots on failure. Traversal is limited to 50 same-origin post sitemaps and a 90-second discovery budget; incomplete coverage is reported as partial. A read-only live check on 2026-10-17 found 14,260 post URLs across 15 post sitemaps in 8.2 seconds. Only same-origin post paths
are queued. Request timeouts, response size limits and redirect restrictions
bound fetches. The importer does not execute source scripts or fetch video files.

`vercel.json` schedules one daily production invocation at 00:00 UTC. This works
with [Vercel Hobby's daily cron limit](https://vercel.com/docs/cron-jobs/usage-and-pricing). For hourly imports on a plan supporting
them, change the schedule to `0 * * * *`. An external scheduler can also call
the protected GET endpoint hourly. Vercel sends `Authorization: Bearer CRON_SECRET`
automatically, as described in [Vercel's cron authentication documentation](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs); an external scheduler must supply that header. Local development
does not run cron automatically.

## Run and preview

Signed-in users open **Watch movie / Watch series** on a detail page. A popup searches that TMDB title automatically and streams saved and newly matched results into separate Watch and Download tabs. Season and episode buttons open the same popup with the matching scope selected. Other provider pages are listed directly below supported actions.

The button calls `POST /api/watch-sources/fetch` using the existing HttpOnly
user session, a trusted Origin and the AJAX header. It never receives the cron
secret. The server requires authentication and limits each user to
six requests per minute. `TMDB_API_KEY` and `MONGODB_URI` are required; `CRON_SECRET`
is only needed by the scheduled/bearer endpoint below.

Automatic per-title discovery checks previously saved source pages, all cached post sitemap entries, and the configured recent-release index pages. Original and display titles select candidates; IMDb/TMDB identity still determines whether a page belongs to the selected title. Up to 100 matching candidate pages are checked per request; a limit or deadline cutoff reports partial coverage. HDHub's JS search proxy returned 403 to
server requests during verification. For a title missing from the published indexes, submit
its source-page URL through the authenticated endpoint's optional `sourceUrl` field. The server fetches
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

`GET /api/import/watch-sources` discovers archive and recent pages, enqueues them, and
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
No missing episodes are synthesized. Movie, series, season and episode controls
open the same lazy popup with the selected scope. The popup shares one cached
snapshot per title; it does not request each episode separately. Saved and newly
matched results update that cache while the search runs. Detail pages make no
watch-source request before the popup opens. These controls are available to
signed-in viewers and are separate from Cinema administration.

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
Archive URLs enter the durable queue; each scheduled run processes a bounded batch, so initial catalog import completes over multiple runs. Per-title fetch checks matching archive candidates immediately without importing unrelated titles.
Source layout changes may require parser updates, and scraping success does not
establish whether third-party playback or iframe embedding works.

## Direct playback and external pages

### Python resolver and deferred UI

Movie/series details render without importing the watch-source module or making a saved-source request. Clicking **Watch movie**, **Watch series**, or a scoped season/episode control loads the popup and starts its search. A circular indicator appears during loading. Every episode uses the same cached title snapshot, and mounting/focusing another episode does not trigger another refresh. Search results cancel any pending saved read before replacing that cache, so a late read cannot overwrite fresh links.

Search runs inside the lazy popup with loading, retry, cached results and separate Watch/Download tabs. Download qualities display as rows; **Get file link** checks only the selected file, then reveals its download action. Fetching/importing a title never resolves all final files in parallel.

`scripts/resolve_watch_links.py` is an independent Python 3.10+ resolver using the standard library. It accepts one JSON object `{ "title": "The Trap", "link": { ...savedWatchSourceLink } }` on stdin and returns `{ "downloads": [...] }`. Use `npm run resolve:links < /path/to/input.json`. It preserves the provider allowlists, title/episode/quality/codec matching, expiry checks, document caps and headers/one-byte probes used by the TypeScript resolver. It executes no third-party scripts and downloads no full media files.

`WATCH_SOURCE_RESOLVER=auto` starts the Python script only when a local **Get file link** request arrives, and uses TypeScript if Python is absent. `WATCH_SOURCE_RESOLVER=typescript` explicitly selects the existing engine. `WATCH_SOURCE_RESOLVER=python` requires a working Python executable locally or a configured worker. Each request selects one engine; a provider failure does not launch a second scrape in another language. No Python process starts during page loading or an ordinary saved-source lookup.

On Vercel, do not assume Python can be spawned inside a Node.js function. To use Python there, run `npm run worker:links` on a separate Python host, set `WATCH_SOURCE_PYTHON_SECRET` (32+ characters) on both services, and set `WATCH_SOURCE_PYTHON_URL=https://your-worker/resolve` on the app. The worker binds to `127.0.0.1:8765` by default; use a TLS reverse proxy for remote access. It accepts authenticated POST requests only and limits active resolutions to two. Without a worker, auto mode retains TypeScript on Vercel. `WATCH_SOURCE_PYTHON_BIN` selects a local executable. `WATCH_SOURCE_CA_BUNDLE` adds a trusted CA bundle; TLS verification always remains enabled.

Run Python checks with `python3 -B -m unittest discover -s scripts -p '*_test.py'`.

**Get file link** resolves supported HubCDN, HubDrive, directly published HubCloud and GreenMotors-wrapped downloads on demand. GreenMotors is decoded as bounded data: the observed payload selects either one supported provider file page or one `hblinks.lol/archives/<id>` page, whose content-area links expose supported mirrors. The resolver skips the advertising landing page, tries all bounded trusted mirrors under one deadline, preserves original title/quality/episode metadata, and deduplicates final file destinations (up to eight). HubCDN's published redirect data is decoded without loading its advertising page; HubDrive's file button is followed only through the known HubCloud and Gamerxyt paths. Only published R2 storage buttons and the exact `video-downloads.googleusercontent.com` host are considered. Returned filenames must match the selected title, season/episode or season pack, resolution and known codec. Newly parsed movie links also bind the release year immediately after the normalized title so remakes and longer sequel titles cannot substitute for the movie; TV episode matching uses season/episode rather than a series release year. A HEAD probe (or a one-byte range for a signed GET URL) checks file headers and availability. A 405/501 HEAD response retries once with a ranged GET. When Content-Disposition is absent, the URL basename may supply the filename, but the same title, episode, quality, codec, and MIME checks still apply. Underscore-separated release metadata is supported. HTML responses, redirects, wrong episodes, ambiguous targets and expired URLs are rejected. This checks filenames/headers, not the movie's contents. The final file goes directly from the storage host to the viewer; the API never buffers/proxies the full video. File links are generated when requested and can be refreshed because signed URLs expire. Other domains and unsupported/challenged flows retain their external-page option.

The document CSP allows HTTPS connections/media and local blob media/workers so HLS can run after SPA navigation. This broadens the connection/media destinations for rotating media hosts; script nonces and the existing frame allowlist remain enforced. No provider scripts are embedded in the player.

Imported labels such as WATCH or 1080p describe the publisher's link; they do not prove that the URL is a working video. Most saved URLs lead to third-party player/download pages. Unsupported pages appear directly below supported actions in each popup tab, labelled **Other provider pages · may show ads**.

**Play here** uses a native video element for HTTPS MP4/WebM files and lazily loaded hls.js for HLS, with native HLS as a compatibility fallback. It supports movie links and explicitly scoped single-episode links. Season packs and episode ranges are never substituted for a single episode. HLS quality and audio choices come from the actual manifest. Published MP4/WebM, MKV/MOV/AVI and ZIP/RAR/7z URLs have **Open / save file**; cross-origin servers and browsers determine whether they save or open. HLS manifests are not offered as movie downloads.

The signed-in `POST /api/watch-sources/resolve` endpoint accepts only a content ID/type and saved link ID, with origin/AJAX checks and a 20/minute per-user limit. It resolves Play4u movie pages by reading their published JSON and comparing both TMDB and IMDb identity. It does not execute provider scripts, follow ad chains, or fetch arbitrary URLs. Resolution happens on play, returns `no-store`, and is not persisted because stream URLs can expire. HDStream movie and single-episode pages are also supported: a bounded dictionary decoder reads the published JSON `links` object as text and never evaluates the packed player or advertising code. Provider-origin proxy alternatives are excluded because the observed endpoint omits CORS headers despite HTTP 200; the direct CDN master retains its actual quality variants. Hash-based HubStream links are also supported. The resolver reads the fixed-origin encrypted info/video API using its published HTTPS response protocol and checks both filenames, the saved ID and returned swarm ID. It follows the published TikTok configuration to read a master and up to two complete media playlists (1 MiB each), accepting only the observed signed CDN URL structure and fresh tokens. A capped 1 KiB range probe checks each variant's first segment for CORS and MPEG-TS packet sync. Validated playlist text travels in the resolution response and becomes a temporary browser Blob, released when the player closes. hls.js omits the app referrer where required. No provider script executes and no video segment is proxied; unverified or blocked alternatives are excluded.

Video segments and ordinary manifests travel directly from browser to media host. HubStream's bounded playlist metadata uses the resolution response because its playlist endpoint omits browser CORS headers. Vercel serves the app and resolution metadata, with at most a capped first-segment probe; it does not proxy playback. The host can still reject playback because of CORS, referrer restrictions, expiry or outages. A successful JSON resolution is not verification of playback, language, quality or movie contents. Playback errors stay inside the app and never automatically open the provider's ad page. Existing saved links need no migration for this UI; newly discovered file links are picked up when the popup searches or **Search again** is used.

Resolved MP4/WebM downloads also offer **Play here** without opening the provider page. Other formats remain downloads. Expired signed file links disappear from the UI and show a refresh action. Browser/host behavior still determines whether a cross-origin file saves or opens; filename and header checks cannot establish the actual video contents.


### Popup search and multiple catalogs

The detail page renders only a **Watch movie / Watch series** button (or a scoped season/episode button). Opening it mounts the query code and starts an authenticated NDJSON search. Saved links appear first; validated pages appear as they are persisted. Watch and Download tabs separate actionable sources; other provider pages appear directly below the actionable sources, with clear availability labels. Final media URLs are resolved only on Play/Get file link, so expiring links are fresh. Closing the popup cancels the browser request; any completed import writes stay saved. Reopening within two minutes reuses the search result; Search again explicitly refreshes it.

HDHub uses its archive sitemaps and recent releases. 4KHDHub uses its title search and recent content cards, with independent persistent queues and leases. Both require a unique IMDb or exact title/year TMDB match. Set `WATCH_4KHDHUB_ENABLED=false` to disable the secondary catalog. Its unsupported redirect pages are not represented as confirmed downloads. No provider is guaranteed to publish every title or every release.

### Frequent new-release sync

Scheduled imports reserve up to 75% of each batch for due recent releases and the remainder for older archive work. Recent matched releases refresh hourly; other matched pages use `WATCH_IMPORT_REFRESH_HOURS`. Failed pages keep their last good data and back off. This prevents a large archive from starving new titles.

The existing daily Vercel cron remains compatible with Hobby scheduling. For more frequent discovery, `.github/workflows/watch-sources.yml` provides an opt-in 15-minute schedule and a manual trigger. After deploying, configure:

- Repository variable `WATCH_IMPORT_ORIGIN`: your deployed HTTPS origin, without a trailing slash.
- Repository secret `WATCH_IMPORT_CRON_SECRET`: the same value as deployment `CRON_SECRET` (minimum 32 characters).

The workflow is inactive until the origin variable is set. It has no checkout/write permissions and prevents overlapping runs. GitHub schedules can be delayed; discovery is eventual, not instantaneous. Each call runs bounded batches, so a full archive backfill takes multiple runs. Opening a title's popup also searches that title directly, independently of backfill progress.


### Content-wise resolution verification

All automatic searches, including JSON and streamed responses, now query the enabled independent catalogs. Saved sources are emitted even when TMDB identity lookup fails, preserving already available results. Collection and final media resolution remain separate: opening a detail page performs neither; the popup searches when opened, and a particular file/player resolves only when requested.

REA investigation of Prahaar identified all nine published entries, including two formerly unsupported GreenMotors downloads and HubStream Player-2. Backend file validation and browser playback verification are recorded separately; a successful playlist request alone does not prove playback. Evidence references:

- GreenMotors redirect data and three-mirror archive: `ev_7ff0b2f5d7d7979df7eebccb5c576e58b7818bd283c4d5805115a74be719cf47`, `ev_a1549ac606504fb28f0a75ca2e906c1ea5fe92a3e06ea81af581d37929f0a96b`.
- HubStream API/title and manifest discovery: `ev_f3ff502450135221f9d75e53a7aea673bfadd2291461472b1cbee0e4c6c17e34`.

These are provider-specific adapters, reusable across matching content, rather than an unconditional promise of every internet host. Provider protocol changes, challenges, deleted files and unavailable releases remain possible. Automated checks cover filenames, HTTP headers/ranges and HLS playlists; they do not establish the video contents, language or complete playback.

Live verification on 2026-10-17 found all nine published Prahaar entries: seven download rows resolving to 13 final file mirrors, plus HDStream and HubStream watch providers. Chrome playback advanced for HDStream and both HubStream qualities (720p and 1080p). UI checks used fixture API responses with real media, confirmed no requests before opening the popup, and checked desktop/mobile layouts; they did not establish live authentication, TMDB or MongoDB coverage. Downloads were validated by matching filenames and file headers, not by downloading entire films. A separate GreenMotors entry from the Weapons 4K catalog also resolved through its directly wrapped HubCloud destination. HubStream's blocked native-media route and HDStream's CORS-incompatible proxy are not offered as working fallbacks.

### Additional providers

The popup also searches **MoviesMod**, **BollyFlix**, and **UHDMovies**. Each catalog
has its own queue identity and lease, runs independently, and must pass the same
IMDb/TMDB or exact title/year matching checks before its links are saved. The
WordPress adapters read published release rows, retain quality/codec/size and
explicit season/episode scope, and exclude navigation, recommendations and trailers.
Search uses each catalog's public title search and recent pages. Download-prefixed
post slugs are normalized for candidate selection; a title match alone never
establishes identity. These catalogs also participate in scheduled imports.

| Variable | Default |
| --- | --- |
| `MOVIESMOD_BASE_URL` | `https://moviesmod.uk.com` |
| `BOLLYFLIX_BASE_URL` | `https://bollyflix.co.za` |
| `UHDMOVIES_BASE_URL` | `https://uhdmovies.us.org` |
| `FOUR_KHDHUB_BASE_URL` | `https://4khdhub.one` |

Use `WATCH_MOVIESMOD_ENABLED=false`, `WATCH_BOLLYFLIX_ENABLED=false`,
`WATCH_UHDMOVIES_ENABLED=false`, or `WATCH_4KHDHUB_ENABLED=false` to disable a
catalog independently. Origin overrides must be public HTTPS origins; cross-origin
redirects remain rejected. The origins and published movie/series layouts were
checked on 2026-10-23. Domain rotation requires updating the corresponding setting.

**More watch providers** adds [VidLink](https://vidlink.pro/#api) using its
documented TMDB movie and exact-episode routes. These are external player choices,
labeled as availability unverified, not imported or verified media. Series viewing
requires a selected episode or the Watch action on an episode detail. An unselected
episode never defaults to episode one. The providers open only when clicked, in a new tab without an opener
or app referrer. No iframe or provider scripts are added to MovieReckon.

Published download buttons from the new catalogs may lead to link collections or
external pages. The existing direct-file resolver still accepts only its supported
hosts and validates filenames and headers. New external pages are not presented
as verified direct downloads; no general-purpose ad-chain traversal was added.

Series identity handling also reads 4KHDHub's title-matched Open Graph year and
normalizes explicit series year ranges to their first broadcast year. This avoids
losing otherwise valid series releases without weakening unique title/year matching.

VidSrc and VidFast were evaluated but excluded: direct VidSrc launches became blank
pages, and VidFast returned a blocked response in the test browser. VidLink loaded
matching movie and episode media and advanced playback for Weapons and Breaking Bad
S1 E1 during a short browser check on 2026-10-23. The check used keyboard playback
controls because an ad overlay intercepted pointer clicks; third-party ads and
availability remain provider-controlled. Published catalog links are not guarantees of final-file access.
