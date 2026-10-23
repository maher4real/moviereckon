import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), origin: vi.fn(), ajax: vi.fn(), limit: vi.fn(), lookup: vi.fn(), check: vi.fn() }));
vi.mock("@/backend/api/lib/auth", () => ({ getUserFromRequest: mocks.user }));
vi.mock("@/backend/api/lib/cors", () => ({ hasAjaxHeader: mocks.ajax, isTrustedRequestOrigin: mocks.origin }));
vi.mock("@/backend/api/lib/rate-limit", () => ({ consumeRateLimit: mocks.limit }));
vi.mock("./store", () => ({ lookupContentSources: mocks.lookup }));
vi.mock("./availability", () => ({ checkWatchLink: mocks.check }));
import { POST } from "@/app/api/watch-sources/check/route";
const input = { contentId: 42, contentType: "movie", linkIds: ["saved"] };
const request = (body: unknown = input) => new Request("https://app.example/api/watch-sources/check", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "viewer" }); mocks.origin.mockReturnValue(true); mocks.ajax.mockReturnValue(true);
  mocks.limit.mockResolvedValue({ allowed: true }); mocks.lookup.mockResolvedValue({ sources: [{ title: "Example", links: [{ id: "saved", url: "https://hubcdn.club/file/1" }] }] });
  mocks.check.mockResolvedValue({ linkId: "saved", available: true });
});
describe("working links endpoint", () => {
  it("checks only saved IDs for the selected title and deduplicates the batch", async () => {
    const response = await POST(request({ ...input, linkIds: ["saved", "saved", "wrong-title"] }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ checks: [{ linkId: "saved", available: true }] });
    expect(mocks.check).toHaveBeenCalledExactlyOnceWith({ id: "saved", url: "https://hubcdn.club/file/1" }, "Example", { contentId: 42, contentType: "movie" });
  });
  it("forces fresh checks only when explicitly requested", async () => {
    await POST(request({ ...input, force: true }));
    expect(mocks.check).toHaveBeenCalledWith(expect.any(Object), "Example", { contentId: 42, contentType: "movie" }, undefined, true);
  });
  it("rejects URLs and oversized batches before accessing sources", async () => {
    expect((await POST(request({ ...input, url: "http://127.0.0.1" }))).status).toBe(400);
    expect((await POST(request({ ...input, linkIds: Array(5).fill("saved") }))).status).toBe(400);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("requires authenticated same-origin AJAX requests and limits checking", async () => {
    mocks.user.mockResolvedValueOnce(null); expect((await POST(request())).status).toBe(401);
    mocks.origin.mockReturnValueOnce(false); expect((await POST(request())).status).toBe(403);
    mocks.ajax.mockReturnValueOnce(false); expect((await POST(request())).status).toBe(403);
    mocks.limit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 12 });
    const response = await POST(request()); expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("12");
    expect(mocks.check).not.toHaveBeenCalled();
  });
});
