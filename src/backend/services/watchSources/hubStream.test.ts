import { createCipheriv } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { decryptHubStreamPayload, resolveHubStreamMedia } from "./hubStream";
import type { WatchSourceLink } from "@/shared/types/watchSources";

const filename = "Prahaar.2026.1080p.HDTC.Hindi-CLEAN.x264-HDHub4u.Ag.mkv";
const link: WatchSourceLink = {
  id: "saved-player", label: "Player 2", url: "https://hubstream.art/#d5qe6v", host: "hubstream.art",
  kind: "watch", verification: "unverified", releaseYear: 2026, quality: null, resolution: null,
  codec: null, bitDepth: null, size: null, formats: [], languages: ["hindi"], scope: "movie",
  season: null, episode: null, episodeEnd: null,
};
const encrypt = (data: unknown) => {
  const cipher = createCipheriv("aes-128-cbc", Buffer.from("kiemtienmua911ca"), Buffer.from("1234567890oiuytr"));
  return Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]).toString("hex");
};
const config = { adjust: { Tiktok: { disabled: false, domain: "p16-ad-site-sign-sg.tiktokcdn.com", params: { v: "1766826492" } } } };
const sourcePath = "/hls/tp5KEQr5JuU3R8MKfr6m_A/unl/b6iuxm9a/pws9da/tt/master.m3u8";
const masterUrl = `https://hubstream.art${sourcePath.replace("/hls/", "/hlsmod/p16-ad-site-sign-sg.tiktokcdn.com/")}?v=1766826492`;
const variantUrl = (index: number) => masterUrl.replace("master.m3u8", `index-f${index}-v1-a1.m3u8`);
const video = (overrides = {}) => ({ title: filename, swarmId: "d5qe6v", hlsVideoTiktok: sourcePath,
  streamingConfig: JSON.stringify(config), cfNative: "https://hubstream.art/v4/pl/blocked.example/unl/d5qe6v/master.1.m3u8", ...overrides });
const playlistHeaders = { "content-type": "application/vnd.apple.mpegurl" };
const master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=818238,RESOLUTION=1280x532\nindex-f1-v1-a1.m3u8?v=1766826492\n#EXT-X-STREAM-INF:BANDWIDTH=1756959,RESOLUTION=1920x800\nindex-f2-v1-a1.m3u8?v=1766826492\n";
const mediaUrl = (index = 1) => {
  const url = new URL(`https://p19-ad-site-sign-sg.tiktokcdn.com/ad-site-i18n-sg/${String(index).padStart(32, "0")}~tplv-d5opwmad15-ttam-origin.image`);
  url.search = new URLSearchParams({ lk3s: "6d71dd51", "x-expires": String(Math.floor(Date.now() / 1000) + 3600), "x-signature": `${"a".repeat(27)}=` }).toString();
  return url.href;
};
const playlist = (url = mediaUrl()) => `#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-ALLOW-CACHE:YES\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-VERSION:3\n#EXT-X-MEDIA-SEQUENCE:1\n#EXTINF:4.000,\n${url}\n#EXT-X-ENDLIST\n`;
const fragment = () => {
  const bytes = new Uint8Array(1024);
  bytes.set([137, 80, 78, 71], 0);
  for (const offset of [120, 308, 496, 684, 872]) bytes[offset] = 0x47;
  return bytes;
};
interface FixtureOptions {
  video?: Record<string, unknown>;
  info?: string;
  master?: string;
  playlist?: string;
  probeStatus?: number;
  probeCors?: string | null;
  probeBody?: Uint8Array;
  variantStatus?: number;
}
function provider(options: FixtureOptions = {}) {
  const data = video(options.video);
  const request = vi.fn<typeof fetch>(async (value) => {
    const url = String(value);
    if (url.includes("/api/v1/info?")) return new Response(encrypt({ title: options.info || filename }));
    if (url.includes("/api/v1/video?")) return new Response(encrypt(data));
    if (url === masterUrl) return new Response(options.master ?? master, { headers: playlistHeaders });
    if ([variantUrl(1), variantUrl(2)].includes(url)) return new Response(options.playlist ?? playlist(), { status: options.variantStatus ?? 200, headers: playlistHeaders });
    if (new URL(url).hostname.endsWith(".tiktokcdn.com")) return new Response(new Uint8Array(options.probeBody ?? fragment()).buffer, {
      status: options.probeStatus ?? 206, headers: options.probeCors === null ? {} : { "access-control-allow-origin": options.probeCors ?? "*" },
    });
    throw new Error("Unexpected request");
  });
  return { request, data };
}

describe("HubStream published metadata resolution", () => {
  it("decodes the observed public protocol without executing provider JavaScript", () => {
    expect(decryptHubStreamPayload(encrypt({ title: filename, swarmId: "d5qe6v" }))).toEqual({ title: filename, swarmId: "d5qe6v" });
    for (const text of ["", "00", "not hex", "0".repeat(65568), encrypt({ title: filename }).slice(0, -32) + "0".repeat(32)]) expect(decryptHubStreamPayload(text)).toBeNull();
  });

  it("returns two self-contained validated playlists and probes only 1 KiB per first fragment", async () => {
    const { request } = provider();
    const result = await resolveHubStreamMedia(link, "Prahaar", { request });
    expect(result).toHaveLength(2);
    expect(result.map((source) => ({ url: source.url, label: source.label, format: source.format, referrerPolicy: source.referrerPolicy }))).toEqual([
      { url: variantUrl(1), label: "HubStream · 720p", format: "hls", referrerPolicy: "no-referrer" },
      { url: variantUrl(2), label: "HubStream · 1080p", format: "hls", referrerPolicy: "no-referrer" },
    ]);
    for (const source of result) expect(source.hlsPlaylist).toBe(playlist());
    expect(request.mock.calls.slice(0, 3).map(([url]) => url)).toEqual([
      "https://hubstream.art/api/v1/info?id=d5qe6v", "https://hubstream.art/api/v1/video?id=d5qe6v&w=1280&h=720&r=", masterUrl,
    ]);
    const probes = request.mock.calls.filter(([url]) => new URL(String(url)).hostname.endsWith(".tiktokcdn.com"));
    expect(probes).toHaveLength(2);
    for (const [, init] of probes) expect(init).toMatchObject({ redirect: "manual", headers: { Range: "bytes=0-1023" }, referrerPolicy: "no-referrer", signal: expect.any(AbortSignal) });
    expect(request.mock.calls.some(([url]) => String(url).includes("/v4/pl/"))).toBe(false);
  });

  it("rejects unsupported origins, fragment parameters and ambiguous scopes before network access", async () => {
    const request = vi.fn<typeof fetch>();
    for (const url of ["https://hubstream.art.evil.example/#d5qe6v", "http://hubstream.art/#d5qe6v", "https://user:pass@hubstream.art/#d5qe6v", "https://hubstream.art/player#d5qe6v", "https://hubstream.art/?next=private#d5qe6v", "https://hubstream.art/#d5qe6v&other=1", "https://hubstream.art/#short", "invalid"]) expect(await resolveHubStreamMedia({ ...link, url }, "Prahaar", { request })).toEqual([]);
    for (const scope of ["season", "series", "episode-range"] as const) expect(await resolveHubStreamMedia({ ...link, scope }, "Prahaar", { request })).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects a different title, year, quality, episode or API identity before requesting playlists", async () => {
    for (const info of ["Other.2026.1080p.mkv", "Prahaar.2025.1080p.mkv", "Prahaar.2026.S01E02.1080p.mkv"]) {
      const { request } = provider({ info });
      expect(await resolveHubStreamMedia(link, "Prahaar", { request })).toEqual([]);
      expect(request).toHaveBeenCalledTimes(1);
    }
    expect(await resolveHubStreamMedia({ ...link, resolution: 720 }, "Prahaar", provider())).toEqual([]);
    expect(await resolveHubStreamMedia({ ...link, scope: "episode", season: 1, episode: 2, releaseYear: null }, "Prahaar", provider({ info: "Prahaar.S01E03.1080p.mkv" }))).toEqual([]);
    for (const fields of [{ title: "Other.2026.1080p.mkv" }, { swarmId: "other1" }]) {
      const { request } = provider({ video: fields });
      expect(await resolveHubStreamMedia(link, "Prahaar", { request })).toEqual([]);
      expect(request).toHaveBeenCalledTimes(2);
    }
    const name = "Prahaar.S01E02.1080p.Hindi.x264.mkv";
    expect(await resolveHubStreamMedia({ ...link, scope: "episode", season: 1, episode: 2, releaseYear: null }, "Prahaar", provider({ info: name, video: { title: name } }))).toHaveLength(2);
  });

  it("preserves only the exact published asset route and allows only the observed config transformation", async () => {
    for (const fields of [
      { hlsVideoTiktok: `https://untrusted.example${sourcePath}` }, { hlsVideoTiktok: `${sourcePath}?redirect=private` },
      { hlsVideoTiktok: "/hls/../../private/master.m3u8" }, { streamingConfig: "not JSON" },
      { streamingConfig: JSON.stringify({ adjust: { Tiktok: { ...config.adjust.Tiktok, disabled: true } } }) },
      { streamingConfig: JSON.stringify({ adjust: { Tiktok: { ...config.adjust.Tiktok, domain: "127.0.0.1" } } }) },
      { streamingConfig: JSON.stringify({ adjust: { Tiktok: { ...config.adjust.Tiktok, params: { next: "private" } } } }) },
    ]) {
      const { request } = provider({ video: fields });
      expect(await resolveHubStreamMedia(link, "Prahaar", { request })).toEqual([]);
      expect(request).toHaveBeenCalledTimes(2);
    }
    for (const text of ["<html>ad</html>", master.replaceAll("index-f", "https://untrusted.example/index-f"), master.replaceAll("index-f", "../other/index-f"), `${master}#EXT-X-MEDIA:URI="https://private.example"\n`, master.replaceAll("?v=1766826492", "?v=other"), "x".repeat(50000)]) expect(await resolveHubStreamMedia(link, "Prahaar", provider({ master: text }))).toEqual([]);
  });

  it("validates every segment URL, expiry and tag before returning any playlist data", async () => {
    const original = mediaUrl();
    for (const url of [original.replace("https:", "http:"), original.replace("p19-ad-site-sign-sg.tiktokcdn.com", "127.0.0.1"), original.replace("p19-ad-site-sign-sg.tiktokcdn.com", "untrusted.example"), original.replace("ad-site-i18n-sg", "other"), original.replace(/x-expires=\d+/, "x-expires=1000000000"), `${original}&next=private`, original.replace(/x-signature=[^&]+/, "x-signature=bad")]) expect(await resolveHubStreamMedia(link, "Prahaar", provider({ playlist: playlist(url) }))).toEqual([]);
    for (const text of [playlist().replace("#EXT-X-ENDLIST", ""), playlist().replace("#EXTINF:4.000,", '#EXT-X-KEY:METHOD=AES-128,URI="https://untrusted.example/key"\n#EXTINF:4.000,'), `${playlist().trim()}\nhttps://untrusted.example/extra`, playlist().replace("#EXT-X-VERSION:3", "#EXT-X-MAP:URI=\"https://untrusted.example/init\""), "x".repeat(1048577)]) expect(await resolveHubStreamMedia(link, "Prahaar", provider({ playlist: text }))).toEqual([]);
  });

  it("rejects CORS-blocked/unavailable/invalid fragments and cancels a host ignoring the one-KiB Range", async () => {
    for (const options of [{ probeStatus: 403 }, { probeCors: null }, { probeCors: "https://hubstream.art" }, { probeBody: new Uint8Array(1024) }, { variantStatus: 503 }]) expect(await resolveHubStreamMedia(link, "Prahaar", provider(options))).toEqual([]);
    const cancel = vi.fn();
    const { request } = provider();
    request.mockImplementation(async (value) => {
      if (String(value).includes("/api/v1/info?")) return new Response(encrypt({ title: filename }));
      if (String(value).includes("/api/v1/video?")) return new Response(encrypt(video()));
      if (String(value) === masterUrl) return new Response(master, { headers: playlistHeaders });
      if (String(value).includes("/hlsmod/")) return new Response(playlist(), { headers: playlistHeaders });
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(fragment()); }, cancel }), { headers: { "access-control-allow-origin": "*" } });
    });
    expect(await resolveHubStreamMedia(link, "Prahaar", { request })).toHaveLength(2);
    expect(cancel).toHaveBeenCalledTimes(2);
    const unavailable = vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout"));
    expect(await resolveHubStreamMedia(link, "Prahaar", { request: unavailable })).toEqual([]);
  });
});
