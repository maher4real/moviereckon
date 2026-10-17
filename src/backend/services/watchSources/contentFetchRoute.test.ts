import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), origin: vi.fn(), ajax: vi.fn(), limit: vi.fn(), fetch: vi.fn(), search: vi.fn() }));
vi.mock("@/backend/api/lib/auth", () => ({ getUserFromRequest: mocks.user }));
vi.mock("@/backend/api/lib/cors", () => ({ hasAjaxHeader: mocks.ajax, isTrustedRequestOrigin: mocks.origin }));
vi.mock("@/backend/api/lib/rate-limit", () => ({ consumeRateLimit: mocks.limit }));
vi.mock("./contentImport", () => ({ fetchContentSources: mocks.fetch, SourceSelectionError: class extends Error {} }));
vi.mock("./search", () => ({ searchContentSources: mocks.search }));
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
  mocks.user.mockResolvedValue({ id: "viewer", role: "user" });
  mocks.origin.mockReturnValue(true);
  mocks.ajax.mockReturnValue(true);
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.fetch.mockResolvedValue({ status: "imported", content: { sources: [] } });
  mocks.search.mockResolvedValue({ status: "imported", content: { sources: [] } });
});
afterEach(() => vi.unstubAllEnvs());

describe("session-authenticated per-title importing", () => {
  it("streams saved results before completion and closes with a final result", async () => {
    const content = { contentId: 42, contentType: "movie", sources: [] };
    let finish!: () => void;
    mocks.search.mockImplementation(async (_id, _type, _config, emit) => {
      emit({ type: "content", content });
      await new Promise<void>((resolve) => { finish = resolve; });
      return { content, status: "not_found", importedPages: 0, errors: 0 };
    });
    const req = request(); req.headers.set("Accept", "application/x-ndjson");
    const response = await POST(req);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson");
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('"type":"progress"');
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"content"');
    finish();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"complete"');
    expect((await reader.read()).done).toBe(true);
  });
  it("returns a stream error without exposing internal provider failures", async () => {
    mocks.search.mockRejectedValue(new Error("private database details"));
    const req = request(); req.headers.set("Accept", "application/x-ndjson");
    const response = await POST(req);
    const text = await response.text();
    expect(text).toContain('"type":"error"');
    expect(text).not.toContain("private database");
  });
  it.each(["user", "moderator", "admin"])("runs for a signed-in %s without a cron secret or client bearer token", async (role) => {
    mocks.user.mockResolvedValue({ id: "viewer", role });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.limit).toHaveBeenCalledWith("watch_source_fetch:viewer", 6, 60_000);
    expect(mocks.search).toHaveBeenCalledWith(42, "movie", expect.anything());
  });
  it("rejects signed-out users, invalid origins and missing AJAX headers", async () => {
    mocks.user.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    mocks.origin.mockReturnValueOnce(false);
    expect((await POST(request())).status).toBe(403);
    mocks.ajax.mockReturnValueOnce(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("fetches the selected series with the same per-title session flow", async () => {
    expect((await POST(request({ contentId: 321, contentType: "tv" }))).status).toBe(200);
    expect(mocks.search).toHaveBeenCalledWith(321, "tv", expect.anything());
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
    expect((await POST(request({ contentId: 42, contentType: "movie", sourceUrl: "https://new7.hdhub4u.cl/title-full-movie/" }))).status).toBe(422);
  });
});
