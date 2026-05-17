"use client";

import { useState, useTransition } from "react";
import {
  disconnectBacklogAction,
  installConnectExistingGitHubAction,
  installDashboardOnlyAction,
} from "./actions";

type ActiveConnection = {
  provider: "dashboard-only" | "github" | "linear";
  installedVia: "dashboard_only" | "connect_existing" | "managed_board";
  installedAt: string | null;
  destination: Record<string, unknown>;
};

interface Props {
  projectId: string;
  connection: ActiveConnection | null;
}

export function BacklogPanel({ projectId, connection }: Props) {
  if (connection) {
    return <ConnectedCard projectId={projectId} connection={connection} />;
  }
  return <InstallPicker projectId={projectId} />;
}

function InstallPicker({ projectId }: { projectId: string }) {
  const [picked, setPicked] = useState<"dashboard" | "existing" | "managed" | null>(null);
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

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold tracking-tight">Pick a backlog</h2>
      <p className="text-sm text-[var(--color-text-muted)] max-w-xl">
        Rove findings live in the dashboard regardless. Choose where else they should
        flow when a walker files something new.
      </p>

      <div className="grid gap-3 md:grid-cols-3">
        <PathCard
          tone={picked === "dashboard" ? "active" : "default"}
          title="Dashboard only"
          subtitle="No external destination"
          body="Findings stay in Rove. Triage in the dashboard. Switch later without losing anything."
          footer={
            <button
              type="button"
              onClick={chooseDashboard}
              disabled={pending}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-panel-2)]/70 disabled:opacity-50"
            >
              {pending ? "Installing…" : "Use dashboard only"}
            </button>
          }
        />

        <PathCard
          tone={picked === "existing" ? "active" : "default"}
          title="Connect to existing"
          subtitle="GitHub repo Issues"
          body="Point Rove at a repo your team already triages in. Findings file there as Issues from alpha.38c on."
          footer={
            <button
              type="button"
              onClick={() => setPicked(picked === "existing" ? null : "existing")}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-panel-2)]/70"
              aria-expanded={picked === "existing"}
              aria-controls="connect-existing-form"
            >
              {picked === "existing" ? "Hide form" : "Pick a repo"}
            </button>
          }
        />

        <PathCard
          tone="muted"
          title="Set up a new board"
          subtitle="Managed Rove Project v2"
          body="Rove auto-creates a Project v2 board in your org, with custom fields and views."
          footer={
            <span className="inline-flex items-center gap-2 rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-panel-2)]/30 px-3 py-1.5 text-xs text-[var(--color-text-faint)]">
              Coming in alpha.40
            </span>
          }
        />
      </div>

      {picked === "existing" ? (
        <form
          id="connect-existing-form"
          onSubmit={submitConnectExisting}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel-2)]/40 p-4 flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">GitHub repo</span>
            <span className="text-xs text-[var(--color-text-faint)]">
              Either <code className="font-mono">owner/repo</code> shorthand or a full
              GitHub URL. The Rove GitHub App must be installed on the repo.
            </span>
            <input
              name="repoUrl"
              required
              placeholder="agiterra/tankloop"
              autoComplete="off"
              className="w-full rounded-md bg-[var(--color-panel)] border border-[var(--color-border)] focus-rove px-3 py-2 font-mono"
              style={{ fontSize: 13 }}
            />
          </label>
          <div className="flex justify-end">
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
      ) : null}

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

function ConnectedCard({
  projectId,
  connection,
}: {
  projectId: string;
  connection: ActiveConnection;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function onDisconnect() {
    setError(null);
    startTransition(async () => {
      const result = await disconnectBacklogAction(projectId);
      if (!result.ok) setError(result.error);
      setConfirming(false);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold tracking-tight">Backlog connection</h2>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel-2)]/40 p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{providerLabel(connection.provider)}</p>
            <p className="text-xs text-[var(--color-text-faint)]">
              Installed via {installedViaLabel(connection.installedVia)}
              {connection.installedAt
                ? ` · ${new Date(connection.installedAt).toLocaleString()}`
                : null}
            </p>
          </div>
          {confirming ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDisconnect}
                disabled={pending}
                className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-200 hover:bg-rose-500/15 disabled:opacity-50"
              >
                {pending ? "Disconnecting…" : "Confirm disconnect"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-panel-2)]/70"
            >
              Disconnect
            </button>
          )}
        </div>

        <DestinationDetails connection={connection} />

        <p className="text-xs text-[var(--color-text-faint)]">
          {connection.provider === "github" && connection.installedVia === "connect_existing"
            ? "Outbound finding push lands in alpha.38c. The connection is recorded; the sink will start using it on the next release."
            : connection.provider === "dashboard-only"
              ? "Findings stay in Rove. Switch to an external backlog anytime."
              : null}
        </p>
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

function DestinationDetails({ connection }: { connection: ActiveConnection }) {
  const d = connection.destination;
  if (connection.provider === "github" && d.kind === "repo_issues") {
    const owner = String(d.owner ?? "");
    const repo = String(d.repo ?? "");
    const htmlUrl = typeof d.htmlUrl === "string" ? d.htmlUrl : null;
    return (
      <p className="text-xs text-[var(--color-text-muted)] font-mono">
        Destination:{" "}
        {htmlUrl ? (
          <a
            href={htmlUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-text)]"
          >
            {owner}/{repo}
          </a>
        ) : (
          <span>
            {owner}/{repo}
          </span>
        )}
      </p>
    );
  }
  return null;
}

function PathCard({
  tone,
  title,
  subtitle,
  body,
  footer,
}: {
  tone: "default" | "active" | "muted";
  title: string;
  subtitle: string;
  body: string;
  footer: React.ReactNode;
}) {
  const toneClasses =
    tone === "active"
      ? "border-[var(--color-brand-cyan)]/60 bg-[var(--color-brand-cyan)]/5"
      : tone === "muted"
        ? "border-[var(--color-border)] bg-[var(--color-panel-2)]/30 opacity-75"
        : "border-[var(--color-border)] bg-[var(--color-panel-2)]/60 hover:bg-[var(--color-panel-2)]";
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${toneClasses}`}>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium tracking-tight">{title}</p>
        <p className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] font-mono">
          {subtitle}
        </p>
      </div>
      <p className="text-xs text-[var(--color-text-muted)] flex-1">{body}</p>
      <div>{footer}</div>
    </div>
  );
}

function providerLabel(p: ActiveConnection["provider"]): string {
  if (p === "github") return "GitHub";
  if (p === "linear") return "Linear";
  return "Dashboard only";
}

function installedViaLabel(v: ActiveConnection["installedVia"]): string {
  if (v === "connect_existing") return "connect-to-existing";
  if (v === "managed_board") return "managed board";
  return "dashboard-only";
}
