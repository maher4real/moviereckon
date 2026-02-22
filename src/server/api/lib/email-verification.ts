import { createHash, randomBytes } from "crypto";
import type { Db } from "mongodb";

const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function getPepper(): string {
  const explicitPepper = process.env.EMAIL_VERIFICATION_TOKEN_PEPPER;
  if (typeof explicitPepper === "string" && explicitPepper.trim().length > 0) {
    return explicitPepper.trim();
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (typeof jwtSecret === "string" && jwtSecret.trim().length > 0) {
    return jwtSecret.trim();
  }

  return "";
}

export function hashEmailVerificationToken(token: string): string {
  const pepper = getPepper();
  if (!pepper) {
    throw new Error("EMAIL_VERIFICATION_TOKEN_PEPPER or JWT_SECRET must be configured");
  }
  return createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}

export async function createEmailVerificationToken(
  db: Db,
  params: { userId: string; email: string },
): Promise<{ rawToken: string; expiresAt: string }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAtIso = new Date(now.getTime() + EMAIL_VERIFICATION_TOKEN_TTL_MS).toISOString();
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashEmailVerificationToken(rawToken);

  await db.collection("email_verification_tokens").deleteMany({
    user_id: params.userId,
    used_at: null,
  });

  await db.collection("email_verification_tokens").insertOne({
    user_id: params.userId,
    email: params.email,
    token_hash: tokenHash,
    created_at: nowIso,
    expires_at: expiresAtIso,
    used_at: null,
  });

  return {
    rawToken,
    expiresAt: expiresAtIso,
  };
}

export async function consumeEmailVerificationToken(
  db: Db,
  rawToken: string,
): Promise<{ userId: string | null; errorCode: string | null }> {
  if (!rawToken || rawToken.trim().length === 0) {
    return { userId: null, errorCode: "missing_token" };
  }

  const tokenHash = hashEmailVerificationToken(rawToken.trim());
  const tokenRecord = await db.collection("email_verification_tokens").findOne({
    token_hash: tokenHash,
    used_at: null,
  });

  if (!tokenRecord) {
    return { userId: null, errorCode: "invalid_token" };
  }

  const expiresAt = new Date(tokenRecord.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    return { userId: null, errorCode: "expired_token" };
  }

  const markUsedResult = await db.collection("email_verification_tokens").updateOne(
    { _id: tokenRecord._id, used_at: null },
    { $set: { used_at: new Date().toISOString() } },
  );

  if (markUsedResult.modifiedCount !== 1) {
    return { userId: null, errorCode: "invalid_token" };
  }

  return { userId: tokenRecord.user_id, errorCode: null };
}
