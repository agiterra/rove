"use client";

/**
 * Client-side helper that waits for a queued agent_jobs row to finish.
 *
 * Two channels of detection run in parallel:
 *   1. Supabase Realtime UPDATEs on the row's id — sub-second latency
 *      when the user has a real session (Realtime is RLS-gated).
 *   2. A periodic SELECT poll every 2.5s as the safety net — covers the
 *      DEV_BYPASS_AUTH case (no session → RLS filters the Realtime
 *      events) and any future ops where the WS drops.
 *
 * Whichever surfaces a terminal state first wins.
 *
 * Resolves with the result on `completed`, rejects with the daemon's
 * error message on `failed`, and times out after `timeoutMs` (default
 * 90s — long enough for Claude Haiku, short enough to surface "no
 * daemon online" within a minute).
 */
import { createBrowserSupabase } from "../supabase/client";
import { fetchAgentJobAction } from "../../app/flows/new/actions";

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
      clearInterval(pollTimer);
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

    // Read via a server action — the cookie-bound supabase client falls
    // back to service-role when DEV_BYPASS_AUTH leaves the browser
    // without a session, so the read works in every auth mode. The
    // browser-side Realtime sub still fires when the user is signed in.
    const fetchSnapshot = async () => {
      try {
        const res = await fetchAgentJobAction(jobId);
        if (!res) return;
        handleSnapshot({
          id: jobId,
          status: res.status,
          result: res.result,
          error: res.error,
          claimed_by: res.claimedBy,
        });
      } catch {
        // Tolerated — next tick will retry.
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
        await fetchSnapshot();
      });

    // Safety-net poll. Realtime is RLS-gated and silently filters events
    // when there's no user session (dev-bypass). Polling every 2.5s
    // guarantees we surface terminal states regardless of auth path. The
    // poll naturally stops once `settle()` runs.
    const pollTimer = setInterval(() => {
      if (settled) return;
      void fetchSnapshot();
    }, 2500);

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
