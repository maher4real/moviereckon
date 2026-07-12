import type { NextApiRequest, NextApiResponse } from "next";
import betterAuthHandler from "@/backend/api/better-auth";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return betterAuthHandler(req, res);
}
