import type { Db } from "mongodb";
import { getContentKey } from "@/shared/lib/recommendation";

type BuildCollaborativeBoostsInput = {
  userId: string;
  positiveKeys: string[];
  excludedKeys: Set<string>;
};

const MIN_POSITIVE_KEYS = 3;
const MIN_NEIGHBORS = 3;
const MIN_CANDIDATE_NEIGHBORS = 2;
const MIN_COLLABORATIVE_ROWS = 2;
const MAX_BOOST = 0.1;
const AGGREGATION_MAX_TIME_MS = 650;

type CollaborativeBoostRow = {
  _id: { content_type: "movie" | "tv"; content_id: number };
  count: number;
  candidateNeighborCount: number;
  totalNeighborCount: number;
};

function splitKey(key: string): { content_type: "movie" | "tv"; content_id: number } | null {
  const match = /^(movie|tv)_(\d+)$/.exec(key);
  if (!match) return null;

  const [, type, idText] = match;
  const id = Number(idText);
  if ((type !== "movie" && type !== "tv") || !Number.isSafeInteger(id) || id <= 0) {
    return null;
  }
  return { content_type: type, content_id: id };
}

export async function buildCollaborativeBoosts(
  db: Db,
  input: BuildCollaborativeBoostsInput,
): Promise<Record<string, number>> {
  const seedPairs = input.positiveKeys
    .map(splitKey)
    .filter(
      (
        value,
      ): value is {
        content_type: "movie" | "tv";
        content_id: number;
      } => value !== null,
    );

  if (seedPairs.length < MIN_POSITIVE_KEYS) return {};

  const cursor = db
    .collection("liked_items")
    .aggregate<CollaborativeBoostRow>([
      {
        $match: {
          user_id: { $ne: input.userId },
          $or: seedPairs,
        },
      },
      {
        $group: {
          _id: "$user_id",
          overlap: { $sum: 1 },
        },
      },
      {
        $match: {
          overlap: { $gte: 2 },
        },
      },
      { $limit: 500 },
      {
        $group: {
          _id: null,
          neighborIds: { $push: "$_id" },
          totalNeighborCount: { $sum: 1 },
        },
      },
      {
        $match: {
          totalNeighborCount: { $gte: MIN_NEIGHBORS },
        },
      },
      { $unwind: "$neighborIds" },
      {
        $lookup: {
          from: "liked_items",
          let: { neighborUserId: "$neighborIds" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$user_id", "$$neighborUserId"] },
              },
            },
            {
              $project: {
                _id: 0,
                content_type: 1,
                content_id: 1,
              },
            },
            { $limit: 300 },
          ],
          as: "liked",
        },
      },
      { $unwind: "$liked" },
      {
        $group: {
          _id: {
            content_type: "$liked.content_type",
            content_id: "$liked.content_id",
          },
          count: { $sum: 1 },
          candidateNeighborIds: { $addToSet: "$neighborIds" },
          totalNeighborCount: { $first: "$totalNeighborCount" },
        },
      },
      {
        $project: {
          count: 1,
          candidateNeighborCount: { $size: "$candidateNeighborIds" },
          totalNeighborCount: 1,
        },
      },
      {
        $match: {
          candidateNeighborCount: { $gte: MIN_CANDIDATE_NEIGHBORS },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 120 },
    ]);

  const timedCursor =
    typeof cursor.maxTimeMS === "function"
      ? cursor.maxTimeMS(AGGREGATION_MAX_TIME_MS)
      : cursor;
  const rows = await timedCursor.toArray();

  const eligibleRows = rows.filter((row) => {
    const key = getContentKey(row._id.content_type, row._id.content_id);
    return (
      !input.excludedKeys.has(key) &&
      row.totalNeighborCount >= MIN_NEIGHBORS &&
      row.candidateNeighborCount >= MIN_CANDIDATE_NEIGHBORS
    );
  });

  if (eligibleRows.length < MIN_COLLABORATIVE_ROWS) return {};

  const maxCount = Math.max(...eligibleRows.map((row) => row.count), 1);
  const boosts: Record<string, number> = {};

  for (const row of eligibleRows) {
    const key = getContentKey(row._id.content_type, row._id.content_id);
    boosts[key] = Math.min(MAX_BOOST, (row.count / maxCount) * MAX_BOOST);
  }

  return boosts;
}
