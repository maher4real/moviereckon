import { describe, expect, it, vi } from "vitest";
import { parseHdStreamMedia, unpackPlayerData } from "./packedPlayer";
import { resolveWatchMedia } from "./resolve";
import { parseSourcePage } from "./parser";

const page = "https://hdstream4u.com/file/abcdefghijkl";
const packed = (body: string, words: string[]) => `eval(function(p,a,c,k,e,d){return p}('${body.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}',36,${words.length},'${words.join("|").replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'.split('|')))`;
const html = `<script>${packed('0 1={"2":"3","4":"5"};6()', ["var", "links", "hls4", "/stream/movie/master.m3u8", "hls2", "https://media.example/movie.m3u8", "dangerous"] )}</script>`;

describe("HDStream published data", () => {
  it("extracts the CDN stream and excludes the provider's CORS-blocked proxy without executing code", () => {
    const dangerous = vi.fn();
    vi.stubGlobal("dangerous", dangerous);
    try {
      expect(parseHdStreamMedia(html, page)).toEqual([
        { url: "https://media.example/movie.m3u8", format: "hls", label: "Stream 1 · Auto quality" },
      ]);
      expect(dangerous).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("rejects executable values, private URLs, malformed dictionaries and oversized payloads", () => {
    const source = (data: string) => `<script>${packed(`var links=${data};`, [""])}</script>`;
    expect(parseHdStreamMedia(source('{"hls4":alert(1)}'), page)).toEqual([]);
    expect(parseHdStreamMedia(source('{"hls4":"/stream/movie/master.m3u8"}'), page)).toEqual([]);
    expect(parseHdStreamMedia(source('{"hls4":"http://127.0.0.1/private","hls2":"javascript:alert(1)"}'), page)).toEqual([]);
    expect(unpackPlayerData(packed("body", ["word"]).replace(",36,1,", ",36,2001,"))).toBeNull();
    expect(unpackPlayerData("x".repeat(512001))).toBeNull();
  });
  it("resolves saved single-episode pages but never substitutes season packs or mismatched media types", async () => {
    const link = parseSourcePage(`<h1>Example (Season 1)</h1><h2>DOWNLOAD LINKS</h2><h3>Episode 2</h3><a href="${page}">Watch</a>`, "https://source.example/show/").links[0];
    const fetchDocument = vi.fn().mockResolvedValue({ html });
    expect(await resolveWatchMedia(link, { contentId: 321, contentType: "tv" }, fetchDocument)).toHaveLength(1);
    expect(fetchDocument).toHaveBeenCalledWith(page, "https://hdstream4u.com");
    fetchDocument.mockClear();
    expect(await resolveWatchMedia({ ...link, scope: "season" }, { contentId: 321, contentType: "tv" }, fetchDocument)).toEqual([]);
    expect(await resolveWatchMedia(link, { contentId: 321, contentType: "movie" }, fetchDocument)).toEqual([]);
    expect(fetchDocument).not.toHaveBeenCalled();
  });
});
