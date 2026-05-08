import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ShareContentButton from "./ShareContentButton";

const mocks = vi.hoisted(() => ({
  shareContentDetails: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/frontend/lib/shareContentCard", () => ({
  shareContentDetails: mocks.shareContentDetails,
}));

vi.mock("@/frontend/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

describe("ShareContentButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shareContentDetails.mockResolvedValue({ method: "native", sharedFile: true });
  });

  it("shares the current content details with poster card data", async () => {
    render(
      <ShareContentButton
        contentType="movie"
        title="Dune: Part Two"
        year="2024"
        overview="Paul Atreides unites with Chani and the Fremen."
        rating={8.4}
        genres={["Science Fiction", "Adventure"]}
        posterUrl="https://image.tmdb.org/t/p/w500/dune.jpg"
        pageUrl="https://moviereckon.test/movie/693134"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => {
      expect(mocks.shareContentDetails).toHaveBeenCalledWith({
        contentType: "movie",
        title: "Dune: Part Two",
        year: "2024",
        overview: "Paul Atreides unites with Chani and the Fremen.",
        rating: 8.4,
        genres: ["Science Fiction", "Adventure"],
        posterUrl: "https://image.tmdb.org/t/p/w500/dune.jpg",
        pageUrl: "https://moviereckon.test/movie/693134",
      });
    });
  });
});
