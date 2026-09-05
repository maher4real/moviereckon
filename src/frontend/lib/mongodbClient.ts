/**
 * MongoDB Backend API Client
 * Uses MongoDB backend exclusively - no fallback to other services
 */
import { getPublicMongoApiUrl } from "@/shared/lib/runtimeEnv";
import type { Movie, TVShow } from "@/shared/lib/tmdb";

// User cache key (non-sensitive profile data only).
const USER_KEY = "moviereckon_user";
// Legacy token storage keys (disabled for security):
// const ACCESS_TOKEN_KEY = "moviereckon_access_token";
// const REFRESH_TOKEN_KEY = "moviereckon_refresh_token";

// Backend URL - relative path for same-origin requests on Vercel
// In production, API routes are at /api/* on the same domain
const getApiUrl = () => {
  // If NEXT_PUBLIC_MONGODB_API_URL is set, use it (for cross-origin development)
  const configuredUrl = getPublicMongoApiUrl();
  if (configuredUrl && configuredUrl.length > 0) {
    return configuredUrl;
  }
  // In production on Vercel, use relative paths
  return "";
};

const MONGODB_API_URL = getApiUrl();

// Always return true since MongoDB is the only backend
export const isMongoDBConfigured = (): boolean => true;

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

// Deduplication: only one refresh call in-flight at a time
let refreshPromise: Promise<boolean> | null = null;

// Helper for making authenticated requests with HttpOnly cookie sessions.
async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  const method = (options.method || "GET").toUpperCase();

  if (
    method !== "GET" &&
    method !== "HEAD" &&
    method !== "OPTIONS" &&
    !headers.has("X-Requested-With")
  ) {
    headers.set("X-Requested-With", "XMLHttpRequest");
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${MONGODB_API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });

  // Handle access-cookie refresh if unauthorized — deduplicated
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return fetch(`${MONGODB_API_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: "include",
      });
    }
  }

  return response;
}

// Token management
export function getAccessToken(): string | null {
  // Legacy fallback (disabled for security):
  // return localStorage.getItem(ACCESS_TOKEN_KEY);
  return null;
}

export function getRefreshToken(): string | null {
  // Legacy fallback (disabled for security):
  // return localStorage.getItem(REFRESH_TOKEN_KEY);
  return null;
}

export function setTokens(accessToken: string, refreshToken: string): void {
  void accessToken;
  void refreshToken;
  // Legacy fallback (disabled for security):
  // localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  // localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  const storage = getBrowserStorage();
  storage?.removeItem(USER_KEY);
  // Legacy fallback (disabled for security):
  // localStorage.removeItem(ACCESS_TOKEN_KEY);
  // localStorage.removeItem(REFRESH_TOKEN_KEY);
  // localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): MongoUser | null {
  const storage = getBrowserStorage();
  const stored = storage?.getItem(USER_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function setStoredUser(user: MongoUser): void {
  const storage = getBrowserStorage();
  storage?.setItem(USER_KEY, JSON.stringify(user));
}

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

export async function register(
  email: string,
  password: string,
  username: string,
  captchaToken: string,
): Promise<{
  user: MongoUser | null;
  error: string | null;
  requiresEmailVerification: boolean;
}> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        email,
        password,
        username,
        captcha_token: captchaToken,
      }),
      credentials: "include",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        user: null,
        error:
          typeof data.error === "string"
            ? data.error
            : response.status >= 500
              ? "Registration failed. Please try again."
              : "Registration failed",
        requiresEmailVerification: false,
      };
    }

    const requiresEmailVerification = data.requires_email_verification === true;
    const registeredUser = data.user ?? null;

    if (registeredUser && !requiresEmailVerification) {
      // Legacy fallback (disabled for security):
      // setTokens(data.accessToken, data.refreshToken);
      setStoredUser(registeredUser);
    }

    return {
      user: registeredUser,
      error: null,
      requiresEmailVerification,
    };
  } catch (error) {
    console.error("Registration error:", error);
    return {
      user: null,
      error: "Network error. Backend may be unavailable.",
      requiresEmailVerification: false,
    };
  }
}

export async function login(
  email: string,
  password: string,
  captchaToken: string,
): Promise<{
  user: MongoUser | null;
  error: string | null;
  code: AuthErrorCode;
}> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        email,
        password,
        captcha_token: captchaToken,
      }),
      credentials: "include",
    });

    const data = await response.json();
    const errorCode = data.code === "email_not_verified" ? "email_not_verified" : null;

    if (!response.ok) {
      return {
        user: null,
        error: data.error || "Login failed",
        code: errorCode,
      };
    }

    // Legacy fallback (disabled for security):
    // setTokens(data.accessToken, data.refreshToken);
    setStoredUser(data.user);

    return { user: data.user, error: null, code: null };
  } catch (error) {
    console.error("Login error:", error);
    return {
      user: null,
      error: "Network error. Backend may be unavailable.",
      code: null,
    };
  }
}

export async function resendVerificationEmail(email: string): Promise<{
  error: string | null;
  message: string | null;
}> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/resend-verification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ email }),
      credentials: "include",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        error:
          typeof data.error === "string"
            ? data.error
            : response.status >= 500
              ? "Unable to resend verification email right now."
              : "Unable to resend verification email.",
        message: null,
      };
    }

    return {
      error: null,
      message:
        typeof data.message === "string"
          ? data.message
          : "If the account exists and still needs verification, we sent a fresh verification email.",
    };
  } catch (error) {
    console.error("Resend verification error:", error);
    return {
      error: "Network error. Backend may be unavailable.",
      message: null,
    };
  }
}

export async function requestPasswordReset(
  email: string,
  captchaToken: string,
): Promise<{
  error: string | null;
  message: string | null;
}> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        email,
        captcha_token: captchaToken,
      }),
      credentials: "include",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        error:
          typeof data.error === "string"
            ? data.error
            : response.status >= 500
              ? "Unable to send reset email right now."
              : "Unable to send reset email.",
        message: null,
      };
    }

    return {
      error: null,
      message:
        typeof data.message === "string"
          ? data.message
          : "If an account exists for that email, we sent password reset instructions.",
    };
  } catch (error) {
    console.error("Forgot password error:", error);
    return {
      error: "Network error. Backend may be unavailable.",
      message: null,
    };
  }
}

export async function verifyEmail(
  email: string,
  token: string,
): Promise<{
  error: string | null;
  message: string | null;
  alreadyVerified: boolean;
}> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/verify-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ email, token }),
      credentials: "include",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        error:
          typeof data.error === "string"
            ? data.error
            : "Unable to verify this email link.",
        message: null,
        alreadyVerified: false,
      };
    }

    return {
      error: null,
      message:
        typeof data.message === "string" ? data.message : "Email verified successfully.",
      alreadyVerified: data.alreadyVerified === true,
    };
  } catch (error) {
    console.error("Verify email error:", error);
    return {
      error: "Network error. Backend may be unavailable.",
      message: null,
      alreadyVerified: false,
    };
  }
}

export async function resetPassword(
  email: string,
  token: string,
  password: string,
): Promise<{
  error: string | null;
  message: string | null;
}> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ email, token, password }),
      credentials: "include",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        error:
          typeof data.error === "string"
            ? data.error
            : response.status >= 500
              ? "Unable to reset password right now."
              : "Unable to reset password.",
        message: null,
      };
    }

    clearTokens();

    return {
      error: null,
      message:
        typeof data.message === "string"
          ? data.message
          : "Password reset successfully. You can sign in now.",
    };
  } catch (error) {
    console.error("Reset password error:", error);
    return {
      error: "Network error. Backend may be unavailable.",
      message: null,
    };
  }
}

export function getGoogleSignInUrl(returnTo: string): string {
  const query = new URLSearchParams({ returnTo });
  return `${MONGODB_API_URL}/api/auth/google-start?${query.toString()}`;
}

export async function getGoogleOneTapConfig(): Promise<GoogleOneTapConfig> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/google-one-tap`, {
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));

    return {
      enabled: data.enabled === true && typeof data.client_id === "string" && data.client_id.length > 0,
      client_id: typeof data.client_id === "string" ? data.client_id : null,
      nonce: typeof data.nonce === "string" ? data.nonce : null,
    };
  } catch {
    return {
      enabled: false,
      client_id: null,
      nonce: null,
    };
  }
}

export function signInWithGoogle(returnTo?: string): void {
  if (typeof window === "undefined") return;

  const fallbackReturnTo = `${window.location.origin}/home`;
  const targetReturnTo =
    typeof returnTo === "string" && returnTo.trim().length > 0
      ? returnTo
      : fallbackReturnTo;

  window.location.assign(getGoogleSignInUrl(targetReturnTo));
}

export async function signInWithGoogleCredential(credential: string): Promise<{
  user: MongoUser | null;
  error: string | null;
  code: string | null;
}> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/google-one-tap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ credential }),
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        user: null,
        error:
          typeof data.error === "string"
            ? data.error
            : response.status >= 500
              ? "Google sign-in could not be completed. Please try again."
              : "Google sign-in failed",
        code: typeof data.code === "string" ? data.code : null,
      };
    }

    const authenticatedUser = data.user ?? null;
    if (authenticatedUser) {
      setStoredUser(authenticatedUser);
    }

    return {
      user: authenticatedUser,
      error: null,
      code: null,
    };
  } catch (error) {
    console.error("Google credential sign-in error:", error);
    return {
      user: null,
      error: "Network error. Backend may be unavailable.",
      code: null,
    };
  }
}

export async function logout(options: { keepalive?: boolean } = {}): Promise<void> {
  // A refresh response can set fresh cookies. Let any in-flight refresh finish
  // first so the logout response is guaranteed to be the final cookie update.
  if (refreshPromise) {
    await refreshPromise;
  }
  clearTokens();

  const requestOptions: RequestInit = {
    method: "POST",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
    },
    credentials: "include",
    keepalive: options.keepalive === true,
    cache: "no-store",
  };

  try {
    // Clear both session systems. The legacy endpoint owns the app's access
    // and refresh cookies; Better Auth can also be accepted by the backend
    // and therefore must be signed out explicitly.
    const [logoutResponse] = await Promise.all([
      fetch(`${MONGODB_API_URL}/api/auth/logout`, requestOptions),
      fetch(`${MONGODB_API_URL}/api/better-auth/sign-out`, requestOptions).catch(() => null),
    ]);

    if (!logoutResponse.ok) {
      throw new Error(`Logout failed with status ${logoutResponse.status}`);
    }

    // Legacy fallback (disabled for security):
    // const refreshToken = getRefreshToken();
    // if (refreshToken) {
    //   await fetch(`${MONGODB_API_URL}/api/auth/logout`, {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ refreshToken }),
    //   });
    // }
  } catch (error) {
    console.error("Logout error:", error);
    throw error;
  }
}

async function performAccessTokenRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "include",
    });

    // Legacy fallback (disabled for security):
    // const refreshToken = getRefreshToken();
    // if (!refreshToken) return false;
    // const response = await fetch(`${MONGODB_API_URL}/api/auth/refresh`, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ refreshToken }),
    // });

    if (!response.ok) {
      clearTokens();
      return false;
    }

    const data = await response.json();
    // Legacy fallback (disabled for security):
    // setTokens(data.accessToken, data.refreshToken);
    setStoredUser(data.user);

    return true;
  } catch {
    clearTokens();
    return false;
  }
}

export function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = performAccessTokenRefresh().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export async function getCurrentUser(): Promise<MongoUser | null> {
  try {
    const response = await fetchWithAuth("/api/auth/me");
    
    if (!response.ok) {
      if (response.status === 401) {
        clearTokens();
      }
      return null;
    }

    const data = await response.json();
    setStoredUser(data.user);
    return data.user;
  } catch {
    return null;
  }
}

// ========== User Data API ==========

export async function fetchWatchHistory(): Promise<WatchedItem[]> {
  try {
    const response = await fetchWithAuth("/api/user/watch-history");
    if (!response.ok) return [];
    const data = await response.json();
    return data.data || [];
  } catch {
    return [];
  }
}

export async function addToWatchHistory(item: Omit<WatchedItem, "id" | "user_id" | "watched_at">): Promise<WatchedItem | null> {
  try {
    const response = await fetchWithAuth("/api/user/watch-history", {
      method: "POST",
      body: JSON.stringify(item),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.data;
  } catch {
    return null;
  }
}

export async function removeFromWatchHistory(contentId: number, contentType: string): Promise<boolean> {
  try {
    const response = await fetchWithAuth("/api/user/watch-history", {
      method: "DELETE",
      body: JSON.stringify({ content_id: contentId, content_type: contentType }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchLikedItems(): Promise<LikedItem[]> {
  try {
    const response = await fetchWithAuth("/api/user/liked-items");
    if (!response.ok) return [];
    const data = await response.json();
    return data.data || [];
  } catch {
    return [];
  }
}

export async function toggleLikeItem(item: Omit<LikedItem, "id" | "user_id" | "liked_at">): Promise<{ ok: boolean; action: "added" | "removed"; data: LikedItem | null }> {
  try {
    const response = await fetchWithAuth("/api/user/liked-items", {
      method: "POST",
      body: JSON.stringify(item),
    });
    if (!response.ok) return { ok: false, action: "removed", data: null };
    const data = await response.json();
    return { ok: true, action: data.action, data: data.data };
  } catch {
    return { ok: false, action: "removed", data: null };
  }
}

export async function fetchUserFeedback(): Promise<FeedbackItem[]> {
  try {
    const response = await fetchWithAuth("/api/user/feedback");
    if (!response.ok) return [];
    const data = await response.json();
    return data.data || [];
  } catch {
    return [];
  }
}

export async function fetchRecommendationsFeed(
  options?: RecommendationFeedOptions,
): Promise<PersonalizedRecommendationsPayload> {
  const emptyPayload: PersonalizedRecommendationsPayload = {
    items: [],
    isPersonalized: false,
    explanationById: {},
  };

  try {
    const query = new URLSearchParams();
    if (options?.variant) {
      query.set("variant", options.variant);
    }
    if (options?.mode) query.set("mode", options.mode);
    options?.seedKeys?.slice(0, 12).forEach((key) => query.append("seed", key));
    options?.excludedKeys
      ?.slice(0, 160)
      .forEach((key) => query.append("exclude", key));
    if (options?.genre && options.genre !== "all") query.set("genre", options.genre);
    if (options?.language && options.language !== "all") {
      query.set("language", options.language);
    }
    if (options?.contentType && options.contentType !== "all") {
      query.set("content_type", options.contentType);
    }
    if (options?.recommendationType && options.recommendationType !== "all") {
      query.set("recommendation_type", options.recommendationType);
    }
    if (options?.sort && options.sort !== "relevance") query.set("sort", options.sort);
    if (options?.limit) query.set("limit", String(options.limit));

    const endpoint = query.size > 0
      ? `/api/user/recommendations?${query.toString()}`
      : "/api/user/recommendations";

    const response = await fetchWithAuth(endpoint);
    if (!response.ok) return emptyPayload;

    const data = await response.json();
    const payload = data?.data as Partial<PersonalizedRecommendationsPayload> | undefined;

    if (!payload || !Array.isArray(payload.items)) {
      return emptyPayload;
    }

    return {
      items: payload.items,
      isPersonalized: payload.isPersonalized === true,
      explanationById:
        payload.explanationById && typeof payload.explanationById === "object"
          ? payload.explanationById
          : {},
    };
  } catch {
    return emptyPayload;
  }
}

export async function fetchRecommendationsPage(
  options: {
    cursor?: string | null;
    limit?: number;
    genre?: string;
    language?: string;
    contentType?: "all" | "movie" | "tv";
    recommendationType?: "all" | "trending" | "highrated" | "popular" | "newreleases";
    sort?: "relevance" | "popularity" | "rating" | "release_date";
    sortOrder?: "asc" | "desc";
    exploration?: TasteExplorationMode;
    signal?: AbortSignal;
  } = {},
): Promise<RecommendationFeedPage> {
  const query = new URLSearchParams();
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.limit) query.set("limit", String(options.limit));
  if (options.genre && options.genre !== "all") query.set("genre", options.genre);
  if (options.language && options.language !== "all") query.set("language", options.language);
  if (options.contentType && options.contentType !== "all") query.set("content_type", options.contentType);
  if (options.recommendationType && options.recommendationType !== "all") {
    query.set("recommendation_type", options.recommendationType);
  }
  if (options.sort && options.sort !== "relevance") query.set("sort", options.sort);
  if (options.sortOrder && options.sortOrder !== "desc") query.set("sort_order", options.sortOrder);
  if (options.exploration && options.exploration !== "familiar") query.set("exploration", options.exploration);
  const response = await fetchWithAuth(`/api/user/recommendations/v2?${query.toString()}`, {
    signal: options.signal,
  });
  const body = await response.json().catch(() => null);
  const page = body?.data as Partial<RecommendationFeedPage> | undefined;
  if (!response.ok) {
    const error = new RecommendationFeedError(
      typeof body?.error === "string" ? body.error : `Recommendation request failed (${response.status})`,
      {
        status: response.status,
        code: typeof body?.code === "string" ? body.code : undefined,
      },
    );
    throw error;
  }
  if (!page || !Array.isArray(page.items)) {
    throw new RecommendationFeedError("Recommendation response was malformed", { code: "MALFORMED_RESPONSE" });
  }
  return {
    items: page.items,
    explanationById: page.explanationById && typeof page.explanationById === "object" ? page.explanationById : {},
    nextCursor: typeof page.nextCursor === "string" ? page.nextCursor : null,
    hasMore: page.hasMore === true,
    state: page.state === "ready" || page.state === "exhausted" ? page.state : "retryable",
    profileVersion: Number.isFinite(Number(page.profileVersion)) ? Number(page.profileVersion) : 0,
    feedSessionId: typeof page.feedSessionId === "string" ? page.feedSessionId : "",
    isPersonalized: page.isPersonalized === true,
  };
}

export async function fetchRecommendationTasteProfile(): Promise<RecommendationTasteProfile | null> {
  try {
    const response = await fetchWithAuth("/api/user/recommendations/v2/profile");
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    return body?.data || null;
  } catch {
    return null;
  }
}

export async function fetchRecommendationTasteSnapshot(): Promise<RecommendationTasteSnapshot | null> {
  try {
    const response = await fetchWithAuth("/api/user/taste");
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    const data = body?.data as Partial<RecommendationTasteSnapshot> | undefined;
    if (!data?.profile || !data.controls) return null;
    return {
      profile: data.profile as RecommendationTasteProfile,
      controls: data.controls as RecommendationTasteControls,
    };
  } catch {
    return null;
  }
}

export async function updateRecommendationTasteControls(input: {
  explorationMode?: TasteExplorationMode;
  excludeLearningKey?: string;
  restoreLearningKey?: string;
}): Promise<RecommendationTasteSnapshot | null> {
  try {
    const response = await fetchWithAuth("/api/user/taste", {
      method: "PUT",
      body: JSON.stringify({
        exploration_mode: input.explorationMode,
        exclude_learning_key: input.excludeLearningKey,
        restore_learning_key: input.restoreLearningKey,
      }),
    });
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    return body?.data || null;
  } catch {
    return null;
  }
}

export async function resetRecommendationTaste(): Promise<RecommendationTasteSnapshot | null> {
  try {
    const response = await fetchWithAuth("/api/user/taste/reset", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    return body?.data || null;
  } catch {
    return null;
  }
}

export async function fetchMoreLikeThisRecommendations(
  options: Omit<RecommendationFeedOptions, "mode">,
): Promise<PersonalizedRecommendationsPayload> {
  return fetchRecommendationsFeed({
    ...options,
    mode: "more-like-this",
  });
}

export async function setContentFeedback(item: {
  content_id: number;
  content_type: "movie" | "tv";
  feedback_type: FeedbackType;
  title?: string;
  poster_path?: string | null;
  genres?: number[];
  language?: string;
}): Promise<FeedbackMutationResult> {
  try {
    const response = await fetchWithAuth("/api/user/feedback", {
      method: "POST",
      body: JSON.stringify(item),
    });

    if (!response.ok) {
      return { ok: false, action: "removed", data: null };
    }

    const data = await response.json();
    return { ok: true, action: data.action, data: data.data || null };
  } catch {
    return { ok: false, action: "removed", data: null };
  }
}

/** Remove a feedback signal without relying on the POST endpoint's toggle behavior. */
export async function removeContentFeedback(
  contentId: number,
  contentType: "movie" | "tv",
): Promise<FeedbackMutationResult> {
  try {
    const query = new URLSearchParams({ content_id: String(contentId), content_type: contentType });
    const response = await fetchWithAuth(`/api/user/feedback?${query.toString()}`, { method: "DELETE" });
    if (!response.ok) return { ok: false, action: "removed", data: null };
    await response.json();
    return { ok: true, action: "removed", data: null };
  } catch {
    return { ok: false, action: "removed", data: null };
  }
}

export async function fetchContentFeedbackSummary(
  contentId: number,
  contentType: "movie" | "tv"
): Promise<FeedbackSummary | null> {
  try {
    const query = new URLSearchParams({
      content_id: String(contentId),
      content_type: contentType,
    });
    const response = await fetchWithAuth(`/api/user/feedback?${query.toString()}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.data || null;
  } catch {
    return null;
  }
}

export async function fetchComments(
  contentId: number,
  contentType: "movie" | "tv"
): Promise<CommentItem[]> {
  try {
    const query = new URLSearchParams({
      content_id: String(contentId),
      content_type: contentType,
    });
    const response = await fetchWithAuth(`/api/user/comments?${query.toString()}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.data || [];
  } catch {
    return [];
  }
}

export async function postComment(item: {
  content_id: number;
  content_type: "movie" | "tv";
  text: string;
  rating: number;
}): Promise<CommentItem | null> {
  try {
    const response = await fetchWithAuth("/api/user/comments", {
      method: "POST",
      body: JSON.stringify(item),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Unable to post comment");
    }
    const data = await response.json();
    return data.data || null;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw error;
  }
}

export async function updateComment(item: {
  comment_id: string;
  text: string;
  rating: number;
}): Promise<CommentItem | null> {
  try {
    const response = await fetchWithAuth("/api/user/comments", {
      method: "PUT",
      body: JSON.stringify(item),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Unable to update comment");
    }
    const data = await response.json();
    return data.data || null;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw error;
  }
}

export async function checkRegistrationAvailability(payload: {
  email?: string;
  username?: string;
}): Promise<RegistrationAvailability | null> {
  try {
    const query = new URLSearchParams();
    const normalizedEmail = payload.email?.trim();
    const normalizedUsername = payload.username?.trim();

    if (normalizedEmail) query.set("email", normalizedEmail);
    if (normalizedUsername) query.set("username", normalizedUsername);
    if (!query.toString()) return null;

    const response = await fetch(`${MONGODB_API_URL}/api/auth/availability?${query.toString()}`, {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "include",
    });

    if (!response.ok) return null;
    const data = await response.json();
    return {
      email_exists: data.email_exists === true,
      username_exists: data.username_exists === true,
    };
  } catch {
    return null;
  }
}

export async function importAvatarFromUrl(url: string): Promise<Blob> {
  const response = await fetchWithAuth("/api/user/avatar-import", {
    method: "POST",
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Unable to import image from URL");
  }

  return response.blob();
}

export async function uploadAvatarAsset(payload: {
  dataUrl: string;
  filename?: string;
}): Promise<string> {
  const response = await fetchWithAuth("/api/user/avatar-upload", {
    method: "POST",
    body: JSON.stringify({
      data_url: payload.dataUrl,
      filename: payload.filename,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.url !== "string") {
    throw new Error(data.error || "Unable to upload avatar image");
  }

  return data.url;
}

export async function deleteComment(commentId: string): Promise<boolean> {
  try {
    const response = await fetchWithAuth("/api/user/comments", {
      method: "DELETE",
      body: JSON.stringify({ comment_id: commentId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchUserPreferences(): Promise<UserPreferences | null> {
  try {
    const response = await fetchWithAuth("/api/user/preferences");
    if (!response.ok) return null;
    const data = await response.json();
    return data.data;
  } catch {
    return null;
  }
}

export async function updateUserPreferences(prefs: Partial<UserPreferences>): Promise<UserPreferences | null> {
  const response = await fetchWithAuth("/api/user/preferences", {
    method: "PUT",
    body: JSON.stringify(prefs),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Unable to update preferences");
  }
  const data = await response.json();
  return data.data;
}

export async function clearAllHistory(): Promise<boolean> {
  try {
    const response = await fetchWithAuth("/api/user/clear-history", {
      method: "DELETE",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function updateProfile(updates: {
  username?: string;
  avatar_url?: string | null;
}): Promise<MongoUser | null> {
  try {
    const response = await fetchWithAuth("/api/user/profile", {
      method: "PUT",
      body: JSON.stringify(updates),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.data) {
      setStoredUser(data.data);
    }
    return data.data;
  } catch {
    return null;
  }
}

// ========== AI Recommendations ==========

export interface AIRecommendationsPayload {
  items: import("@/shared/lib/tmdb").Movie[] | import("@/shared/lib/tmdb").TVShow[];
  explanationById: Record<string, { label: string; text: string }>;
  isAIRanked: true;
}

export async function fetchAIRecommendations(): Promise<AIRecommendationsPayload> {
  const empty: AIRecommendationsPayload = { items: [], explanationById: {}, isAIRanked: true };
  try {
    const response = await fetchWithAuth("/api/user/ai-recommendations");
    if (!response.ok) return empty;
    const data = await response.json();
    const payload = data?.data as Partial<AIRecommendationsPayload> | undefined;
    if (!payload || !Array.isArray(payload.items)) return empty;
    return {
      items: payload.items,
      explanationById: payload.explanationById && typeof payload.explanationById === "object"
        ? payload.explanationById
        : {},
      isAIRanked: true,
    };
  } catch {
    return empty;
  }
}

// ========== Watchlist ==========

export async function fetchWatchlist(): Promise<WatchlistItem[]> {
  try {
    const response = await fetchWithAuth("/api/user/watchlist");
    if (!response.ok) return [];
    const data = await response.json();
    return data.data || [];
  } catch {
    return [];
  }
}

export async function toggleWatchlistItem(
  item: Omit<WatchlistItem, "id" | "user_id" | "added_at" | "position" | "watched">,
): Promise<{ ok: boolean; action: "added" | "removed"; data: WatchlistItem | null }> {
  try {
    const response = await fetchWithAuth("/api/user/watchlist", {
      method: "POST",
      body: JSON.stringify(item),
    });
    if (!response.ok) return { ok: false, action: "removed", data: null };
    const data = await response.json();
    return { ok: true, action: data.action, data: data.data };
  } catch {
    return { ok: false, action: "removed", data: null };
  }
}

export async function removeWatchlistItem(
  contentId: number,
  contentType: "movie" | "tv",
): Promise<boolean> {
  try {
    const response = await fetchWithAuth("/api/user/watchlist", {
      method: "DELETE",
      body: JSON.stringify({ content_id: contentId, content_type: contentType }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function reorderWatchlist(
  order: Array<{ id: string; position: number }>,
): Promise<boolean> {
  try {
    const response = await fetchWithAuth("/api/user/watchlist", {
      method: "PATCH",
      body: JSON.stringify({ action: "reorder", order }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function markWatchlistItemWatched(
  contentId: number,
  contentType: "movie" | "tv",
  watched: boolean,
): Promise<boolean> {
  try {
    const response = await fetchWithAuth("/api/user/watchlist", {
      method: "PATCH",
      body: JSON.stringify({ action: "mark_watched", content_id: contentId, content_type: contentType, watched }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function setWatchlistItemStatus(
  contentId: number,
  contentType: "movie" | "tv",
  status: WatchlistStatus,
): Promise<{ ok: boolean; data: WatchlistItem | null }> {
  try {
    const response = await fetchWithAuth("/api/user/watchlist", {
      method: "PATCH",
      body: JSON.stringify({
        action: "set_status",
        content_id: contentId,
        content_type: contentType,
        status,
      }),
    });
    if (!response.ok) return { ok: false, data: null };
    const payload = await response.json();
    return { ok: true, data: payload?.data ?? null };
  } catch {
    return { ok: false, data: null };
  }
}

// ========== Privacy ==========

export async function exportUserData(): Promise<PersonalDataExport> {
  const response = await fetchWithAuth("/api/user/export");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.data) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Unable to export account data");
  }
  return payload.data as PersonalDataExport;
}

export async function deleteAccount(): Promise<void> {
  const response = await fetchWithAuth("/api/user/account", { method: "DELETE" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Unable to delete account");
  }
  clearTokens();
}

// ========== Health Check ==========

export async function checkMongoDBHealth(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/health`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { healthy: false, error: data.error || "Backend unavailable" };
    }
    const data = await response.json();
    return { healthy: data.status === "healthy", latency: data.latency_ms };
  } catch (error) {
    return { healthy: false, error: "Cannot connect to backend" };
  }
}
