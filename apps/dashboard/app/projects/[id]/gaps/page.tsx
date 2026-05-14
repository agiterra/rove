/**
 * /projects/[id]/gaps — project-wide negative-space rollup.
 *
 * Reads every run_steps row in the project whose affordance_gaps jsonb is
 * non-empty, groups by kind / URL / severity, and renders a longitudinal
 * view. Consumes the finding-lifecycle substrate's FindingTrendChart and
 * FindingEmptyState shells.
 *
 * Per .claude/rules/dashboard.md: awaited params + searchParams, resolveProjectId
 * filtering, metadata via sibling layout.tsx.
 */
import { createReadClient } from "../../../../lib/supabase/server";
import { resolveProjectId } from "../../../../lib/project-context";
import {
  FindingEmptyState,
  FindingTrendChart,
} from "@/components/finding-lifecycle";
import {
  flattenGaps,
  GapCard,
  GapsFilters,
  GapsHeader,
  kindCounts,
  SEVERITY_ORDER,
  VALID_KINDS,
  VALID_SEVERITIES,
  type GapKind,
  type RunStepRow,
  type Severity,
} from "./parts";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string; kind?: string; severity?: string }>;
}

export default async function GapsRollupPage({ params, searchParams }: PageProps) {
  const [{ id: projectIdFromUrl }, sp] = await Promise.all([params, searchParams]);
  // Honor ?p=<slug> override when present (matches the rest of the dashboard's
  // project-context resolution); otherwise fall back to the URL segment.
  const projectId = sp.p ? await resolveProjectId(sp) : projectIdFromUrl;

  const supabase = await createReadClient();

  // Pull every step row in the project that has a non-null affordance_gaps
  // array. Cap at 2000 so a runaway project doesn't lock the page;
  // pagination is a follow-up when this becomes a real problem.
  const { data, error } = await supabase
    .from("run_steps")
    .select(
      "run_id, step_index, url_after, affordance_gaps, runs!inner(flow_id, persona_id, started_at)",
    )
    .eq("project_id", projectId)
    .not("affordance_gaps", "is", null)
    .order("step_index", { ascending: false })
    .limit(2000);

  if (error) {
    return (
      <main className="mx-auto max-w-[1240px] px-8 py-10">
        <GapsHeader projectId={projectId} />
        <div className="mt-6 bg-red-950/30 border border-red-800/40 text-red-200 rounded-xl p-6">
          <p className="font-medium mb-1">Could not load affordance gaps</p>
          <p className="text-sm font-mono">{error.message}</p>
        </div>
      </main>
    );
  }

  const rows = (data ?? []) as unknown as RunStepRow[];
  const allGaps = flattenGaps(rows);

  const kindFilter =
    sp.kind && VALID_KINDS.has(sp.kind as GapKind) ? (sp.kind as GapKind) : null;
  const severityFilter =
    sp.severity && VALID_SEVERITIES.has(sp.severity as Severity)
      ? (sp.severity as Severity)
      : null;

  const filtered = allGaps.filter((g) => {
    if (kindFilter && g.gap.kind !== kindFilter) return false;
    if (severityFilter && g.gap.severity !== severityFilter) return false;
    return true;
  });

  const totalCount = allGaps.length;
  const filteredCount = filtered.length;

  return (
    <main className="mx-auto max-w-[1240px] px-8 py-10">
      <GapsHeader projectId={projectId} totalCount={totalCount} />

      <section className="mt-6">
        <FindingTrendChart
          projectId={projectId}
          heuristicPrefix="agent.affordance_gap"
          windowDays={30}
          bucket="day"
        />
      </section>

      {totalCount === 0 ? (
        <section className="mt-8">
          <FindingEmptyState surface="gaps_rollup" projectId={projectId} />
        </section>
      ) : (
        <>
          <GapsFilters
            current={{ kind: kindFilter, severity: severityFilter }}
            projectId={projectId}
            counts={kindCounts(allGaps)}
          />

          <section
            aria-label="Gap rollup table"
            className="mt-5"
            style={{
              background: "var(--color-panel)",
              border: "1px solid var(--color-border)",
              borderRadius: 14,
              padding: 18,
            }}
          >
            <p
              className="font-mono uppercase text-[var(--color-text-faint)] m-0 mb-3"
              style={{ fontSize: 11, letterSpacing: "0.18em" }}
            >
              {filteredCount} of {totalCount} gaps
              {kindFilter ? ` · kind=${kindFilter}` : ""}
              {severityFilter ? ` · severity=${severityFilter}` : ""}
            </p>
            {filteredCount === 0 ? (
              <p className="text-[13px] text-[var(--color-text-muted)] m-0 p-3">
                No gaps match these filters.
              </p>
            ) : (
              <ul className="grid gap-3 m-0 p-0 list-none">
                {filtered
                  .slice()
                  .sort(
                    (a, b) =>
                      SEVERITY_ORDER[a.gap.severity] - SEVERITY_ORDER[b.gap.severity],
                  )
                  .slice(0, 200)
                  .map((g, i) => (
                    <li key={`${g.runId}-${g.stepIndex}-${g.gap.kind}-${i}`}>
                      <GapCard g={g} />
                    </li>
                  ))}
              </ul>
            )}
            {filtered.length > 200 ? (
              <p className="mt-3 text-[11px] font-mono text-[var(--color-text-faint)] m-0">
                showing first 200 — narrow with filters above
              </p>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}
