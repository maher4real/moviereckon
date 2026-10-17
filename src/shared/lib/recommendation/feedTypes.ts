import type { Movie, TVShow } from "@/shared/lib/tmdb";

export type ContentType = "movie" | "tv";
export type FeedState = "ready" | "retryable" | "exhausted";

export interface FeedFilters {
  contentType: ContentType | "all";
  recommendationType: "all" | "trending" | "highrated" | "popular" | "newreleases";
  genreId: number | null;
  language: string | null;
  sort: "relevance" | "popularity" | "rating" | "release_date";
  direction: "asc" | "desc";
  exploration: "familiar" | "adventurous";
}

export interface FeedExplanation {
  reasons: Array<{ label: string; evidence?: string }>;
  score: number;
  scoreBreakdown: {
    genre: number;
    keywords: number;
    people: number;
    year: number;
    runtime: number;
    quality: number;
    popularity: number;
    novelty: number;
    diversityPenalty: number;
    preference?: number;
    negativePenalty?: number;
  };
  seedTitle: string | null;
}

export interface FeedResponse {
  items: (Movie | TVShow)[];
  explanationById: Record<string, FeedExplanation>;
  nextCursor: string | null;
  hasMore: boolean;
  state: FeedState;
  profileVersion: number;
  feedSessionId: string;
  isPersonalized: boolean;
}

