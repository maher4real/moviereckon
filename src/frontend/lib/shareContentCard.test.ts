import { describe, expect, it } from "vitest";
import { buildShareCardPayload } from "./shareContentCard";

describe("buildShareCardPayload", () => {
  it("builds social share copy and poster card metadata for a movie", () => {
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
      fileName: "dune-part-two-2024-share-card.png",
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
    expect(payload.fileName).toBe("signal-show-share-card.png");
  });
});
