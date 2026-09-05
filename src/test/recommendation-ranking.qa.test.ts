import { describe, expect, it, vi } from "vitest";
import { buildTasteProfile, type TasteTitleEvent } from "@/shared/lib/recommendation/taste";
import { normalizeTmdbItem, type UnifiedContentItem } from "@/shared/lib/recommendation";
import { rankCandidatesForTaste } from "@/backend/api/_handlers/user/recommendations-v2";

vi.mock("@/backend/api/lib/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/backend/api/lib/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/backend/services/tmdbServer", () => ({ discoverServerMovies: vi.fn(), discoverServerTVShows: vi.fn() }));

const NOW = "2026-09-05T12:00:00Z";
function candidate(value: Parameters<typeof normalizeTmdbItem>[0]): UnifiedContentItem {
  const item = normalizeTmdbItem(value, { typeHint: "movie" });
  if (!item) throw new Error("QA candidate fixture must normalize");
  return item;
}
const candidates = [
  candidate({ id: 101, title: "Action candidate", genre_ids: [28], original_language: "en", vote_average: 7, vote_count: 500, popularity: 50 }),
  candidate({ id: 102, title: "Drama candidate", genre_ids: [18], original_language: "ko", vote_average: 7, vote_count: 500, popularity: 50 }),
];
// Keep the same upstream order for every account. Taste must affect the winner,
// even when the metadata engine gives the first title a small initial lead.
const upstream = candidates.map((item, index) => ({ item, score: 0.5 - index * 0.005, reasons: [], seedTitle: null }));
const event = (genre: number, language: string, signal: TasteTitleEvent["signal"] = "liked", occurredAt = "2026-09-04T12:00:00Z"): TasteTitleEvent => ({
  contentId: 999, contentType: "movie", title: "Previously encountered title", genres: [genre], language, signal, occurredAt,
});

describe("dynamic ranking winner QA", () => {
  it("changes the winner for different explicit tastes over the identical candidate pool", () => {
    const action = buildTasteProfile([], { preferredGenres: [28], preferredLanguages: ["en"] }, null, NOW);
    const drama = buildTasteProfile([], { preferredGenres: [18], preferredLanguages: ["ko"] }, null, NOW);
    expect(rankCandidatesForTaste(candidates, action, upstream)[0].item.id).toBe(101);
    expect(rankCandidatesForTaste(candidates, drama, upstream)[0].item.id).toBe(102);
  });

  it("learns different winners from activity without any explicitly selected preference", () => {
    const action = buildTasteProfile([event(28, "en")], {}, null, NOW);
    const drama = buildTasteProfile([event(18, "ko")], {}, null, NOW);
    expect(rankCandidatesForTaste(candidates, action, upstream)[0].item.id).toBe(101);
    expect(rankCandidatesForTaste(candidates, drama, upstream)[0].item.id).toBe(102);
  });

  it("changes the winner after a newer skip supersedes the earlier positive signal", () => {
    const liked = event(28, "en", "liked", "2026-09-01T12:00:00Z");
    const before = buildTasteProfile([liked], {}, null, NOW);
    const after = buildTasteProfile([liked, event(28, "en", "skip")], {}, null, NOW);
    expect(rankCandidatesForTaste(candidates, before, upstream)[0].item.id).toBe(101);
    expect(rankCandidatesForTaste(candidates, after, upstream)[0].item.id).toBe(102);
  });
});
