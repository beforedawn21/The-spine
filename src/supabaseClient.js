// The Spine — Supabase connection (the database that remembers people).
// Fill these two values from your Supabase project's "API" settings,
// then add them in Vercel as environment variables (see README Stage 3).

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If Supabase isn't configured yet, this stays null and the app runs
// in local-only mode (accounts won't persist between refreshes).
export const supabase =
  url && anonKey ? createClient(url, anonKey) : null;

export const supabaseReady = Boolean(supabase);
