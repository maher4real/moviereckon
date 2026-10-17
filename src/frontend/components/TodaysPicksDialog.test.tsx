import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Movie, TVShow } from "@/shared/lib/tmdb";
import type { PickCandidate } from "@/shared/lib/recommendation/todaysPicks";

const toggleItem = vi.fn();
let saved = new Set<string>();
vi.mock("@/frontend/hooks/useWatchlist", () => ({
  useWatchlist: () => ({ toggleItem, isInWatchlist: (id: number, type: string) => saved.has(`${type}_${id}`) }),
}));
vi.mock("@/frontend/components/MediaImage", () => ({ default: ({ alt }: { alt: string }) => <img alt={alt} /> }));

import TodaysPicksDialog from "./TodaysPicksDialog";

const movie = (id: number, genre = 18): Movie => ({ id, title: `Movie ${id}`, original_title: "", overview: `Overview ${id}`, poster_path: "/p.jpg", backdrop_path: "/b.jpg", release_date: "2020-01-01", vote_average: 7.5, vote_count: 900, popularity: 1, genre_ids: [genre], original_language: "en", adult: false, video: false });
const show = (id: number, genre = 35): TVShow => ({ id, name: `Show ${id}`, original_name: "", overview: `Overview ${id}`, poster_path: "/p.jpg", backdrop_path: "/b.jpg", first_air_date: "2021-01-01", vote_average: 8, vote_count: 900, popularity: 1, genre_ids: [genre], original_language: "ko", origin_country: [] });
const candidates: PickCandidate[] = [
  ...[1, 2, 3, 4].map((id, i) => ({ item: movie(id, [18, 28, 53, 878][i]), source: "feed" as const, reason: i === 0 ? "Matches your selected drama" : undefined })),
  ...[1, 2, 3, 4].map((id, i) => ({ item: show(id, [35, 10765, 80, 9648][i]), source: "trending" as const })),
];

function renderDialog(props: Partial<React.ComponentProps<typeof TodaysPicksDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onSkipToday = vi.fn();
  render(
    <MemoryRouter initialEntries={["/home"]}>
      <Routes>
        <Route path="/home" element={<TodaysPicksDialog open onOpenChange={onOpenChange} candidates={candidates} excludeKeys={new Set()} personalized name="Maher" onSkipToday={onSkipToday} {...props} />} />
        <Route path="/movie/:id" element={<p>Movie detail page</p>} />
        <Route path="/tv/:id" element={<p>Series detail page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return { onOpenChange, onSkipToday };
}

describe("TodaysPicksDialog", () => {
  beforeEach(() => { toggleItem.mockReset(); saved = new Set(); });

  it("greets the viewer and shows a featured pick plus a mix of films and series", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: /what to watch/i })).toBeInTheDocument();
    expect(screen.getByText(/Maher/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Top pick:/)).toBeInTheDocument();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(5);
    const labels = cards.map((card) => within(card).getAllByRole("button")[0].getAttribute("aria-label") || "");
    expect(labels.some((label) => label.includes("movie."))).toBe(true);
    expect(labels.some((label) => label.includes("series."))).toBe(true);
  });

  it("opens the chosen title's details and closes the card", () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByText(/detail page/)).toBeInTheDocument();
  });

  it("opens a card from the grid", () => {
    renderDialog();
    const card = screen.getAllByRole("listitem")[0];
    fireEvent.click(within(card).getAllByRole("button")[0]);
    expect(screen.getByText(/detail page/)).toBeInTheDocument();
  });

  it("saves a title for later without opening it", () => {
    renderDialog();
    const card = screen.getAllByRole("listitem")[0];
    fireEvent.click(within(card).getByRole("button", { name: /^Save .* for later$/ }));
    expect(toggleItem).toHaveBeenCalledTimes(1);
    expect(toggleItem.mock.calls[0][0]).toMatchObject({ poster_path: "/p.jpg" });
    expect(screen.queryByText(/detail page/)).not.toBeInTheDocument();
  });

  it("filters to movies or series only", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Series" }));
    const labels = screen.getAllByRole("listitem").map((card) => within(card).getAllByRole("button")[0].getAttribute("aria-label") || "");
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((label) => label.includes("series."))).toBe(true);
    expect(screen.getByRole("button", { name: "Series" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shuffles to a different set", () => {
    const many: PickCandidate[] = [
      ...Array.from({ length: 14 }, (_, i) => ({ item: movie(100 + i, [18, 28, 53, 878, 80, 35, 27][i % 7]), source: "feed" as const })),
      ...Array.from({ length: 14 }, (_, i) => ({ item: show(100 + i, [18, 28, 53, 878, 80, 35, 27][i % 7]), source: "trending" as const })),
    ];
    renderDialog({ candidates: many });
    const snapshot = () => screen.getAllByRole("listitem").map((c) => within(c).getAllByRole("button")[0].getAttribute("aria-label")).join("|");
    const seen = new Set([snapshot()]);
    for (let i = 0; i < 4; i += 1) { fireEvent.click(screen.getByRole("button", { name: /shuffle/i })); seen.add(snapshot()); }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("'Skip for today' and 'Not now' are distinct", () => {
    const { onOpenChange, onSkipToday } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onSkipToday).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Skip for today" }));
    expect(onSkipToday).toHaveBeenCalledTimes(1);
  });

  it("explains non-personalised picks and never lists watched titles", () => {
    renderDialog({ personalized: false, excludeKeys: new Set(["movie_1", "movie_2", "movie_3", "movie_4"]) });
    expect(screen.getByText(/Popular right now/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Movie \d/)).not.toBeInTheDocument();
  });
});
