/** Part of the frontend API client; re-exported from `@/frontend/lib/mongodbClient`. */
import { MONGODB_API_URL, refreshPromise, fetchWithAuth, clearTokens, setStoredUser } from "./http";
import type { MongoUser, AuthErrorCode, RegistrationAvailability, GoogleOneTapConfig } from "./models";

export async function register(
  email: string,
  password: string,
  username: string,
  captchaToken: string,
): Promise<{
  user: MongoUser | null;
  error: string | null;
  requiresEmailVerification: boolean;
}> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        email,
        password,
        username,
        captcha_token: captchaToken,
      }),
      credentials: "include",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        user: null,
        error:
          typeof data.error === "string"
            ? data.error
            : response.status >= 500
              ? "Registration failed. Please try again."
              : "Registration failed",
        requiresEmailVerification: false,
      };
    }

    const requiresEmailVerification = data.requires_email_verification === true;
    const registeredUser = data.user ?? null;

    if (registeredUser && !requiresEmailVerification) {
      // Legacy fallback (disabled for security):
      // setTokens(data.accessToken, data.refreshToken);
      setStoredUser(registeredUser);
    }

    return {
      user: registeredUser,
      error: null,
      requiresEmailVerification,
    };
  } catch (error) {
    console.error("Registration error:", error);
    return {
      user: null,
      error: "Network error. Backend may be unavailable.",
      requiresEmailVerification: false,
    };
  }
}

export async function login(
  email: string,
  password: string,
  captchaToken: string,
): Promise<{
  user: MongoUser | null;
  error: string | null;
  code: AuthErrorCode;
}> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        email,
        password,
        captcha_token: captchaToken,
      }),
      credentials: "include",
    });

    const data = await response.json();
    const errorCode = data.code === "email_not_verified" ? "email_not_verified" : null;

    if (!response.ok) {
      return {
        user: null,
        error: data.error || "Login failed",
        code: errorCode,
      };
    }

    // Legacy fallback (disabled for security):
    // setTokens(data.accessToken, data.refreshToken);
    setStoredUser(data.user);

    return { user: data.user, error: null, code: null };
  } catch (error) {
    console.error("Login error:", error);
    return {
      user: null,
      error: "Network error. Backend may be unavailable.",
      code: null,
    };
  }
}

export async function resendVerificationEmail(email: string): Promise<{
  error: string | null;
  message: string | null;
}> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/resend-verification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ email }),
      credentials: "include",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        error:
          typeof data.error === "string"
            ? data.error
            : response.status >= 500
              ? "Unable to resend verification email right now."
              : "Unable to resend verification email.",
        message: null,
      };
    }

    return {
      error: null,
      message:
        typeof data.message === "string"
          ? data.message
          : "If the account exists and still needs verification, we sent a fresh verification email.",
    };
  } catch (error) {
    console.error("Resend verification error:", error);
    return {
      error: "Network error. Backend may be unavailable.",
      message: null,
    };
  }
}

export async function requestPasswordReset(
  email: string,
  captchaToken: string,
): Promise<{
  error: string | null;
  message: string | null;
}> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        email,
        captcha_token: captchaToken,
      }),
      credentials: "include",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        error:
          typeof data.error === "string"
            ? data.error
            : response.status >= 500
              ? "Unable to send reset email right now."
              : "Unable to send reset email.",
        message: null,
      };
    }

    return {
      error: null,
      message:
        typeof data.message === "string"
          ? data.message
          : "If an account exists for that email, we sent password reset instructions.",
    };
  } catch (error) {
    console.error("Forgot password error:", error);
    return {
      error: "Network error. Backend may be unavailable.",
      message: null,
    };
  }
}

export async function verifyEmail(
  email: string,
  token: string,
): Promise<{
  error: string | null;
  message: string | null;
  alreadyVerified: boolean;
}> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/verify-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ email, token }),
      credentials: "include",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        error:
          typeof data.error === "string"
            ? data.error
            : "Unable to verify this email link.",
        message: null,
        alreadyVerified: false,
      };
    }

    return {
      error: null,
      message:
        typeof data.message === "string" ? data.message : "Email verified successfully.",
      alreadyVerified: data.alreadyVerified === true,
    };
  } catch (error) {
    console.error("Verify email error:", error);
    return {
      error: "Network error. Backend may be unavailable.",
      message: null,
      alreadyVerified: false,
    };
  }
}

export async function resetPassword(
  email: string,
  token: string,
  password: string,
): Promise<{
  error: string | null;
  message: string | null;
}> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ email, token, password }),
      credentials: "include",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        error:
          typeof data.error === "string"
            ? data.error
            : response.status >= 500
              ? "Unable to reset password right now."
              : "Unable to reset password.",
        message: null,
      };
    }

    clearTokens();

    return {
      error: null,
      message:
        typeof data.message === "string"
          ? data.message
          : "Password reset successfully. You can sign in now.",
    };
  } catch (error) {
    console.error("Reset password error:", error);
    return {
      error: "Network error. Backend may be unavailable.",
      message: null,
    };
  }
}

export function getGoogleSignInUrl(returnTo: string): string {
  const query = new URLSearchParams({ returnTo });
  return `${MONGODB_API_URL}/api/auth/google-start?${query.toString()}`;
}

export async function getGoogleOneTapConfig(): Promise<GoogleOneTapConfig> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/google-one-tap`, {
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));

    return {
      enabled: data.enabled === true && typeof data.client_id === "string" && data.client_id.length > 0,
      client_id: typeof data.client_id === "string" ? data.client_id : null,
      nonce: typeof data.nonce === "string" ? data.nonce : null,
    };
  } catch {
    return {
      enabled: false,
      client_id: null,
      nonce: null,
    };
  }
}

export function signInWithGoogle(returnTo?: string): void {
  if (typeof window === "undefined") return;

  const fallbackReturnTo = `${window.location.origin}/home`;
  const targetReturnTo =
    typeof returnTo === "string" && returnTo.trim().length > 0
      ? returnTo
      : fallbackReturnTo;

  window.location.assign(getGoogleSignInUrl(targetReturnTo));
}

export async function signInWithGoogleCredential(credential: string): Promise<{
  user: MongoUser | null;
  error: string | null;
  code: string | null;
}> {
  try {
    const response = await fetch(`${MONGODB_API_URL}/api/auth/google-one-tap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ credential }),
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        user: null,
        error:
          typeof data.error === "string"
            ? data.error
            : response.status >= 500
              ? "Google sign-in could not be completed. Please try again."
              : "Google sign-in failed",
        code: typeof data.code === "string" ? data.code : null,
      };
    }

    const authenticatedUser = data.user ?? null;
    if (authenticatedUser) {
      setStoredUser(authenticatedUser);
    }

    return {
      user: authenticatedUser,
      error: null,
      code: null,
    };
  } catch (error) {
    console.error("Google credential sign-in error:", error);
    return {
      user: null,
      error: "Network error. Backend may be unavailable.",
      code: null,
    };
  }
}

export async function logout(options: { keepalive?: boolean } = {}): Promise<void> {
  // A refresh response can set fresh cookies. Let any in-flight refresh finish
  // first so the logout response is guaranteed to be the final cookie update.
  if (refreshPromise) {
    await refreshPromise;
  }
  clearTokens();

  const requestOptions: RequestInit = {
    method: "POST",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
    },
    credentials: "include",
    keepalive: options.keepalive === true,
    cache: "no-store",
  };

  try {
    // Clear both session systems. The legacy endpoint owns the app's access
    // and refresh cookies; Better Auth can also be accepted by the backend
    // and therefore must be signed out explicitly.
    const [logoutResponse] = await Promise.all([
      fetch(`${MONGODB_API_URL}/api/auth/logout`, requestOptions),
      fetch(`${MONGODB_API_URL}/api/better-auth/sign-out`, requestOptions).catch(() => null),
    ]);

    if (!logoutResponse.ok) {
      throw new Error(`Logout failed with status ${logoutResponse.status}`);
    }

    // Legacy fallback (disabled for security):
    // const refreshToken = getRefreshToken();
    // if (refreshToken) {
    //   await fetch(`${MONGODB_API_URL}/api/auth/logout`, {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ refreshToken }),
    //   });
    // }
  } catch (error) {
    console.error("Logout error:", error);
    throw error;
  }
}

export async function getCurrentUser(): Promise<MongoUser | null> {
  try {
    const response = await fetchWithAuth("/api/auth/me");
    
    if (!response.ok) {
      if (response.status === 401) {
        clearTokens();
      }
      return null;
    }

    const data = await response.json();
    setStoredUser(data.user);
    return data.user;
  } catch {
    return null;
  }
}

// ========== User Data API ==========

export async function checkRegistrationAvailability(payload: {
  email?: string;
  username?: string;
}): Promise<RegistrationAvailability | null> {
  try {
    const query = new URLSearchParams();
    const normalizedEmail = payload.email?.trim();
    const normalizedUsername = payload.username?.trim();

    if (normalizedEmail) query.set("email", normalizedEmail);
    if (normalizedUsername) query.set("username", normalizedUsername);
    if (!query.toString()) return null;

    const response = await fetch(`${MONGODB_API_URL}/api/auth/availability?${query.toString()}`, {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "include",
    });

    if (!response.ok) return null;
    const data = await response.json();
    return {
      email_exists: data.email_exists === true,
      username_exists: data.username_exists === true,
    };
  } catch {
    return null;
  }
}
