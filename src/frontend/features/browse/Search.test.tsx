import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useInfiniteQuery: vi.fn(),
  useQuery: vi.fn(),
  searchMulti: vi.fn(),
  searchMovies: vi.fn(),
  searchTVShows: vi.fn(),
  searchPeople: vi.fn(),
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: mocks.useInfiniteQuery,
  useQuery: mocks.useQuery,
}));

vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("@/frontend/hooks/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/shared/lib/tmdb", () => ({
  getTrendingMovies: mocks.searchMovies,
  getTrendingTVShows: mocks.searchTVShows,
  searchMulti: mocks.searchMulti,
  searchMovies: mocks.searchMovies,
  searchTVShows: mocks.searchTVShows,
  searchPeople: mocks.searchPeople,
  getPosterUrl: () => "/poster.jpg",
  getProfileUrl: () => "/profile.jpg",
  getLanguageBadgeClass: () => "",
}));

vi.mock("@/frontend/components/Header", () => ({
  default: () => <div data-testid="header" />,
}));

vi.mock("@/frontend/components/Footer", () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock("@/frontend/components/MediaImage", () => ({
  default: ({ alt = "" }: { alt?: string }) => <img alt={alt} />,
}));

import Search from "./Search";

const emptyPage = {
  page: 1,
  results: [],
  total_pages: 1,
  total_results: 0,
};

function renderSearch() {
  return render(
    <MemoryRouter>
      <Search />
    </MemoryRouter>,
  );
}

async function finishDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

describe("Search", () => {
  let latestSearchOptions: Record<string, any> | undefined;
  let searchState: Record<string, any>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    latestSearchOptions = undefined;
    searchState = {
      data: undefined,
      error: null,
      isError: false,
      isLoading: false,
      isPending: false,
      isFetchNextPageError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mocks.fetchNextPage,
      refetch: mocks.refetch,
    };
    mocks.useInfiniteQuery.mockImplementation((options: Record<string, any>) => {
      latestSearchOptions = options;
      return searchState;
    });
    mocks.useQuery.mockReturnValue({ data: [] });
    mocks.searchMulti.mockResolvedValue(emptyPage);
    mocks.searchMovies.mockResolvedValue(emptyPage);
    mocks.searchTVShows.mockResolvedValue(emptyPage);
    mocks.searchPeople.mockResolvedValue(emptyPage);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispatches a selected tab upstream instead of filtering the mixed first page", async () => {
    renderSearch();
    const input = screen.getByPlaceholderText("Search movies, TV shows, cast...");

    fireEvent.change(input, { target: { value: "dune" } });
    await finishDebounce();

    expect(latestSearchOptions?.queryKey).toEqual(["search", "dune", "all"]);
    await latestSearchOptions?.queryFn({ pageParam: 2, signal: new AbortController().signal });
    expect(mocks.searchMulti).toHaveBeenCalledWith("dune", 2, expect.any(AbortSignal));

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Movies" }));
    expect(latestSearchOptions?.queryKey).toEqual(["search", "dune", "movie"]);
    await latestSearchOptions?.queryFn({ pageParam: 2, signal: new AbortController().signal });
    expect(mocks.searchMovies).toHaveBeenCalledWith("dune", 2, expect.any(AbortSignal));
  });

  it("hides the previous query while a new debounced query is pending", async () => {
    const movie = {
      id: 10,
      title: "Dune",
      media_type: "movie",
      poster_path: null,
      vote_average: 8,
      original_language: "en",
    };
    searchState.data = { pages: [{ ...emptyPage, results: [movie] }] };
    renderSearch();
    const input = screen.getByPlaceholderText("Search movies, TV shows, cast...");

    fireEvent.change(input, { target: { value: "dune" } });
    expect(screen.queryByRole("heading", { name: "Dune" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Loading search results")).toHaveAttribute("aria-busy", "true");

    await finishDebounce();
    expect(screen.getByRole("heading", { name: "Dune" })).toBeInTheDocument();
  });

  it("offers a retry action when the initial search fails", async () => {
    searchState.isError = true;
    searchState.error = new Error("Temporary search failure");
    renderSearch();
    fireEvent.change(screen.getByPlaceholderText("Search movies, TV shows, cast..."), {
      target: { value: "dune" },
    });
    await finishDebounce();

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't complete/i);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("loads another upstream page from the accessible pagination control", async () => {
    searchState.data = {
      pages: [
        {
          ...emptyPage,
          results: [
            {
              id: 10,
              title: "Dune",
              media_type: "movie",
              poster_path: null,
              vote_average: 8,
              original_language: "en",
            },
          ],
        },
      ],
    };
    searchState.hasNextPage = true;
    renderSearch();
    fireEvent.change(screen.getByPlaceholderText("Search movies, TV shows, cast..."), {
      target: { value: "dune" },
    });
    await finishDebounce();

    fireEvent.click(screen.getByRole("button", { name: "Load more results" }));
    expect(mocks.fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
