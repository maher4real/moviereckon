import { describe, expect, it } from "vitest";
import {
  buildTasteProfile,
  getTasteGenreWeight,
  getTasteLanguageWeight,
  profileExtrasSignature,
  tasteExtrasSignature,
  type TasteSeed,
} from "./taste";

const NOW = "2026-09-05T12:00:00.000Z";
const LEGACY_FINGERPRINT = "e6ebddcb";

const seed = (id: number, genres: number[], language = "en"): TasteSeed => ({
  contentId: id,
  contentType: "movie",
  title: `Seed ${id}`,
  genres,
  language,
});

describe("legacy compatibility", () => {
  it("keeps the exact fingerprint for users with none of the new fields", () => {
    const base = { preferredGenres: [28], preferredLanguages: ["en"] };
    const legacy = buildTasteProfile([], base, null, NOW);
    expect(legacy.sourceFingerprint).toBe(LEGACY_FINGERPRINT);
    const withEmptyExtras = buildTasteProfile(
      [],
      { ...base, dislikedGenres: [], seedTitles: [], moods: [], pace: null, eras: [] },
      null,
      NOW,
    );
    expect(withEmptyExtras.sourceFingerprint).toBe(LEGACY_FINGERPRINT);
  });

  it("does not invent interests when only soft preferences are given", () => {
    const profile = buildTasteProfile([], { moods: ["dark"], eras: ["new"], pace: "fast" }, null, NOW);
    expect(profile.inferred).toEqual({ genres: {}, languages: {} });
    expect(profile.evidence).toEqual([]);
  });
});

describe("seed titles", () => {
  it("become undecayed positive evidence and feed genre and language affinity", () => {
    const profile = buildTasteProfile([], { seedTitles: [seed(1, [53, 80], "ko")] }, null, NOW);
    expect(profile.evidence).toEqual([
      expect.objectContaining({ key: "movie_1", signal: "seed", weight: 3, language: "ko" }),
    ]);
    expect(getTasteGenreWeight(profile, 53)).toBe(3);
    expect(getTasteGenreWeight(profile, 80)).toBe(3);
    expect(getTasteLanguageWeight(profile, "ko")).toBe(3);
    expect(profile.explicit.seeds).toHaveLength(1);
  });

  it("lose to a real like on the same title", () => {
    const profile = buildTasteProfile(
      [{ contentId: 1, contentType: "movie", title: "Seed 1", genres: [53], language: "en", occurredAt: "2026-09-04T12:00:00.000Z", signal: "liked" }],
      { seedTitles: [seed(1, [53])] },
      null,
      NOW,
    );
    expect(profile.evidence).toHaveLength(1);
    expect(profile.evidence[0]).toMatchObject({ signal: "liked", weight: 3.5 });
  });

  it("are not shifted by the age of the profile build time", () => {
    const early = buildTasteProfile([], { seedTitles: [seed(1, [53])] }, null, "2026-01-01T00:00:00.000Z");
    const late = buildTasteProfile([], { seedTitles: [seed(1, [53])] }, null, "2026-12-31T00:00:00.000Z");
    expect(getTasteGenreWeight(early, 53)).toBe(getTasteGenreWeight(late, 53));
  });
});

describe("seeds versus other activity on the same title", () => {
  const realEvent = (signal: "watched" | "watchlist" | "one_time_watch" | "give_it_a_go" | "skip") => ({
    contentId: 1,
    contentType: "movie" as const,
    title: "Seed 1",
    genres: [53],
    language: "en",
    occurredAt: "2026-09-04T12:00:00.000Z",
    signal,
  });

  it.each(["watched", "watchlist", "one_time_watch", "give_it_a_go"] as const)(
    "a favourite that is also %s still counts as a favourite",
    (signal) => {
      const profile = buildTasteProfile([realEvent(signal)], { seedTitles: [seed(1, [53])] }, null, NOW);
      expect(profile.evidence).toHaveLength(1);
      expect(profile.evidence[0]).toMatchObject({ key: "movie_1", signal: "seed", weight: 3 });
      expect(getTasteGenreWeight(profile, 53)).toBe(3);
    },
  );

  it("a skip on the same title is not overridden by the seed", () => {
    const profile = buildTasteProfile([realEvent("skip")], { seedTitles: [seed(1, [53])] }, null, NOW);
    expect(profile.evidence).toEqual([]);
    expect(profile.negative.genres["53"]).toBeGreaterThan(0);
  });
});

describe("disliked genres", () => {
  it("create strong negative weight", () => {
    const profile = buildTasteProfile([], { dislikedGenres: [27, 53] }, null, NOW);
    expect(profile.negative.genres["27"]).toBe(3);
    expect(profile.negative.genres["53"]).toBe(3);
    expect(profile.explicit.dislikedGenres).toEqual([27, 53]);
  });

  it("lose to an explicitly preferred genre (liked wins)", () => {
    const profile = buildTasteProfile([], { preferredGenres: [28], dislikedGenres: [28, 27] }, null, NOW);
    expect(profile.explicit.dislikedGenres).toEqual([27]);
    expect(profile.negative.genres["28"]).toBeUndefined();
    expect(profile.negative.genres["27"]).toBe(3);
  });

  it("ignore junk values", () => {
    const profile = buildTasteProfile([], { dislikedGenres: [27, 27, -1, 0, 1.5] }, null, NOW);
    expect(profile.explicit.dislikedGenres).toEqual([27]);
  });
});

describe("tone", () => {
  it("stores moods, eras and pace with a mood genre boost", () => {
    const profile = buildTasteProfile([], { moods: ["dark"], eras: ["modern", "new"], pace: "slow_burn" }, null, NOW);
    expect(profile.tone).toEqual({
      moods: ["dark"],
      eras: ["modern", "new"],
      pace: "slow_burn",
      moodGenreBoost: expect.objectContaining({ "53": 0.8, "80": 0.8 }),
    });
  });

  it("is omitted when nothing soft was chosen", () => {
    expect(buildTasteProfile([], { preferredGenres: [28] }, null, NOW).tone).toBeUndefined();
  });
});

describe("fingerprint and signatures", () => {
  const base = { preferredGenres: [28], preferredLanguages: ["en"] };

  it.each([
    ["dislikedGenres", { dislikedGenres: [27] }],
    ["seedTitles", { seedTitles: [seed(1, [53])] }],
    ["moods", { moods: ["dark" as const] }],
    ["pace", { pace: "fast" as const }],
    ["eras", { eras: ["new" as const] }],
  ])("changes when %s changes", (_name, extra) => {
    const without = buildTasteProfile([], base, null, NOW);
    const withExtra = buildTasteProfile([], { ...base, ...extra }, null, NOW);
    expect(withExtra.sourceFingerprint).not.toBe(without.sourceFingerprint);
  });

  it("produces matching signatures for preferences and the profile built from them", () => {
    const preferences = {
      ...base,
      dislikedGenres: [27],
      seedTitles: [seed(1, [53]), seed(2, [80], "ko")],
      moods: ["dark" as const],
      pace: "fast" as const,
      eras: ["new" as const],
    };
    const profile = buildTasteProfile([], preferences, null, NOW);
    expect(profileExtrasSignature(profile)).toBe(tasteExtrasSignature(preferences));
  });

  it("detects a change in any new field and is empty for none", () => {
    const profile = buildTasteProfile([], { ...base, moods: ["dark"] }, null, NOW);
    expect(profileExtrasSignature(profile)).not.toBe(tasteExtrasSignature({ ...base, moods: ["funny"] }));
    expect(profileExtrasSignature(profile)).not.toBe(tasteExtrasSignature(base));
    expect(tasteExtrasSignature(base)).toBe("");
    expect(profileExtrasSignature(buildTasteProfile([], base, null, NOW))).toBe("");
  });

  it("treats a legacy stored profile without new fields as having no extras", () => {
    const legacy = buildTasteProfile([], base, null, NOW);
    delete (legacy as { tone?: unknown }).tone;
    delete (legacy.explicit as { seeds?: unknown }).seeds;
    delete (legacy.explicit as { dislikedGenres?: unknown }).dislikedGenres;
    expect(profileExtrasSignature(legacy)).toBe("");
  });
});
