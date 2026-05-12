/**
 * Resolves the Rove Supabase config from the environment.
 *
 * The CLI writes from a trusted developer machine; we use the service-role
 * key (which bypasses RLS). The key MUST NOT be checked in. Sources, in
 * order of precedence:
 *
 *   1. ROVE_SUPABASE_URL + ROVE_SUPABASE_SERVICE_ROLE_KEY  ← canonical
 *   2. EVAL_SUPABASE_URL + EVAL_SUPABASE_SERVICE_ROLE_KEY  ← legacy alias
 *      (tankloop's pre-rename .env.eval; remove once tankloop fully
 *      migrates off the old daemon)
 *
 * The Rove-specific vars exist so the CLI's writes don't trample a
 * consuming project's own SUPABASE_URL (which apps/web typically reads).
 */
export interface RoveSupabaseEnv {
  url: string;
  serviceRoleKey: string;
}

export function readRoveSupabaseEnv(): RoveSupabaseEnv | null {
  const url = process.env.ROVE_SUPABASE_URL ?? process.env.EVAL_SUPABASE_URL;
  const serviceRoleKey =
    process.env.ROVE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.EVAL_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

export function requireRoveSupabaseEnv(): RoveSupabaseEnv {
  const env = readRoveSupabaseEnv();
  if (env) return env;
  throw new Error(
    "Supabase env vars are not set. Provide ROVE_SUPABASE_URL and " +
      "ROVE_SUPABASE_SERVICE_ROLE_KEY in your .env.rove. See TEAM-SETUP.md.",
  );
}

// Back-compat exports — every callsite in the CLI imports the old names.
// Migrating to `requireRoveSupabaseEnv` is a separate sweep.
export const readEvalSupabaseEnv = readRoveSupabaseEnv;
export const requireEvalSupabaseEnv = requireRoveSupabaseEnv;
export type EvalSupabaseEnv = RoveSupabaseEnv;
