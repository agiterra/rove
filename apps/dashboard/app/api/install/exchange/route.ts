/**
 * POST /api/install/exchange
 *
 * Code-authenticated install-code → worker-token-bundle exchange.
 *
 * The install one-liner (curl … | bash -s -- --install-code=<uuid>)
 * POSTs the code here; this endpoint validates it, marks it consumed
 * in a single conditional UPDATE, re-checks team membership of the
 * minting user, and returns the bundle the install script writes into
 * `~/.rove/auth.token` and `~/.rove/env`.
 *
 * **Auth is the code itself.** Unlike `/api/workers/tokens` (mint),
 * this endpoint runs without any session — there is no caller to
 * authenticate beyond what the install_codes row records. Team
 * membership is enforced indirectly: the row stores the minting
 * `user_id`, and that user must still be on the team at exchange
 * time.
 *
 * Body: { install_code: string }
 * 200:  { token, supabase_url, supabase_publishable_key, project_id,
 *         worker_name, github_handle, expires_at }
 * 400:  bad body
 * 403:  minting user is no longer a team member
 * 410:  code missing, expired, or already consumed
 * 500:  server error during mint
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { mintWorkerToken, WorkerDisabledError } from "@/lib/auth/mint-worker-token";

export const runtime = "nodejs";

const BodySchema = z.object({
  install_code: z.uuid(),
});

function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim() || null;
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim() || null;
  return null;
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const code = parsed.data.install_code;

  const supabase = createServiceRoleSupabase();

  const { data: row, error: lookupErr } = await supabase
    .from("install_codes")
    .select("user_id, project_id, worker_name, worker_kind, expires_at, consumed_at")
    .eq("code", code)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json(
      { error: `install_code lookup failed: ${lookupErr.message}` },
      { status: 500 },
    );
  }
  if (!row) {
    return NextResponse.json({ error: "install code not found" }, { status: 410 });
  }
  if (row.consumed_at) {
    return NextResponse.json({ error: "install code already consumed" }, { status: 410 });
  }
  if (new Date(row.expires_at as string).getTime() <= Date.now()) {
    return NextResponse.json({ error: "install code expired" }, { status: 410 });
  }

  const { data: member, error: memberErr } = await supabase
    .from("team_members")
    .select("github_handle, display_name")
    .eq("supabase_user_id", row.user_id)
    .is("removed_at", null)
    .maybeSingle();
  if (memberErr) {
    return NextResponse.json(
      { error: `team membership check failed: ${memberErr.message}` },
      { status: 500 },
    );
  }
  if (!member) {
    return NextResponse.json(
      { error: "minting user is no longer a team member" },
      { status: 403 },
    );
  }

  const nowIso = new Date().toISOString();
  const ip = getClientIp(request);
  const { data: claimed, error: claimErr } = await supabase
    .from("install_codes")
    .update({ consumed_at: nowIso, consumed_ip: ip })
    .eq("code", code)
    .is("consumed_at", null)
    .gt("expires_at", nowIso)
    .select("code")
    .maybeSingle();
  if (claimErr) {
    return NextResponse.json(
      { error: `install_code consume failed: ${claimErr.message}` },
      { status: 500 },
    );
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "install code raced or expired between lookup and claim" },
      { status: 410 },
    );
  }

  try {
    const minted = await mintWorkerToken({
      project_id: row.project_id as string,
      worker_name: row.worker_name as string,
      worker_kind: row.worker_kind as "laptop" | "dedicated",
      github_handle: (member.github_handle as string | null) ?? null,
      issued_to_handle: (member.github_handle as string | null) ?? null,
    });

    return NextResponse.json(
      {
        token: minted.token,
        supabase_url: env.supabaseUrl(),
        supabase_publishable_key: env.supabasePublishableKey(),
        // ALPHA CONCESSION: ships the service-role key to the worker so the
        // existing sink path (getSupabaseClient) just works. The proper
        // architecture is a trusted relay (see
        // docs/plans/wire-sink-relay.md) that keeps service-role
        // server-side. Until that lands, the install code becomes the
        // capture window for service-role too — same 5-min one-shot
        // exposure, much larger blast radius. Don't ship this to external
        // operators outside Agiterra without re-evaluating.
        supabase_service_role_key: env.supabaseServiceRoleKey(),
        project_id: row.project_id,
        worker_name: row.worker_name,
        github_handle: member.github_handle ?? null,
        expires_at: minted.expires_at,
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof WorkerDisabledError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
