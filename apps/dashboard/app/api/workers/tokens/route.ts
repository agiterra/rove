/**
 * POST /api/workers/tokens
 *
 * Team-member-authenticated mint endpoint. The signed-in user names a
 * worker (and project + kind) and gets back a per-worker JWT that
 * grants exactly that worker's daemon privileges. Re-minting against
 * the same (project_id, worker_name) revokes the prior token.
 *
 * Body: { worker_name: string, project_id: string, kind?: "laptop"|"dedicated" }
 * 200:  { token, worker_id, expires_at }
 * 400:  invalid body
 * 401:  not signed in
 * 403:  not a team member
 * 409:  worker exists and is administratively disabled
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamMember } from "@/lib/authoring/require-team-member";
import { mintWorkerToken, WorkerDisabledError } from "@/lib/auth/mint-worker-token";

export const runtime = "nodejs";

const BodySchema = z.object({
  worker_name: z.string().trim().min(1).max(64),
  project_id: z.string().trim().min(1).max(64),
  kind: z.enum(["laptop", "dedicated"]).optional(),
});

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

  try {
    const result = await mintWorkerToken({
      project_id: parsed.data.project_id,
      worker_name: parsed.data.worker_name,
      worker_kind: parsed.data.kind,
      github_handle: me.githubHandle,
      issued_to_handle: me.githubHandle,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof WorkerDisabledError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
