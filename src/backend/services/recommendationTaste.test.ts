import { describe, expect, it, vi } from "vitest";
import {
  loadRecommendationSuppressions,
  loadRecommendationTaste,
  updateRecommendationTasteControls,
} from "./recommendationTaste";

function cursor(rows: Record<string, unknown>[]) {
  return { toArray: vi.fn(async () => rows) };
}

describe("recommendation taste persistence boundaries", () => {
  it("uses canonical underscore keys and merges metadata across activity collections", async () => {
    const profileWrites: Record<string, unknown>[] = [];
    const collections: Record<string, any> = {
      user_taste_profiles: {
        findOne: vi.fn(async () => null),
        updateOne: vi.fn(async (_filter: unknown, update: Record<string, unknown>) => {
          profileWrites.push(update.$set as Record<string, unknown>);
          return { matchedCount: 0, upsertedCount: 1 };
        }),
      },
      user_preferences: {
        findOne: vi.fn(async () => ({ preferred_genres: [], preferred_languages: [] })),
      },
      watch_history: {
        find: vi.fn(() => cursor([{
          user_id: "user-1",
          content_id: 123,
          content_type: "movie",
          title: "Watched title",
          genres: [18],
          language: "en",
          watched_at: "2026-09-01T00:00:00.000Z",
        }])),
      },
      liked_items: {
        find: vi.fn(() => cursor([{
          user_id: "user-1",
          content_id: 123,
          content_type: "movie",
          liked_at: "2026-09-02T00:00:00.000Z",
        }])),
      },
      watchlist: { find: vi.fn(() => cursor([])) },
      content_feedback: { find: vi.fn(() => cursor([])) },
    };
    const db = { collection: vi.fn((name: string) => collections[name]) } as any;

    const state = await loadRecommendationTaste(db, "user-1");

    expect(state.excludedKeys.has("movie_123")).toBe(true);
    expect(state.excludedKeys.has("movie:123")).toBe(false);
    expect(state.profile.inferred.genres["18"]).toBeGreaterThan(0);
    expect(state.profile.evidence[0]?.key).toBe("movie_123");
    expect(profileWrites).toHaveLength(1);
  });

  it("returns only active canonical not-now suppressions for the requested candidates", async () => {
    const now = Date.parse("2026-09-05T00:00:00.000Z");
    const collections: Record<string, any> = {
      content_feedback: {
        find: vi.fn(() => cursor([
          {
            user_id: "user-1",
            content_id: 42,
            content_type: "movie",
            feedback_type: "not_now",
            suppress_until: "2026-09-06T00:00:00.000Z",
          },
          {
            user_id: "user-1",
            content_id: 43,
            content_type: "movie",
            feedback_type: "not_now",
            suppress_until: "2026-09-04T00:00:00.000Z",
          },
          {
            user_id: "user-1",
            content_id: 44,
            content_type: "movie",
            feedback_type: "skip",
            suppress_until: "2026-09-06T00:00:00.000Z",
          },
        ])),
      },
    };
    const db = { collection: vi.fn((name: string) => collections[name]) } as any;

    const suppressed = await loadRecommendationSuppressions(
      db,
      "user-1",
      [
        { type: "movie", id: 42 },
        { type: "movie", id: 43 },
        { type: "movie", id: 44 },
      ],
      now,
    );

    expect(suppressed).toEqual(new Set(["movie_42"]));
    expect(collections.content_feedback.find).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        content_id: { $in: [42, 43, 44] },
        content_type: { $in: ["movie"] },
      }),
      expect.anything(),
    );
  });

  it("keeps forgotten activity metadata available for restore without learning from it", async () => {
    const profileWrites: Record<string, unknown>[] = [];
    const collections: Record<string, any> = {
      user_taste_controls: {
        findOne: vi.fn(async () => ({
          user_id: "user-1",
          excluded_learning_keys: ["movie:123"],
          revision: 1,
        })),
      },
      user_taste_profiles: {
        findOne: vi.fn(async () => null),
        updateOne: vi.fn(async (_filter: unknown, update: Record<string, unknown>) => {
          profileWrites.push(update.$set as Record<string, unknown>);
          return { matchedCount: 0, upsertedCount: 1 };
        }),
      },
      user_preferences: {
        findOne: vi.fn(async () => ({ preferred_genres: [], preferred_languages: [] })),
      },
      watch_history: {
        find: vi.fn(() => cursor([{
          user_id: "user-1",
          content_id: 123,
          content_type: "movie",
          title: "Watched metadata",
          genres: [18],
          language: "en",
          watched_at: "2026-09-01T00:00:00.000Z",
        }])),
      },
      liked_items: {
        find: vi.fn(() => cursor([{
          user_id: "user-1",
          content_id: 123,
          content_type: "movie",
          title: "Forgotten example",
          liked_at: "2026-09-02T00:00:00.000Z",
        }])),
      },
      watchlist: { find: vi.fn(() => cursor([])) },
      content_feedback: { find: vi.fn(() => cursor([])) },
    };
    const db = { collection: vi.fn((name: string) => collections[name]) } as any;

    const state = await loadRecommendationTaste(db, "user-1");

    expect(state.profile.evidence).toEqual([]);
    expect(state.profile.excludedEvidence).toEqual([
      expect.objectContaining({
        key: "movie_123",
        title: "Forgotten example",
        signal: "liked",
        genreIds: [18],
        language: "en",
      }),
    ]);
    expect(profileWrites[0]?.excludedEvidence).toEqual(expect.any(Array));
  });

  it("uses disjoint Mongo update paths for taste controls", async () => {
    const controlsUpdate = vi.fn(async () => ({ matchedCount: 1, modifiedCount: 1 }));
    const profileUpdate = vi.fn(async () => ({ matchedCount: 1, modifiedCount: 1 }));
    const controlsCollection = {
      findOne: vi.fn(async () => ({
        user_id: "user-1",
        exploration_mode: "adventurous",
        excluded_learning_keys: ["movie_42"],
        revision: 2,
      })),
      updateOne: controlsUpdate,
    };
    const db = {
      collection: vi.fn((name: string) => name === "user_taste_controls"
        ? controlsCollection
        : { updateOne: profileUpdate }),
    } as any;

    await updateRecommendationTasteControls(db, "user-1", {
      explorationMode: "adventurous",
      excludedLearningKey: "movie:42",
    });

    const [, update] = controlsUpdate.mock.calls[0] as unknown as [unknown, Record<string, any>];
    expect(update.$set).toEqual(expect.objectContaining({ updated_at: expect.any(String), exploration_mode: "adventurous" }));
    expect(update.$set).not.toHaveProperty("user_id");
    expect(update.$setOnInsert).toEqual(expect.objectContaining({ user_id: "user-1" }));
    expect(update.$setOnInsert).not.toHaveProperty("exploration_mode");
    expect(update.$setOnInsert).not.toHaveProperty("excluded_learning_keys");
    expect(update.$addToSet).toEqual({ excluded_learning_keys: "movie_42" });
    expect(update.$pull).toBeUndefined();
    expect(profileUpdate).toHaveBeenCalledWith(
      { user_id: "user-1" },
      expect.objectContaining({ $inc: { mutation_revision: 1 } }),
      { upsert: false },
    );

    await expect(updateRecommendationTasteControls(db, "user-1", {
      excludedLearningKey: "movie_42",
      restoreLearningKey: "movie_42",
    })).rejects.toThrow("cannot exclude and restore");
  });
});
