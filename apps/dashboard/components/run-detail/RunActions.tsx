"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRunAction } from "@/lib/runs/delete-run";

/**
 * Run-level destructive actions for the run-detail page. Currently just
 * "Delete this run" with a confirm modal. Rendered above the filmstrip so
 * it's discoverable without being adjacent to non-destructive controls
 * (filmstrip click, tab switch) that the operator triggers constantly.
 *
 * The button refuses to enable when the run is still in flight — same
 * gate the server action enforces, surfaced in the UI to avoid the
 * round-trip-and-toast pattern.
 */
export function RunActions({
  runId,
  projectId,
  status,
}: {
  runId: string;
  projectId: string;
  status: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const inFlight = status === "running" || status === "claimed";
  const disabledReason = inFlight
    ? "Run is still in flight — wait for it to settle or let the stuck-walk sweep close it."
    : null;

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteRunAction(runId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      // `deleted=<id>` carries the success message across the redirect so
      // /runs can render a role=status banner — agents (and screen
      // readers) perceive success without polling.
      const params = new URLSearchParams({
        p: projectId,
        deleted: runId,
      });
      router.push(`/runs?${params.toString()}`);
      router.refresh();
    });
  }

  return (
    <div
      className="flex items-center justify-end gap-3 mt-4"
      data-rove-run-actions
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={inFlight || pending}
        aria-disabled={inFlight ? "true" : undefined}
        title={disabledReason ?? "Delete this run and all of its artifacts."}
        data-rove-action="delete-run"
        className="focus-rove inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium"
        style={{
          borderColor: "rgba(248, 113, 113, 0.35)",
          color: inFlight ? "var(--color-text-faint)" : "rgb(248 113 113)",
          background: "transparent",
          opacity: inFlight ? 0.5 : 1,
          cursor: inFlight ? "not-allowed" : "pointer",
        }}
      >
        <TrashIcon />
        Delete this run
      </button>

      {open ? (
        <ConfirmDialog
          runId={runId}
          pending={pending}
          error={error}
          onCancel={() => {
            if (pending) return;
            setOpen(false);
            setError(null);
          }}
          onConfirm={handleConfirm}
        />
      ) : null}
    </div>
  );
}

function ConfirmDialog({
  runId,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  runId: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-run-title"
      aria-describedby="delete-run-body"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border p-6"
        style={{
          borderColor: "var(--color-border)",
          background: "var(--color-panel)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="delete-run-title"
          className="text-lg font-semibold mb-2"
          style={{ color: "var(--color-text)" }}
        >
          Delete this run?
        </h2>
        <p
          id="delete-run-body"
          className="text-sm leading-relaxed mb-4"
          style={{ color: "var(--color-text-muted)" }}
        >
          This permanently deletes the run, every step, every finding, and
          every screenshot stored against it. There is no undo.
        </p>
        <p
          className="text-xs font-mono mb-5"
          style={{ color: "var(--color-text-faint)" }}
        >
          run · {runId}
        </p>
        {error ? (
          <p
            className="text-xs rounded-md border px-3 py-2 mb-4"
            role="alert"
            style={{
              borderColor: "rgba(248, 113, 113, 0.3)",
              color: "rgb(252 165 165)",
              background: "rgba(127, 29, 29, 0.2)",
            }}
          >
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="focus-rove inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium"
            style={{
              borderColor: "var(--color-border-strong)",
              color: "var(--color-text)",
              background: "transparent",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending}
            data-rove-action="delete-run-confirm"
            className="focus-rove inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium"
            style={{
              background: pending ? "rgba(248, 113, 113, 0.4)" : "rgb(248 113 113)",
              color: "white",
              border: "1px solid rgba(248,113,113,0.6)",
              cursor: pending ? "wait" : "pointer",
            }}
          >
            {pending ? "Deleting…" : "Delete run"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M3 4h10" />
      <path d="M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" />
      <path d="M4 4l1 9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l1-9" />
      <path d="M7 7v5" />
      <path d="M9 7v5" />
    </svg>
  );
}
