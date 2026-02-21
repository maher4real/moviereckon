import type { NextApiRequest, NextApiResponse } from "next";
import tmdbHandler from "../../../api/tmdb";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return tmdbHandler(req as never, res as never);
}
