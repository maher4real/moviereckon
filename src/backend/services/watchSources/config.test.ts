import { afterEach, describe, expect, it, vi } from "vitest";
import { getCatalogConfigs } from "./config";
import { sourcePageId } from "./store";
const config = { baseUrl: "https://new8.hdhub4u.cl", batchSize: 20, concurrency: 3, discoveryPages: 2, refreshHours: 24, budgetMs: 210_000 };
afterEach(() => vi.unstubAllEnvs());
describe("catalog configuration", () => {
  it("enables five independent catalogs and retains stable IDs across domain rotations", () => {
    expect(getCatalogConfigs(config).map((catalog) => catalog.provider || "hdhub")).toEqual(["hdhub", "4khdhub", "moviesmod", "bollyflix", "uhdmovies"]);
    expect(sourcePageId("https://old.example/same/", "moviesmod")).toBe(sourcePageId("https://new.example/same/", "moviesmod"));
    expect(sourcePageId("https://old.example/same/", "moviesmod")).not.toBe(sourcePageId("https://old.example/same/", "bollyflix"));
  });
  it("allows independent disabling and HTTPS domain rotation", () => {
    vi.stubEnv("WATCH_BOLLYFLIX_ENABLED", "false");
    vi.stubEnv("MOVIESMOD_BASE_URL", "https://new.example/");
    expect(getCatalogConfigs(config).find((c) => c.provider === "moviesmod")?.baseUrl).toBe("https://new.example");
    expect(getCatalogConfigs(config).some((c) => c.provider === "bollyflix")).toBe(false);
  });
  it.each(["http://example.com", "https://127.0.0.1", "https://localhost", "https://example.com/path/", "https://user:password@example.com"])("rejects unsafe or non-origin catalog settings: %s", (value) => {
    vi.stubEnv("MOVIESMOD_BASE_URL", value);
    expect(() => getCatalogConfigs(config)).toThrow("public HTTPS origin");
  });
});
