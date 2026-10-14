import { describe, expect, it } from "vitest";
import {
  activityEvidenceCount,
  buildMoodGenreBoost,
  coldStartQuality,
  discoverExclusions,
  matchedEra,
  moodGenreSum,
  paceScore,
  pickSeedsForPage,
  preferenceMultiplier,
  smoothedRating,
  strongestMood,
  tasteConfidence,
} from "./coldStart";

const evidence = (signal: string, count: number) =>
  ({ evidence: Array.from({ length: count }, () => ({ signal })) });

describe("confidence ramp", () => {
  it("does not count seed evidence as activity", () => {
    expect(activityEvidenceCount({ evidence: [{ signal: "seed" }, { signal: "liked" }, { signal: "skip" }] })).toBe(2);
  });

  it("is 0 with no activity, 0.5 at six, and caps at 1 from twelve", () => {
    expect(tasteConfidence(evidence("liked", 0))).toBe(0);
    expect(tasteConfidence(evidence("liked", 6))).toBeCloseTo(0.5);
    expect(tasteConfidence(evidence("liked", 12))).toBe(1);
    expect(tasteConfidence(evidence("liked", 400))).toBe(1);
  });

  it("boosts explicit weight up to 1.8x at zero confidence and 1x at full confidence", () => {
    expect(preferenceMultiplier(evidence("seed", 10))).toBeCloseTo(1.8);
    expect(preferenceMultiplier(evidence("liked", 6))).toBeCloseTo(1.4);
    expect(preferenceMultiplier(evidence("liked", 12))).toBe(1);
  });
});

describe("mood boosts", () => {
  it("adds 0.8 per mood-genre and caps at 1.6", () => {
    expect(buildMoodGenreBoost(["dark"])).toMatchObject({ "80": 0.8, "53": 0.8, "27": 0.8, "9648": 0.8 });
    // 53 and 9648 appear in dark, mind_bending and intense: capped.
    const stacked = buildMoodGenreBoost(["dark", "mind_bending", "intense"]);
    expect(stacked["53"]).toBe(1.6);
    expect(stacked["9648"]).toBe(1.6);
  });

  it("returns an empty map for no moods and ignores unknown moods", () => {
    expect(buildMoodGenreBoost([])).toEqual({});
    expect(buildMoodGenreBoost(["bogus" as never])).toEqual({});
  });

  it("sums boosts over an item's genres and names the strongest mood", () => {
    const boost = buildMoodGenreBoost(["dark", "funny"]);
    expect(moodGenreSum(boost, [80, 35, 18])).toBeCloseTo(1.6);
    expect(moodGenreSum(undefined, [80])).toBe(0);
    expect(strongestMood(["dark", "funny"], [80, 53])).toBe("dark");
    expect(strongestMood(["dark", "funny"], [35])).toBe("funny");
    expect(strongestMood(["dark"], [18])).toBeNull();
    expect(strongestMood(undefined, [80])).toBeNull();
  });
});

describe("eras", () => {
  it("matches boundaries exactly", () => {
    expect(matchedEra(1989, ["classics"])).toBe("classics");
    expect(matchedEra(1990, ["classics"])).toBeNull();
    expect(matchedEra(1990, ["nineties_2000s"])).toBe("nineties_2000s");
    expect(matchedEra(2009, ["nineties_2000s"])).toBe("nineties_2000s");
    expect(matchedEra(2010, ["modern"])).toBe("modern");
    expect(matchedEra(2019, ["modern"])).toBe("modern");
    expect(matchedEra(2020, ["new"])).toBe("new");
  });

  it("returns null for unknown year or no eras", () => {
    expect(matchedEra(null, ["new"])).toBeNull();
    expect(matchedEra(2024, [])).toBeNull();
    expect(matchedEra(2024, undefined)).toBeNull();
  });
});

describe("quality prior", () => {
  it("pulls tiny-sample ratings toward 6.5 and leaves large samples alone", () => {
    expect(smoothedRating(10, 3)).toBeCloseTo(6.5 + (10 - 6.5) * (3 / 303), 5);
    expect(smoothedRating(8, 100000)).toBeCloseTo(8, 1);
    expect(smoothedRating(9, 0)).toBe(6.5);
  });

  it("uses the smoothed value with no history and the raw value with full history", () => {
    const junk = { voteAverage: 9.8, voteCount: 6 };
    const solid = { voteAverage: 7.6, voteCount: 4000 };
    expect(coldStartQuality(junk, 0)).toBeLessThan(coldStartQuality(solid, 0));
    expect(coldStartQuality(junk, 1)).toBeGreaterThan(coldStartQuality(solid, 1));
    expect(coldStartQuality(junk, 1)).toBeCloseTo(0.98);
  });

  it("stays within 0..1 for odd inputs", () => {
    expect(coldStartQuality({ voteAverage: 99, voteCount: -5 }, 0.5)).toBeLessThanOrEqual(1);
    expect(coldStartQuality({ voteAverage: -3, voteCount: 10 }, 0.5)).toBeGreaterThanOrEqual(0);
  });
});

describe("pace", () => {
  it("favours long films for slow_burn and short for fast, neutral otherwise", () => {
    expect(paceScore("slow_burn", 130)).toBe(1);
    expect(paceScore("slow_burn", 95)).toBe(0);
    expect(paceScore("fast", 90)).toBe(1);
    expect(paceScore("fast", 140)).toBe(0);
    expect(paceScore("balanced", 120)).toBe(0);
  });

  it("is neutral when runtime or pace is unknown", () => {
    expect(paceScore("slow_burn", null)).toBe(0);
    expect(paceScore(null, 120)).toBe(0);
    expect(paceScore(undefined, 120)).toBe(0);
    expect(paceScore("fast", Number.NaN)).toBe(0);
  });
});

describe("pickSeedsForPage", () => {
  const seeds = ["a", "b", "c", "d", "e"];

  it("rotates three at a time across pages", () => {
    expect(pickSeedsForPage(seeds, 1)).toEqual(["a", "b", "c"]);
    expect(pickSeedsForPage(seeds, 2)).toEqual(["d", "e", "a"]);
    expect(pickSeedsForPage(seeds, 3)).toEqual(["b", "c", "d"]);
  });

  it("handles few, none and weird pages", () => {
    expect(pickSeedsForPage(["a"], 5)).toEqual(["a"]);
    expect(pickSeedsForPage([], 1)).toEqual([]);
    expect(pickSeedsForPage(undefined, 1)).toEqual([]);
    expect(pickSeedsForPage(seeds, 0)).toEqual(["a", "b", "c"]);
    expect(pickSeedsForPage(seeds, -4)).toEqual(["a", "b", "c"]);
  });
});

describe("discoverExclusions", () => {
  it("joins disliked genres with a pipe (any-of) for TMDB without_genres", () => {
    expect(discoverExclusions({ explicit: { dislikedGenres: [27, 53] } }, null)).toBe("27|53");
  });

  it("drops the genre the user is explicitly filtering to", () => {
    expect(discoverExclusions({ explicit: { dislikedGenres: [27, 53] } }, 27)).toBe("53");
    expect(discoverExclusions({ explicit: { dislikedGenres: [27] } }, 27)).toBeUndefined();
  });

  it("returns undefined when nothing is disliked or the profile is legacy-shaped", () => {
    expect(discoverExclusions({ explicit: {} }, null)).toBeUndefined();
    expect(discoverExclusions({ explicit: { dislikedGenres: [] } }, null)).toBeUndefined();
  });
});
