import type { SupabaseClient } from "@supabase/supabase-js";
import type { FlowInfo, Persona } from "@tankloop/agentic-ux-evaluator-core";

/**
 * SupabaseStore — upserts canonical-in-git rows (personas, flows) and
 * inserts canonical-here rows (runs). The Sink calls these inside `route()`.
 *
 * Why not in core? Adding @supabase/supabase-js to core would fatten every
 * downstream that doesn't need it (e.g. the markdown-only path). Keep
 * Supabase as a leaf dependency of tankloop-eval until the Phase 9
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
}

export class SupabaseStore {
  constructor(private readonly db: SupabaseClient) {}

  async upsertPersona(p: Persona): Promise<void> {
    const { error } = await this.db.from("personas").upsert(
      {
        id: p.id,
        label: p.label,
        description: p.description,
        category: p.category,
        expertise: p.expertise,
        constraints: p.constraints,
        prompt_addendum: p.promptAddendum,
        is_built_in: p.isBuiltIn,
        icon: p.icon ?? null,
        // Built-ins have no source YAML, so we don't stamp synced_from_yaml_at
        // here. `tankloop-eval sync` (Phase 8) does that for workspace
        // personas with the YAML sha attached.
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`upsertPersona(${p.id}): ${error.message}`);
  }

  async upsertFlow(flow: FlowInfo): Promise<void> {
    const { error } = await this.db.from("flows").upsert(
      {
        id: flow.flowId,
        title: flow.flowId,
        goal: flow.goal,
        yaml_path: flow.filePath,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`upsertFlow(${flow.flowId}): ${error.message}`);
  }

  async createRun(input: CreateRunInput): Promise<void> {
    const { error } = await this.db.from("runs").insert({
      id: input.runId,
      flow_id: input.flowId,
      persona_id: input.personaId,
      dispatcher: input.dispatcher,
      initiator_label: input.initiatorLabel ?? null,
      commit_sha: input.commitSha ?? null,
      branch: input.branch ?? null,
      artifacts_storage_prefix: `runs/${input.runId}`,
      started_at: input.startedAt.toISOString(),
      status: "running",
    });
    if (error) throw new Error(`createRun(${input.runId}): ${error.message}`);
  }

  async completeRun(input: {
    runId: string;
    finishedAt: Date;
    walkedUrl?: string;
    summary?: string;
    status: "completed" | "failed";
    exitCode?: number;
  }): Promise<void> {
    const { error } = await this.db
      .from("runs")
      .update({
        finished_at: input.finishedAt.toISOString(),
        walked_url: input.walkedUrl ?? null,
        summary: input.summary ?? null,
        status: input.status,
        exit_code: input.exitCode ?? null,
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

  /** Sync-only: upsert a workspace persona with its YAML SHA. */
  async upsertPersonaWithYaml(p: Persona, yamlSha256: string): Promise<void> {
    const { error } = await this.db.from("personas").upsert(
      {
        id: p.id,
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

  /** Sync-only: upsert a flow with its YAML SHA. */
  async upsertFlowWithYaml(flow: FlowInfo, yamlSha256: string): Promise<void> {
    const { error } = await this.db.from("flows").upsert(
      {
        id: flow.flowId,
        title: flow.flowId,
        goal: flow.goal,
        yaml_path: flow.filePath,
        yaml_sha256: yamlSha256,
        synced_from_yaml_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`upsertFlowWithYaml(${flow.flowId}): ${error.message}`);
  }
}

export interface DedupMatch {
  id: string;
  runId: string;
  githubIssueUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
  status: string;
}
