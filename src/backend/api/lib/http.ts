/**
 * Shared Pages API request/response types.
 *
 * These aliases preserve the names used by the handlers while keeping the
 * type boundary in the Next.js application. The handlers only consume the
 * request and response shapes; no Vercel builder runtime is required.
 */
import type { NextApiRequest, NextApiResponse } from "next";

export type VercelRequest = NextApiRequest;
export type VercelResponse = NextApiResponse;
