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
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="space-y-5 max-w-2xl">
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
          </div>

          <NowDoingPill
            verb={NOW_DOING.verb}
            target={NOW_DOING.target}
            timer={formatElapsed(Math.floor(RUN_META.elapsedSeconds))}
          />
        </div>

        <HeroMetricGrid />

        <div className="divider-grad mt-10" aria-hidden />
      </div>
    </section>
  );
}

function HeroMetricGrid() {
  return (
    <div className="mt-9 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-5">
      <MetricItem
        eyebrow="Target URL"
        value={RUN_META.targetUrl.replace(/^https?:\/\//, "")}
        mono
      />
      <MetricItem eyebrow="Persona" value={RUN_META.personaId} mono />
      <MetricItem eyebrow="Flow ID" value={RUN_META.flowId} mono />
      <StatusItem />
    </div>
  );
}

function MetricItem({
  eyebrow,
  value,
  mono = false,
}: {
  eyebrow: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="border-l border-[var(--color-border)] pl-4 min-w-0">
      <p className="eyebrow mb-1.5">{eyebrow}</p>
      <p
        className={`text-[12.5px] text-[var(--color-text)] truncate ${
          mono ? "font-mono" : ""
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function StatusItem() {
  return (
    <div className="border-l border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))] pl-4">
      <p className="eyebrow mb-1.5 text-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-text-faint))]">
        Status
      </p>
      <p className="flex items-center gap-2 text-[12.5px] text-[var(--color-text)]">
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="absolute inset-0 rounded-full bg-[var(--color-accent)] opacity-75 animate-livedot-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
        </span>
        Walking…
      </p>
    </div>
  );
}
