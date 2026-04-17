/**
 * Theater Mode CRUD handler
 * POST   /api/theater        → add movie (admin only)
 * GET    /api/theater        → list all movies
 * GET    /api/theater/:id    → single movie
 * PUT    /api/theater/:id    → update movie (admin only)
 * DELETE /api/theater/:id    → delete movie (admin only)
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase, ObjectId } from "../../lib/mongodb.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

function isAdminRequest(req: VercelRequest): boolean {
  // Check regular user JWT (role === "admin")
  // Also accept the dedicated admin session token (iss === "moviereckon-admin")
  const authHeader = (req.headers["authorization"] as string) || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return false;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export interface TheaterCastMember {
  name: string;
  role: string;
  photo: string;
}

export interface TheaterMovie {
  _id?: ObjectId;
  title: string;
  description: string;
  thumbnail: string;
  genre: string;
  year: number;
  rating: number;
  videoUrl: string;
  source: "youtube" | "gdrive" | "dailymotion";
  cast: TheaterCastMember[];
  createdAt: string;
  updatedAt: string;
}

function detectVideoSource(url: string): "youtube" | "gdrive" | "dailymotion" | null {
  if (!url) return null;
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("drive.google.com")) return "gdrive";
  if (url.includes("dailymotion.com") || url.includes("dai.ly")) return "dailymotion";
  return null;
}

function getEmbedUrl(videoUrl: string, source: "youtube" | "gdrive" | "dailymotion"): string {
  if (source === "gdrive") {
    // https://drive.google.com/file/d/FILE_ID/view → preview
    const match = videoUrl.match(/\/file\/d\/([^/]+)/);
    if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
    return videoUrl;
  }
  if (source === "dailymotion") {
    try {
      if (videoUrl.includes("dai.ly/")) {
        const id = videoUrl.split("dai.ly/")[1]?.split("?")[0];
        if (id) return `https://www.dailymotion.com/embed/video/${id}?autoplay=1`;
      }
      const url = new URL(videoUrl);
      const pathId = url.pathname.split("/video/")[1]?.split("_")[0];
      if (pathId) return `https://www.dailymotion.com/embed/video/${pathId}?autoplay=1`;
    } catch {
      // fall through
    }
    return videoUrl;
  }
  // YouTube: extract video id
  try {
    if (videoUrl.includes("youtu.be/")) {
      const id = videoUrl.split("youtu.be/")[1]?.split("?")[0];
      return `https://www.youtube.com/embed/${id}`;
    }
    const url = new URL(videoUrl);
    const id = url.searchParams.get("v");
    if (id) return `https://www.youtube.com/embed/${id}`;
  } catch {
    // fall through
  }
  return videoUrl;
}

function sanitizeString(val: unknown, maxLen: number): string {
  if (typeof val !== "string") return "";
  return val.trim().slice(0, maxLen);
}

function sanitizeCast(val: unknown): TheaterCastMember[] {
  if (!Array.isArray(val)) return [];
  return val
    .slice(0, 50)
    .map((m) => ({
      name: sanitizeString((m as Record<string, unknown>).name, 100),
      role: sanitizeString((m as Record<string, unknown>).role, 100),
      photo: sanitizeString((m as Record<string, unknown>).photo, 500),
    }))
    .filter((m) => m.name.length > 0);
}

export default async function theaterHandler(req: VercelRequest, res: VercelResponse) {
  const { db } = await connectToDatabase();
  const col = db.collection<TheaterMovie>("theater_movies");

  const method = (req.method || "GET").toUpperCase();
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // pathParts = ['api', 'theater'] or ['api', 'theater', ':id']
  const movieId = pathParts[2] || null;

  // ── GET /api/theater ──────────────────────────────────────────────────────
  if (method === "GET" && !movieId) {
    const movies = await col.find({}).sort({ createdAt: -1 }).toArray();
    return res.status(200).json({ movies });
  }

  // ── GET /api/theater/:id ──────────────────────────────────────────────────
  if (method === "GET" && movieId) {
    if (!ObjectId.isValid(movieId)) {
      return res.status(400).json({ error: "Invalid movie id" });
    }
    const movie = await col.findOne({ _id: new ObjectId(movieId) });
    if (!movie) return res.status(404).json({ error: "Movie not found" });
    return res.status(200).json({ movie });
  }

  // All write operations require admin token
  if (!isAdminRequest(req)) return res.status(403).json({ error: "Admin access required" });

  // ── POST /api/theater ─────────────────────────────────────────────────────
  if (method === "POST" && !movieId) {
    const body = req.body as Record<string, unknown>;
    const title = sanitizeString(body.title, 200);
    const description = sanitizeString(body.description, 5000);
    const thumbnail = sanitizeString(body.thumbnail, 500);
    const genre = sanitizeString(body.genre, 100);
    const year = Number(body.year);
    const rating = Math.min(10, Math.max(0, Number(body.rating)));
    const videoUrl = sanitizeString(body.videoUrl, 500);

    if (!title || !videoUrl) {
      return res.status(400).json({ error: "title and videoUrl are required" });
    }

    const source = detectVideoSource(videoUrl);
    if (!source) {
      return res.status(400).json({ error: "videoUrl must be a YouTube, Google Drive, or Dailymotion link" });
    }

    const now = new Date().toISOString();
    const doc: TheaterMovie = {
      title,
      description,
      thumbnail,
      genre,
      year: Number.isFinite(year) ? year : new Date().getFullYear(),
      rating: Number.isFinite(rating) ? rating : 0,
      videoUrl,
      source,
      cast: sanitizeCast(body.cast),
      createdAt: now,
      updatedAt: now,
    };

    const result = await col.insertOne(doc);
    return res.status(201).json({ movie: { ...doc, _id: result.insertedId } });
  }

  // ── PUT /api/theater/:id ──────────────────────────────────────────────────
  if (method === "PUT" && movieId) {
    if (!ObjectId.isValid(movieId)) {
      return res.status(400).json({ error: "Invalid movie id" });
    }
    const existing = await col.findOne({ _id: new ObjectId(movieId) });
    if (!existing) return res.status(404).json({ error: "Movie not found" });

    const body = req.body as Record<string, unknown>;
    const updates: Partial<TheaterMovie> = {};

    if (typeof body.title === "string") updates.title = sanitizeString(body.title, 200);
    if (typeof body.description === "string") updates.description = sanitizeString(body.description, 5000);
    if (typeof body.thumbnail === "string") updates.thumbnail = sanitizeString(body.thumbnail, 500);
    if (typeof body.genre === "string") updates.genre = sanitizeString(body.genre, 100);
    if (body.year !== undefined) updates.year = Number(body.year);
    if (body.rating !== undefined) updates.rating = Math.min(10, Math.max(0, Number(body.rating)));
    if (typeof body.videoUrl === "string") {
      const videoUrl = sanitizeString(body.videoUrl, 500);
      const source = detectVideoSource(videoUrl);
      if (!source) return res.status(400).json({ error: "videoUrl must be a YouTube, Google Drive, or Dailymotion link" });
      updates.videoUrl = videoUrl;
      updates.source = source;
    }
    if (Array.isArray(body.cast)) updates.cast = sanitizeCast(body.cast);
    updates.updatedAt = new Date().toISOString();

    await col.updateOne({ _id: new ObjectId(movieId) }, { $set: updates });
    const updated = await col.findOne({ _id: new ObjectId(movieId) });
    return res.status(200).json({ movie: updated });
  }

  // ── DELETE /api/theater/:id ───────────────────────────────────────────────
  if (method === "DELETE" && movieId) {
    if (!ObjectId.isValid(movieId)) {
      return res.status(400).json({ error: "Invalid movie id" });
    }
    const result = await col.deleteOne({ _id: new ObjectId(movieId) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Movie not found" });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

export { getEmbedUrl, detectVideoSource };
