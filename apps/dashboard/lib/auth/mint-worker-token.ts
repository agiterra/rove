/**
 * Shared mint logic for per-worker JWTs.
 *
 * Both the dashboard mint endpoint (`/api/workers/tokens`) and the
 * install-flow exchange endpoint (`/api/install/exchange`) call this
 * with the same set of inputs after their respective auth checks.
 *
 * Behavior, mirroring docs/plans/worker-tokens.md (v2):
 *   1. Look up the workers row by (project_id, name). Refuse 409 if
 *      it exists and is disabled.
 *   2. Insert the row if it doesn't exist (kind defaults to 'laptop',
 *      capabilities default to manual+localhost).
 *   3. Revoke every still-live token for this worker — re-minting
 *      retires the prior credential.
 *   4. Sign an HS256 JWT carrying the standard Supabase claim shape
 *      plus the worker-specific extras (`kind: "worker"`, worker_id,
 *      project_id, worker_name, jti).
 *   5. Insert the worker_tokens row keyed by the new jti.
 *
 * Returns the signed token, the worker_id, and the expiry timestamp.
 */
import "server-only";
import { createServiceRoleSupabase } from "../supabase/server";
import { env } from "../env";
import { signJwtHs256 } from "./sign-jwt";

export class WorkerDisabledError extends Error {
  constructor(public worker_name: string, public project_id: string) {
    super(`worker '${worker_name}' in project '${project_id}' is disabled`);
    this.name = "WorkerDisabledError";
  }
}

export interface MintInput {
  project_id: string;
  worker_name: string;
  worker_kind?: "laptop" | "dedicated";
  github_handle: string | null;
  /** The team-member handle responsible for this mint — audit only. */
  issued_to_handle: string | null;
}

export interface MintResult {
  token: string;
  worker_id: string;
  expires_at: string;
}

const TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60;

export async function mintWorkerToken(input: MintInput): Promise<MintResult> {
  const { project_id, worker_name, github_handle, issued_to_handle } = input;
  const worker_kind = input.worker_kind ?? "laptop";
  const supabase = createServiceRoleSupabase();

  const { data: existing, error: selErr } = await supabase
    .from("workers")
    .select("id, disabled_at, github_handle")
    .eq("project_id", project_id)
    .eq("name", worker_name)
    .maybeSingle();
  if (selErr) throw new Error(`worker lookup failed: ${selErr.message}`);

  let worker_id: string;
  if (existing) {
    if (existing.disabled_at) throw new WorkerDisabledError(worker_name, project_id);
    worker_id = existing.id as string;
    if (github_handle && existing.github_handle !== github_handle) {
      await supabase.from("workers").update({ github_handle }).eq("id", worker_id);
    }
  } else {
    const { data: created, error: insErr } = await supabase
      .from("workers")
      .insert({
        project_id,
        name: worker_name,
        kind: worker_kind,
        github_handle,
        capabilities: { manual: true, localhost: true },
      })
      .select("id")
      .single();
    if (insErr) throw new Error(`worker create failed: ${insErr.message}`);
    worker_id = created.id as string;
  }

  const nowIso = new Date().toISOString();
  const { error: revokeErr } = await supabase
    .from("worker_tokens")
    .update({ revoked_at: nowIso })
    .eq("worker_id", worker_id)
    .is("revoked_at", null);
  if (revokeErr) throw new Error(`prior token revoke failed: ${revokeErr.message}`);

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TOKEN_TTL_SECONDS;
  const expires_at = new Date(exp * 1000).toISOString();

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("worker_tokens")
    .insert({
      worker_id,
      project_id,
      expires_at,
      issued_to_handle,
    })
    .select("jti")
    .single();
  if (tokenErr) throw new Error(`worker_tokens insert failed: ${tokenErr.message}`);

  const jti = tokenRow.jti as string;
  const claims = {
    iss: "rove-dashboard",
    sub: worker_id,
    aud: "authenticated",
    role: "authenticated",
    kind: "worker" as const,
    worker_id,
    project_id,
    worker_name,
    github_handle: github_handle ?? null,
    jti,
    iat,
    exp,
  };

  const token = signJwtHs256(claims, env.supabaseJwtSecret());
  return { token, worker_id, expires_at };
}
