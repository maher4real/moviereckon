import type { NextApiRequest, NextApiResponse } from "next";
import userHandler from "@/backend/api/user";
import { handleRateLimitUnavailable } from "@/backend/api/lib/rate-limit";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    return await userHandler(req as never, res as never);
  } catch (error) {
    if (handleRateLimitUnavailable(error, res)) return;
    throw error;
  }
}
