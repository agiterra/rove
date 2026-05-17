"use client";

import { useEffect, useState } from "react";

interface Project {
  nodeId: string;
  number: number;
  title: string;
  url: string;
}

interface Props {
  /** Form field name — the resolved URL gets posted under this key. */
  name: string;
  /** GitHub owner (org slug) to enumerate projects for. */
  owner: string;
  /** Initial value; used as the dropdown default + custom-mode prefill. */
  defaultValue?: string;
  /** Render an "(none)" option at the top — for the managed-board template field. */
  allowNone?: boolean;
  /** Label for the "(none)" option. Defaults to "No template — fields only". */
  noneLabel?: string;
  /** When true the field is required (no `(none)` option even if allowNone). */
  required?: boolean;
}

type ListResponse =
  | { ok: true; projects: Project[] }
  | { ok: false; error: string };

export function ProjectV2Picker({
  name,
  owner,
  defaultValue = "",
  allowNone = false,
  noneLabel = "No template — fields only",
  required = false,
}: Props) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"dropdown" | "custom">("dropdown");
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(
      `/api/backlog/github/projects?owner=${encodeURIComponent(owner)}&ownerType=organization`,
    )
      .then((r) => r.json() as Promise<ListResponse>)
      .then((data) => {
        if (cancelled) return;
        if (data.ok) {
          setProjects(data.projects);
          // If defaultValue doesn't match any listed project, fall into
          // custom mode so the user sees the override they were given.
          const matchesListed = data.projects.some((p) => p.url === defaultValue);
          if (defaultValue && !matchesListed) setMode("custom");
        } else {
          setError(data.error);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [owner, defaultValue]);

  if (mode === "custom") {
    return (
      <div className="flex flex-col gap-1.5">
        <input
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required={required}
          placeholder={`https://github.com/orgs/${owner}/projects/N`}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-md bg-[var(--color-panel)] border border-[var(--color-border-strong)] focus-rove px-3 py-2 font-mono"
          style={{ fontSize: 12 }}
        />
        <button
          type="button"
          onClick={() => {
            setMode("dropdown");
            setValue("");
          }}
          className="text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] text-left"
        >
          ← Back to project list
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <select
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required={required && !allowNone}
        disabled={loading}
        className="w-full rounded-md bg-[var(--color-panel)] border border-[var(--color-border-strong)] focus-rove px-3 py-2"
        style={{ fontSize: 12 }}
      >
        {loading ? (
          <option value="">Loading projects on {owner}…</option>
        ) : error ? (
          <option value="">Couldn't load — use custom URL</option>
        ) : (
          <>
            {allowNone ? <option value="">{noneLabel}</option> : null}
            {projects && projects.length > 0 ? (
              projects.map((p) => (
                <option key={p.nodeId} value={p.url}>
                  #{p.number} · {p.title}
                </option>
              ))
            ) : (
              <option value="" disabled>
                No accessible projects on {owner}
              </option>
            )}
          </>
        )}
      </select>
      {error ? (
        <p className="text-[11px] text-rose-200" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => setMode("custom")}
        className="text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] text-left"
      >
        Use a custom URL →
      </button>
    </div>
  );
}
