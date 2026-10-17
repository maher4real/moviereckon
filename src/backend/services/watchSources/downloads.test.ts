import { describe, expect, it, vi } from "vitest";
import { filenameMatchesSource, finalStorageUrl, parseCdnFile, resolveSourceDownloads } from "./downloads";
import { parseSourcePage } from "./parser";
import type { fetchSourceDocument } from "./http";

const link = parseSourcePage(`<h1>The Trap (Season 1)</h1><h2>DOWNLOAD LINKS</h2><h3>Episode 1</h3>
  <h4>720p x264 <a href="https://hubcdn.club/file/episode1">Instant</a></h4>`, "https://source.example/show/").links[0];
const file = "https://pub-0123456789abcdef0123456789abcdef.r2.dev/episode-file";
const signed = "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/hub/file?X-Amz-Signature=fixture";
const filename = "The.Trap.S01E01.720p.WEB-DL.Hindi-English.x264.mkv";
const response = (name = filename, type = "application/octet-stream", status = 200) => new Response(null, { status,
  headers: { "content-type": type, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, "content-length": "540426006" } });
const cdnHtml = (url = file) => `<script>const ad = 'https://ads.example/tracker'; const redirect = 'https://inventoryidea.com/?r=${
  Buffer.from(`https://hubcdn.club/dl/?link=${encodeURIComponent(url)}`).toString("base64")
}';</script>`;

const greenHtml = (archive: string) => {
  const base64 = (value: string) => Buffer.from(value).toString("base64");
  const rot13 = (value: string) => value.replace(/[A-Za-z]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) + (letter.toLowerCase() <= "m" ? 13 : -13)));
  const data = JSON.stringify({ w: 10, l: "https://greenmotors.cc/homelander/", o: base64(archive) });
  return `<script>s('o','${base64(base64(rot13(base64(data))))}',180*1000);</script>`;
};

describe("GreenMotors content-scoped mirror resolution", () => {
  it("tries every published trusted mirror, keeps original episode metadata and tolerates failed mirrors", async () => {
    const archive = "https://hblinks.lol/archives/123";
    const pages = new Map([
      ["https://greenmotors.cc/?id=YXJjaGl2ZQ==", greenHtml(archive)],
      [archive, '<nav><a href="https://hubcdn.club/file/unrelated">Other</a></nav><main class="entry-content"><a href="https://hubcdn.club/file/first">One</a><a href="https://hubcdn.club/file/second">Two</a><a href="https://hubcdn.club/file/third">Three</a></main>'],
      ["https://hubcdn.wiki/file/second", cdnHtml(`${file}2`)],
      ["https://hubcdn.wiki/file/third", cdnHtml(`${file}3`)],
    ]);
    const fetchDocument = vi.fn<typeof fetchSourceDocument>(async (url) => {
      if (!pages.has(url)) throw new Error("Mirror offline");
      return { html: pages.get(url)!, etag: null, lastModified: null };
    });
    const request = vi.fn(async (url: string | URL | Request) => response(String(url).endsWith("2") ? filename.replace("S01E01", "S01E02") : filename));
    const downloads = await resolveSourceDownloads({ ...link, url: "https://greenmotors.club/?id=YXJjaGl2ZQ==" }, "The Trap", { fetchDocument, request });
    expect(downloads).toMatchObject([{ url: `${file}3`, filename }]);
    expect(fetchDocument.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([...pages.keys(), "https://hubcdn.wiki/file/first"]));
    expect(fetchDocument.mock.calls.every(([url]) => !/homelander|unrelated/.test(url))).toBe(true);
    expect(new Set(fetchDocument.mock.calls.map((call) => call[3]?.signal)).size).toBe(1);
  });
  it("resolves a wrapper pointing directly at a supported provider without requiring an archive", async () => {
    const fetchDocument = vi.fn<typeof fetchSourceDocument>(async (url) => ({ html: url.includes("greenmotors.cc") ? greenHtml(link.url) : cdnHtml(), etag: null, lastModified: null }));
    const request = vi.fn().mockResolvedValue(response());
    expect(await resolveSourceDownloads({ ...link, url: "https://greenmotors.club/?id=YXJjaGl2ZQ==" }, "The Trap", { fetchDocument, request })).toMatchObject([{ url: file }]);
    expect(fetchDocument.mock.calls.map(([url]) => url)).toEqual(["https://greenmotors.cc/?id=YXJjaGl2ZQ==", "https://hubcdn.wiki/file/episode1"]);
  });
  it("rejects unknown wrapper parameters without making network requests", async () => {
    const fetchDocument = vi.fn(); const request = vi.fn();
    for (const url of ["https://greenmotors.club/?id=YXJjaGl2ZQ==&next=private", "https://greenmotors.club.evil.example/?id=YXJjaGl2ZQ==", "https://greenmotors.cc/other/?id=YXJjaGl2ZQ=="]) {
      expect(await resolveSourceDownloads({ ...link, url }, "The Trap", { fetchDocument, request })).toEqual([]);
    }
    expect(fetchDocument).not.toHaveBeenCalled();
  });
});

describe("release identity", () => {
  it("rejects a different remake when the source supplies its release year", () => {
    const link = { ...parseSourcePage('<h1>Example (2026)</h1><h2>Download Links</h2><a href="https://hubcdn.club/file/test">720p</a>', "https://source.example/example/").links[0], codec: null };
    expect(filenameMatchesSource("Example.2026.720p.mkv", link, "Example")).toBe(true);
    expect(filenameMatchesSource("Example.1991.720p.mkv", link, "Example")).toBe(false);
    expect(filenameMatchesSource("Example.Returns.2026.720p.mkv", link, "Example")).toBe(false);
    expect(filenameMatchesSource("Example.720p.mkv", link, "Example")).toBe(false);
  });
});

describe("final file resolution through published provider pages", () => {
  it("extracts the file parameter without executing obfuscated/ad scripts or visiting the advertising origin", async () => {
    const fetchDocument = vi.fn().mockResolvedValue({ html: cdnHtml(), etag: null, lastModified: null });
    const request = vi.fn().mockResolvedValue(response());
    const files = await resolveSourceDownloads(link, "The Trap", { fetchDocument, request });
    expect(files).toMatchObject([{ url: file, filename, sizeBytes: 540426006, contentType: "application/octet-stream" }]);
    expect(fetchDocument).toHaveBeenCalledOnce();
    expect(fetchDocument).toHaveBeenCalledWith("https://hubcdn.wiki/file/episode1", "https://hubcdn.wiki", {}, { signal: expect.any(AbortSignal) });
    expect(request).toHaveBeenCalledWith(file, expect.objectContaining({ method: "HEAD", redirect: "manual" }));
  });
  it("retries unsupported HEAD with a bounded GET and accepts a matching filename in the URL when disposition is absent", async () => {
    const url = `${file}/${filename.replaceAll(".", "_").replace(/_mkv$/, ".mkv")}`;
    const fetchDocument = vi.fn().mockResolvedValue({ html: cdnHtml(url) });
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(null, { status: 206, headers: { "content-type": "video/x-matroska", "content-range": "bytes 0-0/1000" } }));
    expect(await resolveSourceDownloads(link, "The Trap", { fetchDocument, request })).toMatchObject([{ url, sizeBytes: 1000 }]);
    expect(request.mock.calls[1][1]).toMatchObject({ method: "GET", headers: { Range: "bytes=0-0" }, redirect: "manual" });
  });
  it("resolves a saved HubCloud button without requiring a HubDrive wrapper", async () => {
    const cloud = { ...link, url: "https://hubcloud.ist/drive/abc" };
    const next = "https://gamerxyt.com/hubcloud.php?host=hubcloud&id=abc&token=fixture";
    const fetchDocument = vi.fn().mockResolvedValueOnce({ html: `<a id="download" href="${next}">Download</a>` })
      .mockResolvedValueOnce({ html: `<a id="s3" href="${file}">File</a>` });
    expect(await resolveSourceDownloads(cloud, "The Trap", { fetchDocument, request: vi.fn().mockResolvedValue(response()) })).toHaveLength(1);
    expect(fetchDocument.mock.calls[0][0]).toBe(cloud.url);
  });

  it("supports the exact Google download host published by older archive releases", async () => {
    const url = "https://video-downloads.googleusercontent.com/file";
    expect(finalStorageUrl(`${url}.mkv`)?.hostname).toBe("video-downloads.googleusercontent.com");
    expect(finalStorageUrl("https://video-downloads.googleusercontent.com.evil.example/file")).toBeNull();
    const fetchDocument = vi.fn().mockResolvedValue({ html: cdnHtml(url) });
    expect(await resolveSourceDownloads(link, "The Trap", { fetchDocument, request: vi.fn().mockResolvedValue(response()) })).toMatchObject([{ url }]);
  });
  it("does not probe arbitrary hosts, private addresses, ad URLs, ambiguous files or a different provider's encoded payload", async () => {
    for (const url of ["http://127.0.0.1/movie", "https://localhost/movie", "https://media.example/file", "https://pub-0123456789abcdef0123456789abcdef.r2.dev.evil.example/file"]) {
      expect(finalStorageUrl(url)).toBeNull();
      expect(parseCdnFile(cdnHtml(url))).toBeNull();
    }
    expect(parseCdnFile(`${cdnHtml()}${cdnHtml(`${file}-other`)}`)).toBeNull();
    expect(parseCdnFile('<script>throw Error("must not execute")</script><a href="https://ads.example/download">Download</a>')).toBeNull();
    const fetchDocument = vi.fn().mockResolvedValue({ html: cdnHtml("https://ads.example/download") });
    const request = vi.fn();
    expect(await resolveSourceDownloads(link, "The Trap", { fetchDocument, request })).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects a different show, season, episode, quality, codec, range and HTML masquerading as a download", async () => {
    for (const name of [filename.replace("The.Trap", "Another.Show"), filename.replace("S01E01", "S02E01"),
      filename.replace("S01E01", "S01E02"), filename.replace("720p", "1080p"), filename.replace("x264", "x265"),
      filename.replace("S01E01", "S01E01-E03"), filename.replace("S01E01", "S01E01E02"),
      filename.replace("S01E01", "S01E01+S01E02"), filename.replace(".mkv", ".html")]) {
      expect(filenameMatchesSource(name, link, "The Trap")).toBe(false);
    }
    const fetchDocument = vi.fn().mockResolvedValue({ html: cdnHtml() });
    const request = vi.fn().mockResolvedValue(response(filename, "text/html"));
    expect(await resolveSourceDownloads(link, "The Trap", { fetchDocument, request })).toEqual([]);
    request.mockResolvedValueOnce(response(filename.replace("S01E01", "S01E02")));
    expect(await resolveSourceDownloads(link, "The Trap", { fetchDocument, request })).toEqual([]);
  });
  it("follows only the matching Drive -> Cloud -> published file-button chain and probes signed GET with a one-byte range", async () => {
    const drive = { ...link, url: "https://hubdrive.pics/file/123", host: "hubdrive.pics" };
    const pages = new Map([
      [drive.url, '<a href="https://ads.example/track">Download</a><a href="https://hubcloud.ist/drive/abc123">HubCloud Server</a>'],
      ["https://hubcloud.ist/drive/abc123", '<a id="download" href="https://gamerxyt.com/hubcloud.php?host=hubcloud&id=abc123&token=fixture">Generate Link</a>'],
      ["https://gamerxyt.com/hubcloud.php?host=hubcloud&id=abc123&token=fixture", `<a id="s3" href="${signed}">Download</a><a href="https://ads.example/another">Download</a>`],
    ]);
    const fetchDocument = vi.fn(async (url: string) => ({ html: pages.get(url) || "", etag: null, lastModified: null }));
    const body = new Response("x", { status: 206, headers: { "content-type": "video/x-matroska", "content-range": "bytes 0-0/540426006", "content-disposition": `attachment; filename="${filename}"` } });
    const cancel = vi.spyOn(body.body!, "cancel");
    const request = vi.fn().mockResolvedValue(body);
    expect(await resolveSourceDownloads(drive, "The Trap", { fetchDocument, request })).toMatchObject([{ url: signed, filename, sizeBytes: 540426006 }]);
    expect(fetchDocument.mock.calls.map(([url]) => url)).toEqual([...pages.keys()]);
    expect(request).toHaveBeenCalledWith(signed, expect.objectContaining({ method: "GET", headers: { Range: "bytes=0-0" }, redirect: "manual" }));
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("does not follow a Cloud link for a different file or accept an arbitrary redirect after the probe", async () => {
    const drive = { ...link, url: "https://hubdrive.pics/file/123" };
    const fetchDocument = vi.fn().mockResolvedValueOnce({ html: '<a href="https://hubcloud.ist/drive/abc123">Server</a>' })
      .mockResolvedValueOnce({ html: '<a id="download" href="https://gamerxyt.com/hubcloud.php?host=hubcloud&id=different&token=fixture">Download</a>' });
    const request = vi.fn();
    expect(await resolveSourceDownloads(drive, "The Trap", { fetchDocument, request })).toEqual([]);
    expect(fetchDocument).toHaveBeenCalledTimes(2);
    expect(request).not.toHaveBeenCalled();
    fetchDocument.mockResolvedValue({ html: cdnHtml() });
    request.mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } }));
    expect(await resolveSourceDownloads(link, "The Trap", { fetchDocument, request })).toEqual([]);
    expect(request).toHaveBeenCalledOnce();
  });
  it("does not substitute season packs and discards expired links", async () => {
    const pack = { ...link, scope: "season" as const, episode: null };
    expect(filenameMatchesSource(filename, pack, "The Trap")).toBe(false);
    expect(filenameMatchesSource("The.Trap.S01.720p.x264.zip", pack, "The Trap")).toBe(true);
    const expired = `${signed}&X-Amz-Date=20200101T000000Z&X-Amz-Expires=18000`;
    const fetchDocument = vi.fn().mockResolvedValueOnce({ html: cdnHtml(expired) });
    const request = vi.fn().mockResolvedValue(response());
    expect(await resolveSourceDownloads(link, "The Trap", { fetchDocument, request })).toEqual([]);
  });
});
