"use client";

import { useState, useTransition } from "react";
import { waitForJobResult } from "../../../lib/authoring/wait-for-job";
import { queueWalkAction } from "./run-walk-actions";

export interface PersonaOption {
  id: string;
  label: string;
  category: string;
}

export function RunWalkButton({ flowId, personas }: { flowId: string; personas: PersonaOption[] }) {
  const [open, setOpen] = useState(false);
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? "");
  const [targetUrl, setTargetUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  if (personas.length === 0) {
    return (
      <span className="text-xs text-[var(--color-text-muted)]" title="No personas synced">
        no personas
      </span>
    );
  }

  function handleRun() {
    setError(null);
    setStatus("Queuing…");
    startTransition(async () => {
      const queued = await queueWalkAction({
        flow_id: flowId,
        persona_id: personaId,
        target_url: targetUrl.trim() || undefined,
      });
      if (!queued.ok) {
        setStatus(null);
        setError(queued.error);
        return;
      }
      setStatus("Waiting for daemon…");
      try {
        await waitForJobResult(queued.data.id, {
          timeoutMs: 15 * 60_000,
          onStatus: (s, claimedBy) => {
            if (s === "claimed" || s === "running") {
              setStatus(`Daemon walking${claimedBy ? ` (${claimedBy.slice(0, 8)})` : ""}…`);
            }
          },
        });
        setStatus("Done — refreshing…");
        // The new run row arrives via the supabase sink during the walk;
        // a full refresh shows it in the runs list at the top.
        window.location.reload();
      } catch (e) {
        setError((e as Error).message);
        setStatus(null);
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium px-3 py-1.5 hover:opacity-90"
        >
          Run walk
        </button>
      ) : (
        <>
          <select
            value={personaId}
            onChange={(e) => setPersonaId(e.target.value)}
            disabled={busy}
            className="rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] px-2 py-1.5 text-sm font-mono"
          >
            <optgroup label="🧑  Human personas">
              {personas
                .filter((p) => p.category !== "agent")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
            </optgroup>
            <optgroup label="🤖  Agent personas">
              {personas
                .filter((p) => p.category === "agent")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
            </optgroup>
          </select>
          <input
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            disabled={busy}
            placeholder="optional: target URL (default localhost:3000)"
            className="rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] px-2 py-1.5 text-xs font-mono w-72"
          />
          <button
            type="button"
            onClick={handleRun}
            disabled={busy || !personaId}
            className="rounded-md bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium px-3 py-1.5 disabled:opacity-50"
          >
            {busy ? "Running…" : "Go"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              setOpen(false);
              setStatus(null);
              setError(null);
            }}
            disabled={busy}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            cancel
          </button>
        </>
      )}
      {status ? <span className="text-xs text-[var(--color-text-muted)]">{status}</span> : null}
      {error ? (
        <span className="text-xs text-red-300 max-w-[24rem] truncate" title={error}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
