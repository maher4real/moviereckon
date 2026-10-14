import { describe, expect, it, vi } from "vitest";
import { buildTasteProfile } from "@/shared/lib/recommendation/taste";
import { rankCandidatesForTaste } from "@/backend/api/_handlers/user/recommendations-v2";
import {
  DISLIKED_GENRE,
  NOW,
  buildCatalogue,
  eventsFromItems,
  precisionAt,
  relevantSeeds,
} from "./helpers/coldStartFixture";

vi.mock("@/backend/api/lib/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/backend/api/lib/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/backend/services/tmdbServer", () => ({
  discoverServerMovies: vi.fn(),
  discoverServerTVShows: vi.fn(),
}));

/**
 * precision@10 of the engine as it was BEFORE this upgrade, for a viewer whose
 * only inputs are the legacy ones (Thriller + English). Measured by running the
 * committed pre-upgrade engine over this exact catalogue; the pre-upgrade code
 * is no longer in the tree, so these are recorded constants.
 *  - indifferent: relevance ignores rating (the original fixture)
 *  - qualityAware: the viewer would not enjoy titles with fewer than 60 votes
 */
export const LEGACY_BASELINE = {
  indifferent: { thin: 0.3, rich: 0 },
  qualityAware: { thin: 0.1 },
};

const legacyPreferences = { preferredGenres: [53], preferredLanguages: ["en"] };
const soft = {
  dislikedGenres: [DISLIKED_GENRE],
  moods: ["dark" as const],
  eras: ["modern" as const, "new" as const],
};

type Catalogue = ReturnType<typeof buildCatalogue>;

function measure({ items, relevantKeys }: Catalogue) {
  const rank = (profile: ReturnType<typeof buildTasteProfile>, candidates = items, k = 10) =>
    precisionAt(rankCandidatesForTaste(candidates, profile, [], { exploration: "familiar" }), relevantKeys, k);

  const withSeeds = (count: number) => {
    const seeds = relevantSeeds(items, relevantKeys, count);
    const seedKeys = new Set(seeds.map((seed) => `movie_${seed.contentId}`));
    const profile = buildTasteProfile([], { ...legacyPreferences, ...soft, seedTitles: seeds }, null, NOW);
    return rank(profile, items.filter((item) => !seedKeys.has(item.key)));
  };

  const rich = (extra: Record<string, unknown>) => {
    const liked = items.filter((item) => relevantKeys.has(item.key)).slice(0, 40);
    const likedKeys = new Set(liked.map((item) => item.key));
    const candidates = items.filter((item) => !likedKeys.has(item.key));
    const seeds = relevantSeeds(candidates, relevantKeys, 3);
    const preferences = extra.withNew
      ? { ...legacyPreferences, ...soft, seedTitles: seeds }
      : legacyPreferences;
    return rank(buildTasteProfile(eventsFromItems(liked), preferences, null, NOW), candidates);
  };

  return {
    legacyThin: rank(buildTasteProfile([], legacyPreferences, null, NOW)),
    softOnly: rank(buildTasteProfile([], { ...legacyPreferences, ...soft }, null, NOW)),
    threeSeeds: withSeeds(3),
    tenSeeds: withSeeds(10),
    richLegacy: rich({}),
    richWithNew: rich({ withNew: true }),
  };
}

describe("cold-start accuracy (synthetic catalogue; proves the mechanism, not live TMDB accuracy)", () => {
  const indifferent = buildCatalogue();
  const qualityAware = buildCatalogue({ qualityAware: true });
  const base = measure(indifferent);
  const aware = measure(qualityAware);

  it("catalogue has enough relevant titles and decoys to be meaningful", () => {
    expect(indifferent.relevantKeys.size).toBeGreaterThanOrEqual(40);
    expect(indifferent.items.length).toBeGreaterThanOrEqual(880);
    expect(qualityAware.relevantKeys.size).toBeGreaterThanOrEqual(40);
  });

  it("beats the pre-upgrade baseline by at least 0.10 precision@10 with 3 seeds and soft picks", () => {
    expect(base.threeSeeds).toBeGreaterThanOrEqual(LEGACY_BASELINE.indifferent.thin + 0.1);
    expect(aware.threeSeeds).toBeGreaterThanOrEqual(LEGACY_BASELINE.qualityAware.thin + 0.1);
  });

  it("improves on the pre-upgrade baseline with only soft picks and no seeds", () => {
    expect(base.softOnly).toBeGreaterThan(LEGACY_BASELINE.indifferent.thin);
    expect(aware.softOnly).toBeGreaterThan(LEGACY_BASELINE.qualityAware.thin);
  });

  it("does not get worse with 10 seeds than with 3", () => {
    expect(base.tenSeeds).toBeGreaterThanOrEqual(base.threeSeeds - 0.02);
    expect(aware.tenSeeds).toBeGreaterThanOrEqual(aware.threeSeeds - 0.02);
  });

  it("does not hurt a viewer who dislikes low-vote titles when only legacy inputs are given", () => {
    expect(aware.legacyThin).toBeGreaterThanOrEqual(LEGACY_BASELINE.qualityAware.thin);
  });

  it("does not regress a rich-history viewer when seeds and soft picks are added", () => {
    expect(base.richWithNew).toBeGreaterThanOrEqual(base.richLegacy - 0.02);
    expect(aware.richWithNew).toBeGreaterThanOrEqual(aware.richLegacy - 0.02);
  });

  it("keeps disliked-genre decoys out of a thin viewer's top 10", () => {
    const profile = buildTasteProfile([], { ...legacyPreferences, ...soft }, null, NOW);
    const top = rankCandidatesForTaste(indifferent.items, profile, [], { exploration: "familiar" }).slice(0, 10);
    expect(top.filter(({ item }) => item.genreIds.includes(DISLIKED_GENRE))).toHaveLength(0);
  });
});
