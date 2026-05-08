import { describe, expect, it, vi } from "vitest";
import { buildCollaborativeBoosts } from "./recommendation-collaborative";

function collection(rows: unknown[]) {
  const cursor = {
    project: vi.fn(() => cursor),
    toArray: vi.fn(async () => rows),
  };
  return {
    aggregate: vi.fn(() => cursor),
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
          { _id: { content_type: "movie", content_id: 200 }, count: 8 },
          { _id: { content_type: "tv", content_id: 300 }, count: 5 },
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
});
