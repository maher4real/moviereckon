/**
 * GET/POST/PUT/DELETE /api/user/comments
 * Manage content comments
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase, ObjectId } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";

function getQueryParam(req: VercelRequest, key: string): string | undefined {
  const value = req.query?.[key];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const { db } = await connectToDatabase();

  try {
    if (req.method === "GET") {
      const contentIdRaw = getQueryParam(req, "content_id");
      const contentType = getQueryParam(req, "content_type");
      const contentId = Number(contentIdRaw);

      if (!contentId || !contentType || !["movie", "tv"].includes(contentType)) {
        return res.status(400).json({ error: "content_id and valid content_type are required" });
      }

      const comments = await db
        .collection("content_comments")
        .find({ content_id: contentId, content_type: contentType })
        .sort({ created_at: -1 })
        .toArray();

      return res.status(200).json({
        data: comments.map((comment) => ({
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
      });
    }

    if (req.method === "POST") {
      const { content_id, content_type, text, rating } = req.body || {};
      const contentId = Number(content_id);
      const normalizedText = typeof text === "string" ? text.trim() : "";
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
      const normalizedText = typeof text === "string" ? text.trim() : "";
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

      const commentObjectId = new ObjectId(String(comment_id));
      const now = new Date().toISOString();

      const updateResult = await db.collection("content_comments").findOneAndUpdate(
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

      const deleteResult = await db.collection("content_comments").deleteOne({
        _id: new ObjectId(String(comment_id)),
        user_id: user.id,
      });

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
