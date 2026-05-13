/**
 * Header chip — state machine:
 *
 * | State      | Color     | Label           | Click target |
 * | no-worker  | red       | No worker       | /setup       |
 * | offline    | red       | Worker offline  | /workers     |
 * | paused     | amber     | Worker paused   | /workers     |
 * | online     | brand-cyan| N online        | /workers     |
 *
 * Amber ("paused") is deliberately distinct from red ("broken"). A user who
 * intentionally paused their daemon should not see a red alarming chip.
 *
 * Server component; reads via the cookie-bound supabase client so anon
 * visitors get nothing back (caller hides the pill in that case).
 *
 * Named-workers plan step 4: reads `workers` directly (not the
 * daemon_heartbeats compat view, which is dropped that step).
 * Install-flow step 5: adds paused state + corrects /setup link for no-worker.
 */
import Link from "next/link";
import { createReadClient } from "../lib/supabase/server";

const ONLINE_CUTOFF_MS = 2 * 60_000;   // fresh heartbeat → online
const PAUSED_WINDOW_MS = 60 * 60_000;  // stopped_at within 1h → paused (not stale/missing)

interface WorkerRow {
  last_heartbeat_at: string | null;
  stopped_at: string | null;
  disabled_at: string | null;
}

type ChipState = "no-worker" | "offline" | "paused" | "online";

export async function DaemonStatusPill() {
  const supabase = await createReadClient();
  const { data } = await supabase
    .from("workers")
    .select("last_heartbeat_at, stopped_at, disabled_at");
  const workers = (data ?? []) as WorkerRow[];

  const state = resolveChipState(workers);

  if (state === "no-worker") {
    return (
      <Link
        href="/setup"
        title="No worker installed for this project — click to install"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-bg-2)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)] transition-colors"
      >
        <Dot color="var(--color-severity-critical)" />
        No worker
      </Link>
    );
  }

  if (state === "offline") {
    return (
      <Link
        href="/workers"
        title="No worker heartbeats in the last 2 minutes — generation will time out, walks won't run"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-bg-2)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)] transition-colors"
      >
        <Dot color="var(--color-severity-critical)" />
        Worker offline
      </Link>
    );
  }

  if (state === "paused") {
    return (
      <Link
        href="/workers"
        title="Worker is paused — click to resume from the workers page"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/30 border border-amber-700/40 text-[11px] text-amber-300 hover:bg-amber-950/50 transition-colors"
      >
        <Dot color="rgb(251 191 36)" />
        Worker paused
      </Link>
    );
  }

  // online
  const onlineCount = workers.filter((w) => {
    if (w.disabled_at || w.stopped_at) return false;
    if (!w.last_heartbeat_at) return false;
    return Date.now() - new Date(w.last_heartbeat_at).getTime() < ONLINE_CUTOFF_MS;
  }).length;

  return (
    <Link
      href="/workers"
      title={`${onlineCount} worker${onlineCount === 1 ? "" : "s"} online`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/30 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]/80 transition-colors"
    >
      <Dot color="var(--color-accent)" pulse />
      {onlineCount} online
    </Link>
  );
}

function resolveChipState(workers: WorkerRow[]): ChipState {
  if (workers.length === 0) return "no-worker";

  const now = Date.now();

  // At least one worker with a fresh heartbeat and not stopped/disabled → online
  const hasOnline = workers.some((w) => {
    if (w.disabled_at || w.stopped_at) return false;
    if (!w.last_heartbeat_at) return false;
    return now - new Date(w.last_heartbeat_at).getTime() < ONLINE_CUTOFF_MS;
  });
  if (hasOnline) return "online";

  // At least one worker with stopped_at set within the last hour (and not disabled) → paused.
  // Amber: user intentionally paused — there is no problem.
  const hasPaused = workers.some((w) => {
    if (w.disabled_at) return false;
    if (!w.stopped_at) return false;
    return now - new Date(w.stopped_at).getTime() < PAUSED_WINDOW_MS;
  });
  if (hasPaused) return "paused";

  // Workers exist but none online or recently paused → offline (something is wrong).
  return "offline";
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
