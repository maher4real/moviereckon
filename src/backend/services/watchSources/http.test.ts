import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSourceDocument } from "./http";

const base = "https://source.example";
afterEach(() => vi.unstubAllGlobals());

describe("bounded source fetch", () => {
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
