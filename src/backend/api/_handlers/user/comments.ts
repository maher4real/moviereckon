/**
 * GET/POST/PUT/DELETE /api/user/comments
 * Manage content comments
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase, ObjectId } from "../../lib/mongodb.js";
import { getUserFromRequest, userHasRoleAtLeast } from "../../lib/auth.js";
import { sanitizeMultiLineText } from "../../lib/input.js";
import { containsBlockedTerms } from "../../lib/profanity.js";
import { enforceRequestRateLimit } from "../../lib/request-rate-limit.js";

const DEFAULT_PAGE_SIZE = 80;
const MAX_PAGE_SIZE = 120;

type ContentType = "movie" | "tv";

interface ContentCommentDoc {
  _id?: ObjectId;
  user_id: string;
  username: string;
  avatar_url: string | null;
  content_id: number;
  content_type: ContentType;
  text: string;
  rating: number;
  created_at: string;
  updated_at: string;
}

type CursorItem = Pick<ContentCommentDoc, "created_at"> & { _id: ObjectId };

function getQueryParam(req: VercelRequest, key: string): string | undefined {
  const value = req.query?.[key];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

function parseLimit(raw: string | undefined): number {
  const numeric = Number(raw);
  if (!Number.isInteger(numeric) || numeric <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(numeric, MAX_PAGE_SIZE);
}

function decodeCursor(raw: string | undefined): { createdAt: string; id: ObjectId } | null {
  if (!raw) return null;
  const separator = raw.lastIndexOf("|");
  if (separator <= 0 || separator >= raw.length - 1) return null;

  const createdAt = raw.slice(0, separator);
  const idRaw = raw.slice(separator + 1);
  if (!createdAt || !ObjectId.isValid(idRaw)) return null;
  return { createdAt, id: new ObjectId(idRaw) };
}

function encodeCursor(item: CursorItem): string {
  return `${item.created_at}|${item._id.toString()}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const method = (req.method || "GET").toUpperCase();
  const methodLimits: Record<string, { maxRequests: number; windowMs: number }> = {
    GET: { maxRequests: 140, windowMs: 5 * 60 * 1000 },
    POST: { maxRequests: 20, windowMs: 10 * 60 * 1000 },
    PUT: { maxRequests: 30, windowMs: 10 * 60 * 1000 },
    DELETE: { maxRequests: 40, windowMs: 10 * 60 * 1000 },
  };
  const methodLimit = methodLimits[method];
  if (
    methodLimit &&
    (await enforceRequestRateLimit({
      req,
      res,
      route: "user_comments",
      reason: "comments_limit",
      errorMessage: "Too many comment requests. Please try again shortly.",
      metadata: { method },
      rules: [
        {
          key: `user:comments:user:${user.id}:${method}`,
          maxRequests: methodLimit.maxRequests,
          windowMs: methodLimit.windowMs,
          metadataKey: "user",
        },
      ],
    }))
  ) {
    return;
  }

  const { db } = await connectToDatabase();
  const commentsCollection = db.collection<ContentCommentDoc>("content_comments");

  try {
    if (req.method === "GET") {
      const contentIdRaw = getQueryParam(req, "content_id");
      const contentType = getQueryParam(req, "content_type");
      const contentId = Number(contentIdRaw);
      const limitRaw = getQueryParam(req, "limit");
      const limit = parseLimit(limitRaw);
      const cursor = decodeCursor(getQueryParam(req, "cursor"));
      const usePagination = Boolean(limitRaw || cursor);

      if (!contentId || !contentType || !["movie", "tv"].includes(contentType)) {
        return res.status(400).json({ error: "content_id and valid content_type are required" });
      }
      const filter: Record<string, unknown> = {
        content_id: contentId,
        content_type: contentType,
      };
      if (cursor) {
        filter.$or = [
          { created_at: { $lt: cursor.createdAt } },
          { created_at: cursor.createdAt, _id: { $lt: cursor.id } },
        ];
      }

      let query = commentsCollection
        .find(filter, {
          projection: {
            user_id: 1,
            username: 1,
            avatar_url: 1,
            content_id: 1,
            content_type: 1,
            text: 1,
            rating: 1,
            created_at: 1,
            updated_at: 1,
          },
        })
        .sort({ created_at: -1, _id: -1 });
      if (usePagination) {
        query = query.limit(limit + 1);
      }

      const comments = await query.toArray();
      const hasMore = usePagination ? comments.length > limit : false;
      const pageItems = usePagination && hasMore ? comments.slice(0, limit) : comments;
      const lastItem = pageItems[pageItems.length - 1] as CursorItem | undefined;

      const payload: Record<string, unknown> = {
        data: pageItems.map((comment) => ({
          id: comment._id.toString(),
          user_id: comment.user_id,
          username: comment.username,
          avatar_url: comment.avatar_url || null,
          content_id: comment.content_id,
          content_type: comment.content_type,
          text: comment.text,
          rating:
            Number.isInteger(comment.rating) && comment.rating >= 1 && comment.rating <= 10
              ? comment.rating
              : null,
          created_at: comment.created_at,
          updated_at: comment.updated_at,
        })),
      };

      if (usePagination) {
        payload.page = {
          limit,
          has_more: hasMore,
          next_cursor: hasMore && lastItem ? encodeCursor(lastItem) : null,
        };
      }

      return res.status(200).json(payload);
    }

    if (req.method === "POST") {
      const { content_id, content_type, text, rating } = req.body || {};
      const contentId = Number(content_id);
      const normalizedText = sanitizeMultiLineText(text, Number.MAX_SAFE_INTEGER, "") || "";
      const normalizedRating = Number(rating);

      if (!contentId || !content_type || !["movie", "tv"].includes(content_type) || !normalizedText) {
        return res.status(400).json({
          error: "content_id, valid content_type, and text are required",
        });
      }

      if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 10) {
        return res.status(400).json({ error: "rating must be an integer between 1 and 10" });
      }

      if (normalizedText.length > 1000) {
        return res.status(400).json({ error: "Comment must be 1000 characters or less" });
      }

      if (containsBlockedTerms(normalizedText)) {
        return res.status(400).json({
          error: "Comment contains blocked language. Please keep it respectful.",
        });
      }
      let username = user.username;
      let avatarUrl: string | null = null;

      if (ObjectId.isValid(user.id)) {
        const fullUser = await db.collection("users").findOne(
          { _id: new ObjectId(user.id) },
          { projection: { username: 1, avatar_url: 1 } }
        );
        if (fullUser?.username) username = fullUser.username;
        avatarUrl = fullUser?.avatar_url || null;
      }

      const now = new Date().toISOString();
      const result = await db.collection("content_comments").insertOne({
        user_id: user.id,
        username,
        avatar_url: avatarUrl,
        content_id: contentId,
        content_type,
        text: normalizedText,
        rating: normalizedRating,
        created_at: now,
        updated_at: now,
      });

      return res.status(201).json({
        data: {
          id: result.insertedId.toString(),
          user_id: user.id,
          username,
          avatar_url: avatarUrl,
          content_id: contentId,
          content_type,
          text: normalizedText,
          rating: normalizedRating,
          created_at: now,
          updated_at: now,
        },
      });
    }

    if (req.method === "PUT") {
      const { comment_id, text, rating } = req.body || {};
      const normalizedText = sanitizeMultiLineText(text, Number.MAX_SAFE_INTEGER, "") || "";
      const normalizedRating = Number(rating);

      if (!comment_id || !ObjectId.isValid(String(comment_id))) {
        return res.status(400).json({ error: "valid comment_id is required" });
      }

      if (!normalizedText) {
        return res.status(400).json({ error: "text is required" });
      }

      if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 10) {
        return res.status(400).json({ error: "rating must be an integer between 1 and 10" });
      }

      if (normalizedText.length > 1000) {
        return res.status(400).json({ error: "Comment must be 1000 characters or less" });
      }

      if (containsBlockedTerms(normalizedText)) {
        return res.status(400).json({
          error: "Comment contains blocked language. Please keep it respectful.",
        });
      }
      const commentObjectId = new ObjectId(String(comment_id));
      const now = new Date().toISOString();

      const updateResult = await commentsCollection.findOneAndUpdate(
        { _id: commentObjectId, user_id: user.id },
        {
          $set: {
            text: normalizedText,
            rating: normalizedRating,
            updated_at: now,
          },
        },
        { returnDocument: "after" }
      );

      const updatedComment = (updateResult as any)?.value ?? updateResult;
      if (!updatedComment) {
        return res.status(404).json({ error: "Comment not found or not owned by user" });
      }

      return res.status(200).json({
        data: {
          id: updatedComment._id.toString(),
          user_id: updatedComment.user_id,
          username: updatedComment.username,
          avatar_url: updatedComment.avatar_url || null,
          content_id: updatedComment.content_id,
          content_type: updatedComment.content_type,
          text: updatedComment.text,
          rating:
            Number.isInteger(updatedComment.rating) &&
            updatedComment.rating >= 1 &&
            updatedComment.rating <= 10
              ? updatedComment.rating
              : null,
          created_at: updatedComment.created_at,
          updated_at: updatedComment.updated_at,
        },
      });
    }

    if (req.method === "DELETE") {
      const { comment_id } = req.body || {};
      if (!comment_id || !ObjectId.isValid(String(comment_id))) {
        return res.status(400).json({ error: "valid comment_id is required" });
      }

      const canModerateAnyComment = await userHasRoleAtLeast(user, "moderator");
      const deleteFilter: Record<string, unknown> = {
        _id: new ObjectId(String(comment_id)),
      };
      if (!canModerateAnyComment) {
        deleteFilter.user_id = user.id;
      }

      const deleteResult = await commentsCollection.deleteOne(deleteFilter);

      if (deleteResult.deletedCount === 0) {
        return res.status(404).json({ error: "Comment not found or not owned by user" });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Comments handler error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
