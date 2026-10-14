import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ run: vi.fn(), preview: vi.fn(), lookup: vi.fn() }));
vi.mock("./importer", () => ({ runSourceImport: mocks.run, previewSourcePages: mocks.preview }));
vi.mock("./store", () => ({ lookupContentSources: mocks.lookup }));
import { GET as cron, POST as manual } from "@/app/api/import/watch-sources/route";
import { GET as lookup } from "@/app/api/watch-sources/route";

const secret = "a".repeat(40);
const headers = { authorization: `Bearer ${secret}`, "content-type": "application/json" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", secret);
  vi.stubEnv("MONGODB_URI", "configured");
  vi.stubEnv("TMDB_API_KEY", "configured");
  vi.stubEnv("HDHUB_BASE_URL", "https://new7.hdhub4u.cl");
  vi.stubEnv("WATCH_IMPORTER_ENABLED", "true");
  mocks.run.mockResolvedValue({ processed: 1 });
  mocks.preview.mockResolvedValue([{ parsed: { links: [] } }]);
  mocks.lookup.mockResolvedValue({ sources: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe("protected importer endpoints", () => {
  it("rejects missing and malformed credentials without triggering imports", async () => {
    expect((await cron(new Request("https://app.example/api/import/watch-sources"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await cron(new Request("https://app.example/api/import/watch-sources", { headers: { authorization: "Bearer undefined" } }))).status).toBe(503);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("runs authenticated scheduled imports and keeps their response uncached", async () => {
    const response = await cron(new Request("https://app.example/api/import/watch-sources", { headers }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.run).toHaveBeenCalledWith({ urls: undefined }, expect.objectContaining({ concurrency: 3 }));
  });

  it("previews allowed page URLs without requiring a database", async () => {
    vi.stubEnv("MONGODB_URI", "");
    const response = await manual(new Request("https://app.example/api/import/watch-sources", {
      method: "POST", headers, body: JSON.stringify({ urls: ["/example-full-movie/"], dryRun: true }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.preview).toHaveBeenCalledWith(["https://new7.hdhub4u.cl/example-full-movie/"], expect.anything());
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it.each([
    { urls: ["http://127.0.0.1/private"], dryRun: true },
    { urls: ["https://other.example/post/"], dryRun: true },
    { dryRun: true },
    { urls: [], dryRun: false },
    { urls: ["/post/"], dryRun: "true" },
  ])("rejects invalid manual input %j", async (body) => {
    const response = await manual(new Request("https://app.example/api/import/watch-sources", { method: "POST", headers, body: JSON.stringify(body) }));
    expect(response.status).toBe(400);
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
});

describe("content source lookup", () => {
  it("queries sources by media type, TMDB ID and exact episode", async () => {
    const response = await lookup(new Request("https://app.example/api/watch-sources?contentType=tv&contentId=42&season=1&episode=2"));
    expect(response.status).toBe(200);
    expect(mocks.lookup).toHaveBeenCalledWith(42, "tv", 1, 2);
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
  });

  it.each(["", "contentId=-1&contentType=movie", "contentId=42&contentType=movie&episode=1", "contentId=42&contentType=tv&episode=1", "contentId=42&contentType=person"])("rejects invalid lookup %s", async (query) => {
    expect((await lookup(new Request(`https://app.example/api/watch-sources?${query}`))).status).toBe(400);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("returns an uncached availability error if storage fails", async () => {
    mocks.lookup.mockRejectedValueOnce(new Error("private database error"));
    const response = await lookup(new Request("https://app.example/api/watch-sources?contentType=movie&contentId=42"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
