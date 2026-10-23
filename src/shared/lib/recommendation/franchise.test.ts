import { describe, expect, it } from "vitest";
import { normalizeTmdbItem, type UnifiedContentItem } from "@/shared/lib/recommendation";
import { assignFranchiseKeys, limitPerFranchise, sameFranchise } from "./franchise";

const JACKSON = { id: 108, name: "Peter Jackson", job: "Director", department: "Directing" };
const MIDDLE_EARTH = ["middle-earth (tolkien)", "wizard", "elves", "dwarf", "orc", "based on novel or book"];

function film(
  id: number,
  title: string,
  releaseDate: string,
  { collection, keywords = [], director }: { collection?: number; keywords?: string[]; director?: typeof JACKSON } = {},
): UnifiedContentItem {
  const item = normalizeTmdbItem(
    {
      id,
      title,
      release_date: releaseDate,
      genre_ids: [12, 14],
      original_language: "en",
      vote_average: 7.5,
      vote_count: 5000,
      popularity: 80,
      ...(collection ? { belongs_to_collection: { id: collection, name: `Collection ${collection}` } } : {}),
      keywords: { keywords: keywords.map((name, index) => ({ id: id * 100 + index, name })) },
      credits: { cast: [], crew: director ? [director] : [] },
    },
    { typeHint: "movie", useCache: false },
  );
  if (!item) throw new Error("fixture must normalize");
  return item;
}

const fellowship = film(120, "The Fellowship of the Ring", "2001-12-18", { collection: 119, keywords: MIDDLE_EARTH, director: JACKSON });
const twoTowers = film(121, "The Two Towers", "2002-12-18", { collection: 119, keywords: MIDDLE_EARTH, director: JACKSON });
const fiveArmies = film(122917, "The Battle of the Five Armies", "2014-12-10", { collection: 121938, keywords: MIDDLE_EARTH, director: JACKSON });
const kingKong = film(254, "King Kong", "2005-12-12", { keywords: ["giant ape", "island", "based on novel or book", "dinosaur"], director: JACKSON });
const unrelated = film(999, "Some Other Quest", "2010-01-01", { keywords: ["wizard", "based on novel or book"] });

describe("franchise detection", () => {
  it("links sequels in one TMDB collection", () => {
    expect(sameFranchise(fellowship, twoTowers)).toBe(true);
  });

  it("links related series across collections by director and specific keywords", () => {
    expect(sameFranchise(fellowship, fiveArmies)).toBe(true);
  });

  it("does not link a director's unrelated film or titles sharing only generic keywords", () => {
    expect(sameFranchise(fellowship, kingKong)).toBe(false);
    expect(sameFranchise(fellowship, unrelated)).toBe(false);
  });

  it("groups transitively and leaves standalone titles without a key", () => {
    const keys = assignFranchiseKeys([fiveArmies, kingKong, fellowship, twoTowers, unrelated]);
    expect(keys.get(fellowship.key)).toBe(keys.get(fiveArmies.key));
    expect(keys.get(twoTowers.key)).toBe(keys.get(fellowship.key));
    expect(keys.has(kingKong.key)).toBe(false);
    expect(keys.has(unrelated.key)).toBe(false);
  });
});

describe("one title per franchise", () => {
  const entries = [fiveArmies, kingKong, twoTowers, unrelated, fellowship].map((item, index) => ({ item, score: 10 - index }));

  it("keeps the earliest unseen entry in the best-ranked member's slot", () => {
    const keys = assignFranchiseKeys(entries.map(({ item }) => item));
    const page = limitPerFranchise(entries, 3, keys).slice(0, 3).map(({ item }) => item.title);
    expect(page).toEqual(["The Fellowship of the Ring", "King Kong", "Some Other Quest"]);
  });

  it("never drops or duplicates titles", () => {
    const keys = assignFranchiseKeys(entries.map(({ item }) => item));
    const all = limitPerFranchise(entries, 3, keys).map(({ item }) => item.key);
    expect(all).toHaveLength(entries.length);
    expect(new Set(all).size).toBe(entries.length);
  });

  it("tops the page up with sequels when nothing else is left", () => {
    const only = [fiveArmies, twoTowers].map((item, index) => ({ item, score: 2 - index }));
    const page = limitPerFranchise(only, 2, assignFranchiseKeys(only.map(({ item }) => item)));
    expect(page.map(({ item }) => item.title)).toEqual(["The Two Towers", "The Battle of the Five Armies"]);
  });
});
