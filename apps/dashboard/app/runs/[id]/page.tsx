import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  createReadClient,
  createServiceRoleSupabase,
} from "../../../lib/supabase/server";
import { resolveProjectId } from "../../../lib/project-context";
import { resolveProjectRepo } from "../../../lib/findings/project-repo";
import { ReflectionSection, FindingsSection } from "./parts";
import { TrajectorySection } from "./trajectory";
import {
  ChangeReviewHero,
  DeltasSection,
  DesignContractSection,
} from "./change-review";
import type { RunDetail, RunFinding, RunStep } from "./types";
import { RunDetailLive } from "@/components/run-detail/RunDetailLive";
import { buildRunDetailView } from "@/components/run-detail/adapters";
import { ProjectSwitcher } from "@/components/project-switcher";
import { resolveRunWorkerStatus } from "../../../lib/supabase/resolve-run-worker";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string }>;
}

// Reads from runs_with_status so a zombie (status=running on disk,
// heartbeat older than 5min) renders as failed without waiting for
// sweep_stuck_runs_all. `status` here is the view's effective_status,
// aliased so the rest of the page is unchanged.
const RUN_COLUMNS =
  "id, project_id, flow_id, persona_id, dispatcher, status:effective_status, branch, commit_sha, started_at, finished_at, initiator_label, walked_url, summary, error_message, goal_reached, plan, surprises, predicted_step_count, actual_step_count, largest_expectation_gap, persona_success_confidence, metrics, kind, changed_routes, reference_routes, design_contract, deltas, prior_plan, prior_plan_captured_at";

const RUN_STEP_COLUMNS =
  "step_index, direction, tool_name, args, result_summary, aria_snapshot, url_after, duration_ms, screenshot_key, dialog_payload, affordance_gaps, affordance_enum_phase, plan_delta";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Run ${id.slice(0, 8)}` };
}

export default async function RunDetailPage({ params, searchParams }: PageProps) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const projectId = await resolveProjectId(sp);
  const supabase = await createReadClient();

  const [runRes, findingsRes, stepsRes, userRes] = await Promise.all([
    supabase
      .from("runs_with_status")
      .select(RUN_COLUMNS)
      .eq("id", id)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("findings")
      .select(
        "id, severity, title, description, status, heuristic, github_issue_url, first_seen_at, last_seen_at, content_hash, step_index",
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
    supabase.auth.getUser(),
  ]);

  if (runRes.error || !runRes.data) notFound();
  const run = runRes.data as unknown as RunDetail;
  const findings = (findingsRes.data ?? []) as unknown as RunFinding[];
  const steps = (stepsRes.data ?? []) as unknown as RunStep[];

  // Flow budget — separate read because the runs row doesn't carry it.
  // Used by the hero subline to render "remaining budget".
  const [flowBudgetRes, workerStatus] = await Promise.all([
    supabase
      .from("flows")
      .select("budget")
      .eq("id", run.flow_id)
      .eq("project_id", projectId)
      .maybeSingle(),
    resolveRunWorkerStatus(supabase, run.id, projectId),
  ]);
  const flowBudget = (flowBudgetRes.data?.budget ?? null) as
    | { max_steps?: number | null; max_seconds?: number | null }
    | null;

  // change_review keeps the existing sections. Only the default flow path
  // adopts the new design while we wire it in.
  if (run.kind === "change_review") {
    return (
      <div className="aurora space-y-6">
        <Link
          href="/runs"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          all runs
        </Link>
        <ChangeReviewHero run={run} />
        <DesignContractSection contract={run.design_contract} />
        <DeltasSection deltas={run.deltas} />
        <TrajectorySection steps={steps} metrics={run.metrics} />
        <ReflectionSection run={run} />
        <FindingsSection runId={run.id} findings={findings} />
      </div>
    );
  }

  // ── New design path (kind="flow") ────────────────────────────────────────
  // Mint signed URLs for any run_steps with a screenshot_key.
  const stepsWithKeys = steps.filter((s) => Boolean(s.screenshot_key));
  const signedScreenshotUrls = await signScreenshotUrls(stepsWithKeys);

  // Per-finding screenshots: fetch first-ordinal storage_key per finding,
  // sign in walks bucket, hand to adapter as Record<findingId, signedUrl>.
  // The adapter prefers this over the step screenshot when present.
  const signedFindingScreenshotUrls = await signFirstFindingScreenshots(
    findings.map((f) => f.id),
    id,
    projectId,
  );

  const userLabel = derivePreferredUserLabel(userRes.data?.user);

  // Adapter expects rows shaped like `RunRow` / `StepRow` / `FindingRow`.
  // Our typed rows happen to satisfy those structurally; cast to keep
  // adapters.ts pure of dashboard-specific dependencies.
  const view = buildRunDetailView({
    run: run as unknown as Parameters<typeof buildRunDetailView>[0]["run"],
    steps: steps as unknown as Parameters<typeof buildRunDetailView>[0]["steps"],
    findings: findings as unknown as Parameters<typeof buildRunDetailView>[0]["findings"],
    signedScreenshotUrls,
    signedFindingScreenshotUrls,
    flowBudgetSecondsMax: numOrNull(flowBudget?.max_seconds),
    currentUserLabel: userLabel,
    workerStatus,
  });

  const githubRepo = await resolveProjectRepo(projectId);

  return (
    <RunDetailLive
      runId={id}
      projectId={projectId}
      initialView={view}
      initialSignedScreenshotUrls={signedScreenshotUrls}
      initialSignedFindingScreenshotUrls={signedFindingScreenshotUrls}
      githubRepo={githubRepo}
      projectSwitcher={<ProjectSwitcher />}
    />
  );
}

async function signScreenshotUrls(
  steps: Array<{ screenshot_key?: string | null }>,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const keys = steps
    .map((s) => s.screenshot_key)
    .filter((k): k is string => typeof k === "string" && k.length > 0);
  if (keys.length === 0) return out;

  // service-role is required to mint signed URLs; if the env isn't
  // present (e.g., a fresh Preview deployment) we degrade to the
  // 'no screenshot' placeholder rather than throwing the whole page.
  let service: ReturnType<typeof createServiceRoleSupabase>;
  try {
    service = createServiceRoleSupabase();
  } catch {
    return out;
  }

  // Signed URLs minted in a single batch — Supabase JS supports
  // createSignedUrls() for arrays. Falls back to per-key calls if a
  // single one fails.
  try {
    const { data, error } = await service.storage
      .from("walks")
      .createSignedUrls(keys, 60 * 10);
    if (error) throw error;
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl) out[entry.path] = entry.signedUrl;
    }
  } catch {
    for (const key of keys) {
      try {
        const { data } = await service.storage.from("walks").createSignedUrl(key, 60 * 10);
        if (data?.signedUrl) out[key] = data.signedUrl;
      } catch {
        // skip — placeholder fallback in the UI
      }
    }
  }
  return out;
}

/**
 * For each finding, return the signed URL of its first-ordinal screenshot
 * (when one exists). Returns `Record<findingId, signedUrl>`. The walks
 * bucket is the shared storage namespace; service-role is required to
 * mint signed URLs.
 *
 * Missing service-role env (preview deploys) and per-key signing failures
 * degrade silently — the UI falls back to the step screenshot / placeholder
 * instead of throwing the whole page.
 */
async function signFirstFindingScreenshots(
  findingIds: string[],
  runId: string,
  projectId: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (findingIds.length === 0) return out;

  let service: ReturnType<typeof createServiceRoleSupabase>;
  try {
    service = createServiceRoleSupabase();
  } catch {
    return out;
  }

  const { data, error } = await service
    .from("finding_screenshots")
    .select("finding_id, storage_key, ordinal")
    .in("finding_id", findingIds)
    .eq("project_id", projectId)
    .order("ordinal", { ascending: true });
  if (error || !data || data.length === 0) {
    if (error) {
      console.warn(`[run ${runId}] failed to load finding_screenshots`, error);
    }
    return out;
  }

  const firstKeyByFinding = new Map<string, string>();
  for (const row of data as Array<{ finding_id: string; storage_key: string }>) {
    if (!firstKeyByFinding.has(row.finding_id)) {
      firstKeyByFinding.set(row.finding_id, row.storage_key);
    }
  }
  const keys = Array.from(new Set(firstKeyByFinding.values()));
  if (keys.length === 0) return out;

  const keyToSignedUrl: Record<string, string> = {};
  try {
    const { data: signed, error: signErr } = await service.storage
      .from("walks")
      .createSignedUrls(keys, 60 * 10);
    if (signErr) throw signErr;
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) keyToSignedUrl[entry.path] = entry.signedUrl;
    }
  } catch {
    for (const key of keys) {
      try {
        const { data: one } = await service.storage.from("walks").createSignedUrl(key, 60 * 10);
        if (one?.signedUrl) keyToSignedUrl[key] = one.signedUrl;
      } catch {
        // skip
      }
    }
  }

  for (const [findingId, storageKey] of firstKeyByFinding) {
    const signedUrl = keyToSignedUrl[storageKey];
    if (signedUrl) out[findingId] = signedUrl;
  }
  return out;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function derivePreferredUserLabel(
  user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined,
): string | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const handle = typeof meta.user_name === "string" ? meta.user_name : null;
  if (handle) return handle;
  const email = user.email;
  if (typeof email === "string" && email.includes("@")) return email.split("@")[0];
  return null;
}

