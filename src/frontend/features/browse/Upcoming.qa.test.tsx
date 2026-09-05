import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Movie, TVShow } from "@/shared/lib/tmdb";

interface Page { page: number; results: (Movie | TVShow)[]; total_pages: number; total_results: number }
interface QueryOptions { queryFn: (context: { pageParam: number; signal: AbortSignal }) => Promise<Page> }
const mocks = vi.hoisted(() => ({
  useInfiniteQuery: vi.fn(), useQuery: vi.fn(), discoverMovies: vi.fn(), discoverTVShows: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useInfiniteQuery: mocks.useInfiniteQuery, useQuery: mocks.useQuery }));
vi.mock("@/frontend/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "qa" } }) }));
vi.mock("@/shared/lib/tmdb", () => ({
  discoverMovies: mocks.discoverMovies, discoverTVShows: mocks.discoverTVShows,
  getMovieGenres: vi.fn(), getTVGenres: vi.fn(), getTVWatchProviderCatalog: vi.fn(),
  getPosterUrl: () => "/poster.jpg", getLanguageBadgeClass: () => "",
}));
vi.mock("@/frontend/components/Header", () => ({ default: () => null }));
vi.mock("@/frontend/components/Footer", () => ({ default: () => null }));
vi.mock("@/frontend/components/MediaImage", () => ({ default: ({alt}: {alt:string}) => <img alt={alt} /> }));
import Upcoming from "./Upcoming";

let options: QueryOptions;
const emptyPage: Page = { page:1, results:[], total_pages:3, total_results:0 };
function setup(route = "/upcoming") {
  render(<MemoryRouter initialEntries={[route]}><Upcoming /></MemoryRouter>);
}
function retrieve(page = 1) {
  return options.queryFn({ pageParam:page, signal:new AbortController().signal });
}

describe("Upcoming source failure QA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
    mocks.useQuery.mockReturnValue({ data:[] });
    mocks.useInfiniteQuery.mockImplementation((value: QueryOptions) => {
      options=value;
      return { data:{pages:[]}, isLoading:false, isError:false, hasNextPage:false, isFetchingNextPage:false, fetchNextPage:vi.fn(), refetch:vi.fn() };
    });
    mocks.discoverMovies.mockResolvedValue(emptyPage);
    mocks.discoverTVShows.mockResolvedValue(emptyPage);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("surfaces total upstream failure rather than storing an exhausted empty page", async () => {
    mocks.discoverMovies.mockRejectedValue(new Error("movie source unavailable"));
    mocks.discoverTVShows.mockRejectedValue(new Error("TV source unavailable"));
    setup();
    await expect(retrieve()).rejects.toThrow();
  });

  it("retries the same aggregate page after a partial failure without skipping the missing source", async () => {
    mocks.discoverTVShows.mockRejectedValueOnce(new Error("TV source temporarily unavailable"));
    setup();
    // The shared page counter must not commit until both source pages succeed.
    await expect(retrieve(2)).rejects.toThrow();
    await expect(retrieve(2)).resolves.toMatchObject({ page:2 });
    expect(mocks.discoverTVShows.mock.calls.map(([params]) => params.page)).toEqual([2,2]);
    expect(mocks.discoverMovies.mock.calls.map(([params]) => params.page)).toEqual([2,2]);
  });

  it("does not convert a total multi-language failure into an empty Bollywood catalog", async () => {
    mocks.discoverMovies.mockRejectedValue(new Error("all language sources unavailable"));
    setup("/upcoming?section=movies&movieType=bollywood");
    await expect(retrieve()).rejects.toThrow();
  });
});
