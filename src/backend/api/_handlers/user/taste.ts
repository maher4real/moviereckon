/**
 * GET/PUT /api/user/taste and POST /api/user/taste/reset.
 *
 * Taste controls are user-owned inputs to the rebuildable profile. Resetting
 * stores a boundary so old activity cannot silently teach the same profile
 * again; excluding an activity title removes it from learning while keeping
 * watched/liked eligibility rules intact.
 */
import type { VercelRequest, VercelResponse } from "../../lib/http";
import { connectToDatabase } from "../../lib/mongodb.js";
import { getUserFromRequest } from "../../lib/auth.js";
import { enforceRequestRateLimit } from "../../lib/request-rate-limit.js";
import {
  loadRecommendationTaste,
  loadRecommendationTasteControls,
  resetRecommendationTaste,
  updateRecommendationTasteControls,
} from "@/backend/services/recommendationTaste";

function getPath(req: VercelRequest): string {
  const host = typeof req.headers.host === "string" ? req.headers.host : "localhost";
  return new URL(req.url || "/api/user/taste", `http://${host}`).pathname;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Invalid or expired token" });

  const method = (req.method || "GET").toUpperCase();
  const methodLimit = method === "GET"
    ? { maxRequests: 80, windowMs: 5 * 60 * 1000 }
    : method === "PUT" || method === "POST"
      ? { maxRequests: 30, windowMs: 10 * 60 * 1000 }
      : null;
  if (
    methodLimit &&
    (await enforceRequestRateLimit({
      req,
      res,
      route: "user_taste",
      reason: "taste_limit",
      errorMessage: "Too many taste requests. Please try again shortly.",
      metadata: { method },
      rules: [{
        key: `user:taste:user:${user.id}:${method}`,
        maxRequests: methodLimit.maxRequests,
        windowMs: methodLimit.windowMs,
        metadataKey: "user",
      }],
    }))
  ) {
    return;
  }

  if (method !== "GET" && method !== "PUT" && method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { db } = await connectToDatabase();
    if (method === "GET") {
      const [taste, controls] = await Promise.all([
        loadRecommendationTaste(db, user.id, { includeExclusions: false }),
        loadRecommendationTasteControls(db, user.id),
      ]);
      return res.status(200).json({ data: { profile: taste.profile, controls } });
    }

    if (method === "PUT") {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const hasMode = body.exploration_mode !== undefined;
      const hasExclude = body.exclude_learning_key !== undefined;
      const hasRestore = body.restore_learning_key !== undefined;
      if (!hasMode && !hasExclude && !hasRestore) {
        return res.status(400).json({ error: "At least one taste control is required" });
      }
      if (hasExclude && hasRestore) {
        return res.status(400).json({ error: "Choose either exclude or restore for one activity" });
      }
      if (
        (hasMode && body.exploration_mode !== "familiar" && body.exploration_mode !== "adventurous") ||
        (hasExclude && typeof body.exclude_learning_key !== "string") ||
        (hasRestore && typeof body.restore_learning_key !== "string")
      ) {
        return res.status(400).json({ error: "Invalid taste control payload" });
      }
      const controls = await updateRecommendationTasteControls(db, user.id, {
        explorationMode: body.exploration_mode,
        excludedLearningKey: body.exclude_learning_key,
        restoreLearningKey: body.restore_learning_key,
      });
      const taste = await loadRecommendationTaste(db, user.id, { includeExclusions: false });
      return res.status(200).json({ data: { profile: taste.profile, controls } });
    }

    const path = getPath(req);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!path.endsWith("/reset") && body.action !== "reset") {
      return res.status(400).json({ error: "Unknown taste action" });
    }
    const controls = await resetRecommendationTaste(db, user.id);
    const taste = await loadRecommendationTaste(db, user.id, { includeExclusions: false });
    return res.status(200).json({ data: { profile: taste.profile, controls } });
  } catch (error) {
    console.error("Taste controls handler error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
