import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), role: vi.fn(), origin: vi.fn(), ajax: vi.fn(), limit: vi.fn(), fetch: vi.fn() }));
vi.mock("@/backend/api/lib/auth", () => ({ getUserFromRequest: mocks.user, userHasRoleAtLeast: mocks.role }));
vi.mock("@/backend/api/lib/cors", () => ({ hasAjaxHeader: mocks.ajax, isTrustedRequestOrigin: mocks.origin }));
vi.mock("@/backend/api/lib/rate-limit", () => ({ consumeRateLimit: mocks.limit }));
vi.mock("./contentImport", () => ({ fetchContentSources: mocks.fetch, SourceSelectionError: class extends Error {} }));
import { POST } from "@/app/api/watch-sources/fetch/route";
import { SourceSelectionError } from "./contentImport";

const request = (body: unknown = { contentId: 42, contentType: "movie" }) => new Request("https://app.example/api/watch-sources/fetch", {
  method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", origin: "https://app.example" }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "");
  vi.stubEnv("MONGODB_URI", "configured");
  vi.stubEnv("TMDB_API_KEY", "configured");
  vi.stubEnv("HDHUB_BASE_URL", "https://new7.hdhub4u.cl");
  vi.stubEnv("WATCH_IMPORTER_ENABLED", "true");
  mocks.user.mockResolvedValue({ id: "admin", role: "admin" });
  mocks.role.mockResolvedValue(true);
  mocks.origin.mockReturnValue(true);
  mocks.ajax.mockReturnValue(true);
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.fetch.mockResolvedValue({ status: "imported", content: { sources: [] } });
});
afterEach(() => vi.unstubAllEnvs());

describe("session-authenticated per-title importing", () => {
  it("runs for an admin without a cron secret or client bearer token", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.role).toHaveBeenCalledWith(expect.objectContaining({ id: "admin" }), "admin");
    expect(mocks.fetch).toHaveBeenCalledWith(42, "movie", undefined, expect.anything());
  });
  it("rejects signed-out users, non-admins and invalid origins", async () => {
    mocks.user.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    mocks.role.mockResolvedValueOnce(false);
    expect((await POST(request())).status).toBe(403);
    mocks.origin.mockReturnValueOnce(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each([
    { contentId: 42, contentType: "movie", sourceUrl: "https://other.example/post/" },
    { contentId: 42, contentType: "movie", sourceUrl: "http://127.0.0.1/private" },
    { contentId: "42", contentType: "movie" },
    { contentId: 42, contentType: "person" },
  ])("rejects invalid per-content input %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("returns a clear configuration error and enforces the rate limit", async () => {
    vi.stubEnv("TMDB_API_KEY", "");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("TMDB_API_KEY");
    mocks.limit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    const throttled = await POST(request());
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("retry-after")).toBe("30");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("reports an explicit source/title mismatch as a validation error", async () => {
    mocks.fetch.mockRejectedValueOnce(new SourceSelectionError("This source page does not match the selected movie or series"));
    expect((await POST(request())).status).toBe(422);
  });
});
