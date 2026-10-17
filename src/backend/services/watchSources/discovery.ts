import "server-only";
import { load } from "cheerio";
import type { ImporterConfig } from "./config";
import { fetchSourceDocument } from "./http";
import { publicLink } from "./parser";
import type { SourceRepository } from "./store";

/** Accept only the provider's post sitemaps and single-path posts, never navigation. */
export function sitemapUrls(xml: string, baseUrl: string, index: boolean): string[] {
  const $ = load(xml, { xmlMode: true });
  const selector = index ? "sitemapindex > sitemap > loc" : "urlset > url > loc";
  return [...new Set($(selector).toArray().flatMap((node) => {
    const url = publicLink($(node).text().trim(), baseUrl);
    if (!url || url.origin !== baseUrl || url.search || url.hash) return [];
    if (index ? !/^\/post-sitemap\d*\.xml$/.test(url.pathname) :
      !/^\/[^/.]+\/$/.test(url.pathname)) return [];
    return [url.href];
  }))];
}

/** Shared cached archive discovery; no post bodies or media are loaded here. */
export async function discoverArchive(
  config: ImporterConfig, repository: SourceRepository,
  fetchDocument = fetchSourceDocument, deadline = Date.now() + 90_000,
): Promise<{ urls: string[]; errors: number }> {
  const urls = new Set<string>();
  let errors = 0;
  const signal = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
  async function read(url: string, index: boolean): Promise<string[]> {
    const cached = await repository.discovery(url);
    if (cached?.checkedAt && Date.now() - new Date(cached.checkedAt).getTime() < 6 * 3_600_000) return cached.urls;
    try {
      const response = await fetchDocument(url, config.baseUrl, cached || {}, { signal, format: "xml" });
      const found = response.html === null ? cached?.urls || [] : sitemapUrls(response.html, config.baseUrl, index);
      if (!found.length) throw new Error("Empty or unsupported source sitemap");
      await repository.saveDiscovery({ _id: url, urls: found, etag: response.etag,
        lastModified: response.lastModified, checkedAt: new Date() });
      return found;
    } catch {
      errors++;
      return cached?.urls || [];
    }
  }
  const maps = await read(`${config.baseUrl}/sitemap.xml`, true);
  // A provider cannot force an unbounded crawl. Report truncation as partial.
  const pending = maps.slice(0, 50);
  if (maps.length > pending.length) errors++;
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(config.concurrency, pending.length) }, async () => {
    while (cursor < pending.length && Date.now() < deadline) {
      for (const url of await read(pending[cursor++], false)) urls.add(url);
    }
  }));
  if (cursor < pending.length) errors++;
  return { urls: [...urls], errors };
}
