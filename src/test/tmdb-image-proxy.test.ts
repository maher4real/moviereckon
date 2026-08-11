import { describe, expect, it } from "vitest";
import {
  buildTmdbImageProxyUrl,
  buildTmdbImageProxyResponsiveSource,
  decodeTmdbImageRef,
  encodeTmdbImageRef,
  resolveTmdbImageSourceUrl,
} from "@/shared/lib/tmdbImageProxy";

describe("tmdb image proxy urls", () => {
  it("builds same-origin proxy URLs instead of exposing tmdb hosts", () => {
    const url = buildTmdbImageProxyUrl({
      path: "/drRxbu2OHG0DEENptZ8wI5f0uEU.jpg",
      kind: "backdrop",
      size: "w1280",
    });

    expect(url).toMatch(/^\/api\/tmdb-image\?/);
    expect(url).toContain("kind=backdrop");
    expect(url).toContain("size=w1280");
    expect(url).not.toContain("image.tmdb.org");
    expect(url).not.toContain("/drRxbu2OHG0DEENptZ8wI5f0uEU.jpg");
  });

  it("round-trips image refs on the server", () => {
    const ref = encodeTmdbImageRef("/poster-file.jpg");

    expect(decodeTmdbImageRef(ref)).toBe("/poster-file.jpg");
    expect(
      resolveTmdbImageSourceUrl({
        kind: "poster",
        ref,
        size: "w500",
      }),
    ).toBe("https://image.tmdb.org/t/p/w500/poster-file.jpg");
  });

  it("builds responsive proxy sources so small cards do not download w342", () => {
    const proxyUrl = buildTmdbImageProxyUrl({
      path: "/poster-file.jpg",
      kind: "poster",
      size: "w342",
    });
    const source = buildTmdbImageProxyResponsiveSource(proxyUrl || "");

    expect(source?.srcSet).toContain("size=w185");
    expect(source?.srcSet).toContain("185w");
    expect(source?.srcSet).toContain("size=w500");
    expect(source?.srcSet).not.toContain("size=original");
    expect(source?.sizes).toContain("44vw");
  });
});
