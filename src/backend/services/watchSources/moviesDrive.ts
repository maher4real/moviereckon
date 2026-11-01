import { load } from "cheerio";
import { z } from "zod";
import type { WatchSourceLink } from "@/shared/types/watchSources";
import { isMoviesDriveArchive, isResolvableDownload } from "@/shared/lib/watchSources";
import type { ImporterConfig } from "./config";
import { canonicalMoviesDriveArchive, fetchMoviesDriveDocument, moviesDriveDomainPolicy } from "./moviesDriveDomains";
import { normalizeSourceTitle, parseSourcePage, publicLink } from "./parser";
import { parseWordpressPage } from "./wordpressCatalog";

function postUrl(value: string, baseUrl: string): string | null {
  const url = publicLink(value, baseUrl);
  return url && moviesDriveDomainPolicy("catalog", baseUrl).allows(url.origin) && !url.search && !url.hash &&
    /^\/[^/.]+\/$/.test(url.pathname) ? new URL(url.pathname, baseUrl).href : null;
}

export function discoverMoviesDrivePages(html: string, baseUrl: string): string[] {
  const $ = load(html);
  return [...new Set($(".movies-grid > a[href]:has(.poster-card), .entry-title a[href]").toArray().flatMap((node) => {
    if ($(node).closest("nav,aside,footer,.related-posts,#comments").length) return [];
    const url = postUrl($(node).attr("href") || "", baseUrl);
    return url ? [url] : [];
  }))];
}

const searchSchema = z.object({
  found: z.number().int().nonnegative(),
  hits: z.array(z.object({ document: z.object({ permalink: z.string() }) })).max(100),
  search_cutoff: z.boolean().optional(),
});

/** The normal WordPress search redirects to an empty JS shell; use its public JSON endpoint. */
export async function searchMoviesDrive(
  titles: string[], config: ImporterConfig, fetchDocument = fetchMoviesDriveDocument,
  deadline = Date.now() + 60_000,
): Promise<{ urls: string[]; errors: number }> {
  const urls = new Set<string>();
  let errors = 0;
  const signal = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
  for (const title of [...new Set(titles)].filter(Boolean)) {
    let received = 0;
    for (let page = 1; page <= 5; page++) {
      if (Date.now() >= deadline) { errors++; break; }
      try {
        const response = await fetchDocument(`${config.baseUrl}/search.php?q=${encodeURIComponent(title)}&page=${page}`,
          config.baseUrl, {}, { format: "json", signal });
        const result = searchSchema.parse(JSON.parse(response.html || "null"));
        for (const hit of result.hits) {
          const url = postUrl(hit.document.permalink, config.baseUrl);
          if (url) urls.add(url);
        }
        received += result.hits.length;
        if (result.search_cutoff) errors++;
        if (received >= result.found) break;
        if (!result.hits.length || page === 5) { errors++; break; }
      } catch { errors++; break; }
    }
  }
  return { urls: [...urls], errors };
}

/** Only release buttons in the post body; quality/category navigation is excluded. */
export function parseMoviesDrivePage(html: string, sourceUrl: string) {
  const $ = load(html);
  const page = load('<h1></h1><div class="entry-content"></div>');
  page("h1").text($("h1.entry-title, .post-header h1, h1.single-title").first().text() || $("h1").first().text());
  const content = $("main.page-body, .entry-content").first().clone();
  content.find("script,style,iframe,nav,aside,footer,.post-tags,.related-posts,#comments").remove();
  content.find("a[href]").each((_, node) => {
    const anchor = $(node);
    const archive = canonicalMoviesDriveArchive(anchor.attr("href") || "");
    if (!archive) return;
    anchor.attr("href", archive);
    // Published quality buttons have no 'Download' text and use underscores between tokens.
    anchor.text(`Download ${anchor.text().replace(/_/g, " ")}`);
  });
  page(".entry-content").html(content.html() || "");
  // Metadata may be entirely inside the button, rather than a preceding heading.
  page("a[href]").each((_, node) => {
    const anchor = page(node);
    if (isMoviesDriveArchive(anchor.attr("href") || "")) {
      anchor.parent().before(page("<h3></h3>").text(anchor.text()));
    }
  });
  return parseWordpressPage(page.html(), sourceUrl);
}

/** Expand image-only file buttons, retaining the selected release's metadata for final verification. */
export function moviesDriveMirrors(html: string, link: WatchSourceLink, title: string): WatchSourceLink[] {
  if (!isMoviesDriveArchive(link.url)) return [];
  const $ = load(html);
  const heading = $("h1.entry-title").first().text();
  const identityPage = load("<h1></h1>");
  identityPage("h1").text(heading.replace(/_/g, " "));
  const identity = parseSourcePage(identityPage.html(), link.url);
  if (normalizeSourceTitle(identity.title) !== normalizeSourceTitle(title) ||
      (link.releaseYear && identity.year !== link.releaseYear)) throw new Error("MoviesDrive file page does not match this title");
  const mirrors = new Map<string, WatchSourceLink>();
  $(".entry-content a[href]").each((_, node) => {
    if ($(node).closest("nav,aside,footer,.related-posts,#comments").length) return;
    const url = publicLink($(node).attr("href") || "", link.url);
    if (!url || isMoviesDriveArchive(url.href)) return;
    const mirror = { ...link, url: url.href, host: url.hostname };
    if (isResolvableDownload(mirror)) mirrors.set(url.href, mirror);
  });
  return [...mirrors.values()].slice(0, 3);
}
