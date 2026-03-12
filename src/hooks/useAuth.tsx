/**
 * Auth Hook - MongoDB Backend Only
 * No fallback to other services
 */
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import * as mongoClient from "@/lib/mongodbClient";
import {
  clearFirebaseVerificationSession,
  getFirebaseVerifiedIdToken,
  isFirebaseVerificationEnabled,
  provisionFirebaseVerificationForSignup,
  resendFirebaseVerificationEmail,
  rollbackFirebaseVerificationSignup,
} from "@/lib/firebaseEmailVerification";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: mongoClient.MongoUser | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticating: boolean;
  authTransitionRunId: number;
  triggerAuthTransition: () => void;
  signUp: (
    email: string,
    password: string,
    username: string,
    captchaToken: string,
  ) => Promise<{
    error: Error | null;
    requiresEmailVerification: boolean;
    verificationPreviewUrl: string | null;
    verificationProvider: mongoClient.EmailVerificationProvider;
  }>;
  signIn: (
    email: string,
    password: string,
    captchaToken: string,
  ) => Promise<{
    error: Error | null;
    code: mongoClient.AuthErrorCode;
    verificationProvider: mongoClient.EmailVerificationProvider | null;
  }>;
  resendVerificationEmail: (
    email: string,
    password: string,
    captchaToken: string,
    verificationProvider: mongoClient.EmailVerificationProvider,
  ) => Promise<{ error: Error | null; verificationPreviewUrl: string | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
  initialUser?: mongoClient.MongoUser | null;
  authResolved?: boolean;
};

export function AuthProvider({
  children,
  initialUser,
  authResolved = false,
}: AuthProviderProps) {
  const mapUserToProfile = (user: mongoClient.MongoUser): Profile => ({
    id: user.id,
    user_id: user.id,
    username: user.username,
    avatar_url: user.avatar_url,
    created_at: user.created_at,
    updated_at: user.updated_at,
  });

  const [user, setUser] = useState<mongoClient.MongoUser | null>(
    () => initialUser ?? null,
  );
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (initialUser) return mapUserToProfile(initialUser);
    return null;
  });
  const [isLoading, setIsLoading] = useState(!authResolved);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authTransitionRunId, setAuthTransitionRunId] = useState(1);
  const { toast } = useToast();

  const triggerAuthTransition = useCallback(() => {
    setAuthTransitionRunId((prev) => prev + 1);
  }, []);

  // Initialize auth from stored tokens
  const initAuth = useCallback(async () => {
    try {
      // Try to get current user from cookie-based session first
      const currentUser = await mongoClient.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        setProfile(mapUserToProfile(currentUser));
      } else {
        // Access cookie may be expired; try refresh cookie flow.
        const refreshed = await mongoClient.refreshAccessToken();
        if (refreshed) {
          const refreshedUser = await mongoClient.getCurrentUser();
          if (refreshedUser) {
            setUser(refreshedUser);
            setProfile(mapUserToProfile(refreshedUser));
          } else {
            setUser(null);
            setProfile(null);
          }
        } else {
          setUser(null);
          setProfile(null);
        }
      }
    } catch (error) {
      console.error("Auth init error:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authResolved) return;
    initAuth();
  }, [authResolved, initAuth]);

  // Sign Up
  const signUp = async (
    email: string,
    password: string,
    username: string,
    captchaToken: string,
  ) => {
    setIsAuthenticating(true);
    try {
      const verificationProvider: mongoClient.EmailVerificationProvider =
        isFirebaseVerificationEnabled() ? "firebase" : "internal";

      if (verificationProvider === "firebase") {
        const firebaseSignup = await provisionFirebaseVerificationForSignup(email, password);
        if (!firebaseSignup.ok) {
          toast({
            variant: "destructive",
            title: "Sign up failed",
            description: firebaseSignup.message,
          });
          return {
            error: new Error(firebaseSignup.message),
            requiresEmailVerification: false,
            verificationPreviewUrl: null,
            verificationProvider,
          };
        }
      }

      const {
        user: newUser,
        error,
        requiresEmailVerification,
        verificationPreviewUrl,
        verificationProvider: registeredVerificationProvider,
      } = await mongoClient.register(email, password, username, captchaToken, verificationProvider);

      if (error) {
        if (verificationProvider === "firebase") {
          await rollbackFirebaseVerificationSignup();
        }
        toast({
          variant: "destructive",
          title: "Sign up failed",
          description: error,
        });
        return {
          error: new Error(error),
          requiresEmailVerification: false,
          verificationPreviewUrl: null,
          verificationProvider,
        };
      }

      if (requiresEmailVerification) {
        if (verificationProvider === "firebase") {
          await clearFirebaseVerificationSession();
        }
        setUser(null);
        setProfile(null);
        toast({
          title: "Verify your email",
          description: "Account created. Check your inbox before signing in.",
        });
        return {
          error: null,
          requiresEmailVerification: true,
          verificationPreviewUrl,
          verificationProvider: registeredVerificationProvider,
        };
      }

      if (verificationProvider === "firebase") {
        await rollbackFirebaseVerificationSignup();
      }

      if (newUser) {
        setUser(newUser);
        setProfile(mapUserToProfile(newUser));
      }

      toast({
        title: "Welcome!",
        description: "Your account has been created successfully.",
      });

      return {
        error: null,
        requiresEmailVerification: false,
        verificationPreviewUrl: null,
        verificationProvider: registeredVerificationProvider,
      };
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Sign In
  const signIn = async (email: string, password: string, captchaToken: string) => {
    setIsAuthenticating(true);
    try {
      let {
        user: loggedInUser,
        error,
        code,
        verificationProvider,
      } = await mongoClient.login(email, password, captchaToken);

      if (code === "email_not_verified" && verificationProvider === "firebase" && isFirebaseVerificationEnabled()) {
        const firebaseVerification = await getFirebaseVerifiedIdToken(email, password);
        if (!firebaseVerification.ok) {
          const firebaseVerificationProvider: mongoClient.EmailVerificationProvider = "firebase";
          const mappedAuthCode: mongoClient.AuthErrorCode =
            firebaseVerification.code === "auth/email-not-verified" ? "email_not_verified" : null;
          toast({
            variant: mappedAuthCode === "email_not_verified" ? "default" : "destructive",
            title: mappedAuthCode === "email_not_verified" ? "Verify your email" : "Sign in failed",
            description: firebaseVerification.message,
          });
          return {
            error: new Error(firebaseVerification.message),
            code: mappedAuthCode,
            verificationProvider: firebaseVerificationProvider,
          };
        }

        if (!firebaseVerification.idToken) {
          const firebaseVerificationProvider: mongoClient.EmailVerificationProvider = "firebase";
          toast({
            variant: "destructive",
            title: "Sign in failed",
            description: "Firebase verification proof was missing. Please try again.",
          });
          return {
            error: new Error("Firebase verification proof was missing. Please try again."),
            code: null,
            verificationProvider: firebaseVerificationProvider,
          };
        }

        await clearFirebaseVerificationSession();
        ({
          user: loggedInUser,
          error,
          code,
          verificationProvider,
        } = await mongoClient.login(email, password, captchaToken, firebaseVerification.idToken));
      }

      if (error) {
        toast({
          variant: code === "email_not_verified" ? "default" : "destructive",
          title: code === "email_not_verified" ? "Verify your email" : "Sign in failed",
          description: error,
        });
        return { error: new Error(error), code, verificationProvider };
      }

      if (loggedInUser) {
        setUser(loggedInUser);
        setProfile(mapUserToProfile(loggedInUser));
      }

      toast({
        title: "Welcome back!",
        description: "You've been signed in successfully.",
      });

      return { error: null, code: null, verificationProvider: null };
    } finally {
      setIsAuthenticating(false);
    }
  };

  const resendVerificationEmail = async (
    email: string,
    password: string,
    captchaToken: string,
    verificationProvider: mongoClient.EmailVerificationProvider,
  ) => {
    setIsAuthenticating(true);
    try {
      if (verificationProvider === "firebase" && isFirebaseVerificationEnabled()) {
        const firebaseResend = await resendFirebaseVerificationEmail(email, password);
        if (!firebaseResend.ok) {
          toast({
            variant: firebaseResend.code === "auth/already-verified" ? "default" : "destructive",
            title: firebaseResend.code === "auth/already-verified" ? "Already verified" : "Resend failed",
            description: firebaseResend.message,
          });
          return { error: new Error(firebaseResend.message), verificationPreviewUrl: null };
        }

        toast({
          title: "Verification email sent",
          description: "Check your inbox for a fresh verification link.",
        });
        return { error: null, verificationPreviewUrl: null };
      }

      const { error, verificationPreviewUrl } = await mongoClient.resendVerificationEmail(email, captchaToken);

      if (error) {
        toast({
          variant: "destructive",
          title: "Resend failed",
          description: error,
        });
        return { error: new Error(error), verificationPreviewUrl: null };
      }

      toast({
        title: "Verification email sent",
        description: "Check your inbox for a fresh verification link.",
      });

      return { error: null, verificationPreviewUrl };
    } finally {
      setIsAuthenticating(false);
    }
  };

  const signInWithGoogle = async () => {
    setIsAuthenticating(true);
    try {
      const returnTo =
        typeof window !== "undefined" ? `${window.location.origin}/home` : "/home";
      mongoClient.signInWithGoogle(returnTo);
      return { error: null };
    } catch (error) {
      console.error("Google sign-in error:", error);
      toast({
        variant: "destructive",
        title: "Google sign in failed",
        description: "Unable to start Google sign-in. Please try again.",
      });
      return { error: new Error("Failed to start Google sign-in") };
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Sign Out
  const signOut = async () => {
    await mongoClient.logout();
    setUser(null);
    setProfile(null);

    toast({
      title: "Signed out",
      description: "You've been signed out successfully.",
    });
  };

  // Update Profile
  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return false;

    const updated = await mongoClient.updateProfile({
      username: updates.username,
      avatar_url:
        updates.avatar_url === undefined ? undefined : updates.avatar_url,
    });

    if (!updated) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: "Failed to update profile",
      });
      return false;
    }

    setUser(updated);
    setProfile(mapUserToProfile(updated));
    toast({
      title: "Profile updated",
      description: "Your profile has been updated successfully.",
    });
    return true;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        isAuthenticating,
        authTransitionRunId,
        triggerAuthTransition,
        signUp,
        signIn,
        resendVerificationEmail,
        signInWithGoogle,
        signOut,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
