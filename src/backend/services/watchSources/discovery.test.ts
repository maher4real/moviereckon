import { describe, expect, it, vi } from "vitest";
import { discoverArchive, sitemapUrls } from "./discovery";
import type { DiscoveryRecord, SourceRepository } from "./store";

const baseUrl = "https://source.example";
const config = { baseUrl, batchSize: 20, concurrency: 2, discoveryPages: 2, refreshHours: 24, budgetMs: 210_000 };
const index = `${baseUrl}/sitemap.xml`;
const map = `${baseUrl}/post-sitemap.xml`;
const post = `${baseUrl}/old-title-1999/`;
const xml = (root: string, child: string, urls: string[]) => `<${root}>${urls.map((url) => `<${child}><loc>${url}</loc></${child}>`).join("")}</${root}>`;
function repository() {
  const cache = new Map<string, DiscoveryRecord>();
  const repo = { discovery: vi.fn(async (url: string) => cache.get(url) || null),
    saveDiscovery: vi.fn(async (record: DiscoveryRecord) => { cache.set(record._id, record); }) } as unknown as SourceRepository;
  return { repo, cache };
}

describe("archive discovery", () => {
  it("finds historical posts without full-movie slug markers and reuses fresh persisted indexes", async () => {
    const { repo } = repository();
    const request = vi.fn(async (url: string) => ({ html: url === index ? xml("sitemapindex", "sitemap", [map]) : xml("urlset", "url", [post]), etag: "v1", lastModified: null }));
    expect(await discoverArchive(config, repo, request)).toEqual({ urls: [post], errors: 0 });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toBe(index);
    expect(await discoverArchive(config, repo, request)).toEqual({ urls: [post], errors: 0 });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("preserves stale snapshots and reports incomplete discovery when providers fail", async () => {
    const { repo, cache } = repository();
    cache.set(index, { _id: index, urls: [map], etag: null, lastModified: null });
    cache.set(map, { _id: map, urls: [post], etag: null, lastModified: null });
    const request = vi.fn().mockRejectedValue(new Error("unavailable"));
    expect(await discoverArchive(config, repo, request)).toEqual({ urls: [post], errors: 2 });
    expect(repo.saveDiscovery).not.toHaveBeenCalled();
  });
  it("restricts index traversal to same-origin post sitemaps and rejects navigation/ad URLs", () => {
    expect(sitemapUrls(xml("sitemapindex", "sitemap", [map, `${baseUrl}/category-sitemap.xml`, "https://other.example/post-sitemap.xml", `${map}?next=1`]), baseUrl, true)).toEqual([map]);
    expect(sitemapUrls(xml("urlset", "url", [post, post, `${baseUrl}/category/movie/`, `${baseUrl}/`, "http://127.0.0.1/file/"]), baseUrl, false)).toEqual([post]);
  });
  it("reports a deadline cutoff instead of claiming complete coverage", async () => {
    const { repo, cache } = repository();
    cache.set(index, { _id: index, urls: [map], etag: null, lastModified: null, checkedAt: new Date() });
    const request = vi.fn();
    expect(await discoverArchive(config, repo, request, Date.now() - 1)).toEqual({ urls: [], errors: 1 });
    expect(request).not.toHaveBeenCalled();
  });
});
