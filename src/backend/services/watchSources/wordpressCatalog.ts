import { load } from "cheerio";
import { parseSourcePage, publicLink } from "./parser";
import type { ParsedSourcePage } from "@/shared/types/watchSources";

const QUALITY = /\b(?:360|480|576|720|1080|1440|2160|4320)p\b|\b[48]K\b/i;
const SCOPE = /\bSeason\s*\d+|\bS\d{1,3}(?=E|\b)/i;
const STOP = /storyline|screenshots|trailer|related posts|comments|movie (?:info|details)|series (?:info|details)/i;

/** Follow only published content cards, never sidebar/category or ad destinations. */
export function discoverWordpressPages(html: string, baseUrl: string): string[] {
  const $ = load(html);
  const links = $(".front-view-title a[href], .entry-title a[href], a[href]:has(h1.sanket)");
  return [...new Set(links.toArray().flatMap((node) => {
    if ($(node).closest("nav,footer,aside,.related-posts,#comments").length ||
        ($(node).closest("header").length && !$(node).closest("article").length)) return [];
    const url = publicLink($(node).attr("href") || "", baseUrl);
    return url?.origin === baseUrl && !url.search && !url.hash && /^\/[^/.]+\/$/.test(url.pathname) ? [url.href] : [];
  }))];
}

/** Normalize release rows without carrying another row's episode or quality into a link. */
export function parseWordpressPage(html: string, sourceUrl: string): ParsedSourcePage {
  const $ = load(html);
  const title = ($("h1.entry-title, h1.single-title").first().text() || $("h1").first().text()).replace(/^\s*Download\s+/i, "").replace(/\(((?:19|20)\d{2})\s*[-–]\s*(?:19|20)\d{2}\)/, "($1)").trim();
  const content = $(".entry-content").first().clone();
  content.find("script,style,iframe,nav,header,footer,aside,.related-posts,.relatedPosts,#comments,.comments,.alert").remove();
  const multiSeason = /\bSeason\s+\d+\s*[-–]\s*\d+/i.test(title);
  const template = load("<main><h1></h1><h2>Download Links</h2></main>");
  template("h1").text(multiSeason ? title.replace(/\bSeason\s+\d+\s*[-–]\s*\d+/i, "Season") : title);
  const imdb = content.find("a[href]").toArray().map((node) => $(node).attr("href") || "")
    .find((href) => /^https?:\/\/(?:www\.)?imdb\.com\/title\/tt\d+/i.test(href));
  if (imdb) template("main").append(template("<a></a>").attr("href", imdb).text("IMDb"));
  const parsed = parseSourcePage(template.html(), sourceUrl);
  const links = new Map<string, ParsedSourcePage["links"][number]>();
  let metadata = "";
  let scope = "";
  let watch = false;
  content.find("h2,h3,h4,h5,h6,p,pre,a[href]").each((_, element) => {
    const node = $(element);
    const text = node.text().replace(/\s+/g, " ").trim();
    if (element.tagName !== "a") {
      if (node.find("a").length) return;
      if (STOP.test(text) && /^h[2-6]$/.test(element.tagName)) { metadata = ""; scope = ""; watch = false; return; }
      if (QUALITY.test(text) && text.length < 350) {
        metadata = text;
        if (SCOPE.test(text)) scope = text.match(/\bSeason\s*\d+|\bS\d{1,3}(?=E|\b)/i)![0];
        watch = /\bwatch\s+online|streaming links/i.test(text);
      } else if (SCOPE.test(text) && text.length < 100) {
        scope = text; metadata = "";
      } else if (/^(?:watch online|watch links|streaming links)$/i.test(text)) {
        watch = true; metadata = "";
      }
      return;
    }
    const localRow = node.closest("h3,h4,h5,h6,p,li").clone();
    localRow.find("a").remove();
    const localText = localRow.text().replace(/\s+/g, " ").trim();
    const localMetadata = localText.length < 350 ? localText : "";
    const rowMetadata = `${localMetadata} ${scope} ${metadata}`;
    // Quality mentions in prose and category links are not release buttons.
    const action = /\b(?:download|drive|episode|batch|zip|archive|watch|stream|mirror)\b|\bEP\s*[-:]?\s*\d+|\bS\d+E\d+/i.test(text);
    if ((!QUALITY.test(rowMetadata) && !watch) || !action ||
        /trailer|how to|telegram|comment|join/i.test(text)) return;
    const url = publicLink(node.attr("href") || "", sourceUrl);
    if (!url || url.origin === new URL(sourceUrl).origin) return;
    const row = load(template.html());
    row("h2").text(watch ? "Watch Links" : "Download Links");
    row("main").append(row("<h3></h3>").text(rowMetadata));
    // Each anchor gets its own row; Episode 2 must not inherit Episode 1 from a shared paragraph.
    const block = row("<p></p>").text(`${rowMetadata} `);
    block.append(row("<a></a>").attr("href", url.href).text(text));
    row("main").append(block);
    for (const link of parseSourcePage(row.html(), sourceUrl).links) {
      // A file-size beside E01 describes that file, not every adjacent episode button.
      const metadataEpisode = metadata.match(/\bS\d{1,3}E(\d{1,4})\b/i);
      if (metadataEpisode && link.episode !== Number(metadataEpisode[1])) link.size = null;
      if (/batch|zip|archive/i.test(text) && !/batch|zip|archive|\.rar\b|pack/i.test(metadata)) link.size = null;
      links.set(link.id, link);
    }
  });
  return { ...parsed, season: multiSeason ? null : parsed.season, links: [...links.values()] };
}
