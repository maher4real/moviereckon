import { createClient } from "@supabase/supabase-js";

/**
 * Runtime-safe backend client.
 *
 * Uses Lovable Cloud (internal Supabase) which has all the edge functions
 * and database tables already deployed.
 *
 * NOTE: This uses a publishable key (safe to ship in the frontend).
 */
const BACKEND_URL = "";
const BACKEND_PUBLISHABLE_KEY = "";
// Legacy fallback (disabled to avoid accidental client-side key exposure):
// const BACKEND_URL = "https://urorhbscnfdqljrrlqkk.supabase.co";
// const BACKEND_PUBLISHABLE_KEY = "your_publishable_key";

export const supabase = createClient(BACKEND_URL, BACKEND_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    // Legacy fallback (disabled for security):
    // storage: localStorage,
    // persistSession: true,
    // autoRefreshToken: true,
  },
});
