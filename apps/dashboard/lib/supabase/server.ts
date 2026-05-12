import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "../env";

/**
 * Server-side Supabase client bound to the current request's cookies.
 * Reads are subject to RLS — only team members see eval data.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — the middleware refreshes
          // sessions instead. See lib/supabase/middleware.ts.
        }
      },
    },
  });
}

/**
 * Service-role client — bypasses RLS. Used for:
 *   - signed-URL minting for Storage (Phase 9)
 *   - the DEV_BYPASS_AUTH local-dev escape hatch
 *
 * Never call this from code that could run in the browser bundle.
 */
export function createServiceRoleSupabase() {
  return createSupabaseClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Returns whatever read client is appropriate right now:
 *   - signed-in user → cookie-bound (RLS enforced)
 *   - DEV_BYPASS_AUTH=1 AND no user → service-role (RLS bypassed, dev only)
 *   - no user, no bypass → cookie-bound (queries will return empty / RLS-block)
 */
export async function createReadClient() {
  const cookieClient = await createServerSupabase();
  const {
    data: { user },
  } = await cookieClient.auth.getUser();
  if (!user && env.devBypassAuth() && !env.isProduction()) {
    return createServiceRoleSupabase();
  }
  return cookieClient;
}
