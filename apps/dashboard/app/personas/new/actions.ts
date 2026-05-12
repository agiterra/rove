"use server";

import { z } from "zod";
import {
  createSingleFilePr,
  randomBranchSuffix,
  type OpenPrResult,
} from "../../../lib/authoring/github-app";
import { queueGenerationJob, type QueuedJob } from "../../../lib/authoring/queue-job";
import { requireTeamMember } from "../../../lib/authoring/require-team-member";
import { personaDraftSchema, type PersonaDraft } from "../../../lib/authoring/schemas";
import { personaYamlPath, renderPersonaYaml } from "../../../lib/authoring/yaml";

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

export async function queuePersonaGenerationAction(
  description: string,
): Promise<ActionOutcome<QueuedJob>> {
  try {
    await requireTeamMember();
  } catch (e) {
    return asError((e as Error).message);
  }
  if (!description.trim()) {
    return asError("Describe the persona first.");
  }
  try {
    const job = await queueGenerationJob("generate_persona", description);
    return { ok: true, data: job };
  } catch (e) {
    return asError((e as Error).message);
  }
}

export async function submitPersonaDraftAction(raw: unknown): Promise<ActionOutcome<OpenPrResult>> {
  let me;
  try {
    me = await requireTeamMember();
  } catch (e) {
    return asError((e as Error).message);
  }

  const parsed = personaDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const draft = parsed.data;

  const yaml = renderPersonaYaml(draft);
  const filePath = personaYamlPath(draft.persona_id);
  const branch = `eval/persona/${draft.persona_id}-${randomBranchSuffix()}`;
  const author = me.displayName ?? me.githubHandle ?? "tankloop-eval-dashboard";

  try {
    const pr = await createSingleFilePr({
      branch,
      filePath,
      fileContent: yaml,
      commitMessage: `feat(eval): add persona ${draft.persona_id}\n\nAuthored via tankloop-eval dashboard by ${author}.`,
      prTitle: `feat(eval): add persona ${draft.persona_id}`,
      prBody: prBodyFor(draft, author),
    });
    return { ok: true, data: pr };
  } catch (e) {
    return asError((e as Error).message);
  }
}

function prBodyFor(draft: PersonaDraft, author: string): string {
  return [
    `Adds a new agentic walk persona.`,
    ``,
    `**persona_id**: \`${draft.persona_id}\``,
    `**expertise**: ${draft.expertise}`,
    `**shortcuts_allowed**: ${draft.shortcuts_allowed}`,
    `**hovers_allowed**: ${draft.hovers_allowed}`,
    `**retries_per_step**: ${draft.retries_per_step}`,
    ``,
    `### Prompt addendum`,
    `> ${draft.prompt_addendum}`,
    ``,
    `### Reviewer checklist`,
    `- [ ] \`persona_id\` is descriptive and matches the snake_case convention`,
    `- [ ] Expertise + shortcuts + retries are coherent with the prompt addendum`,
    `- [ ] Persona is meaningfully different from existing personas`,
    ``,
    `> Authored via the [tankloop-eval dashboard](https://eval-dashboard-sigma.vercel.app/personas/new) by ${author}.`,
  ].join("\n");
}
