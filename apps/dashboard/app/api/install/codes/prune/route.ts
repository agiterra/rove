/**
 * GET /api/install/codes/prune
 *
 * Nightly sweep of stale install_codes rows. Deletes:
 *   - consumed_at IS NOT NULL AND consumed_at < now() - interval '1 day'
 *   - consumed_at IS NULL     AND expires_at  < now() - interval '1 day'
 *
 * Triggered by Vercel cron — see apps/dashboard/vercel.json. Vercel injects
 * `Authorization: Bearer <CRON_SECRET>` automatically when invoking the
 * schedule; the env var must be set in the Vercel project settings.
 *
 * Fail-closed: if CRON_SECRET is unset, the route returns 503. A request
 * without a matching bearer returns 401. The DB function runs SECURITY
 * DEFINER and is only granted to service_role.
 */
import "server-only";
import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on this deployment" },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleSupabase();
  const { data, error } = await supabase.rpc("prune_install_codes");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const deleted = typeof data === "number" ? data : Number(data) || 0;
  return NextResponse.json({ deleted });
}
