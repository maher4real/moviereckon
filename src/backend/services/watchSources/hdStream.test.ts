import { describe, expect, it, vi } from "vitest";
import { resolveHdStreamMedia } from "./hdStream";

const origin = "https://video123.acek-cdn.com";
const master = `${origin}/hls2/movie/master.m3u8?token=fresh`;
const variant = `${origin}/hls2/movie/index-v1-a1.m3u8?token=fresh`;
const segment = `${origin}/hls2/movie/seg-1-v1-a1.ts?token=fresh`;
const candidate = { url: master, format: "hls" as const, label: "Stream 1" };
const masterText = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000,RESOLUTION=1920x1080\nindex-v1-a1.m3u8?token=fresh\n";
const mediaText = `#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10.000,\n${segment}\n#EXT-X-ENDLIST\n`;
const bytes = () => { const data = new Uint8Array(1024); data[0] = data[188] = data[376] = 0x47; return data; };
const headers = { "content-type": "application/vnd.apple.mpegurl" };
function provider(options: { master?: string; media?: string; segmentStatus?: number; cors?: string; data?: Uint8Array } = {}) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === master) return new Response(options.master ?? masterText, { headers });
    if (url === variant) return new Response(options.media ?? mediaText, { headers });
    if (url === segment) return new Response(new Uint8Array(options.data ?? bytes()).buffer, { status: options.segmentStatus ?? 206,
      headers: { "access-control-allow-origin": options.cors ?? "*" } });
    return new Response("Not found", { status: 404 });
  });
}

describe("HDStream media verification", () => {
  it("returns a self-contained playlist only after a bounded media/CORS probe succeeds", async () => {
    const request = provider();
    expect(await resolveHdStreamMedia([candidate], request)).toEqual([
      { url: variant, label: "HDStream · 1080p", format: "hls", referrerPolicy: "no-referrer", hlsPlaylist: mediaText },
    ]);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[2]).toEqual([segment, expect.objectContaining({ headers: { Range: "bytes=0-1023" }, redirect: "manual", signal: expect.any(AbortSignal) })]);
  });
  it("drops a broken mirror while preserving the independently verified stream", async () => {
    const request = provider();
    expect(await resolveHdStreamMedia([candidate, { ...candidate, url: "https://video123.mediaveltrino.online/movie/master.txt" }], request)).toHaveLength(1);
  });
  it("rejects unavailable, CORS-blocked and non-video fragments", async () => {
    for (const options of [{ segmentStatus: 403 }, { cors: "https://hdstream4u.com" }, { data: new Uint8Array(1024) }]) {
      expect(await resolveHdStreamMedia([candidate], provider(options))).toEqual([]);
    }
  });
  it("does not fetch untrusted CDN hosts or follow redirects", async () => {
    const request = provider();
    for (const url of ["https://127.0.0.1/master.m3u8", "https://video123.acek-cdn.com.evil.example/master.m3u8", "http://video123.acek-cdn.com/master.m3u8"]) {
      expect(await resolveHdStreamMedia([{ ...candidate, url }], request)).toEqual([]);
    }
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://other.example/" } }));
    expect(await resolveHdStreamMedia([candidate], request)).toEqual([]);
    expect(request).toHaveBeenCalledOnce();
  });
  it("rejects cross-origin or escaped playlist resources, keys, oversized data and incomplete VOD", async () => {
    for (const text of [masterText.replace("index-v1", "https://evil.example/index-v1"), masterText.replace("index-v1", "../index-v1"), "x".repeat(50_000)]) {
      expect(await resolveHdStreamMedia([candidate], provider({ master: text }))).toEqual([]);
    }
    for (const text of [mediaText.replace(origin, "https://other.example"), mediaText.replace("#EXT-X-ENDLIST", ""), mediaText.replace("#EXTINF:", '#EXT-X-KEY:METHOD=AES-128,URI="https://other.example/key"\n#EXTINF:')]) {
      expect(await resolveHdStreamMedia([candidate], provider({ media: text }))).toEqual([]);
    }
  });
  it("cancels a stream that ignores Range after reading its prefix", async () => {
    const cancel = vi.fn();
    const request = provider();
    request.mockImplementation(async (input) => {
      if (String(input) === master) return new Response(masterText, { headers });
      if (String(input) === variant) return new Response(mediaText, { headers });
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes()); }, cancel }), { headers: { "access-control-allow-origin": "*" } });
    });
    expect(await resolveHdStreamMedia([candidate], request)).toHaveLength(1);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
