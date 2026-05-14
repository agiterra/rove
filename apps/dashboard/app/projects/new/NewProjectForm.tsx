"use client";

import { useState, useTransition } from "react";
import { createProjectAction } from "./actions";

export function NewProjectForm() {
  const [id, setId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createProjectAction(fd);
      if (result && result.ok === false) setError(result.error);
      // On success, server action issues a redirect — we don't reach here.
    });
  }

  // Auto-derive a default display name from the slug as the user types.
  function onSlugChange(v: string) {
    const cleaned = v.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
    setId(cleaned);
    if (!displayName) setDisplayName(cleaned);
  }

  const canSubmit = id.length >= 2 && displayName.length > 0 && !pending;

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6 flex flex-col gap-5"
    >
      <Field
        label="Project slug"
        hint="Lowercase letters / numbers / hyphens. Used in URLs and as the tenancy key on every row."
      >
        <input
          name="id"
          value={id}
          onChange={(e) => onSlugChange(e.target.value)}
          placeholder="my-project"
          required
          minLength={2}
          maxLength={40}
          pattern="[a-z][a-z0-9-]*"
          className="w-full rounded-md bg-[var(--color-panel-2)] border border-[var(--color-border)] focus-rove px-3 py-2 font-mono"
          style={{ fontSize: 14 }}
        />
      </Field>

      <Field label="Display name" hint="Shown in the project switcher and headers.">
        <input
          name="display_name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="My Project"
          required
          maxLength={80}
          className="w-full rounded-md bg-[var(--color-panel-2)] border border-[var(--color-border)] focus-rove px-3 py-2"
          style={{ fontSize: 14 }}
        />
      </Field>

      <Field
        label="Default target URL"
        hint="Optional. Pre-fills the target field on Run-walk wizards for this project."
      >
        <input
          type="url"
          name="default_target_url"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="https://app.example.com"
          className="w-full rounded-md bg-[var(--color-panel-2)] border border-[var(--color-border)] focus-rove px-3 py-2"
          style={{ fontSize: 14 }}
        />
      </Field>

      {error ? (
        <p
          className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-text-faint)]">
          {id ? `Will live at /runs?p=${id}` : "Pick a slug to preview the URL."}
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="focus-rove inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, var(--color-brand-cyan) 0%, var(--color-brand-navy) 100%)",
            color: "white",
          }}
        >
          {pending ? "Creating…" : "Create project"}
          {!pending ? <span aria-hidden>→</span> : null}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-[var(--color-text)]">{label}</span>
      <span className="text-xs text-[var(--color-text-faint)]">{hint}</span>
      {children}
    </label>
  );
}
