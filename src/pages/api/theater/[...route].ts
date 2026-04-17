import type { NextApiRequest, NextApiResponse } from "next";
import theaterHandler from "@/backend/api/theater";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return theaterHandler(req as never, res as never);
}
