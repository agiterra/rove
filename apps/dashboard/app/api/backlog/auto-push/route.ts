/**
 * Auto-push endpoint — alpha.39b.
 *
 * The CLI's Supabase sink POSTs here after writing each finding. The
 * route resolves the project's active connection, loads the flow's
 * canonical flag, applies the connection's sync_policy via the pure
 * shouldAutoSync evaluator, and dispatches to the adapter when the
 * policy says yes. Idempotency + per-finding push are handled by
 * pushFindingCore (same path the manual button uses).
 *
 * Auth: bearer secret in Authorization header. Set
 * ROVE_AUTO_PUSH_SECRET in both Vercel (Production) and the daemon
 * env (the CLI sink reads it the same way it reads other ROVE_* vars).
 */
import "server-only";
import { type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { createServiceRoleSupabase } from "@/lib/supabase/server";
import { getActiveConnection } from "@/lib/backlog/connections";
import { shouldAutoSync, DEFAULT_SYNC_POLICY } from "@/lib/backlog/sync-policy";
import { pushFindingCore } from "@/lib/findings/send-to-backlog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface FindingForPolicy {
  id: string;
  run_id: string;
  project_id: string;
  severity: "critical" | "major" | "minor" | "nit";
  heuristic: string | null;
}

interface RunRow {
  flow_id: string | null;
}

interface FlowRow {
  canonical: boolean | null;
}

export async function POST(request: NextRequest) {
  const secret = env.autoPushSecret();
  if (!secret) {
    return jsonResponse({ ok: false, error: "ROVE_AUTO_PUSH_SECRET not configured" }, 503);
  }

  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${secret}`;
  if (!authHeader || !constantTimeEquals(authHeader, expected)) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  let body: { findingId?: unknown };
  try {
    body = (await request.json()) as { findingId?: unknown };
  } catch {
    return jsonResponse({ ok: false, error: "invalid json body" }, 400);
  }
  const findingId = typeof body.findingId === "string" ? body.findingId : null;
  if (!findingId) {
    return jsonResponse({ ok: false, error: "findingId required" }, 400);
  }

  const supabase = createServiceRoleSupabase();
  const { data: finding, error: findingErr } = await supabase
    .from("findings")
    .select("id, run_id, project_id, severity, heuristic")
    .eq("id", findingId)
    .maybeSingle<FindingForPolicy>();
  if (findingErr) {
    return jsonResponse({ ok: false, error: `finding lookup: ${findingErr.message}` }, 500);
  }
  if (!finding) {
    return jsonResponse({ ok: true, skipped: "finding not found" }, 200);
  }

  const conn = await getActiveConnection(finding.project_id);
  if (!conn || conn.provider === "dashboard-only") {
    return jsonResponse(
      { ok: true, skipped: "no external backlog connected" },
      200,
    );
  }

  const flowCanonical = await resolveFlowCanonical(finding.run_id, finding.project_id);
  const policy = conn.syncPolicy ?? DEFAULT_SYNC_POLICY;
  const decision = shouldAutoSync({
    policy,
    severity: finding.severity,
    heuristic: finding.heuristic,
    flowCanonical,
  });

  if (!decision.auto) {
    return jsonResponse(
      { ok: true, skipped: `policy: ${decision.reason}`, severity: finding.severity },
      200,
    );
  }

  try {
    const result = await pushFindingCore(findingId);
    return jsonResponse(
      {
        ok: true,
        pushed: true,
        reason: decision.reason,
        externalUrl: result.externalUrl,
        externalKind: result.externalKind,
      },
      200,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
}

async function resolveFlowCanonical(runId: string, projectId: string): Promise<boolean> {
  const supabase = createServiceRoleSupabase();
  const { data: run } = await supabase
    .from("runs")
    .select("flow_id")
    .eq("id", runId)
    .maybeSingle<RunRow>();
  if (!run?.flow_id) return false;
  const { data: flow } = await supabase
    .from("flows")
    .select("canonical")
    .eq("flow_id", run.flow_id)
    .eq("project_id", projectId)
    .maybeSingle<FlowRow>();
  return Boolean(flow?.canonical);
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function jsonResponse(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
