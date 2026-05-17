/**
 * Body builder for the draft item / issue created by the GitHub adapter.
 * Kept separate so the adapter file stays focused on the orchestration.
 *
 * The body is markdown. Project v2 draft items render markdown; if a
 * draft is later promoted to a real issue, the markdown stays
 * source-of-truth on GitHub's side from that point on (per the v3 plan
 * §3f: Rove never re-writes a body after promotion).
 */

import type { BacklogFinding } from "../types";

export function buildFindingBody(finding: BacklogFinding): string {
  const sev = SEVERITY_LABEL[finding.severity];
  const lines: (string | null)[] = [
    `## ${sev} · ${finding.title}`,
    "",
    metaTable(finding),
    "",
    "### What happened",
    "",
    finding.description?.trim() || "_no description_",
    "",
  ];

  if (finding.evidence && finding.evidence.trim().length > 0) {
    lines.push("### Evidence", "", fence(finding.evidence), "");
  }

  if (finding.screenshotUrls.length > 0) {
    lines.push("### Screenshots", "");
    for (const shot of finding.screenshotUrls) {
      const alt = shot.caption?.trim() || "screenshot";
      lines.push(`![${alt}](${shot.url})`);
      if (shot.caption?.trim()) {
        lines.push(`<sub>${shot.caption.trim()}</sub>`);
      }
      lines.push("");
    }
  }

  if (finding.dashboardRunUrl) {
    lines.push(
      "---",
      "",
      `[View in Rove dashboard →](${finding.dashboardRunUrl})`,
      "",
    );
  }

  lines.push("", "_Filed by Rove · the agent-readable-web evaluation platform._");

  return lines.filter((l): l is string => l !== null).join("\n");
}

function metaTable(finding: BacklogFinding): string {
  const rows: [string, string][] = [
    ["Severity", SEVERITY_LABEL[finding.severity]],
    ["Heuristic", finding.heuristic ? "`" + finding.heuristic + "`" : "—"],
    ["Persona", "`" + finding.personaId + "`"],
    ["Flow", "`" + finding.flowId + "`"],
    ["Run", "`" + finding.runId + "`"],
  ];
  if (finding.ownerHandle) rows.push(["Owner", "@" + finding.ownerHandle]);
  if (finding.teamLabel) rows.push(["Team", finding.teamLabel]);
  if (finding.stepIndex != null) rows.push(["Step", String(finding.stepIndex)]);
  // Two-column markdown table — narrow + scannable.
  const header = "| | |\n|---|---|";
  const body = rows.map(([k, v]) => `| **${k}** | ${v} |`).join("\n");
  return header + "\n" + body;
}

function fence(text: string): string {
  // Defang fences inside the input so they don't escape our block.
  const safe = text.replace(/```/g, "``​`");
  return "```\n" + safe + "\n```";
}

const SEVERITY_LABEL: Record<BacklogFinding["severity"], string> = {
  critical: "🔴 Critical",
  major: "🟠 Major",
  minor: "🟡 Minor",
  nit: "⚪ Nit",
};
