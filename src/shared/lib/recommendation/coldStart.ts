import type { Era, Mood, Pace } from "./preferences";

export const CONFIDENCE_EVIDENCE_TARGET = 12;
export const COLD_START_BOOST = 0.8;
export const MOOD_GENRE_BOOST = 0.8;
export const MOOD_GENRE_CAP = 1.6;
export const RATING_PRIOR_VOTES = 300;
export const RATING_PRIOR_MEAN = 6.5;

export const MOOD_GENRES: Record<Mood, number[]> = {
  feel_good: [35, 10751, 10749, 16],
  dark: [80, 53, 27, 9648],
  mind_bending: [878, 9648, 53, 14],
  emotional: [18, 10749, 10402],
  funny: [35, 16],
  intense: [28, 53, 10752, 80],
};

export const MOOD_LABELS: Record<Mood, string> = {
  feel_good: "feel-good",
  dark: "dark",
  mind_bending: "mind-bending",
  emotional: "emotional",
  funny: "funny",
  intense: "intense",
};

export const ERA_LABELS: Record<Era, string> = {
  classics: "classics",
  nineties_2000s: "1990s and 2000s",
  modern: "2010s",
  new: "2020s",
};

const ERA_RANGES: Record<Era, [number, number]> = {
  classics: [0, 1989],
  nineties_2000s: [1990, 2009],
  modern: [2010, 2019],
  new: [2020, 9999],
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function buildMoodGenreBoost(moods: Mood[]): Record<string, number> {
  const boost: Record<string, number> = {};
  for (const mood of moods) {
    for (const genreId of MOOD_GENRES[mood] ?? []) {
      const key = String(genreId);
      boost[key] = Math.min(MOOD_GENRE_CAP, (boost[key] || 0) + MOOD_GENRE_BOOST);
    }
  }
  return boost;
}

export function activityEvidenceCount(profile: { evidence: Array<{ signal: string }> }): number {
  return profile.evidence.filter((entry) => entry.signal !== "seed").length;
}

export function tasteConfidence(profile: { evidence: Array<{ signal: string }> }): number {
  return Math.min(1, activityEvidenceCount(profile) / CONFIDENCE_EVIDENCE_TARGET);
}

export function preferenceMultiplier(profile: { evidence: Array<{ signal: string }> }): number {
  return 1 + (1 - tasteConfidence(profile)) * COLD_START_BOOST;
}

export function matchedEra(year: number | null, eras: Era[] | undefined): Era | null {
  if (year === null || !Number.isFinite(year) || !eras?.length) return null;
  return eras.find((era) => {
    const range = ERA_RANGES[era];
    return Boolean(range) && year >= range[0] && year <= range[1];
  }) ?? null;
}

export function smoothedRating(voteAverage: number, voteCount: number): number {
  const votes = Math.max(0, voteCount);
  return (votes / (votes + RATING_PRIOR_VOTES)) * voteAverage +
    (RATING_PRIOR_VOTES / (votes + RATING_PRIOR_VOTES)) * RATING_PRIOR_MEAN;
}

export function coldStartQuality(
  item: { voteAverage: number; voteCount: number },
  confidence: number,
): number {
  const raw = clamp01(item.voteAverage / 10);
  const smoothed = clamp01(smoothedRating(item.voteAverage, item.voteCount) / 10);
  const weight = clamp01(confidence);
  return clamp01(weight * raw + (1 - weight) * smoothed);
}

export function paceScore(pace: Pace | null | undefined, runtime: number | null): number {
  if (!pace || runtime === null || !Number.isFinite(runtime)) return 0;
  if (pace === "slow_burn") return runtime >= 110 ? 1 : 0;
  if (pace === "fast") return runtime <= 100 ? 1 : 0;
  return 0;
}

export function moodGenreSum(
  boost: Record<string, number> | undefined,
  genreIds: number[],
): number {
  if (!boost) return 0;
  return genreIds.reduce((total, genreId) => total + (boost[String(genreId)] || 0), 0);
}

export function strongestMood(moods: Mood[] | undefined, genreIds: number[]): Mood | null {
  let best: Mood | null = null;
  let bestScore = 0;
  for (const mood of moods ?? []) {
    const genres = MOOD_GENRES[mood] ?? [];
    const score = genreIds.filter((genreId) => genres.includes(genreId)).length;
    if (score > bestScore) {
      best = mood;
      bestScore = score;
    }
  }
  return best;
}

export function pickSeedsForPage<T>(seeds: T[] | undefined, page: number, max = 3): T[] {
  if (!seeds?.length) return [];
  const count = Math.min(max, seeds.length);
  const start = ((Math.max(1, Math.floor(page)) - 1) * count) % seeds.length;
  return Array.from({ length: count }, (_, offset) => seeds[(start + offset) % seeds.length]);
}

export function discoverExclusions(
  profile: { explicit: { dislikedGenres?: number[] } },
  filterGenreId: number | null,
): string | undefined {
  const disliked = (profile.explicit.dislikedGenres ?? []).filter((genreId) => genreId !== filterGenreId);
  return disliked.length > 0 ? disliked.join("|") : undefined;
}
