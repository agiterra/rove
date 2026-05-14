import type { SupabaseClient } from "@supabase/supabase-js";
import type { FlowInfo, Persona } from "@agiterra/rove-core";

/**
 * SupabaseStore — upserts canonical-in-git rows (personas, flows) and
 * inserts canonical-here rows (runs). The Sink calls these inside `route()`.
 *
 * Why not in core? Adding @supabase/supabase-js to core would fatten every
 * downstream that doesn't need it (e.g. the markdown-only path). Keep
 * Supabase as a leaf dependency of rove until the Phase 9
 * dashboard needs to share this code — then extract to a package.
 */
export interface CreateRunInput {
  runId: string;
  flowId: string;
  personaId: string;
  dispatcher: string;
  initiatorLabel?: string;
  commitSha?: string;
  branch?: string;
  startedAt: Date;
  /** Defaults to "flow" — set "change_review" for `rove change-review` runs. */
  kind?: "flow" | "change_review";
}

export class SupabaseStore {
  constructor(
    private readonly db: SupabaseClient,
    private readonly projectId: string,
  ) {}

  async upsertPersona(p: Persona): Promise<void> {
    const { error } = await this.db.from("personas").upsert(
      {
        id: p.id,
        project_id: this.projectId,
        label: p.label,
        description: p.description,
        category: p.category,
        expertise: p.expertise,
        constraints: p.constraints,
        prompt_addendum: p.promptAddendum,
        is_built_in: p.isBuiltIn,
        icon: p.icon ?? null,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`upsertPersona(${p.id}): ${error.message}`);
  }

  async upsertFlow(flow: FlowInfo): Promise<void> {
    // `budget` is only included when explicitly known. Otherwise we'd
    // clobber a value the sync path / discoverFlows() already populated.
    const row: Record<string, unknown> = {
      id: flow.flowId,
      project_id: this.projectId,
      title: flow.flowId,
      goal: flow.goal,
      yaml_path: flow.filePath,
    };
    const budgetRow = budgetForRow(flow.budget);
    if (budgetRow != null) row.budget = budgetRow;
    if (flow.yamlBody && flow.yamlBody.length > 0) row.yaml_body = flow.yamlBody;

    const { error } = await this.db.from("flows").upsert(row, { onConflict: "id" });
    if (error) throw new Error(`upsertFlow(${flow.flowId}): ${error.message}`);
  }

  /**
   * Idempotent. Called twice in the live-step-writes path: once upfront
   * by `commands/run.ts` (so per-step inserts have a parent row), once at
   * sink time (which is the legacy entry-point and still the only caller
   * for runs without live writes). The upsert keys on `id`.
   */
  async createRun(input: CreateRunInput): Promise<void> {
    const { error } = await this.db.from("runs").upsert(
      {
        id: input.runId,
        project_id: this.projectId,
        flow_id: input.flowId,
        persona_id: input.personaId,
        dispatcher: input.dispatcher,
        initiator_label: input.initiatorLabel ?? null,
        commit_sha: input.commitSha ?? null,
        branch: input.branch ?? null,
        artifacts_storage_prefix: `runs/${input.runId}`,
        started_at: input.startedAt.toISOString(),
        status: "running",
        kind: input.kind ?? "flow",
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`createRun(${input.runId}): ${error.message}`);
  }

  async completeRun(input: {
    runId: string;
    finishedAt: Date;
    walkedUrl?: string;
    summary?: string;
    status: "completed" | "failed";
    exitCode?: number;
    goalReached?: boolean;
    plan?: unknown;
    surprises?: unknown;
    predictedStepCount?: number;
    actualStepCount?: number;
    largestExpectationGap?: string;
    personaSuccessConfidence?: number;
    // Change-review fields (§0 item #5) — null on flow walks.
    changedRoutes?: string[];
    referenceRoutes?: string[];
    designContract?: unknown;
    deltas?: unknown;
    // Expectation-match prior plan, when the persona captured one.
    priorPlan?: unknown;
    priorPlanCapturedAt?: Date;
  }): Promise<void> {
    const { error } = await this.db
      .from("runs")
      .update({
        finished_at: input.finishedAt.toISOString(),
        walked_url: input.walkedUrl ?? null,
        summary: input.summary ?? null,
        status: input.status,
        exit_code: input.exitCode ?? null,
        goal_reached: input.goalReached ?? null,
        plan: input.plan ?? null,
        surprises: input.surprises ?? null,
        predicted_step_count: input.predictedStepCount ?? null,
        actual_step_count: input.actualStepCount ?? null,
        largest_expectation_gap: input.largestExpectationGap ?? null,
        persona_success_confidence: input.personaSuccessConfidence ?? null,
        changed_routes: input.changedRoutes ?? null,
        reference_routes: input.referenceRoutes ?? null,
        design_contract: input.designContract ?? null,
        deltas: input.deltas ?? null,
        prior_plan: input.priorPlan ?? null,
        prior_plan_captured_at: input.priorPlanCapturedAt
          ? input.priorPlanCapturedAt.toISOString()
          : null,
      })
      .eq("id", input.runId);
    if (error) throw new Error(`completeRun(${input.runId}): ${error.message}`);
  }

  /**
   * Dedup oracle (Phase 8).
   *
   * Returns the most-recently-seen prior finding with the same
   * `content_hash` that:
   *   - is still actionable (status NOT IN ('dismissed','fixed'))
   *   - has an open GitHub issue URL pinned to it
   *   - was seen within the dedup window (default 30 days)
   *
   * Returns null when this finding is new (no prior open issue to link to).
   * Used by both SupabaseSink (to link the new row) and GitHubIssuesSink
   * (to comment on the existing issue instead of filing a duplicate).
   */
  async findExistingByContentHash(
    contentHash: string,
    opts: { withinDays?: number; excludeRunId?: string } = {},
  ): Promise<DedupMatch | null> {
    const withinDays = opts.withinDays ?? 30;
    const cutoff = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString();
    let q = this.db
      .from("findings")
      .select("id, run_id, github_issue_url, first_seen_at, last_seen_at, status")
      .eq("content_hash", contentHash)
      .not("github_issue_url", "is", null)
      .not("status", "in", "(dismissed,fixed)")
      .gte("first_seen_at", cutoff)
      .order("last_seen_at", { ascending: false })
      .limit(1);
    if (opts.excludeRunId) q = q.neq("run_id", opts.excludeRunId);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(`findExistingByContentHash: ${error.message}`);
    if (!data) return null;
    return {
      id: data.id,
      runId: data.run_id,
      githubIssueUrl: data.github_issue_url as string,
      firstSeenAt: data.first_seen_at,
      lastSeenAt: data.last_seen_at,
      status: data.status,
    };
  }

  /** Bump `last_seen_at` on a prior finding so the dashboard's recency sort is honest. */
  async touchFindingLastSeen(findingId: string, when: Date): Promise<void> {
    const { error } = await this.db
      .from("findings")
      .update({ last_seen_at: when.toISOString() })
      .eq("id", findingId);
    if (error) throw new Error(`touchFindingLastSeen(${findingId}): ${error.message}`);
  }

  /**
   * Persist the GitHub issue URL on a finding row and stamp status='filed'.
   * Used both when filing a new issue and when linking to an existing one.
   */
  async setFindingGithubUrl(findingId: string, url: string): Promise<void> {
    const { error } = await this.db
      .from("findings")
      .update({ github_issue_url: url, status: "filed" })
      .eq("id", findingId);
    if (error) throw new Error(`setFindingGithubUrl(${findingId}): ${error.message}`);
  }

  /**
   * Find the findings row produced by a given run for a given content_hash
   * and stamp its github_issue_url. Used by GitHubIssuesSink to write the
   * URL back after `gh issue create` succeeds.
   */
  async setFindingGithubUrlByRun(runId: string, contentHash: string, url: string): Promise<void> {
    const { data, error } = await this.db
      .from("findings")
      .select("id")
      .eq("run_id", runId)
      .eq("content_hash", contentHash)
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`setFindingGithubUrlByRun lookup: ${error.message}`);
    }
    if (!data) return;
    await this.setFindingGithubUrl(data.id, url);
  }

  /**
   * Persist parsed MCP-proxy trajectory rows + the aggregate metrics roll-up.
   * Inserted as a batch; runs.metrics is patched in the same call.
   */
  async writeTrajectory(input: {
    runId: string;
    steps: Array<{
      step_index: number;
      direction: "result" | "error";
      tool_name: string;
      args: unknown;
      result_summary: string | null;
      aria_snapshot: string | null;
      url_after: string | null;
      duration_ms: number;
    }>;
    metrics: unknown;
  }): Promise<void> {
    if (input.steps.length > 0) {
      const rows = input.steps.map((s) => ({
        run_id: input.runId,
        project_id: this.projectId,
        step_index: s.step_index,
        direction: s.direction,
        tool_name: s.tool_name,
        args: s.args ?? null,
        result_summary: s.result_summary,
        aria_snapshot: s.aria_snapshot,
        url_after: s.url_after,
        duration_ms: s.duration_ms,
      }));
      const { error } = await this.db.from("run_steps").insert(rows);
      if (error) throw new Error(`writeTrajectory(steps): ${error.message}`);
    }
    const { error: metricsErr } = await this.db
      .from("runs")
      .update({ metrics: input.metrics })
      .eq("id", input.runId);
    if (metricsErr) throw new Error(`writeTrajectory(metrics): ${metricsErr.message}`);
  }

  /** Sync-only: upsert a project persona with its YAML SHA. */
  async upsertPersonaWithYaml(p: Persona, yamlSha256: string): Promise<void> {
    const { error } = await this.db.from("personas").upsert(
      {
        id: p.id,
        project_id: this.projectId,
        label: p.label,
        description: p.description,
        category: p.category,
        expertise: p.expertise,
        constraints: p.constraints,
        prompt_addendum: p.promptAddendum,
        is_built_in: p.isBuiltIn,
        icon: p.icon ?? null,
        yaml_sha256: yamlSha256,
        synced_from_yaml_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`upsertPersonaWithYaml(${p.id}): ${error.message}`);
  }

  /** Sync-only: upsert a flow with its YAML SHA + body. */
  async upsertFlowWithYaml(flow: FlowInfo, yamlSha256: string): Promise<void> {
    const { error } = await this.db.from("flows").upsert(
      {
        id: flow.flowId,
        project_id: this.projectId,
        title: flow.flowId,
        goal: flow.goal,
        yaml_path: flow.filePath,
        yaml_sha256: yamlSha256,
        synced_from_yaml_at: new Date().toISOString(),
        budget: budgetForRow(flow.budget),
        yaml_body: flow.yamlBody,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`upsertFlowWithYaml(${flow.flowId}): ${error.message}`);
  }

  /**
   * Fetch a single flow row by id, for the workspace-less run path: a
   * daemon installed via /setup has no repo checkout and must reconstitute
   * the YAML from the DB. Returns null when the row is missing or has no
   * yaml_body (older flows synced before the column existed).
   */
  async fetchFlowYaml(flowId: string): Promise<{ goal: string; yamlBody: string } | null> {
    const { data, error } = await this.db
      .from("flows")
      .select("goal, yaml_body")
      .eq("id", flowId)
      .eq("project_id", this.projectId)
      .maybeSingle();
    if (error) throw new Error(`fetchFlowYaml(${flowId}): ${error.message}`);
    if (!data) return null;
    const body = (data as { goal: string; yaml_body: string | null }).yaml_body;
    if (!body || body.length === 0) return null;
    return { goal: (data as { goal: string }).goal, yamlBody: body };
  }
}

/**
 * Map the parsed `FlowBudget` to the JSONB row shape we store. Returns
 * null when no budget was authored — keeps the column unset for those
 * flows so the dashboard can degrade gracefully.
 */
function budgetForRow(b: FlowInfo["budget"]): { max_steps: number | null; max_seconds: number | null } | null {
  if (!b) return null;
  if (b.maxSteps == null && b.maxSeconds == null) return null;
  return { max_steps: b.maxSteps, max_seconds: b.maxSeconds };
}

export interface DedupMatch {
  id: string;
  runId: string;
  githubIssueUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
  status: string;
}
