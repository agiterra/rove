import type { ChangeDelta, DesignContract, RunDetail } from "./types";

const CONTRACT_ROWS: Array<{ key: keyof DesignContract; label: string }> = [
  { key: "layout_pattern", label: "layout" },
  { key: "primary_action_pattern", label: "primary action" },
  { key: "form_pattern", label: "form" },
  { key: "success_pattern", label: "success" },
  { key: "navigation_pattern", label: "navigation" },
  { key: "density", label: "density" },
  { key: "tone", label: "tone" },
];

const DELTA_LABEL: Record<string, string> = {
  "change.navigation_mismatch": "navigation mismatch",
  "change.intent_mismatch": "intent mismatch",
  "change.design_incoherence": "design incoherence",
  "change.pattern_drift": "pattern drift",
  "change.primary_action_confusion": "primary action confusion",
  "change.copy_mismatch": "copy mismatch",
};

export function ChangeReviewHero({ run }: { run: RunDetail }) {
  const deltas = run.deltas ?? [];
  const goalReached = run.goal_reached;
  return (
    <div className="surface-elevated px-7 py-8 md:px-10 md:py-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="eyebrow-lg">change review</p>
        <span className="text-[11px] text-[var(--color-text-faint)] font-mono">{run.persona_id}</span>
      </div>

      <div className="mt-5 flex flex-col gap-1.5">
        {(run.changed_routes ?? []).map((r) => (
          <span
            key={r}
            className="font-mono text-2xl md:text-[28px] text-[var(--color-text)] break-all leading-tight"
          >
            {r}
          </span>
        ))}
      </div>

      {run.reference_routes && run.reference_routes.length > 0 ? (
        <div className="mt-3 flex items-baseline gap-2 text-[11px] flex-wrap">
          <span className="eyebrow">reference</span>
          {run.reference_routes.map((r, i) => (
            <span key={r} className="font-mono text-[var(--color-text-muted)]">
              {r}
              {i < (run.reference_routes!.length - 1) ? (
                <span className="ml-2 text-[var(--color-text-faint)]">·</span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-10">
        <ChangeOutcome deltas={deltas.length} goalReached={goalReached} />
      </div>
      <div className="divider-grad mt-6 mb-5 max-w-md" />
      <div className="flex items-center gap-x-5 gap-y-2 flex-wrap text-sm">
        <span className="text-[var(--color-text-muted)]">
          <span className="font-semibold tabular-nums text-[var(--color-text)]">
            {deltas.length}
          </span>{" "}
          coherence delta{deltas.length === 1 ? "" : "s"}
        </span>
        {goalReached !== null ? (
          <span className="text-[var(--color-text-faint)]" aria-hidden="true">·</span>
        ) : null}
        {goalReached === true ? (
          <span className="text-[var(--color-accent)]">goal reachable ✓</span>
        ) : null}
        {goalReached === false ? (
          <span className="text-[var(--color-severity-critical)]">goal not reachable ✗</span>
        ) : null}
      </div>

      {run.summary ? (
        <p className="mt-7 text-sm text-[var(--color-text)] leading-relaxed max-w-3xl">
          {run.summary}
        </p>
      ) : null}
    </div>
  );
}

function ChangeOutcome({
  deltas,
  goalReached,
}: {
  deltas: number;
  goalReached: boolean | null;
}) {
  // The headline is whichever is more dramatic: an unreachable goal is the
  // strongest signal; otherwise the delta count.
  if (goalReached === false) {
    return (
      <span className="block text-[40px] md:text-[56px] font-semibold tracking-tight leading-none text-[var(--color-severity-critical)] glow-rose">
        Goal not reachable
      </span>
    );
  }
  if (deltas === 0 && goalReached === true) {
    return (
      <span className="block text-[40px] md:text-[56px] font-semibold tracking-tight leading-none text-[var(--color-accent)] glow-accent">
        Coherent ✓
      </span>
    );
  }
  const color =
    deltas >= 3
      ? "var(--color-severity-critical)"
      : deltas >= 1
        ? "var(--color-severity-major)"
        : "var(--color-text-muted)";
  const glow = deltas >= 3 ? "glow-rose" : "";
  return (
    <span
      className={`block text-[40px] md:text-[56px] font-semibold tracking-tight leading-none ${glow}`}
      style={{ color }}
    >
      {deltas} delta{deltas === 1 ? "" : "s"}
    </span>
  );
}

export function DesignContractSection({
  contract,
}: {
  contract: DesignContract | null;
}) {
  if (!contract) return null;
  const filled = CONTRACT_ROWS.filter((r) => typeof contract[r.key] === "string");
  if (filled.length === 0) return null;
  return (
    <section className="surface p-6 md:p-8">
      <SectionHeader title="local design contract" />
      <p className="text-xs text-[var(--color-text-faint)] mb-4">
        Inferred from the reference routes. Empty rows omitted (the reviewer doesn&apos;t guess).
      </p>
      <dl className="space-y-2">
        {filled.map((r) => {
          const value = contract[r.key] as string;
          const provenance = contract.derived_from?.[r.key as string];
          return (
            <div
              key={r.key}
              className="grid grid-cols-[8rem_1fr] gap-4 py-1.5 border-b border-[var(--color-border)] last:border-0"
            >
              <dt className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] pt-0.5">
                {r.label}
              </dt>
              <dd className="text-sm text-[var(--color-text)]">
                {value}
                {provenance ? (
                  <span className="ml-2 text-[10px] text-[var(--color-text-faint)] font-mono">
                    ← {provenance}
                  </span>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
      {contract.notes ? (
        <p className="mt-4 text-xs text-[var(--color-text-muted)] italic max-w-2xl">
          {contract.notes}
        </p>
      ) : null}
    </section>
  );
}

export function DeltasSection({ deltas }: { deltas: ChangeDelta[] | null }) {
  if (!deltas || deltas.length === 0) {
    return (
      <section className="surface p-6 md:p-8">
        <SectionHeader title="coherence deltas" />
        <p className="text-sm text-[var(--color-text-muted)] italic">
          No deltas — the changed route matches the local contract. Pair this with the goal
          status above; "zero deltas" only means coherent, not necessarily usable.
        </p>
      </section>
    );
  }
  return (
    <section className="surface p-6 md:p-8">
      <SectionHeader title={`coherence deltas (${deltas.length})`} />
      <ul className="space-y-3">
        {deltas.map((d, i) => (
          <li key={i}>
            <DeltaCard delta={d} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function DeltaCard({ delta }: { delta: ChangeDelta }) {
  const sev = delta.severity ?? "major";
  const sevColor = sevColorFor(sev);
  return (
    <div
      className="rounded-lg overflow-hidden kinetic-hover"
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${sevColor} 12%, transparent) 0%, color-mix(in srgb, ${sevColor} 5%, transparent) 100%)`,
        border: `1px solid color-mix(in srgb, ${sevColor} 40%, transparent)`,
      }}
    >
      <div
        className="px-5 py-2.5 flex items-baseline justify-between gap-3 border-b"
        style={{ borderColor: `color-mix(in srgb, ${sevColor} 25%, transparent)` }}
      >
        <div className="flex items-baseline gap-3">
          <span
            className="eyebrow"
            style={{ color: sevColor, letterSpacing: "0.18em" }}
          >
            {DELTA_LABEL[delta.kind] ?? delta.kind}
          </span>
          {delta.step_index !== undefined ? (
            <span className="text-[10px] font-mono text-[var(--color-text-faint)]">
              step {delta.step_index}
            </span>
          ) : null}
        </div>
        <span className="eyebrow" style={{ color: sevColor }}>
          {sev}
        </span>
      </div>
      <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        <div>
          <div className="eyebrow mb-1.5">expected</div>
          <p className="text-sm text-[var(--color-text)] leading-relaxed">{delta.expected}</p>
        </div>
        <div className="md:border-l md:pl-6" style={{ borderColor: `color-mix(in srgb, ${sevColor} 20%, transparent)` }}>
          <div className="eyebrow mb-1.5">observed</div>
          <p className="text-sm text-[var(--color-text)] leading-relaxed">{delta.observed}</p>
        </div>
      </div>
      <div
        className="px-5 py-3 border-t"
        style={{
          background: `color-mix(in srgb, ${sevColor} 4%, transparent)`,
          borderColor: `color-mix(in srgb, ${sevColor} 18%, transparent)`,
        }}
      >
        <p className="text-xs text-[var(--color-text-muted)] italic max-w-3xl leading-relaxed">
          {delta.why_it_matters}
        </p>
      </div>
    </div>
  );
}

function sevColorFor(severity: string): string {
  switch (severity) {
    case "critical":
      return "var(--color-severity-critical)";
    case "major":
      return "var(--color-severity-major)";
    case "minor":
      return "var(--color-severity-minor)";
    case "nit":
      return "var(--color-severity-nit)";
    default:
      return "var(--color-text-faint)";
  }
}

function SectionHeader({ title }: { title: string }) {
  return <h2 className="eyebrow-lg mb-5">{title}</h2>;
}
