import { MockBrowserShot } from "./MockBrowserShot";
import { FINDINGS } from "./mock-data";
import type { MockFinding } from "./mock-data";

const SEVERITY_LABEL: Record<MockFinding["severity"], string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
  nit: "Nit",
};

const SEVERITY_BAR: Record<MockFinding["severity"], string> = {
  critical: "bg-[var(--color-severity-critical)]",
  major: "bg-[var(--color-severity-major)]",
  minor: "bg-[var(--color-severity-minor)]",
  nit: "bg-[var(--color-severity-nit)]",
};

const SEVERITY_TEXT: Record<MockFinding["severity"], string> = {
  critical: "text-[var(--color-severity-critical)]",
  major: "text-[var(--color-severity-major)]",
  minor: "text-[var(--color-severity-minor)]",
  nit: "text-[var(--color-severity-nit)]",
};

export function FindingsStream() {
  return (
    <section aria-label="Findings filed during this walk" className="mt-10">
      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="eyebrow-lg">
            FINDINGS FILED THIS WALK · {FINDINGS.length}
          </p>
          <p className="mt-1.5 text-[13px] text-[var(--color-text-muted)]">
            Streaming in as the agent files them — no batch dump at the end.
          </p>
        </div>
        <a
          href="/findings"
          className="text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] focus-rove rounded-[6px] px-2 py-1 transition-colors"
        >
          Open in findings →
        </a>
      </div>

      <ol className="space-y-3 list-none">
        {FINDINGS.map((f) => (
          <li key={f.id}>
            <FindingCard finding={f} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function FindingCard({ finding }: { finding: MockFinding }) {
  return (
    <article className="relative surface-raised kinetic-hover overflow-hidden">
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-[3px] ${SEVERITY_BAR[finding.severity]}`}
      />
      <div className="pl-5 pr-3 py-3.5 flex items-center gap-4">
        <div className="flex flex-col gap-1 shrink-0 w-[88px]">
          <span
            className={`inline-flex items-center justify-center px-1.5 py-[3px] rounded-[4px] text-[10px] font-semibold uppercase tracking-[0.08em] ${SEVERITY_TEXT[finding.severity]} bg-[color-mix(in_srgb,currentColor_14%,transparent)] border border-[color-mix(in_srgb,currentColor_30%,transparent)] self-start`}
          >
            {SEVERITY_LABEL[finding.severity]}
          </span>
          <span className="text-[10px] font-mono text-[var(--color-text-faint)]">
            step #{finding.stepIndex.toString().padStart(2, "0")}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[14px] text-[var(--color-text)] truncate" title={finding.title}>
            {finding.title}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-[4px] bg-[var(--color-accent-soft)] px-1.5 py-[2px] font-mono text-[10.5px] text-[var(--color-accent)] border border-[color-mix(in_srgb,var(--color-accent)_25%,transparent)]">
              {finding.heuristic}
            </span>
            {finding.secondaryRef ? (
              <span className="inline-flex items-center rounded-[4px] bg-[var(--color-panel)] px-1.5 py-[2px] font-mono text-[10.5px] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                {finding.secondaryRef}
              </span>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 w-[112px] h-[64px] rounded-[8px] overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-2)]">
          <MockBrowserShot kind={finding.shotKind} label={finding.title} />
        </div>
      </div>
    </article>
  );
}
