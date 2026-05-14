import type { PlanDelta, StepView } from "./types";

interface PlanVsRealityInlineDiffProps {
  step: StepView;
}

export function PlanVsRealityInlineDiff({ step }: PlanVsRealityInlineDiffProps) {
  const delta = step.planDelta;
  if (!delta || delta.verdict === "match") return null;

  return (
    <aside
      className="grid mt-4 gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-panel)] p-4"
      aria-label="Plan vs reality"
    >
      <header className="flex items-center gap-2">
        <p
          className="font-mono uppercase text-[var(--color-text-faint)]"
          style={{ fontSize: 11, letterSpacing: "0.18em" }}
        >
          PLAN VS REALITY
        </p>
        <VerdictBadge verdict={delta.verdict} />
      </header>
      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <DiffCol kind="expected" body={delta.expected ?? null} />
        <DiffCol kind="observed" body={delta.observed ?? null} />
      </div>
      {delta.whatRevised ? (
        <p
          className="text-[var(--color-text-muted)]"
          style={{ fontSize: 12.5, lineHeight: 1.55 }}
        >
          <span
            className="font-mono uppercase text-[var(--color-text-faint)] mr-1.5"
            style={{ fontSize: 10, letterSpacing: "0.16em" }}
          >
            REVISED
          </span>
          {delta.whatRevised}
        </p>
      ) : null}
    </aside>
  );
}

function DiffCol({ kind, body }: { kind: "expected" | "observed"; body: string | null }) {
  return (
    <div
      style={{
        background: "var(--color-panel-2)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "10px 12px",
      }}
    >
      <p
        className="font-mono uppercase mb-1.5 text-[var(--color-text-faint)]"
        style={{ fontSize: 10, letterSpacing: "0.16em" }}
      >
        {kind}
      </p>
      <p
        className="font-mono text-[var(--color-text)]"
        style={{ fontSize: 12.5, lineHeight: 1.45 }}
      >
        {body ?? <span className="text-[var(--color-text-faint)]">—</span>}
      </p>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: PlanDelta["verdict"] }) {
  const palette: Record<PlanDelta["verdict"], { fg: string; bg: string }> = {
    match: { fg: "var(--color-text-faint)", bg: "rgba(110,226,228,0.06)" },
    extension: { fg: "#fcd34d", bg: "rgba(252,211,77,0.10)" },
    surprise: { fg: "#fb923c", bg: "rgba(251,146,60,0.12)" },
    deviation: { fg: "#fca5b5", bg: "rgba(252,165,181,0.12)" },
  };
  const style = palette[verdict];
  return (
    <span
      className="inline-flex items-center font-mono uppercase"
      style={{
        fontSize: 10,
        letterSpacing: "0.14em",
        padding: "2px 8px",
        borderRadius: 4,
        color: style.fg,
        background: style.bg,
      }}
    >
      {verdict}
    </span>
  );
}
