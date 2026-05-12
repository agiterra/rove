/**
 * Resolves the eval-store Supabase config from the environment.
 *
 * The CLI writes from a trusted developer machine; we use the service-role
 * key (which bypasses RLS). The key MUST NOT be checked in. Sources, in
 * order of precedence:
 *
 *   1. EVAL_SUPABASE_URL + EVAL_SUPABASE_SERVICE_ROLE_KEY  ← eval-specific
 *   2. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY            ← shared
 *
 * The eval-specific vars exist because TankLoop's app DB and the eval store
 * are different Supabase projects. Setting EVAL_* lets you run a walk
 * without trampling the app's SUPABASE_URL env var (which apps/web reads).
 */
export interface EvalSupabaseEnv {
  url: string;
  serviceRoleKey: string;
}

export function readEvalSupabaseEnv(): EvalSupabaseEnv | null {
  const url = process.env.EVAL_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.EVAL_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

export function requireEvalSupabaseEnv(): EvalSupabaseEnv {
  const env = readEvalSupabaseEnv();
  if (env) return env;
  throw new Error(
    "Supabase env vars are not set. Provide EVAL_SUPABASE_URL and " +
      "EVAL_SUPABASE_SERVICE_ROLE_KEY (or the unprefixed SUPABASE_* equivalents). " +
      "See infra/supabase/eval/README.md.",
  );
}
