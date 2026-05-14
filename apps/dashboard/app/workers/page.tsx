/**
 * /workers — single-pane view of every worker registered in this project.
 *
 * Server-rendered: fetches the workers + team_member rows, computes the
 * status of each, and hands the resolved list to the card surface. Tablet+
 * card layout matches the run-detail hero language: aurora background,
 * brand-cyan accents, online dot pulse, kinetic hover.
 */
import Link from "next/link";
import { createReadClient } from "../../lib/supabase/server";
import { resolveProjectId } from "../../lib/project-context";
import { WorkerRowActions } from "./WorkerRowActions";

export const dynamic = "force-dynamic";

export const metadata: import("next").Metadata = {
  title: "Workers",
  description:
    "Daemons registered for this project — which ones are online and what they will claim.",
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
    .select(
      "id, name, kind, github_handle, capabilities, last_heartbeat_at, stopped_at, disabled_at, created_at",
    )
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
  const handles = Array.from(
    new Set(workers.map((w) => w.github_handle).filter((h): h is string => Boolean(h))),
  );
  const displayName = new Map<string, string>();
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

  const counts = sorted.reduce<Record<WorkerStatus, number>>(
    (acc, w) => {
      acc[statusOf(w)] += 1;
      return acc;
    },
    { online: 0, stale: 0, stopped: 0, disabled: 0 },
  );

  return (
    <div className="space-y-7">
      <Hero projectId={projectId} counts={counts} total={sorted.length} />

      {sorted.length === 0 ? (
        <EmptyState projectId={projectId} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sorted.map((w) => (
              <WorkerCard
                key={w.id}
                worker={w}
                ownerLabel={
                  w.github_handle ? displayName.get(w.github_handle) ?? w.github_handle : null
                }
                projectId={projectId}
              />
            ))}
          </div>
          <InstallAnother projectId={projectId} />
        </>
      )}
    </div>
  );
}

function Hero({
  projectId,
  counts,
  total,
}: {
  projectId: string;
  counts: Record<WorkerStatus, number>;
  total: number;
}) {
  const hasOnline = counts.online > 0;
  const headline =
    total === 0
      ? "No workers yet"
      : counts.online === total
        ? "All workers online"
        : `${counts.online} of ${total} online`;
  return (
    <section className="lw-hero" style={{ ["--lw-glow" as keyof React.CSSProperties]: hasOnline ? 1 : 0.5 } as React.CSSProperties}>
      <div className="lw-hero-aurora" />
      <div className="lw-hero-edge" />
      <div className="relative z-[1] flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p
            className="font-mono uppercase text-[var(--color-text-faint)] mb-3"
            style={{ fontSize: 11, letterSpacing: "0.18em" }}
          >
            WORKERS <span className="opacity-60">·</span> {projectId}
          </p>
          <h1
            className="font-semibold tracking-tight"
            style={{
              fontSize: 38,
              lineHeight: 1.1,
              textShadow: hasOnline
                ? "0 0 24px rgba(63,201,203,0.35), 0 0 56px rgba(63,201,203,0.18)"
                : undefined,
            }}
          >
            {headline}
          </h1>
          <p className="mt-3 text-sm text-[var(--color-text-muted)] max-w-xl">
            Daemons registered for this project. Laptops claim manual + localhost; dedicated
            machines claim webhook-triggered walks.
          </p>
        </div>
        <StatsStrip counts={counts} total={total} />
      </div>
    </section>
  );
}

function StatsStrip({ counts, total }: { counts: Record<WorkerStatus, number>; total: number }) {
  const tiles: Array<[string, number, string]> = [
    ["online", counts.online, "var(--color-accent)"],
    ["stale", counts.stale, "rgb(253 230 138)"],
    ["stopped", counts.stopped, "var(--color-text-faint)"],
    ["disabled", counts.disabled, "rgb(239 68 68)"],
  ];
  return (
    <div className="grid grid-cols-4 gap-2 min-w-[360px]">
      {tiles.map(([label, n, color]) => (
        <div
          key={label}
          className="rounded-xl backdrop-blur px-3 py-2.5"
          style={{ background: "rgba(20,26,42,0.55)", border: "1px solid var(--color-border)" }}
        >
          <div
            className="font-mono uppercase mb-1 flex items-center gap-1.5"
            style={{ fontSize: 10.5, letterSpacing: "0.12em", color: "var(--color-text-faint)" }}
          >
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: color }}
            />
            {label}
          </div>
          <div className="font-mono tabular-nums text-[var(--color-text)]" style={{ fontSize: 22 }}>
            {n}
          </div>
        </div>
      ))}
      <div className="col-span-4 text-right text-[11px] font-mono text-[var(--color-text-faint)] -mt-0.5">
        {total} total
      </div>
    </div>
  );
}

function WorkerCard({
  worker,
  ownerLabel,
  projectId,
}: {
  worker: WorkerRow;
  ownerLabel: string | null;
  projectId: string;
}) {
  const status = statusOf(worker);
  const claims = Object.entries(worker.capabilities ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k);
  const ring =
    status === "online"
      ? "border-[rgba(63,201,203,0.5)] shadow-[0_0_0_1px_rgba(63,201,203,0.18),_0_0_28px_-8px_rgba(63,201,203,0.4)]"
      : status === "disabled"
        ? "border-[rgba(239,68,68,0.45)]"
        : "border-[var(--color-border)]";
  return (
    <article
      className={`kinetic-hover rounded-2xl border bg-[var(--color-panel)] p-5 flex flex-col gap-4 ${ring}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <StatusBadge status={status} />
            <span
              className="font-mono uppercase"
              style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "var(--color-text-faint)" }}
            >
              {worker.kind}
            </span>
          </div>
          <h2 className="font-medium text-[var(--color-text)] truncate" style={{ fontSize: 17 }}>
            {worker.name}
          </h2>
          {ownerLabel ? (
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{ownerLabel}</p>
          ) : null}
        </div>
        <OwnerInitial label={ownerLabel ?? worker.name} />
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        {claims.length === 0 ? (
          <span className="text-xs text-[var(--color-text-faint)] font-mono">— no claims —</span>
        ) : (
          claims.map((c) => <ClaimChip key={c} label={c} />)
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--color-border)]">
        <span className="font-mono text-[12px] text-[var(--color-text-muted)]">
          {worker.last_heartbeat_at ? `heartbeat ${relativeTime(worker.last_heartbeat_at)}` : "never heartbeated"}
        </span>
        <WorkerRowActions workerName={worker.name} projectId={projectId} status={status} />
      </footer>
    </article>
  );
}

function ClaimChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono"
      style={{
        fontSize: 11,
        background: "rgba(63,201,203,0.10)",
        border: "1px solid rgba(63,201,203,0.30)",
        color: "#b4e9ea",
      }}
    >
      <span
        aria-hidden
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: "var(--color-accent)" }}
      />
      {label}
    </span>
  );
}

function OwnerInitial({ label }: { label: string }) {
  const ch = label.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className="grid place-items-center rounded-full shrink-0"
      style={{
        width: 32,
        height: 32,
        background: "linear-gradient(135deg, var(--color-brand-cyan) 0%, var(--color-brand-navy) 100%)",
        color: "white",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.04em",
      }}
    >
      {ch}
    </span>
  );
}

function StatusBadge({ status }: { status: WorkerStatus }) {
  const variants: Record<WorkerStatus, { label: string; bg: string; fg: string; dot: string; pulse: boolean }> = {
    online: { label: "online", bg: "rgba(63,201,203,0.10)", fg: "#6ee2e4", dot: "var(--color-accent)", pulse: true },
    stale: { label: "stale", bg: "rgba(253,230,138,0.10)", fg: "rgb(253 230 138)", dot: "rgb(253 230 138)", pulse: false },
    stopped: { label: "stopped", bg: "rgba(148,163,184,0.10)", fg: "var(--color-text-muted)", dot: "var(--color-text-faint)", pulse: false },
    disabled: { label: "disabled", bg: "rgba(239,68,68,0.12)", fg: "#fca5b5", dot: "rgb(239 68 68)", pulse: false },
  };
  const v = variants[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-mono"
      style={{
        padding: "2px 8px 2px 7px",
        fontSize: 11,
        background: v.bg,
        color: v.fg,
        border: `1px solid ${v.dot === "var(--color-accent)" ? "rgba(63,201,203,0.32)" : "transparent"}`,
      }}
    >
      <span aria-hidden className={`lw-dot${v.pulse ? " lw-pulse" : ""}`} style={{ background: v.dot }} />
      {v.label}
    </span>
  );
}

function InstallAnother({ projectId }: { projectId: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-dashed border-[var(--color-border-strong)] px-5 py-4">
      <div>
        <p className="text-sm text-[var(--color-text)]">Install on another machine</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          One-paste install · macOS · LaunchAgent auto-start · pause / resume from the dashboard
        </p>
      </div>
      <Link
        href={`/setup?p=${encodeURIComponent(projectId)}`}
        className="focus-rove inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium"
        style={{
          background: "linear-gradient(135deg, var(--color-brand-cyan) 0%, var(--color-brand-navy) 100%)",
          color: "white",
        }}
      >
        Open install
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function EmptyState({ projectId }: { projectId: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border-strong)] p-10 text-center">
      <p className="font-medium text-[var(--color-text)] mb-1">No workers yet</p>
      <p className="text-sm text-[var(--color-text-muted)] max-w-md mx-auto mb-5">
        Without a worker, queued walks have nothing to claim. The web install takes about a
        minute and runs as a background LaunchAgent on macOS.
      </p>
      <Link
        href={`/setup?p=${encodeURIComponent(projectId)}`}
        className="focus-rove inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
        style={{
          background: "linear-gradient(135deg, var(--color-brand-cyan) 0%, var(--color-brand-navy) 100%)",
          color: "white",
        }}
      >
        Install a worker
        <span aria-hidden>→</span>
      </Link>
    </div>
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
