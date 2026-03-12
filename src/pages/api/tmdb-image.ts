import type { NextApiRequest, NextApiResponse } from "next";
import tmdbImageHandler from "../../server/api/tmdb-image";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return tmdbImageHandler(req as never, res as never);
}
