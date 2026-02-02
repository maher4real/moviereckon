/**
 * Unified Auth Hook with MongoDB + Lovable Cloud Fallback
 * 
 * This hook provides authentication that works with:
 * 1. MongoDB backend (when VITE_MONGODB_API_URL is set and backend is deployed)
 * 2. Lovable Cloud (Supabase) as fallback
 */
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/backendClient";
import * as mongoClient from "@/lib/mongodbClient";
import { useToast } from "@/hooks/use-toast";

// Determine which backend to use
const USE_MONGODB = mongoClient.isMongoDBConfigured();

interface Profile {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | mongoClient.MongoUser | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  backendType: "mongodb" | "supabase";
  signUp: (email: string, password: string, username: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | mongoClient.MongoUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // =========== Supabase Auth (Fallback) ===========
  const fetchSupabaseProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        return null;
      }

      return data as Profile;
    } catch (error) {
      console.error("Error fetching profile:", error);
      return null;
    }
  }, []);

  // =========== MongoDB Auth ===========
  const initMongoDBAuth = useCallback(async () => {
    try {
      // Check for existing token
      const token = mongoClient.getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      // Try to get current user
      const user = await mongoClient.getCurrentUser();
      if (user) {
        setUser(user);
        setProfile({
          id: user.id,
          user_id: user.id,
          username: user.username,
          avatar_url: user.avatar_url,
          created_at: user.created_at,
          updated_at: user.updated_at,
        });
      } else {
        // Token invalid, try refresh
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
      console.error("MongoDB auth init error:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const initSupabaseAuth = useCallback(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer profile fetch with setTimeout to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchSupabaseProfile(session.user.id).then(setProfile);
          }, 0);
        } else {
          setProfile(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchSupabaseProfile(session.user.id).then((p) => {
          setProfile(p);
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchSupabaseProfile]);

  // Initialize auth based on backend type
  useEffect(() => {
    if (USE_MONGODB) {
      initMongoDBAuth();
    } else {
      const unsubscribe = initSupabaseAuth();
      return unsubscribe;
    }
  }, [initMongoDBAuth, initSupabaseAuth]);

  // =========== Sign Up ===========
  const signUp = async (email: string, password: string, username: string) => {
    if (USE_MONGODB) {
      const { user, error } = await mongoClient.register(email, password, username);
      
      if (error) {
        toast({
          variant: "destructive",
          title: "Sign up failed",
          description: error,
        });
        return { error: new Error(error) };
      }

      if (user) {
        setUser(user);
        setProfile({
          id: user.id,
          user_id: user.id,
          username: user.username,
          avatar_url: user.avatar_url,
          created_at: user.created_at,
          updated_at: user.updated_at,
        });
      }

      toast({
        title: "Welcome!",
        description: "Your account has been created successfully.",
      });

      return { error: null };
    }

    // Supabase fallback
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: { username },
        },
      });

      if (error) {
        if (error.message.includes("already registered")) {
          toast({
            variant: "destructive",
            title: "Account exists",
            description: "This email is already registered. Please sign in instead.",
          });
        } else {
          toast({
            variant: "destructive",
            title: "Sign up failed",
            description: error.message,
          });
        }
        return { error };
      }

      toast({
        title: "Welcome!",
        description: "Your account has been created successfully.",
      });

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  // =========== Sign In ===========
  const signIn = async (email: string, password: string) => {
    if (USE_MONGODB) {
      const { user, error } = await mongoClient.login(email, password);
      
      if (error) {
        toast({
          variant: "destructive",
          title: "Sign in failed",
          description: error,
        });
        return { error: new Error(error) };
      }

      if (user) {
        setUser(user);
        setProfile({
          id: user.id,
          user_id: user.id,
          username: user.username,
          avatar_url: user.avatar_url,
          created_at: user.created_at,
          updated_at: user.updated_at,
        });
      }

      toast({
        title: "Welcome back!",
        description: "You've been signed in successfully.",
      });

      return { error: null };
    }

    // Supabase fallback
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          variant: "destructive",
          title: "Sign in failed",
          description: error.message,
        });
        return { error };
      }

      toast({
        title: "Welcome back!",
        description: "You've been signed in successfully.",
      });

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  // =========== Sign Out ===========
  const signOut = async () => {
    if (USE_MONGODB) {
      await mongoClient.logout();
      setUser(null);
      setProfile(null);
    } else {
      await supabase.auth.signOut();
      setProfile(null);
    }

    toast({
      title: "Signed out",
      description: "You've been signed out successfully.",
    });
  };

  // =========== Update Profile ===========
  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return;

    if (USE_MONGODB) {
      const updated = await mongoClient.updateProfile({
        username: updates.username,
        avatar_url: updates.avatar_url || undefined,
      });

      if (!updated) {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: "Failed to update profile",
        });
        return;
      }

      setProfile((prev) => (prev ? { ...prev, ...updates } : null));
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
      return;
    }

    // Supabase fallback
    const userId = "id" in user ? user.id : "";
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("user_id", userId);

    if (error) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error.message,
      });
      return;
    }

    setProfile((prev) => (prev ? { ...prev, ...updates } : null));
    toast({
      title: "Profile updated",
      description: "Your profile has been updated successfully.",
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isLoading,
        backendType: USE_MONGODB ? "mongodb" : "supabase",
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
