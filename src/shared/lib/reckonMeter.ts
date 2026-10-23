/**
 * Reckon Meter: the share of viewers likely to recommend a title, blended from
 * every opinion source we have. Each source is converted to a 0-1 "would
 * recommend" estimate, shrunk toward a neutral prior by its sample size (a 10
 * from two people is not a 10), then weighted by size and reliability. Pure, no
 * I/O.
 */

export type ReactionType = "must_watch" | "give_it_a_go" | "one_time_watch" | "skip" | "not_now";

export type ExternalScoreId = "rt_critics" | "rt_audience" | "metacritic" | "imdb";

export interface ExternalScore {
  id: ExternalScoreId;
  /** "share": percent positive (0-100). "average": mean out of 10. */
  kind: "share" | "average";
  value: number;
  count?: number | null;
  asOf?: string | null;
}

export interface ReckonMeterInput {
  /** TMDB audience average (0-10) and vote count. */
  audience?: { average: number | null | undefined; votes: number | null | undefined };
  /** Individual TMDB reviewer scores, 0-10. */
  reviewerRatings?: Array<number | null | undefined>;
  /** Individual MovieReckon community comment ratings, 1-10. */
  communityRatings?: Array<number | null | undefined>;
  /** MovieReckon reaction counts. "not_now" is not an opinion and is ignored. */
  reactions?: Partial<Record<ReactionType, number>> | null;
  /** Published scores from outside sources (via Wikidata). */
  external?: ExternalScore[];
}

export type MeterSourceId = "audience" | "reviewers" | "community" | "reactions" | ExternalScoreId;

export type MeterProvider = "TMDB" | "Wikidata" | "MovieReckon";

export interface MeterSource {
  id: MeterSourceId;
  label: string;
  /** Where the data comes from. */
  via: MeterProvider;
  /** Recommend share for this source, 0-100, after shrinkage. */
  score: number;
  /** People behind the number (votes, reviews, ratings or reactions). */
  count: number;
  /** Share of the blended score this source contributed, 0-1. */
  influence: number;
  /** Date the published score was recorded, for external sources. */
  asOf?: string | null;
  /** False when the sample size is unknown and a default was assumed. */
  countKnown?: boolean;
}

export type MeterConfidence = "low" | "medium" | "high";
export type MeterVerdict = "Must watch" | "Recommended" | "Worth a try" | "Mixed" | "Skip it";

export interface MeterDistribution {
  loved: number;
  liked: number;
  mixed: number;
  disliked: number;
}

export interface ReckonMeterResult {
  score: number;
  verdict: MeterVerdict;
  confidence: MeterConfidence;
  /** Total opinions behind the score. */
  opinions: number;
  /** Individual ratings disagree strongly (wide spread). */
  divisive: boolean;
  sources: MeterSource[];
  /** Individual ratings and reactions bucketed, for a split bar. */
  distribution: MeterDistribution;
}

export const METER_PRIOR = 0.6;
const PRIOR_STRENGTH = 4;
// TMDB averages hide their spread, so a huge vote count is capped to keep
// MovieReckon's own community audible.
const AUDIENCE_MAX_EFFECTIVE = 60;
const AUDIENCE_VOTES_PER_EFFECTIVE = 10;
// Published scores without a sample size are treated as this many opinions.
const EXTERNAL_DEFAULT_EFFECTIVE = 25;
const EXTERNAL_MAX_EFFECTIVE = 60;
const RELIABILITY: Record<MeterSourceId, number> = {
  audience: 1,
  reviewers: 0.9,
  community: 1.3,
  reactions: 1,
  rt_critics: 1,
  metacritic: 1,
  imdb: 1,
  // Audience scores on review sites are easier to brigade.
  rt_audience: 0.8,
};
const REACTION_VALUE: Record<Exclude<ReactionType, "not_now">, number> = {
  must_watch: 1,
  give_it_a_go: 0.8,
  one_time_watch: 0.5,
  skip: 0,
};
const LABELS: Record<MeterSourceId, string> = {
  audience: "TMDB audience",
  reviewers: "Public reviewers",
  community: "MovieReckon ratings",
  reactions: "MovieReckon reactions",
  rt_critics: "Rotten Tomatoes critics",
  rt_audience: "Rotten Tomatoes audience",
  metacritic: "Metacritic critics",
  imdb: "IMDb users",
};

const PROVIDER: Record<MeterSourceId, MeterProvider> = {
  audience: "TMDB",
  reviewers: "TMDB",
  community: "MovieReckon",
  reactions: "MovieReckon",
  rt_critics: "Wikidata",
  rt_audience: "Wikidata",
  metacritic: "Wikidata",
  imdb: "Wikidata",
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** 4/10 or lower never recommends, 8/10 or higher always does. */
export function ratingToRecommend(rating: number): number {
  return clamp01((rating - 4) / 4);
}

/** Calibrated so 8.4 average ≈ 89% and 6.0 ≈ 33% would recommend. */
export function averageToRecommend(average: number): number {
  return 1 / (1 + Math.exp(-(average - 6.6) * 1.15));
}

function shrink(sum: number, count: number): number {
  return (sum + METER_PRIOR * PRIOR_STRENGTH) / (count + PRIOR_STRENGTH);
}

function validRatings(values: Array<number | null | undefined> | undefined, min: number): number[] {
  return (values || []).filter((value): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= 10);
}

export function verdictFor(score: number): MeterVerdict {
  if (score >= 85) return "Must watch";
  if (score >= 70) return "Recommended";
  if (score >= 55) return "Worth a try";
  if (score >= 40) return "Mixed";
  return "Skip it";
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

export function computeReckonMeter(input: ReckonMeterInput): ReckonMeterResult | null {
  const raw: Array<{
    id: MeterSourceId;
    estimate: number;
    count: number;
    effective: number;
    asOf?: string | null;
    countKnown?: boolean;
  }> = [];

  const average = input.audience?.average;
  const votes = Math.max(0, Math.floor(input.audience?.votes || 0));
  if (typeof average === "number" && Number.isFinite(average) && average > 0 && votes > 0) {
    const effective = Math.min(AUDIENCE_MAX_EFFECTIVE, votes / AUDIENCE_VOTES_PER_EFFECTIVE);
    raw.push({ id: "audience", estimate: shrink(averageToRecommend(average) * effective, effective), count: votes, effective });
  }

  const reviewers = validRatings(input.reviewerRatings, 0);
  if (reviewers.length > 0) {
    const sum = reviewers.reduce((total, rating) => total + ratingToRecommend(rating), 0);
    raw.push({ id: "reviewers", estimate: shrink(sum, reviewers.length), count: reviewers.length, effective: reviewers.length });
  }

  const community = validRatings(input.communityRatings, 1);
  if (community.length > 0) {
    const sum = community.reduce((total, rating) => total + ratingToRecommend(rating), 0);
    raw.push({ id: "community", estimate: shrink(sum, community.length), count: community.length, effective: community.length });
  }

  const reactionEntries = (Object.keys(REACTION_VALUE) as Array<keyof typeof REACTION_VALUE>)
    .map((type) => [type, Math.max(0, Math.floor(input.reactions?.[type] || 0))] as const);
  const reactionCount = reactionEntries.reduce((total, [, count]) => total + count, 0);
  if (reactionCount > 0) {
    const sum = reactionEntries.reduce((total, [type, count]) => total + REACTION_VALUE[type] * count, 0);
    raw.push({ id: "reactions", estimate: shrink(sum, reactionCount), count: reactionCount, effective: reactionCount });
  }

  const seenExternal = new Set<ExternalScoreId>();
  for (const score of input.external || []) {
    if (seenExternal.has(score.id) || !Number.isFinite(score.value)) continue;
    const share = score.kind === "share"
      ? (score.value >= 0 && score.value <= 100 ? score.value / 100 : null)
      : (score.value > 0 && score.value <= 10 ? averageToRecommend(score.value) : null);
    if (share === null) continue;
    seenExternal.add(score.id);
    const count = typeof score.count === "number" && score.count > 0 ? Math.round(score.count) : null;
    // IMDb counts are user votes (huge), the others are reviews.
    const effective = count === null
      ? EXTERNAL_DEFAULT_EFFECTIVE
      : Math.min(EXTERNAL_MAX_EFFECTIVE, score.id === "imdb" ? count / AUDIENCE_VOTES_PER_EFFECTIVE : count);
    raw.push({
      id: score.id,
      estimate: shrink(share * effective, effective),
      count: count ?? 0,
      effective,
      asOf: score.asOf ?? null,
      countKnown: count !== null,
    });
  }

  if (raw.length === 0) return null;

  const weights = raw.map((source) => RELIABILITY[source.id] * source.effective);
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  const blended = raw.reduce((total, source, index) => total + source.estimate * weights[index]!, 0) / totalWeight;
  const score = Math.round(blended * 100);

  const effectiveTotal = raw.reduce((total, source) => total + source.effective, 0);
  const confidence: MeterConfidence = effectiveTotal >= 80 ? "high" : effectiveTotal >= 20 ? "medium" : "low";

  const individual = [...reviewers, ...community];
  const divisive = individual.length >= 6 && standardDeviation(individual) >= 2.6;

  const distribution: MeterDistribution = { loved: 0, liked: 0, mixed: 0, disliked: 0 };
  for (const rating of individual) {
    if (rating >= 8) distribution.loved += 1;
    else if (rating >= 6) distribution.liked += 1;
    else if (rating >= 4) distribution.mixed += 1;
    else distribution.disliked += 1;
  }
  const reactions = Object.fromEntries(reactionEntries) as Record<keyof typeof REACTION_VALUE, number>;
  distribution.loved += reactions.must_watch;
  distribution.liked += reactions.give_it_a_go;
  distribution.mixed += reactions.one_time_watch;
  distribution.disliked += reactions.skip;

  return {
    score,
    verdict: verdictFor(score),
    confidence,
    opinions: raw.reduce((total, source) => total + source.count, 0),
    divisive,
    sources: raw.map((source, index) => ({
      id: source.id,
      label: LABELS[source.id],
      via: PROVIDER[source.id],
      score: Math.round(source.estimate * 100),
      count: source.count,
      influence: weights[index]! / totalWeight,
      ...(source.asOf !== undefined ? { asOf: source.asOf } : {}),
      ...(source.countKnown !== undefined ? { countKnown: source.countKnown } : {}),
    })),
    distribution,
  };
}
