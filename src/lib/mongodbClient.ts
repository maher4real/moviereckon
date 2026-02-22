/**
 * MongoDB Backend API Client
 * Uses MongoDB backend exclusively - no fallback to other services
 */
import { getPublicMongoApiUrl } from "@/lib/runtimeEnv";

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

// Helper for making authenticated requests with HttpOnly cookie sessions.
async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${MONGODB_API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });

  // Handle access-cookie refresh if unauthorized
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
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: MongoUser;
  // Cookie-based sessions do not return raw tokens in the response body.
  // Legacy fallback fields (disabled by backend):
  // accessToken: string;
  // refreshToken: string;
}

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
  liked_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  preferred_languages: string[];
  preferred_genres: number[];
}

export type FeedbackType = "give_it_a_go" | "one_time_watch" | "must_watch" | "skip";

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
}

export interface FeedbackSummary {
  counts: Record<FeedbackType, number>;
  user_feedback: FeedbackType | null;
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
  verificationPreviewUrl: string | null;
}> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, username, captcha_token: captchaToken }),
      credentials: "include",
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        user: null,
        error: data.error || "Registration failed",
        requiresEmailVerification: false,
        verificationPreviewUrl: null,
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
      verificationPreviewUrl:
        typeof data.verification_preview_url === "string" ? data.verification_preview_url : null,
    };
  } catch (error) {
    console.error("Registration error:", error);
    return {
      user: null,
      error: "Network error. Backend may be unavailable.",
      requiresEmailVerification: false,
      verificationPreviewUrl: null,
    };
  }
}

export async function login(
  email: string,
  password: string,
  captchaToken: string,
): Promise<{ user: MongoUser | null; error: string | null }> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, captcha_token: captchaToken }),
      credentials: "include",
    });

    const data = await response.json();

    if (!response.ok) {
      return { user: null, error: data.error || "Login failed" };
    }

    // Legacy fallback (disabled for security):
    // setTokens(data.accessToken, data.refreshToken);
    setStoredUser(data.user);

    return { user: data.user, error: null };
  } catch (error) {
    console.error("Login error:", error);
    return { user: null, error: "Network error. Backend may be unavailable." };
  }
}

export function getGoogleSignInUrl(returnTo: string): string {
  const query = new URLSearchParams({ returnTo });
  return `${MONGODB_API_URL}/api/auth/google-start?${query.toString()}`;
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

export async function logout(): Promise<void> {
  try {
    await fetch(`${MONGODB_API_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });

    // Legacy fallback (disabled for security):
    // const refreshToken = getRefreshToken();
    // if (refreshToken) {
    //   await fetch(`${MONGODB_API_URL}/api/auth/logout`, {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ refreshToken }),
    //   });
    // }
  } catch {
    // Ignore errors during logout
  } finally {
    clearTokens();
  }
}

export async function refreshAccessToken(): Promise<boolean> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/refresh`, {
      method: "POST",
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

export async function toggleLikeItem(item: Omit<LikedItem, "id" | "user_id" | "liked_at">): Promise<{ action: "added" | "removed"; data: LikedItem | null }> {
  try {
    const response = await fetchWithAuth("/api/user/liked-items", {
      method: "POST",
      body: JSON.stringify(item),
    });
    if (!response.ok) return { action: "removed", data: null };
    const data = await response.json();
    return { action: data.action, data: data.data };
  } catch {
    return { action: "removed", data: null };
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

export async function setContentFeedback(item: {
  content_id: number;
  content_type: "movie" | "tv";
  feedback_type: FeedbackType;
  title?: string;
  poster_path?: string | null;
  genres?: number[];
  language?: string;
}): Promise<{ action: "added" | "updated" | "removed"; data: FeedbackItem | null }> {
  try {
    const response = await fetchWithAuth("/api/user/feedback", {
      method: "POST",
      body: JSON.stringify(item),
    });

    if (!response.ok) {
      return { action: "removed", data: null };
    }

    const data = await response.json();
    return { action: data.action, data: data.data || null };
  } catch {
    return { action: "removed", data: null };
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
    if (!response.ok) return null;
    const data = await response.json();
    return data.data || null;
  } catch {
    return null;
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
    if (!response.ok) return null;
    const data = await response.json();
    return data.data || null;
  } catch {
    return null;
  }
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
  try {
    const response = await fetchWithAuth("/api/user/preferences", {
      method: "PUT",
      body: JSON.stringify(prefs),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.data;
  } catch {
    return null;
  }
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
