import { describe, expect, it } from "vitest";
import { averageToRecommend, computeReckonMeter, ratingToRecommend, verdictFor } from "./reckonMeter";

describe("Reckon Meter", () => {
  it("returns nothing without any opinion", () => {
    expect(computeReckonMeter({})).toBeNull();
    expect(computeReckonMeter({ audience: { average: 7, votes: 0 }, reactions: { not_now: 12 } })).toBeNull();
  });

  it("maps ratings and averages onto a recommend share", () => {
    expect(ratingToRecommend(4)).toBe(0);
    expect(ratingToRecommend(6)).toBe(0.5);
    expect(ratingToRecommend(9)).toBe(1);
    expect(averageToRecommend(8.4)).toBeGreaterThan(0.85);
    expect(averageToRecommend(6)).toBeLessThan(0.4);
  });

  it("does not let a handful of perfect scores read as a sure thing", () => {
    const hype = computeReckonMeter({ communityRatings: [10, 10] })!;
    const proven = computeReckonMeter({ communityRatings: Array.from({ length: 40 }, () => 9) })!;
    expect(hype.score).toBeLessThan(85);
    expect(hype.confidence).toBe("low");
    expect(proven.score).toBeGreaterThan(hype.score);
    expect(proven.confidence).toBe("medium");
  });

  it("caps a huge TMDB vote count so the community still moves the score", () => {
    const tmdbOnly = computeReckonMeter({ audience: { average: 8.4, votes: 30000 } })!;
    const withCommunity = computeReckonMeter({
      audience: { average: 8.4, votes: 30000 },
      communityRatings: Array.from({ length: 30 }, () => 3),
    })!;
    expect(tmdbOnly.score).toBeGreaterThanOrEqual(85);
    expect(withCommunity.score).toBeLessThan(tmdbOnly.score - 25);
    const influence = withCommunity.sources.find((source) => source.id === "community")!.influence;
    expect(influence).toBeGreaterThan(0.35);
  });

  it("counts reactions but ignores 'not now'", () => {
    const meter = computeReckonMeter({ reactions: { must_watch: 20, skip: 20, not_now: 500 } })!;
    expect(meter.opinions).toBe(40);
    expect(meter.score).toBeGreaterThan(45);
    expect(meter.score).toBeLessThan(55);
    expect(meter.distribution).toEqual({ loved: 20, liked: 0, mixed: 0, disliked: 20 });
  });

  it("flags a title people split on", () => {
    const split = computeReckonMeter({ reviewerRatings: [10, 10, 9, 2, 1, 2, 10, 1] })!;
    const agreed = computeReckonMeter({ reviewerRatings: [8, 8, 7, 9, 8, 7, 8, 8] })!;
    expect(split.divisive).toBe(true);
    expect(agreed.divisive).toBe(false);
  });

  it("names verdict bands", () => {
    expect(verdictFor(90)).toBe("Must watch");
    expect(verdictFor(72)).toBe("Recommended");
    expect(verdictFor(60)).toBe("Worth a try");
    expect(verdictFor(45)).toBe("Mixed");
    expect(verdictFor(20)).toBe("Skip it");
  });

  it("adds published critic and audience scores with their dates", () => {
    const meter = computeReckonMeter({
      communityRatings: [9, 8],
      external: [
        { id: "rt_critics", kind: "share", value: 92, count: 240, asOf: "2023-06-01" },
        { id: "metacritic", kind: "average", value: 9.2, count: 34 },
        { id: "imdb", kind: "average", value: 8.9, count: 2_000_000 },
        { id: "rt_audience", kind: "share", value: 95 },
      ],
    })!;
    expect(meter.sources.map((source) => source.id)).toEqual(["community", "rt_critics", "metacritic", "imdb", "rt_audience"]);
    expect(meter.score).toBeGreaterThanOrEqual(85);
    expect(meter.confidence).toBe("high");
    expect(meter.sources.find((source) => source.id === "rt_critics")).toMatchObject({ asOf: "2023-06-01", countKnown: true });
    expect(meter.sources.find((source) => source.id === "rt_audience")).toMatchObject({ countKnown: false });
    expect(meter.sources.map((source) => source.via)).toEqual(["MovieReckon", "Wikidata", "Wikidata", "Wikidata", "Wikidata"]);
  });

  it("lets well-documented critics pull down a hyped community score", () => {
    const hypeOnly = computeReckonMeter({ communityRatings: [10, 10, 10] })!;
    const panned = computeReckonMeter({
      communityRatings: [10, 10, 10],
      external: [
        { id: "rt_critics", kind: "share", value: 18, count: 150 },
        { id: "metacritic", kind: "average", value: 3.1, count: 40 },
      ],
    })!;
    expect(panned.score).toBeLessThan(hypeOnly.score - 30);
  });

  it("ignores out-of-range or duplicate external scores", () => {
    const meter = computeReckonMeter({
      external: [
        { id: "imdb", kind: "average", value: 14 },
        { id: "rt_critics", kind: "share", value: 80, count: 50 },
        { id: "rt_critics", kind: "share", value: 10, count: 50 },
      ],
    })!;
    expect(meter.sources).toHaveLength(1);
    expect(meter.sources[0]!.score).toBeGreaterThan(70);
  });
});

