import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { RecommendationTasteSnapshot } from "@/frontend/lib/mongodbClient";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  searchMulti: vi.fn(),
  toast: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("@/shared/lib/tmdb", () => ({
  searchMulti: mocks.searchMulti,
}));

vi.mock("@/frontend/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

import YourTastePanel from "./YourTastePanel";

const titleResult = {
  id: 88,
  title: "Dune",
  original_title: "Dune",
  overview: "",
  poster_path: null,
  backdrop_path: null,
  release_date: "2021-01-01",
  vote_average: 8,
  vote_count: 100,
  popularity: 90,
  genre_ids: [878],
  original_language: "en",
  adult: false,
  video: false,
  media_type: "movie" as const,
};

const snapshot: RecommendationTasteSnapshot = {
  profile: {
    version: 4,
    updatedAt: "2026-09-05T00:00:00.000Z",
    explicit: { genres: [35], languages: ["en"] },
    learned: { genres: { "18": 2.4 }, languages: { hi: 1.8 } },
    inferred: { genres: { "18": 2.4, "35": 1 }, languages: { en: 1, hi: 1.8 } },
    negative: { genres: { "27": 2 }, languages: {} },
    clusters: [],
    evidence: [{
      key: "movie_7",
      title: "Signal title",
      contentType: "movie",
      signal: "liked",
      weight: 3,
    }],
  },
  controls: {
    explorationMode: "familiar",
    resetAt: null,
    excludedLearningKeys: [],
    revision: 3,
  },
};

describe("YourTastePanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.refetch.mockResolvedValue({ data: undefined });
    mocks.useQuery.mockImplementation((options: { queryKey: readonly unknown[] }) => {
      const query = String(options.queryKey[1] || "");
      return {
        data: query === "dune" ? { results: [titleResult] } : undefined,
        isFetching: false,
        isError: false,
        refetch: mocks.refetch,
      };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps selected and learned sections distinct and supports keyboard search", async () => {
    const onExplorationChange = vi.fn().mockResolvedValue(undefined);
    const onForgetLearning = vi.fn().mockResolvedValue(undefined);
    const onTitleSignal = vi.fn().mockResolvedValue({ ok: true, action: "added", data: null });

    render(
      <YourTastePanel
        snapshot={snapshot}
        feedMode="v2"
        onEditPreferences={vi.fn()}
        onExplorationChange={onExplorationChange}
        onForgetLearning={onForgetLearning}
        onResetLearned={vi.fn().mockResolvedValue(undefined)}
        onTitleSignal={onTitleSignal}
      />,
    );

    expect(screen.getByText("Selected preferences")).toBeInTheDocument();
    expect(screen.getByText("Learned affinities")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "adventurous" }));
    expect(onExplorationChange).toHaveBeenCalledWith("adventurous");
    fireEvent.click(screen.getByRole("button", { name: "Forget" }));
    expect(onForgetLearning).toHaveBeenCalledWith("movie_7", false);

    const input = screen.getByRole("textbox", { name: "Find a title to teach Reckon" });
    fireEvent.change(input, { target: { value: "dune" } });
    expect(screen.queryByText("Dune")).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.getByText("Dune")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Use Dune as a positive taste signal" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onTitleSignal).toHaveBeenCalledWith(titleResult, "positive");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
    expect(screen.queryByText("Dune")).not.toBeInTheDocument();
  });

  it("requires an explicit reset confirmation", async () => {
    const onResetLearned = vi.fn().mockResolvedValue(undefined);
    render(
      <YourTastePanel
        snapshot={snapshot}
        feedMode="v2"
        onEditPreferences={vi.fn()}
        onExplorationChange={vi.fn().mockResolvedValue(undefined)}
        onForgetLearning={vi.fn().mockResolvedValue(undefined)}
        onResetLearned={onResetLearned}
        onTitleSignal={vi.fn().mockResolvedValue({ ok: true, action: "added", data: null })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset learned profile" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reset learned taste" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onResetLearned).toHaveBeenCalledTimes(1);
  });
});
