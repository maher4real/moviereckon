import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTasteProfile,
  getTasteGenreWeight,
  getTasteLanguageWeight,
  type TasteTitleEvent,
} from "@/shared/lib/recommendation/taste";
import { getContentKey } from "@/shared/lib/recommendation";

const NOW = "2026-09-05T12:00:00.000Z";
const event = (overrides: Partial<TasteTitleEvent> = {}): TasteTitleEvent => ({
  contentId: 41,
  contentType: "movie",
  title: "Synthetic title",
  genres: [28],
  language: "en",
  occurredAt: "2026-09-04T12:00:00.000Z",
  signal: "liked",
  ...overrides,
});

afterEach(() => vi.useRealTimers());

describe("independent taste behavior QA", () => {
  it("derives different interests from each user's preferences and activity", () => {
    const actionViewer = buildTasteProfile([event()], {
      preferredGenres: [28], preferredLanguages: ["en"],
    }, null, NOW);
    const dramaViewer = buildTasteProfile([event({ genres: [18], language: "ko" })], {
      preferredGenres: [18], preferredLanguages: ["ko"],
    }, null, NOW);

    expect(getTasteGenreWeight(actionViewer, 28)).toBeGreaterThan(getTasteGenreWeight(actionViewer, 18));
    expect(getTasteGenreWeight(dramaViewer, 18)).toBeGreaterThan(getTasteGenreWeight(dramaViewer, 28));
    expect(getTasteLanguageWeight(actionViewer, "en")).toBeGreaterThan(getTasteLanguageWeight(actionViewer, "ko"));
    expect(getTasteLanguageWeight(dramaViewer, "ko")).toBeGreaterThan(getTasteLanguageWeight(dramaViewer, "en"));
    expect(actionViewer.sourceFingerprint).not.toBe(dramaViewer.sourceFingerprint);
  });

  it("does not invent interests for a cold-start user", () => {
    const profile = buildTasteProfile([], {}, null, NOW);
    expect(profile.evidence).toEqual([]);
    expect(profile.clusters).toEqual([]);
    expect(profile.inferred).toEqual({ genres: {}, languages: {} });
  });

  it("treats watched history as neutral instead of an endorsement", () => {
    const empty = buildTasteProfile([], {}, null, NOW);
    const watched = buildTasteProfile([event({ signal: "watched" })], {}, null, NOW);
    expect(watched.inferred).toEqual(empty.inferred);
    expect(watched.negative).toEqual(empty.negative);
    expect(watched.evidence).toEqual([]);
    expect(watched.clusters).toEqual([]);
  });

  it("counts one title's save, watch and like only as its strongest positive evidence", () => {
    const liked = buildTasteProfile([event()], {}, null, NOW);
    const combined = buildTasteProfile([
      event({ signal: "watchlist" }), event({ signal: "watched" }), event(), event(),
    ], {}, null, NOW);
    expect(combined.inferred).toEqual(liked.inferred);
    expect(combined.evidence).toEqual(liked.evidence);
    expect(combined.clusters).toEqual(liked.clusters);
  });

  it("honors a later rejection even when activity arrives in a different order", () => {
    const liked = event({ occurredAt: "2026-09-01T00:00:00.000Z" });
    const rejected = event({ signal: "skip", occurredAt: "2026-09-04T00:00:00.000Z" });
    for (const events of [[liked, rejected], [rejected, liked]]) {
      const profile = buildTasteProfile(events, {}, null, NOW);
      expect(profile.evidence).toEqual([]);
      expect(getTasteGenreWeight(profile, 28)).toBe(0);
      expect(profile.negative.genres["28"]).toBeGreaterThan(0);
    }
  });

  it("allows a newer explicit like to replace an older rejection", () => {
    const rejected = event({ signal: "skip", occurredAt: "2026-09-01T00:00:00.000Z" });
    const liked = event({ occurredAt: "2026-09-04T00:00:00.000Z" });
    const profile = buildTasteProfile([liked, rejected], {}, null, NOW);
    expect(profile.evidence).toHaveLength(1);
    expect(profile.evidence[0].signal).toBe("liked");
    expect(profile.negative.genres["28"] || 0).toBe(0);
  });

  it("keeps movie and TV titles with identical numeric IDs independent", () => {
    const profile = buildTasteProfile([
      event(), event({ contentType: "tv", genres: [18], language: "ko" }),
    ], {}, null, NOW);
    expect(profile.evidence.map(item => item.key).sort()).toEqual([
      getContentKey("movie", 41), getContentKey("tv", 41),
    ].sort());
    expect(getTasteGenreWeight(profile, 28)).toBeGreaterThan(0);
    expect(getTasteGenreWeight(profile, 18)).toBeGreaterThan(0);
  });

  it("uses injected time for reproducible recency independent of the wall clock", () => {
    const oldEvent = event({ occurredAt: "2026-07-01T00:00:00.000Z" });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const futureClock = buildTasteProfile([oldEvent], {}, null, NOW);
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    const pastClock = buildTasteProfile([oldEvent], {}, null, NOW);
    expect(futureClock).toEqual(pastClock);
    const recentEvaluation = buildTasteProfile([oldEvent], {}, null, "2026-07-02T00:00:00.000Z");
    expect(getTasteGenreWeight(recentEvaluation, 28)).toBeGreaterThan(getTasteGenreWeight(futureClock, 28));
  });

  it("versions preference reordering when that changes affinity priority", () => {
    const first = buildTasteProfile([], {
      preferredGenres: [28, 18], preferredLanguages: ["en", "ko"],
    }, null, NOW);
    const reordered = buildTasteProfile([], {
      preferredGenres: [18, 28], preferredLanguages: ["ko", "en"],
    }, first, NOW);
    expect(reordered.inferred).not.toEqual(first.inferred);
    expect(reordered.sourceFingerprint).not.toBe(first.sourceFingerprint);
    expect(reordered.version).toBeGreaterThan(first.version);
    const unchanged = buildTasteProfile([], {
      preferredGenres: [18, 28], preferredLanguages: ["ko", "en"],
    }, reordered, NOW);
    expect(unchanged.version).toBe(reordered.version);
  });

  it("makes activity ordering irrelevant, including repeated likes at different times", () => {
    const older = event({ occurredAt: "2026-01-01T00:00:00.000Z" });
    const newer = event({ occurredAt: "2026-09-04T00:00:00.000Z" });
    const first = buildTasteProfile([older, newer], {}, null, NOW);
    const reversed = buildTasteProfile([newer, older], {}, null, NOW);
    const latestOnly = buildTasteProfile([newer], {}, null, NOW);
    expect(first.sourceFingerprint).toBe(reversed.sourceFingerprint);
    expect(first.inferred).toEqual(reversed.inferred);
    expect(first.inferred).toEqual(latestOnly.inferred);
  });

  it("does not version semantically identical normalized language preferences", () => {
    const first = buildTasteProfile([], { preferredLanguages: ["en", "ko"] }, null, NOW);
    const duplicate = buildTasteProfile([], { preferredLanguages: [" EN ", "ko", "en"] }, first, NOW);
    expect(duplicate.explicit).toEqual(first.explicit);
    expect(duplicate.inferred).toEqual(first.inferred);
    expect(duplicate.sourceFingerprint).toBe(first.sourceFingerprint);
    expect(duplicate.version).toBe(first.version);
  });
});
