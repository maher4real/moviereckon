import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MovieDetail from "./MovieDetail";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useParams: vi.fn(),
  useNavigate: vi.fn(),
  useLocation: vi.fn(),
  useAuth: vi.fn(),
  useUserData: vi.fn(),
  useWatchlist: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("react-router-dom", () => ({
  useParams: mocks.useParams,
  useNavigate: mocks.useNavigate,
  useLocation: mocks.useLocation,
}));

vi.mock("@/frontend/hooks/useAuth", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@/frontend/hooks/useUserData", () => ({
  useUserData: mocks.useUserData,
}));

vi.mock("@/frontend/hooks/useWatchlist", () => ({
  useWatchlist: mocks.useWatchlist,
}));

vi.mock("@/shared/lib/tmdb", () => ({
  getMovieDetails: vi.fn(),
  getMovieCredits: vi.fn(),
  getMovieReleaseDates: vi.fn(),
  getMovieVideos: vi.fn(),
  getMovieKeywords: vi.fn(),
  getSimilarMovies: vi.fn(),
  getMovieWatchProviders: vi.fn(),
  getBackdropUrl: () => "/backdrop.jpg",
  getPosterUrl: () => "/poster.jpg",
  getYouTubeTrailerUrl: () => null,
  getLanguageLabel: () => "English",
}));

vi.mock("@/frontend/components/Header", () => ({
  default: () => <div data-testid="header" />,
}));

vi.mock("@/frontend/components/Footer", () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock("@/frontend/components/BottomNav", () => ({
  default: () => <div data-testid="bottom-nav" />,
}));

vi.mock("@/frontend/components/ContentCarousel", () => ({
  default: () => <div data-testid="content-carousel" />,
}));

vi.mock("@/frontend/components/WhereToWatch", () => ({
  default: () => <div data-testid="where-to-watch" />,
}));

vi.mock("@/frontend/components/CastList", () => ({
  default: () => <div data-testid="cast-list" />,
}));

vi.mock("@/frontend/components/MediaImage", () => ({
  default: ({ alt = "" }: { alt?: string }) => <img alt={alt} />,
}));

vi.mock("@/frontend/components/CommentsSection", () => ({
  default: () => <div data-testid="comments-section" />,
}));

const movie = {
  id: 693134,
  title: "Dune: Part Two",
  original_title: "Dune: Part Two",
  tagline: "",
  overview: "A test movie",
  poster_path: "/dune.jpg",
  backdrop_path: null,
  release_date: "2024-03-01",
  vote_average: 8.4,
  vote_count: 1200,
  popularity: 100,
  genre_ids: [878],
  original_language: "en",
  adult: false,
  video: false,
  genres: [{ id: 878, name: "Science Fiction" }],
  production_countries: [],
  status: "Released",
  runtime: 166,
  budget: 190000000,
  revenue: 700000000,
  imdb_id: "tt15239678",
  homepage: "",
};

describe("MovieDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );

    mocks.useParams.mockReturnValue({ id: "693134" });
    mocks.useNavigate.mockReturnValue(vi.fn());
    mocks.useLocation.mockReturnValue({ state: null, pathname: "/movie/693134", search: "", hash: "" });
    mocks.useAuth.mockReturnValue({ user: { id: "user_1" } });
    mocks.useUserData.mockReturnValue({
      addToWatchHistory: vi.fn(),
      isWatched: () => false,
      toggleLike: vi.fn(),
      isLiked: () => false,
      getFeedback: () => null,
      setFeedback: vi.fn(),
    });
    mocks.useWatchlist.mockReturnValue({
      isInWatchlist: () => false,
      toggleItem: vi.fn(),
    });
    mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = queryKey[0];
      if (key === "movie") return { data: movie, isLoading: false, isError: false };
      if (key === "movie-credits") return { data: { cast: [], crew: [] } };
      if (key === "movie-videos") return { data: { results: [] } };
      if (key === "similar-movies") return { data: { results: [] }, isLoading: false };
      if (key === "movie-watch-providers") return { data: { results: {} } };
      if (key === "movie-release-dates") return { data: { results: [] } };
      if (key === "movie-keywords") return { data: [] };
      return { data: undefined, isLoading: false, isError: false };
    });
  });

  it("shows a share action in the movie detail action row", () => {
    render(<MovieDetail />);

    expect(screen.getByRole("button", { name: /share/i })).toBeInTheDocument();
  });
});
