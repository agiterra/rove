"use client";

/**
 * SetupForm — interactive worker install form.
 *
 * Server parent (/setup/page.tsx) resolves defaults and passes them in.
 * This component owns:
 *   - Form state (worker_name, worker_kind)
 *   - POST to /api/install/mint → renders the install command
 *   - Realtime subscription on `workers` table → live install-status panel
 *
 * File-size note: ~280 lines, within the 350-line React component ceiling.
 * Install-command panel + status panel are defined below the main component
 * (no separate .parts.tsx needed at this size).
 */
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase/client";

interface Props {
  defaultWorkerName: string;
  projectId: string;
}

interface MintResult {
  install_command: string;
  code: string;
  expires_at: string;
}

type InstallStatus = "idle" | "waiting" | "online";

export function SetupForm({ defaultWorkerName, projectId }: Props) {
  const [workerName, setWorkerName] = useState(defaultWorkerName);
  const [workerKind, setWorkerKind] = useState<"laptop" | "dedicated">("laptop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
  const [installStatus, setInstallStatus] = useState<InstallStatus>("idle");
  // Stable ref so the subscription closure sees the current workerName.
  const workerNameRef = useRef(workerName);
  workerNameRef.current = workerName;

  // Subscribe to workers table once we have a mint result. Subscribing before
  // mint means zero DB load for idle page visits.
  useEffect(() => {
    if (!mintResult) return;

    const supabase = createBrowserSupabase();
    setInstallStatus("waiting");

    async function start() {
      const session = (await supabase.auth.getSession()).data.session;
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }

      const name = workerNameRef.current;

      function handleRow(row: Record<string, unknown>) {
        const hbRaw = row["last_heartbeat_at"];
        if (!hbRaw) return;
        const age = Date.now() - new Date(hbRaw as string).getTime();
        if (age < 30_000) setInstallStatus("online");
      }

      const channel = supabase
        .channel(`setup_worker_${projectId}_${name}`)
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
            if ((row["name"] as string) === name) handleRow(row);
          },
        )
        .subscribe(async (status) => {
          if (status !== "SUBSCRIBED") return;
          // Catch-up read: handles the race where the daemon's first heartbeat
          // arrives before our subscription attaches.
          const { data } = await supabase
            .from("workers")
            .select("last_heartbeat_at")
            .eq("project_id", projectId)
            .eq("name", name)
            .maybeSingle();
          if (data) handleRow(data as Record<string, unknown>);
        });

      return () => {
        void channel.unsubscribe();
      };
    }

    let cleanup: (() => void) | undefined;
    start().then((fn) => {
      cleanup = fn;
    });

    return () => {
      cleanup?.();
    };
  }, [mintResult, projectId]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      setMintResult(null);
      setInstallStatus("idle");

      try {
        const res = await fetch("/api/install/mint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ worker_name: workerName, project_id: projectId, worker_kind: workerKind }),
        });
        const json = (await res.json()) as Record<string, unknown>;

        if (res.status === 200) {
          setMintResult({
            install_command: json["install_command"] as string,
            code: json["code"] as string,
            expires_at: json["expires_at"] as string,
          });
        } else {
          setError((json["error"] as string) ?? `Unexpected error (${res.status})`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setBusy(false);
      }
    },
    [workerName, projectId, workerKind],
  );

  return (
    <div className="max-w-2xl space-y-6">
      {/* Config form */}
      <form onSubmit={handleSubmit} className="surface p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="worker_name">
            Worker name
          </label>
          <input
            id="worker_name"
            type="text"
            value={workerName}
            onChange={(e) => setWorkerName(e.target.value)}
            required
            minLength={1}
            maxLength={64}
            pattern="[a-zA-Z0-9][a-zA-Z0-9_\-]*"
            title="Letters, numbers, hyphens, underscores. Must start with a letter or digit."
            className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-panel-2)] px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
          />
          <p className="mt-1 text-xs text-[var(--color-text-faint)]">
            Identifies this machine in the worker registry. Use a name that&apos;s unique within the project.
          </p>
        </div>

        <div>
          <p className="block text-sm font-medium mb-1.5">Worker kind</p>
          <div className="flex gap-4">
            {(["laptop", "dedicated"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="radio"
                  name="worker_kind"
                  value={k}
                  checked={workerKind === k}
                  onChange={() => setWorkerKind(k)}
                  className="accent-[var(--color-accent)]"
                />
                <span className="capitalize">{k}</span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-faint)]">
            Laptop workers claim manual + localhost walks. Dedicated workers also handle webhook-triggered walks.
          </p>
        </div>

        <div>
          <p className="text-sm font-medium mb-0.5">Project</p>
          <p className="text-sm font-mono text-[var(--color-text-muted)]">{projectId}</p>
          <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">
            Switch project via the header switcher.
          </p>
        </div>

        {error ? (
          <p className="text-sm text-red-300 rounded-md bg-red-950/30 border border-red-800/40 px-3 py-2">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50 text-[var(--color-bg)]"
          style={{
            background: "linear-gradient(135deg, var(--color-brand-cyan) 0%, var(--color-brand-navy) 100%)",
          }}
        >
          {busy ? "Generating…" : "Generate install command"}
        </button>
      </form>

      {/* Install command panel — only shown after a successful mint */}
      {mintResult ? (
        <>
          <InstallCommandPanel command={mintResult.install_command} />
          <InstallStatusPanel status={installStatus} workerName={workerName} />
        </>
      ) : null}
    </div>
  );
}

// ── InstallCommandPanel ───────────────────────────────────────────────────────

function InstallCommandPanel({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div
      className="rounded-xl p-px"
      style={{
        background: "linear-gradient(135deg, var(--color-brand-cyan) 0%, var(--color-brand-navy) 100%)",
      }}
    >
      <div className="rounded-[11px] bg-[var(--color-panel)] p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
            Install command — paste into your terminal
          </p>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-[var(--color-border-strong)] transition-colors hover:bg-[var(--color-panel-2)]"
            style={copied ? { color: "var(--color-brand-cyan)" } : { color: "var(--color-text-muted)" }}
          >
            {copied ? (
              <>
                <CheckIcon />
                Copied
              </>
            ) : (
              <>
                <ClipboardIcon />
                Copy
              </>
            )}
          </button>
        </div>
        <pre className="text-sm font-mono text-[var(--color-text)] whitespace-pre-wrap break-all leading-relaxed">
          {command}
        </pre>
        <p className="mt-3 text-xs text-[var(--color-text-faint)]">
          This code expires in 5 minutes and can only be used once.
        </p>
      </div>
    </div>
  );
}

// ── InstallStatusPanel ────────────────────────────────────────────────────────

function InstallStatusPanel({ status, workerName }: { status: InstallStatus; workerName: string }) {
  if (status === "idle") return null;

  const isOnline = status === "online";

  return (
    <div
      className="rounded-xl border transition-colors duration-500"
      style={{
        borderColor: isOnline ? "var(--color-brand-cyan)" : "var(--color-border)",
        background: isOnline ? "rgba(63,201,203,0.06)" : "var(--color-panel)",
      }}
    >
      <div className="p-5 flex items-center gap-3">
        {isOnline ? (
          <OnlineDot />
        ) : (
          <PulsingDot />
        )}
        <div>
          {isOnline ? (
            <p className="text-sm font-medium" style={{ color: "var(--color-brand-cyan)" }}>
              Daemon installed and running on <span className="font-mono">{workerName}</span>
            </p>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">
              Waiting for daemon&hellip; (paste the command above into your terminal)
            </p>
          )}
          {isOnline ? (
            <Link
              href="/workers"
              className="mt-1 text-xs underline text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] transition-colors"
            >
              View in worker registry &rarr;
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Micro-components ──────────────────────────────────────────────────────────

function PulsingDot() {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span
        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50"
        style={{ background: "var(--color-text-faint)" }}
      />
      <span
        className="relative inline-flex rounded-full h-2.5 w-2.5"
        style={{ background: "var(--color-text-faint)" }}
      />
    </span>
  );
}

function OnlineDot() {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span
        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40"
        style={{ background: "var(--color-brand-cyan)" }}
      />
      <span
        className="relative inline-flex rounded-full h-2.5 w-2.5"
        style={{ background: "var(--color-brand-cyan)" }}
      />
    </span>
  );
}

function ClipboardIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M10 1.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5v1h4v-1ZM6 0h4a1.5 1.5 0 0 1 1.5 1.5V2h1A1.5 1.5 0 0 1 14 3.5v10A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-10A1.5 1.5 0 0 1 3.5 2h1v-.5A1.5 1.5 0 0 1 6 0Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
    </svg>
  );
}
