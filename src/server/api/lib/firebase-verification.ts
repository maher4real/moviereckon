import jwt from "jsonwebtoken";
import { FIREBASE_WEB_CONFIG, isFirebaseEmailVerificationConfigured } from "@/lib/firebaseConfig";

const FIREBASE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

type FirebaseTokenPayload = jwt.JwtPayload & {
  email?: string;
  email_verified?: boolean;
};

type FirebaseVerifyResult =
  | {
      ok: true;
      email: string;
      uid: string;
    }
  | {
      ok: false;
      errorCode: string;
    };

type GoogleCertCache = {
  certs: Record<string, string>;
  expiresAt: number;
};

let googleCertCache: GoogleCertCache | null = null;

function parseMaxAge(cacheControlHeader: string | null): number {
  if (!cacheControlHeader) return 0;

  const match = cacheControlHeader.match(/max-age=(\d+)/i);
  if (!match) return 0;

  const seconds = Number.parseInt(match[1] || "", 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return seconds * 1000;
}

async function getGoogleFirebaseCerts(): Promise<Record<string, string>> {
  if (googleCertCache && googleCertCache.expiresAt > Date.now()) {
    return googleCertCache.certs;
  }

  const response = await fetch(FIREBASE_CERTS_URL, {
    cache: "force-cache",
    next: {
      revalidate: 60 * 60,
      tags: ["firebase-auth-certs"],
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Firebase public certificates");
  }

  const certs = (await response.json()) as Record<string, string>;
  googleCertCache = {
    certs,
    expiresAt: Date.now() + parseMaxAge(response.headers.get("cache-control")),
  };

  return certs;
}

export async function verifyFirebaseEmailProof(
  idToken: string,
  expectedEmail: string,
): Promise<FirebaseVerifyResult> {
  if (!isFirebaseEmailVerificationConfigured()) {
    return { ok: false, errorCode: "firebase_not_configured" };
  }

  if (!idToken || idToken.trim().length === 0) {
    return { ok: false, errorCode: "missing_firebase_token" };
  }

  const decoded = jwt.decode(idToken, { complete: true });
  const header = decoded && typeof decoded === "object" ? decoded.header : null;
  const kid = header && typeof header.kid === "string" ? header.kid : "";
  if (!kid) {
    return { ok: false, errorCode: "invalid_firebase_token" };
  }

  const certs = await getGoogleFirebaseCerts();
  const cert = certs[kid];
  if (!cert) {
    return { ok: false, errorCode: "unknown_firebase_key" };
  }

  try {
    const payload = jwt.verify(idToken, cert, {
      algorithms: ["RS256"],
      audience: FIREBASE_WEB_CONFIG.projectId,
      issuer: `https://securetoken.google.com/${FIREBASE_WEB_CONFIG.projectId}`,
    }) as FirebaseTokenPayload;

    if (!payload.sub || payload.sub.length === 0) {
      return { ok: false, errorCode: "invalid_firebase_subject" };
    }

    if (payload.email_verified !== true) {
      return { ok: false, errorCode: "firebase_email_not_verified" };
    }

    const tokenEmail = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!tokenEmail || tokenEmail !== expectedEmail.toLowerCase()) {
      return { ok: false, errorCode: "firebase_email_mismatch" };
    }

    return {
      ok: true,
      email: tokenEmail,
      uid: payload.sub,
    };
  } catch (error) {
    console.error("Firebase token verification error:", error);
    return { ok: false, errorCode: "invalid_firebase_token" };
  }
}
