import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ChangeDelta,
  ChangeReview,
  DesignContract,
  Finding,
  SinkAdapter,
  SinkInput,
  SinkResult,
  Surprise,
} from "@agiterra/rove-core";
import { readTrajectoryLog, type ParsedTrajectory } from "../mcp-proxy/parse-log.js";

/**
 * Writes a single Markdown report per run to <reportsDir>/agentic-walks/.
 * Filename:  <flow_id>-<persona_id>-<isoStamp>.md
 */
export class MarkdownSink implements SinkAdapter {
  readonly id = "markdown";
  readonly label = "Markdown report";

  constructor(private readonly reportsDir: string) {}

  async route(input: SinkInput): Promise<SinkResult> {
    const targetDir = join(this.reportsDir, "agentic-walks");
    await mkdir(targetDir, { recursive: true });
    const stamp = input.startedAt.toISOString().replace(/[:.]/g, "-");
    const filename = `${slug(input.payload.flow_id)}-${slug(input.payload.persona_id)}-${stamp}.md`;
    const filePath = join(targetDir, filename);
    const trajectory = input.trajectoryLogPath
      ? await readTrajectoryLog(input.trajectoryLogPath, input.startedAt)
      : null;
    await writeFile(filePath, renderReport(input, trajectory), "utf8");
    return {
      sinkId: this.id,
      routedCount: input.payload.findings.length,
      skippedCount: 0,
      artifacts: [filePath],
      ok: true,
    };
  }
}

function renderReport(input: SinkInput, trajectory: ParsedTrajectory | null): string {
  const { payload, dispatcherId, startedAt, finishedAt } = input;
  const durationS = ((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1);
  const { plan, surprises = [], reflection } = payload;

  const lines: string[] = [
    `# Agentic UX Walk — ${payload.flow_id}`,
    ``,
    `- **Persona**: ${payload.persona_id}`,
    `- **Dispatcher**: ${dispatcherId}`,
    `- **Started**: ${startedAt.toISOString()}`,
    `- **Finished**: ${finishedAt.toISOString()} (${durationS}s)`,
    payload.walked_url ? `- **Walked URL**: ${payload.walked_url}` : "",
    reflection ? `- **Goal reached**: ${reflection.goal_reached ? "✓" : "✗"}` : "",
    reflection?.actual_step_count !== undefined
      ? `- **Steps taken**: ${reflection.actual_step_count}${plan?.expected_step_count !== undefined ? ` (expected ${plan.expected_step_count})` : ""}`
      : "",
    reflection?.confidence_persona_would_succeed !== undefined
      ? `- **Confidence another user of this persona would succeed**: ${Math.round(reflection.confidence_persona_would_succeed * 100)}%`
      : "",
    ``,
    `## Summary`,
    ``,
    payload.summary ?? "_(no summary)_",
    ``,
  ].filter(Boolean);

  if (payload.change_review) lines.push(...renderChangeReview(payload.change_review), ``);
  if (plan) lines.push(...renderPlan(plan), ``);
  if (surprises.length > 0) lines.push(...renderSurprises(surprises), ``);
  if (reflection?.largest_expectation_gap) {
    lines.push(`## Largest expectation gap`, ``, reflection.largest_expectation_gap, ``);
  }
  if (trajectory) lines.push(...renderTrajectory(trajectory), ``);

  lines.push(`## Findings (${payload.findings.length})`, ``);
  for (const severity of ["critical", "major", "minor", "nit"] as const) {
    const group = payload.findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    lines.push(`### ${severity} (${group.length})`, ``);
    for (const finding of group) {
      lines.push(...renderFinding(finding), ``);
    }
  }

  return lines.join("\n");
}

function renderChangeReview(cr: ChangeReview): string[] {
  const out = [
    `## Change review`,
    ``,
    `- **Changed**: ${cr.changed_routes.map((r) => `\`${r}\``).join(", ")}`,
    `- **Reference**: ${cr.reference_routes.length > 0 ? cr.reference_routes.map((r) => `\`${r}\``).join(", ") : "_(none)_"}`,
    ``,
    ...renderDesignContract(cr.design_contract),
  ];
  if (cr.deltas.length > 0) {
    out.push(``, `### Coherence deltas (${cr.deltas.length})`, ``);
    for (const d of cr.deltas) {
      out.push(...renderDelta(d), ``);
    }
  } else {
    out.push(``, `### Coherence deltas`, ``, `_No deltas — the changed route matches the local contract._`);
  }
  return out;
}

function renderDesignContract(c: DesignContract): string[] {
  const rows: Array<[string, string | undefined]> = [
    ["layout", c.layout_pattern],
    ["primary action", c.primary_action_pattern],
    ["form", c.form_pattern],
    ["success", c.success_pattern],
    ["navigation", c.navigation_pattern],
    ["density", c.density],
    ["tone", c.tone],
  ];
  const filled = rows.filter(([, v]) => typeof v === "string");
  if (filled.length === 0) return [`_Inferred contract is empty — no usable reference signal._`];
  const out = [`### Inferred design contract`, ``, `| field | value | from |`, `|---|---|---|`];
  for (const [label, value] of filled) {
    const key = label.replace(" ", "_");
    const src = c.derived_from?.[`${key}_pattern`] ?? c.derived_from?.[key] ?? "";
    out.push(`| ${label} | ${value} | ${src} |`);
  }
  return out;
}

function renderDelta(d: ChangeDelta): string[] {
  const sev = d.severity ?? "major";
  const step = d.step_index !== undefined ? ` · step ${d.step_index}` : "";
  return [
    `#### ${d.kind} (${sev})${step}`,
    ``,
    `- **Expected:** ${d.expected}`,
    `- **Observed:** ${d.observed}`,
    `- **Why it matters:** ${d.why_it_matters}`,
  ];
}

function renderPlan(plan: NonNullable<SinkInput["payload"]["plan"]>): string[] {
  const out = [
    `## Plan (authored before any browser call)`,
    ``,
    `_Expected ${plan.expected_step_count} step${plan.expected_step_count === 1 ? "" : "s"}${plan.expected_minutes ? `, ~${plan.expected_minutes} min` : ""}._`,
    ``,
  ];
  for (const step of plan.expected_path) {
    const aff = step.expected_affordance ? ` _(${step.expected_affordance})_` : "";
    out.push(`${step.step}. ${step.description}${aff}`);
  }
  if (plan.biggest_worry) {
    out.push(``, `> **Biggest worry going in:** ${plan.biggest_worry}`);
  }
  return out;
}

function renderSurprises(surprises: Surprise[]): string[] {
  const out = [`## Surprises (${surprises.length})`, ``];
  for (const s of surprises) {
    const mark = s.recovered ? "▲ recovered" : "✗ unrecovered";
    const cost = s.recovery_cost_steps ? ` · +${s.recovery_cost_steps} step${s.recovery_cost_steps === 1 ? "" : "s"}` : "";
    out.push(`### Step ${s.step_index} — ${s.kind} · ${mark}${cost}`);
    out.push(``, `- **Expected:** ${s.expected}`, `- **Observed:** ${s.observed}`, ``);
  }
  return out;
}

function renderTrajectory(t: ParsedTrajectory): string[] {
  const m = t.metrics;
  const out = [
    `## Trajectory`,
    ``,
    `_${m.actual_tool_calls} tool calls · ${m.actions} actions · ${m.snapshots} snapshots · ${m.snapshots_per_action ?? "—"} snaps/action · ${m.recovery_count} recoveries · ${m.errors} errors_`,
    ``,
    "| # | tool | args | duration | result |",
    "|---|------|------|---------:|--------|",
  ];
  for (const s of t.steps) {
    const args = s.args && typeof s.args === "object" ? oneLineArgs(s.args) : "";
    const result = (s.result_summary ?? "").replace(/\|/g, "\\|").slice(0, 80);
    out.push(`| ${s.step_index} | \`${s.tool_name}\` | ${args} | ${s.duration_ms}ms | ${result} |`);
  }
  return out;
}

function oneLineArgs(args: object): string {
  const a = args as Record<string, unknown>;
  for (const k of ["url", "name", "ref", "text", "selector"]) {
    if (typeof a[k] === "string") return `\`${k}=${(a[k] as string).slice(0, 60)}\``;
  }
  return "—";
}

function renderFinding(f: Finding): string[] {
  const out = [`#### ${f.title}`, ``, f.description, ``];
  const meta: string[] = [];
  if (f.heuristic) meta.push(`heuristic: \`${f.heuristic}\``);
  if (f.step_index !== undefined) meta.push(`step: ${f.step_index}`);
  if (f.evidence) meta.push(`evidence: ${f.evidence}`);
  if (meta.length > 0) out.push(`<sub>${meta.join(" · ")}</sub>`);
  return out;
}

function slug(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-");
}
