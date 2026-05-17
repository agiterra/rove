/**
 * Server-side DB access for backlog_connections + backlog_items +
 * finding_occurrences. Callers (server actions, sink runtime, webhook
 * receivers) use these to read/write the persistence layer without
 * knowing the table schema.
 */

import { createServiceRoleSupabase } from "../supabase/server";
import type {
  BacklogConnection,
  BacklogInstallVia,
  BacklogProvider,
  RoveLifecycle,
  SyncPolicy,
} from "./types";

interface RawConnectionRow {
  id: string;
  project_id: string;
  provider: BacklogProvider;
  destination: Record<string, unknown>;
  sync_policy: SyncPolicy;
  status_map: Record<string, RoveLifecycle>;
  secret_ref: string | null;
  installed_via: BacklogInstallVia;
  installed_at: string | null;
  disabled_at: string | null;
}

function rowToConnection(r: RawConnectionRow): BacklogConnection {
  return {
    id: r.id,
    projectId: r.project_id,
    provider: r.provider,
    destination: r.destination,
    syncPolicy: r.sync_policy,
    statusMap: r.status_map,
    secretRef: r.secret_ref,
    installedVia: r.installed_via,
    installedAt: r.installed_at,
    disabledAt: r.disabled_at,
  };
}

/**
 * Returns the active connection for a Rove project (the row where
 * disabled_at is null). Null when the project hasn't installed a
 * backlog yet — caller treats this as "dashboard-only."
 */
export async function getActiveConnection(projectId: string): Promise<BacklogConnection | null> {
  const supabase = createServiceRoleSupabase();
  const { data, error } = await supabase
    .from("backlog_connections")
    .select(
      "id, project_id, provider, destination, sync_policy, status_map, secret_ref, installed_via, installed_at, disabled_at",
    )
    .eq("project_id", projectId)
    .is("disabled_at", null)
    .maybeSingle();
  if (error) throw new Error(`getActiveConnection(${projectId}): ${error.message}`);
  if (!data) return null;
  return rowToConnection(data as RawConnectionRow);
}

export interface CreateConnectionInput {
  projectId: string;
  provider: BacklogProvider;
  destination: Record<string, unknown>;
  installedVia: BacklogInstallVia;
  syncPolicy?: SyncPolicy;
  statusMap?: Record<string, RoveLifecycle>;
  secretRef?: string;
}

/**
 * Inserts a new active connection. Disables any prior active row for
 * the same (project_id, provider) pair first so the unique constraint
 * holds — rotation, not duplication.
 */
export async function createConnection(input: CreateConnectionInput): Promise<BacklogConnection> {
  const supabase = createServiceRoleSupabase();
  // Disable any existing active row for this (project, provider).
  const { error: disableErr } = await supabase
    .from("backlog_connections")
    .update({ disabled_at: new Date().toISOString() })
    .eq("project_id", input.projectId)
    .eq("provider", input.provider)
    .is("disabled_at", null);
  if (disableErr) throw new Error(`createConnection: rotate prior: ${disableErr.message}`);

  const insertPayload: Record<string, unknown> = {
    project_id: input.projectId,
    provider: input.provider,
    destination: input.destination,
    installed_via: input.installedVia,
    installed_at: new Date().toISOString(),
  };
  if (input.syncPolicy) insertPayload.sync_policy = input.syncPolicy;
  if (input.statusMap) insertPayload.status_map = input.statusMap;
  if (input.secretRef) insertPayload.secret_ref = input.secretRef;

  const { data, error } = await supabase
    .from("backlog_connections")
    .insert(insertPayload)
    .select(
      "id, project_id, provider, destination, sync_policy, status_map, secret_ref, installed_via, installed_at, disabled_at",
    )
    .single();
  if (error) throw new Error(`createConnection: insert: ${error.message}`);
  return rowToConnection(data as RawConnectionRow);
}

/**
 * Marks a connection disabled. Used by the settings UI's "disconnect"
 * action. Keeps the row for audit; future installs create a new row.
 */
export async function disableConnection(connectionId: string): Promise<void> {
  const supabase = createServiceRoleSupabase();
  const { error } = await supabase
    .from("backlog_connections")
    .update({ disabled_at: new Date().toISOString() })
    .eq("id", connectionId)
    .is("disabled_at", null);
  if (error) throw new Error(`disableConnection(${connectionId}): ${error.message}`);
}

export interface RecordItemInput {
  findingId: string;
  connectionId: string;
  projectId: string;
  externalId: string;
  externalUrl: string;
  externalKind: "draft_item" | "issue" | "linear_issue";
  markerValue: string;
}

/**
 * Records a successful pushFinding outcome — the link between a Rove
 * finding and the external item the adapter created.
 */
export async function recordBacklogItem(input: RecordItemInput): Promise<void> {
  const supabase = createServiceRoleSupabase();
  const { error } = await supabase.from("backlog_items").upsert(
    {
      finding_id: input.findingId,
      connection_id: input.connectionId,
      project_id: input.projectId,
      external_id: input.externalId,
      external_url: input.externalUrl,
      external_kind: input.externalKind,
      marker_value: input.markerValue,
      // Issues are body-locked from the moment they're created; draft
      // items are mutable until promoted to issues, after which the
      // webhook receiver flips body_locked to true.
      body_locked: input.externalKind !== "draft_item",
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "finding_id,connection_id" },
  );
  if (error) throw new Error(`recordBacklogItem: ${error.message}`);
}

export interface RecordOccurrenceInput {
  findingId: string;
  runId: string;
  projectId: string;
  consensusGroupId?: string;
}

/**
 * Audit-trail an instance of a finding's content_hash being re-filed
 * on a later walk. The adapter reads this when it wants to annotate
 * the external item ("seen N times") without rewriting the body.
 */
export async function recordOccurrence(input: RecordOccurrenceInput): Promise<void> {
  const supabase = createServiceRoleSupabase();
  const { error } = await supabase.from("finding_occurrences").insert({
    finding_id: input.findingId,
    run_id: input.runId,
    project_id: input.projectId,
    consensus_group_id: input.consensusGroupId ?? null,
  });
  if (error) throw new Error(`recordOccurrence: ${error.message}`);
}
