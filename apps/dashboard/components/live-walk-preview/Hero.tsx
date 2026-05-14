import { NowDoingPill } from "./NowDoingPill";
import { RUN_META, NOW_DOING } from "./mock-data";

export function Hero() {
  return (
    <section className="lw-hero">
      <div className="lw-hero-aurora" />
      <div className="lw-hero-streak" />
      <div className="lw-hero-edge" />
      <div className="relative z-[1] grid items-start gap-10" style={{ gridTemplateColumns: "1fr 460px" }}>
        <div>
          <p
            className="font-mono uppercase text-[var(--color-text-faint)] mb-4"
            style={{ fontSize: 11, letterSpacing: "0.18em" }}
          >
            RUN <span className="opacity-60">·</span> {RUN_META.flowId}{" "}
            <span className="opacity-60">·</span> {RUN_META.personaId}
          </p>
          <NowDoingPill
            verb={NOW_DOING.verb}
            target={NOW_DOING.target}
            timer={RUN_META.elapsedLabel}
          />
          <h1 className="font-semibold mt-[18px] mb-2.5" style={{ fontSize: 44, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
            Walking the app
          </h1>
          <p className="font-mono text-[15px] m-0 text-[var(--color-text-muted)]">
            Step 8 of an estimated 25
            <Sep />
            {RUN_META.elapsedLabel} elapsed
            <Sep />
            {RUN_META.remainingLabel} remaining budget
          </p>
        </div>

        <Metrics />
      </div>
    </section>
  );
}

function Sep() {
  return <span style={{ color: "#2b3454", margin: "0 6px" }}>·</span>;
}

function Metrics() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Metric>
        <Key icon={<Globe />} label="target URL" />
        <ValMono>
          <span className="text-[var(--color-text-faint)]">https://</span>
          <span>app.tankloop.com</span>
        </ValMono>
      </Metric>
      <Metric>
        <Key icon={<User />} label="persona" />
        <Val>{RUN_META.personaLabel}</Val>
      </Metric>
      <Metric>
        <Key icon={<Hash />} label="flow id" />
        <ValMono>{RUN_META.flowUuid}</ValMono>
      </Metric>
      <Metric>
        <Key icon={<Dot />} label="status" />
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[12.5px]"
          style={{
            background: "rgba(63,201,203,0.10)",
            border: "1px solid rgba(63,201,203,0.32)",
          }}
        >
          <span className="lw-dot lw-pulse" />
          <span>Walking</span>
        </span>
      </Metric>
    </div>
  );
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
