/**
 * Presentational pieces for FlowWizard. No state of their own — pure UI.
 * No "use client" directive: this module is imported only by flow-wizard.tsx
 * (a client entry) and inherits its environment.
 */
import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { FLOW_TEMPLATES, type FlowTemplate } from "../../../lib/authoring/templates";
import { checkDaemonOnlineAction } from "./actions";

export type Tab = "template" | "ai";

/** Structured progress stages for AI generation — drives the progress card. */
export type GenerateStage = "idle" | "queuing" | "waiting" | "working";

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
  onCancel,
  stage,
  claimedBy,
  startedAt,
  daemonOnline,
  onDaemonOnline,
  projectId,
}: {
  prompt: string;
  onPromptChange: (s: string) => void;
  busy: boolean;
  onGenerate: () => void;
  onCancel: () => void;
  stage: GenerateStage;
  claimedBy: string | null;
  startedAt: number | null;
  daemonOnline: boolean;
  onDaemonOnline: () => void;
  projectId: string;
}) {
  const canGenerate = daemonOnline && prompt.trim().length > 0 && !busy;
  return (
    <div className="surface-raised p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="eyebrow-lg">Describe the flow</div>
        <DaemonStatusLabel online={daemonOnline} projectId={projectId} />
      </div>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="e.g. A dispatcher needs to bulk-reschedule all jobs on a truck for tomorrow when the truck is unexpectedly out of service."
        rows={4}
        className={textareaCls}
        disabled={busy}
      />
      {!busy && !daemonOnline ? (
        <DaemonLauncher projectId={projectId} onDetectOnline={onDaemonOnline} />
      ) : null}
      {busy ? (
        <GenerateProgress
          stage={stage}
          claimedBy={claimedBy}
          startedAt={startedAt}
          onCancel={onCancel}
        />
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate}
            className={`rounded-md text-sm px-4 py-2 font-medium transition-opacity ${
              canGenerate
                ? "bg-[var(--color-accent)] text-[var(--color-bg)] hover:opacity-90"
                : "bg-[var(--color-bg-2)] text-[var(--color-text-faint)] border border-[var(--color-border)] cursor-not-allowed"
            }`}
            title={
              !daemonOnline
                ? "No daemon online — start one with `rove daemon`"
                : prompt.trim().length === 0
                  ? "Type a description above first"
                  : undefined
            }
          >
            Generate flow
          </button>
          {!daemonOnline ? (
            <span className="text-[11px] text-[var(--color-text-faint)]">
              Generation needs a running daemon — see banner above.
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

const STAGE_LABEL: Record<Exclude<GenerateStage, "idle">, string> = {
  queuing: "Queuing the job",
  waiting: "Waiting for a daemon to pick it up",
  working: "Daemon is thinking",
};

const STAGE_DETAIL: Record<Exclude<GenerateStage, "idle">, string> = {
  queuing: "Writing a row into the agent jobs queue.",
  waiting: "Daemons on the team poll the queue every ~2s.",
  working: "A teammate's local Claude is drafting your flow YAML from your description.",
};

const STAGES: Array<Exclude<GenerateStage, "idle">> = ["queuing", "waiting", "working"];

function GenerateProgress({
  stage,
  claimedBy,
  startedAt,
  onCancel,
}: {
  stage: GenerateStage;
  claimedBy: string | null;
  startedAt: number | null;
  onCancel: () => void;
}) {
  const elapsed = useElapsedSeconds(startedAt);
  const activeIdx = stage === "idle" ? -1 : STAGES.indexOf(stage);
  const stuck = stage === "waiting" && elapsed >= 12;

  return (
    <div
      className="rounded-lg p-5 space-y-4"
      style={{
        background: "color-mix(in srgb, var(--color-accent) 6%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <PulseDot />
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--color-accent)" }}
          >
            {stage === "idle" ? "Starting…" : STAGE_LABEL[stage]}
          </span>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-[var(--color-text-faint)]">
          {formatElapsed(elapsed)}
        </span>
      </div>

      <ol className="space-y-2.5">
        {STAGES.map((s, i) => (
          <StageRow
            key={s}
            label={STAGE_LABEL[s]}
            detail={STAGE_DETAIL[s]}
            state={i < activeIdx ? "done" : i === activeIdx ? "active" : "pending"}
            sub={i === activeIdx && claimedBy ? `daemon ${claimedBy.slice(0, 8)}…` : undefined}
          />
        ))}
      </ol>

      {stuck ? (
        <div
          className="rounded-md border p-3 text-[12px] leading-relaxed"
          style={{
            background: "color-mix(in srgb, var(--color-severity-major) 8%, transparent)",
            borderColor: "color-mix(in srgb, var(--color-severity-major) 35%, transparent)",
          }}
        >
          <p className="text-[var(--color-text)] mb-1.5">
            Still waiting after {elapsed}s. No daemon has claimed the job yet.
          </p>
          <p className="text-[var(--color-text-muted)]">
            Either no one on the team is running <code className="font-mono">rove daemon</code>,
            or every daemon is busy. The job will time out at 90s.
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] underline-offset-2 hover:underline"
        >
          Cancel
        </button>
        <span className="text-[10px] text-[var(--color-text-faint)]">
          Cancelling here just stops watching the job — the daemon may still complete it.
        </span>
      </div>
    </div>
  );
}

function StageRow({
  label,
  detail,
  state,
  sub,
}: {
  label: string;
  detail: string;
  state: "pending" | "active" | "done";
  sub?: string;
}) {
  const color =
    state === "done"
      ? "var(--color-accent)"
      : state === "active"
        ? "var(--color-accent)"
        : "var(--color-text-faint)";
  const labelColor = state === "pending" ? "var(--color-text-faint)" : "var(--color-text)";
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="relative inline-flex h-4 w-4 mt-0.5 shrink-0 items-center justify-center"
      >
        {state === "active" ? (
          <>
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-50 animate-ping"
              style={{ background: color }}
            />
            <span
              className="relative inline-flex h-2.5 w-2.5 rounded-full"
              style={{ background: color }}
            />
          </>
        ) : state === "done" ? (
          <span
            className="text-[11px] font-bold"
            style={{ color }}
          >
            ✓
          </span>
        ) : (
          <span
            className="inline-flex h-2 w-2 rounded-full"
            style={{ background: color, opacity: 0.5 }}
          />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium" style={{ color: labelColor }}>
          {label}
          {sub ? (
            <span className="ml-2 text-[10px] font-mono text-[var(--color-text-faint)]">
              {sub}
            </span>
          ) : null}
        </div>
        <div className="text-[11px] text-[var(--color-text-faint)] leading-relaxed">{detail}</div>
      </div>
    </li>
  );
}

function PulseDot() {
  return (
    <span aria-hidden="true" className="relative inline-flex h-2 w-2">
      <span
        className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
        style={{ background: "var(--color-accent)" }}
      />
      <span
        className="relative inline-flex h-2 w-2 rounded-full"
        style={{ background: "var(--color-accent)" }}
      />
    </span>
  );
}

function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [startedAt]);
  if (startedAt === null) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function DaemonStatusLabel({ online, projectId }: { online: boolean; projectId: string }) {
  const color = online ? "var(--color-accent)" : "var(--color-severity-major)";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium"
      style={{ color }}
      title={`Daemon status for project ${projectId}`}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {online ? `daemon online · ${projectId}` : `no daemon for ${projectId}`}
    </span>
  );
}

function DaemonLauncher({
  projectId,
  onDetectOnline,
}: {
  projectId: string;
  onDetectOnline: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);

  // Elapsed-since-mount counter (purely cosmetic — gives the wait some life).
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Poll every 3s for a daemon claim. Server action avoids client-side RLS
  // quirks (dev-bypass has no session) and stays correct.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await checkDaemonOnlineAction(projectId);
        if (!cancelled && res.online) {
          onDetectOnline();
        }
      } catch {
        // Swallow — we'll try again on the next tick.
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId, onDetectOnline]);

  const command = "pnpm daemon";
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // user-denied / unsupported — show prompt fallback
      window.prompt("Copy this command:", command);
    }
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: "color-mix(in srgb, var(--color-severity-major) 6%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-severity-major) 35%, transparent)",
      }}
    >
      <div
        className="px-4 py-3 flex items-baseline justify-between gap-3 border-b"
        style={{ borderColor: "color-mix(in srgb, var(--color-severity-major) 25%, transparent)" }}
      >
        <span
          className="eyebrow flex items-center gap-2"
          style={{ color: "var(--color-severity-major)" }}
        >
          <PulseDotInline />
          start a daemon to enable generate
        </span>
        <span
          className="text-[10px] font-mono"
          style={{ color: "var(--color-severity-major)" }}
        >
          project · {projectId}
        </span>
      </div>

      <div className="px-4 py-4 space-y-3">
        <p className="text-[13px] text-[var(--color-text)] leading-relaxed">
          AI generation runs on a daemon process. Open a terminal at the project root and
          run:
        </p>

        <div
          className="flex items-stretch gap-2 rounded-md overflow-hidden"
          style={{
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
          }}
        >
          <code className="flex-1 px-3 py-2 font-mono text-[13px] text-[var(--color-text)] select-all">
            {command}
          </code>
          <button
            type="button"
            onClick={copy}
            className="px-3 inline-flex items-center gap-1.5 text-[11px] font-medium border-l text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-panel-2)]/60 transition-colors"
            style={{ borderColor: "var(--color-border)" }}
            aria-label="Copy command"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy
              </>
            )}
          </button>
        </div>

        <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
          A daemon claims only jobs stamped with its own project id — a daemon for{" "}
          <code className="font-mono">tankloop</code> won&apos;t pick up an{" "}
          <code className="font-mono">{projectId}</code> job, and vice versa.
        </p>

        <div
          className="flex items-center gap-2 pt-1.5 border-t"
          style={{ borderColor: "color-mix(in srgb, var(--color-text-faint) 25%, transparent)" }}
        >
          <span className="pt-2.5 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
            <span className="relative inline-flex h-2 w-2">
              <span
                className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
                style={{ background: "var(--color-severity-major)" }}
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ background: "var(--color-severity-major)" }}
              />
            </span>
            Watching for your daemon…
          </span>
          <span className="pt-2.5 text-[10px] font-mono tabular-nums text-[var(--color-text-faint)] ml-auto">
            {formatElapsedShort(elapsed)}
          </span>
        </div>
      </div>
    </div>
  );
}

function PulseDotInline() {
  return (
    <span aria-hidden="true" className="relative inline-flex h-1.5 w-1.5">
      <span
        className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
        style={{ background: "var(--color-severity-major)" }}
      />
      <span
        className="relative inline-flex h-1.5 w-1.5 rounded-full"
        style={{ background: "var(--color-severity-major)" }}
      />
    </span>
  );
}

function formatElapsedShort(seconds: number): string {
  if (seconds < 60) return `${seconds}s elapsed`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s elapsed`;
}

export function Field({
  label,
  schemaName,
  hint,
  errors,
  children,
}: {
  label: string;
  /** The underlying YAML / Zod key. Shown as muted monospace caption beside the human label. */
  schemaName?: string;
  hint?: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <label className="text-[13px] font-medium text-[var(--color-text)]">
          {label}
          {schemaName ? (
            <code className="ml-2 text-[10px] font-mono text-[var(--color-text-faint)] font-normal">
              {schemaName}
            </code>
          ) : null}
        </label>
      </div>
      {hint ? (
        <p className="text-[11px] text-[var(--color-text-muted)] mb-2 leading-relaxed">{hint}</p>
      ) : null}
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
