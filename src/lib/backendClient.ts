import { createClient } from "@supabase/supabase-js";

/**
 * Runtime-safe backend client.
 *
 * We intentionally avoid relying on Vite env injection here because the preview build
 * is currently not providing VITE_* env vars (causing a startup crash).
 *
 * NOTE: This uses a publishable key (safe to ship in the frontend).
 */
const BACKEND_URL = "https://xcgswojnwvdxykgqskbc.supabase.co";
const BACKEND_PUBLISHABLE_KEY = "sb_publishable_m3lz-rMScGTlprnxDPmtCQ_rtM0XVuZ";

export const supabase = createClient(BACKEND_URL, BACKEND_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
