import { initializeApp, getApp, getApps, type FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  inMemoryPersistence,
  sendEmailVerification,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  deleteUser,
} from "firebase/auth";
import { FIREBASE_WEB_CONFIG, isFirebaseEmailVerificationConfigured } from "@/lib/firebaseConfig";

type FirebaseVerificationResult =
  | { ok: true; idToken?: string }
  | { ok: false; code: string; message: string };

const FIREBASE_FALLBACK_ERROR_CODES = new Set([
  "auth/network-request-failed",
  "auth/internal-error",
  "auth/invalid-api-key",
  "auth/app-not-authorized",
  "auth/operation-not-allowed",
  "auth/unauthorized-continue-uri",
  "auth/invalid-continue-uri",
  "auth/missing-continue-uri",
  "auth/too-many-requests",
]);

let authPersistencePromise: Promise<ReturnType<typeof getAuth>> | null = null;

function mapFirebaseAuthError(error: unknown): { code: string; message: string } {
  const firebaseError = error as FirebaseError | undefined;
  const code = typeof firebaseError?.code === "string" ? firebaseError.code : "auth/unknown";

  const messages: Record<string, string> = {
    "auth/email-already-in-use": "Email already registered",
    "auth/invalid-email": "Please provide a valid email address",
    "auth/invalid-credential": "Invalid email or password",
    "auth/missing-password": "Password is required",
    "auth/network-request-failed": "Network error. Please try again.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/user-not-found": "Invalid email or password",
    "auth/wrong-password": "Invalid email or password",
  };

  return {
    code,
    message: messages[code] || "Firebase verification failed. Please try again.",
  };
}

function getBrowserOrigin(): string {
  if (typeof window === "undefined" || !window.location.origin) {
    throw new Error("Firebase email verification requires a browser environment");
  }

  return window.location.origin;
}

function getActionCodeSettings() {
  return {
    url: `${getBrowserOrigin()}/auth?email_verified=1`,
    handleCodeInApp: false,
  };
}

async function getConfiguredAuth() {
  if (!isFirebaseEmailVerificationConfigured()) {
    throw new Error("Firebase email verification is not configured");
  }

  if (!authPersistencePromise) {
    authPersistencePromise = (async () => {
      const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_WEB_CONFIG);
      const auth = getAuth(app);
      await setPersistence(auth, inMemoryPersistence);
      return auth;
    })();
  }

  return authPersistencePromise;
}

async function signOutSafely() {
  const auth = await getConfiguredAuth();
  if (auth.currentUser) {
    await signOut(auth);
  }
}

export function isFirebaseVerificationEnabled(): boolean {
  return typeof window !== "undefined" && isFirebaseEmailVerificationConfigured();
}

export async function provisionFirebaseVerificationForSignup(
  email: string,
  password: string,
): Promise<FirebaseVerificationResult> {
  let createdUser: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>["user"] | null = null;
  try {
    const auth = await getConfiguredAuth();
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    createdUser = credential.user;
    await sendEmailVerification(credential.user, getActionCodeSettings());
    return { ok: true };
  } catch (error) {
    if (createdUser) {
      try {
        await deleteUser(createdUser);
      } catch {
        // Ignore cleanup errors and fall through to the surfaced signup error.
      }
    }
    try {
      await signOutSafely();
    } catch {
      // Ignore cleanup errors.
    }
    return { ok: false, ...mapFirebaseAuthError(error) };
  }
}

export function shouldFallbackToInternalVerification(result: FirebaseVerificationResult): boolean {
  return !result.ok && FIREBASE_FALLBACK_ERROR_CODES.has(result.code);
}

export async function rollbackFirebaseVerificationSignup(): Promise<void> {
  const auth = await getConfiguredAuth();
  if (!auth.currentUser) return;

  try {
    await deleteUser(auth.currentUser);
  } catch {
    // Ignore rollback failures. The local signup path will already surface the main error.
  }

  await signOutSafely();
}

export async function clearFirebaseVerificationSession(): Promise<void> {
  await signOutSafely();
}

export async function getFirebaseVerifiedIdToken(
  email: string,
  password: string,
): Promise<FirebaseVerificationResult> {
  try {
    const auth = await getConfiguredAuth();
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await credential.user.reload();

    if (!credential.user.emailVerified) {
      await signOut(auth);
      return {
        ok: false,
        code: "auth/email-not-verified",
        message: "Please verify your email before signing in.",
      };
    }

    const idToken = await credential.user.getIdToken(true);
    await signOut(auth);
    return { ok: true, idToken };
  } catch (error) {
    try {
      await signOutSafely();
    } catch {
      // Ignore cleanup errors.
    }

    return { ok: false, ...mapFirebaseAuthError(error) };
  }
}

export async function resendFirebaseVerificationEmail(
  email: string,
  password: string,
): Promise<FirebaseVerificationResult> {
  try {
    const auth = await getConfiguredAuth();
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await credential.user.reload();

    if (credential.user.emailVerified) {
      await signOut(auth);
      return {
        ok: false,
        code: "auth/already-verified",
        message: "This email is already verified.",
      };
    }

    await sendEmailVerification(credential.user, getActionCodeSettings());
    await signOut(auth);
    return { ok: true };
  } catch (error) {
    try {
      await signOutSafely();
    } catch {
      // Ignore cleanup errors.
    }

    return { ok: false, ...mapFirebaseAuthError(error) };
  }
}
