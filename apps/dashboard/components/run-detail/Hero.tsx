import { NowDoingPill } from "./NowDoingPill";
import type { HeroView } from "./types";

export function Hero({ view }: { view: HeroView }) {
  // Bright cyan perimeter halo only while the walk is live; calmer for
  // completed / errored / paused walks. CSS default is 0.7; running
  // ramps it to 1.
  const glow = view.status === "running" ? 1 : 0.7;
  return (
    <section
      className="lw-hero"
      style={{ ["--lw-glow" as keyof React.CSSProperties]: glow } as React.CSSProperties}
    >
      <div className="lw-hero-aurora" />
      <div className="lw-hero-streak" />
      <div className="lw-hero-edge" />
      <div className="relative z-[1] grid items-start gap-10" style={{ gridTemplateColumns: "1fr 460px" }}>
        <div>
          <p
            className="font-mono uppercase text-[var(--color-text-faint)] mb-4"
            style={{ fontSize: 11, letterSpacing: "0.18em" }}
          >
            RUN <span className="opacity-60">·</span> {view.flowId}{" "}
            <span className="opacity-60">·</span> {view.personaId}
          </p>
          {view.nowDoing ? (
            <NowDoingPill verb={view.nowDoing.verb} target={view.nowDoing.target} timer={view.timerLabel} />
          ) : null}
          <h1
            className="font-semibold mt-[18px] mb-2.5"
            style={{
              fontSize: 44,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              ...(view.outcomeGlow === "accent"
                ? { textShadow: "0 0 24px rgba(63,201,203,0.45), 0 0 56px rgba(63,201,203,0.22)" }
                : view.outcomeGlow === "rose"
                  ? { textShadow: "0 0 24px rgba(244,63,94,0.45), 0 0 56px rgba(244,63,94,0.22)" }
                  : {}),
            }}
          >
            {view.headline}
          </h1>
          <p className="font-mono text-[15px] m-0 text-[var(--color-text-muted)]">
            {view.estimatedStepCount != null
              ? `Step ${view.stepCount} of an estimated ${view.estimatedStepCount}`
              : `${view.stepCount} step${view.stepCount === 1 ? "" : "s"}`}
            <Sep />
            {view.elapsedLabel} elapsed
            {view.remainingLabel ? (
              <>
                <Sep />
                {view.remainingLabel} remaining budget
              </>
            ) : null}
          </p>
        </div>

        <Metrics view={view} />
      </div>
    </section>
  );
}

function Sep() {
  return <span style={{ color: "#2b3454", margin: "0 6px" }}>·</span>;
}

function Metrics({ view }: { view: HeroView }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Metric>
        <Key icon={<Globe />} label="target URL" />
        <ValMono>
          {view.targetUrl.startsWith("https://") ? (
            <>
              <span className="text-[var(--color-text-faint)]">https://</span>
              <span>{view.targetUrl.slice(8)}</span>
            </>
          ) : (
            <span>{view.targetUrlHostPath}</span>
          )}
        </ValMono>
      </Metric>
      <Metric>
        <Key icon={<User />} label="persona" />
        <Val>{view.personaLabel}</Val>
      </Metric>
      <Metric>
        <Key icon={<Hash />} label="flow id" />
        <ValMono>{view.flowId}</ValMono>
      </Metric>
      <Metric>
        <Key icon={<Dot />} label="status" />
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[12.5px]"
          style={{
            background: pillBg(view.status),
            border: `1px solid ${pillBorder(view.status)}`,
          }}
        >
          <span className={`lw-dot ${view.statusPill.pulsing ? "lw-pulse" : ""} ${dotClass(view.status)}`} />
          <span>{view.statusPill.label}</span>
        </span>
      </Metric>
    </div>
  );
}

function pillBg(status: HeroView["status"]): string {
  if (status === "errored") return "rgba(244,63,94,0.10)";
  return "rgba(63,201,203,0.10)";
}
function pillBorder(status: HeroView["status"]): string {
  if (status === "errored") return "rgba(244,63,94,0.32)";
  return "rgba(63,201,203,0.32)";
}
function dotClass(status: HeroView["status"]): string {
  if (status === "errored") return "lw-rose";
  return "";
}

function Metric({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl px-3.5 py-3.5 backdrop-blur"
      style={{
        background: "rgba(20,26,42,0.55)",
        border: "1px solid var(--color-border)",
      }}
    >
      {children}
    </div>
  );
}

function Key({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      className="font-mono text-[var(--color-text-faint)] mb-2 flex items-center gap-1.5"
      style={{ fontSize: 12, lineHeight: 1, whiteSpace: "nowrap" }}
    >
      <span aria-hidden className="inline-block" style={{ width: 13, height: 13 }}>
        {icon}
      </span>
      <span>{label}</span>
    </div>
  );
}

function Val({ children }: { children: React.ReactNode }) {
  return (
    <span className="block truncate text-[14px] text-[var(--color-text)]" style={{ lineHeight: 1.2 }}>
      {children}
    </span>
  );
}

function ValMono({ children }: { children: React.ReactNode }) {
  return (
    <span className="block truncate font-mono text-[var(--color-text)]" style={{ fontSize: 12.5, lineHeight: 1.2 }}>
      {children}
    </span>
  );
}

function Globe() {
  return (
    <svg viewBox="0 0 16 16" width="100%" height="100%" strokeWidth={1.6} fill="none" stroke="currentColor">
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" />
    </svg>
  );
}
function User() {
  return (
    <svg viewBox="0 0 16 16" width="100%" height="100%" strokeWidth={1.6} fill="none" stroke="currentColor">
      <circle cx="8" cy="6" r="2.6" />
      <path d="M3 14c.6-2.4 2.6-3.5 5-3.5s4.4 1.1 5 3.5" />
    </svg>
  );
}
function Hash() {
  return (
    <svg viewBox="0 0 16 16" width="100%" height="100%" strokeWidth={1.6} fill="none" stroke="currentColor">
      <path d="M6 2L4 14M12 2l-2 12M2 6h12M2 10h12" />
    </svg>
  );
}
function Dot() {
  return (
    <svg viewBox="0 0 16 16" width="100%" height="100%" strokeWidth={1.6} fill="none" stroke="currentColor">
      <circle cx="8" cy="8" r="3" />
    </svg>
  );
}
