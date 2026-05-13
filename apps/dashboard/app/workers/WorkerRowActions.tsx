"use client";

/**
 * WorkerRowActions — per-row action buttons for the /workers table.
 *
 * Actions are wired to rove:// URLs. window.location.href is used (not
 * <a href>) for reliable cross-browser handling of custom protocol URLs.
 *
 * After clicking Resume or Restart, subscribes to the workers table via
 * Realtime to detect when the daemon comes back online — same catch-up +
 * setAuth pattern used in SetupForm.tsx.
 *
 * State → buttons:
 *   online   → Pause, Reveal logs
 *   stopped  → Resume
 *   stale    → Resume, Restart, Reveal logs
 *   disabled → (no URL-handler buttons — admin disable is a separate path)
 */

import { useState, useEffect, useRef } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";

type WorkerStatus = "online" | "stale" | "stopped" | "disabled";

interface Props {
  workerName: string;
  projectId: string;
  status: WorkerStatus;
}

export function WorkerRowActions({ workerName, projectId, status }: Props) {
  const [waiting, setWaiting] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const channelRef = useRef<ReturnType<ReturnType<typeof createBrowserSupabase>["channel"]> | null>(null);

  // Clean up subscription on unmount.
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        void channelRef.current.unsubscribe();
      }
    };
  }, []);

  function startWaitingForOnline() {
    setWaiting(true);
    setIsOnline(false);

    const supabase = createBrowserSupabase();

    async function subscribe() {
      const session = (await supabase.auth.getSession()).data.session;
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }

      function handleRow(row: Record<string, unknown>) {
        const hbRaw = row["last_heartbeat_at"];
        const stoppedAt = row["stopped_at"];
        if (!hbRaw || stoppedAt) return;
        const age = Date.now() - new Date(hbRaw as string).getTime();
        if (age < 30_000) {
          setIsOnline(true);
          setWaiting(false);
        }
      }

      const channel = supabase
        .channel(`workers_actions_${projectId}_${workerName}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "workers",
            filter: `project_id=eq.${projectId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            if ((row["name"] as string) === workerName) handleRow(row);
          },
        )
        .subscribe(async (subStatus) => {
          if (subStatus !== "SUBSCRIBED") return;
          // Catch-up read: handles the race where the daemon comes back before
          // our subscription attaches.
          const { data } = await supabase
            .from("workers")
            .select("last_heartbeat_at, stopped_at")
            .eq("project_id", projectId)
            .eq("name", workerName)
            .maybeSingle();
          if (data) handleRow(data as Record<string, unknown>);
        });

      channelRef.current = channel;
    }

    void subscribe();
  }

  function handleAction(scheme: string) {
    if (scheme === "rove://start" || scheme === "rove://restart") {
      startWaitingForOnline();
    }
    window.location.href = scheme;
  }

  if (status === "disabled") {
    return (
      <span className="text-[11px] text-[var(--color-text-faint)] italic">
        Disabled by admin
      </span>
    );
  }

  if (isOnline) {
    return (
      <span className="text-[11px] text-[var(--color-accent)]">
        Back online
      </span>
    );
  }

  if (waiting) {
    return (
      <span className="text-[11px] text-[var(--color-text-faint)] animate-pulse">
        Waiting for daemon&hellip;
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {(status === "stopped" || status === "stale") && (
        <ActionButton
          label="Resume"
          title="Start the daemon via rove:// (session-scoped, no enable)"
          onClick={() => handleAction("rove://start")}
          variant="accent"
        />
      )}
      {status === "stale" && (
        <ActionButton
          label="Restart"
          title="Bootout + bootstrap + kickstart via rove://"
          onClick={() => handleAction("rove://restart")}
          variant="muted"
        />
      )}
      {status === "online" && (
        <ActionButton
          label="Pause"
          title="Stop the daemon for this session (bootout only, not disable)"
          onClick={() => handleAction("rove://stop")}
          variant="muted"
        />
      )}
      {(status === "online" || status === "stale") && (
        <ActionButton
          label="Reveal logs"
          title="Open Finder to the daemon log file"
          onClick={() => handleAction("rove://reveal-logs")}
          variant="ghost"
        />
      )}
    </div>
  );
}

// ── ActionButton ──────────────────────────────────────────────────────────────

type ButtonVariant = "accent" | "muted" | "ghost";

function ActionButton({
  label,
  title,
  onClick,
  variant,
}: {
  label: string;
  title: string;
  onClick: () => void;
  variant: ButtonVariant;
}) {
  const base =
    "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer";

  const styles: Record<ButtonVariant, string> = {
    accent:
      "border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]/80",
    muted:
      "border-[var(--color-border)] bg-[var(--color-bg-3)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]",
    ghost:
      "border-transparent bg-transparent text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] hover:border-[var(--color-border)]",
  };

  return (
    <button
      type="button"
      className={`${base} ${styles[variant]}`}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
