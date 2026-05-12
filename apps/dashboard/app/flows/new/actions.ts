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
