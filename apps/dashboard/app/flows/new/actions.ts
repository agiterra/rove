"use server";

import { z } from "zod";
import {
  createSingleFilePr,
  randomBranchSuffix,
  type OpenPrResult,
} from "../../../lib/authoring/github-app";
import { queueGenerationJob, type QueuedJob } from "../../../lib/authoring/queue-job";
import { requireTeamMember } from "../../../lib/authoring/require-team-member";
import { flowDraftSchema, type FlowDraft } from "../../../lib/authoring/schemas";
import { flowYamlPath, renderFlowYaml } from "../../../lib/authoring/yaml";
import { createReadClient } from "../../../lib/supabase/server";

const DAEMON_STALE_AFTER_MS = 2 * 60_000;
const PROJECT_SLUG_RE = /^[a-z][a-z0-9-]*$/;

export interface ActionResult<T> {
  ok: true;
  data: T;
}
export interface ActionError {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string[] | undefined>;
}
export type ActionOutcome<T> = ActionResult<T> | ActionError;

function asError(message: string): ActionError {
  return { ok: false, error: message };
}

/**
 * Server-side poll of a single agent_jobs row. The wizard calls this
 * every ~2.5s as the safety net beside its Realtime subscription, since
 * Realtime + RLS silently drop events when DEV_BYPASS_AUTH=1 leaves the
 * browser without a session. createReadClient() honors dev-bypass and
 * returns a service-role-backed client when there's no signed-in user,
 * so this read works in every auth mode.
 */
export async function fetchAgentJobAction(jobId: string): Promise<{
  status: "pending" | "claimed" | "running" | "completed" | "failed" | "cancelled";
  result: Record<string, unknown> | null;
  error: string | null;
  claimedBy: string | null;
} | null> {
  if (typeof jobId !== "string" || jobId.length === 0) return null;
  const supabase = await createReadClient();
  const { data } = await supabase
    .from("agent_jobs")
    .select("status, result, error, claimed_by")
    .eq("id", jobId)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    status: string;
    result: Record<string, unknown> | null;
    error: string | null;
    claimed_by: string | null;
  };
  return {
    status: row.status as
      | "pending"
      | "claimed"
      | "running"
      | "completed"
      | "failed"
      | "cancelled",
    result: row.result,
    error: row.error,
    claimedBy: row.claimed_by,
  };
}

/**
 * Cheap polling endpoint for the DaemonLauncher — returns whether any
 * daemon for `projectId` has heartbeated within the last 2 minutes plus
 * a small summary the UI can render ("daemon abc12345 on host X"). Used
 * to flip the launcher to "online" the moment the user runs `pnpm daemon`.
 */
export async function checkDaemonOnlineAction(projectId: string): Promise<{
  online: boolean;
  daemonName: string | null;
  hostname: string | null;
  daemonId: string | null;
}> {
  if (!PROJECT_SLUG_RE.test(projectId)) {
    return { online: false, daemonName: null, hostname: null, daemonId: null };
  }
  const supabase = await createReadClient();
  const { data } = await supabase
    .from("daemon_heartbeats")
    .select("user_id, daemon_name, hostname, last_seen_at")
    .eq("project_id", projectId);
  if (!data) return { online: false, daemonName: null, hostname: null, daemonId: null };
  const cutoff = Date.now() - DAEMON_STALE_AFTER_MS;
  const fresh = data.find(
    (h: { last_seen_at: string }) => new Date(h.last_seen_at).getTime() > cutoff,
  ) as
    | { user_id: string; daemon_name: string; hostname: string | null; last_seen_at: string }
    | undefined;
  if (!fresh) return { online: false, daemonName: null, hostname: null, daemonId: null };
  return {
    online: true,
    daemonName: fresh.daemon_name,
    hostname: fresh.hostname,
    daemonId: fresh.user_id,
  };
}

/**
 * Queue an AI generation job for a flow. The wizard then subscribes to
 * the returned job_id via Realtime and waits for the daemon to fill in
 * the result. (Phase 11a — generation runs on a teammate's local Claude
 * session, not the Vercel AI Gateway.)
 */
export async function queueFlowGenerationAction(
  description: string,
): Promise<ActionOutcome<QueuedJob>> {
  try {
    await requireTeamMember();
  } catch (e) {
    return asError((e as Error).message);
  }
  if (!description.trim()) {
    return asError("Describe the flow first.");
  }
  try {
    const job = await queueGenerationJob("generate_flow", description);
    return { ok: true, data: job };
  } catch (e) {
    return asError((e as Error).message);
  }
}

/**
 * Validate the form payload, render YAML, open a draft PR.
 */
export async function submitFlowDraftAction(raw: unknown): Promise<ActionOutcome<OpenPrResult>> {
  let me;
  try {
    me = await requireTeamMember();
  } catch (e) {
    return asError((e as Error).message);
  }

  const parsed = flowDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const draft = parsed.data;

  const yaml = renderFlowYaml(draft);
  const filePath = flowYamlPath(draft.flow_id);
  const branch = `eval/flow/${draft.flow_id.replace(/\./g, "-")}-${randomBranchSuffix()}`;
  const author = me.displayName ?? me.githubHandle ?? "rove-dashboard";
  const templateNote = draft.template_id ? ` (template: ${draft.template_id})` : "";

  try {
    const pr = await createSingleFilePr({
      branch,
      filePath,
      fileContent: yaml,
      commitMessage: `feat(eval): add flow ${draft.flow_id}${templateNote}\n\nAuthored via rove dashboard by ${author}.`,
      prTitle: `feat(eval): add flow ${draft.flow_id}`,
      prBody: prBodyFor(draft, author),
    });
    return { ok: true, data: pr };
  } catch (e) {
    return asError((e as Error).message);
  }
}

function prBodyFor(draft: FlowDraft, author: string): string {
  return [
    `Adds a new agentic UX walk flow.`,
    ``,
    `**flow_id**: \`${draft.flow_id}\``,
    `**entry_route**: \`${draft.entry_route}\``,
    `**goal**: ${draft.goal}`,
    ``,
    `### Success criteria`,
    ...draft.success_criteria.map((c) => `- ${c}`),
    ``,
    `### Reviewer checklist`,
    `- [ ] \`flow_id\` is descriptive and matches the existing dotted-namespace convention`,
    `- [ ] \`entry_route\` resolves on the staging deploy`,
    `- [ ] Success criteria are observable, not internal state`,
    `- [ ] Add \`steps:\` and \`scenarios:\` if this flow needs more than agent free-roam`,
    ``,
    `> Authored via the [rove dashboard](https://eval-dashboard-sigma.vercel.app/flows/new) by ${author}.`,
  ].join("\n");
}
