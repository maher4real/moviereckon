import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/shared/lib/runtimeEnv", () => ({ getPublicMongoApiUrl: () => "" }));
import { fetchWatchLinks, getWatchSources, readSourceSearchEvents } from "./mongodbClient";
afterEach(() => vi.restoreAllMocks());

describe("per-title link fetch client", () => {
  it("reads saved links for regular viewers without starting an import", async () => {
    const content = { contentId: 42, contentType: "tv", sources: [] };
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(content)));
    const controller = new AbortController();
    expect(await getWatchSources(42, "tv", controller.signal)).toEqual(content);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/watch-sources?contentId=42&contentType=tv");
    expect(fetch.mock.calls[0][1]).toMatchObject({ signal: controller.signal, credentials: "include" });
    expect(fetch.mock.calls[0][1]?.method).toBeUndefined();
  });

  it("rejects saved sources belonging to another title", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ contentId: 99, contentType: "movie", sources: [] })));
    await expect(getWatchSources(42, "movie")).rejects.toThrow("incomplete");
  });

  it("uses cookie authentication and sends the selected content with the AJAX header", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "imported", content: { sources: [] } })));
    await fetchWatchLinks(42, "movie", "/source-full-movie/");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/watch-sources/fetch");
    expect(options).toMatchObject({ credentials: "include", method: "POST" });
    const headers = new Headers(options?.headers);
    expect(headers.get("x-requested-with")).toBe("XMLHttpRequest");
    expect(headers.get("authorization")).toBeNull();
    expect(JSON.parse(options?.body as string)).toEqual({ contentId: 42, contentType: "movie", sourceUrl: "/source-full-movie/" });
  });
  it("surfaces server validation and configuration errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Configure TMDB_API_KEY" }), { status: 503 }));
    await expect(fetchWatchLinks(42, "movie")).rejects.toThrow("TMDB_API_KEY");
  });
});


describe("streaming source search", () => {
  const identity = { contentId: 42, contentType: "movie" as const };
  const content = { ...identity, sources: [] };
  const result = { content, status: "imported", importedPages: 1, errors: 0 };
  it("handles split UTF-8 chunks, heartbeat lines and progressive snapshots", async () => {
    const bytes = new TextEncoder().encode(`${JSON.stringify({ type: "progress", message: "Searching…" })}\n\n${JSON.stringify({ type: "content", content })}\n${JSON.stringify({ type: "complete", result })}`);
    const stream = new ReadableStream({ start(controller) {
      for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
      controller.close();
    } });
    const emit = vi.fn();
    expect(await readSourceSearchEvents(new Response(stream), identity, emit)).toEqual(result);
    expect(emit.mock.calls.map(([event]) => event.type)).toEqual(["progress", "content", "complete"]);
    expect(emit.mock.calls[0][0].message).toBe("Searching…");
  });
  it("reports interrupted streams and rejects content from another title", async () => {
    await expect(readSourceSearchEvents(new Response(JSON.stringify({ type: "content", content }) + "\n"), identity, vi.fn())).rejects.toThrow("interrupted");
    await expect(readSourceSearchEvents(new Response(JSON.stringify({ type: "content", content: { ...content, contentId: 43 } }) + "\n"), identity, vi.fn())).rejects.toThrow("different title");
  });
});
