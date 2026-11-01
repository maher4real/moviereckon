import { load } from "cheerio";
import { z } from "zod";
import type { ImporterConfig } from "./config";
import { fetchSourceDocument } from "./http";
import { publicLink } from "./parser";
import { parseWordpressPage } from "./wordpressCatalog";

export function additionalPostUrl(value: string, config: ImporterConfig): string | null {
  const url = publicLink(value, config.baseUrl);
  const path = config.provider === "movies4u" ? /^\/\d+-[^/]+\.html$/ : /^\/download-[^/.]+\/$/;
  return url?.origin === config.baseUrl && !url.search && !url.hash && path.test(url.pathname) ? url.href : null;
}

export function discoverAdditionalPages(html: string, config: ImporterConfig): string[] {
  const $ = load(html);
  const selector = config.provider === "movies4u" ? "article.post a[href]" : ".movies-grid > a[href]";
  return [...new Set($(selector).toArray().flatMap((node) => {
    if ($(node).closest("nav,aside,footer,.related-posts,#comments").length) return [];
    const url = additionalPostUrl($(node).attr("href") || "", config);
    return url ? [url] : [];
  }))];
}

export function parseAdditionalPage(html: string, sourceUrl: string, config: ImporterConfig) {
  const $ = load(html);
  const page = load('<h1></h1><div class="entry-content"></div>');
  const title = config.provider === "movies4u" ? $(".single-service-content h1").first().text() : $("h1.post-title").first().text();
  // Movies4U prints the release year without parentheses.
  page("h1").text(title.replace(/^(.*?)\s+((?:19|20)\d{2})(?=\s|$)/, "$1 ($2)"));
  const content = $(config.provider === "movies4u" ? ".download-links-div" : "main.page-body").first().clone();
  content.find("script,style,iframe,nav,aside,footer,.related-posts,#comments").remove();
  page(".entry-content").html(content.html() || "");
  return parseWordpressPage(page.html(), sourceUrl);
}

const searchSchema = z.object({ found: z.number().int().nonnegative(),
  hits: z.array(z.object({ document: z.object({ permalink: z.string() }) })).max(100), search_cutoff: z.boolean().optional() });

/** Both sites have custom search; WordPress's ?s= query returns a shell/homepage. */
export async function searchAdditionalCatalog(titles: string[], config: ImporterConfig, fetchDocument = fetchSourceDocument,
  deadline = Date.now() + 60_000): Promise<{ urls: string[]; errors: number }> {
  const urls = new Set<string>();
  let errors = 0;
  const signal = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
  for (const title of [...new Set(titles)].filter(Boolean)) {
    let received = 0;
    for (let page = 1; page <= 5; page++) {
      if (Date.now() >= deadline) { errors++; break; }
      try {
        const movies4u = config.provider === "movies4u";
        const query = movies4u ? `/index.php?do=search&subaction=search&story=${encodeURIComponent(title)}&search_start=${page}` :
          `/ts-search.php?q=${encodeURIComponent(title)}&page=${page}`;
        const response = await fetchDocument(config.baseUrl + query, config.baseUrl, {}, { signal, format: movies4u ? "html" : "json" });
        let more: boolean;
        if (movies4u) {
          const $ = load(response.html || "");
          if (!$("section.site-main, article.post").length) throw new Error("Unrecognized Movies4U search response");
          discoverAdditionalPages(response.html || "", config).forEach((url) => urls.add(url));
          // Inspect published page numbers as data; never execute provider scripts.
          more = $(".navigation a[onclick]").toArray().some((node) =>
            Number(($(node).attr("onclick") || "").match(/list_submit\((\d+)\)/)?.[1]) > page);
        } else {
          const result = searchSchema.parse(JSON.parse(response.html || "null"));
          for (const hit of result.hits) {
            const url = additionalPostUrl(hit.document.permalink, config);
            if (url) urls.add(url);
          }
          received += result.hits.length;
          if (result.search_cutoff) errors++;
          more = received < result.found;
          if (more && !result.hits.length) { errors++; break; }
        }
        if (!more) break;
        if (page === 5) errors++;
      } catch { errors++; break; }
    }
  }
  return { urls: [...urls], errors };
}
