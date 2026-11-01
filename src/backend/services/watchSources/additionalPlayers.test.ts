import { describe, expect, it, vi } from "vitest";
import { directMediaFormat, isDirectFileLink, isResolvablePlayer, streamtapeFileId } from "@/shared/lib/watchSources";
import type { WatchSourceLink } from "@/shared/types/watchSources";
import { parseMultiCloudMedia, parseStreamtapeMedia, resolveAdditionalWatchMedia } from "./additionalPlayers";

const id = "ywvpmyxpxdC1rK6";
const name = "Example.2025.1080p.x264.mp4";
const link: WatchSourceLink = { id: "watch", label: "Watch", url: `https://stape.fun/v/${id}/Example`, host: "stape.fun",
  kind: "watch", verification: "unverified", quality: "1080p", resolution: 1080, codec: "H.264", bitDepth: null, size: null,
  formats: [], languages: [], scope: "movie", season: null, episode: null, episodeEnd: null, releaseYear: 2025 };
const expires = () => Math.floor(Date.now() / 1000) + 3600;
const tapePage = (filename = name, expiry = expires()) => `<meta name="og:title" content="${filename}">
  <div id="robotlink">https://ads.example/fake</div><script>
  document.getElementById('robotlink').innerHTML = '//streamtape.com/get_video?id='+ ('xcd${id}&expires=${expiry}&ip=abcdef&token=abcdef123456').substring(2).substring(1);
  </script>`;
const multiUrl = () => `https://dr1.multidownload.lol/d/e1b757e1?eid=abcdef&token=abcdef1234567890&exp=${expires()}&action=watch`;
const multiPage = (url = multiUrl(), filename = name) => `<title>${filename} - Premium Stream</title><script>const streamSrc = ${JSON.stringify(url)};</script>`;
const page = (html: string, finalUrl?: string) => ({ html, finalUrl, etag: null, lastModified: null });
const mp4 = () => {
  const bytes = new Uint8Array(1024); bytes.set([0, 0, 0, 32, ...Buffer.from("ftypisom")]);
  return new Response(bytes, { status: 206, headers: { "content-type": "video/mp4", "content-range": "bytes 0-1023/100000" } });
};
const base64 = (text: string) => Buffer.from(text).toString("base64");
const wrapper = (url: string) => {
  const json = JSON.stringify({ w: 10, l: "https://greenmotors.cc/homelander/", o: base64(url) });
  const rotated = base64(json).replace(/[A-Za-z]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) + (letter.toLowerCase() <= "m" ? 13 : -13)));
  return `<script>s('o','${base64(base64(rotated))}',180*1000)</script>`;
};

describe("additional watch players", () => {
  it("recognizes observed aliases and exact scopes, rejecting lookalikes and injected query strings", () => {
    for (const host of ["streamtape.com", "streamtape.cc", "stape.fun", "shavetape.cash"]) {
      expect(streamtapeFileId(`https://${host}/v/${id}/Example.mp4`)).toBe(id);
      expect(directMediaFormat(`https://${host}/v/${id}/Example.mp4`)).toBeNull();
      expect(isDirectFileLink(`https://${host}/v/${id}/Example.mp4`)).toBe(false);
      expect(isResolvablePlayer({ ...link, url: `https://${host}/e/${id}` })).toBe(true);
    }
    expect(isResolvablePlayer({ ...link, url: "https://new3.multicloudlinks.com/player.php/?v=abcdef" })).toBe(true);
    for (const url of [`https://streamtape.com.evil.example/e/${id}`, `https://user@streamtape.com/e/${id}`,
      `https://streamtape.com/e/${id}?next=evil`, `https://streamtape.com/e/${id}#evil`, `http://streamtape.com/e/${id}`,
      "https://new3.multicloudlinks.com/player.php/?v=abcdef&next=evil", "https://127.0.0.1/player.php/?v=abcdef"]) {
      expect(isResolvablePlayer({ ...link, url })).toBe(false);
    }
    for (const scope of ["season", "series", "episode-range"] as const) expect(isResolvablePlayer({ ...link, scope })).toBe(false);
    expect(isResolvablePlayer({ ...link, kind: "download" })).toBe(false);
  });

  it("reads the published Streamtape expression as data and rejects ambiguity or executable expressions", () => {
    const html = tapePage();
    expect(parseStreamtapeMedia(html, id)?.searchParams.get("id")).toBe(id);
    expect(parseStreamtapeMedia(html, id)?.searchParams.get("stream")).toBe("1");
    expect(parseStreamtapeMedia(html, "other123")).toBeNull();
    expect(parseStreamtapeMedia(html + html, id)).toBeNull();
    expect(parseStreamtapeMedia(html.replace(".substring(2)", ".substring(dangerous())"), id)).toBeNull();
    expect(parseStreamtapeMedia(html.replace("streamtape.com/get_video", "127.0.0.1/get_video"), id)).toBeNull();
    expect(parseStreamtapeMedia("x".repeat(1_000_001), id)).toBeNull();
  });

  it("checks matching metadata and MP4 bytes, follows only a matching CDN file, and returns the player URL", async () => {
    const documents = vi.fn().mockResolvedValue(page(tapePage()));
    const media = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302,
      headers: { location: `https://123456.tapecontent.net/radosgw/${id}/token/${name}` } })).mockResolvedValueOnce(mp4());
    const result = await resolveAdditionalWatchMedia(link, "Example", documents, media);
    expect(result).toMatchObject([{ format: "mp4", mediaVerified: true, playerUrl: `https://streamtape.com/e/${id}` }]);
    expect(documents.mock.calls[0][0]).toBe(`https://streamtape.com/e/${id}`);
    expect(media.mock.calls[0][1]).toMatchObject({ redirect: "manual", headers: { Range: "bytes=0-1023" } });
    expect(media).toHaveBeenCalledTimes(2);
  });

  it("rejects wrong titles, years, quality, episodes, expired media and deleted player pages before probing", async () => {
    const media = vi.fn();
    for (const filename of ["Other.2025.1080p.x264.mp4", "Example.2024.1080p.x264.mp4", "Example.2025.720p.x264.mp4",
      "Example.S01E02.1080p.x264.mp4"]) {
      expect(await resolveAdditionalWatchMedia(link, "Example", vi.fn().mockResolvedValue(page(tapePage(filename))), media)).toEqual([]);
    }
    const episode = { ...link, scope: "episode" as const, season: 1, episode: 1 };
    expect(await resolveAdditionalWatchMedia(episode, "Example", vi.fn().mockResolvedValue(page(tapePage("Example.S01E02.1080p.x264.mp4"))), media)).toEqual([]);
    expect(await resolveAdditionalWatchMedia(link, "Example", vi.fn().mockResolvedValue(page(tapePage(name, 1))), media)).toEqual([]);
    expect(await resolveAdditionalWatchMedia(link, "Example", vi.fn().mockRejectedValue(new Error("404")), media)).toEqual([]);
    expect(media).not.toHaveBeenCalled();
  });

  it("rejects ad/private redirects, mismatched CDN metadata, HTML, truncated data and Matroska", async () => {
    const documents = vi.fn().mockResolvedValue(page(tapePage()));
    for (const location of ["https://ads.example/file", "https://127.0.0.1/private",
      `https://123.tapecontent.net/radosgw/${id}/token/Other.2025.1080p.x264.mp4`]) {
      const media = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
      expect(await resolveAdditionalWatchMedia(link, "Example", documents, media)).toEqual([]);
      expect(media).toHaveBeenCalledOnce();
    }
    for (const [body, mime] of [["<html>ads</html>", "text/html"], ["<html>ads</html>", "video/mp4"], ["ftyp", "video/mp4"], ["matroska", "video/matroska"]]) {
      const media = vi.fn().mockResolvedValue(new Response(body, { headers: { "content-type": mime } }));
      expect(await resolveAdditionalWatchMedia(link, "Example", documents, media)).toEqual([]);
    }
  });

  it("supports MultiCloud domain rotations and MP4/WebM while rejecting transfer endpoints and changed IDs", async () => {
    const row = { ...link, url: "https://new.multicloudlinks.com/player.php/?v=abcdef" };
    const finalUrl = "https://new3.multicloudlinks.com/player.php/?v=abcdef";
    const documents = vi.fn().mockResolvedValue(page(multiPage(), finalUrl));
    const media = vi.fn().mockResolvedValueOnce(mp4());
    expect(await resolveAdditionalWatchMedia(row, "Example", documents, media)).toMatchObject([{ playerUrl: finalUrl, format: "mp4" }]);
    const webm = new Uint8Array(1024); webm.set([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x84, ...Buffer.from("webm")]);
    media.mockResolvedValueOnce(new Response(webm, { headers: { "content-type": "video/webm" } }));
    expect(await resolveAdditionalWatchMedia(row, "Example", documents, media)).toMatchObject([{ format: "webm" }]);
    const policy = documents.mock.calls[0][3].redirectOriginAllowed;
    expect(policy("https://new4.multicloudlinks.com")).toBe(true);
    expect(policy("https://new4.multicloudlinks.com.evil.example")).toBe(false);
    expect(parseMultiCloudMedia(multiPage(multiUrl().replace("action=watch", "action=prepare")))).toEqual([]);
    expect(parseMultiCloudMedia(multiPage(multiUrl().replace("dr1.multidownload.lol", "127.0.0.1")))).toEqual([]);
    documents.mockResolvedValue(page(multiPage(), finalUrl.replace("abcdef", "ghijkl")));
    expect(await resolveAdditionalWatchMedia(row, "Example", documents, media)).toEqual([]);
    expect(media).toHaveBeenCalledTimes(2);
  });

  it("cancels an upstream that ignores Range after its prefix instead of downloading the movie", async () => {
    const cancel = vi.fn();
    const bytes = new Uint8Array(8192); bytes.set([0, 0, 0, 32, ...Buffer.from("ftypisom")]);
    const stream = new ReadableStream({ start(controller) { controller.enqueue(bytes); }, cancel });
    const media = vi.fn().mockResolvedValue(new Response(stream, { headers: { "content-type": "video/mp4" } }));
    expect(await resolveAdditionalWatchMedia(link, "Example", vi.fn().mockResolvedValue(page(tapePage())), media)).toHaveLength(1);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("unwraps GreenMotors, exhausts archive mirrors after failures and never returns the wrapper as a player", async () => {
    const row = { ...link, url: "https://greenmotors.club/?id=abcdefgh" };
    const documents = vi.fn().mockImplementation(async (url: string) => {
      if (url === row.url) return page(wrapper("https://hblinks.lol/archives/123"));
      if (url === "https://hblinks.lol/archives/123") return page(`<div class="entry-content">
        <a href="https://streamtape.com/e/dead123">Watch</a><a href="${link.url}">Watch</a>
        <a href="https://new.multicloudlinks.com/player.php/?v=abcdef">Watch</a>
        <a href="https://greenmotors.club/?id=abcdefgh">Loop</a><a href="https://ads.example">Ad</a></div>`);
      if (url.includes("dead123")) throw new Error("404");
      return page(url.includes("multicloud") ? multiPage() : tapePage());
    });
    const media = vi.fn().mockImplementation(async () => mp4());
    const result = await resolveAdditionalWatchMedia(row, "Example", documents, media);
    expect(result).toHaveLength(2);
    expect(result.every((source) => source.mediaVerified && !source.playerUrl?.includes("greenmotors"))).toBe(true);
    expect(documents).toHaveBeenCalledTimes(5);
    expect(media).toHaveBeenCalledTimes(2);
    documents.mockResolvedValue(page(wrapper(link.url)));
    expect(await resolveAdditionalWatchMedia(row, "Other", documents, media)).toEqual([]);
  });
});
