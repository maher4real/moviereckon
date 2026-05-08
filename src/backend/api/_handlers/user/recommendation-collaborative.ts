import type { Db } from "mongodb";
import { getContentKey } from "@/shared/lib/recommendation";

type BuildCollaborativeBoostsInput = {
  userId: string;
  positiveKeys: string[];
  excludedKeys: Set<string>;
};

const MIN_POSITIVE_KEYS = 3;
const MIN_COLLABORATIVE_ROWS = 2;
const MAX_BOOST = 0.1;

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

  const rows = await db
    .collection("liked_items")
    .aggregate<{
      _id: { content_type: "movie" | "tv"; content_id: number };
      count: number;
    }>([
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
      {
        $lookup: {
          from: "liked_items",
          localField: "_id",
          foreignField: "user_id",
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
        },
      },
      { $sort: { count: -1 } },
      { $limit: 120 },
    ])
    .toArray();

  if (rows.length < MIN_COLLABORATIVE_ROWS) return {};

  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  const boosts: Record<string, number> = {};

  for (const row of rows) {
    const key = getContentKey(row._id.content_type, row._id.content_id);
    if (input.excludedKeys.has(key)) continue;
    boosts[key] = Math.min(MAX_BOOST, (row.count / maxCount) * MAX_BOOST);
  }

  return boosts;
}
