"use server";

/**
 * Server action: push a single finding to the project's active backlog
 * destination. Dispatches via the BacklogAdapter registry so the same
 * call works for github / linear / future providers.
 *
 * Returns the external item URL (so the UI can offer a "View card →"
 * link) and updates the finding's lifecycle to "filed". Records the
 * link via backlog_items so re-clicking the button reuses the existing
 * item rather than creating a duplicate.
 */

import "server-only";
import { requireTeamMember } from "@/lib/authoring/require-team-member";
import { createServerSupabase, createServiceRoleSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import {
  getActiveConnection,
  recordBacklogItem,
} from "@/lib/backlog/connections";
import { getBacklogAdapter } from "@/lib/backlog/registry";
import type { BacklogFinding } from "@/lib/backlog/types";

export interface SendFindingToBacklogInput {
  findingId: string;
}

export interface SendFindingToBacklogResult {
  externalUrl: string;
  externalKind: "draft_item" | "issue" | "linear_issue";
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
  content_hash: string | null;
}

interface RunRow {
  id: string;
  flow_id: string | null;
  persona_id: string | null;
}

interface ScreenshotRow {
  storage_bucket: string;
  storage_key: string;
  caption: string | null;
}

interface FlowRow {
  owner_handle: string | null;
  team_label: string | null;
}

interface ExistingBacklogItem {
  external_id: string;
  external_url: string;
  external_kind: "draft_item" | "issue" | "linear_issue";
}

export async function sendFindingToBacklog(
  input: SendFindingToBacklogInput,
): Promise<SendFindingToBacklogResult> {
  await requireTeamMember();

  const supabase = await createServerSupabase();
  const { data: finding, error: findingErr } = await supabase
    .from("findings")
    .select(
      "id, run_id, project_id, severity, title, description, heuristic, evidence, step_index, content_hash",
    )
    .eq("id", input.findingId)
    .maybeSingle<FindingRow>();
  if (findingErr) throw new Error(`Finding lookup failed: ${findingErr.message}`);
  if (!finding) throw new Error("Finding not found.");

  const conn = await getActiveConnection(finding.project_id);
  if (!conn || conn.provider === "dashboard-only") {
    throw new Error(
      "No external backlog is connected for this project. Pick one at /projects/" +
        finding.project_id +
        " first.",
    );
  }

  const { data: existingItem } = await supabase
    .from("backlog_items")
    .select("external_id, external_url, external_kind")
    .eq("finding_id", finding.id)
    .eq("connection_id", conn.id)
    .maybeSingle<ExistingBacklogItem>();
  if (existingItem) {
    return {
      externalUrl: existingItem.external_url,
      externalKind: existingItem.external_kind,
    };
  }

  const { data: run } = await supabase
    .from("runs")
    .select("id, flow_id, persona_id")
    .eq("id", finding.run_id)
    .maybeSingle<RunRow>();

  const { data: flow } = run?.flow_id
    ? await supabase
        .from("flows")
        .select("owner_handle, team_label")
        .eq("flow_id", run.flow_id)
        .eq("project_id", finding.project_id)
        .maybeSingle<FlowRow>()
    : { data: null };

  const screenshotUrls = await resolveScreenshotUrls(finding.id);

  const payload: BacklogFinding = {
    id: finding.id,
    projectId: finding.project_id,
    flowId: run?.flow_id ?? "(unknown)",
    personaId: run?.persona_id ?? "(unknown)",
    runId: finding.run_id,
    severity: finding.severity,
    heuristic: finding.heuristic,
    title: finding.title,
    description: finding.description,
    evidence: finding.evidence,
    contentHash: finding.content_hash ?? finding.id,
    stepIndex: finding.step_index,
    screenshotUrls,
    ownerHandle: flow?.owner_handle ?? null,
    teamLabel: flow?.team_label ?? null,
    dashboardRunUrl: dashboardFindingUrl(finding),
  };

  const adapter = await getBacklogAdapter(conn.provider);
  const pushResult = await adapter.pushFinding(conn, payload);

  await recordBacklogItem({
    findingId: finding.id,
    connectionId: conn.id,
    projectId: finding.project_id,
    externalId: pushResult.externalId,
    externalUrl: pushResult.externalUrl,
    externalKind: pushResult.externalKind,
    markerValue: pushResult.markerValue,
  });

  const writer = createServiceRoleSupabase();
  await writer
    .from("findings")
    .update({
      status: "filed",
      // Keep the legacy column populated for back-compat with the
      // existing run-detail UI until alpha.39 consolidates lookups.
      github_issue_url: conn.provider === "github" ? pushResult.externalUrl : null,
    })
    .eq("id", finding.id);

  return {
    externalUrl: pushResult.externalUrl,
    externalKind: pushResult.externalKind,
  };
}

async function resolveScreenshotUrls(
  findingId: string,
): Promise<{ url: string; caption?: string }[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("finding_screenshots")
    .select("storage_bucket, storage_key, caption")
    .eq("finding_id", findingId)
    .order("ordinal", { ascending: true });
  if (error || !data || data.length === 0) return [];

  const writer = createServiceRoleSupabase();
  const resolved: { url: string; caption?: string }[] = [];
  for (const row of data as ScreenshotRow[]) {
    const { data: signed } = await writer.storage
      .from(row.storage_bucket)
      .createSignedUrl(row.storage_key, 60 * 60 * 24 * 30);
    if (signed?.signedUrl) {
      resolved.push({
        url: signed.signedUrl,
        ...(row.caption ? { caption: row.caption } : {}),
      });
    }
  }
  return resolved;
}

/**
 * Returns the deep-link the GitHub card body points back at — the
 * dashboard's findings drawer for this specific finding. The /findings
 * page reads `?open=<finding_id>` and renders the drawer overlay; far
 * more useful than landing on the run's step filmstrip (which doesn't
 * auto-open anything from a #step-N fragment alone).
 */
function dashboardFindingUrl(finding: FindingRow): string {
  const origin = env.isProduction()
    ? "https://rove-agiterra.vercel.app"
    : process.env["NEXT_PUBLIC_DASHBOARD_ORIGIN"] ?? "http://localhost:3030";
  const params = new URLSearchParams({
    p: finding.project_id,
    open: finding.id,
  });
  return `${origin}/findings?${params.toString()}`;
}
