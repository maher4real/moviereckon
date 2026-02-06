import { createClient } from "@supabase/supabase-js";

/**
 * Runtime-safe backend client.
 *
 * Uses Lovable Cloud (internal Supabase) which has all the edge functions
 * and database tables already deployed.
 *
 * NOTE: This uses a publishable key (safe to ship in the frontend).
 */
const BACKEND_URL = "https://urorhbscnfdqljrrlqkk.supabase.co";
const BACKEND_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyb3JoYnNjbmZkcWxqcnJscWtrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MzA3NDgsImV4cCI6MjA4NTMwNjc0OH0.2z68g3-H766wiINum9xldarRvGmK2ZcmjkUQSBg7FtY";

export const supabase = createClient(BACKEND_URL, BACKEND_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
