import { beforeEach, describe, expect, it, vi } from "vitest";

type Document = Record<string, any>;

const mocks = vi.hoisted(() => ({
  getUserFromRequest: vi.fn(),
  connectToDatabase: vi.fn(),
  consumeRateLimit: vi.fn(),
  getClientIp: vi.fn(),
  discoverServerMovies: vi.fn(),
  discoverServerTVShows: vi.fn(),
  getServerMovieRecommendations: vi.fn(),
  getServerSimilarMovies: vi.fn(),
  getServerTVShowRecommendations: vi.fn(),
  getServerSimilarTVShows: vi.fn(),
  tasteState: null as any,
  historyKeys: new Set<string>(),
}));

vi.mock("../../lib/auth.js", () => ({
  getUserFromRequest: mocks.getUserFromRequest,
}));

vi.mock("../../lib/mongodb.js", () => ({
  connectToDatabase: mocks.connectToDatabase,
}));

vi.mock("../../lib/rate-limit.js", () => ({
  consumeRateLimit: mocks.consumeRateLimit,
  getClientIp: mocks.getClientIp,
}));

vi.mock("@/backend/services/tmdbServer", () => ({
  discoverServerMovies: mocks.discoverServerMovies,
  discoverServerTVShows: mocks.discoverServerTVShows,
  getServerMovieRecommendations: mocks.getServerMovieRecommendations,
  getServerSimilarMovies: mocks.getServerSimilarMovies,
  getServerTVShowRecommendations: mocks.getServerTVShowRecommendations,
  getServerSimilarTVShows: mocks.getServerSimilarTVShows,
}));

vi.mock("@/backend/services/recommendationTaste", () => ({
  loadRecommendationTaste: vi.fn(async () => mocks.tasteState),
  loadRecommendationExclusions: vi.fn(async (_db: unknown, _userId: string, candidates: Array<{ type: string; id: number }>) =>
    new Set(
      candidates
        .map(({ type, id }) => `${type}_${id}`)
        .filter((key) => mocks.historyKeys.has(key)),
    ),
  ),
  loadRecommendationSuppressions: vi.fn(async () => new Set<string>()),
}));

import handler from "./recommendations-v2";

function matches(value: Document, filter: Document): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return expected.some((entry: Document) => matches(value, entry));
    const actual = value[key];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("$exists" in expected) return (key in value) === expected.$exists;
      if ("$lt" in expected) return actual instanceof Date && actual.getTime() < expected.$lt.getTime();
      if ("$in" in expected) return expected.$in.includes(actual);
    }
    return actual === expected;
  });
}

function applyUpdate(document: Document, update: Document, inserting: boolean): void {
  Object.entries(update.$setOnInsert || {}).forEach(([key, value]) => {
    if (inserting) document[key] = value;
  });
  Object.entries(update.$set || {}).forEach(([key, value]) => { document[key] = value; });
  Object.entries(update.$inc || {}).forEach(([key, value]) => {
    document[key] = Number(document[key] || 0) + Number(value);
  });
}

class MemoryCollection {
  documents: Document[] = [];
  failNextUpdates = 0;

  async createIndex(): Promise<string> {
    return "fixture-index";
  }

  async findOne(filter: Document): Promise<Document | null> {
    return this.documents.find((document) => matches(document, filter)) || null;
  }

  find(filter: Document): any {
    let rows = this.documents.filter((document) => matches(document, filter));
    const cursor = {
      sort: vi.fn((spec: Document) => {
        const [[field, direction]] = Object.entries(spec);
        rows = [...rows].sort((left, right) => (left[field] > right[field] ? direction : -direction));
        return cursor;
      }),
      limit: vi.fn((count: number) => {
        rows = rows.slice(0, count);
        return cursor;
      }),
      toArray: vi.fn(async () => rows),
    };
    return cursor;
  }

  async insertOne(document: Document): Promise<{ insertedId: string }> {
    this.documents.push(document);
    return { insertedId: document.session_id || String(this.documents.length) };
  }

  async updateOne(
    filter: Document,
    update: Document,
    options: { upsert?: boolean } = {},
  ): Promise<{ matchedCount: number; modifiedCount: number; upsertedCount: number }> {
    if (this.failNextUpdates > 0) {
      this.failNextUpdates -= 1;
      throw new Error("fixture write interrupted");
    }
    const existing = this.documents.find((document) => matches(document, filter));
    if (existing) {
      applyUpdate(existing, update, false);
      return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    }
    if (!options.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    const inserted: Document = {};
    Object.entries(filter).forEach(([key, value]) => {
      if (!key.startsWith("$") && (typeof value !== "object" || value === null || value instanceof Date)) {
        inserted[key] = value;
      }
    });
    applyUpdate(inserted, update, true);
    this.documents.push(inserted);
    return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
  }
}

class MemoryDb {
  collections = new Map<string, MemoryCollection>();

  collection(name: string): MemoryCollection {
    if (!this.collections.has(name)) this.collections.set(name, new MemoryCollection());
    return this.collections.get(name)!;
  }
}

function movie(id: number): Document {
  return {
    id,
    title: `Fixture Movie ${id}`,
    original_title: `Fixture Movie ${id}`,
    overview: `Fixture overview ${id}`,
    poster_path: null,
    backdrop_path: null,
    release_date: "2024-01-01",
    vote_average: 7.2,
    vote_count: 200,
    popularity: 75,
    genre_ids: [18],
    original_language: "en",
    adult: false,
    video: false,
  };
}

function tv(id: number): Document {
  return {
    id,
    name: `Fixture TV ${id}`,
    original_name: `Fixture TV ${id}`,
    overview: `Fixture TV overview ${id}`,
    poster_path: null,
    backdrop_path: null,
    first_air_date: "2024-01-01",
    vote_average: 7.2,
    vote_count: 200,
    popularity: 75,
    genre_ids: [18],
    original_language: "en",
    origin_country: [],
  };
}

function response() {
  const res = {
    statusCode: 200,
    body: null as any,
    setHeader: vi.fn(),
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

function request(url: string) {
  return {
    method: "GET",
    url,
    headers: { host: "localhost:3000", "x-forwarded-for": "203.0.113.9" },
  } as any;
}

async function call(url: string) {
  const res = response();
  await handler(request(url), res as any);
  return res;
}

function pageData(res: { body: any }) {
  return res.body.data as {
    items: Document[];
    nextCursor: string | null;
    hasMore: boolean;
    state: string;
    feedSessionId: string;
  };
}

function cursorUrl(cursor: string, extra = "") {
  return `/api/user/recommendations/v2?limit=24&cursor=${encodeURIComponent(cursor)}${extra}`;
}

function profile() {
  return {
    version: 1,
    sourceFingerprint: "fixture-profile",
    updatedAt: new Date().toISOString(),
    exploration: 0.12,
    explicit: { genres: [], languages: [] },
    inferred: { genres: {}, languages: {} },
    negative: { genres: {}, languages: {} },
    clusters: [],
    evidence: [],
  };
}

describe("recommendations v2 durable protocol", () => {
  let db: MemoryDb;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RECOMMENDATIONS_CURSOR_SECRET = "fixture-secret-that-is-at-least-32-bytes";
    db = new MemoryDb();
    mocks.connectToDatabase.mockResolvedValue({ db });
    mocks.getUserFromRequest.mockResolvedValue({ id: "user-a", email: "a@example.com" });
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true });
    mocks.getClientIp.mockReturnValue("203.0.113.9");
    mocks.tasteState = { profile: profile(), excludedKeys: new Set<string>(), events: [] };
    mocks.historyKeys = new Set<string>();
    mocks.discoverServerTVShows.mockResolvedValue({ page: 1, total_pages: 1, results: [] });
    mocks.getServerMovieRecommendations.mockResolvedValue({ page: 1, total_pages: 1, results: [] });
    mocks.getServerSimilarMovies.mockResolvedValue({ page: 1, total_pages: 1, results: [] });
    mocks.getServerTVShowRecommendations.mockResolvedValue({ page: 1, total_pages: 1, results: [] });
    mocks.getServerSimilarTVShows.mockResolvedValue({ page: 1, total_pages: 1, results: [] });
    mocks.discoverServerMovies.mockImplementation(async (params: { page: number }) => ({
      page: params.page,
      total_pages: 30,
      results: Array.from({ length: 100 }, (_, index) => movie((params.page - 1) * 100 + index + 1)),
    }));
  });

  it("keeps full-history exclusions, buffers tails, and delivers over 1,000 unique items", async () => {
    const historyKeys = new Set(Array.from({ length: 190 }, (_, index) => `movie_${index + 1}`));
    historyKeys.add("movie_203");
    mocks.historyKeys = historyKeys;
    mocks.tasteState.excludedKeys = historyKeys;

    const first = pageData(await call("/api/user/recommendations/v2?limit=24&content_type=movie"));
    expect(first.items).toHaveLength(24);
    expect(first.items.some((item) => item.id === 190)).toBe(false);
    expect(first.items.some((item) => item.id === 203)).toBe(false);

    const delivered = new Set(first.items.map((item) => item.id));
    let current = first;
    let pages = 1;
    let replayed = false;
    while (current.nextCursor && delivered.size < 1_000 && pages < 80) {
      const nextUrl = cursorUrl(current.nextCursor, "&content_type=movie");
      const callsBefore = mocks.discoverServerMovies.mock.calls.length;
      const next = pageData(await call(nextUrl));
      if (!replayed) {
        const replay = pageData(await call(nextUrl));
        expect(replay.items.map((item) => item.id)).toEqual(next.items.map((item) => item.id));
        expect(mocks.discoverServerMovies.mock.calls.length).toBe(callsBefore);
        replayed = true;
      }
      expect(next.items.every((item) => !delivered.has(item.id))).toBe(true);
      next.items.forEach((item) => delivered.add(item.id));
      current = next;
      pages += 1;
    }

    expect(pages).toBeGreaterThan(10);
    expect(delivered.size).toBeGreaterThanOrEqual(1_000);
    expect(delivered.has(190)).toBe(false);
    expect(delivered.has(203)).toBe(false);
    expect(db.collection("recommendation_deliveries").documents.length).toBeGreaterThanOrEqual(1_000);
    expect(db.collection("recommendation_deliveries").documents.length).toBe(delivered.size);
  });

  it("rejects tampered, filter-mismatched, foreign, and expired cursors", async () => {
    const first = pageData(await call("/api/user/recommendations/v2?limit=24&content_type=movie"));
    expect(first.nextCursor).toBeTruthy();

    const tampered = await call(cursorUrl(`${first.nextCursor}x`));
    expect(tampered.statusCode).toBe(400);
    expect(tampered.body.code).toBe("INVALID_CURSOR");

    const mismatched = await call(cursorUrl(first.nextCursor!, "&content_type=tv"));
    expect(mismatched.statusCode).toBe(409);
    expect(mismatched.body.code).toBe("CURSOR_FILTER_MISMATCH");

    mocks.getUserFromRequest.mockResolvedValue({ id: "user-b", email: "b@example.com" });
    const foreign = await call(cursorUrl(first.nextCursor!, "&content_type=movie"));
    expect(foreign.statusCode).toBe(410);
    expect(foreign.body.code).toBe("SESSION_EXPIRED");

    mocks.getUserFromRequest.mockResolvedValue({ id: "user-a", email: "a@example.com" });
    const session = db.collection("recommendation_sessions").documents[0]!;
    session.expires_at = new Date(Date.now() - 1_000);
    const expired = await call(cursorUrl(first.nextCursor!, "&content_type=movie"));
    expect(expired.statusCode).toBe(410);
  });

  it("does not advance a failed TV stream when the movie stream succeeds", async () => {
    mocks.discoverServerMovies.mockImplementation(async (params: { page: number }) => ({
      page: params.page,
      total_pages: 1,
      results: Array.from({ length: 24 }, (_, index) => movie(index + 1)),
    }));
    let tvCalls = 0;
    mocks.discoverServerTVShows.mockImplementation(async (params: { page: number }) => {
      tvCalls += 1;
      if (tvCalls === 1) throw new Error("TV source unavailable");
      return { page: params.page, total_pages: 1, results: Array.from({ length: 24 }, (_, index) => tv(index + 1)) };
    });

    const first = pageData(await call("/api/user/recommendations/v2?limit=24"));
    expect(first.items.every((item) => "title" in item)).toBe(true);
    expect(first.hasMore).toBe(true);
    const second = pageData(await call(cursorUrl(first.nextCursor!)));
    expect(second.items.every((item) => "name" in item)).toBe(true);
    expect(mocks.discoverServerTVShows.mock.calls[0]![0].page).toBe(1);
    expect(mocks.discoverServerTVShows.mock.calls[1]![0].page).toBe(1);
  });

  it("retrieves each learned genre-language cluster as its own query", async () => {
    mocks.tasteState.profile = {
      ...profile(),
      explicit: { genres: [35, 27], languages: ["hi", "en"] },
      clusters: [
        {
          contentType: "movie",
          genreIds: [35],
          weight: 3,
          evidence: [{
            key: "movie_701",
            contentType: "movie",
            title: "Hindi comedy signal",
            signal: "liked",
            weight: 3,
            language: "hi",
            genreIds: [35],
          }],
        },
        {
          contentType: "movie",
          genreIds: [27],
          weight: 2,
          evidence: [{
            key: "movie_702",
            contentType: "movie",
            title: "English horror signal",
            signal: "liked",
            weight: 2,
            language: "en",
            genreIds: [27],
          }],
        },
      ],
    };

    await call("/api/user/recommendations/v2?limit=24&content_type=movie");

    const pairedQueries = mocks.discoverServerMovies.mock.calls
      .map(([params]) => params as { with_genres?: string; with_original_language?: string })
      .filter((params) => params.with_genres && params.with_original_language);
    expect(pairedQueries).toEqual(expect.arrayContaining([
      expect.objectContaining({ with_genres: "35", with_original_language: "hi" }),
      expect.objectContaining({ with_genres: "27", with_original_language: "en" }),
    ]));
    expect(pairedQueries).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ with_genres: "35", with_original_language: "en" }),
      expect.objectContaining({ with_genres: "27", with_original_language: "hi" }),
    ]));
  });

  it("leases one concurrent generation and repairs the persisted batch on replay", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    mocks.discoverServerMovies.mockImplementation(async (params: { page: number }) => {
      if (params.page === 2) await gate;
      return { page: params.page, total_pages: 2, results: Array.from({ length: 24 }, (_, index) => movie((params.page - 1) * 24 + index + 1)) };
    });
    const first = pageData(await call("/api/user/recommendations/v2?limit=24&content_type=movie"));
    const nextUrl = cursorUrl(first.nextCursor!, "&content_type=movie");
    const winnerPromise = call(nextUrl);
    await vi.waitFor(() => {
      expect(mocks.discoverServerMovies.mock.calls.some((callArgs) => callArgs[0].page === 2)).toBe(true);
    });
    const loserPromise = call(nextUrl);
    release();
    const [winner, loser] = await Promise.all([winnerPromise, loserPromise]);
    expect([winner.statusCode, loser.statusCode].every((status) => status === 200 || status === 503)).toBe(true);
    // One generation only: each explore language lane fetched page 2 once.
    expect(mocks.discoverServerMovies.mock.calls.filter((callArgs) =>
      callArgs[0].page === 2 && callArgs[0].with_original_language === "en")).toHaveLength(1);

    const replay = await call(nextUrl);
    expect(replay.statusCode).toBe(200);
    const successful = winner.statusCode === 200 ? winner : loser;
    expect(pageData(replay).items.map((item) => item.id)).toEqual(pageData(successful).items.map((item) => item.id));
    expect(db.collection("recommendation_sessions").documents[0]!.generation_lease).toBeNull();
  });

  it("replays an old page without rewinding a newer checkpoint or active lease", async () => {
    mocks.discoverServerMovies.mockImplementation(async (params: { page: number }) => ({
      page: params.page,
      total_pages: 6,
      results: Array.from({ length: 40 }, (_, index) => movie((params.page - 1) * 40 + index + 1)),
    }));
    const first = pageData(await call("/api/user/recommendations/v2?limit=24&content_type=movie"));
    const pageTwoUrl = cursorUrl(first.nextCursor!, "&content_type=movie");
    let current = pageData(await call(pageTwoUrl));
    for (let page = 3; page <= 5; page += 1) {
      expect(current.nextCursor).toBeTruthy();
      current = pageData(await call(cursorUrl(current.nextCursor!, "&content_type=movie")));
    }
    const session = db.collection("recommendation_sessions").documents[0]!;
    expect(session.next_page).toBeGreaterThan(5);
    const checkpointBeforeReplay = {
      next_page: session.next_page,
      source_state: JSON.stringify(session.source_state),
      candidate_buffer: JSON.stringify(session.candidate_buffer),
    };
    session.generation_lease = "newer-generation";
    session.generation_lease_expires_at = new Date(Date.now() + 10_000);

    const replay = await call(pageTwoUrl);
    expect(replay.statusCode).toBe(200);
    expect(session.next_page).toBe(checkpointBeforeReplay.next_page);
    expect(JSON.stringify(session.source_state)).toBe(checkpointBeforeReplay.source_state);
    expect(JSON.stringify(session.candidate_buffer)).toBe(checkpointBeforeReplay.candidate_buffer);
    expect(session.generation_lease).toBe("newer-generation");
  });

  it("repairs a batch after a delivery write fails after batch insertion", async () => {
    mocks.discoverServerMovies.mockImplementation(async (params: { page: number }) => ({
      page: params.page,
      total_pages: 2,
      results: Array.from({ length: 24 }, (_, index) => movie((params.page - 1) * 24 + index + 1)),
    }));
    const first = pageData(await call("/api/user/recommendations/v2?limit=24&content_type=movie"));
    const nextUrl = cursorUrl(first.nextCursor!, "&content_type=movie");
    db.collection("recommendation_deliveries").failNextUpdates = 1;
    const failed = await call(nextUrl);
    expect(failed.statusCode).toBe(500);
    expect(db.collection("recommendation_batches").documents.some((batch) => batch.page === 2)).toBe(true);

    const repaired = await call(nextUrl);
    expect(repaired.statusCode).toBe(200);
    expect(pageData(repaired).items).toHaveLength(24);
    expect(db.collection("recommendation_sessions").documents[0]!.next_page).toBe(3);
  });

  describe("seed retrieval and dislikes", () => {
    const seededProfile = () => ({
      ...profile(),
      explicit: {
        genres: [],
        languages: [],
        dislikedGenres: [27],
        seeds: [
          { contentId: 603, contentType: "movie", title: "The Matrix", genres: [878], language: "en" },
          { contentId: 604, contentType: "tv", title: "Dark Show", genres: [9648], language: "en" },
        ],
      },
      evidence: [
        { key: "movie_603", contentType: "movie", title: "The Matrix", signal: "seed", weight: 3, language: "en", genreIds: [878] },
      ],
    });

    it("adds TMDB similar and recommended titles for the picked seeds, tagged by seed", async () => {
      mocks.tasteState.profile = seededProfile();
      mocks.getServerMovieRecommendations.mockResolvedValue({ page: 1, total_pages: 1, results: [{ ...movie(9001), title: "Seed recommended" }] });
      mocks.getServerSimilarMovies.mockResolvedValue({ page: 1, total_pages: 1, results: [{ ...movie(9002), title: "Seed similar" }] });

      const res = await call("/api/user/recommendations/v2?limit=24&content_type=movie");

      expect(mocks.getServerMovieRecommendations).toHaveBeenCalledWith(603);
      expect(mocks.getServerSimilarMovies).toHaveBeenCalledWith(603);
      const ids = pageData(res).items.map((entry) => entry.id);
      expect(ids).toEqual(expect.arrayContaining([9001, 9002]));
      const explanation = res.body.data.explanationById;
      expect(explanation["movie_9001"].reasons.map((r: { label: string }) => r.label)).toContain("Because you picked The Matrix");
    });

    it("rotates seeds across pages instead of querying all of them every time", async () => {
      mocks.tasteState.profile = seededProfile();
      await call("/api/user/recommendations/v2?limit=24&content_type=all");
      // Two seeds exist (one movie, one series): each is queried once on page 1.
      expect(mocks.getServerMovieRecommendations).toHaveBeenCalledTimes(1);
      expect(mocks.getServerTVShowRecommendations).toHaveBeenCalledTimes(1);
    });

    it("survives failing or junk seed responses", async () => {
      mocks.tasteState.profile = seededProfile();
      mocks.getServerMovieRecommendations.mockRejectedValue(new Error("tmdb down"));
      mocks.getServerSimilarMovies.mockResolvedValue({ page: 1, total_pages: 1, results: [null, 5, { nope: true }] });
      const res = await call("/api/user/recommendations/v2?limit=24&content_type=movie");
      expect(res.statusCode).toBe(200);
      expect(pageData(res).items.length).toBeGreaterThan(0);
    });

    it("skips seed calls for other content types and when there are no seeds", async () => {
      mocks.tasteState.profile = seededProfile();
      await call("/api/user/recommendations/v2?limit=24&content_type=tv");
      expect(mocks.getServerMovieRecommendations).not.toHaveBeenCalled();

      mocks.getServerMovieRecommendations.mockClear();
      mocks.tasteState.profile = profile();
      await call("/api/user/recommendations/v2?limit=24&content_type=movie");
      expect(mocks.getServerMovieRecommendations).not.toHaveBeenCalled();
    });

    it("caps seed candidates so normal discovery still runs and fills the page", async () => {
      mocks.tasteState.profile = {
        ...seededProfile(),
        explicit: {
          genres: [],
          languages: [],
          seeds: [
            { contentId: 603, contentType: "movie", title: "A", genres: [878] },
            { contentId: 604, contentType: "movie", title: "B", genres: [878] },
            { contentId: 605, contentType: "movie", title: "C", genres: [878] },
          ],
        },
      };
      const many = (offset: number) => ({
        page: 1,
        total_pages: 1,
        results: Array.from({ length: 20 }, (_, index) => movie(offset + index)),
      });
      mocks.getServerMovieRecommendations.mockImplementation(async (id: number) => many(id * 100));
      mocks.getServerSimilarMovies.mockImplementation(async (id: number) => many(id * 100 + 50));

      const res = await call("/api/user/recommendations/v2?limit=24&content_type=movie");

      expect(mocks.discoverServerMovies).toHaveBeenCalled();
      const seedIds = pageData(res).items.map((entry) => entry.id as number).filter((id) => id >= 60000);
      expect(seedIds.length).toBeLessThanOrEqual(8);
      expect(pageData(res).items).toHaveLength(24);
    });

    it("excludes disliked genres from discover queries unless the user filters to one", async () => {
      mocks.tasteState.profile = seededProfile();
      await call("/api/user/recommendations/v2?limit=24&content_type=movie");
      const calls = mocks.discoverServerMovies.mock.calls.map(([params]) => params as { without_genres?: string });
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every((params) => params.without_genres === "27")).toBe(true);

      mocks.discoverServerMovies.mockClear();
      await call("/api/user/recommendations/v2?limit=24&content_type=movie&genre=27");
      const filtered = mocks.discoverServerMovies.mock.calls.map(([params]) => params as { without_genres?: string });
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every((params) => params.without_genres === undefined)).toBe(true);
    });
  });

});
