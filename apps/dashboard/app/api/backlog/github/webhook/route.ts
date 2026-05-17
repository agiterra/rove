/**
 * GitHub Project v2 webhook receiver — alpha.39a.
 *
 * Receives `projects_v2_item` events from the Rove GitHub App. Two paths:
 *
 *  1. action === "edited" + Status field change → adapter parses, route
 *     updates `findings.status` + `backlog_items.{rove_state, external_state}`.
 *  2. action === "converted" (draft promoted to a real Issue) → route
 *     flips `backlog_items.body_locked = true` so the outbound sync
 *     stops rewriting the body, per the substrate's content/state split.
 *
 * Everything else returns 200 with a short marker — GitHub retries on
 * non-2xx, so noisy events stay quiet.
 *
 * The route is multi-tenant: it locates the Rove project via the
 * `backlog_items` row matched by the item node id, then resolves the
 * connection from that. No project context needed in the URL.
 */
import "server-only";
import { type NextRequest } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/server";
import { getConnectionById } from "@/lib/backlog/connections";
import { getBacklogAdapter } from "@/lib/backlog/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface BacklogItemRow {
  id: string;
  finding_id: string;
  connection_id: string;
  project_id: string;
  external_kind: "draft_item" | "issue" | "linear_issue";
  body_locked: boolean;
}

interface WebhookPayloadShape {
  action?: string;
  projects_v2_item?: {
    node_id?: string;
    project_node_id?: string;
    content_type?: string;
  };
  changes?: {
    field_value?: {
      to?: { name?: string };
    };
  };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const eventType = request.headers.get("x-github-event");

  if (eventType !== "projects_v2_item") {
    return new Response(`ignored event: ${eventType ?? "(none)"}`, { status: 200 });
  }

  let payload: WebhookPayloadShape;
  try {
    payload = JSON.parse(rawBody) as WebhookPayloadShape;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const itemNodeId = payload.projects_v2_item?.node_id;
  if (!itemNodeId) {
    return new Response("missing item node_id", { status: 200 });
  }

  const supabase = createServiceRoleSupabase();
  const { data: item, error: itemErr } = await supabase
    .from("backlog_items")
    .select("id, finding_id, connection_id, project_id, external_kind, body_locked")
    .eq("external_id", itemNodeId)
    .maybeSingle<BacklogItemRow>();
  if (itemErr) return new Response(`item lookup failed: ${itemErr.message}`, { status: 500 });
  if (!item) {
    // Webhook arrived for a card Rove didn't create. Expected — the App
    // subscription fires for every item in every project it can see.
    return new Response("not a Rove-tracked item", { status: 200 });
  }

  const conn = await getConnectionById(item.connection_id);
  if (!conn) return new Response("connection missing", { status: 200 });

  // Draft → Issue promotion: lock the body so outbound sync stops
  // rewriting it. Engineer's edits in GitHub become source of truth.
  if (payload.action === "converted") {
    await supabase
      .from("backlog_items")
      .update({ body_locked: true, external_kind: "issue" })
      .eq("id", item.id);
    return new Response("body locked on draft->issue promotion", { status: 200 });
  }

  if (payload.action !== "edited") {
    return new Response(`ignored action: ${payload.action ?? "(none)"}`, { status: 200 });
  }

  const adapter = await getBacklogAdapter(conn.provider);
  if (!adapter.parseStatusWebhook) {
    return new Response(`provider ${conn.provider} has no webhook parser`, { status: 200 });
  }

  let parsed: { externalId: string; rove: "new" | "triaged" | "filed" | "fixed" | "dismissed" } | null;
  try {
    parsed = await adapter.parseStatusWebhook(payload, rawBody, signature, conn);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("signature mismatch")) {
      return new Response("signature mismatch", { status: 401 });
    }
    if (msg.includes("not configured")) {
      return new Response("webhook secret not configured", { status: 503 });
    }
    return new Response(`parse failed: ${msg}`, { status: 500 });
  }

  if (!parsed) {
    return new Response("no status change to sync", { status: 200 });
  }

  const externalName = payload.changes?.field_value?.to?.name ?? null;
  const now = new Date().toISOString();

  const { error: findingErr } = await supabase
    .from("findings")
    .update({ status: parsed.rove })
    .eq("id", item.finding_id);
  if (findingErr) {
    return new Response(`finding update failed: ${findingErr.message}`, { status: 500 });
  }

  await supabase
    .from("backlog_items")
    .update({
      rove_state: parsed.rove,
      external_state: externalName,
      last_synced_at: now,
    })
    .eq("id", item.id);

  return new Response(`synced: finding ${item.finding_id} → ${parsed.rove}`, { status: 200 });
}
