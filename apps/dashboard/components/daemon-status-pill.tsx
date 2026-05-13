/**
 * Header pill — green when ≥1 worker heartbeated within the last 2min,
 * red when none. Server component; reads via the cookie-bound supabase
 * client so anon visitors get nothing back (caller hides the pill in
 * that case).
 *
 * Reads `workers` directly (not the daemon_heartbeats compat view). The
 * view does not preserve the auth.users foreign-key semantics needed to
 * recover display names via team_members — the named-workers plan
 * explicitly authorized swapping this reader to read `workers.github_handle`
 * during step 1.
 */
import { createReadClient } from "../lib/supabase/server";

const STALE_AFTER_MS = 2 * 60_000;

interface WorkerRow {
  id: string;
  name: string;
  github_handle: string | null;
  last_heartbeat_at: string | null;
}
interface TeamMemberRow {
  github_handle: string;
  display_name: string | null;
}

export async function DaemonStatusPill() {
  const supabase = await createReadClient();
  const { data: workerData } = await supabase
    .from("workers")
    .select("id, name, github_handle, last_heartbeat_at")
    .is("disabled_at", null)
    .is("stopped_at", null);
  const workers = (workerData ?? []) as WorkerRow[];

  const cutoff = Date.now() - STALE_AFTER_MS;
  const online = workers.filter(
    (w) => w.last_heartbeat_at !== null && new Date(w.last_heartbeat_at).getTime() > cutoff,
  );

  if (online.length === 0) {
    return (
      <span
        title="No daemon heartbeats in the last 2 minutes — AI generation will time out"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-bg-2)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)]"
      >
        <Dot color="var(--color-severity-critical)" />
        no daemon
      </span>
    );
  }

  const handles = online.map((w) => w.github_handle).filter((h): h is string => Boolean(h));
  let nameByHandle = new Map<string, string>();
  if (handles.length > 0) {
    const { data: tmData } = await supabase
      .from("team_members")
      .select("github_handle, display_name")
      .in("github_handle", handles);
    for (const tm of (tmData ?? []) as TeamMemberRow[]) {
      nameByHandle.set(tm.github_handle, tm.display_name ?? tm.github_handle);
    }
  }
  const labels = online
    .map((w) => (w.github_handle && nameByHandle.get(w.github_handle)) ?? w.name)
    .join(", ");

  return (
    <span
      title={`${online.length} daemon${online.length === 1 ? "" : "s"} online`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/30 text-[11px] text-[var(--color-accent)]"
    >
      <Dot color="var(--color-accent)" pulse />
      {labels}
    </span>
  );
}

function Dot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: 8, height: 8 }}>
      {pulse ? (
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
          style={{ background: color }}
        />
      ) : null}
      <span
        className="relative inline-flex rounded-full"
        style={{ width: 8, height: 8, background: color }}
      />
    </span>
  );
}
