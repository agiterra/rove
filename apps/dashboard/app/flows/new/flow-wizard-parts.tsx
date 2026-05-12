/**
 * Presentational pieces for FlowWizard. No state of their own — pure UI.
 * No "use client" directive: this module is imported only by flow-wizard.tsx
 * (a client entry) and inherits its environment.
 */
import { FLOW_TEMPLATES, type FlowTemplate } from "../../../lib/authoring/templates";

export type Tab = "template" | "ai";

export const inputCls =
  "w-full rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--color-accent)]";
export const textareaCls =
  "w-full rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-accent)]";

export function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div role="tablist" className="flex border-b border-[var(--color-border)]">
      <TabButton active={tab === "template"} onClick={() => onChange("template")}>
        From template
      </TabButton>
      <TabButton active={tab === "ai"} onClick={() => onChange("ai")}>
        From description
      </TabButton>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
        active
          ? "border-[var(--color-accent)] text-[var(--color-text)]"
          : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      }`}
    >
      {children}
    </button>
  );
}

export function TemplatePanel({
  picked,
  onPick,
}: {
  picked: string | null;
  onPick: (t: FlowTemplate) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3" role="tabpanel">
      {FLOW_TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t)}
          aria-pressed={picked === t.id}
          className={`text-left bg-[var(--color-panel)] border rounded-xl p-4 transition-colors ${
            picked === t.id
              ? "border-[var(--color-accent)]"
              : "border-[var(--color-border)] hover:border-[var(--color-accent)]/40"
          }`}
        >
          <div className="font-medium text-sm">
            <span className="mr-2">{t.emoji}</span>
            {t.label}
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">{t.description}</p>
        </button>
      ))}
    </div>
  );
}

export function AiPanel({
  prompt,
  onPromptChange,
  busy,
  onGenerate,
  status,
}: {
  prompt: string;
  onPromptChange: (s: string) => void;
  busy: boolean;
  onGenerate: () => void;
  status?: string | null;
}) {
  return (
    <div className="bg-[var(--color-panel)] border border-dashed border-[var(--color-border)] rounded-xl p-4 space-y-3">
      <div className="text-[11px] tracking-wider uppercase text-[var(--color-text-muted)] font-semibold">
        ✨ Describe the flow
      </div>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="e.g. Dispatcher needs to bulk-reschedule all jobs on a truck for tomorrow when the truck is unexpectedly out of service."
        rows={4}
        className={textareaCls}
        disabled={busy}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy || !prompt.trim()}
          className="rounded-md border border-[var(--color-accent)]/60 text-[var(--color-accent)] text-sm px-3 py-1.5 disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate"}
        </button>
        {status ? <span className="text-xs text-[var(--color-text-muted)]">{status}</span> : null}
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        Generation runs on a teammate's local Claude session — needs{" "}
        <code className="font-mono">tankloop-eval daemon</code> running somewhere on the team.
      </p>
    </div>
  );
}

export function Field({
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
