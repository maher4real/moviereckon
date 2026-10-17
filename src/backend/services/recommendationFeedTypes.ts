import type { connectToDatabase } from "@/backend/api/lib/mongodb";
import type { Movie, TVShow } from "@/shared/lib/tmdb";
import type { UnifiedContentItem } from "@/shared/lib/recommendation";
import type { ContentType, FeedExplanation, FeedFilters, FeedState } from "@/shared/lib/recommendation/feedTypes";

export type Database = Awaited<ReturnType<typeof connectToDatabase>>["db"];


export interface CursorPayload {
  sessionId: string;
  page: number;
  pageSize: number;
  filtersHash: string;
  issuedAt: number;
}

export interface SessionDoc {
  session_id: string;
  user_id: string;
  filters_hash: string;
  filters: FeedFilters;
  page_size: number;
  profile_version: number;
  ranking_version: string;
  next_page: number;
  source_state?: SourceState;
  candidate_buffer?: UnifiedContentItem[];
  generation_page?: number | null;
  generation_lease?: string | null;
  generation_lease_expires_at?: Date | null;
  revision?: number;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface BatchDoc {
  session_id: string;
  user_id?: string;
  page: number;
  profile_version: number;
  items: (Movie | TVShow)[];
  explanation_by_id: Record<string, FeedExplanation>;
  next_cursor: string | null;
  has_more: boolean;
  state: FeedState;
  source_state_after?: SourceState;
  candidate_buffer_after?: UnifiedContentItem[];
  expires_at: Date;
  created_at: Date;
  is_personalized?: boolean;
}

export interface SourceState {
  movieTastePage: number;
  movieExplorePage: number;
  movieTasteTotalPages: number | null;
  movieExploreTotalPages: number | null;
  tvTastePage: number;
  tvExplorePage: number;
  tvTasteTotalPages: number | null;
  tvExploreTotalPages: number | null;
  movieTasteInterests?: TasteInterestState[];
  tvTasteInterests?: TasteInterestState[];
}

export interface TasteInterestState {
  key: string;
  genreId?: number;
  language?: string;
  page: number;
  totalPages: number | null;
}

export interface SourceResult {
  stream: SourceStream;
  type: ContentType;
  profileSource: boolean;
  interestKey?: string;
  page: number;
  totalPages: number | null;
  results: unknown[];
  failed: boolean;
}

export type SourceStream = "movieTaste" | "movieExplore" | "tvTaste" | "tvExplore";

