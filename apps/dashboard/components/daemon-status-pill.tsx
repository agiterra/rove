/**
 * Header chip — links to /workers. Shows "N online" when ≥1 worker has
 * heartbeated within the last 2min, red "no worker" otherwise.
 *
 * Server component; reads via the cookie-bound supabase client so anon
 * visitors get nothing back (caller hides the pill in that case).
 *
 * Named-workers plan step 4: reads `workers` directly (not the
 * daemon_heartbeats compat view, which is dropped this step).
 */
import Link from "next/link";
import { createReadClient } from "../lib/supabase/server";

const STALE_AFTER_MS = 2 * 60_000;

interface WorkerRow {
  last_heartbeat_at: string | null;
}

export async function DaemonStatusPill() {
  const supabase = await createReadClient();
  const { data } = await supabase
    .from("workers")
    .select("last_heartbeat_at")
    .is("disabled_at", null)
    .is("stopped_at", null);
  const workers = (data ?? []) as WorkerRow[];

  const cutoff = Date.now() - STALE_AFTER_MS;
  const online = workers.filter(
    (w) => w.last_heartbeat_at !== null && new Date(w.last_heartbeat_at).getTime() > cutoff,
  ).length;

  if (online === 0) {
    return (
      <Link
        href="/workers"
        title="No worker heartbeats in the last 2 minutes — generation will time out, walks won't run"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-bg-2)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)] transition-colors"
      >
        <Dot color="var(--color-severity-critical)" />
        no worker
      </Link>
    );
  }

  return (
    <Link
      href="/workers"
      title={`${online} worker${online === 1 ? "" : "s"} online`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/30 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]/80 transition-colors"
    >
      <Dot color="var(--color-accent)" pulse />
      {online} online
    </Link>
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
