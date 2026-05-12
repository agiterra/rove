"use server";

import { queueWalkJob, type QueuedJob, type WalkInput } from "../../../lib/authoring/queue-job";
import { requireTeamMember } from "../../../lib/authoring/require-team-member";

export interface ActionResult<T> {
  ok: true;
  data: T;
}
export interface ActionError {
  ok: false;
  error: string;
}
export type ActionOutcome<T> = ActionResult<T> | ActionError;

function asError(message: string): ActionError {
  return { ok: false, error: message };
}

export async function queueWalkAction(input: WalkInput): Promise<ActionOutcome<QueuedJob>> {
  try {
    await requireTeamMember();
  } catch (e) {
    return asError((e as Error).message);
  }
  if (!input.flow_id?.trim() || !input.persona_id?.trim()) {
    return asError("flow_id and persona_id are required");
  }
  try {
    const job = await queueWalkJob(input);
    return { ok: true, data: job };
  } catch (e) {
    return asError((e as Error).message);
  }
}
