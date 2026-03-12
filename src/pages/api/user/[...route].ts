import type { NextApiRequest, NextApiResponse } from "next";
import userHandler from "@/backend/api/user";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return userHandler(req as never, res as never);
}
