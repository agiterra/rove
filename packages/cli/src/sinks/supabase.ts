import { readFile, stat, unlink } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUILT_IN_PERSONAS,
  type Finding,
  type FindingScreenshot,
  type SinkAdapter,
  type SinkInput,
  type SinkResult,
} from "@agiterra/rove-core";
import { getSupabaseClient } from "../supabase/client.js";
import { computeContentHash } from "../supabase/content-hash.js";
import { SupabaseStore } from "../supabase/store.js";
import { readTrajectoryLog, type ParsedTrajectory } from "../mcp-proxy/parse-log.js";

const WALKS_BUCKET = "walks";

export interface SupabaseSinkOptions {
  /** Project slug — namespaces every row this sink writes. From rove.config.ts. */
  projectId: string;
  /** Override the client (tests). Defaults to `getSupabaseClient()`. */
  client?: SupabaseClient;
  /**
   * Delete each staged screenshot from the local screenshots dir after a
   * successful upload. Default true — Supabase Storage is the durable home,
   * the local dir is just where the agent stages files.
   */
  deleteLocalAfterUpload?: boolean;
}

/**
 * SupabaseSink — Phase 7.
 *
 * Writes everything for one walk into the eval Supabase project:
 *   1. Upserts the persona + flow (idempotent — mirrors git).
 *   2. Inserts the run row.
 *   3. Inserts a row per finding (with content_hash precomputed for the
 *      Phase 8 dedup query).
 *   4. Uploads any referenced screenshots into the `walks` Storage bucket
 *      under `runs/<run_id>/<filename>` and records them in
 *      `finding_screenshots`.
 *   5. Marks the run completed.
 *
 * Phase 8 added the dedup oracle inline: on each finding insert, the sink
 * queries for a prior open finding with the same content_hash and, if
 * found, links the new row to the same GitHub issue URL and bumps the
 * prior's last_seen_at. The GitHubIssuesSink (when given the same store)
 * uses the same oracle to decide whether to file a new issue or comment
 * on the existing one.
 */
export class SupabaseSink implements SinkAdapter {
  readonly id = "supabase";
  readonly label = "Supabase eval store";

  private readonly db: SupabaseClient;
  private readonly projectId: string;
  /** Exposed so factories can wire the same store into GitHubIssuesSink for dedup. */
  readonly store: SupabaseStore;
  private readonly deleteLocalAfterUpload: boolean;

  constructor(opts: SupabaseSinkOptions) {
    this.projectId = opts.projectId;
    this.db = opts.client ?? getSupabaseClient();
    this.store = new SupabaseStore(this.db, this.projectId);
    this.deleteLocalAfterUpload = opts.deleteLocalAfterUpload ?? true;
  }

  async route(input: SinkInput): Promise<SinkResult> {
    const artifacts: string[] = [];
    const persona = BUILT_IN_PERSONAS.find((p) => p.id === input.payload.persona_id);
    if (!persona) {
      return failure(this.id, `Persona not found in built-ins: ${input.payload.persona_id}`);
    }

    try {
      await this.store.upsertPersona(persona);
      // Sink-path doesn't read the YAML, so it can't know the budget or
      // emit a yaml_body. The sync path / discoverFlows() write the real
      // values; this just keeps the row alive so the run insert's FK
      // passes. Pass null / empty string so upsertFlow skips those columns
      // and doesn't clobber an already-synced value.
      await this.store.upsertFlow({
        flowId: input.payload.flow_id,
        goal: input.payload.summary ?? input.payload.flow_id,
        filePath: "(unknown)",
        budget: null,
        yamlBody: "",
      });
      await this.store.createRun({
        runId: input.runId,
        flowId: input.payload.flow_id,
        personaId: input.payload.persona_id,
        dispatcher: input.dispatcherId,
        commitSha: input.commitSha,
        branch: input.branch,
        startedAt: input.startedAt,
        kind: input.kind ?? "flow",
      });
    } catch (err) {
      return failure(this.id, err);
    }

    let routed = 0;
    const errors: string[] = [];
    for (const finding of input.payload.findings) {
      try {
        const findingId = await this.insertFinding(input, finding);
        const uploaded = await this.uploadScreenshots(input, findingId, finding.screenshots ?? []);
        artifacts.push(...uploaded);
        routed++;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    // Expand affordance_gaps into findings rows with heuristic
    // `agent.affordance_gap.<kind>`. Each gap is a negative-space finding;
    // see docs/proposals/affordance-gaps.md §1 finding-emission rules.
    for (const gap of input.payload.affordance_gaps ?? []) {
      try {
        const syntheticFinding: Finding = {
          id: `affordance_gap-${gap.kind}-${gap.step_index ?? "global"}-${routed}`,
          severity: gap.severity,
          title: `Missing ${gap.kind} affordance${gap.url_pattern ? ` on ${gap.url_pattern}` : ""}`,
          description:
            `Expected for: ${gap.expected_for}\n\nEvidence:\n${gap.evidence}` +
            (gap.suggested_location ? `\n\nSuggested location: ${gap.suggested_location}` : ""),
          step_index: gap.step_index,
          heuristic: `agent.affordance_gap.${gap.kind}`,
          evidence: gap.evidence,
          screenshots: [],
        };
        await this.insertFinding(input, syntheticFinding);
        routed++;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    try {
      const { plan, surprises, reflection, change_review: changeReview } = input.payload;
      await this.store.completeRun({
        runId: input.runId,
        finishedAt: input.finishedAt,
        walkedUrl: input.payload.walked_url,
        summary: input.payload.summary,
        status: errors.length === 0 ? "completed" : "failed",
        exitCode: 0,
        goalReached: reflection?.goal_reached,
        plan: plan ?? undefined,
        surprises: surprises && surprises.length > 0 ? surprises : undefined,
        predictedStepCount: plan?.expected_step_count,
        actualStepCount: reflection?.actual_step_count,
        largestExpectationGap: reflection?.largest_expectation_gap,
        personaSuccessConfidence: reflection?.confidence_persona_would_succeed,
        changedRoutes: changeReview?.changed_routes,
        referenceRoutes: changeReview?.reference_routes,
        designContract: changeReview?.design_contract,
        deltas: changeReview?.deltas && changeReview.deltas.length > 0 ? changeReview.deltas : undefined,
        priorPlan: input.payload.prior_plan ?? undefined,
        priorPlanCapturedAt: input.payload.prior_plan ? input.startedAt : undefined,
      });

      // Persist trajectory after the run row exists (step rows FK to runs.id).
      if (input.trajectoryLogPath) {
        const trajectory = await this.readAndPersistTrajectory(input);
        if (trajectory) {
          artifacts.push(input.trajectoryLogPath);
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    artifacts.unshift(`runs/${input.runId}`);

    return {
      sinkId: this.id,
      routedCount: routed,
      skippedCount: 0,
      artifacts,
      ok: errors.length === 0,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    };
  }

  private async readAndPersistTrajectory(input: SinkInput): Promise<ParsedTrajectory | null> {
    if (!input.trajectoryLogPath) return null;
    const trajectory = await readTrajectoryLog(input.trajectoryLogPath, input.startedAt);
    if (!trajectory) return null;
    await this.store.writeTrajectory({
      runId: input.runId,
      steps: input.liveStepsAlreadyWritten ? [] : trajectory.steps,
      metrics: trajectory.metrics,
    });
    return trajectory;
  }

  private async insertFinding(input: SinkInput, finding: Finding): Promise<string> {
    const contentHash = computeContentHash(input.payload.flow_id, finding);

    // Phase 8 dedup: look for a prior open finding with the same content_hash
    // that already has a GitHub issue pinned. Born the new row linked to it
    // so the dashboard's "GH issue" column is correct from row one.
    const prior = await this.store.findExistingByContentHash(contentHash, {
      excludeRunId: input.runId,
    });

    const { data, error } = await this.db
      .from("findings")
      .insert({
        run_id: input.runId,
        project_id: this.projectId,
        agent_id: finding.id,
        severity: finding.severity,
        title: finding.title,
        description: finding.description,
        step_index: finding.step_index ?? null,
        heuristic: finding.heuristic ?? null,
        evidence: finding.evidence ?? null,
        content_hash: contentHash,
        github_issue_url: prior?.githubIssueUrl ?? null,
        status: prior ? "filed" : "new",
      })
      .select("id")
      .single();
    if (error) throw new Error(`insertFinding(${finding.id}): ${error.message}`);

    if (prior) {
      // Bump the prior's last_seen_at so dashboard "recently active" sorts
      // surface findings that keep reappearing.
      await this.store.touchFindingLastSeen(prior.id, input.finishedAt);
    }

    return data.id;
  }

  private async uploadScreenshots(
    input: SinkInput,
    findingId: string,
    screenshots: FindingScreenshot[],
  ): Promise<string[]> {
    if (screenshots.length === 0) return [];
    const out: string[] = [];
    for (let i = 0; i < screenshots.length; i++) {
      const shot = screenshots[i];
      const absolute = resolve(input.screenshotsDir, shot.path);
      let buf: Buffer;
      let byteSize: number;
      try {
        buf = await readFile(absolute);
        byteSize = (await stat(absolute)).size;
      } catch (err) {
        throw new Error(
          `Screenshot file not found at ${absolute} (referenced by finding ${findingId}): ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }

      const filename = sanitizeFilename(shot.path);
      const storageKey = `runs/${input.runId}/${filename}`;
      const { error: upErr } = await this.db.storage.from(WALKS_BUCKET).upload(storageKey, buf, {
        contentType: contentTypeFor(filename),
        upsert: true,
      });
      if (upErr) {
        throw new Error(`Upload ${storageKey}: ${upErr.message}`);
      }

      const { error: rowErr } = await this.db.from("finding_screenshots").insert({
        finding_id: findingId,
        project_id: this.projectId,
        storage_bucket: WALKS_BUCKET,
        storage_key: storageKey,
        caption: shot.caption ?? null,
        ordinal: i,
        byte_size: byteSize,
      });
      if (rowErr) {
        throw new Error(`Insert finding_screenshot row for ${storageKey}: ${rowErr.message}`);
      }

      if (this.deleteLocalAfterUpload) {
        await unlink(absolute).catch(() => {
          // Best-effort cleanup; don't fail the sink if the file already moved.
        });
      }
      out.push(storageKey);
    }
    return out;
  }
}

function sanitizeFilename(p: string): string {
  // Allow only the basename + restrict to safe chars; agents sometimes emit
  // a nested path or a leading "./".
  const base = basename(p);
  return base.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function contentTypeFor(filename: string): string {
  const ext = extname(filename).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function failure(sinkId: string, err: unknown): SinkResult {
  return {
    sinkId,
    routedCount: 0,
    skippedCount: 0,
    artifacts: [],
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  };
}
