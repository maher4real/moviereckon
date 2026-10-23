import { describe, expect, it, vi } from "vitest";
import { fetchContentSources } from "./contentImport";
import { emptyImportSummary } from "./importer";
import type { ImporterConfig } from "./config";

describe("per-title search across additional catalogs", () => {
  it.each(["moviesmod", "bollyflix", "uhdmovies"] as const)("imports identity-matched movies and series from %s download-prefixed slugs", async (provider) => {
    const config: ImporterConfig = { provider, baseUrl: "https://catalog.example", batchSize: 20, concurrency: 3, discoveryPages: 1, refreshHours: 24, budgetMs: 210_000 };
    for (const type of ["movie", "tv"] as const) {
      const url = `${config.baseUrl}/download-example-${type}/`;
      const wrong = `${config.baseUrl}/download-example-wrong/`;
      const body = `<h1>Download Example ${type === "movie" ? "(2025)" : "(Season 1-2)"}</h1><div class="entry-content">
        <a href="https://imdb.com/title/tt1234567/">IMDb</a><h3>${type === "tv" ? "Season 2 Episode 3" : "Example"} 720p x264</h3>
        <a href="https://files.example/download">Download Links</a></div>`;
      const saved = { contentId: 42, contentType: type, sources: [] };
      const deps = {
        identity: vi.fn().mockResolvedValue({ title: "Example", originalTitle: "Example", imdbId: "tt1234567" }),
        lookup: vi.fn().mockResolvedValue(saved), repository: vi.fn().mockResolvedValue({}),
        archive: vi.fn(), match: vi.fn(),
        fetchDocument: vi.fn(async (value: string) => ({ html: value === url ? body : value === wrong ? body.replace("tt1234567", "tt9999999") :
          `<article><header><h2 class="front-view-title"><a href="${url}">Example</a></h2><h2 class="entry-title"><a href="${wrong}">Example</a></h2></header></article>`, etag: null, lastModified: null })),
        run: vi.fn().mockResolvedValue({ ...emptyImportSummary(), matched: 1, processed: 1 }),
      };
      const result = await fetchContentSources(42, type, undefined, config, deps);
      expect(result).toMatchObject({ status: "imported", importedPages: 1, errors: 0 });
      expect(deps.run.mock.calls[0][0].urls).toEqual([url]);
      expect(deps.archive).not.toHaveBeenCalled();
      expect(deps.match).not.toHaveBeenCalled();
    }
  });
});
