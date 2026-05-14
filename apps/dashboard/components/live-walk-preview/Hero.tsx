import { NowDoingPill } from "./NowDoingPill";
import { RUN_META, NOW_DOING } from "./mock-data";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function Hero() {
  const remaining = Math.max(0, RUN_META.budgetSecondsMax - RUN_META.elapsedSeconds);
  return (
    <section className="aurora">
      <div className="surface-elevated p-8 md:p-10 relative overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-8">
          <div className="space-y-5">
            <p className="eyebrow-lg">
              RUN <span className="opacity-60">·</span> {RUN_META.flowId}{" "}
              <span className="opacity-60">·</span> {RUN_META.personaId}
            </p>
            <div className="space-y-3">
              <h1 className="text-[40px] md:text-[44px] leading-[1.05] font-semibold tracking-[-0.01em]">
                Walking the app
              </h1>
              <p className="text-[15px] text-[var(--color-text-muted)] max-w-xl">
                Step {8} of an estimated {RUN_META.budgetStepsMax}{" "}
                <span className="text-[var(--color-text-faint)]">·</span>{" "}
                {formatElapsed(RUN_META.elapsedSeconds)} elapsed{" "}
                <span className="text-[var(--color-text-faint)]">·</span>{" "}
                {formatElapsed(remaining)} budget remaining
              </p>
            </div>
            <NowDoingPill
              verb={NOW_DOING.verb}
              target={NOW_DOING.target}
              timer={formatElapsed(Math.floor(RUN_META.elapsedSeconds))}
            />
          </div>

          <HeroMetricGrid />
        </div>

        <div className="divider-grad mt-10" aria-hidden />
      </div>
    </section>
  );
}

function HeroMetricGrid() {
  return (
    <div className="grid grid-cols-2 gap-2.5 self-start">
      <MetricTile
        eyebrow="Target"
        value={RUN_META.targetUrl.replace(/^https?:\/\//, "")}
        mono
      />
      <MetricTile eyebrow="Persona" value={RUN_META.personaId} mono />
      <MetricTile eyebrow="Flow" value={RUN_META.flowId} mono />
      <StatusTile />
    </div>
  );
}

function MetricTile({
  eyebrow,
  value,
  mono = false,
}: {
  eyebrow: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-panel)]/60 px-3 py-2.5">
      <p className="eyebrow text-[9px] mb-1">{eyebrow}</p>
      <p
        className={`text-[12px] text-[var(--color-text)] truncate ${
          mono ? "font-mono" : ""
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function StatusTile() {
  return (
    <div className="rounded-[12px] border border-[color-mix(in_srgb,var(--color-accent)_30%,var(--color-border))] bg-[var(--color-accent-soft)] px-3 py-2.5">
      <p className="eyebrow text-[9px] mb-1 text-[color-mix(in_srgb,var(--color-accent)_60%,var(--color-text-faint))]">
        Status
      </p>
      <p className="flex items-center gap-2 text-[12px] text-[var(--color-text)]">
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="absolute inset-0 rounded-full bg-[var(--color-accent)] opacity-75 animate-livedot-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
        </span>
        Walking…
      </p>
    </div>
  );
}
