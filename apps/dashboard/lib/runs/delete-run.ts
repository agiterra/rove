"use server";

import "server-only";
import { createServiceRoleSupabase } from "../supabase/server";
import { requireTeamMember } from "../authoring/require-team-member";

export interface DeleteRunResult {
  ok: true;
  runId: string;
  /** Total objects swept from storage. Best-effort — non-fatal on failure. */
  storageObjectsDeleted: number;
}

export interface DeleteRunError {
  ok: false;
  error: string;
}

export type DeleteRunOutcome = DeleteRunResult | DeleteRunError;

/**
 * Hard-delete a run row plus every artifact it owns. The DB side is one
 * statement — `runs.id`'s cascades take care of `run_steps`, `findings`,
 * `finding_screenshots`. Storage is a separate best-effort sweep of the
 * `runs/<id>/` prefix; a partial storage failure does not fail the delete
 * (the row is already gone; orphan objects are cleaned by the existing
 * `cleanup-resolved` path on next run).
 *
 * Refuses in-flight runs (`status=running` or `status=claimed`). The walker
 * is still writing into the row — pulling it out from under them races into
 * undefined behavior. Mark the run failed (or wait for the stuck-walk
 * sweep) before deleting.
 */
export async function deleteRunAction(runId: string): Promise<DeleteRunOutcome> {
  try {
    await requireTeamMember();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (typeof runId !== "string" || runId.length === 0) {
    return { ok: false, error: "runId is required" };
  }

  const supabase = createServiceRoleSupabase();

  const { data: run, error: lookupErr } = await supabase
    .from("runs")
    .select("id, status, artifacts_storage_prefix")
    .eq("id", runId)
    .maybeSingle<{ id: string; status: string; artifacts_storage_prefix: string | null }>();
  if (lookupErr) return { ok: false, error: `Lookup failed: ${lookupErr.message}` };
  if (!run) return { ok: false, error: "Run not found." };
  if (run.status === "running" || run.status === "claimed") {
    return {
      ok: false,
      error:
        "Run is still in flight (status=" +
        run.status +
        "). Wait for it to settle or use the daemon's stuck-walk timeout before deleting.",
    };
  }

  const { error: deleteErr } = await supabase.from("runs").delete().eq("id", runId);
  if (deleteErr) return { ok: false, error: `Delete failed: ${deleteErr.message}` };

  let storageObjectsDeleted = 0;
  const prefix = run.artifacts_storage_prefix ?? `runs/${runId}`;
  try {
    storageObjectsDeleted = await sweepStorage(supabase, prefix);
  } catch (e) {
    console.warn(
      `[delete-run] storage sweep partial for ${prefix}: ${(e as Error).message}. ` +
        "Row is gone; orphan objects will be cleaned by the next cleanup-resolved sweep.",
    );
  }

  return { ok: true, runId, storageObjectsDeleted };
}

async function sweepStorage(
  supabase: ReturnType<typeof createServiceRoleSupabase>,
  prefix: string,
): Promise<number> {
  const { data, error } = await supabase.storage.from("walks").list(prefix, {
    limit: 1000,
  });
  if (error) throw new Error(`list: ${error.message}`);
  if (!data || data.length === 0) return 0;
  const paths = data.map((o) => `${prefix}/${o.name}`);
  const { error: removeErr } = await supabase.storage.from("walks").remove(paths);
  if (removeErr) throw new Error(`remove: ${removeErr.message}`);
  return paths.length;
}
