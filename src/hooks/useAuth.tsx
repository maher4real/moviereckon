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
  const [user, setUser] = useState<mongoClient.MongoUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Initialize auth from stored tokens
  const initAuth = useCallback(async () => {
    try {
      // Try to get current user from cookie-based session first
      const currentUser = await mongoClient.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        setProfile({
          id: currentUser.id,
          user_id: currentUser.id,
          username: currentUser.username,
          avatar_url: currentUser.avatar_url,
          created_at: currentUser.created_at,
          updated_at: currentUser.updated_at,
        });
      } else {
        // Access cookie may be expired; try refresh cookie flow.
        const refreshed = await mongoClient.refreshAccessToken();
        if (refreshed) {
          const refreshedUser = await mongoClient.getCurrentUser();
          if (refreshedUser) {
            setUser(refreshedUser);
            setProfile({
              id: refreshedUser.id,
              user_id: refreshedUser.id,
              username: refreshedUser.username,
              avatar_url: refreshedUser.avatar_url,
              created_at: refreshedUser.created_at,
              updated_at: refreshedUser.updated_at,
            });
          }
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
      setProfile({
        id: newUser.id,
        user_id: newUser.id,
        username: newUser.username,
        avatar_url: newUser.avatar_url,
        created_at: newUser.created_at,
        updated_at: newUser.updated_at,
      });
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
      setProfile({
        id: loggedInUser.id,
        user_id: loggedInUser.id,
        username: loggedInUser.username,
        avatar_url: loggedInUser.avatar_url,
        created_at: loggedInUser.created_at,
        updated_at: loggedInUser.updated_at,
      });
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
    setProfile({
      id: updated.id,
      user_id: updated.id,
      username: updated.username,
      avatar_url: updated.avatar_url,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    });
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
