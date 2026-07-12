import type { NextApiRequest, NextApiResponse } from "next";
import tmdbHandler from "@/backend/api/tmdb";
import { handleRateLimitUnavailable } from "@/backend/api/lib/rate-limit";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    return await tmdbHandler(req as never, res as never);
  } catch (error) {
    if (handleRateLimitUnavailable(error, res)) return;
    throw error;
  }
}
