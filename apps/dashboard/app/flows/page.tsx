import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { createReadClient } from "../../lib/supabase/server";
import { EmptyState, PageHeader, PrimaryButtonLink } from "../../components/page-header";
import { resolveProjectId } from "../../lib/project-context";

export const dynamic = "force-dynamic";

export const metadata: import("next").Metadata = { title: "Flows" };

interface FlowRow {
  id: string;
  title: string;
  goal: string;
  synced_from_yaml_at: string | null;
}

interface PageProps {
  searchParams: Promise<{ p?: string }>;
}

export default async function FlowsIndexPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const projectId = await resolveProjectId(sp);
  const supabase = await createReadClient();
  const [{ data: flowsData, error }, { data: runsData }] = await Promise.all([
    supabase
      .from("flows")
      .select("id, title, goal, synced_from_yaml_at")
      .eq("project_id", projectId)
      .order("id"),
    supabase.from("runs").select("flow_id").eq("project_id", projectId),
  ]);
  if (error) {
    return (
      <div className="bg-red-950/30 border border-red-800/40 text-red-200 rounded-xl p-6">
        <p className="font-medium mb-1">Could not load flows</p>
        <p className="text-sm font-mono">{error.message}</p>
      </div>
    );
  }
  const flows = (flowsData ?? []) as FlowRow[];
  const runCounts = aggregateCounts((runsData ?? []) as { flow_id: string }[]);

  return (
    <div>
      <PageHeader
        eyebrow="library"
        title="Flows"
        description="Each flow is a goal a real user is trying to accomplish. Authored as YAML in git, walked by an agent, scored by humans."
        actions={
          <PrimaryButtonLink href="/flows/new">
            <Plus className="w-4 h-4" />
            New flow
          </PrimaryButtonLink>
        }
      />

      {flows.length === 0 ? (
        <EmptyState
          emoji="🧭"
          title="No flows yet"
          description="Author your first flow with the wizard, or run `rove sync` to pull existing YAML files."
          action={
            <PrimaryButtonLink href="/flows/new">
              <Plus className="w-4 h-4" />
              Author a flow
            </PrimaryButtonLink>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {flows.map((f) => {
            const runs = runCounts.get(f.id) ?? 0;
            return (
              <li key={f.id}>
                <Link
                  href={`/flows/${encodeURIComponent(f.id)}`}
                  className="group block surface p-5 hover:border-[var(--color-accent)]/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <span className="font-mono text-sm text-[var(--color-accent)] truncate">
                      {f.id}
                    </span>
                    <ArrowUpRight className="w-4 h-4 text-[var(--color-text-faint)] group-hover:text-[var(--color-accent)] shrink-0 transition-colors" />
                  </div>
                  <p className="text-sm text-[var(--color-text)] line-clamp-2 mb-4">{f.goal}</p>
                  <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-faint)]">
                    <span>
                      {runs} {runs === 1 ? "run" : "runs"}
                    </span>
                    <span>·</span>
                    <span title={f.synced_from_yaml_at ?? ""}>
                      synced {fmtAgo(f.synced_from_yaml_at)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function aggregateCounts(rows: { flow_id: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.flow_id, (m.get(r.flow_id) ?? 0) + 1);
  return m;
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d < 1) return "today";
  if (d === 1) return "1d ago";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}
