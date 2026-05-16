import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createReadClient } from "../../../lib/supabase/server";
import { EmptyState } from "../../../components/page-header";
import { resolveProjectId } from "../../../lib/project-context";
import { RunWalkButton, type PersonaOption } from "./run-walk-button";
import { TrendChart } from "./trend-chart";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ flowId: string }>;
}): Promise<Metadata> {
  const { flowId } = await params;
  const decoded = decodeURIComponent(flowId);
  return {
    title: decoded,
    description: `Review Rove walk history and findings trend for ${decoded}.`,
  };
}

interface RunWithFindings {
  id: string;
  started_at: string;
  status: string;
  goal_reached: boolean | null;
  findings: { severity: string }[];
}
interface PersonaRow {
  id: string;
  label: string;
  category: string;
}
interface FlowRow {
  id: string;
  title: string;
  goal: string;
  yaml_path: string;
}
interface PageProps {
  params: Promise<{ flowId: string }>;
  searchParams: Promise<{ p?: string }>;
}

export default async function FlowDetailPage({ params, searchParams }: PageProps) {
  const [{ flowId }, sp] = await Promise.all([params, searchParams]);
  const decoded = decodeURIComponent(flowId);
  const projectId = await resolveProjectId(sp);
  const supabase = await createReadClient();

  const [flowRes, runsRes, personasRes] = await Promise.all([
    supabase
      .from("flows")
      .select("id, title, goal, yaml_path")
      .eq("id", decoded)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("runs_with_status")
      .select("id, started_at, status:effective_status, goal_reached, findings(severity)")
      .eq("flow_id", decoded)
      .eq("project_id", projectId)
      .order("started_at", { ascending: true })
      .limit(200),
    supabase.from("personas").select("id, label, category").eq("project_id", projectId).order("id"),
  ]);

  if (runsRes.error) {
    return (
      <div className="bg-red-950/30 border border-red-800/40 text-red-200 rounded-xl p-6">
        <p className="font-medium mb-1">Could not load flow</p>
        <p className="text-sm font-mono">{runsRes.error.message}</p>
      </div>
    );
  }

  const flow = flowRes.data as FlowRow | null;
  const runs = (runsRes.data ?? []) as unknown as RunWithFindings[];
  const personas: PersonaOption[] = ((personasRes.data ?? []) as PersonaRow[]).map((p) => ({
    id: p.id,
    label: `${p.id} — ${p.label}`,
    category: p.category,
  }));

  const totals = { critical: 0, major: 0, minor: 0, nit: 0 };
  for (const r of runs) {
    for (const f of r.findings ?? []) {
      if (f.severity in totals) totals[f.severity as keyof typeof totals]++;
    }
  }
  const totalFindings = totals.critical + totals.major + totals.minor + totals.nit;

  const goalRuns = runs.filter((r) => r.goal_reached !== null);
  const goalsReached = goalRuns.filter((r) => r.goal_reached === true).length;
  const goalsTotal = goalRuns.length;
  const goalPct = goalsTotal > 0 ? Math.round((goalsReached / goalsTotal) * 100) : null;
  const goalColor =
    goalPct === null
      ? undefined
      : goalPct >= 80
        ? "var(--color-accent)"
        : goalPct >= 50
          ? "var(--color-severity-major)"
          : "var(--color-severity-critical)";

  const series = runs.map((r) => {
    const counts = { critical: 0, major: 0, minor: 0, nit: 0 };
    for (const f of r.findings ?? []) {
      if (f.severity in counts) counts[f.severity as keyof typeof counts]++;
    }
    return {
      at: new Date(r.started_at).toISOString().slice(0, 10),
      total: r.findings?.length ?? 0,
      ...counts,
    };
  });

  return (
    <div className="space-y-6">
      <Link
        href="/flows"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        all flows
      </Link>

      {/* Hero */}
      <div className="surface p-6 md:p-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-faint)] mb-2">
              flow
            </p>
            <h1 className="font-mono text-xl md:text-2xl text-[var(--color-accent)] break-all">
              {decoded}
            </h1>
            {flow?.goal ? (
              <p className="mt-3 text-[var(--color-text)] max-w-2xl text-balance">{flow.goal}</p>
            ) : null}
            {flow?.yaml_path ? (
              <p className="mt-3 text-[11px] text-[var(--color-text-faint)] font-mono">
                {flow.yaml_path}
              </p>
            ) : null}
          </div>
          <RunWalkButton flowId={decoded} personas={personas} />
        </div>

        {/* Stat strip */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <GoalsReachedStat
            reached={goalsReached}
            total={goalsTotal}
            pct={goalPct}
            color={goalColor}
          />
          <Stat label="runs" value={runs.length} />
          <Stat label="findings" value={totalFindings} />
          <Stat label="critical" value={totals.critical} color="var(--color-severity-critical)" />
          <Stat label="major" value={totals.major} color="var(--color-severity-major)" />
          <Stat label="minor" value={totals.minor} color="var(--color-severity-minor)" />
        </div>
      </div>

      {/* Trend */}
      {series.length === 0 ? (
        <EmptyState
          emoji="🛰"
          title="No walks yet"
          description="Pick a persona and hit Run walk above. The agent will pull this flow's spec and walk it against the target."
        />
      ) : (
        <div className="surface p-6">
          <h2 className="text-[11px] font-medium mb-4 text-[var(--color-text-faint)] uppercase tracking-wider">
            Findings per run
          </h2>
          <TrendChart data={series} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg bg-[var(--color-bg-2)]/60 border border-[var(--color-border)] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
        {label}
      </div>
      <div
        className="mt-0.5 text-xl font-semibold tabular-nums"
        style={color && value > 0 ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function GoalsReachedStat({
  reached,
  total,
  pct,
  color,
}: {
  reached: number;
  total: number;
  pct: number | null;
  color: string | undefined;
}) {
  return (
    <div
      className="rounded-lg bg-[var(--color-bg-2)]/60 border border-[var(--color-border)] px-3 py-2.5"
      title={
        total === 0
          ? "No walks have recorded goal_reached yet."
          : `${reached} of ${total} walks reached the flow goal.`
      }
    >
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
        goals reached
      </div>
      {total === 0 ? (
        <div className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--color-text-faint)]">
          —
        </div>
      ) : (
        <div
          className="mt-0.5 flex items-baseline gap-1.5 tabular-nums"
          style={color ? { color } : undefined}
        >
          <span className="text-xl font-semibold">
            {reached}
            <span className="text-[var(--color-text-faint)]">/{total}</span>
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)]">{pct}%</span>
        </div>
      )}
    </div>
  );
}
