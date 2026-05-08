import { describe, expect, it, vi } from "vitest";
import { buildCollaborativeBoosts } from "./recommendation-collaborative";

function collection(rows: unknown[], options: { includeMaxTimeMS?: boolean } = {}) {
  const cursor = {
    ...(options.includeMaxTimeMS ? { maxTimeMS: vi.fn(() => cursor) } : {}),
    project: vi.fn(() => cursor),
    toArray: vi.fn(async () => rows),
  };
  return {
    aggregate: vi.fn(() => cursor),
    cursor,
  };
}

describe("recommendation collaborative boosts", () => {
  it("returns no boosts when local overlap is below the data gate", async () => {
    const db = {
      collection: vi.fn(() => collection([])),
    } as any;

    const boosts = await buildCollaborativeBoosts(db, {
      userId: "user_1",
      positiveKeys: ["movie_1"],
      excludedKeys: new Set<string>(),
    });

    expect(boosts).toEqual({});
  });

  it("returns bounded boosts for locally co-liked candidates", async () => {
    const db = {
      collection: vi.fn(() =>
        collection([
          {
            _id: { content_type: "movie", content_id: 200 },
            count: 8,
            candidateNeighborCount: 3,
            totalNeighborCount: 4,
          },
          {
            _id: { content_type: "tv", content_id: 300 },
            count: 5,
            candidateNeighborCount: 2,
            totalNeighborCount: 4,
          },
        ]),
      ),
    } as any;

    const boosts = await buildCollaborativeBoosts(db, {
      userId: "user_1",
      positiveKeys: ["movie_1", "tv_2", "movie_3"],
      excludedKeys: new Set<string>(["movie_1"]),
    });

    expect(boosts.movie_200).toBeGreaterThan(0);
    expect(boosts.tv_300).toBeGreaterThan(0);
    expect(Math.max(...Object.values(boosts))).toBeLessThanOrEqual(0.1);
  });

  it("ignores malformed keys before applying the data gate", async () => {
    const db = {
      collection: vi.fn(() => collection([])),
    } as any;

    const boosts = await buildCollaborativeBoosts(db, {
      userId: "user_1",
      positiveKeys: [
        "movie_1_extra",
        "movie_0x10",
        "movie_ 1",
        "movie_1",
        "tv_2",
      ],
      excludedKeys: new Set<string>(),
    });

    expect(boosts).toEqual({});
    expect(db.collection).not.toHaveBeenCalled();
  });

  it("returns no boosts for rows from too few distinct neighbors", async () => {
    const db = {
      collection: vi.fn(() =>
        collection([
          {
            _id: { content_type: "movie", content_id: 200 },
            count: 8,
            candidateNeighborCount: 1,
            totalNeighborCount: 1,
          },
          {
            _id: { content_type: "tv", content_id: 300 },
            count: 5,
            candidateNeighborCount: 1,
            totalNeighborCount: 1,
          },
        ]),
      ),
    } as any;

    const boosts = await buildCollaborativeBoosts(db, {
      userId: "user_1",
      positiveKeys: ["movie_1", "tv_2", "movie_3"],
      excludedKeys: new Set<string>(),
    });

    expect(boosts).toEqual({});
  });

  it("filters excluded candidate rows", async () => {
    const db = {
      collection: vi.fn(() =>
        collection([
          {
            _id: { content_type: "movie", content_id: 200 },
            count: 8,
            candidateNeighborCount: 3,
            totalNeighborCount: 4,
          },
          {
            _id: { content_type: "tv", content_id: 300 },
            count: 5,
            candidateNeighborCount: 2,
            totalNeighborCount: 4,
          },
          {
            _id: { content_type: "movie", content_id: 400 },
            count: 4,
            candidateNeighborCount: 2,
            totalNeighborCount: 4,
          },
        ]),
      ),
    } as any;

    const boosts = await buildCollaborativeBoosts(db, {
      userId: "user_1",
      positiveKeys: ["movie_1", "tv_2", "movie_3"],
      excludedKeys: new Set<string>(["movie_200"]),
    });

    expect(boosts.movie_200).toBeUndefined();
    expect(boosts.tv_300).toBeGreaterThan(0);
    expect(boosts.movie_400).toBeGreaterThan(0);
  });

  it("returns no boosts when exclusions leave too few aggregate candidates", async () => {
    const db = {
      collection: vi.fn(() =>
        collection([
          {
            _id: { content_type: "movie", content_id: 200 },
            count: 8,
            candidateNeighborCount: 3,
            totalNeighborCount: 4,
          },
          {
            _id: { content_type: "tv", content_id: 300 },
            count: 5,
            candidateNeighborCount: 2,
            totalNeighborCount: 4,
          },
        ]),
      ),
    } as any;

    const boosts = await buildCollaborativeBoosts(db, {
      userId: "user_1",
      positiveKeys: ["movie_1", "tv_2", "movie_3"],
      excludedKeys: new Set<string>(["movie_200"]),
    });

    expect(boosts).toEqual({});
  });

  it("sets maxTimeMS on the aggregation cursor when supported", async () => {
    const likedItems = collection(
      [
        {
          _id: { content_type: "movie", content_id: 200 },
          count: 8,
          candidateNeighborCount: 3,
          totalNeighborCount: 4,
        },
        {
          _id: { content_type: "tv", content_id: 300 },
          count: 5,
          candidateNeighborCount: 2,
          totalNeighborCount: 4,
        },
      ],
      { includeMaxTimeMS: true },
    );
    const db = {
      collection: vi.fn(() => likedItems),
    } as any;

    await buildCollaborativeBoosts(db, {
      userId: "user_1",
      positiveKeys: ["movie_1", "tv_2", "movie_3"],
      excludedKeys: new Set<string>(),
    });

    expect(likedItems.cursor.maxTimeMS).toHaveBeenCalledWith(650);
  });
});
