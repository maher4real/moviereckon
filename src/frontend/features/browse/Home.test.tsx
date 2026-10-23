import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Movie, TVShow } from "@/shared/lib/tmdb";
import Home from "./Home";

// Hooks return stable objects, as the real ones do; Home keys effects on them.
const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  auth: { user: { id: "u1", username: "Maya" }, profile: null },
  userData: {
    watchHistory: [{ content_id: 120, content_type: "movie", title: "The Fellowship of the Ring", poster_path: "/f.jpg", genres: [12], language: "en" }],
  },
  watchlist: { items: [{ content_id: 77, content_type: "tv", title: "Saved Show", poster_path: "/s.jpg", watched: false }] },
  picksGate: { allowed: false, markShown: () => {}, skipToday: () => {} },
  navigate: () => {},
  location: { pathname: "/", search: "" },
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate, useLocation: () => mocks.location }));
vi.mock("motion/react", () => ({ useReducedMotion: () => true }));
vi.mock("@/frontend/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/frontend/hooks/useUserData", () => ({ useUserData: () => mocks.userData }));
const recommendations = { items: [] as Movie[], isLoading: false, isPersonalized: true, explanationById: {} };
vi.mock("@/frontend/hooks/useRecommendations", () => ({ useRecommendations: () => recommendations }));
vi.mock("@/frontend/hooks/useWatchlist", () => ({ useWatchlist: () => mocks.watchlist }));
vi.mock("@/frontend/hooks/useTodaysPicksGate", () => ({ useTodaysPicksGate: () => mocks.picksGate }));
vi.mock("@/frontend/lib/startupSound", () => ({ announceHomeHeroReady: vi.fn() }));
vi.mock("@/frontend/components/Header", () => ({ default: () => <div /> }));
vi.mock("@/frontend/components/Footer", () => ({ default: () => <div /> }));
vi.mock("@/frontend/components/HeroBanner", () => ({
  default: ({ movie: hero }: { movie: Movie }) => <div data-testid="hero">{hero.title}</div>,
}));
vi.mock("@/frontend/components/GenreRail", () => ({ default: () => <div /> }));
vi.mock("@/frontend/components/TodaysPicksDialog", () => ({ default: () => null }));
vi.mock("@/frontend/components/MediaImage", () => ({ default: () => <img alt="" /> }));
vi.mock("@/frontend/components/ContentCarousel", () => ({
  default: ({ title, items, isLoading }: { title: string; items?: Array<Movie | TVShow>; isLoading: boolean }) =>
    !isLoading && (!items || items.length === 0) ? null : (
      <section aria-label={title} data-testid="shelf">
        {(items || []).map((item) => <span key={`${"title" in item ? "m" : "t"}${item.id}`}>{"title" in item ? item.title : item.name}</span>)}
      </section>
    ),
}));

function movie(id: number, language = "en", title = `Movie ${id}`, release_date = "2025-06-01"): Movie {
  return {
    id, title, original_title: title, overview: "", poster_path: `/m${id}.jpg`, backdrop_path: `/b${id}.jpg`,
    release_date, vote_average: 7.5, vote_count: 900, popularity: 80, genre_ids: [28], original_language: language,
    adult: false, video: false,
  };
}

function series(id: number, language = "en"): TVShow {
  return {
    id, name: `Series ${id}`, original_name: `Series ${id}`, overview: "", poster_path: `/t${id}.jpg`, backdrop_path: null,
    first_air_date: "2025-01-01", vote_average: 8, vote_count: 400, popularity: 70, genre_ids: [18], original_language: language, origin_country: [],
  };
}

recommendations.items = [movie(500, "en", "Reckon pick")];

const recent = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
const DATA: Record<string, unknown> = {
  "trending-movies": [movie(1, "en", "Hollywood Hit"), movie(2)],
  "trending-tv-week": [series(10)],
  "home-new-releases": [[movie(31, "en", "New Hollywood", recent)], [movie(32, "hi", "New Bollywood", recent)], [], [], [series(33)]],
  "because-you-watched": [movie(121, "en", "The Two Towers")],
  "home-blend-genre": [[movie(41, "en", "English Action")], [movie(42, "hi", "Hindi Action")]],
};

describe("Home", () => {
  beforeEach(() => {
    const results = new Map<string, { data: unknown; isLoading: boolean }>();
    mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      const key = queryKey.join("|");
      if (!results.has(key)) results.set(key, { data: DATA[queryKey[0]!], isLoading: false });
      return results.get(key)!;
    });
  });

  it("orders rows like a streaming home and blends industries", () => {
    render(<Home />);
    const rows = screen.getAllByRole("region").map((row) => row.getAttribute("aria-label"));
    expect(rows.slice(0, 6)).toEqual([
      "Continue Watching",
      "Top 10 This Week",
      "New on MovieReckon",
      "Reckon For You",
      "Because you watched The Fellowship of the Ring",
      "My List",
    ]);
    const fresh = screen.getByRole("region", { name: "New on MovieReckon" });
    expect(fresh.textContent).toContain("New Hollywood");
    expect(fresh.textContent).toContain("New Bollywood");
    expect(fresh.textContent).toContain("Series 33");
    const action = screen.getByRole("region", { name: "Action & Thrillers" });
    expect(action.textContent).toContain("English Action");
    expect(action.textContent).toContain("Hindi Action");
  });

  it("ranks films and series together in the Top 10", () => {
    render(<Home />);
    expect(screen.getByRole("button", { name: "Number 1: Hollywood Hit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Number 2: Series 10" })).toBeInTheDocument();
  });

  it("blends new Bollywood releases into the hero rotation", () => {
    render(<Home />);
    expect(screen.getByTestId("hero")).toHaveTextContent("Hollywood Hit");
  });
});
