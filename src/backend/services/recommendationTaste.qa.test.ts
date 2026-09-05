import { describe, expect, it, vi } from "vitest";
import { resetRecommendationTaste, updateRecommendationTasteControls } from "./recommendationTaste";

type Doc = Record<string, unknown>;
type Update = Record<string, Doc>;

// Mongo rejects conflicting update paths before applying any operator. Ordinary
// permissive mocks miss this even when their resulting document looks correct.
function assertDisjointPaths(update: Update) {
  const paths = Object.values(update).flatMap(fields => Object.keys(fields));
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      if (paths[i] === paths[j] || paths[i].startsWith(`${paths[j]}.`) || paths[j].startsWith(`${paths[i]}.`)) {
        throw new Error("Conflicting Mongo update paths");
      }
    }
  }
}

function strictDatabase() {
  const documents = new Map<string, Doc>();
  const updateOne = vi.fn(async (filter: Doc, update: Update) => {
    assertDisjointPaths(update);
    const key = String(filter.user_id);
    const previous = documents.get(key);
    const next: Doc = { ...filter, ...previous };
    if (!previous) Object.assign(next, update.$setOnInsert);
    Object.assign(next, update.$set);
    for (const [field, value] of Object.entries(update.$inc || {})) next[field] = Number(next[field] || 0) + Number(value);
    for (const [field, value] of Object.entries(update.$addToSet || {})) next[field] = [...new Set([...(next[field] as unknown[] || []), value])];
    for (const [field, value] of Object.entries(update.$pull || {})) next[field] = (next[field] as unknown[] || []).filter(item => item !== value);
    documents.set(key, next);
    return { matchedCount: previous ? 1 : 0, upsertedCount: previous ? 0 : 1 };
  });
  const stale = vi.fn(async (_filter: Doc, update: Update) => { assertDisjointPaths(update); });
  const db = { collection: (name: string) => name === "user_taste_controls"
    ? { updateOne, findOne: async (filter: Doc) => documents.get(String(filter.user_id)) || null }
    : { updateOne: stale } } as unknown as Parameters<typeof updateRecommendationTasteControls>[0];
  return { db, updateOne, stale };
}

describe("taste controls Mongo update contract QA", () => {
  it("detects duplicate and overlapping paths in the strict QA adapter", () => {
    expect(() => assertDisjointPaths({ $set: { user_id: "qa" }, $setOnInsert: { user_id: "qa" } })).toThrow();
    expect(() => assertDisjointPaths({ $set: { profile: {} }, $unset: { "profile.genre": 1 } })).toThrow();
  });

  it("persists exploration, canonical exclusion and restore without conflicting Mongo operators", async () => {
    const { db, stale } = strictDatabase();
    const explore = await updateRecommendationTasteControls(db, "qa", { explorationMode: "adventurous" });
    expect(explore.explorationMode).toBe("adventurous");
    const exclude = await updateRecommendationTasteControls(db, "qa", { excludedLearningKey: "movie:42" });
    expect(exclude.excludedLearningKeys).toEqual(["movie_42"]);
    expect(exclude.explorationMode).toBe("adventurous");
    const restore = await updateRecommendationTasteControls(db, "qa", { restoreLearningKey: "movie_42" });
    expect(restore.excludedLearningKeys).toEqual([]);
    expect(restore.revision).toBeGreaterThan(explore.revision);
    expect(stale).toHaveBeenCalledTimes(3);
  });

  it("supports exclusion on a new account and reset while preserving its exploration selection", async () => {
    const { db } = strictDatabase();
    expect((await updateRecommendationTasteControls(db, "qa", { excludedLearningKey: "tv_42" })).excludedLearningKeys).toEqual(["tv_42"]);
    await updateRecommendationTasteControls(db, "qa", { explorationMode: "adventurous" });
    const reset = await resetRecommendationTaste(db, "qa", "2026-09-05T00:00:00Z");
    expect(reset).toMatchObject({ excludedLearningKeys: [], explorationMode: "adventurous", resetAt: "2026-09-05T00:00:00Z" });
  });

  it("rejects conflicting exclude and restore intents before any mutation", async () => {
    const { db, updateOne, stale } = strictDatabase();
    await expect(updateRecommendationTasteControls(db, "qa", { excludedLearningKey: "movie_42", restoreLearningKey: "movie:42" })).rejects.toThrow();
    expect(updateOne).not.toHaveBeenCalled();
    expect(stale).not.toHaveBeenCalled();
  });
});
