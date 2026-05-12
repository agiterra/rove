import { spawn } from "node:child_process";
import type {
  Finding,
  FindingSeverity,
  SinkAdapter,
  SinkInput,
  SinkResult,
} from "@tankloop/agentic-ux-evaluator-core";
import { FINDING_SEVERITIES } from "@tankloop/agentic-ux-evaluator-core";
import { computeContentHash } from "../supabase/content-hash.js";
import type { SupabaseStore } from "../supabase/store.js";

export interface GitHubIssuesSinkOptions {
  /** Minimum severity to file. Defaults to "major". */
  minSeverity?: FindingSeverity;
  /** `area:*` label appended to every issue. Defaults to "area:agents". */
  areaLabel?: string;
  /** `type:*` label appended to every issue. Defaults to "type:bug". */
  typeLabel?: string;
  /** When true, log the gh commands but don't run them. */
  dryRun?: boolean;
  /**
   * Phase 8 — when set, dedup repeated findings by querying this store for
   * a prior open finding with the same content_hash. If one exists, the sink
   * comments on the existing issue instead of filing a new one. If unset,
   * the sink behaves like Phase 7: every qualifying finding gets a fresh
   * issue, duplicates and all.
   */
  dedupStore?: SupabaseStore;
}

/**
 * Files each qualifying finding as a GitHub issue via `gh issue create`.
 *
 * With `dedupStore` set (Phase 8), repeated findings within the dedup
 * window get a comment on the existing issue instead of a new issue.
 * Without it (Phase 7 fallback), every walk re-files.
 */
export class GitHubIssuesSink implements SinkAdapter {
  readonly id = "github-issues";
  readonly label = "GitHub Issues";

  private readonly minSeverityRank: number;
  private readonly opts: Required<Omit<GitHubIssuesSinkOptions, "dedupStore">>;
  private readonly dedupStore?: SupabaseStore;

  constructor(opts: GitHubIssuesSinkOptions = {}) {
    this.opts = {
      minSeverity: opts.minSeverity ?? "major",
      areaLabel: opts.areaLabel ?? "area:agents",
      typeLabel: opts.typeLabel ?? "type:bug",
      dryRun: opts.dryRun ?? false,
    };
    this.dedupStore = opts.dedupStore;
    this.minSeverityRank = FINDING_SEVERITIES.indexOf(this.opts.minSeverity);
  }

  async route(input: SinkInput): Promise<SinkResult> {
    const qualifying = input.payload.findings.filter(
      (f) => FINDING_SEVERITIES.indexOf(f.severity) <= this.minSeverityRank,
    );
    const skipped = input.payload.findings.length - qualifying.length;

    const artifacts: string[] = [];
    const errors: string[] = [];
    let commented = 0;

    for (const finding of qualifying) {
      try {
        const outcome = await this.routeOne(finding, input);
        if (outcome.url) artifacts.push(outcome.url);
        if (outcome.kind === "commented") commented++;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    return {
      sinkId: this.id,
      routedCount: qualifying.length - errors.length,
      // Comments count as routed-but-not-newly-filed. Skipped is reserved for
      // findings below the severity threshold so the existing CLI summary
      // line stays meaningful.
      skippedCount: skipped,
      artifacts,
      ok: errors.length === 0,
      error: errors.length > 0 ? errors.join("; ") : undefined,
      // Surface dedup wins so the CLI summary can show "filed 1 / commented 2".
      // SinkResult is structural so additive metadata rides as a property.
      ...({ commentedCount: commented } as object),
    };
  }

  private async routeOne(
    finding: Finding,
    input: SinkInput,
  ): Promise<{ kind: "filed" | "commented" | "skipped"; url: string | null }> {
    const hash = computeContentHash(input.payload.flow_id, finding);

    // Dedup path: comment on the existing issue when one is found.
    if (this.dedupStore) {
      const prior = await this.dedupStore.findExistingByContentHash(hash, {
        excludeRunId: input.runId,
      });
      if (prior) {
        const body = renderRepeatComment(finding, input);
        if (this.opts.dryRun) {
          console.error(`[dry-run] gh issue comment ${prior.githubIssueUrl} (seen-again)`);
          return { kind: "commented", url: prior.githubIssueUrl };
        }
        await runGh(["issue", "comment", prior.githubIssueUrl, "--body", body]);
        return { kind: "commented", url: prior.githubIssueUrl };
      }
    }

    // Filing path: create a new issue.
    const title = `[UX·${finding.severity}] ${finding.title}`;
    const body = renderIssueBody(finding, input);
    const labels = [
      this.opts.areaLabel,
      this.opts.typeLabel,
      "agentic-evaluator",
      `flow:${input.payload.flow_id}`,
      `persona:${input.payload.persona_id}`,
      `severity:${finding.severity}`,
    ].join(",");

    if (this.opts.dryRun) {
      console.error(`[dry-run] gh issue create --title ${JSON.stringify(title)} --label ${labels}`);
      return { kind: "filed", url: null };
    }

    const url = await runGh([
      "issue",
      "create",
      "--title",
      title,
      "--body",
      body,
      "--label",
      labels,
    ]);

    // Write the new URL back to the matching Supabase row so future runs
    // dedup against it.
    if (this.dedupStore) {
      await this.dedupStore.setFindingGithubUrlByRun(input.runId, hash, url);
    }
    return { kind: "filed", url };
  }
}

function renderRepeatComment(finding: Finding, input: SinkInput): string {
  const lines = [
    `Seen again by the agentic UX evaluator.`,
    ``,
    `- **Run**: \`${input.runId}\``,
    `- **Flow**: \`${input.payload.flow_id}\``,
    `- **Persona**: \`${input.payload.persona_id}\``,
    `- **Dispatcher**: \`${input.dispatcherId}\``,
    `- **When**: ${input.startedAt.toISOString()}`,
  ];
  if (input.commitSha) lines.push(`- **Commit**: \`${input.commitSha}\``);
  if (input.branch) lines.push(`- **Branch**: \`${input.branch}\``);
  if (finding.step_index !== undefined) lines.push(`- **Step**: ${finding.step_index}`);
  if (input.payload.walked_url) lines.push(`- **Walked URL**: ${input.payload.walked_url}`);
  lines.push(``, `_Filed automatically by \`tankloop-eval\` (dedup wrapper)._`);
  return lines.join("\n");
}

function renderIssueBody(finding: Finding, input: SinkInput): string {
  const lines = [
    finding.description,
    "",
    "---",
    "",
    `**Severity**: ${finding.severity}`,
    `**Flow**: \`${input.payload.flow_id}\``,
    `**Persona**: \`${input.payload.persona_id}\``,
    `**Dispatcher**: \`${input.dispatcherId}\``,
    `**Run started**: ${input.startedAt.toISOString()}`,
  ];
  if (finding.heuristic) lines.push(`**Heuristic**: \`${finding.heuristic}\``);
  if (finding.step_index !== undefined) lines.push(`**Step**: ${finding.step_index}`);
  if (finding.evidence) lines.push(`**Evidence**: ${finding.evidence}`);
  if (input.payload.walked_url) lines.push(`**Walked URL**: ${input.payload.walked_url}`);
  lines.push("", "_Filed automatically by `tankloop-eval`._");
  return lines.join("\n");
}

function runGh(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`gh exited ${code}: ${stderr.trim() || stdout.trim()}`));
      }
    });
  });
}
