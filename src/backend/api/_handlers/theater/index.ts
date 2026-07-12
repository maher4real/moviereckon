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
import { getUserFromRequest, userHasRoleAtLeast } from "../../lib/auth.js";

async function isAdminRequest(req: VercelRequest): Promise<boolean> {
  const user = await getUserFromRequest(req);
  return user ? userHasRoleAtLeast(user, "admin") : false;
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
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return null;
    const host = parsed.hostname.toLowerCase();
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
      return getEmbedUrl(url, "youtube") ? "youtube" : null;
    }
    if (host === "drive.google.com") return getEmbedUrl(url, "gdrive") ? "gdrive" : null;
    if (["dailymotion.com", "www.dailymotion.com", "dai.ly", "geo.dailymotion.com"].includes(host)) {
      return getEmbedUrl(url, "dailymotion") ? "dailymotion" : null;
    }
    return null;
  } catch {
    return null;
  }
}

function getEmbedUrl(videoUrl: string, source: "youtube" | "gdrive" | "dailymotion"): string {
  try {
    const parsed = new URL(videoUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return "";
    const host = parsed.hostname.toLowerCase();
    const validId = (value: string | null | undefined) =>
      value && /^[a-zA-Z0-9_-]{6,128}$/.test(value) ? value : null;

    if (source === "gdrive" && host === "drive.google.com") {
      const id = validId(/^\/file\/d\/([^/]+)/.exec(parsed.pathname)?.[1]);
      return id ? `https://drive.google.com/file/d/${id}/preview` : "";
    }
    if (source === "dailymotion" && ["dailymotion.com", "www.dailymotion.com", "dai.ly", "geo.dailymotion.com"].includes(host)) {
      const id = host === "dai.ly"
        ? validId(parsed.pathname.split("/").filter(Boolean)[0])
        : host === "geo.dailymotion.com"
          ? validId(parsed.searchParams.get("video"))
          : validId(/^\/video\/([^_/?]+)/.exec(parsed.pathname)?.[1]);
      return id ? `https://geo.dailymotion.com/player.html?video=${id}` : "";
    }
    if (source === "youtube" && ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
      const id = host === "youtu.be"
        ? validId(parsed.pathname.split("/").filter(Boolean)[0])
        : parsed.pathname.startsWith("/embed/")
          ? validId(parsed.pathname.split("/")[2])
          : validId(parsed.searchParams.get("v"));
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }
  } catch {
    return "";
  }
  return "";
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
      photo: sanitizeString((m as Record<string, unknown>).photo, 2048),
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
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "Admin access required" });

  // ── POST /api/theater ─────────────────────────────────────────────────────
  if (method === "POST" && !movieId) {
    const body = req.body as Record<string, unknown>;
    const title = sanitizeString(body.title, 200);
    const description = sanitizeString(body.description, 5000);
    const thumbnail = sanitizeString(body.thumbnail, 2048);
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
    if (typeof body.thumbnail === "string") updates.thumbnail = sanitizeString(body.thumbnail, 2048);
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
