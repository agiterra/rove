"use client";

import { useState, useTransition } from "react";
import { personaDraftSchema, type PersonaDraft } from "../../../lib/authoring/schemas";
import { waitForJobResult } from "../../../lib/authoring/wait-for-job";
import {
  queuePersonaGenerationAction,
  submitPersonaDraftAction,
  type ActionOutcome,
} from "./actions";

const EMPTY: PersonaDraft = {
  persona_id: "",
  expertise: "medium",
  shortcuts_allowed: false,
  hovers_allowed: true,
  retries_per_step: 1,
  prompt_addendum: "",
};

export function PersonaWizard() {
  const [draft, setDraft] = useState<PersonaDraft>(EMPTY);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, startAiTransition] = useTransition();
  const [submitBusy, startSubmitTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});

  function update<K extends keyof PersonaDraft>(k: K, v: PersonaDraft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function handleResult<T>(result: ActionOutcome<T>, onOk: (data: T) => void) {
    if (result.ok) {
      onOk(result.data);
    } else {
      setError(result.error);
      if ("fieldErrors" in result && result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      }
    }
  }

  const [aiStatus, setAiStatus] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    setAiStatus("Queuing job…");
    startAiTransition(async () => {
      const queued = await queuePersonaGenerationAction(aiPrompt);
      if (!queued.ok) {
        setAiStatus(null);
        setError(queued.error);
        return;
      }
      setAiStatus("Waiting for daemon…");
      try {
        const result = await waitForJobResult(queued.data.id, {
          onStatus: (s, claimedBy) => {
            if (s === "claimed" || s === "running") {
              setAiStatus(`Daemon working${claimedBy ? ` (${claimedBy.slice(0, 8)})` : ""}…`);
            }
          },
        });
        const parsed = personaDraftSchema.safeParse(result);
        if (!parsed.success) {
          setError(
            `Daemon returned invalid output: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`,
          );
          setAiStatus(null);
          return;
        }
        setDraft(parsed.data);
        setAiStatus(null);
      } catch (e) {
        setError((e as Error).message);
        setAiStatus(null);
      }
    });
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    startSubmitTransition(async () => {
      const result = await submitPersonaDraftAction(draft);
      handleResult(result, (pr) => {
        window.location.href = pr.prUrl;
      });
    });
  }

  return (
    <div className="space-y-6">
      <div className="bg-[var(--color-panel)] border border-dashed border-[var(--color-border)] rounded-xl p-4 space-y-3">
        <div className="text-[11px] tracking-wider uppercase text-[var(--color-text-muted)] font-semibold">
          ✨ Describe the persona
        </div>
        <textarea
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder="e.g. A brand-new dispatcher who has used the app twice. They don't poke around — they want the obvious affordance to work and will give up after one retry."
          rows={4}
          className={textareaCls}
          disabled={aiBusy}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={aiBusy || !aiPrompt.trim()}
            className="rounded-md border border-[var(--color-accent)]/60 text-[var(--color-accent)] text-sm px-3 py-1.5 disabled:opacity-50"
          >
            {aiBusy ? "Generating…" : "Generate"}
          </button>
          {aiStatus ? (
            <span className="text-xs text-[var(--color-text-muted)]">{aiStatus}</span>
          ) : null}
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          Generation runs on a teammate's local Claude session — needs{" "}
          <code className="font-mono">tankloop-eval daemon</code> running somewhere on the team.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="persona_id"
          hint="snake_case, starts with a letter. e.g. dispatcher_novice"
          errors={fieldErrors.persona_id}
        >
          <input
            value={draft.persona_id}
            onChange={(e) => update("persona_id", e.target.value)}
            placeholder="dispatcher_novice"
            className={inputCls}
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="expertise" errors={fieldErrors.expertise}>
            <select
              value={draft.expertise}
              onChange={(e) => update("expertise", e.target.value as PersonaDraft["expertise"])}
              className={inputCls}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </Field>
          <Field label="retries_per_step" errors={fieldErrors.retries_per_step}>
            <input
              type="number"
              min={0}
              max={5}
              value={draft.retries_per_step}
              onChange={(e) => update("retries_per_step", Number(e.target.value))}
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Toggle
            label="shortcuts_allowed"
            checked={draft.shortcuts_allowed}
            onChange={(v) => update("shortcuts_allowed", v)}
          />
          <Toggle
            label="hovers_allowed"
            checked={draft.hovers_allowed}
            onChange={(v) => update("hovers_allowed", v)}
          />
        </div>

        <Field
          label="prompt_addendum"
          hint="Second-person, written AS IF telling the agent who to be."
          errors={fieldErrors.prompt_addendum}
        >
          <textarea
            value={draft.prompt_addendum}
            onChange={(e) => update("prompt_addendum", e.target.value)}
            placeholder="You have used this app twice. You do not poke around."
            rows={4}
            className={textareaCls}
            required
          />
        </Field>

        {error ? (
          <div className="bg-red-950/30 border border-red-800/40 text-red-200 rounded-md p-3 text-sm">
            {error}
          </div>
        ) : null}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitBusy}
            className="rounded-md bg-[var(--color-text)] text-[var(--color-bg)] font-medium px-4 py-2 disabled:opacity-50"
          >
            {submitBusy ? "Opening PR…" : "Open PR"}
          </button>
          <p className="text-xs text-[var(--color-text-muted)]">
            We'll create a draft PR — nothing lands until a teammate reviews + merges.
          </p>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--color-accent)]";
const textareaCls =
  "w-full rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-accent)]";

function Field({
  label,
  hint,
  errors,
  children,
}: {
  label: string;
  hint?: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-[11px] tracking-wider uppercase text-[var(--color-text-muted)] font-semibold">
          {label}
        </label>
        {hint ? <span className="text-xs text-[var(--color-text-muted)]">{hint}</span> : null}
      </div>
      {children}
      {errors?.length ? (
        <ul className="mt-1 text-xs text-red-300">
          {errors.map((e, i) => (
            <li key={i}>· {e}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between bg-[var(--color-panel)] border border-[var(--color-border)] rounded-md px-3 py-2 text-sm cursor-pointer">
      <span className="text-[11px] tracking-wider uppercase text-[var(--color-text-muted)] font-semibold">
        {label}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--color-accent)]"
      />
    </label>
  );
}
