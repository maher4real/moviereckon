import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchContentSources } from "./contentImport";
import { emptyImportSummary } from "./importer";
import type { SourceResponse } from "./http";

const config = { baseUrl: "https://new7.hdhub4u.cl", batchSize: 20, concurrency: 3, discoveryPages: 1, refreshHours: 24, budgetMs: 210_000 };
const movieUrl = `${config.baseUrl}/weapons-2025-hindi-studio-dub-bluray-full-movie/`;
const olderUrl = `${config.baseUrl}/weapons-1999-full-movie/`;
const html = readFileSync(`${process.cwd()}/src/backend/services/watchSources/fixtures/movie.html`, "utf8");
const saved = { contentId: 1078605, contentType: "movie" as const, sources: [] };

function dependencies() {
  return {
    identity: vi.fn().mockResolvedValue({ title: "Weapons", originalTitle: "Weapons", imdbId: "tt26581740" }),
    lookup: vi.fn().mockResolvedValue(saved),
    repository: vi.fn().mockResolvedValue({}),
    archive: vi.fn().mockResolvedValue({ urls: [], errors: 0 }),
    fetchDocument: vi.fn(async (url: string): Promise<SourceResponse> => ({ html: url === `${config.baseUrl}/` ?
      `<a href="${movieUrl}">Weapons</a><a href="${olderUrl}">Weapons</a>` :
      url === olderUrl ? html.replaceAll("tt26581740", "tt0000001") : html,
      etag: '"v1"', lastModified: null })),
    match: vi.fn(),
    run: vi.fn().mockResolvedValue({ ...emptyImportSummary(), matched: 1, processed: 1 }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("fetch links for one title", () => {
  it("emits all saved sources even if identity lookup fails before the saved read completes", async () => {
    const deps = dependencies();
    deps.identity.mockRejectedValue(new Error("TMDB unavailable"));
    let finish!: (value: typeof saved) => void;
    deps.lookup.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const emit = vi.fn();
    let settled = false;
    const search = fetchContentSources(1078605, "movie", undefined, config, deps, emit).catch((error) => { settled = true; return error; });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish(saved);
    expect(await search).toBeInstanceOf(Error);
    expect(emit).toHaveBeenCalledWith({ type: "content", content: saved });
    expect(deps.run).not.toHaveBeenCalled();
  });

  it("imports only candidates matching the selected IMDb/TMDB identity and reuses fetched HTML", async () => {
    const deps = dependencies();
    const result = await fetchContentSources(1078605, "movie", undefined, config, deps);
    expect(result).toMatchObject({ status: "imported", importedPages: 1 });
    expect(deps.run.mock.calls[0][0]).toEqual({ urls: [movieUrl], expectedContent: { tmdbId: 1078605, mediaType: "movie" } });
    expect(deps.match).not.toHaveBeenCalled();
    const importerDependencies = deps.run.mock.calls[0][2];
    expect(await importerDependencies.fetchDocument(movieUrl)).toMatchObject({ html, etag: '"v1"' });
    await expect(importerDependencies.fetchDocument(olderUrl)).rejects.toThrow("not validated");
    expect(deps.fetchDocument).toHaveBeenCalledTimes(3);
  });

  it("imports archived releases beyond the old twelve-candidate cap and reports incomplete discovery", async () => {
    const deps = dependencies();
    const urls = Array.from({ length: 15 }, (_, i) => `${config.baseUrl}/weapons-2025-release-${i}/`);
    deps.archive.mockResolvedValue({ urls, errors: 1 });
    deps.fetchDocument.mockImplementation(async (url) => ({ html: url === `${config.baseUrl}/` ? "" : html, etag: null, lastModified: null }));
    const result = await fetchContentSources(1078605, "movie", undefined, config, deps);
    expect(result.status).toBe("partial");
    expect(deps.run.mock.calls[0][0].urls).toHaveLength(15);
  });

  it("rejects a supplied page for another title without writing mappings", async () => {
    const deps = dependencies();
    await expect(fetchContentSources(1078605, "movie", olderUrl, config, deps)).rejects.toThrow("does not match");
    expect(deps.run).not.toHaveBeenCalled();
    expect(deps.repository).not.toHaveBeenCalled();
  });

  it("does not attach a page merely because its title matches", async () => {
    const deps = dependencies();
    deps.identity.mockResolvedValue({ title: "Weapons", originalTitle: "Weapons", imdbId: null });
    deps.match.mockResolvedValue({ status: "matched", match: { tmdbId: 999, mediaType: "movie", method: "title-year" }, reason: null });
    expect(await fetchContentSources(1078605, "movie", undefined, config, deps)).toMatchObject({ status: "not_found" });
    expect(deps.run).not.toHaveBeenCalled();
  });

  it("refreshes saved source pages even when they are no longer in recent releases", async () => {
    const deps = dependencies();
    deps.lookup.mockResolvedValue({ ...saved, sources: [{ sourcePage: movieUrl }] });
    deps.fetchDocument.mockImplementation(async (url) => ({ html: url === `${config.baseUrl}/` ? "<html>No recent releases</html>" : html, etag: null, lastModified: null }));
    expect(await fetchContentSources(1078605, "movie", undefined, config, deps)).toMatchObject({ status: "imported" });
    expect(deps.run.mock.calls[0][0].urls).toEqual([movieUrl]);
  });

  it("reports upstream failures and overlapping imports without claiming success", async () => {
    const deps = dependencies();
    deps.fetchDocument.mockRejectedValueOnce(new Error("source unavailable"));
    expect(await fetchContentSources(1078605, "movie", undefined, config, deps)).toMatchObject({ status: "partial", errors: 1, importedPages: 0 });
    deps.run.mockResolvedValue({ ...emptyImportSummary(), skipped: true });
    expect(await fetchContentSources(1078605, "movie", movieUrl, config, deps)).toMatchObject({ status: "busy", importedPages: 0 });
  });
});
