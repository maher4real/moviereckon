/** Part of the frontend API client; re-exported from `@/frontend/lib/mongodbClient`. */
import { fetchWithAuth, clearTokens, setStoredUser } from "./http";
import type { MongoUser, WatchedItem, LikedItem, WatchlistItem, WatchlistStatus, PersonalDataExport, UserPreferences } from "./models";

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

export async function updateUserPreferences(prefs: Partial<UserPreferences> & { onboarding_completed?: boolean }): Promise<UserPreferences | null> {
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
