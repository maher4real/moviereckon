import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), origin: vi.fn(), ajax: vi.fn(), limit: vi.fn(), lookup: vi.fn(), resolve: vi.fn(), downloads: vi.fn() }));
vi.mock("@/backend/api/lib/auth", () => ({ getUserFromRequest: mocks.user }));
vi.mock("@/backend/api/lib/cors", () => ({ hasAjaxHeader: mocks.ajax, isTrustedRequestOrigin: mocks.origin }));
vi.mock("@/backend/api/lib/rate-limit", () => ({ consumeRateLimit: mocks.limit }));
vi.mock("./store", () => ({ lookupContentSources: mocks.lookup }));
vi.mock("./resolve", () => ({ resolveWatchMedia: mocks.resolve }));
vi.mock("./downloadResolver", () => ({ resolveContentDownloads: mocks.downloads }));
import { POST } from "@/app/api/watch-sources/resolve/route";

const input = { contentId: 42, contentType: "movie", linkId: "saved-link" };
const request = (body: unknown = input) => new Request("https://app.example/api/watch-sources/resolve", { method: "POST", body: JSON.stringify(body) });
const savedLink = { id: "saved-link", url: "https://play4u.org/tt1234567" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "viewer" }); mocks.origin.mockReturnValue(true); mocks.ajax.mockReturnValue(true);
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.lookup.mockResolvedValue({ sources: [{ links: [savedLink] }] });
  mocks.resolve.mockResolvedValue([{ url: "https://media.example/video.m3u8", format: "hls", label: "Auto" }]);
});

describe("saved source resolution endpoint", () => {
  it("resolves a supported saved download using its matched title, with separate file results", async () => {
    const link = { ...savedLink, url: "https://hubcdn.club/file/episode1", kind: "download", scope: "episode", season: 1, episode: 1 };
    mocks.lookup.mockResolvedValueOnce({ sources: [{ title: "The Trap", links: [link] }] });
    const files = [{ url: "https://storage.example/file", filename: "The.Trap.S01E01.720p.mkv" }];
    mocks.downloads.mockResolvedValueOnce(files);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sources: [], downloads: files });
    expect(mocks.downloads).toHaveBeenCalledWith(link, "The Trap");
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it("reports an unconfirmed download without returning an external ad-page substitute", async () => {
    const link = { ...savedLink, url: "https://hubcdn.club/file/episode1", kind: "download", scope: "episode", season: 1, episode: 1 };
    mocks.lookup.mockResolvedValueOnce({ sources: [{ title: "The Trap", links: [link] }] });
    mocks.downloads.mockResolvedValueOnce([]);
    const response = await POST(request());
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("No working file");
  });
  it("uses the selected title's stored link and returns uncached stream data", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.lookup).toHaveBeenCalledWith(42, "movie");
    expect(mocks.resolve).toHaveBeenCalledWith(savedLink, { contentId: 42, contentType: "movie" });
  });
  it("rejects supplied URLs, nonexistent or wrong-title links, unsupported hosts and host failures", async () => {
    expect((await POST(request({ ...input, url: "http://127.0.0.1" }))).status).toBe(400);
    expect((await POST(request({ ...input, linkId: "another-title-link" }))).status).toBe(404);
    expect(mocks.resolve).not.toHaveBeenCalled();
    mocks.resolve.mockResolvedValueOnce([]);
    expect((await POST(request())).status).toBe(422);
    mocks.resolve.mockRejectedValueOnce(new Error("host failed"));
    expect((await POST(request())).status).toBe(503);
  });
  it("requires a same-origin authenticated AJAX request and enforces limits", async () => {
    mocks.user.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    mocks.origin.mockReturnValueOnce(false);
    expect((await POST(request())).status).toBe(403);
    mocks.ajax.mockReturnValueOnce(false);
    expect((await POST(request())).status).toBe(403);
    mocks.limit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 10 });
    const limited = await POST(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("10");
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
});
