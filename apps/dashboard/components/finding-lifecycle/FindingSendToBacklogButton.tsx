"use client";

import { useState } from "react";
import Link from "next/link";
import { sendFindingToBacklog } from "@/lib/findings/send-to-backlog";
import { FindingError } from "./FindingError";
import type { LifecycleFinding } from "./types";
import type { ProjectBacklogConnectionSummary } from "@/lib/findings/resolve-backlog-connection";

interface Props {
  finding: LifecycleFinding;
  projectId: string;
  /** Resolved server-side; null when no external backlog is connected. */
  connection: ProjectBacklogConnectionSummary | null;
  onSent?: (externalUrl: string) => void;
}

export function FindingSendToBacklogButton({
  finding,
  projectId,
  connection,
  onSent,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [externalUrl, setExternalUrl] = useState<string | null>(
    finding.githubIssueUrl,
  );

  async function onClick() {
    if (!connection || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await sendFindingToBacklog({ findingId: finding.id });
      setExternalUrl(result.externalUrl);
      onSent?.(result.externalUrl);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setBusy(false);
    }
  }

  if (externalUrl) {
    return (
      <a
        href={externalUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="focus-rove inline-flex items-center gap-1.5"
        data-rove-send-to-backlog="filed"
        style={linkStyle}
      >
        View {externalKindLabel(connection?.provider)}
        <ExternalIcon />
      </a>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2" data-rove-send-to-backlog="error">
        <FindingError error={error} retry={() => void onClick()} />
      </div>
    );
  }

  if (!connection) {
    return (
      <Link
        href={`/projects/${encodeURIComponent(projectId)}/settings`}
        className="focus-rove inline-flex items-center gap-1.5"
        data-rove-send-to-backlog="no-connection"
        style={{ ...buttonStyle, opacity: 0.7 }}
        title="No external backlog is connected on this project"
      >
        <GitHubIcon />
        Connect a backlog
        <ExternalIcon />
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      aria-busy={busy}
      title={`Push this finding to ${connection.destinationLabel}`}
      className="focus-rove inline-flex items-center gap-1.5"
      data-rove-send-to-backlog="ready"
      style={{ ...buttonStyle, cursor: busy ? "wait" : "pointer" }}
    >
      {busy ? (
        <>
          <Spinner />
          Sending…
        </>
      ) : (
        <>
          {providerIcon(connection.provider)}
          {sendLabel(connection.provider)}
        </>
      )}
    </button>
  );
}

const buttonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--color-border-strong)",
  borderRadius: 8,
  padding: "6px 12px",
  color: "var(--color-text)",
  fontSize: 12,
  fontWeight: 500,
  textDecoration: "none",
};

const linkStyle: React.CSSProperties = {
  ...buttonStyle,
  cursor: "pointer",
};

function sendLabel(provider: ProjectBacklogConnectionSummary["provider"]): string {
  if (provider === "github") return "Send to GitHub Project";
  if (provider === "linear") return "Send to Linear";
  return "Send to backlog";
}

function externalKindLabel(
  provider: ProjectBacklogConnectionSummary["provider"] | undefined,
): string {
  if (provider === "github") return "card";
  if (provider === "linear") return "issue";
  return "card";
}

function providerIcon(provider: ProjectBacklogConnectionSummary["provider"]) {
  if (provider === "github") return <GitHubIcon />;
  if (provider === "linear") return <LinearIcon />;
  return null;
}

function GitHubIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width={13} height={13} fill="currentColor">
      <path d="M8 .2A8 8 0 0 0 0 8.2a8 8 0 0 0 5.47 7.6c.4.08.55-.17.55-.39v-1.38c-2.23.5-2.7-1.07-2.7-1.07-.37-.94-.9-1.18-.9-1.18-.73-.5.06-.5.06-.5.81.06 1.24.84 1.24.84.72 1.24 1.9.88 2.36.67.07-.53.28-.88.51-1.08-1.78-.2-3.65-.9-3.65-3.98 0-.88.31-1.6.83-2.17-.08-.2-.36-1.02.08-2.13 0 0 .67-.21 2.2.83a7.59 7.59 0 0 1 4 0c1.53-1.04 2.2-.83 2.2-.83.44 1.11.16 1.93.08 2.13.52.57.83 1.29.83 2.17 0 3.09-1.87 3.78-3.66 3.97.29.25.55.74.55 1.5v2.22c0 .22.14.48.55.39A8 8 0 0 0 16 8.2 8 8 0 0 0 8 .2Z" />
    </svg>
  );
}

function LinearIcon() {
  return (
    <svg aria-hidden viewBox="0 0 100 100" width={13} height={13} fill="currentColor">
      <path d="M0 53.85 46.15 100c-2.46-7.7-7.07-14.36-13.39-19.46L19.46 67.46C13.36 60.92 8.7 53.34 0 53.85ZM0 39.23 60.77 100c-2.85-9.46-8.85-17.85-17.08-23.62L23.62 56.31C15.16 47.85 6.77 41.62 0 39.23Zm0-20.46L81.23 100c-3.62-12.92-12.31-23.85-24.31-31.08L20.92 32.92C13.46 25.46 5.85 20.31 0 18.77Z" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width={11}
      height={11}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M6 3h7v7" />
      <path d="M13 3 5 11" />
      <path d="M3 5v8h8" />
    </svg>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="animate-spin"
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        borderRadius: "50%",
        border: "2px solid var(--color-border-strong)",
        borderTopColor: "var(--color-brand-cyan)",
      }}
    />
  );
}
