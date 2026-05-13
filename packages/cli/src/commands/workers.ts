/**
 * `rove workers` — inspect and toggle workers from the terminal.
 *
 *   rove workers list                  list workers in the active project
 *   rove workers disable <name>        soft-disable; daemon refuses to start
 *   rove workers enable <name>         clear the disable flag
 *
 * Named-workers plan step 5.
 */
import { loadRoveConfig } from "../config.js";
import { getSupabaseClient } from "../supabase/client.js";

const PROJECT_SLUG_RE = /^[a-z][a-z0-9-]*$/;

async function resolveProjectId(override: string | undefined): Promise<string> {
  if (override !== undefined) {
    if (!PROJECT_SLUG_RE.test(override)) {
      throw new Error(
        `--project-id must be lowercase letters/numbers/hyphens (got: ${override})`,
      );
    }
    return override;
  }
  const { config } = await loadRoveConfig();
  return config.projectId;
}

interface WorkerRow {
  id: string;
  name: string;
  kind: "laptop" | "dedicated" | "cloud";
  github_handle: string | null;
  capabilities: Record<string, boolean> | null;
  last_heartbeat_at: string | null;
  stopped_at: string | null;
  disabled_at: string | null;
}

type Status = "online" | "stale" | "stopped" | "disabled";

const ONLINE_WINDOW_MS = 30_000;

function statusOf(w: WorkerRow): Status {
  if (w.disabled_at !== null) return "disabled";
  if (w.stopped_at !== null) return "stopped";
  if (
    w.last_heartbeat_at !== null &&
    Date.now() - new Date(w.last_heartbeat_at).getTime() < ONLINE_WINDOW_MS
  ) {
    return "online";
  }
  return "stale";
}

function relative(iso: string | null): string {
  if (iso === null) return "never";
  const dt = Date.now() - new Date(iso).getTime();
  if (dt < 0) return "now";
  if (dt < 60_000) return `${Math.floor(dt / 1000)}s ago`;
  if (dt < 60 * 60_000) return `${Math.floor(dt / 60_000)}m ago`;
  if (dt < 24 * 60 * 60_000) return `${Math.floor(dt / (60 * 60_000))}h ago`;
  return `${Math.floor(dt / (24 * 60 * 60_000))}d ago`;
}

export async function runWorkersListCommand(projectIdOverride?: string): Promise<number> {
  try {
    const projectId = await resolveProjectId(projectIdOverride);
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("workers")
      .select("id, name, kind, github_handle, capabilities, last_heartbeat_at, stopped_at, disabled_at")
      .eq("project_id", projectId);
    if (error) {
      console.error(`workers list: ${error.message}`);
      return 1;
    }
    const workers = (data ?? []) as WorkerRow[];
    if (workers.length === 0) {
      console.error(`No workers registered for project '${projectId}'.`);
      console.error(`Start a daemon with: rove daemon --as=<name>`);
      return 0;
    }
    const rows = workers.map((w) => ({
      name: w.name,
      kind: w.kind,
      owner: w.github_handle ?? "—",
      claims:
        Object.entries(w.capabilities ?? {})
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(",") || "—",
      status: statusOf(w),
      heartbeat: relative(w.last_heartbeat_at),
    }));
    const widths = {
      name: Math.max(6, ...rows.map((r) => r.name.length)),
      kind: Math.max(4, ...rows.map((r) => r.kind.length)),
      owner: Math.max(5, ...rows.map((r) => r.owner.length)),
      claims: Math.max(6, ...rows.map((r) => r.claims.length)),
      status: 8,
      heartbeat: Math.max(9, ...rows.map((r) => r.heartbeat.length)),
    };
    const pad = (s: string, w: number) => s.padEnd(w);
    console.log(
      pad("NAME", widths.name) +
        "  " +
        pad("KIND", widths.kind) +
        "  " +
        pad("OWNER", widths.owner) +
        "  " +
        pad("CLAIMS", widths.claims) +
        "  " +
        pad("STATUS", widths.status) +
        "  " +
        "HEARTBEAT",
    );
    for (const r of rows) {
      console.log(
        pad(r.name, widths.name) +
          "  " +
          pad(r.kind, widths.kind) +
          "  " +
          pad(r.owner, widths.owner) +
          "  " +
          pad(r.claims, widths.claims) +
          "  " +
          pad(r.status, widths.status) +
          "  " +
          r.heartbeat,
      );
    }
    return 0;
  } catch (err) {
    console.error(`workers list: ${(err as Error).message}`);
    return 1;
  }
}

async function setDisabled(
  name: string,
  disabled: boolean,
  projectIdOverride?: string,
): Promise<number> {
  try {
    const projectId = await resolveProjectId(projectIdOverride);
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("workers")
      .update({ disabled_at: disabled ? new Date().toISOString() : null })
      .eq("project_id", projectId)
      .eq("name", name)
      .select("id");
    if (error) {
      console.error(`workers ${disabled ? "disable" : "enable"} ${name}: ${error.message}`);
      return 1;
    }
    if (!data || data.length === 0) {
      console.error(`No worker named '${name}' in project '${projectId}'.`);
      return 1;
    }
    console.log(`worker '${name}' ${disabled ? "disabled" : "enabled"}.`);
    return 0;
  } catch (err) {
    console.error(`workers ${disabled ? "disable" : "enable"}: ${(err as Error).message}`);
    return 1;
  }
}

export function runWorkersDisableCommand(name: string, projectIdOverride?: string): Promise<number> {
  return setDisabled(name, true, projectIdOverride);
}

export function runWorkersEnableCommand(name: string, projectIdOverride?: string): Promise<number> {
  return setDisabled(name, false, projectIdOverride);
}
