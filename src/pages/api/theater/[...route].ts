import type { NextApiRequest, NextApiResponse } from "next";
import theaterHandler from "@/backend/api/theater";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return theaterHandler(req as never, res as never);
}
