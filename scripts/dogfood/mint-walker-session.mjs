#!/usr/bin/env node
/**
 * Local bypass of /api/agent-session for dogfood walks.
 *
 * Thin wrapper around `mintLocalWalkerSession` in
 * `packages/cli/src/auth-mint.ts`. The two share code so the CLI's
 * auto-mint path (in `rove run` and `rove change-review`) and this
 * standalone script can't drift.
 *
 * Run with the dashboard env loaded (vercel env pull). Required vars:
 *   - ROVE_SUPABASE_SERVICE_ROLE_KEY (or EVAL_SUPABASE_SERVICE_ROLE_KEY)
 *   - ROVE_SUPABASE_URL              (or NEXT_PUBLIC_SUPABASE_URL)
 *   - ROVE_AGENT_SESSION_USER_ID     (the rove-walker auth.users.id)
 *
 * Optional:
 *   - DASHBOARD_ORIGIN   (default https://rove-agiterra.vercel.app)
 *   - PROFILE_ROLE       (default "dispatcher")
 *
 * For production installs (where the service-role key is not present),
 * use `rove dashboard-auth-setup` instead.
 */
import { mintLocalWalkerSession, mintOptionsFromEnv } from "../../packages/cli/dist/auth-mint.js";

const opts = mintOptionsFromEnv();
if (!opts) {
  console.error(
    "missing env: ROVE_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL, " +
      "ROVE_SUPABASE_SERVICE_ROLE_KEY/EVAL_SUPABASE_SERVICE_ROLE_KEY, " +
      "ROVE_AGENT_SESSION_USER_ID",
  );
  process.exit(2);
}

const role = process.env.PROFILE_ROLE ?? "dispatcher";
try {
  await mintLocalWalkerSession({ ...opts, role });
} catch (err) {
  console.error(`✗ mint failed: ${err?.message ?? err}`);
  process.exit(1);
}
