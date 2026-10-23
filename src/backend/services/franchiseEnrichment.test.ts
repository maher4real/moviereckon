import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeTmdbItem, type UnifiedContentItem } from "@/shared/lib/recommendation";

const getServerMovieRecommendationProfile = vi.fn();
vi.mock("@/backend/services/tmdbServer", () => ({ getServerMovieRecommendationProfile }));

const { clearFranchiseCache, enrichFranchiseMetadata } = await import("./franchiseEnrichment");

function discovered(id: number): UnifiedContentItem {
  const item = normalizeTmdbItem(
    { id, title: `Film ${id}`, release_date: "2001-01-01", genre_ids: [12], vote_average: 7, vote_count: 900 },
    { typeHint: "movie", useCache: false },
  );
  if (!item) throw new Error("fixture must normalize");
  return item;
}

const details = (id: number) => ({
  id,
  title: `Film ${id}`,
  belongs_to_collection: { id: 119, name: "Saga" },
  keywords: { keywords: [{ id: 1, name: "middle-earth (tolkien)" }] },
  credits: { cast: [], crew: [{ id: 108, name: "Peter Jackson", job: "Director", department: "Directing" }] },
});

describe("franchise enrichment", () => {
  beforeEach(() => {
    clearFranchiseCache();
    getServerMovieRecommendationProfile.mockReset();
  });

  it("adds collection, keywords and directors without replacing display data", async () => {
    getServerMovieRecommendationProfile.mockImplementation(async (id: number) => details(id));
    const [item] = await enrichFranchiseMetadata([discovered(120)]);
    expect(item!.collectionId).toBe(119);
    expect(item!.keywords.map((keyword) => keyword.name)).toEqual(["middle-earth (tolkien)"]);
    expect(item!.directors.map((person) => person.name)).toEqual(["Peter Jackson"]);
    expect((item!.raw as { credits?: unknown }).credits).toBeUndefined();
  });

  it("caches lookups across requests", async () => {
    getServerMovieRecommendationProfile.mockImplementation(async (id: number) => details(id));
    await enrichFranchiseMetadata([discovered(121)]);
    await enrichFranchiseMetadata([discovered(121)]);
    expect(getServerMovieRecommendationProfile).toHaveBeenCalledTimes(1);
  });

  it("returns on time and leaves slow or failing titles ungrouped", async () => {
    getServerMovieRecommendationProfile.mockImplementation((id: number) =>
      id === 1 ? new Promise(() => {}) : Promise.reject(new Error("tmdb down")));
    const started = Date.now();
    const items = await enrichFranchiseMetadata([discovered(1), discovered(2)], { deadlineMs: 30 });
    expect(Date.now() - started).toBeLessThan(500);
    expect(items.every((item) => item.collectionId === null && item.keywords.length === 0)).toBe(true);
  });
});
