import type { NextApiRequest, NextApiResponse } from "next";
import theaterHandler from "@/backend/api/theater";
import { handleRateLimitUnavailable } from "@/backend/api/lib/rate-limit";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    return await theaterHandler(req as never, res as never);
  } catch (error) {
    if (handleRateLimitUnavailable(error, res as never)) return;
    throw error;
  }
}
