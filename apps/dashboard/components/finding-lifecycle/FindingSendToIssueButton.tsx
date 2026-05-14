"use client";

import { useState } from "react";
import { sendFindingToIssue } from "@/lib/findings/send-to-issue";
import { FindingError } from "./FindingError";
import type { LifecycleFinding } from "./types";

interface FindingSendToIssueButtonProps {
  finding: LifecycleFinding;
  /** Resolved per-project. Pass `null` to render the button disabled. */
  repo: { owner: string; name: string } | null;
  onCreated?: (issueUrl: string) => void;
}

export function FindingSendToIssueButton({
  finding,
  repo,
  onCreated,
}: FindingSendToIssueButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [issueUrl, setIssueUrl] = useState<string | null>(finding.githubIssueUrl);

  async function onClick() {
    if (!repo || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await sendFindingToIssue({ findingId: finding.id, repo });
      setIssueUrl(result.issueUrl);
      onCreated?.(result.issueUrl);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setBusy(false);
    }
  }

  if (issueUrl) {
    return (
      <a
        href={issueUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="focus-rove inline-flex items-center gap-1.5"
        data-rove-send-to-issue="filed"
        style={linkStyle}
      >
        View issue
        <ExternalIcon />
      </a>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2" data-rove-send-to-issue="error">
        <FindingError error={error} retry={() => void onClick()} />
      </div>
    );
  }

  const disabled = !repo || busy;
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={disabled}
      aria-busy={busy}
      aria-disabled={disabled || undefined}
      title={repo ? undefined : "Connect a GitHub repo on this project to enable issue export"}
      className="focus-rove inline-flex items-center gap-1.5"
      data-rove-send-to-issue="ready"
      style={{
        ...buttonStyle,
        opacity: disabled && !busy ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {busy ? (
        <>
          <Spinner />
          Creating issue…
        </>
      ) : (
        <>
          <GitHubIcon />
          Send to GitHub
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
};

const linkStyle: React.CSSProperties = {
  ...buttonStyle,
  textDecoration: "none",
  cursor: "pointer",
};

function GitHubIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width={13} height={13} fill="currentColor">
      <path d="M8 .2A8 8 0 0 0 0 8.2a8 8 0 0 0 5.47 7.6c.4.08.55-.17.55-.39v-1.38c-2.23.5-2.7-1.07-2.7-1.07-.37-.94-.9-1.18-.9-1.18-.73-.5.06-.5.06-.5.81.06 1.24.84 1.24.84.72 1.24 1.9.88 2.36.67.07-.53.28-.88.51-1.08-1.78-.2-3.65-.9-3.65-3.98 0-.88.31-1.6.83-2.17-.08-.2-.36-1.02.08-2.13 0 0 .67-.21 2.2.83a7.59 7.59 0 0 1 4 0c1.53-1.04 2.2-.83 2.2-.83.44 1.11.16 1.93.08 2.13.52.57.83 1.29.83 2.17 0 3.09-1.87 3.78-3.66 3.97.29.25.55.74.55 1.5v2.22c0 .22.14.48.55.39A8 8 0 0 0 16 8.2 8 8 0 0 0 8 .2Z" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth="1.8">
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
