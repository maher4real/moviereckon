/** Part of the frontend API client; re-exported from `@/frontend/lib/mongodbClient`. */
import type { Era, Mood, Pace, SeedTitle } from "@/shared/lib/recommendation/preferences";
import type { Movie, TVShow } from "@/shared/lib/tmdb";

// Types
export interface MongoUser {
  id: string;
  email: string;
  username: string;
  role: "user" | "moderator" | "admin";
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  emailVerified: boolean;
}

export interface AuthResponse {
  user: MongoUser;
  // Cookie-based sessions do not return raw tokens in the response body.
  // Legacy fallback fields (disabled by backend):
  // accessToken: string;
  // refreshToken: string;
}

export type AuthErrorCode = "email_not_verified" | null;

export interface WatchedItem {
  id: string;
  user_id: string;
  content_id: number;
  content_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  genres: number[];
  language: string;
  watched_at: string;
}

export interface LikedItem {
  id: string;
  user_id: string;
  content_id: number;
  content_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  genres?: number[];
  language?: string;
  liked_at: string;
}

export interface WatchlistItem {
  id: string;
  user_id: string;
  content_id: number;
  content_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  genres?: number[];
  language?: string;
  added_at: string;
  position: number;
  watched: boolean;
  /** New explicit library state; optional for legacy cached/watchlist rows. */
  status?: WatchlistStatus;
}

export type WatchlistStatus = "saved" | "watching" | "completed" | "dropped";

export interface PersonalDataExport {
  schema_version: 1;
  exported_at: string;
  profile: Record<string, unknown>;
  data: Record<string, unknown[]>;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  preferred_languages: string[];
  preferred_genres: number[];
  inferred_languages?: string[];
  inferred_genres?: number[];
  disliked_genres?: number[];
  seed_titles?: SeedTitle[];
  moods?: Mood[];
  pace?: Pace | null;
  eras?: Era[];
  /** Set once taste onboarding is saved or skipped; null while pending. */
  onboarding_completed_at?: string | null;
}

export type FeedbackType = "give_it_a_go" | "one_time_watch" | "must_watch" | "skip" | "not_now";

export interface FeedbackItem {
  id: string;
  user_id: string;
  content_id: number;
  content_type: "movie" | "tv";
  feedback_type: FeedbackType;
  title: string;
  poster_path: string | null;
  genres: number[];
  language: string;
  created_at: string;
  updated_at: string;
  suppress_until?: string | null;
}

export interface FeedbackMutationResult {
  ok: boolean;
  action: "added" | "updated" | "removed";
  data: FeedbackItem | null;
}

export interface FeedbackSummary {
  counts: Record<FeedbackType, number>;
  user_feedback: FeedbackType | null;
}

export interface RecommendationExplanation {
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
  };
  seedTitle: string | null;
  /** Shared by titles of one franchise; Pick Tonight shows one per franchise. */
  franchiseKey?: string;
}

export interface PersonalizedRecommendationsPayload {
  items: (Movie | TVShow)[];
  isPersonalized: boolean;
  explanationById: Record<string, RecommendationExplanation>;
}

export interface RecommendationFeedOptions {
  variant?: string;
  mode?: "feed" | "more-like-this";
  seedKeys?: string[];
  excludedKeys?: string[];
  genre?: string;
  language?: string;
  contentType?: "all" | "movie" | "tv";
  recommendationType?: "all" | "trending" | "highrated" | "popular" | "newreleases";
  sort?: "relevance" | "popularity" | "rating" | "release_date";
  exploration?: TasteExplorationMode;
  limit?: number;
}

export interface RecommendationFeedPage {
  items: (Movie | TVShow)[];
  explanationById: Record<string, RecommendationExplanation>;
  nextCursor: string | null;
  hasMore: boolean;
  state: "ready" | "retryable" | "exhausted";
  profileVersion: number;
  feedSessionId: string;
  isPersonalized: boolean;
}

export class RecommendationFeedError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, details: { status?: number; code?: string } = {}) {
    super(message);
    this.name = "RecommendationFeedError";
    this.status = details.status;
    this.code = details.code;
  }
}

export interface RecommendationTasteProfile {
  version: number;
  updatedAt: string;
  explicit: { genres: number[]; languages: string[] };
  learned?: { genres: Record<string, number>; languages: Record<string, number> };
  inferred: { genres: Record<string, number>; languages: Record<string, number> };
  negative?: { genres: Record<string, number>; languages: Record<string, number> };
  clusters: Array<{
    id: string;
    contentType: "movie" | "tv" | "mixed";
    genreIds: number[];
    weight: number;
    evidence: Array<{ key: string; title: string; contentType: "movie" | "tv"; signal: string; weight: number }>;
  }>;
  evidence?: Array<{
    key: string;
    title: string;
    contentType: "movie" | "tv";
    signal: string;
    weight: number;
    genreIds?: number[];
    language?: string;
  }>;
  excludedEvidence?: Array<{
    key: string;
    title: string;
    contentType: "movie" | "tv";
    signal: string;
    genreIds?: number[];
    language?: string;
    occurredAt?: string;
  }>;
}

export type TasteExplorationMode = "familiar" | "adventurous";

export interface RecommendationTasteControls {
  explorationMode: TasteExplorationMode;
  resetAt: string | null;
  excludedLearningKeys: string[];
  revision: number;
}

export interface RecommendationTasteSnapshot {
  profile: RecommendationTasteProfile;
  controls: RecommendationTasteControls;
}

export interface CommentItem {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  content_id: number;
  content_type: "movie" | "tv";
  text: string;
  rating: number | null;
  created_at: string;
  updated_at: string;
}

export interface RegistrationAvailability {
  email_exists: boolean;
  username_exists: boolean;
}

export interface GoogleOneTapConfig {
  enabled: boolean;
  client_id: string | null;
  nonce: string | null;
}

// ========== Auth API ==========

export interface AIRecommendationsPayload {
  items: import("@/shared/lib/tmdb").Movie[] | import("@/shared/lib/tmdb").TVShow[];
  explanationById: Record<string, { label: string; text: string }>;
  isAIRanked: true;
}
