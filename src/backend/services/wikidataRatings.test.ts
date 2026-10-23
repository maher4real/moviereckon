import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRatingsQuery,
  clearWikidataCache,
  fetchWikidataRatings,
  parseRatingsResponse,
  parseScore,
} from "./wikidataRatings";

const entity = (id: string) => ({ value: `http://www.wikidata.org/entity/${id}` });
const literal = (value: string) => ({ value });

const fellowshipBindings = [
  { item: entity("Q127367"), score: literal("91%"), by: entity("Q105584"), byLabel: literal("Rotten Tomatoes"), methodLabel: literal("Tomatometer score"), count: literal("230"), date: literal("2019-03-01T00:00:00Z") },
  { item: entity("Q127367"), score: literal("92%"), by: entity("Q105584"), byLabel: literal("Rotten Tomatoes"), methodLabel: literal("Tomatometer score"), count: literal("240"), date: literal("2023-06-01T00:00:00Z") },
  { item: entity("Q127367"), score: literal("8.2/10"), by: entity("Q105584"), byLabel: literal("Rotten Tomatoes"), methodLabel: literal("Rotten Tomatoes average rating") },
  { item: entity("Q127367"), score: literal("95%"), by: entity("Q105584"), byLabel: literal("Rotten Tomatoes"), methodLabel: literal("Rotten Tomatoes audience score") },
  { item: entity("Q127367"), score: literal("92/100"), by: entity("Q150248"), byLabel: literal("Metacritic"), methodLabel: literal("Metascore"), count: literal("34") },
  { item: entity("Q127367"), score: literal("8.9/10"), by: entity("Q37312"), byLabel: literal("IMDb"), count: literal("2000000") },
  { item: entity("Q127367"), score: literal("A+"), by: entity("Q5048510"), byLabel: literal("CinemaScore") },
];

describe("Wikidata review scores", () => {
  beforeEach(() => clearWikidataCache());

  it("parses percent and fraction scores", () => {
    expect(parseScore("87%")).toEqual({ kind: "share", value: 87 });
    expect(parseScore("74/100")).toEqual({ kind: "average", value: 7.4 });
    expect(parseScore("8.1/10")).toEqual({ kind: "average", value: 8.1 });
    expect(parseScore("A+")).toBeNull();
    expect(parseScore("140%")).toBeNull();
  });

  it("keeps the latest score per source and skips unrelated measures", () => {
    const result = parseRatingsResponse(fellowshipBindings);
    expect(result.wikidataId).toBe("Q127367");
    const byId = Object.fromEntries(result.ratings.map((rating) => [rating.id, rating]));
    expect(byId.rt_critics).toEqual({ id: "rt_critics", kind: "share", value: 92, count: 240, asOf: "2023-06-01" });
    expect(byId.rt_audience).toMatchObject({ kind: "share", value: 95, count: null });
    expect(byId.metacritic).toMatchObject({ kind: "average", value: 9.2, count: 34 });
    expect(byId.imdb).toMatchObject({ kind: "average", value: 8.9, count: 2000000 });
    expect(result.ratings).toHaveLength(4);
  });

  it("averages season scores when a series has none of its own", () => {
    const season = (n: number) => ({ value: `http://www.wikidata.org/entity/QS${n}` });
    const result = parseRatingsResponse([
      { item: entity("Q1079"), season: season(1), score: literal("100"), by: entity("Q150248"), byLabel: literal("Metacritic") },
      { item: entity("Q1079"), season: season(2), score: literal("85"), by: entity("Q150248"), byLabel: literal("Metacritic") },
      { item: entity("Q1079"), season: season(3), score: literal("90%"), by: entity("Q105584"), byLabel: literal("Rotten Tomatoes"), count: literal("20") },
      { item: entity("Q1079"), score: literal("96%"), by: entity("Q105584"), byLabel: literal("Rotten Tomatoes"), count: literal("120") },
    ]);
    const byId = Object.fromEntries(result.ratings.map((rating) => [rating.id, rating]));
    expect(byId.metacritic).toMatchObject({ kind: "average", value: 9.3, count: null });
    expect(byId.rt_critics).toMatchObject({ value: 96, count: 120 });
  });

  it("reads bare Metascores but not bare numbers from other sources", () => {
    expect(parseScore("92", 100)).toEqual({ kind: "average", value: 9.2 });
    expect(parseScore("92")).toBeNull();
  });

  it("looks up films and series by their TMDB property", () => {
    expect(buildRatingsQuery("movie", 120)).toContain('wdt:P4947 "120"');
    expect(buildRatingsQuery("tv", 1399)).toContain('wdt:P4983 "1399"');
    expect(buildRatingsQuery("tv", 1399)).toContain("wdt:P179 ?item");
    expect(buildRatingsQuery("movie", 120)).not.toContain("UNION");
    expect(buildRatingsQuery("movie", 120, "tt0120737")).toContain('wdt:P345 "tt0120737"');
    expect(buildRatingsQuery("movie", 120, "nm0001")).not.toContain("P345");
  });

  it("identifies itself to Wikidata and caches results", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ results: { bindings: fellowshipBindings } })));
    await fetchWikidataRatings("movie", 120, { fetchImpl: fetchImpl as unknown as typeof fetch });
    await fetchWikidataRatings("movie", 120, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("query.wikidata.org/sparql");
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^MovieReckon\//);
  });

  it("surfaces a failed lookup without caching it", async () => {
    const fetchImpl = vi.fn(async () => new Response("busy", { status: 429 }));
    await expect(fetchWikidataRatings("movie", 121, { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow("wikidata_429");
    await expect(fetchWikidataRatings("movie", 121, { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
