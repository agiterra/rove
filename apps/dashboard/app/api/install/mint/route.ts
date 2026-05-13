/**
 * POST /api/install/mint
 *
 * User-session-authenticated endpoint that issues a single-use install
 * code bound to (user, project, worker_name, worker_kind). The code is
 * returned to the /setup page, which renders the curl one-liner.
 *
 * The install script POSTs the code to /api/install/exchange — that
 * endpoint is code-authenticated, not session-authenticated. See its
 * route for the exchange / mint-worker-token flow.
 *
 * Worker-name collision logic (Open question #2, resolved v3.1):
 *   "Active" = disabled_at IS NULL AND stopped_at IS NULL AND
 *              last_heartbeat_at > now() - 90s.
 *   If a row with (project_id, worker_name) exists and is active or
 *   administratively disabled → 409.
 *   If the row exists but is stopped or stale (last_heartbeat_at old /
 *   null) → allow re-mint; the user is reinstalling on the same machine.
 *
 * Body: { worker_name: string, project_id: string, worker_kind?: "laptop"|"dedicated" }
 * 200:  { code, expires_at, install_command }
 * 400:  invalid body
 * 401:  not signed in
 * 403:  not a team member
 * 409:  active worker already exists with that name
 * 500:  unexpected error
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamMember } from "@/lib/authoring/require-team-member";
import { createServiceRoleSupabase } from "@/lib/supabase/server";
import { getDashboardOrigin } from "@/lib/dashboard-origin";

export const runtime = "nodejs";

const BodySchema = z.object({
  worker_name: z.string().trim().min(1).max(64),
  project_id: z.string().trim().min(1).max(64),
  worker_kind: z.enum(["laptop", "dedicated"]).optional(),
});

// A worker is "active" if it is not administratively disabled, not cleanly
// stopped, and its last heartbeat arrived within the past 90 seconds —
// matching the dashboard's "online" chip semantics.
const HEARTBEAT_STALENESS_MS = 90_000;

export async function POST(request: Request) {
  let me: Awaited<ReturnType<typeof requireTeamMember>>;
  try {
    me = await requireTeamMember();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "Not signed in." ? 401 : 403;
    return NextResponse.json({ error: message }, { status });
  }

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

  const { worker_name, project_id, worker_kind = "laptop" } = parsed.data;
  const supabase = createServiceRoleSupabase();

  // ── Worker-name collision check ───────────────────────────────────────────
  const { data: existing, error: workerErr } = await supabase
    .from("workers")
    .select("disabled_at, stopped_at, last_heartbeat_at")
    .eq("project_id", project_id)
    .eq("name", worker_name)
    .maybeSingle();

  if (workerErr) {
    return NextResponse.json(
      { error: `worker lookup failed: ${workerErr.message}` },
      { status: 500 },
    );
  }

  if (existing) {
    const isDisabled = existing.disabled_at !== null;
    const isStopped = existing.stopped_at !== null;
    const heartbeatAge = existing.last_heartbeat_at
      ? Date.now() - new Date(existing.last_heartbeat_at as string).getTime()
      : Infinity;
    const isOnline = !isStopped && heartbeatAge <= HEARTBEAT_STALENESS_MS;
    const isActive = isDisabled || isOnline;

    if (isActive) {
      const reason = isDisabled
        ? "administratively disabled"
        : "currently online";
      return NextResponse.json(
        {
          error: `A worker named "${worker_name}" already exists in project "${project_id}" and is ${reason}. Choose a different name or, if reinstalling the same machine, wait for its heartbeat to go stale (90 s).`,
        },
        { status: 409 },
      );
    }
    // Stale / stopped → fall through and re-mint.
  }

  // ── Insert install code (service-role; no client-write RLS policy) ────────
  const { data: inserted, error: insertErr } = await supabase
    .from("install_codes")
    .insert({
      user_id: me.userId,
      project_id,
      worker_name,
      worker_kind,
    })
    .select("code, expires_at")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: `install_code insert failed: ${insertErr?.message ?? "no row returned"}` },
      { status: 500 },
    );
  }

  const origin = getDashboardOrigin(request);
  const installCommand =
    `curl -fsSL ${origin}/install | bash -s -- --install-code=${inserted.code as string}`;

  return NextResponse.json(
    {
      code: inserted.code,
      expires_at: inserted.expires_at,
      install_command: installCommand,
    },
    { status: 200 },
  );
}
