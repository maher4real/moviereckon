/**
 * Auth Hook - MongoDB Backend Only
 * No fallback to other services
 */
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import * as mongoClient from "@/frontend/lib/mongodbClient";
import { useToast } from "@/frontend/hooks/use-toast";
import { disableGoogleAutoSelect } from "@/frontend/lib/googleIdentity";

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
  }>;
  signIn: (
    email: string,
    password: string,
    captchaToken: string,
  ) => Promise<{
    error: Error | null;
    code: mongoClient.AuthErrorCode;
  }>;
  resendVerificationEmail: (email: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signInWithGoogleOneTap: (
    credential: string,
  ) => Promise<{ error: Error | null; code: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapUserToProfile(user: mongoClient.MongoUser): Profile {
  return {
    id: user.id,
    user_id: user.id,
    username: user.username,
    avatar_url: user.avatar_url,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

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
  const signUp: AuthContextType["signUp"] = async (
    email: string,
    password: string,
    username: string,
    captchaToken: string,
  ) => {
    setIsAuthenticating(true);
    try {
      const {
        user: newUser,
        error,
        requiresEmailVerification,
      } = await mongoClient.register(email, password, username, captchaToken);

      if (error) {
        toast({
          variant: "destructive",
          title: "Sign up failed",
          description: error,
        });
        return {
          error: new Error(error),
          requiresEmailVerification: false,
        };
      }

      if (requiresEmailVerification) {
        setUser(null);
        setProfile(null);
        toast({
          title: "Verify your email",
          description: "Account created. Check your inbox before signing in.",
        });
        return {
          error: null,
          requiresEmailVerification: true,
        };
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
      };
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Sign In
  const signIn: AuthContextType["signIn"] = async (
    email: string,
    password: string,
    captchaToken: string,
  ) => {
    setIsAuthenticating(true);
    try {
      const { user: loggedInUser, error, code } = await mongoClient.login(email, password, captchaToken);

      if (error) {
        toast({
          variant: code === "email_not_verified" ? "default" : "destructive",
          title: code === "email_not_verified" ? "Verify your email" : "Sign in failed",
          description: error,
        });
        return { error: new Error(error), code };
      }

      if (loggedInUser) {
        setUser(loggedInUser);
        setProfile(mapUserToProfile(loggedInUser));
      }

      toast({
        title: "Welcome back!",
        description: "You've been signed in successfully.",
      });

      return { error: null, code: null };
    } finally {
      setIsAuthenticating(false);
    }
  };

  const resendVerificationEmail: AuthContextType["resendVerificationEmail"] = async (
    email: string,
  ) => {
    setIsAuthenticating(true);
    try {
      const { error, message } = await mongoClient.resendVerificationEmail(email);
      if (error) {
        toast({
          variant: "destructive",
          title: "Resend failed",
          description: error,
        });
        return { error: new Error(error) };
      }

      toast({
        title: "Verification email sent",
        description: message || "Check your inbox for a fresh verification link.",
      });

      return { error: null };
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

  const signInWithGoogleOneTap: AuthContextType["signInWithGoogleOneTap"] = async (
    credential: string,
  ) => {
    setIsAuthenticating(true);
    try {
      const { user: googleUser, error, code } =
        await mongoClient.signInWithGoogleCredential(credential);

      if (error) {
        toast({
          variant: "destructive",
          title: "Google sign in failed",
          description: error,
        });
        return { error: new Error(error), code };
      }

      if (googleUser) {
        setUser(googleUser);
        setProfile(mapUserToProfile(googleUser));
      }

      toast({
        title: "Welcome back!",
        description: "You've been signed in successfully.",
      });

      return { error: null, code: null };
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Sign Out
  const signOut = async () => {
    disableGoogleAutoSelect();
    setUser(null);
    setProfile(null);

    toast({
      title: "Signed out",
      description: "You've been signed out successfully.",
    });

    void mongoClient.logout({ keepalive: true });
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
        signInWithGoogleOneTap,
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
