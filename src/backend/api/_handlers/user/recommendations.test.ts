import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserFromRequest: vi.fn(),
  connectToDatabase: vi.fn(),
  getServerTrendingMovies: vi.fn(),
  getServerTrendingTVShows: vi.fn(),
  discoverServerMovies: vi.fn(),
  discoverServerTVShows: vi.fn(),
  getServerMovieRecommendationProfile: vi.fn(),
  getServerTVRecommendationProfile: vi.fn(),
  getServerSimilarMovies: vi.fn(),
  getServerSimilarTVShows: vi.fn(),
  getServerMovieRecommendations: vi.fn(),
  getServerTVShowRecommendations: vi.fn(),
}));

vi.mock("../../lib/auth.js", () => ({
  getUserFromRequest: mocks.getUserFromRequest,
}));

vi.mock("../../lib/mongodb.js", () => ({
  connectToDatabase: mocks.connectToDatabase,
}));

vi.mock("@/backend/services/tmdbServer", () => ({
  getServerTrendingMovies: mocks.getServerTrendingMovies,
  getServerTrendingTVShows: mocks.getServerTrendingTVShows,
  discoverServerMovies: mocks.discoverServerMovies,
  discoverServerTVShows: mocks.discoverServerTVShows,
  getServerMovieRecommendationProfile: mocks.getServerMovieRecommendationProfile,
  getServerTVRecommendationProfile: mocks.getServerTVRecommendationProfile,
  getServerSimilarMovies: mocks.getServerSimilarMovies,
  getServerSimilarTVShows: mocks.getServerSimilarTVShows,
  getServerMovieRecommendations: mocks.getServerMovieRecommendations,
  getServerTVShowRecommendations: mocks.getServerTVShowRecommendations,
}));

import handler, {
  __clearRecommendationsCacheForTests,
} from "./recommendations";

function makeCursor(rows: unknown[]) {
  const cursor = {
    sort: vi.fn(() => cursor),
    limit: vi.fn(() => cursor),
    toArray: vi.fn(async () => rows),
  };

  return cursor;
}

function createMockDb(options?: {
  watchHistory?: unknown[];
  likedItems?: unknown[];
  watchlistItems?: unknown[];
  feedbackItems?: unknown[];
  preferences?: Record<string, unknown>;
}) {
  const watchHistory = options?.watchHistory || [];
  const likedItems = options?.likedItems || [];
  const watchlistItems = options?.watchlistItems || [];
  const feedbackItems = options?.feedbackItems || [];
  const preferences = options?.preferences || { preferred_genres: [] };

  return {
    collection: vi.fn((name: string) => {
      if (name === "user_preferences") {
        return {
          findOne: vi.fn(async () => preferences),
        };
      }

      if (name === "watch_history") {
        return {
          find: vi.fn(() => makeCursor(watchHistory)),
        };
      }

      if (name === "liked_items") {
        return {
          find: vi.fn(() => makeCursor(likedItems)),
        };
      }

      if (name === "watchlist") {
        return {
          find: vi.fn(() => makeCursor(watchlistItems)),
        };
      }

      if (name === "content_feedback") {
        return {
          find: vi.fn(() => makeCursor(feedbackItems)),
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    }),
  };
}

function createMockReq(ip = "1.1.1.1") {
  return {
    method: "GET",
    url: "/api/user?route=recommendations",
    headers: {
      host: "localhost:3000",
      "x-forwarded-for": ip,
      cookie: "token=fake",
    },
  } as any;
}

function createMockRes() {
  const headers = new Map<string, string>();

  const res = {
    statusCode: 200,
    body: null as unknown,
    setHeader: vi.fn((key: string, value: string) => {
      headers.set(key.toLowerCase(), value);
    }),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  } as any;

  return { res, headers };
}

describe("user recommendations endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearRecommendationsCacheForTests();

    mocks.getUserFromRequest.mockResolvedValue({
      id: "user_1",
      email: "user@example.com",
      username: "user",
    });

    mocks.connectToDatabase.mockResolvedValue({ db: createMockDb() });

    mocks.getServerTrendingMovies.mockResolvedValue([
      {
        id: 10,
        title: "Trending Movie",
        original_title: "Trending Movie",
        overview: "Test movie",
        poster_path: null,
        backdrop_path: null,
        release_date: "2024-01-01",
        vote_average: 8.1,
        vote_count: 1000,
        popularity: 120,
        genre_ids: [18],
        original_language: "en",
        adult: false,
        video: false,
      },
    ]);

    mocks.getServerTrendingTVShows.mockResolvedValue([
      {
        id: 20,
        name: "Trending Show",
        original_name: "Trending Show",
        overview: "Test show",
        poster_path: null,
        backdrop_path: null,
        first_air_date: "2024-02-02",
        vote_average: 7.9,
        vote_count: 800,
        popularity: 95,
        genre_ids: [10765],
        original_language: "en",
        origin_country: ["US"],
      },
    ]);

    mocks.discoverServerMovies.mockResolvedValue({ results: [] });
    mocks.discoverServerTVShows.mockResolvedValue({ results: [] });
    mocks.getServerMovieRecommendationProfile.mockResolvedValue(null);
    mocks.getServerTVRecommendationProfile.mockResolvedValue(null);
    mocks.getServerSimilarMovies.mockResolvedValue({ results: [] });
    mocks.getServerSimilarTVShows.mockResolvedValue({ results: [] });
    mocks.getServerMovieRecommendations.mockResolvedValue({ results: [] });
    mocks.getServerTVShowRecommendations.mockResolvedValue({ results: [] });
  });

  it("returns recommendations and applies private no-store caching headers", async () => {
    const req = createMockReq();
    const { res, headers } = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(headers.get("cache-control")).toContain("private");
    expect(headers.get("cache-control")).toContain("no-store");

    const payload = (res.body as any)?.data;
    expect(Array.isArray(payload?.items)).toBe(true);
    expect(payload.items.length).toBeGreaterThan(0);
    expect(typeof payload.isPersonalized).toBe("boolean");
  });

  it("reuses server cache for identical user revision", async () => {
    const req = createMockReq("2.2.2.2");

    const first = createMockRes();
    await handler(req, first.res);

    const second = createMockRes();
    await handler(req, second.res);

    expect(first.res.statusCode).toBe(200);
    expect(second.res.statusCode).toBe(200);
    expect(mocks.getServerTrendingMovies).toHaveBeenCalledTimes(1);
    expect(mocks.getServerTrendingTVShows).toHaveBeenCalledTimes(1);
  });

  it("sources recommendations for preferred and exploration languages", async () => {
    const now = new Date().toISOString();

    mocks.connectToDatabase.mockResolvedValue({
      db: createMockDb({
        watchHistory: [
          {
            content_id: 501,
            content_type: "movie",
            title: "Hindi Seed",
            genres: [18],
            language: "hi",
            watched_at: now,
          },
        ],
        preferences: {
          preferred_genres: [18],
          preferred_languages: ["hi", "en"],
        },
      }),
    });

    mocks.getServerMovieRecommendationProfile.mockResolvedValue({
      id: 501,
      title: "Hindi Seed",
      original_title: "Hindi Seed",
      overview: "Profile",
      poster_path: null,
      backdrop_path: null,
      release_date: "2024-03-01",
      vote_average: 7.8,
      vote_count: 900,
      popularity: 85,
      genre_ids: [18],
      original_language: "hi",
      adult: false,
      video: false,
    });

    const req = createMockReq("3.3.3.3");
    const { res } = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);

    const languageCalls = mocks.discoverServerMovies.mock.calls
      .map(([filters]) => (filters as Record<string, unknown> | undefined)?.with_original_language)
      .filter((value): value is string => typeof value === "string");

    expect(languageCalls).toContain("hi");
    expect(languageCalls).toContain("en");
  });

  it("treats explicit preferences as personalization without watch history", async () => {
    mocks.connectToDatabase.mockResolvedValue({
      db: createMockDb({
        preferences: {
          preferred_genres: [18],
          preferred_languages: ["hi"],
        },
      }),
    });

    mocks.discoverServerMovies.mockImplementation(async (filters) => {
      if (
        (filters as Record<string, unknown>)?.with_genres === "18" ||
        (filters as Record<string, unknown>)?.with_original_language === "hi"
      ) {
        return {
          results: [
            {
              id: 701,
              title: "Preference Match",
              original_title: "Preference Match",
              overview: "A drama aligned with explicit preferences",
              poster_path: null,
              backdrop_path: null,
              release_date: "2024-05-01",
              vote_average: 8.3,
              vote_count: 1100,
              popularity: 88,
              genre_ids: [18],
              original_language: "hi",
              adult: false,
              video: false,
            },
          ],
        };
      }

      return { results: [] };
    });

    const req = createMockReq("4.4.4.4");
    const { res } = createMockRes();

    await handler(req, res);

    const payload = (res.body as any)?.data;

    expect(res.statusCode).toBe(200);
    expect(payload.isPersonalized).toBe(true);
    expect(payload.items.some((item: any) => item.id === 701)).toBe(true);
  });

  it("does not use disliked-only genres for recommendation discovery", async () => {
    mocks.connectToDatabase.mockResolvedValue({
      db: createMockDb({
        feedbackItems: [
          {
            content_id: 901,
            content_type: "movie",
            feedback_type: "skip",
            title: "Skipped Horror",
            genres: [27],
          },
        ],
      }),
    });

    const req = createMockReq("5.5.5.5");
    const { res } = createMockRes();

    await handler(req, res);

    const movieGenreCalls = mocks.discoverServerMovies.mock.calls
      .map(([filters]) => filters as Record<string, unknown>)
      .filter((filters) => filters.with_genres === "27");
    const tvGenreCalls = mocks.discoverServerTVShows.mock.calls
      .map(([filters]) => filters as Record<string, unknown>)
      .filter((filters) => filters.with_genres === "27");

    expect(res.statusCode).toBe(200);
    expect(movieGenreCalls).toHaveLength(0);
    expect(tvGenreCalls).toHaveLength(0);
  });

  it("excludes watched, liked, watchlisted, and skipped content from recommendations", async () => {
    mocks.connectToDatabase.mockResolvedValue({
      db: createMockDb({
        watchHistory: [
          {
            content_id: 10,
            content_type: "movie",
            title: "Already Watched",
            genres: [18],
            language: "en",
            watched_at: new Date().toISOString(),
          },
        ],
        likedItems: [
          {
            content_id: 20,
            content_type: "tv",
            title: "Already Liked",
            liked_at: new Date().toISOString(),
          },
        ],
        watchlistItems: [
          {
            content_id: 30,
            content_type: "movie",
            title: "Already Saved",
            added_at: new Date().toISOString(),
          },
        ],
        feedbackItems: [
          {
            content_id: 40,
            content_type: "movie",
            feedback_type: "skip",
            title: "Skipped",
            genres: [27],
          },
        ],
      }),
    });

    mocks.getServerTrendingMovies.mockResolvedValue([
      {
        id: 10,
        title: "Already Watched",
        original_title: "Already Watched",
        overview: "Watched movie",
        poster_path: null,
        backdrop_path: null,
        release_date: "2024-01-01",
        vote_average: 8,
        vote_count: 1000,
        popularity: 150,
        genre_ids: [18],
        original_language: "en",
        adult: false,
        video: false,
      },
      {
        id: 30,
        title: "Already Saved",
        original_title: "Already Saved",
        overview: "Saved movie",
        poster_path: null,
        backdrop_path: null,
        release_date: "2024-02-01",
        vote_average: 8,
        vote_count: 900,
        popularity: 130,
        genre_ids: [18],
        original_language: "en",
        adult: false,
        video: false,
      },
      {
        id: 40,
        title: "Skipped",
        original_title: "Skipped",
        overview: "Skipped movie",
        poster_path: null,
        backdrop_path: null,
        release_date: "2024-03-01",
        vote_average: 8,
        vote_count: 900,
        popularity: 125,
        genre_ids: [27],
        original_language: "en",
        adult: false,
        video: false,
      },
      {
        id: 50,
        title: "Fresh Pick",
        original_title: "Fresh Pick",
        overview: "Fresh recommendation",
        poster_path: null,
        backdrop_path: null,
        release_date: "2024-04-01",
        vote_average: 8,
        vote_count: 900,
        popularity: 120,
        genre_ids: [18],
        original_language: "en",
        adult: false,
        video: false,
      },
    ]);

    mocks.getServerTrendingTVShows.mockResolvedValue([
      {
        id: 20,
        name: "Already Liked",
        original_name: "Already Liked",
        overview: "Liked show",
        poster_path: null,
        backdrop_path: null,
        first_air_date: "2024-01-01",
        vote_average: 8,
        vote_count: 800,
        popularity: 110,
        genre_ids: [18],
        original_language: "en",
        origin_country: ["US"],
      },
    ]);

    const req = createMockReq("6.6.6.6");
    const { res } = createMockRes();

    await handler(req, res);

    const ids = ((res.body as any)?.data?.items || []).map((item: any) => item.id);
    expect(res.statusCode).toBe(200);
    expect(ids).not.toContain(10);
    expect(ids).not.toContain(20);
    expect(ids).not.toContain(30);
    expect(ids).not.toContain(40);
    expect(ids).toContain(50);
  });
});
