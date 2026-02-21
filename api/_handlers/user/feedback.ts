/**
 * GET/POST /api/user/feedback
 * Manage community feedback signals
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";

const FEEDBACK_TYPES = ["give_it_a_go", "one_time_watch", "must_watch", "skip"] as const;
type FeedbackType = (typeof FEEDBACK_TYPES)[number];

function getQueryParam(req: VercelRequest, key: string): string | undefined {
  const value = req.query?.[key];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

function createCounts(feedbackDocs: any[]) {
  const counts: Record<FeedbackType, number> = {
    give_it_a_go: 0,
    one_time_watch: 0,
    must_watch: 0,
    skip: 0,
  };

  feedbackDocs.forEach((doc) => {
    if (FEEDBACK_TYPES.includes(doc.feedback_type as FeedbackType)) {
      counts[doc.feedback_type as FeedbackType] += 1;
    }
  });

  return counts;
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

      if (contentIdRaw && contentType) {
        const contentId = Number(contentIdRaw);
        if (!contentId || !["movie", "tv"].includes(contentType)) {
          return res.status(400).json({ error: "content_id and valid content_type are required" });
        }

        const feedbackDocs = await db
          .collection("content_feedback")
          .find({ content_id: contentId, content_type: contentType })
          .toArray();

        const userFeedback = feedbackDocs.find((doc) => doc.user_id === user.id);

        return res.status(200).json({
          data: {
            counts: createCounts(feedbackDocs),
            user_feedback: userFeedback?.feedback_type || null,
          },
        });
      }

      // No query params: return current user's feedback history
      const ownFeedback = await db
        .collection("content_feedback")
        .find({ user_id: user.id })
        .sort({ updated_at: -1 })
        .toArray();

      return res.status(200).json({
        data: ownFeedback.map((doc) => ({
          id: doc._id.toString(),
          user_id: doc.user_id,
          content_id: doc.content_id,
          content_type: doc.content_type,
          feedback_type: doc.feedback_type,
          title: doc.title || "",
          poster_path: doc.poster_path || null,
          genres: doc.genres || [],
          language: doc.language || "en",
          created_at: doc.created_at,
          updated_at: doc.updated_at,
        })),
      });
    }

    if (req.method === "POST") {
      const {
        content_id,
        content_type,
        feedback_type,
        title,
        poster_path,
        genres,
        language,
      } = req.body || {};

      const contentId = Number(content_id);
      const normalizedType = typeof feedback_type === "string" ? feedback_type : "";

      if (!contentId || !content_type || !["movie", "tv"].includes(content_type)) {
        return res.status(400).json({ error: "content_id and valid content_type are required" });
      }

      if (!FEEDBACK_TYPES.includes(normalizedType as FeedbackType)) {
        return res.status(400).json({ error: "Invalid feedback_type" });
      }

      const existing = await db.collection("content_feedback").findOne({
        user_id: user.id,
        content_id: contentId,
        content_type,
      });

      if (existing && existing.feedback_type === normalizedType) {
        await db.collection("content_feedback").deleteOne({ _id: existing._id });
        return res.status(200).json({ action: "removed", data: null });
      }

      const now = new Date().toISOString();
      await db.collection("content_feedback").updateOne(
        {
          user_id: user.id,
          content_id: contentId,
          content_type,
        },
        {
          $set: {
            feedback_type: normalizedType,
            title: typeof title === "string" ? title : "",
            poster_path: typeof poster_path === "string" ? poster_path : null,
            genres: Array.isArray(genres) ? genres : [],
            language: typeof language === "string" ? language : "en",
            updated_at: now,
          },
          $setOnInsert: {
            user_id: user.id,
            content_id: contentId,
            content_type,
            created_at: now,
          },
        },
        { upsert: true }
      );

      const updated = await db.collection("content_feedback").findOne({
        user_id: user.id,
        content_id: contentId,
        content_type,
      });

      return res.status(200).json({
        action: existing ? "updated" : "added",
        data: updated
          ? {
              id: updated._id.toString(),
              user_id: updated.user_id,
              content_id: updated.content_id,
              content_type: updated.content_type,
              feedback_type: updated.feedback_type,
              title: updated.title || "",
              poster_path: updated.poster_path || null,
              genres: updated.genres || [],
              language: updated.language || "en",
              created_at: updated.created_at,
              updated_at: updated.updated_at,
            }
          : null,
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Feedback handler error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
