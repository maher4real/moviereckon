import type { NextApiRequest, NextApiResponse } from "next";
import authHandler from "../../../../api/auth";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return authHandler(req as never, res as never);
}
