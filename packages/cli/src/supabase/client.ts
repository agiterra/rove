import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEvalSupabaseEnv } from "./env.js";

/**
 * Lazily-instantiated supabase client using the service-role key.
 *
 * Service-role bypasses RLS — only the CLI should hold this. Dashboard
 * (Phase 9) builds its own client with the anon key + session cookies.
 */
let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;
  const env = requireEvalSupabaseEnv();
  cached = createClient(env.url, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}

/** Test seam — reset cached client between integration tests. */
export function resetSupabaseClientCache(): void {
  cached = null;
}
