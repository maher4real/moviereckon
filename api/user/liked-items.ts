/**
 * GET/POST/DELETE /api/user/liked-items
 * Manage user liked items
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../lib/mongodb";
import { extractTokenFromHeader, verifyAccessToken } from "../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Authenticate user
  const token = extractTokenFromHeader(req.headers.authorization as string | null);
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = verifyAccessToken(token);
  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const { db } = await connectToDatabase();

  try {
    // GET - Fetch liked items
    if (req.method === "GET") {
      const liked = await db
        .collection("liked_items")
        .find({ user_id: user.id })
        .sort({ liked_at: -1 })
        .toArray();

      return res.status(200).json({
        data: liked.map((item) => ({
          id: item._id.toString(),
          user_id: item.user_id,
          content_id: item.content_id,
          content_type: item.content_type,
          title: item.title,
          poster_path: item.poster_path,
          liked_at: item.liked_at,
        })),
      });
    }

    // POST - Toggle like (add if not exists, remove if exists)
    if (req.method === "POST") {
      const { content_id, content_type, title, poster_path } = req.body;

      if (!content_id || !content_type || !title) {
        return res.status(400).json({ error: "content_id, content_type, and title are required" });
      }

      // Check if already liked
      const existing = await db.collection("liked_items").findOne({
        user_id: user.id,
        content_id,
        content_type,
      });

      if (existing) {
        // Unlike - remove
        await db.collection("liked_items").deleteOne({ _id: existing._id });
        return res.status(200).json({ message: "Unliked", action: "removed", data: null });
      }

      // Like - add
      const now = new Date().toISOString();
      const result = await db.collection("liked_items").insertOne({
        user_id: user.id,
        content_id,
        content_type,
        title,
        poster_path: poster_path || null,
        liked_at: now,
      });

      return res.status(201).json({
        message: "Liked",
        action: "added",
        data: {
          id: result.insertedId.toString(),
          user_id: user.id,
          content_id,
          content_type,
          title,
          poster_path: poster_path || null,
          liked_at: now,
        },
      });
    }

    // DELETE - Remove like
    if (req.method === "DELETE") {
      const { content_id, content_type } = req.body;

      if (!content_id || !content_type) {
        return res.status(400).json({ error: "content_id and content_type are required" });
      }

      await db.collection("liked_items").deleteOne({
        user_id: user.id,
        content_id,
        content_type,
      });

      return res.status(200).json({ message: "Unliked" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Liked items error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
