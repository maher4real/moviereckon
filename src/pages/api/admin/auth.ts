import type { NextApiRequest, NextApiResponse } from "next";
import { getUserFromRequest, userHasRoleAtLeast } from "@/backend/api/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await getUserFromRequest(req);
  const authorized = user ? await userHasRoleAtLeast(user, "admin") : false;
  if (!authorized) return res.status(403).json({ error: "Admin access required" });
  return res.status(200).json({ authorized: true, user });
}
