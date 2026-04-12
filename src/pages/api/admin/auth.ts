import type { NextApiRequest, NextApiResponse } from "next";
import jwt from "jsonwebtoken";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET!;
const ADMIN_TOKEN_EXPIRES = "8h";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: "Admin access is not configured" });
  }

  const { password } = req.body as { password?: string };

  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "Password required" });
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(ADMIN_PASSWORD);
  const provided = Buffer.from(password);
  const match =
    expected.length === provided.length &&
    Buffer.compare(expected, provided) === 0;

  if (!match) {
    return res.status(401).json({ error: "Invalid password" });
  }

  const token = jwt.sign(
    { role: "admin", iss: "moviereckon-admin" },
    JWT_SECRET,
    { expiresIn: ADMIN_TOKEN_EXPIRES }
  );

  return res.status(200).json({ token });
}
