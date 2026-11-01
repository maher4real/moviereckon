import { describe, expect, it, vi } from "vitest";
import { isFastDlUrl, isNexDriveUrl } from "@/shared/lib/watchSources";
import { resolveSourceDownloads } from "./downloads";
import { parseSourcePage } from "./parser";
import type { fetchSourceDocument } from "./http";

const nex = "https://nexdrive.help/genxfm175139605628678/";
const fast = "https://fast-dl.one/dl/861b73";
const link = parseSourcePage(`<h1>Weapons (2025)</h1><h2>Download Links</h2><h3>720p x264</h3><p><a href="${nex}">Download</a></p>`, "https://movies4u.one/19858-weapons.html").links[0];
const file = "https://pub-0123456789abcdef0123456789abcdef.r2.dev/file";
const filename = "Weapons.2025.720p.BluRay.x264.mkv";
const fastPage = '<a id="download-button" href="dl.php?code=861b73&secret=fixturesecret">Download Now</a>';
const response = (name = filename, type = "application/octet-stream") => new Response(null, { headers: {
  "content-type": type, "content-disposition": `attachment; filename="${name}"`, "content-length": "12345",
} });
const document = (html: string) => ({ html, etag: null, lastModified: null });

describe("NexDrive and FastDL", () => {
  it("resolves published buttons, prepares JSON and verifies final headers", async () => {
    const fetchDocument = vi.fn<typeof fetchSourceDocument>(async (url) => document(url === nex ? `<a href="${fast}">G-Direct</a>` : url === fast ? fastPage : JSON.stringify({ ok: true, url: file })));
    const request = vi.fn().mockResolvedValue(response());
    expect(await resolveSourceDownloads(link, "Weapons", { fetchDocument, request })).toMatchObject([{ url: file, filename, sizeBytes: 12345 }]);
    const prepare = new URL(fetchDocument.mock.calls[2][0]);
    expect(prepare.pathname).toBe("/dl/dl.php");
    expect(prepare.searchParams.get("code")).toBe("861b73");
    expect(prepare.searchParams.get("prepare")).toBe("1");
    expect(prepare.searchParams.get("hash")).toMatch(/^[a-f0-9]{24}$/);
    expect(prepare.searchParams.get("cfs")).toMatch(/^[a-f0-9]{16}$/);
    expect(fetchDocument.mock.calls[2][3]?.format).toBe("json");
    expect(request).toHaveBeenCalledWith(file, expect.objectContaining({ method: "HEAD", redirect: "manual" }));
    expect(new Set(fetchDocument.mock.calls.map((call) => call[3]?.signal)).size).toBe(1);
  });
  it("keeps trying mirrors when FastDL is challenged and ignores ads and loops", async () => {
    const cdn = `https://inventoryidea.com/?r=${Buffer.from(`https://hubcdn.club/dl/?link=${encodeURIComponent(file)}`).toString("base64")}`;
    const fetchDocument = vi.fn<typeof fetchSourceDocument>(async (url) => {
      if (url === fast) throw new Error("Source HTTP 403");
      return document(url === nex ? `<nav><a href="https://hubcdn.wiki/file/unrelated">Menu</a></nav><a href="${fast}">Fast</a>
        <a href="https://hubcdn.wiki/file/good">Mirror</a><a href="${nex}">Loop</a><a href="https://ads.example/">Ad</a>` : `<script>const data="${cdn}"</script>`);
    });
    const request = vi.fn().mockResolvedValue(response());
    expect(await resolveSourceDownloads(link, "Weapons", { fetchDocument, request })).toHaveLength(1);
    expect(fetchDocument.mock.calls.map(([url]) => url).sort()).toEqual([nex, fast, "https://hubcdn.wiki/file/good"].sort());
  });
  it.each(["http://nexdrive.help/genxfm123456/", "https://nexdrive.help.evil.example/genxfm123456/", nex + "?next=evil", "https://127.0.0.1/genxfm123456/", "https://user:secret@nexdrive.help/genxfm123456/"])("rejects unsafe wrappers: %s", (url) => expect(isNexDriveUrl(url)).toBe(false));
  it.each([fast + "?next=evil", "https://fast-dl.one.evil.example/dl/861b73", "https://fast-dl.one/dl.php", "http://fast-dl.one/dl/861b73"])("rejects unsafe FastDL entries: %s", (url) => expect(isFastDlUrl(url)).toBe(false));
  it.each(["https://evil.example/dl.php?code=861b73&secret=fixturesecret", "dl.php?code=other&secret=fixturesecret", "dl.php?code=861b73&secret=fixturesecret&next=evil"])("rejects swapped prepare buttons: %s", async (href) => {
    const fetchDocument = vi.fn().mockResolvedValue(document(`<a id="download-button" href="${href}">Download</a>`));
    const request = vi.fn();
    expect(await resolveSourceDownloads({ ...link, url: fast }, "Weapons", { fetchDocument, request })).toEqual([]);
    expect(fetchDocument).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });
  it.each(["https://ads.example/video.mkv", "https://127.0.0.1/video.mkv", "https://fast-dl.one/advert"])("never probes untrusted JSON destinations: %s", async (url) => {
    const fetchDocument = vi.fn().mockResolvedValueOnce(document(fastPage)).mockResolvedValueOnce(document(JSON.stringify({ ok: true, url })));
    const request = vi.fn();
    expect(await resolveSourceDownloads({ ...link, url: fast }, "Weapons", { fetchDocument, request })).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });
  it.each([["Weapons.2024.720p.BluRay.x264.mkv", "application/octet-stream"], [filename, "text/html"], ["Weapons.2025.1080p.BluRay.x264.mkv", "video/x-matroska"]])("does not expose wrong or non-media files: %s", async (name, type) => {
    const fetchDocument = vi.fn().mockResolvedValueOnce(document(fastPage)).mockResolvedValueOnce(document(JSON.stringify({ ok: true, url: file })));
    expect(await resolveSourceDownloads({ ...link, url: fast }, "Weapons", { fetchDocument, request: vi.fn().mockResolvedValue(response(name, type)) })).toEqual([]);
  });
});
