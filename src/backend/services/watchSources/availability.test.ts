import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchSourceLink } from "@/shared/types/watchSources";
const mocks = vi.hoisted(() => ({ downloads: vi.fn(), direct: vi.fn(), watch: vi.fn(), hls: vi.fn() }));
vi.mock("./downloadResolver", () => ({ resolveContentDownloads: mocks.downloads }));
vi.mock("./downloads", () => ({ verifyDirectDownload: mocks.direct }));
vi.mock("./resolve", () => ({ resolveWatchMedia: mocks.watch }));
vi.mock("./hdStream", () => ({ resolveHdStreamMedia: mocks.hls }));
import { checkWatchLink } from "./availability";
let number = 0;
const base: WatchSourceLink = { id: "file", label: "720p", url: "https://hubcdn.club/file/episode1", host: "hubcdn.club", kind: "download",
  verification: "unverified", quality: "720p", resolution: 720, codec: "H.264", bitDepth: null, size: null,
  formats: [], languages: [], scope: "episode", season: 1, episode: 1, episodeEnd: null };
const identity = { contentId: 42, contentType: "tv" as const };
const file = () => ({ url: "https://storage.example/file", filename: "Example.S01E01.720p.x264.mkv", sizeBytes: 1234,
  contentType: "video/x-matroska", checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 90_000).toISOString() });
beforeEach(() => { vi.resetAllMocks(); number++; mocks.downloads.mockResolvedValue([]); mocks.direct.mockResolvedValue([]); mocks.watch.mockResolvedValue([]); mocks.hls.mockResolvedValue([]); });
const link = (overrides: Partial<WatchSourceLink> = {}) => ({ ...base, id: `file-${number}`, ...overrides });

describe("working link checks", () => {
  it("returns checked files, coalesces simultaneous checks and bounds caching by file expiry", async () => {
    const checked = file(); mocks.downloads.mockResolvedValue([checked]);
    const row = link();
    const [first, second] = await Promise.all([checkWatchLink(row, "Example", identity), checkWatchLink(row, "Example", identity)]);
    expect(first).toEqual(second); expect(first.available).toBe(true); expect(first.downloads).toEqual([checked]);
    expect(Date.parse(first.validUntil)).toBe(Date.parse(checked.expiresAt) - 30_000);
    await checkWatchLink(row, "Example", identity); expect(mocks.downloads).toHaveBeenCalledOnce();
    await checkWatchLink({ ...row, url: "https://hubcdn.club/file/changed" }, "Example", identity);
    await checkWatchLink(row, "Example", { ...identity, contentId: 43 });
    expect(mocks.downloads).toHaveBeenCalledTimes(3);
    mocks.downloads.mockResolvedValue([]);
    expect((await checkWatchLink(row, "Example", identity, undefined, true)).available).toBe(false);
    expect(mocks.downloads).toHaveBeenCalledTimes(4);
  });
  it("hides unreachable, expired and unsupported pages without a page-status fallback", async () => {
    mocks.downloads.mockRejectedValueOnce(new Error("503"));
    expect((await checkWatchLink(link(), "Example", identity)).available).toBe(false);
    mocks.downloads.mockResolvedValue([{ ...file(), expiresAt: new Date(Date.now() + 1000).toISOString() }]);
    expect((await checkWatchLink(link({ id: "expired" }), "Example", identity)).available).toBe(false);
    const count = mocks.downloads.mock.calls.length;
    expect((await checkWatchLink(link({ url: "https://ads.example/page" }), "Example", identity)).available).toBe(false);
    expect(mocks.downloads).toHaveBeenCalledTimes(count);
  });
  it("requires verified media rather than a URL extracted from a player", async () => {
    const row = link({ kind: "watch", url: "https://hdstream4u.com/file/abcdefgh1234" });
    mocks.watch.mockResolvedValue([{ url: "https://cdn.example/movie.m3u8", format: "hls", label: "Auto" }]);
    expect((await checkWatchLink(row, "Example", identity)).available).toBe(false);
    mocks.watch.mockResolvedValue([{ url: "https://cdn.example/movie.m3u8", format: "hls", label: "Auto", hlsPlaylist: "#EXTM3U\nvalidated" }]);
    expect((await checkWatchLink({ ...row, id: "verified-stream" }, "Example", identity)).available).toBe(true);
  });
  it("checks direct files through the restricted storage validator", async () => {
    mocks.direct.mockResolvedValue([file()]);
    const row = link({ url: "https://storage.example/Example.S01E01.720p.mkv" });
    expect((await checkWatchLink(row, "Example", identity)).available).toBe(true);
    expect(mocks.direct).toHaveBeenCalledWith(row, "Example");
    expect(mocks.downloads).not.toHaveBeenCalled();
  });
});
