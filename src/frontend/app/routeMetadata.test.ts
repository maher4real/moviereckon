import { describe, expect, it, vi } from "vitest";
import { buildRouteMetadata, pathFromSlug } from "./routeMetadata";

const robotsOf = (meta: Awaited<ReturnType<typeof buildRouteMetadata>>) => meta.robots as { index: boolean; follow: boolean };

describe("pathFromSlug", () => {
  it("rebuilds the pathname from catch-all segments", () => {
    expect(pathFromSlug(undefined)).toBe("/");
    expect(pathFromSlug([])).toBe("/");
    expect(pathFromSlug(["movie", "603"])).toBe("/movie/603");
    expect(pathFromSlug(["a%20b"])).toBe("/a b");
    expect(pathFromSlug(["%E0%A4%A"])).toBe("/%E0%A4%A"); // malformed escapes never throw
  });
});

describe("buildRouteMetadata", () => {
  it("gives the landing page its own absolute title, Open Graph and index rules", async () => {
    const meta = await buildRouteMetadata("/");
    expect(meta.title).toEqual({ absolute: expect.stringContaining("MovieReckon") });
    expect(robotsOf(meta).index).toBe(true);
    expect(meta.openGraph?.images).toBeTruthy();
    expect(meta.alternates?.canonical).toBe("/");
  });

  it("indexes the public legal and help pages with a canonical URL", async () => {
    for (const path of ["/about", "/faq", "/terms", "/privacy", "/contact"]) {
      const meta = await buildRouteMetadata(path);
      expect(robotsOf(meta).index, path).toBe(true);
      expect(meta.alternates?.canonical, path).toBe(path);
      expect(meta.description, path).toBeTruthy();
    }
  });

  it("keeps signed-in and account pages out of search results", async () => {
    for (const path of ["/home", "/movies", "/series", "/upcoming", "/search", "/reckon", "/reckon/preferences", "/profile", "/profile/edit", "/auth", "/forgot-password", "/feedback", "/person/12"]) {
      const meta = await buildRouteMetadata(path);
      expect(robotsOf(meta), path).toEqual({ index: false, follow: false });
    }
  });

  it("ignores a trailing slash", async () => {
    expect((await buildRouteMetadata("/about/")).title).toBe("About");
  });

  it("marks unknown routes as not found and unindexed", async () => {
    const meta = await buildRouteMetadata("/nope/nothing");
    expect(meta.title).toBe("Page not found");
    expect(robotsOf(meta).index).toBe(false);
  });

  it("titles a movie page with its name and year, with a poster for link previews", async () => {
    const movie = vi.fn().mockResolvedValue({ title: "Dune: Part Two", overview: "Paul Atreides unites with the Fremen.", posterPath: "/dune2.jpg", year: "2024" });
    const meta = await buildRouteMetadata("/movie/693134", { movie });
    expect(movie).toHaveBeenCalledWith(693134);
    expect(meta.title).toBe("Dune: Part Two (2024)");
    expect(meta.description).toBe("Paul Atreides unites with the Fremen.");
    expect(meta.openGraph?.images).toEqual([{ url: "https://image.tmdb.org/t/p/w500/dune2.jpg", alt: "Dune: Part Two poster" }]);
    expect(robotsOf(meta).index).toBe(false);
  });

  it("uses the series loader for /tv and truncates long overviews", async () => {
    const tv = vi.fn().mockResolvedValue({ title: "Dark", overview: "x".repeat(400), year: null });
    const meta = await buildRouteMetadata("/tv/70523", { tv });
    expect(meta.title).toBe("Dark");
    expect(String(meta.description).length).toBeLessThanOrEqual(180);
    expect(String(meta.description).endsWith("…")).toBe(true);
  });

  it("falls back to a generic title when TMDB fails, times out or returns nothing", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("TMDB timeout"));
    expect((await buildRouteMetadata("/movie/1", { movie: failing })).title).toBe("Movie");
    expect((await buildRouteMetadata("/tv/1", { tv: vi.fn().mockResolvedValue(null) })).title).toBe("TV series");
    expect((await buildRouteMetadata("/movie/1")).title).toBe("Movie");
  });

  it("does not treat non-numeric ids as titles", async () => {
    const movie = vi.fn();
    const meta = await buildRouteMetadata("/movie/abc", { movie });
    expect(movie).not.toHaveBeenCalled();
    expect(meta.title).toBe("Page not found");
  });
});
