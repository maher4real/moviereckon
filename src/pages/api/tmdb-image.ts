import type { NextApiRequest, NextApiResponse } from "next";
import tmdbImageHandler from "@/backend/api/tmdb-image";
import { handleRateLimitUnavailable } from "@/backend/api/lib/rate-limit";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    return await tmdbImageHandler(req as never, res as never);
  } catch (error) {
    if (handleRateLimitUnavailable(error, res)) return;
    throw error;
  }
}
