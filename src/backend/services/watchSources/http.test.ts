import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSourceDocument } from "./http";

const base = "https://source.example";
afterEach(() => vi.unstubAllGlobals());

describe("bounded source fetch", () => {
  it("honors a caller's cancellation signal across a multi-page resolution", async () => {
    const controller = new AbortController();
    const fetch = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetch);
    const request = fetchSourceDocument(`${base}/post/`, base, {}, { signal: controller.signal });
    controller.abort();
    await expect(request).rejects.toThrow("Aborted");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("reads XML only in explicit sitemap mode and rejects HTML challenge pages", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("<urlset/>", { headers: { "content-type": "application/xml" } }))
      .mockResolvedValueOnce(new Response("<html>Challenge</html>", { headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchSourceDocument(`${base}/sitemap.xml`, base, {}, { format: "xml" })).toMatchObject({ html: "<urlset/>" });
    await expect(fetchSourceDocument(`${base}/sitemap.xml`, base, {}, { format: "xml" })).rejects.toThrow("XML");
  });
  it("sends validators and returns a 304 without a body", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchSourceDocument(`${base}/post/`, base, { etag: '"old"' })).toEqual({ html: null, etag: '"old"', lastModified: null });
    expect(fetch.mock.calls[0][1].headers["If-None-Match"]).toBe('"old"');
    expect(fetch.mock.calls[0][1].redirect).toBe("manual");
  });

  it("retries transient errors once and reads HTML", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response("<h1>Example</h1>", { headers: { "content-type": "text/html", etag: '"new"' } }));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchSourceDocument(`${base}/post/`, base)).toMatchObject({ html: "<h1>Example</h1>", etag: '"new"' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not follow cross-origin redirects or retry 403 challenges", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchSourceDocument(`${base}/post/`, base)).rejects.toThrow("redirect");
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockClear().mockResolvedValue(new Response(null, { status: 403 }));
    await expect(fetchSourceDocument(`${base}/post/`, base)).rejects.toThrow("403");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects video responses and oversized documents", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("video", { headers: { "content-type": "video/mp4" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchSourceDocument(`${base}/post/`, base)).rejects.toThrow("HTML");
    fetch.mockResolvedValue(new Response("html", { headers: { "content-type": "text/html", "content-length": "99999999" } }));
    await expect(fetchSourceDocument(`${base}/post/`, base)).rejects.toThrow("too large");
  });
});
