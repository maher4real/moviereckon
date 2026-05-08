import { describe, expect, it } from "vitest";
import {
  buildCandidateUnion,
  getRecommendations,
  normalizeTmdbItem,
  scoreCandidate,
} from "@/shared/lib/recommendation";

function buildMovie(
  id: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    title: `Movie ${id}`,
    overview: "A futuristic thriller about survival and identity.",
    genre_ids: [878, 53],
    release_date: "2020-01-01",
    vote_average: 7.8,
    vote_count: 4200,
    popularity: 100,
    runtime: 120,
    keywords: [
      { id: 1, name: "future" },
      { id: 2, name: "survival" },
    ],
    cast: [
      { id: 10, name: "Actor A", order: 0 },
      { id: 11, name: "Actor B", order: 1 },
    ],
    crew: [{ id: 99, name: "Director D", job: "Director" }],
    ...overrides,
  };
}

describe("recommendation engine scoring", () => {
  it("ranks strong content matches above weak matches", () => {
    const seed = normalizeTmdbItem(buildMovie(100))!;
    const strongCandidate = normalizeTmdbItem(buildMovie(101, { popularity: 80 }))!;
    const weakCandidate = normalizeTmdbItem(
      buildMovie(102, {
        title: "Romantic Comedy 102",
        genre_ids: [35, 10749],
        release_date: "1985-01-01",
        runtime: 85,
        keywords: [{ id: 901, name: "wedding" }],
        cast: [{ id: 300, name: "Different Lead", order: 0 }],
        crew: [{ id: 301, name: "Another Director", job: "Director" }],
        vote_average: 6.2,
        vote_count: 90,
        popularity: 12,
      }),
    )!;

    const strongScore = scoreCandidate(seed, strongCandidate);
    const weakScore = scoreCandidate(seed, weakCandidate);

    expect(strongScore.score).toBeGreaterThan(weakScore.score);
    expect(strongScore.reasons.length).toBeGreaterThanOrEqual(2);
    expect(strongScore.reasons.length).toBeLessThanOrEqual(3);
  });

  it("applies novelty boost to unseen candidates", () => {
    const seed = normalizeTmdbItem(buildMovie(200))!;
    const candidate = normalizeTmdbItem(buildMovie(201))!;

    const unseen = scoreCandidate(seed, candidate, { seenIds: [] });
    const seen = scoreCandidate(seed, candidate, { seenIds: [candidate.key] });

    expect(unseen.score - seen.score).toBeCloseTo(0.05, 5);
  });

  it("keeps at least 30% hidden gems in top 20 when available", () => {
    const seed = normalizeTmdbItem(buildMovie(300))!;

    const mainstream = Array.from({ length: 20 }, (_, index) =>
      buildMovie(301 + index, {
        popularity: 250 - index * 3,
        vote_average: 7.6,
        vote_count: 6000,
      }),
    );

    const hiddenGems = Array.from({ length: 10 }, (_, index) =>
      buildMovie(401 + index, {
        popularity: 8 + index,
        vote_average: 7.4 + index * 0.03,
        vote_count: 700 + index * 20,
      }),
    );

    const ranked = getRecommendations(
      [seed],
      [...mainstream, ...hiddenGems],
      { maxCandidates: 200 },
    );

    const topTwenty = ranked.slice(0, 20);
    const hiddenCount = topTwenty.filter((entry) => entry.isHiddenGem).length;

    expect(hiddenCount).toBeGreaterThanOrEqual(6);
  });

  it("preserves underrepresented languages in the candidate pool when capped", () => {
    const sourceItems = [
      ...Array.from({ length: 18 }, (_, index) =>
        buildMovie(500 + index, {
          title: `English ${index}`,
          original_language: "en",
          popularity: 220 - index,
        }),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        buildMovie(700 + index, {
          title: `Hindi ${index}`,
          original_language: "hi",
          popularity: 62 - index,
        }),
      ),
    ];

    const union = buildCandidateUnion(
      [{ source: "mixed-language", items: sourceItems, typeHint: "movie" }],
      10,
    );

    const hindiCount = union.items.filter((item) => item.originalLanguage === "hi").length;

    expect(hindiCount).toBeGreaterThanOrEqual(2);
  });

  it("keeps secondary preferred languages visible in the top recommendation window", () => {
    const seed = normalizeTmdbItem(
      buildMovie(900, {
        title: "Anchor Seed",
        original_language: "en",
      }),
    )!;

    const englishCandidates = Array.from({ length: 12 }, (_, index) =>
      buildMovie(901 + index, {
        title: `English Candidate ${index}`,
        original_language: "en",
        popularity: 210 - index * 4,
      }),
    );

    const hindiCandidates = Array.from({ length: 3 }, (_, index) =>
      buildMovie(980 + index, {
        title: `Hindi Candidate ${index}`,
        original_language: "hi",
        popularity: 92 - index * 3,
      }),
    );

    const ranked = getRecommendations(
      [seed],
      [...englishCandidates, ...hindiCandidates],
      {
        preferredLanguages: ["en", "hi"],
        dominantLanguage: "en",
        maxCandidates: 60,
        diversificationTopN: 12,
      },
    );

    const topWindowLanguages = ranked
      .slice(0, 12)
      .map((entry) => entry.item.originalLanguage || "unknown");

    expect(topWindowLanguages.filter((language) => language === "hi").length).toBeGreaterThanOrEqual(2);
  });

  it("boosts explicit preferred genres even when seed similarity is weaker", () => {
    const seed = normalizeTmdbItem(
      buildMovie(1000, {
        title: "Broad Seed",
        genre_ids: [28],
        popularity: 80,
      }),
    )!;

    const preferredDrama = buildMovie(1001, {
      title: "Preferred Drama",
      genre_ids: [18],
      popularity: 55,
      vote_average: 7.5,
      vote_count: 900,
    });
    const actionMatch = buildMovie(1002, {
      title: "Generic Action",
      genre_ids: [28],
      popularity: 110,
      vote_average: 7.5,
      vote_count: 900,
    });

    const ranked = getRecommendations([seed], [actionMatch, preferredDrama], {
      preferredGenres: [18],
      maxCandidates: 20,
    });

    expect(ranked[0]?.item.title).toBe("Preferred Drama");
    expect(ranked[0]?.reasons.map((reason) => reason.label)).toContain(
      "Matches preferred genre",
    );
  });

  it("applies source and collaborative boosts without overriding hard exclusions", () => {
    const seed = normalizeTmdbItem(buildMovie(1200, { genre_ids: [18, 53] }))!;
    const excluded = normalizeTmdbItem(buildMovie(1201, { title: "Already Seen" }))!;
    const sourceMatched = normalizeTmdbItem(
      buildMovie(1202, { title: "TMDB Similar Match", genre_ids: [18] }),
      { sourceTag: "similar:movie:1200" },
    )!;
    const collaborativeMatched = normalizeTmdbItem(
      buildMovie(1203, { title: "Local Taste Match", genre_ids: [35] }),
    )!;

    const ranked = getRecommendations(
      [seed],
      [excluded, sourceMatched, collaborativeMatched],
      {
        seenIds: [excluded.key],
        sourceBoosts: { "similar:": 0.12 },
        collaborativeBoosts: { [collaborativeMatched.key]: 0.16 },
        maxCandidates: 20,
      },
    );

    expect(ranked.map((entry) => entry.item.key)).not.toContain(excluded.key);
    expect(ranked.slice(0, 2).map((entry) => entry.item.key)).toEqual(
      expect.arrayContaining([sourceMatched.key, collaborativeMatched.key]),
    );
    expect(
      ranked.find((entry) => entry.item.key === collaborativeMatched.key)
        ?.scoreBreakdown.collaborative,
    ).toBeGreaterThan(0);
    expect(
      ranked.find((entry) => entry.item.key === sourceMatched.key)?.scoreBreakdown
        .source,
    ).toBeGreaterThan(0);
  });

  it("penalizes candidates near skipped genre and keyword signals", () => {
    const seed = normalizeTmdbItem(
      buildMovie(1300, {
        title: "Drama Seed",
        genre_ids: [18],
        keywords: [{ id: 99, name: "revenge" }],
      }),
    )!;
    const skippedLike = normalizeTmdbItem(
      buildMovie(1301, {
        title: "Skipped-Like Candidate",
        genre_ids: [27],
        keywords: [{ id: 99, name: "revenge" }],
      }),
    )!;
    const cleanCandidate = normalizeTmdbItem(
      buildMovie(1302, {
        title: "Cleaner Candidate",
        genre_ids: [18],
        keywords: [{ id: 101, name: "family" }],
      }),
    )!;

    const ranked = getRecommendations(
      [seed],
      [skippedLike, cleanCandidate],
      {
        negativeGenreIds: [27],
        negativeKeywordTokens: ["revenge"],
        maxCandidates: 20,
      },
    );

    expect(ranked[0]?.item.key).toBe(cleanCandidate.key);
    expect(
      ranked.find((entry) => entry.item.key === skippedLike.key)?.scoreBreakdown
        .negativePenalty,
    ).toBeGreaterThan(0);
  });

  it("applies ranking controls in seedless fallback without overriding hard exclusions", () => {
    const excluded = normalizeTmdbItem(buildMovie(1400, { title: "Displayed" }))!;
    const sourceMatched = normalizeTmdbItem(
      buildMovie(1401, {
        title: "Fallback Similar Source",
        genre_ids: [28],
        original_language: "fr",
        popularity: 75,
        vote_average: 7.1,
      }),
      { sourceTag: "similar:movie:10" },
    )!;
    const collaborativeMatched = normalizeTmdbItem(
      buildMovie(1402, {
        title: "Fallback Taste Match",
        genre_ids: [35],
        original_language: "es",
        popularity: 38,
        vote_average: 6.4,
      }),
    )!;
    const skippedLike = normalizeTmdbItem(
      buildMovie(1403, {
        title: "Fallback Skipped-Like",
        genre_ids: [27],
        keywords: [{ id: 99, name: "revenge" }],
        original_language: "en",
        popularity: 80,
        vote_average: 7,
      }),
    )!;
    const cleanCandidate = normalizeTmdbItem(
      buildMovie(1404, {
        title: "Fallback Clean",
        genre_ids: [18],
        original_language: "en",
        popularity: 75,
        vote_average: 7.1,
      }),
    )!;

    const ranked = getRecommendations(
      [],
      [excluded, sourceMatched, collaborativeMatched, skippedLike, cleanCandidate],
      {
        displayedIds: [excluded.key],
        preferredLanguages: ["fr"],
        sourceBoosts: { "similar:": 0.12 },
        collaborativeBoosts: { [collaborativeMatched.key]: 0.16 },
        negativeGenreIds: [27],
        negativeKeywordTokens: ["revenge"],
        maxCandidates: 20,
      },
    );

    expect(ranked.map((entry) => entry.item.key)).not.toContain(excluded.key);
    expect(ranked.slice(0, 2).map((entry) => entry.item.key)).toEqual(
      expect.arrayContaining([sourceMatched.key, collaborativeMatched.key]),
    );
    expect(
      ranked.find((entry) => entry.item.key === sourceMatched.key)?.scoreBreakdown
        .source,
    ).toBeGreaterThan(0);
    expect(
      ranked.find((entry) => entry.item.key === sourceMatched.key)?.scoreBreakdown
        .preference,
    ).toBeGreaterThan(0);
    expect(
      ranked.find((entry) => entry.item.key === collaborativeMatched.key)
        ?.scoreBreakdown.collaborative,
    ).toBeGreaterThan(0);
    expect(
      ranked.find((entry) => entry.item.key === skippedLike.key)?.scoreBreakdown
        .negativePenalty,
    ).toBeGreaterThan(0);
    expect(
      ranked.findIndex((entry) => entry.item.key === skippedLike.key),
    ).toBeGreaterThan(ranked.findIndex((entry) => entry.item.key === cleanCandidate.key));
  });

  it("labels language-only preference boosts separately from genre boosts", () => {
    const seed = normalizeTmdbItem(
      buildMovie(1500, {
        title: "English Seed",
        genre_ids: [28],
        original_language: "en",
      }),
    )!;
    const languageMatch = normalizeTmdbItem(
      buildMovie(1501, {
        title: "Hindi Language Match",
        genre_ids: [35],
        original_language: "hi",
        popularity: 80,
      }),
    )!;
    const genericMatch = normalizeTmdbItem(
      buildMovie(1502, {
        title: "Generic Match",
        genre_ids: [35],
        original_language: "en",
        popularity: 80,
      }),
    )!;

    const ranked = getRecommendations(
      [seed],
      [genericMatch, languageMatch],
      {
        preferredLanguages: ["hi"],
        maxCandidates: 20,
      },
    );
    const languageEntry = ranked.find(
      (entry) => entry.item.key === languageMatch.key,
    );
    const reasonLabels = languageEntry?.reasons.map((reason) => reason.label) || [];

    expect(languageEntry?.scoreBreakdown.preference).toBeGreaterThan(0);
    expect(reasonLabels).toContain("Matches preferred language");
    expect(reasonLabels).not.toContain("Matches preferred genre");
  });
});
