import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TVDetail from "./TVDetail";

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
  getTVShowDetails: vi.fn(),
  getTVShowCredits: vi.fn(),
  getTVShowVideos: vi.fn(),
  getTVShowKeywords: vi.fn(),
  getSimilarTVShows: vi.fn(),
  getTVSeasonDetails: vi.fn(),
  getTVWatchProviders: vi.fn(),
  getBackdropUrl: () => "/backdrop.jpg",
  getPosterUrl: () => "/poster.jpg",
  getStillUrl: () => "/still.jpg",
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

const tvShow = {
  id: 321,
  name: "Signal Show",
  original_name: "Signal Show",
  tagline: "",
  overview: "A test show",
  poster_path: null,
  backdrop_path: null,
  first_air_date: "2024-01-01",
  vote_average: 8.2,
  vote_count: 500,
  popularity: 50,
  genre_ids: [18],
  original_language: "en",
  origin_country: ["US"],
  genres: [{ id: 18, name: "Drama" }],
  status: "Returning Series",
  type: "Scripted",
  number_of_seasons: 2,
  number_of_episodes: 8,
  episode_run_time: [45],
  seasons: [
    {
      id: 1,
      name: "Season 1",
      overview: "",
      poster_path: null,
      air_date: "2024-01-01",
      episode_count: 8,
      season_number: 1,
    },
  ],
};

describe("TVDetail season selection QA", () => {
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

    mocks.useParams.mockReturnValue({ id: "321" });
    mocks.useNavigate.mockReturnValue(vi.fn());
    mocks.useLocation.mockReturnValue({ state: null, pathname: "/tv/321", search: "", hash: "" });
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
      if (key === "tv") return { data: tvShow, isLoading: false, isError: false };
      if (key === "tv-credits") return { data: { cast: [], crew: [] } };
      if (key === "tv-videos") return { data: { results: [] } };
      if (key === "similar-tv") return { data: { results: [] }, isLoading: false };
      if (key === "tv-season") return { data: { episodes: [] }, isLoading: false };
      if (key === "tv-watch-providers") return { data: { results: {} } };
      if (key === "tv-keywords") return { data: [] };
      return { data: undefined, isLoading: false, isError: false };
    });
  });

  it("preserves the selected season when the same show is refreshed", () => {
    const extended = {
      ...tvShow,
      seasons: [...tvShow.seasons, {...tvShow.seasons[0], id:2, name:"Season 2", season_number:2}],
    };
    let current = extended;
    mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if(queryKey[0] === "tv") return {data:current,isLoading:false,isError:false};
      if(queryKey[0] === "tv-season") return {data:{episodes:[]},isLoading:false};
      if(queryKey[0] === "tv-watch-providers") return {data:{results:{}}};
      if(queryKey[0] === "tv-keywords") return {data:[]};
      return {data:{results:[],cast:[],crew:[]},isLoading:false};
    });
    const view = render(<TVDetail />);
    fireEvent.mouseDown(screen.getByRole("tab",{name:"Season 2"}));
    expect(screen.getByRole("tab",{name:"Season 2"})).toHaveAttribute("aria-selected","true");
    current = {...extended, vote_count:extended.vote_count+1};
    view.rerender(<TVDetail />);
    expect(screen.getByRole("tab",{name:"Season 2"})).toHaveAttribute("aria-selected","true");
  });
});
