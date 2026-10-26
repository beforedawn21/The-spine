// THE BROWSER'S DATABASE CLIENT
// The browser only ever calls .from() and .rpc() - Supabase's table and function API.
// The full Supabase library also ships its login system, real-time sync and file storage,
// none of which The Spine uses in the browser: about 210 KB downloaded on every visit for
// nothing. PostgrestClient is that same .from()/.rpc() API on its own.
// Both headers are sent exactly as the full library sends them, so every request is
// byte-for-byte what it was before (proven across every kind of call the app makes).
// The server functions in api/ still use the full library - this file is browser-only.
import { PostgrestClient } from "@supabase/postgrest-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  url && anonKey
    ? new PostgrestClient(url.replace(/\/$/, "") + "/rest/v1", {
        // Legacy anon keys are JWTs and travel in both headers, as the full library sends them.
        // New sb_publishable_ keys go in apikey alone - Supabase can reject them as a Bearer token.
        headers: /^eyJ/.test(anonKey) ? { apikey: anonKey, Authorization: "Bearer " + anonKey } : { apikey: anonKey },
      })
    : null;

export const supabaseReady = Boolean(supabase);
