"use server";

import "server-only";
import { getInstallationOctokit } from "@/lib/authoring/github-app";
import { requireTeamMember } from "@/lib/authoring/require-team-member";
import { createServerSupabase, createServiceRoleSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export interface SendFindingToIssueInput {
  findingId: string;
  repo: { owner: string; name: string };
}

export interface SendFindingToIssueResult {
  issueUrl: string;
}

interface FindingRow {
  id: string;
  run_id: string;
  project_id: string;
  severity: "critical" | "major" | "minor" | "nit";
  title: string;
  description: string;
  heuristic: string | null;
  evidence: string | null;
  step_index: number | null;
  github_issue_url: string | null;
}

interface RunRow {
  id: string;
  flow_id: string | null;
  persona_id: string | null;
}

interface StepRow {
  url_after: string | null;
}

export async function sendFindingToIssue(
  input: SendFindingToIssueInput,
): Promise<SendFindingToIssueResult> {
  await requireTeamMember();

  const supabase = await createServerSupabase();
  const { data: findingData, error: findingErr } = await supabase
    .from("findings")
    .select(
      "id, run_id, project_id, severity, title, description, heuristic, evidence, step_index, github_issue_url",
    )
    .eq("id", input.findingId)
    .maybeSingle<FindingRow>();
  if (findingErr) throw new Error(`Finding lookup failed: ${findingErr.message}`);
  if (!findingData) throw new Error("Finding not found.");

  if (findingData.github_issue_url) {
    return { issueUrl: findingData.github_issue_url };
  }

  const { data: runData } = await supabase
    .from("runs")
    .select("id, flow_id, persona_id")
    .eq("id", findingData.run_id)
    .maybeSingle<RunRow>();

  let urlAfter: string | null = null;
  if (findingData.step_index != null) {
    const { data: stepRow } = await supabase
      .from("run_steps")
      .select("url_after")
      .eq("run_id", findingData.run_id)
      .eq("step_index", findingData.step_index)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<StepRow>();
    urlAfter = stepRow?.url_after ?? null;
  }

  const heuristicId = findingData.heuristic ?? "uncategorized";
  const observedUrl = urlAfter ?? "unknown URL";
  const title = `[Rove] ${heuristicId} on ${observedUrl}`;
  const body = buildIssueBody({
    finding: findingData,
    flowId: runData?.flow_id ?? null,
    personaId: runData?.persona_id ?? null,
    observedUrl,
    projectId: findingData.project_id,
  });

  const labels = [
    "rove",
    `severity:${findingData.severity}`,
    `heuristic:${heuristicFamily(heuristicId)}`,
  ];

  const octokit = getInstallationOctokit();
  await ensureLabels(octokit, input.repo, labels);

  const issue = await octokit.rest.issues.create({
    owner: input.repo.owner,
    repo: input.repo.name,
    title,
    body,
    labels,
  });

  const issueUrl = issue.data.html_url;

  const writer = createServiceRoleSupabase();
  await writer
    .from("findings")
    .update({ github_issue_url: issueUrl, status: "filed" })
    .eq("id", input.findingId);

  return { issueUrl };
}

function buildIssueBody(args: {
  finding: FindingRow;
  flowId: string | null;
  personaId: string | null;
  observedUrl: string;
  projectId: string;
}): string {
  const { finding, flowId, personaId, observedUrl, projectId } = args;
  const sevBadge = SEVERITY_BADGE[finding.severity];
  // Include `?p=<project>` so the middleware doesn't have to redirect to
  // resolve project context, and so a fresh browser (no project cookie)
  // lands on the right tenant. The hash anchor survives same-origin
  // redirects in modern browsers, so the auth flow ends up at the right
  // step even when the visitor wasn't signed in.
  const qs = `?p=${encodeURIComponent(projectId)}`;
  const hash = finding.step_index != null ? `#step-${finding.step_index}` : "";
  const dashboardUrl = `${dashboardOrigin()}/runs/${finding.run_id}${qs}${hash}`;

  return [
    `## Finding · ${sevBadge}`,
    "",
    finding.title,
    "",
    `**Heuristic** · \`${finding.heuristic ?? "uncategorized"}\``,
    `**Observed URL** · \`${observedUrl}\``,
    flowId ? `**Flow** · \`${flowId}\`` : null,
    personaId ? `**Persona** · \`${personaId}\`` : null,
    finding.step_index != null ? `**Step** · ${finding.step_index}` : null,
    "",
    "### Description",
    "",
    finding.description || "_no description_",
    "",
    finding.evidence ? "### Evidence\n\n" + fence(finding.evidence) : null,
    "",
    `[Open this finding in Rove](${dashboardUrl})`,
    "",
    "---",
    "_Filed by Rove — the agent-readable-web evaluation platform._",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function dashboardOrigin(): string {
  if (env.isProduction()) return "https://rove-agiterra.vercel.app";
  return process.env["NEXT_PUBLIC_DASHBOARD_ORIGIN"] ?? "http://localhost:3030";
}

function fence(text: string): string {
  return "```\n" + text.replace(/```/g, "``​`") + "\n```";
}

function heuristicFamily(heuristicId: string): string {
  const dot = heuristicId.indexOf(".");
  const second = heuristicId.indexOf(".", dot + 1);
  if (dot === -1) return heuristicId;
  return second === -1 ? heuristicId : heuristicId.slice(0, second);
}

const SEVERITY_BADGE: Record<FindingRow["severity"], string> = {
  critical: "CRITICAL",
  major: "MAJOR",
  minor: "MINOR",
  nit: "NIT",
};

async function ensureLabels(
  octokit: ReturnType<typeof getInstallationOctokit>,
  repo: { owner: string; name: string },
  labels: string[],
) {
  await Promise.all(
    labels.map(async (name) => {
      try {
        await octokit.rest.issues.getLabel({ owner: repo.owner, repo: repo.name, name });
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status !== 404) throw e;
        await octokit.rest.issues
          .createLabel({
            owner: repo.owner,
            repo: repo.name,
            name,
            color: LABEL_COLOR[name] ?? "ededed",
          })
          .catch((err) => {
            const s = (err as { status?: number }).status;
            if (s !== 422) throw err;
          });
      }
    }),
  );
}

const LABEL_COLOR: Record<string, string> = {
  rove: "0e8a8c",
  "severity:critical": "b60205",
  "severity:major": "d93f0b",
  "severity:minor": "fbca04",
  "severity:nit": "cccccc",
};
