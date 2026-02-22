/**
 * Auth Hook - MongoDB Backend Only
 * No fallback to other services
 */
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import * as mongoClient from "@/lib/mongodbClient";
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
  signUp: (email: string, password: string, username: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const mapUserToProfile = (user: mongoClient.MongoUser): Profile => ({
    id: user.id,
    user_id: user.id,
    username: user.username,
    avatar_url: user.avatar_url,
    created_at: user.created_at,
    updated_at: user.updated_at,
  });

  const [user, setUser] = useState<mongoClient.MongoUser | null>(() => mongoClient.getStoredUser());
  const [profile, setProfile] = useState<Profile | null>(() => {
    const storedUser = mongoClient.getStoredUser();
    return storedUser ? mapUserToProfile(storedUser) : null;
  });
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

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
    initAuth();
  }, [initAuth]);

  // Sign Up
  const signUp = async (email: string, password: string, username: string) => {
    const { user: newUser, error } = await mongoClient.register(email, password, username);
    
    if (error) {
      toast({
        variant: "destructive",
        title: "Sign up failed",
        description: error,
      });
      return { error: new Error(error) };
    }

    if (newUser) {
      setUser(newUser);
      setProfile(mapUserToProfile(newUser));
    }

    toast({
      title: "Welcome!",
      description: "Your account has been created successfully.",
    });

    return { error: null };
  };

  // Sign In
  const signIn = async (email: string, password: string) => {
    const { user: loggedInUser, error } = await mongoClient.login(email, password);
    
    if (error) {
      toast({
        variant: "destructive",
        title: "Sign in failed",
        description: error,
      });
      return { error: new Error(error) };
    }

    if (loggedInUser) {
      setUser(loggedInUser);
      setProfile(mapUserToProfile(loggedInUser));
    }

    toast({
      title: "Welcome back!",
      description: "You've been signed in successfully.",
    });

    return { error: null };
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
    if (!user) return;

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
      return;
    }

    setUser(updated);
    setProfile(mapUserToProfile(updated));
    toast({
      title: "Profile updated",
      description: "Your profile has been updated successfully.",
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        signUp,
        signIn,
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
