"use client";

import { useState, useTransition } from "react";
import { updateSyncPolicyAction } from "./actions";
import type { SyncPolicy } from "@/lib/backlog/types";

type MajorOpt = SyncPolicy["major"];
type MinorOpt = SyncPolicy["minor"];

interface Props {
  projectId: string;
  initialPolicy: SyncPolicy;
}

export function SyncPolicyEditor({ projectId, initialPolicy }: Props) {
  const [policy, setPolicy] = useState<SyncPolicy>(initialPolicy);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = !shallowEqual(policy, initialPolicy);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateSyncPolicyAction(projectId, policy);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2200);
      }
    });
  }

  function reset() {
    setPolicy(initialPolicy);
    setError(null);
    setSaved(false);
  }

  return (
    <section
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6 flex flex-col gap-5"
      aria-labelledby="sync-policy-heading"
    >
      <header className="flex flex-col gap-1.5">
        <p
          className="font-mono uppercase text-[var(--color-text-faint)]"
          style={{ fontSize: 10.5, letterSpacing: "0.18em" }}
        >
          SYNC POLICY <span className="opacity-50">·</span> WHO GOES AUTO
        </p>
        <h3 id="sync-policy-heading" className="text-lg font-semibold tracking-tight">
          Which findings file themselves
        </h3>
        <p className="text-xs text-[var(--color-text-muted)] max-w-2xl">
          Walks file findings with a severity the persona assigned. The policy
          below decides which severities push to your backlog automatically
          versus waiting for a manual <em>Send to backlog</em> click.
        </p>
      </header>

      <div className="grid gap-3">
        <SeverityRow
          label="Critical"
          color="critical"
          help="Blocks the user from completing the goal."
          value={policy.critical}
          options={[
            { value: "auto", label: "Auto" },
            { value: "manual", label: "Manual only" },
          ]}
          onChange={(v) => setPolicy({ ...policy, critical: v as SyncPolicy["critical"] })}
        />
        <SeverityRow
          label="Major"
          color="major"
          help="Significant friction; user can complete with effort."
          value={policy.major}
          options={[
            { value: "auto", label: "Auto on every flow" },
            { value: "auto-canonical", label: "Auto on canonical flows" },
            { value: "manual", label: "Manual only" },
          ]}
          onChange={(v) => setPolicy({ ...policy, major: v as MajorOpt })}
        />
        <SeverityRow
          label="Minor"
          color="minor"
          help="Nuisance; doesn't block."
          value={policy.minor}
          options={[
            { value: "auto", label: "Auto on every flow" },
            { value: "auto-canonical", label: "Auto on canonical flows" },
            { value: "manual", label: "Manual only" },
          ]}
          onChange={(v) => setPolicy({ ...policy, minor: v as MinorOpt })}
        />
        <SeverityRow
          label="Nit"
          color="nit"
          help="Stylistic / cosmetic."
          value={policy.nit}
          options={[
            { value: "auto", label: "Auto on every flow" },
            { value: "auto-canonical", label: "Auto on canonical flows" },
            { value: "manual", label: "Manual only" },
          ]}
          onChange={(v) => setPolicy({ ...policy, nit: v as MinorOpt })}
        />
      </div>

      <div className="flex flex-col gap-2.5 border-t border-[var(--color-border)] pt-4">
        <Toggle
          label="Agent-readiness boost"
          help="agent.* heuristics auto-sync down to minor on canonical flows — protects the product wedge from being buried."
          checked={policy.agent_readiness_boost}
          onChange={(v) => setPolicy({ ...policy, agent_readiness_boost: v })}
        />
        <Toggle
          label="Recurrence comment"
          help="When a finding re-fires, add a comment on the existing card instead of rewriting the body."
          checked={policy.recurrence_comment}
          onChange={(v) => setPolicy({ ...policy, recurrence_comment: v })}
        />
      </div>

      <footer className="flex items-center justify-between gap-3 pt-1">
        <div className="text-[11px] text-[var(--color-text-faint)] min-h-[16px]">
          {error ? (
            <span role="alert" className="text-rose-200">
              {error}
            </span>
          ) : saved ? (
            <span className="text-[var(--color-accent)]">Saved.</span>
          ) : dirty ? (
            <span>Unsaved changes.</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            disabled={!dirty || pending}
            className="focus-rove rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs disabled:opacity-50"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="focus-rove rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, var(--color-brand-cyan) 0%, var(--color-brand-navy) 100%)",
              color: "white",
            }}
          >
            {pending ? "Saving…" : "Save policy"}
          </button>
        </div>
      </footer>
    </section>
  );
}

function SeverityRow({
  label,
  color,
  help,
  value,
  options,
  onChange,
}: {
  label: string;
  color: "critical" | "major" | "minor" | "nit";
  help: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-2)]/40 px-4 py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <SeverityDot color={color} />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-[11px] text-[var(--color-text-faint)] truncate">{help}</span>
        </div>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-rove rounded-md bg-[var(--color-panel)] border border-[var(--color-border-strong)] px-3 py-1.5 text-xs"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Toggle({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-[var(--color-brand-cyan)]"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[11px] text-[var(--color-text-faint)]">{help}</span>
      </span>
    </label>
  );
}

function SeverityDot({ color }: { color: "critical" | "major" | "minor" | "nit" }) {
  return (
    <span
      aria-hidden
      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
      style={{ background: `var(--color-severity-${color})` }}
    />
  );
}

function shallowEqual(a: SyncPolicy, b: SyncPolicy): boolean {
  return (
    a.critical === b.critical &&
    a.major === b.major &&
    a.minor === b.minor &&
    a.nit === b.nit &&
    a.agent_readiness_boost === b.agent_readiness_boost &&
    a.recurrence_comment === b.recurrence_comment
  );
}
