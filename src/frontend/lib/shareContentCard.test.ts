import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildShareCardPayload, shareContentDetails } from "./shareContentCard";

describe("buildShareCardPayload", () => {
  it("builds social share copy and poster file metadata for a movie", () => {
    const payload = buildShareCardPayload({
      contentType: "movie",
      title: "Dune: Part Two",
      year: "2024",
      overview: "Paul Atreides unites with Chani and the Fremen while seeking revenge.",
      rating: 8.4,
      genres: ["Science Fiction", "Adventure"],
      posterUrl: "https://image.tmdb.org/t/p/w500/dune.jpg",
      pageUrl: "https://moviereckon.test/movie/693134",
    });

    expect(payload).toEqual({
      title: "Dune: Part Two (2024)",
      text:
        "Dune: Part Two (2024) • Movie • 8.4/10 • Science Fiction, Adventure\n" +
        "Paul Atreides unites with Chani and the Fremen while seeking revenge.",
      url: "https://moviereckon.test/movie/693134",
      posterUrl: "https://image.tmdb.org/t/p/w500/dune.jpg",
      fileName: "dune-part-two-2024-poster.jpg",
    });
  });

  it("builds series copy without empty optional fields", () => {
    const payload = buildShareCardPayload({
      contentType: "tv",
      title: "Signal Show",
      pageUrl: "https://moviereckon.test/tv/321",
      posterUrl: null,
      overview: "",
      genres: [],
    });

    expect(payload.title).toBe("Signal Show");
    expect(payload.text).toBe("Signal Show • Series");
    expect(payload.fileName).toBe("signal-show-poster.jpg");
  });
});

describe("shareContentDetails", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shares the raw poster image file without generating a card canvas", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    const createElementSpy = vi.spyOn(document, "createElement");

    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: canShare,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        {
          ok: true,
          blob: async () => new Blob(["poster"], { type: "image/jpeg" }),
        },
      ),
    );

    await shareContentDetails({
      contentType: "movie",
      title: "Dune: Part Two",
      year: "2024",
      posterUrl: "https://image.tmdb.org/t/p/w500/dune.jpg",
      pageUrl: "https://moviereckon.test/movie/693134",
    });

    expect(fetch).toHaveBeenCalledWith("https://image.tmdb.org/t/p/w500/dune.jpg");
    expect(createElementSpy).not.toHaveBeenCalledWith("canvas");
    expect(share).toHaveBeenCalledOnce();

    const shareData = share.mock.calls[0][0] as ShareData;
    expect(shareData.files).toHaveLength(1);
    expect(shareData.files?.[0]).toMatchObject({
      name: "dune-part-two-2024-poster.jpg",
      type: "image/jpeg",
    });
  });
});
