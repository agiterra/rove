import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Finding,
  SinkAdapter,
  SinkInput,
  SinkResult,
} from "@agiterra/rove-core";

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
    await writeFile(filePath, renderReport(input), "utf8");
    return {
      sinkId: this.id,
      routedCount: input.payload.findings.length,
      skippedCount: 0,
      artifacts: [filePath],
      ok: true,
    };
  }
}

function renderReport(input: SinkInput): string {
  const { payload, dispatcherId, startedAt, finishedAt } = input;
  const durationS = ((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1);
  const lines: string[] = [
    `# Agentic UX Walk — ${payload.flow_id}`,
    ``,
    `- **Persona**: ${payload.persona_id}`,
    `- **Dispatcher**: ${dispatcherId}`,
    `- **Started**: ${startedAt.toISOString()}`,
    `- **Finished**: ${finishedAt.toISOString()} (${durationS}s)`,
    payload.walked_url ? `- **Walked URL**: ${payload.walked_url}` : "",
    ``,
    `## Summary`,
    ``,
    payload.summary ?? "_(no summary)_",
    ``,
    `## Findings (${payload.findings.length})`,
    ``,
  ].filter(Boolean);

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
