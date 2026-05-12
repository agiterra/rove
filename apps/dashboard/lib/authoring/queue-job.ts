/**
 * Server-side helper to insert an agent_jobs row. The wizard then
 * subscribes to that row via Realtime and waits for the daemon to
 * complete it.
 *
 * Service-role write — full per-user JWTs come with proper multi-tenant
 * tenancy (Phase D).
 */
import "server-only";
import { resolveProjectId } from "../project-context";
import { createServiceRoleSupabase } from "../supabase/server";
import { requireTeamMember } from "./require-team-member";

export type AgentJobKind = "generate_flow" | "generate_persona" | "walk";

export interface QueuedJob {
  id: string;
}

export async function queueGenerationJob(
  kind: "generate_flow" | "generate_persona",
  description: string,
): Promise<QueuedJob> {
  const me = await requireTeamMember();
  const projectId = await resolveProjectId();
  const supabase = createServiceRoleSupabase();
  const { data, error } = await supabase
    .from("agent_jobs")
    .insert({
      kind,
      project_id: projectId,
      input: { description },
      requested_by: me.userId === "dev-bypass" ? null : me.userId,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) throw new Error(`queue ${kind}: ${error.message}`);
  return { id: data.id as string };
}

export interface WalkInput {
  flow_id: string;
  persona_id: string;
  target_url?: string;
  notes?: string;
  max_budget_usd?: number;
  timeout_seconds?: number;
}

export async function queueWalkJob(input: WalkInput): Promise<QueuedJob> {
  const me = await requireTeamMember();
  const projectId = await resolveProjectId();
  const supabase = createServiceRoleSupabase();
  const { data, error } = await supabase
    .from("agent_jobs")
    .insert({
      kind: "walk",
      project_id: projectId,
      input,
      requested_by: me.userId === "dev-bypass" ? null : me.userId,
      status: "pending",
      // Walks pin priority above generation so a queued walk beats a queued
      // wizard refresh when daemon capacity is contested.
      priority: 70,
    })
    .select("id")
    .single();
  if (error) throw new Error(`queue walk: ${error.message}`);
  return { id: data.id as string };
}
