export type ContentType = "movie" | "tv";

export interface RecommendationReason {
  label: string;
  evidence?: string;
}

export interface ScoreBreakdown {
  genre: number;
  keywords: number;
  people: number;
  year: number;
  runtime: number;
  quality: number;
  popularity: number;
  novelty: number;
  diversityPenalty: number;
}

export interface UnifiedKeyword {
  id?: number;
  name: string;
}

export interface UnifiedPerson {
  id: number;
  name?: string;
  role?: string;
  order?: number;
}

export interface UnifiedContentItem {
  type: ContentType;
  id: number;
  key: string;
  title: string;
  overview: string;
  originalTitle?: string;
  genreIds: number[];
  releaseDate?: string;
  year: number | null;
  voteAverage: number;
  voteCount: number;
  popularity: number;
  runtime: number | null;
  keywords: UnifiedKeyword[];
  keywordTokens: string[];
  cast: UnifiedPerson[];
  directors: UnifiedPerson[];
  creators: UnifiedPerson[];
  leadActors: UnifiedPerson[];
  peopleIds: number[];
  primaryGenreId: number | null;
  collectionId: number | null;
  originalLanguage?: string;
  sourceTags: string[];
  raw?: unknown;
}

export interface RecommendationWeights {
  genre: number;
  keywords: number;
  people: number;
  year: number;
  runtime: number;
  quality: number;
  popularity: number;
  noveltyBoost: number;
}

export interface RecommendationUserContext {
  seenIds?: Iterable<string>;
  displayedIds?: Iterable<string>;
  seedWeights?: Record<string, number>;
  preferredLanguages?: string[];
  dominantLanguage?: string | null;
  popularityCap?: number;
  popularityMedian?: number;
  maxCandidates?: number;
  diversificationTopN?: number;
  debug?: boolean;
}

export interface ScoreCandidateResult {
  score: number;
  reasons: RecommendationReason[];
  scoreBreakdown: ScoreBreakdown;
}

export interface RankedRecommendation extends ScoreCandidateResult {
  item: UnifiedContentItem;
  seedKey: string | null;
  seedTitle: string | null;
  isHiddenGem: boolean;
  sourceTags: string[];
}

export interface CandidateSourceInput {
  source: string;
  items: unknown[] | undefined | null;
  typeHint?: ContentType;
}

export interface CandidateUnionResult {
  items: UnifiedContentItem[];
  popularityMedian: number;
}

export const DEFAULT_RECOMMENDATION_WEIGHTS: RecommendationWeights = {
  genre: 0.30,
  keywords: 0.25,
  people: 0.15,
  year: 0.07,
  runtime: 0.05,
  quality: 0.10,
  popularity: 0.08,
  noveltyBoost: 0.05,
};

export const DEFAULT_MAX_CANDIDATES = 500;
export const DEFAULT_DIVERSIFICATION_TOP_N = 120;
