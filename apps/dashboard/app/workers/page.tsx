/**
 * /workers — single-pane view of every worker registered in this project.
 *
 * Named-workers plan step 4: replaces the implicit "is somebody's daemon
 * running?" guesswork with explicit identity. Teams can see which machines
 * are doing what, who owns them, and whether webhook routing has somewhere
 * to land.
 */
import Link from "next/link";
import { createReadClient } from "../../lib/supabase/server";
import { PageHeader } from "../../components/page-header";
import { resolveProjectId } from "../../lib/project-context";

export const dynamic = "force-dynamic";

export const metadata: import("next").Metadata = {
  title: "Workers",
  description: "Daemons registered for this project — which ones are online and what they will claim.",
};

interface WorkerRow {
  id: string;
  name: string;
  kind: "laptop" | "dedicated" | "cloud";
  github_handle: string | null;
  capabilities: Record<string, boolean> | null;
  last_heartbeat_at: string | null;
  stopped_at: string | null;
  disabled_at: string | null;
  created_at: string;
}

interface TeamMemberRow {
  github_handle: string;
  display_name: string | null;
}

interface PageProps {
  searchParams: Promise<{ p?: string }>;
}

const STALE_AFTER_MS = 30_000;

type WorkerStatus = "online" | "stale" | "stopped" | "disabled";

function statusOf(w: WorkerRow): WorkerStatus {
  if (w.disabled_at !== null) return "disabled";
  if (w.stopped_at !== null) return "stopped";
  if (
    w.last_heartbeat_at !== null &&
    Date.now() - new Date(w.last_heartbeat_at).getTime() < STALE_AFTER_MS
  ) {
    return "online";
  }
  return "stale";
}

const statusRank: Record<WorkerStatus, number> = {
  online: 0,
  stale: 1,
  stopped: 2,
  disabled: 3,
};

export default async function WorkersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const projectId = await resolveProjectId(sp);
  const supabase = await createReadClient();
  const { data, error } = await supabase
    .from("workers")
    .select("id, name, kind, github_handle, capabilities, last_heartbeat_at, stopped_at, disabled_at, created_at")
    .eq("project_id", projectId);

  if (error) {
    return (
      <div className="bg-red-950/30 border border-red-800/40 text-red-200 rounded-xl p-6">
        <p className="font-medium mb-1">Could not load workers</p>
        <p className="text-sm font-mono">{error.message}</p>
      </div>
    );
  }

  const workers = (data ?? []) as WorkerRow[];
  const handles = Array.from(new Set(workers.map((w) => w.github_handle).filter((h): h is string => Boolean(h))));
  let displayName = new Map<string, string>();
  if (handles.length > 0) {
    const { data: tmData } = await supabase
      .from("team_members")
      .select("github_handle, display_name")
      .in("github_handle", handles);
    for (const tm of (tmData ?? []) as TeamMemberRow[]) {
      displayName.set(tm.github_handle, tm.display_name ?? tm.github_handle);
    }
  }

  const sorted = [...workers].sort((a, b) => {
    const cmp = statusRank[statusOf(a)] - statusRank[statusOf(b)];
    if (cmp !== 0) return cmp;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <PageHeader
        eyebrow="Workers"
        title="Worker registry"
        description="Daemons registered for this project. A walk runs on whichever eligible worker is online — laptops handle manual + localhost work, dedicated machines handle webhook-triggered walks."
      />

      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-2)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg-3)] text-[11px] uppercase tracking-[0.12em] text-[var(--color-text-faint)]">
              <tr>
                <th className="px-4 py-2.5 text-left">Worker</th>
                <th className="px-4 py-2.5 text-left">Kind</th>
                <th className="px-4 py-2.5 text-left">Owner</th>
                <th className="px-4 py-2.5 text-left">Claims</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Last heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((w) => {
                const status = statusOf(w);
                const owner = w.github_handle ? displayName.get(w.github_handle) ?? w.github_handle : "—";
                const claims = Object.entries(w.capabilities ?? {})
                  .filter(([, v]) => v)
                  .map(([k]) => k)
                  .join(", ");
                return (
                  <tr key={w.id} className="border-t border-[var(--color-border)]">
                    <td className="px-4 py-2.5 font-medium">{w.name}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{w.kind}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{owner}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)] font-mono text-[12px]">
                      {claims || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)] font-mono text-[12px]">
                      {w.last_heartbeat_at ? relativeTime(w.last_heartbeat_at) : "never"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 text-xs text-[var(--color-text-faint)] max-w-2xl">
        Don&apos;t see your daemon? Run{" "}
        <code className="px-1 py-0.5 rounded bg-[var(--color-bg-3)] text-[var(--color-text-muted)]">pnpm daemon</code>{" "}
        in your project, or{" "}
        <Link href="https://github.com/agiterra/rove/blob/main/docs/plans/named-workers.md" className="underline">
          read the worker setup guide
        </Link>
        .
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: WorkerStatus }) {
  const variants: Record<WorkerStatus, { label: string; bg: string; fg: string; dot: string }> = {
    online: {
      label: "online",
      bg: "bg-[var(--color-accent-soft)]",
      fg: "text-[var(--color-accent)]",
      dot: "var(--color-accent)",
    },
    stale: {
      label: "stale",
      bg: "bg-amber-950/30",
      fg: "text-amber-300",
      dot: "rgb(253 230 138)",
    },
    stopped: {
      label: "stopped",
      bg: "bg-[var(--color-bg-3)]",
      fg: "text-[var(--color-text-muted)]",
      dot: "var(--color-text-faint)",
    },
    disabled: {
      label: "disabled",
      bg: "bg-red-950/30",
      fg: "text-red-300",
      dot: "rgb(239 68 68)",
    },
  };
  const v = variants[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] ${v.bg} ${v.fg}`}>
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: v.dot }} />
      {v.label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const dt = Date.now() - new Date(iso).getTime();
  if (dt < 0) return "just now";
  if (dt < 60_000) return `${Math.floor(dt / 1000)}s ago`;
  if (dt < 60 * 60_000) return `${Math.floor(dt / 60_000)}m ago`;
  if (dt < 24 * 60 * 60_000) return `${Math.floor(dt / (60 * 60_000))}h ago`;
  return `${Math.floor(dt / (24 * 60 * 60_000))}d ago`;
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-2)] p-10 text-center">
      <p className="font-medium mb-1">No workers yet</p>
      <p className="text-sm text-[var(--color-text-muted)]">
        Start a daemon with <code className="px-1 py-0.5 rounded bg-[var(--color-bg-3)]">pnpm daemon</code> to register
        a worker for this project.
      </p>
    </div>
  );
}
