import type { NextApiRequest, NextApiResponse } from "next";
import healthHandler from "@/backend/api/health";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return healthHandler(req as never, res as never);
}
