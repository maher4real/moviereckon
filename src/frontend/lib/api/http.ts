/** Part of the frontend API client; re-exported from `@/frontend/lib/mongodbClient`. */
import type { MongoUser } from "./models";
import { getPublicMongoApiUrl } from "@/shared/lib/runtimeEnv";

// User cache key (non-sensitive profile data only).
export const USER_KEY = "moviereckon_user";
// Legacy token storage keys (disabled for security):
// const ACCESS_TOKEN_KEY = "moviereckon_access_token";
// const REFRESH_TOKEN_KEY = "moviereckon_refresh_token";

// Backend URL - relative path for same-origin requests on Vercel
// In production, API routes are at /api/* on the same domain
export const getApiUrl = () => {
  // If NEXT_PUBLIC_MONGODB_API_URL is set, use it (for cross-origin development)
  const configuredUrl = getPublicMongoApiUrl();
  if (configuredUrl && configuredUrl.length > 0) {
    return configuredUrl;
  }
  // In production on Vercel, use relative paths
  return "";
};

export const MONGODB_API_URL = getApiUrl();

// Always return true since MongoDB is the only backend
export const isMongoDBConfigured = (): boolean => true;

export function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

// Deduplication: only one refresh call in-flight at a time
export let refreshPromise: Promise<boolean> | null = null;

// Helper for making authenticated requests with HttpOnly cookie sessions.
export async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
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

export async function performAccessTokenRefresh(): Promise<boolean> {
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
