/**
 * Header pill — green when ≥1 daemon heartbeated within the last 2min,
 * red when none. Server component; reads via the cookie-bound supabase
 * client so anon visitors get nothing back (caller hides the pill in
 * that case).
 */
import { createReadClient } from "../lib/supabase/server";

const STALE_AFTER_MS = 2 * 60_000;

interface HeartbeatRow {
  user_id: string;
  daemon_name: string;
  hostname: string | null;
  last_seen_at: string;
}
interface TeamMemberRow {
  supabase_user_id: string | null;
  display_name: string | null;
  github_handle: string;
}

export async function DaemonStatusPill() {
  const supabase = await createReadClient();
  const { data: hbData } = await supabase
    .from("daemon_heartbeats")
    .select("user_id, daemon_name, hostname, last_seen_at");
  const heartbeats = (hbData ?? []) as HeartbeatRow[];

  const cutoff = Date.now() - STALE_AFTER_MS;
  const online = heartbeats.filter((h) => new Date(h.last_seen_at).getTime() > cutoff);

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

  const userIds = online.map((h) => h.user_id);
  const { data: tmData } = await supabase
    .from("team_members")
    .select("supabase_user_id, display_name, github_handle")
    .in("supabase_user_id", userIds);
  const nameByUserId = new Map<string, string>();
  for (const tm of (tmData ?? []) as TeamMemberRow[]) {
    if (tm.supabase_user_id) {
      nameByUserId.set(tm.supabase_user_id, tm.display_name ?? tm.github_handle);
    }
  }
  const labels = online
    .map((h) => nameByUserId.get(h.user_id) ?? h.daemon_name)
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
