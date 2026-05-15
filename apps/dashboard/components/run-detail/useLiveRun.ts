"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { buildRunDetailView } from "./adapters";
import type { RunDetailView } from "./types";

interface UseLiveRunOptions {
  runId: string;
  projectId: string;
  initialView: RunDetailView;
  /**
   * Server-minted signed URLs for `run_steps.screenshot_key`. Re-passed
   * to `buildRunDetailView` on every Realtime refresh so completed runs
   * don't show "capturing screenshot…" the moment the catch-up read
   * fires. New keys arriving mid-walk still need a signing roundtrip —
   * that's Track B2's `/api/runs/:id/sign-shot` route (not in this fix).
   */
  initialSignedScreenshotUrls?: Record<string, string>;
  initialSignedFindingScreenshotUrls?: Record<string, string>;
}

/**
 * Subscribes to Realtime updates for one run and re-derives the
 * RunDetailView when rows on `runs`, `run_steps`, or `findings` change
 * for this run_id. Patterned after wait-for-job.ts:
 *   - setAuth before subscribing (Realtime is RLS-gated)
 *   - catch-up read on SUBSCRIBED in case events fired pre-subscription
 *   - safety-net poll every 5s to cover dev-bypass / WS drops
 *
 * Returns the latest view (or `null` until the first replacement, in
 * which case callers fall back to the server-rendered initialView).
 *
 * Signed screenshot URLs:
 *   The initial server render mints signed URLs for whatever
 *   run_steps.screenshot_key values exist at fetch time. When a new
 *   step arrives via Realtime with a screenshot_key, the hook needs a
 *   fresh signed URL — but minting requires service-role on the server.
 *   To keep this hook server-free, we surface unsigned step rows with
 *   the placeholder thumb and rely on a soft refresh / page reload for
 *   the signed-URL version. (Track B2 ships a /api/runs/:id/sign-shot
 *   server route that this hook can call as new keys land.)
 */
export function useLiveRun({
  runId,
  projectId,
  initialView,
  initialSignedScreenshotUrls,
  initialSignedFindingScreenshotUrls,
}: UseLiveRunOptions): RunDetailView | null {
  const [view, setView] = useState<RunDetailView | null>(null);
  const seenRows = useRef<{
    run: Record<string, unknown> | null;
    steps: Map<number, Record<string, unknown>>;
    findings: Map<string, Record<string, unknown>>;
  }>({
    run: null,
    steps: new Map(),
    findings: new Map(),
  });

  useEffect(() => {
    const supabase = createBrowserSupabase();
    let cancelled = false;

    async function refreshFromDb() {
      const [runRes, stepsRes, findingsRes] = await Promise.all([
        supabase.from("runs").select("*").eq("id", runId).eq("project_id", projectId).maybeSingle(),
        supabase
          .from("run_steps")
          .select("*")
          .eq("run_id", runId)
          .eq("project_id", projectId)
          .order("step_index", { ascending: true }),
        supabase
          .from("findings")
          .select("*")
          .eq("run_id", runId)
          .eq("project_id", projectId)
          .order("severity", { ascending: true }),
      ]);
      if (cancelled) return;
      if (runRes.error || !runRes.data) return;
      const fresh = buildRunDetailView({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        run: runRes.data as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        steps: (stepsRes.data ?? []) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findings: (findingsRes.data ?? []) as any,
        signedScreenshotUrls: initialSignedScreenshotUrls,
        signedFindingScreenshotUrls: initialSignedFindingScreenshotUrls,
        currentUserLabel: initialView.topBar.userLabel,
        workerStatus: initialView.topBar.workerStatus,
      });
      seenRows.current.run = runRes.data as unknown as Record<string, unknown>;
      seenRows.current.steps = new Map(
        (stepsRes.data ?? []).map((s: Record<string, unknown>) => [s.step_index as number, s]),
      );
      seenRows.current.findings = new Map(
        (findingsRes.data ?? []).map((f: Record<string, unknown>) => [f.id as string, f]),
      );
      setView(fresh);
    }

    // Set auth on Realtime so RLS doesn't drop our events.
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
      }
    });

    const channel = supabase
      .channel(`run_detail_${runId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "runs", filter: `id=eq.${runId}` },
        () => void refreshFromDb(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "run_steps", filter: `run_id=eq.${runId}` },
        () => void refreshFromDb(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "findings", filter: `run_id=eq.${runId}` },
        () => void refreshFromDb(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Catch-up read in case events fired before subscription.
          void refreshFromDb();
        }
      });

    // Safety-net poll for runs in "running" state. Stops once the run
    // settles (no need to keep polling after completion).
    const poll = setInterval(() => {
      const status = (seenRows.current.run as { status?: string } | null)?.status;
      if (status && status !== "running") return;
      void refreshFromDb();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      void channel.unsubscribe();
    };
  }, [
    runId,
    projectId,
    initialView.topBar.userLabel,
    initialView.topBar.workerStatus,
    initialSignedScreenshotUrls,
    initialSignedFindingScreenshotUrls,
  ]);

  return view;
}
