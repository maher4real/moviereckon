import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Movie, TVShow } from "@/shared/lib/tmdb";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useUserData: vi.fn(),
  useWatchlist: vi.fn(),
  getMovieDetails: vi.fn(),
  getTVShowDetails: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("@/shared/lib/tmdb", () => ({
  getMovieDetails: mocks.getMovieDetails,
  getTVShowDetails: mocks.getTVShowDetails,
}));
vi.mock("@/frontend/hooks/useUserData", () => ({ useUserData: mocks.useUserData }));
vi.mock("@/frontend/hooks/useWatchlist", () => ({ useWatchlist: mocks.useWatchlist }));
vi.mock("@/frontend/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));
vi.mock("@/frontend/components/ContentCard", () => ({
  default: () => <div data-testid="pick-content-card" />,
}));

import { pickItemKey, selectEligiblePickItems } from "./PickTonight";
import PickTonight from "./PickTonight";

function movie(id: number): Movie {
  return {
    id,
    title: `Movie ${id}`,
    original_title: `Movie ${id}`,
    overview: "",
    poster_path: null,
    backdrop_path: null,
    release_date: "2024-01-01",
    vote_average: 7,
    vote_count: 100,
    popularity: 50,
    genre_ids: [18],
    original_language: "en",
    adult: false,
    video: false,
  };
}

function tv(id: number): TVShow {
  return {
    id,
    name: `Series ${id}`,
    original_name: `Series ${id}`,
    overview: "",
    poster_path: null,
    backdrop_path: null,
    first_air_date: "2024-01-01",
    vote_average: 7,
    vote_count: 100,
    popularity: 50,
    genre_ids: [18],
    original_language: "en",
    origin_country: ["US"],
  };
}

describe("Pick Tonight eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useQuery.mockReturnValue({
      data: { byKey: {}, failedCount: 0 },
      isFetching: false,
      isError: false,
    });
    mocks.getMovieDetails.mockResolvedValue({ runtime: 100 });
    mocks.getTVShowDetails.mockResolvedValue({ episode_run_time: [45] });
    mocks.useUserData.mockReturnValue({
      isWatched: vi.fn(() => false),
      isLiked: vi.fn(() => false),
      getFeedback: vi.fn(() => null),
      toggleLike: vi.fn(async () => undefined),
      addToWatchHistory: vi.fn(async () => undefined),
      setFeedback: vi.fn(async () => ({ ok: true, action: "added", data: null })),
      removeFeedback: vi.fn(async () => ({ ok: true, action: "removed", data: null })),
    });
    mocks.useWatchlist.mockReturnValue({
      isInWatchlist: vi.fn(() => false),
      toggleItem: vi.fn(async () => undefined),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("excludes consumed titles and unknown runtimes from a time constrained pick", () => {
    const watched = movie(1);
    const unknownRuntime = movie(2);
    const shortMovie = movie(3);
    const shortSeries = tv(4);
    const previouslyRated = movie(5);
    const excluded = new Set([pickItemKey(watched), pickItemKey(previouslyRated)]);

    const eligible = selectEligiblePickItems(
      [watched, unknownRuntime, shortMovie, shortSeries, previouslyRated],
      excluded,
      {
        [pickItemKey(shortMovie)]: 95,
        [pickItemKey(shortSeries)]: 42,
      },
      100,
    );

    expect(eligible.map(pickItemKey)).toEqual(["movie_3", "tv_4"]);
    expect(eligible).not.toContain(unknownRuntime);
  });

  it("keeps ranked order and only applies runtime checks when requested", () => {
    const first = movie(10);
    const second = movie(11);
    const third = movie(12);
    const items = [first, second, third];

    expect(selectEligiblePickItems(items, new Set()).map(pickItemKey)).toEqual([
      "movie_10",
      "movie_11",
      "movie_12",
    ]);
    expect(selectEligiblePickItems(
      items,
      new Set(),
      { [pickItemKey(first)]: 130, [pickItemKey(second)]: 90 },
      100,
    ).map(pickItemKey)).toEqual(["movie_11"]);
  });

  it("sends real metadata with shortlist actions and offers feedback undo", async () => {
    const item = movie(20);
    const feedbackState = new Map<string, string>();
    const getFeedback = vi.fn((contentId: number, contentType: string) => feedbackState.get(`${contentType}_${contentId}`) || null);
    const setFeedback = vi.fn(async (input: { content_id: number; content_type: string; feedback_type: string }) => {
      const key = `${input.content_type}_${input.content_id}`;
      const current = feedbackState.get(key);
      if (current === input.feedback_type) {
        feedbackState.delete(key);
        return { ok: true, action: "removed" as const, data: null };
      }
      feedbackState.set(key, input.feedback_type);
      return { ok: true, action: current ? "updated" as const : "added" as const, data: null };
    });
    const toggleLike = vi.fn(async () => undefined);
    const toggleItem = vi.fn(async () => undefined);
    const removeFeedback = vi.fn(async () => {
      feedbackState.delete("movie_20");
      return { ok: true, action: "removed" as const, data: null };
    });
    mocks.useUserData.mockReturnValue({
      isWatched: vi.fn(() => false),
      isLiked: vi.fn(() => false),
      getFeedback,
      setFeedback,
      removeFeedback,
      toggleLike,
      addToWatchHistory: vi.fn(async () => undefined),
    });
    mocks.useWatchlist.mockReturnValue({
      isInWatchlist: vi.fn(() => false),
      toggleItem,
    });

    render(<PickTonight items={[item]} explanationById={{}} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Love" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      fireEvent.click(screen.getByRole("button", { name: "Not now" }));
      await Promise.resolve();
    });

    expect(toggleLike).toHaveBeenCalledWith(expect.objectContaining({
      content_id: 20,
      genres: [18],
      language: "en",
    }));
    expect(toggleItem).toHaveBeenCalledWith(expect.objectContaining({
      content_id: 20,
      genres: [18],
      language: "en",
    }));
    expect(setFeedback).toHaveBeenCalledWith(expect.objectContaining({
      feedback_type: "not_now",
      genres: [18],
      language: "en",
    }));

    const toastOptions = mocks.toast.mock.calls.at(-1)?.[0] as { action?: { props?: { onClick?: () => void } } };
    expect(toastOptions.action?.props?.onClick).toEqual(expect.any(Function));
    await act(async () => {
      await toastOptions.action?.props?.onClick?.();
    });
    expect(removeFeedback).toHaveBeenCalledWith(20, "movie");
  });
});
