"use client";

import { useState, useTransition } from "react";
import { disconnectBacklogAction } from "./actions";
import { SyncPolicyEditor } from "./SyncPolicyEditor";
import type { SyncPolicy } from "@/lib/backlog/types";

export type ActiveConnection = {
  provider: "dashboard-only" | "github" | "linear";
  installedVia: "dashboard_only" | "connect_existing" | "managed_board";
  installedAt: string | null;
  destination: Record<string, unknown>;
  syncPolicy: SyncPolicy;
};

export function ConnectedShowpiece({
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

  const destination = parseDestination(connection);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-2">
          <p
            className="font-mono uppercase text-[var(--color-text-faint)]"
            style={{ fontSize: 10.5, letterSpacing: "0.18em" }}
          >
            BACKLOG <span className="opacity-50">·</span> CONNECTED
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">
            Findings flow to {providerLabel(connection.provider)}
          </h2>
        </div>
        <ConnectionPill connection={connection} />
      </div>

      <section className="path-showpiece">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <DestinationBlock destination={destination} connection={connection} />
          <DisconnectControls
            confirming={confirming}
            pending={pending}
            onCancel={() => setConfirming(false)}
            onConfirm={onDisconnect}
            onArm={() => setConfirming(true)}
          />
        </div>

        <CapabilityFootnote connection={connection} />
      </section>

      {connection.provider !== "dashboard-only" ? (
        <SyncPolicyEditor projectId={projectId} initialPolicy={connection.syncPolicy} />
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

function DestinationBlock({
  destination,
  connection,
}: {
  destination: ParsedDestination | null;
  connection: ActiveConnection;
}) {
  if (!destination) {
    return (
      <div className="path-showpiece-destination">
        <span className="path-showpiece-owner">DASHBOARD</span>
        <span className="path-showpiece-name">Rove only</span>
        <span className="path-showpiece-path mt-1">No external destination</span>
      </div>
    );
  }
  return (
    <div className="path-showpiece-destination">
      <span className="path-showpiece-owner">{destination.owner} /</span>
      <span className="path-showpiece-name">
        {destination.url ? (
          <a
            href={destination.url}
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-dotted underline-offset-4 decoration-[var(--color-border-strong)] hover:decoration-[var(--color-accent)] transition-colors"
          >
            {destination.name}
          </a>
        ) : (
          destination.name
        )}
      </span>
      <span className="path-showpiece-path mt-1">
        Installed via {installedViaLabel(connection.installedVia)}
        {connection.installedAt
          ? ` · ${new Date(connection.installedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
          : null}
      </span>
    </div>
  );
}

function DisconnectControls({
  confirming,
  pending,
  onCancel,
  onConfirm,
  onArm,
}: {
  confirming: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onArm: () => void;
}) {
  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="focus-rove rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs hover:bg-[var(--color-panel-2)]/70 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="focus-rove rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/20 disabled:opacity-50 transition-colors"
        >
          {pending ? "Disconnecting…" : "Confirm disconnect"}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onArm}
      className="focus-rove rounded-md border border-[var(--color-border-strong)] bg-[var(--color-panel-2)]/60 px-3 py-1.5 text-xs hover:bg-[var(--color-panel-2)] transition-colors"
    >
      Disconnect
    </button>
  );
}

function ConnectionPill({ connection }: { connection: ActiveConnection }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-panel-2)]/60 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
      <span className="path-pulse" aria-hidden />
      {providerSlug(connection.provider)} · {installedViaSlug(connection.installedVia)}
    </span>
  );
}

function CapabilityFootnote({ connection }: { connection: ActiveConnection }) {
  if (connection.provider === "dashboard-only") {
    return (
      <p className="text-xs text-[var(--color-text-faint)] leading-relaxed">
        Findings stay in Rove. Switch to an external backlog any time — your
        triage history comes with you.
      </p>
    );
  }
  if (connection.provider === "github" && connection.installedVia === "connect_existing") {
    return (
      <p className="text-xs text-[var(--color-text-faint)] leading-relaxed">
        Connection recorded. Outbound finding push lands in{" "}
        <span className="font-mono text-[var(--color-text-muted)]">alpha.38c</span>{" "}
        — the sink will start using this destination on the next release.{" "}
        <span className="text-[var(--color-text-muted)]">
          Note: this connection was created against the alpha.38b repo shape;
          re-install once 38c ships the Project v2 picker.
        </span>
      </p>
    );
  }
  return null;
}

type ParsedDestination = {
  owner: string;
  name: string;
  url: string | null;
};

function parseDestination(connection: ActiveConnection): ParsedDestination | null {
  if (connection.provider === "dashboard-only") return null;
  const d = connection.destination;
  if (typeof d.owner === "string" && typeof d.repo === "string") {
    return {
      owner: String(d.owner),
      name: String(d.repo),
      url: typeof d.htmlUrl === "string" ? d.htmlUrl : null,
    };
  }
  if (typeof d.owner === "string" && typeof d.projectTitle === "string") {
    return {
      owner: String(d.owner),
      name: String(d.projectTitle),
      url: typeof d.projectUrl === "string" ? d.projectUrl : null,
    };
  }
  return null;
}

function providerLabel(p: ActiveConnection["provider"]): string {
  if (p === "github") return "GitHub";
  if (p === "linear") return "Linear";
  return "the dashboard";
}

function providerSlug(p: ActiveConnection["provider"]): string {
  if (p === "github") return "GITHUB";
  if (p === "linear") return "LINEAR";
  return "DASHBOARD";
}

function installedViaLabel(v: ActiveConnection["installedVia"]): string {
  if (v === "connect_existing") return "connect-to-existing";
  if (v === "managed_board") return "managed board";
  return "dashboard-only";
}

function installedViaSlug(v: ActiveConnection["installedVia"]): string {
  if (v === "connect_existing") return "CONNECT-EXISTING";
  if (v === "managed_board") return "MANAGED";
  return "DASHBOARD";
}
