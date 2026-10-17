import { load } from "cheerio";
import type { ImporterConfig } from "./config";
import { discoverSourcePages, parseSourcePage, publicLink } from "./parser";

export const FOUR_K_ORIGIN = "https://4khdhub.one";
export const catalogProvider = (config: ImporterConfig) => config.provider || "hdhub";

export function discoverCatalogPages(html: string, config: ImporterConfig): string[] {
  if (catalogProvider(config) === "hdhub") return discoverSourcePages(html, config.baseUrl);
  const $ = load(html);
  return [...new Set($("a.movie-card[href]").toArray().flatMap((node) => {
    const url = publicLink($(node).attr("href") || "", config.baseUrl);
    return url?.origin === config.baseUrl && !url.search && !url.hash &&
      /^\/[^/]+-(?:movie|series)-\d+\/$/.test(url.pathname) ? [url.href] : [];
  }))];
}

export function parseCatalogPage(html: string, url: string, config: ImporterConfig) {
  if (catalogProvider(config) === "hdhub") return parseSourcePage(html, url);
  const $ = load(html);
  // Adapt only published file rows. Never include related titles or navigation.
  const page = load("<main><h1></h1><h2>Download Links</h2></main>");
  let title = $("h1").first().text();
  if (/-series-\d+\/$/.test(new URL(url).pathname)) title += " Series";
  page("h1").text(title);
  $(".download-item").each((_, row) => {
    const metadata = $(row).find(".file-title").first().text() || $(row).find(".download-header").text();
    const heading = page("<h3></h3>").text(metadata);
    page("main").append(heading);
    $(row).find("a[href]").each((_, node) => {
      const block = page("<p></p>").text(`${metadata} ${$(row).find(".download-header").text()} `);
      block.append(page("<a></a>").attr("href", $(node).attr("href") || "").text($(node).text()));
      page("main").append(block);
    });
  });
  return parseSourcePage(page.html(), url);
}

export const catalogIndexUrl = (config: ImporterConfig, page: number) =>
  `${config.baseUrl}${page === 1 ? "/" : catalogProvider(config) === "4khdhub" ? `/?pagex=${page}` : `/page/${page}/`}`;
