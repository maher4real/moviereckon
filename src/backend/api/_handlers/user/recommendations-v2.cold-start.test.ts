import { describe, expect, it, vi } from "vitest";
import { normalizeTmdbItem, type UnifiedContentItem } from "@/shared/lib/recommendation";
import { buildTasteProfile, type TasteProfile } from "@/shared/lib/recommendation/taste";
import { hardFilter, rankCandidatesForTaste, scoreCandidate } from "./recommendations-v2";

vi.mock("@/backend/api/lib/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/backend/api/lib/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/backend/services/tmdbServer", () => ({
  discoverServerMovies: vi.fn(),
  discoverServerTVShows: vi.fn(),
}));

const NOW = "2026-09-05T12:00:00.000Z";

function item(overrides: Record<string, unknown> = {}): UnifiedContentItem {
  const normalized = normalizeTmdbItem(
    {
      id: 1,
      title: "Candidate",
      genre_ids: [18],
      original_language: "en",
      release_date: "2015-06-01",
      vote_average: 7,
      vote_count: 2000,
      popularity: 80,
      ...overrides,
    },
    { typeHint: "movie", useCache: false },
  );
  if (!normalized) throw new Error("fixture must normalize");
  return normalized;
}

const filters = (overrides: Record<string, unknown> = {}) =>
  ({
    contentType: "all",
    recommendationType: "all",
    genreId: null,
    language: null,
    sort: "relevance",
    direction: "desc",
    exploration: "familiar",
    ...overrides,
  }) as Parameters<typeof hardFilter>[1];

describe("scoreCandidate: new terms", () => {
  it("scores a mood-matching genre above a non-matching one", () => {
    const profile = buildTasteProfile([], { moods: ["dark"] }, null, NOW);
    const dark = scoreCandidate(item({ genre_ids: [53] }), profile);
    const plain = scoreCandidate(item({ genre_ids: [18] }), profile);
    expect(dark.score).toBeGreaterThan(plain.score);
    expect(dark.explanation.reasons.map((r) => r.label)).toContain("Matches your dark mood");
  });

  it("adds a small era bonus only inside a selected era", () => {
    const profile = buildTasteProfile([], { eras: ["modern"] }, null, NOW);
    const inEra = scoreCandidate(item({ release_date: "2015-06-01" }), profile);
    const outside = scoreCandidate(item({ release_date: "1995-06-01" }), profile);
    expect(inEra.score - outside.score).toBeCloseTo(0.06, 5);
    expect(inEra.explanation.reasons.map((r) => r.label)).toContain("From the 2010s you like");
    expect(outside.explanation.reasons.map((r) => r.label)).not.toContain("From the 2010s you like");
  });

  it("applies pace only when runtime is known", () => {
    const profile = buildTasteProfile([], { pace: "slow_burn" }, null, NOW);
    const unknown = scoreCandidate(item(), profile);
    const long = scoreCandidate({ ...item(), runtime: 140 }, profile);
    const short = scoreCandidate({ ...item(), runtime: 90 }, profile);
    expect(long.score - unknown.score).toBeCloseTo(0.04, 5);
    expect(short.score).toBeCloseTo(unknown.score, 5);
  });

  it("penalizes an explicitly disliked genre much harder than a learned negative", () => {
    const disliked = buildTasteProfile([], { dislikedGenres: [27] }, null, NOW);
    const clean = buildTasteProfile([], {}, null, NOW);
    const horror = item({ genre_ids: [27] });
    expect(scoreCandidate(horror, clean).score - scoreCandidate(horror, disliked).score).toBeGreaterThan(0.25);
  });

  it("names the seed a candidate came from", () => {
    const profile = buildTasteProfile(
      [],
      { seedTitles: [{ contentId: 603, contentType: "movie", title: "The Matrix", genres: [878], language: "en" }] },
      null,
      NOW,
    );
    const fromSeed = { ...item({ genre_ids: [878] }), sourceTags: ["seed:movie_603"] };
    const reasons = scoreCandidate(fromSeed, profile).explanation.reasons.map((r) => r.label);
    expect(reasons[0]).toBe("Because you picked The Matrix");
    expect(reasons.length).toBeLessThanOrEqual(3);
  });
});

describe("scoreCandidate: cold start", () => {
  it("trusts explicit picks more with no activity than with plenty", () => {
    const cold = buildTasteProfile([], { preferredGenres: [53] }, null, NOW);
    const events = Array.from({ length: 12 }, (_, index) => ({
      contentId: 500 + index,
      contentType: "movie" as const,
      title: `Liked ${index}`,
      genres: [18],
      language: "en",
      occurredAt: "2026-09-04T12:00:00.000Z",
      signal: "liked" as const,
    }));
    const warm = buildTasteProfile(events, { preferredGenres: [53] }, null, NOW);
    const thriller = item({ genre_ids: [53] });
    const neutral = item({ genre_ids: [37] });
    const coldLead = scoreCandidate(thriller, cold).score - scoreCandidate(neutral, cold).score;
    const warmLead = scoreCandidate(thriller, warm).score - scoreCandidate(neutral, warm).score;
    expect(coldLead).toBeGreaterThan(0);
    expect(coldLead).toBeGreaterThan(warmLead);
  });

  it("keeps a 9.8-rated 6-vote title below a solid 7.6-rated title for a cold user", () => {
    const cold = buildTasteProfile([], {}, null, NOW);
    const junk = item({ id: 2, vote_average: 9.8, vote_count: 6, popularity: 80 });
    const solid = item({ id: 3, vote_average: 7.6, vote_count: 4000, popularity: 80 });
    expect(scoreCandidate(junk, cold).score).toBeLessThan(scoreCandidate(solid, cold).score);
  });
});

describe("legacy-shaped profiles", () => {
  const legacy = {
    version: 1,
    sourceFingerprint: "legacy",
    updatedAt: NOW,
    exploration: 0.12,
    explicit: { genres: [], languages: [] },
    inferred: { genres: {}, languages: {} },
    negative: { genres: {}, languages: {} },
    clusters: [],
    evidence: [],
  } as unknown as TasteProfile;

  it("scores, ranks and filters without the new fields", () => {
    const candidate = item();
    expect(() => scoreCandidate(candidate, legacy)).not.toThrow();
    expect(rankCandidatesForTaste([candidate], legacy)).toHaveLength(1);
    expect(hardFilter(candidate, filters(), legacy)).toBe(true);
  });
});

describe("hardFilter: disliked genres", () => {
  const profile = buildTasteProfile([], { dislikedGenres: [27] }, null, NOW);

  it("hides items whose primary genre is disliked", () => {
    expect(hardFilter(item({ genre_ids: [27, 53] }), filters(), profile)).toBe(false);
  });

  it("keeps items that only carry the disliked genre as a secondary genre", () => {
    expect(hardFilter(item({ genre_ids: [53, 27] }), filters(), profile)).toBe(true);
  });

  it("shows the genre when the user filters to it on purpose", () => {
    expect(hardFilter(item({ genre_ids: [27] }), filters({ genreId: 27 }), profile)).toBe(true);
  });

  it("never hides a genre the user also prefers (liked wins even for stale profiles)", () => {
    const stale = { ...profile, explicit: { ...profile.explicit, genres: [27], dislikedGenres: [27] } } as TasteProfile;
    expect(hardFilter(item({ genre_ids: [27] }), filters(), stale)).toBe(true);
  });

  it("behaves as before without a profile", () => {
    expect(hardFilter(item({ genre_ids: [27] }), filters())).toBe(true);
    expect(hardFilter(item(), filters({ contentType: "tv" }))).toBe(false);
  });
});
