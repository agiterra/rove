import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createReadClient } from "../../../lib/supabase/server";
import { resolveProjectId } from "../../../lib/project-context";
import { Hero, PlanSection, ReflectionSection, FindingsSection } from "./parts";
import { TrajectorySection } from "./trajectory";
import type { RunDetail, RunFinding, RunStep } from "./types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string }>;
}

const RUN_COLUMNS =
  "id, project_id, flow_id, persona_id, dispatcher, status, branch, commit_sha, started_at, finished_at, initiator_label, walked_url, summary, goal_reached, plan, surprises, predicted_step_count, actual_step_count, largest_expectation_gap, persona_success_confidence, metrics";

const RUN_STEP_COLUMNS =
  "step_index, direction, tool_name, args, result_summary, aria_snapshot, url_after, duration_ms";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Run ${id.slice(0, 8)}` };
}

export default async function RunDetailPage({ params, searchParams }: PageProps) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const projectId = await resolveProjectId(sp);
  const supabase = await createReadClient();

  const [runRes, findingsRes, stepsRes] = await Promise.all([
    supabase
      .from("runs")
      .select(RUN_COLUMNS)
      .eq("id", id)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("findings")
      .select(
        "id, severity, title, description, status, heuristic, github_issue_url, first_seen_at, last_seen_at, content_hash",
      )
      .eq("run_id", id)
      .eq("project_id", projectId)
      .order("severity", { ascending: true }),
    supabase
      .from("run_steps")
      .select(RUN_STEP_COLUMNS)
      .eq("run_id", id)
      .eq("project_id", projectId)
      .order("step_index", { ascending: true }),
  ]);

  if (runRes.error || !runRes.data) notFound();
  const run = runRes.data as unknown as RunDetail;
  const findings = (findingsRes.data ?? []) as unknown as RunFinding[];
  const steps = (stepsRes.data ?? []) as unknown as RunStep[];

  return (
    <div className="space-y-6">
      <Link
        href="/runs"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        all runs
      </Link>

      <Hero run={run} findingCount={findings.length} />
      <PlanSection run={run} />
      <TrajectorySection steps={steps} metrics={run.metrics} />
      <ReflectionSection run={run} />
      <FindingsSection runId={run.id} findings={findings} />
    </div>
  );
}
