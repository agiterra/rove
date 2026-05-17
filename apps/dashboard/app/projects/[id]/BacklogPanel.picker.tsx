"use client";

import { useState, useTransition } from "react";
import {
  installConnectExistingGitHubAction,
  installDashboardOnlyAction,
  installManagedBoardGitHubAction,
} from "./actions";

type PickedPath = "dashboard" | "existing" | "managed" | null;

export function InstallPicker({
  projectId,
  defaultOwner,
}: {
  projectId: string;
  defaultOwner: string;
}) {
  const [picked, setPicked] = useState<PickedPath>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function chooseDashboard() {
    setError(null);
    startTransition(async () => {
      const result = await installDashboardOnlyAction(projectId);
      if (!result.ok) setError(result.error);
    });
  }

  function submitConnectExisting(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await installConnectExistingGitHubAction(projectId, fd);
      if (!result.ok) setError(result.error);
    });
  }

  function submitManagedBoard(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await installManagedBoardGitHubAction(projectId, fd);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PickerHeader />

      <div className="grid gap-4 md:grid-cols-3">
        <DashboardOnlyCard pending={pending} onChoose={chooseDashboard} />
        <ConnectExistingCard
          expanded={picked === "existing"}
          pending={pending}
          onToggle={() => setPicked(picked === "existing" ? null : "existing")}
          onSubmit={submitConnectExisting}
        />
        <ManagedBoardCard
          expanded={picked === "managed"}
          pending={pending}
          defaultOwner={defaultOwner}
          onToggle={() => setPicked(picked === "managed" ? null : "managed")}
          onSubmit={submitManagedBoard}
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PickerHeader() {
  return (
    <div className="flex items-end justify-between gap-6 flex-wrap">
      <div className="flex flex-col gap-2">
        <p
          className="font-mono uppercase text-[var(--color-text-faint)]"
          style={{ fontSize: 10.5, letterSpacing: "0.18em" }}
        >
          STEP <span className="opacity-50">·</span> PICK A BACKLOG
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">
          Where should findings go from here?
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] max-w-xl">
          The dashboard is the canonical store either way. Pick what else gets
          a copy when a walker files something new.
        </p>
      </div>
    </div>
  );
}

function DashboardOnlyCard({
  pending,
  onChoose,
}: {
  pending: boolean;
  onChoose: () => void;
}) {
  return (
    <article className="path-card path-card-stagger-1">
      <CardMark>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect
            x="1.5"
            y="2.5"
            width="13"
            height="11"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path d="M1.5 6h13" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="3.5" cy="4.25" r="0.5" fill="currentColor" />
          <circle cx="5" cy="4.25" r="0.5" fill="currentColor" />
        </svg>
      </CardMark>
      <p className="path-card-spec">OPTION 01 · DASHBOARD</p>
      <h3 className="path-card-title">Dashboard only</h3>
      <p className="path-card-body">
        Findings live in Rove. Triage in the dashboard. Swap in an external
        backlog later without losing a thing.
      </p>
      <div className="pt-1">
        <button
          type="button"
          onClick={onChoose}
          disabled={pending}
          className="focus-rove inline-flex items-center gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-panel-2)] px-3.5 py-1.5 text-xs font-medium hover:bg-[var(--color-panel-2)]/70 disabled:opacity-50 transition-colors"
        >
          {pending ? "Installing…" : "Use dashboard only"}
          {!pending ? (
            <span aria-hidden className="text-[var(--color-text-faint)]">
              →
            </span>
          ) : null}
        </button>
      </div>
    </article>
  );
}

function ConnectExistingCard({
  expanded,
  pending,
  onToggle,
  onSubmit,
}: {
  expanded: boolean;
  pending: boolean;
  onToggle: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <article className="path-card path-card-recommended path-card-stagger-2">
      <div className="flex items-center gap-2">
        <span className="path-chip">
          <span className="path-pulse" aria-hidden />
          Recommended
        </span>
      </div>
      <CardMark>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M8 .9a7.1 7.1 0 0 0-2.24 13.84c.36.07.49-.15.49-.34v-1.2c-1.97.43-2.39-.95-2.39-.95-.32-.82-.79-1.04-.79-1.04-.65-.45.05-.44.05-.44.72.05 1.1.74 1.1.74.64 1.1 1.67.78 2.08.6.07-.47.25-.78.45-.96-1.57-.18-3.22-.79-3.22-3.5 0-.77.27-1.4.72-1.9-.08-.18-.32-.9.07-1.88 0 0 .6-.2 1.96.72.57-.16 1.18-.24 1.79-.24.61 0 1.22.08 1.79.24 1.36-.92 1.96-.72 1.96-.72.39.98.15 1.7.07 1.88.45.5.72 1.13.72 1.9 0 2.72-1.66 3.32-3.23 3.5.26.22.49.65.49 1.32v1.96c0 .2.12.42.5.34A7.1 7.1 0 0 0 8 .9Z"
            fill="currentColor"
          />
        </svg>
      </CardMark>
      <p className="path-card-spec">OPTION 02 · CONNECT-EXISTING</p>
      <h3 className="path-card-title">GitHub Project v2 board</h3>
      <p className="path-card-body">
        Point Rove at the Project board your team already triages in. Findings
        land as draft items with severity, heuristic, persona, evidence, and a
        link back to the run.
      </p>

      {expanded ? (
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-2.5 pt-1"
          aria-label="Connect a GitHub Project v2"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-faint)]">
              Project v2 URL
            </span>
            <input
              name="projectUrl"
              required
              placeholder="https://github.com/orgs/agiterra/projects/3"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md bg-[var(--color-panel)] border border-[var(--color-border-strong)] focus-rove px-3 py-2 font-mono"
              style={{ fontSize: 12 }}
            />
          </label>
          <p className="text-[11px] text-[var(--color-text-faint)] leading-snug">
            Accepts <code className="font-mono">orgs/&lt;org&gt;/projects/&lt;n&gt;</code> or{" "}
            <code className="font-mono">users/&lt;user&gt;/projects/&lt;n&gt;</code> URLs.
          </p>
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              onClick={onToggle}
              disabled={pending}
              className="text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="focus-rove rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-brand-cyan) 0%, var(--color-brand-navy) 100%)",
                color: "white",
              }}
            >
              {pending ? "Validating…" : "Connect"}
            </button>
          </div>
        </form>
      ) : (
        <div className="pt-1">
          <button
            type="button"
            onClick={onToggle}
            className="focus-rove inline-flex items-center gap-2 rounded-md border border-[rgba(63,201,203,0.4)] bg-[rgba(63,201,203,0.06)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-accent)] hover:bg-[rgba(63,201,203,0.12)] transition-colors"
          >
            Connect a Project v2
            <span aria-hidden>→</span>
          </button>
        </div>
      )}
    </article>
  );
}

function ManagedBoardCard({
  expanded,
  pending,
  defaultOwner,
  onToggle,
  onSubmit,
}: {
  expanded: boolean;
  pending: boolean;
  defaultOwner: string;
  onToggle: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <article className="path-card path-card-stagger-3">
      <CardMark>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M2 3.5h12M2 8h12M2 12.5h12"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <circle cx="4" cy="3.5" r="1" fill="currentColor" />
          <circle cx="9" cy="8" r="1" fill="currentColor" />
          <circle cx="6" cy="12.5" r="1" fill="currentColor" />
        </svg>
      </CardMark>
      <p className="path-card-spec">OPTION 03 · MANAGED BOARD</p>
      <h3 className="path-card-title">Set up a Rove board</h3>
      <p className="path-card-body">
        Rove creates a new Project v2 in your org with the canonical
        Severity / Heuristic / Persona / Flow fields. Optionally clone
        a template board to inherit its views.
      </p>

      {expanded ? (
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-2.5 pt-1"
          aria-label="Set up a Rove-managed Project v2"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-faint)]">
              GitHub owner
            </span>
            <input
              name="owner"
              defaultValue={defaultOwner}
              required
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md bg-[var(--color-panel)] border border-[var(--color-border-strong)] focus-rove px-3 py-2 font-mono"
              style={{ fontSize: 12 }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-faint)]">
              Board name
            </span>
            <input
              name="boardName"
              defaultValue="Rove agent-readiness"
              required
              autoComplete="off"
              className="w-full rounded-md bg-[var(--color-panel)] border border-[var(--color-border-strong)] focus-rove px-3 py-2"
              style={{ fontSize: 12 }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-faint)]">
              Template URL <span className="opacity-60">(optional)</span>
            </span>
            <input
              name="templateProjectUrl"
              placeholder="https://github.com/orgs/agiterra/projects/N"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md bg-[var(--color-panel)] border border-[var(--color-border-strong)] focus-rove px-3 py-2 font-mono"
              style={{ fontSize: 12 }}
            />
          </label>
          <p className="text-[11px] text-[var(--color-text-faint)] leading-snug">
            GitHub's API can't create custom views programmatically.
            Cloning a template board is the only way to inherit views.
            Leave blank for fields-only.
          </p>
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              onClick={onToggle}
              disabled={pending}
              className="text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="focus-rove rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-brand-cyan) 0%, var(--color-brand-navy) 100%)",
                color: "white",
              }}
            >
              {pending ? "Creating…" : "Create board"}
            </button>
          </div>
        </form>
      ) : (
        <div className="pt-1">
          <button
            type="button"
            onClick={onToggle}
            className="focus-rove inline-flex items-center gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-panel-2)] px-3.5 py-1.5 text-xs font-medium hover:bg-[var(--color-panel-2)]/70 transition-colors"
          >
            Create a board
            <span aria-hidden className="text-[var(--color-text-faint)]">
              →
            </span>
          </button>
        </div>
      )}
    </article>
  );
}

function CardMark({ children }: { children: React.ReactNode }) {
  return <span className="path-card-mark">{children}</span>;
}

