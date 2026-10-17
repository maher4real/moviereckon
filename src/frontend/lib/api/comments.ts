/** Part of the frontend API client; re-exported from `@/frontend/lib/mongodbClient`. */
import { fetchWithAuth } from "./http";
import type { CommentItem } from "./models";

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
