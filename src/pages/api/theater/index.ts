import type { NextApiRequest, NextApiResponse } from "next";
import theaterHandler from "@/backend/api/theater";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

// Handles GET /api/theater (list) and POST /api/theater (create)
// The [...route].ts catch-all does NOT match the bare /api/theater path in Next.js
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return theaterHandler(req as never, res as never);
}
