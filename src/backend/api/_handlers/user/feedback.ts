/**
 * GET/POST /api/user/feedback
 * Manage community feedback signals
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase, ObjectId } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";
import { sanitizeLanguageCode, sanitizeSingleLineText } from "../../lib/input.js";

const FEEDBACK_TYPES = ["give_it_a_go", "one_time_watch", "must_watch", "skip"] as const;
type FeedbackType = (typeof FEEDBACK_TYPES)[number];
type ContentType = "movie" | "tv";
const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 400;

interface ContentFeedbackDoc {
  _id?: ObjectId;
  user_id: string;
  content_id: number;
  content_type: ContentType;
  feedback_type: FeedbackType;
  title: string;
  poster_path: string | null;
  genres: number[];
  language: string;
  created_at: string;
  updated_at: string;
}

interface ContentFeedbackSummaryDoc {
  _id?: ObjectId;
  content_id: number;
  content_type: ContentType;
  counts: Partial<Record<FeedbackType, number>>;
  total_votes: number;
  created_at: string;
  updated_at: string;
}

function normalizeContentType(value: unknown): ContentType | null {
  if (value === "movie" || value === "tv") return value;
  return null;
}

function normalizeContentId(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
}

function normalizeFeedbackType(value: unknown): FeedbackType | null {
  if (FEEDBACK_TYPES.includes(value as FeedbackType)) return value as FeedbackType;
  return null;
}

function normalizeOptionalString(
  value: unknown,
  maxLength: number,
  fallback: string | null = "",
): string | null {
  return sanitizeSingleLineText(value, maxLength, { fallback });
}

function normalizeGenres(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<number>();
  for (const entry of value) {
    const parsed = Number(entry);
    if (Number.isInteger(parsed) && parsed > 0) unique.add(parsed);
    if (unique.size >= 20) break;
  }
  return [...unique];
}

function normalizeLanguage(value: unknown): string {
  return sanitizeLanguageCode(value, "en") || "en";
}

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

function decodeCursor(raw: string | undefined): { updatedAt: string; id: ObjectId } | null {
  if (!raw) return null;
  const separator = raw.lastIndexOf("|");
  if (separator <= 0 || separator >= raw.length - 1) return null;

  const updatedAt = raw.slice(0, separator);
  const idRaw = raw.slice(separator + 1);
  if (!updatedAt || !ObjectId.isValid(idRaw)) return null;

  return { updatedAt, id: new ObjectId(idRaw) };
}

function encodeCursor(item: { updated_at: string; _id: ObjectId }): string {
  return `${item.updated_at}|${item._id.toString()}`;
}

function emptyCounts(): Record<FeedbackType, number> {
  return {
    give_it_a_go: 0,
    one_time_watch: 0,
    must_watch: 0,
    skip: 0,
  };
}

function normalizeCount(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function normalizeSummaryCounts(
  summaryDoc: { counts?: Partial<Record<FeedbackType, number>> } | null,
): Record<FeedbackType, number> {
  const counts = emptyCounts();
  if (!summaryDoc?.counts) return counts;
  for (const feedbackType of FEEDBACK_TYPES) {
    counts[feedbackType] = normalizeCount(summaryDoc.counts[feedbackType]);
  }
  return counts;
}

function createCountsFromAggregate(feedbackDocs: Array<{ _id: string; count: number }>) {
  const counts = emptyCounts();
  feedbackDocs.forEach((doc) => {
    if (FEEDBACK_TYPES.includes(doc._id as FeedbackType)) {
      counts[doc._id as FeedbackType] = normalizeCount(doc.count);
    }
  });
  return counts;
}

async function adjustFeedbackSummary(
  db: Awaited<ReturnType<typeof connectToDatabase>>["db"],
  contentId: number,
  contentType: ContentType,
  deltas: Partial<Record<FeedbackType, number>>,
) {
  const inc: Record<string, number> = {};
  let totalDelta = 0;

  for (const feedbackType of FEEDBACK_TYPES) {
    const delta = Number(deltas[feedbackType] || 0);
    if (!Number.isFinite(delta) || delta === 0) continue;
    inc[`counts.${feedbackType}`] = delta;
    totalDelta += delta;
  }

  if (Object.keys(inc).length === 0) return;
  inc.total_votes = totalDelta;

  const now = new Date().toISOString();
  await db.collection<ContentFeedbackSummaryDoc>("content_feedback_summary").updateOne(
    { content_id: contentId, content_type: contentType },
    {
      $inc: inc,
      $set: { updated_at: now },
      $setOnInsert: {
        content_id: contentId,
        content_type: contentType,
        created_at: now,
      },
    },
    { upsert: true },
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const { db } = await connectToDatabase();
  const feedbackCollection = db.collection<ContentFeedbackDoc>("content_feedback");
  const feedbackSummaryCollection = db.collection<ContentFeedbackSummaryDoc>(
    "content_feedback_summary",
  );

  try {
    if (req.method === "GET") {
      const contentIdRaw = getQueryParam(req, "content_id");
      const contentType = normalizeContentType(getQueryParam(req, "content_type"));

      if (contentIdRaw && contentType) {
        const contentId = normalizeContentId(contentIdRaw);
        if (!contentId) {
          return res.status(400).json({ error: "content_id and valid content_type are required" });
        }

        const [summaryDoc, userFeedbackDoc] = await Promise.all([
          feedbackSummaryCollection.findOne(
            { content_id: contentId, content_type: contentType },
            { projection: { counts: 1 } },
          ),
          feedbackCollection.findOne(
            { user_id: user.id, content_id: contentId, content_type: contentType },
            { projection: { feedback_type: 1 } },
          ),
        ]);
        let counts = normalizeSummaryCounts(summaryDoc);

        // Legacy compatibility: build summary once when a pre-index deployment has existing votes.
        if (!summaryDoc) {
          const aggregateRows = await feedbackCollection
            .aggregate<{ _id: string; count: number }>([
              { $match: { content_id: contentId, content_type: contentType } },
              { $group: { _id: "$feedback_type", count: { $sum: 1 } } },
            ])
            .toArray();
          counts = createCountsFromAggregate(aggregateRows);
          const totalVotes = Object.values(counts).reduce((sum, value) => sum + value, 0);
          const now = new Date().toISOString();
          await feedbackSummaryCollection.updateOne(
            { content_id: contentId, content_type: contentType },
            {
              $set: {
                counts,
                total_votes: totalVotes,
                updated_at: now,
              },
              $setOnInsert: {
                content_id: contentId,
                content_type: contentType,
                created_at: now,
              },
            },
            { upsert: true },
          );
        }

        return res.status(200).json({
          data: {
            counts,
            user_feedback: userFeedbackDoc?.feedback_type || null,
          },
        });
      }

      // No query params: return current user's feedback history
      const limitRaw = getQueryParam(req, "limit");
      const limit = parseLimit(limitRaw);
      const cursor = decodeCursor(getQueryParam(req, "cursor"));
      const usePagination = Boolean(limitRaw || cursor);
      const filter: Record<string, unknown> = { user_id: user.id };
      if (cursor) {
        filter.$or = [
          { updated_at: { $lt: cursor.updatedAt } },
          { updated_at: cursor.updatedAt, _id: { $lt: cursor.id } },
        ];
      }

      let query = feedbackCollection
        .find(filter, {
          projection: {
            user_id: 1,
            content_id: 1,
            content_type: 1,
            feedback_type: 1,
            title: 1,
            poster_path: 1,
            genres: 1,
            language: 1,
            created_at: 1,
            updated_at: 1,
          },
        })
        .sort({ updated_at: -1, _id: -1 });
      if (usePagination) {
        query = query.limit(limit + 1);
      }

      const ownFeedback = await query.toArray();
      const hasMore = usePagination ? ownFeedback.length > limit : false;
      const pageItems = usePagination && hasMore ? ownFeedback.slice(0, limit) : ownFeedback;
      const lastItem = pageItems[pageItems.length - 1];

      const payload: Record<string, unknown> = {
        data: pageItems.map((doc) => ({
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
      const body = req.body || {};
      const contentId = normalizeContentId(body.content_id);
      const contentType = normalizeContentType(body.content_type);
      const feedbackType = normalizeFeedbackType(body.feedback_type);

      if (!contentId || !contentType) {
        return res.status(400).json({ error: "content_id and valid content_type are required" });
      }

      if (!feedbackType) {
        return res.status(400).json({ error: "Invalid feedback_type" });
      }
      const normalizedTitle = normalizeOptionalString(body.title, 220) || "";
      const normalizedPosterPath = normalizeOptionalString(body.poster_path, 300, null);
      const normalizedGenres = normalizeGenres(body.genres);
      const normalizedLanguage = normalizeLanguage(body.language);
      const key = {
        user_id: user.id,
        content_id: contentId,
        content_type: contentType,
      };
      const now = new Date().toISOString();

      const previousDoc = await feedbackCollection.findOneAndUpdate(
        key,
        {
          $set: {
            feedback_type: feedbackType,
            title: normalizedTitle,
            poster_path: normalizedPosterPath,
            genres: normalizedGenres,
            language: normalizedLanguage,
            updated_at: now,
          },
          $setOnInsert: {
            ...key,
            created_at: now,
          },
        },
        {
          upsert: true,
          returnDocument: "before",
          projection: { feedback_type: 1 },
        }
      );
      const previousType = normalizeFeedbackType(previousDoc?.feedback_type);
      let action: "added" | "updated" | "removed" = "added";

      if (previousType === feedbackType) {
        const removed = await feedbackCollection.deleteOne({ ...key, feedback_type: feedbackType });
        if (removed.deletedCount === 1) {
          await adjustFeedbackSummary(db, contentId, contentType, { [feedbackType]: -1 });
          return res.status(200).json({ action: "removed", data: null });
        }
      } else if (previousType && previousType !== feedbackType) {
        action = "updated";
        await adjustFeedbackSummary(db, contentId, contentType, {
          [previousType]: -1,
          [feedbackType]: 1,
        });
      } else {
        action = "added";
        await adjustFeedbackSummary(db, contentId, contentType, { [feedbackType]: 1 });
      }

      const updated = await feedbackCollection.findOne(key, {
        projection: {
          user_id: 1,
          content_id: 1,
          content_type: 1,
          feedback_type: 1,
          title: 1,
          poster_path: 1,
          genres: 1,
          language: 1,
          created_at: 1,
          updated_at: 1,
        },
      });

      if (!updated) {
        return res.status(200).json({ action: "removed", data: null });
      }

      return res.status(200).json({
        action,
        data: {
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
        },
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Feedback handler error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
