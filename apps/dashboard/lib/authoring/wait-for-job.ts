"use client";

/**
 * Client-side helper that waits for a queued agent_jobs row to finish by
 * subscribing to Realtime UPDATEs on its id. Resolves with the result on
 * `completed`, rejects with the daemon's error message on `failed`, and
 * times out after `timeoutMs` (default 90s — long enough for Claude
 * Haiku, short enough to surface "no daemon online" within a minute).
 *
 * Falls back to a single fetch on subscription start so we don't miss a
 * row that completed before the channel attached.
 */
import { createBrowserSupabase } from "../supabase/client";

export interface AgentJobSnapshot {
  id: string;
  status: "pending" | "claimed" | "running" | "completed" | "failed" | "cancelled";
  result: Record<string, unknown> | null;
  error: string | null;
  claimed_by: string | null;
}

export interface WaitForJobOptions {
  timeoutMs?: number;
  onStatus?: (s: AgentJobSnapshot["status"], claimedBy: string | null) => void;
}

export async function waitForJobResult(
  jobId: string,
  opts: WaitForJobOptions = {},
): Promise<Record<string, unknown>> {
  const supabase = createBrowserSupabase();
  const timeoutMs = opts.timeoutMs ?? 90_000;

  // Realtime broadcasts respect RLS, so the WebSocket needs the user's JWT.
  // @supabase/ssr's createBrowserClient sets it on the rest client but not
  // automatically on Realtime — set it explicitly before subscribing.
  const session = (await supabase.auth.getSession()).data.session;
  if (session?.access_token) {
    supabase.realtime.setAuth(session.access_token);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      void channel.unsubscribe();
      clearTimeout(timer);
    };

    const handleSnapshot = (snap: AgentJobSnapshot | null) => {
      if (!snap) return;
      opts.onStatus?.(snap.status, snap.claimed_by);
      if (snap.status === "completed" && snap.result) {
        settle(() => resolve(snap.result as Record<string, unknown>));
      } else if (snap.status === "failed") {
        settle(() => reject(new Error(snap.error ?? "daemon failed without a message")));
      } else if (snap.status === "cancelled") {
        settle(() => reject(new Error("job was cancelled")));
      }
    };

    const channel = supabase
      .channel(`agent_job_${jobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agent_jobs", filter: `id=eq.${jobId}` },
        (payload) => handleSnapshot(payload.new as AgentJobSnapshot),
      )
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        // Catch-up read in case the daemon completed before we subscribed.
        const { data } = await supabase
          .from("agent_jobs")
          .select("id, status, result, error, claimed_by")
          .eq("id", jobId)
          .maybeSingle();
        handleSnapshot(data as AgentJobSnapshot | null);
      });

    const timer = setTimeout(() => {
      settle(() =>
        reject(
          new Error(
            "No daemon claimed the job within 90s. Is `rove daemon` running on your Mac?",
          ),
        ),
      );
    }, timeoutMs);
  });
}
