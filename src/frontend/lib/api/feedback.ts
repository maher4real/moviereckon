/** Part of the frontend API client; re-exported from `@/frontend/lib/mongodbClient`. */
import { fetchWithAuth } from "./http";
import type { FeedbackType, FeedbackItem, FeedbackMutationResult, FeedbackSummary } from "./models";

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
