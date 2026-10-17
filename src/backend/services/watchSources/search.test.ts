import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./contentImport", () => ({ fetchContentSources: mocks.fetch }));
import { searchContentSources } from "./search";
const config = { baseUrl: "https://new8.hdhub4u.cl", batchSize: 20, concurrency: 3, discoveryPages: 2, refreshHours: 24, budgetMs: 210000 };
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
describe("independent catalog searches", () => {
  it("keeps streamed results when another catalog fails or returns an older snapshot", async () => {
    vi.stubEnv("WATCH_4KHDHUB_ENABLED", "true");
    const source = { provider: "hdhub", sourcePage: "https://new8.hdhub4u.cl/title/", checkedAt: "2026-10-17T00:00:00Z", title: "Example", links: [] };
    const content = { contentId: 42, contentType: "movie", sources: [source] };
    mocks.fetch.mockImplementation(async (_id, _type, _url, catalog, _deps, emit) => {
      if (catalog.provider === "4khdhub") throw new Error("offline");
      emit({ type: "content", content });
      return { status: "imported", importedPages: 1, errors: 0, content: { ...content, sources: [{ ...source, checkedAt: "2026-10-16T00:00:00Z" }] } };
    });
    const result = await searchContentSources(42, "movie", config, vi.fn());
    expect(result).toMatchObject({ status: "partial", importedPages: 1, errors: 1 });
    expect(result.content.sources[0].checkedAt).toBe(source.checkedAt);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it("honors disabling the secondary catalog", async () => {
    vi.stubEnv("WATCH_4KHDHUB_ENABLED", "false");
    mocks.fetch.mockResolvedValue({ status: "not_found", importedPages: 0, errors: 0, content: { contentId: 42, contentType: "movie", sources: [] } });
    await searchContentSources(42, "movie", config);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
});
