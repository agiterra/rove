import { AppMark } from "@/components/app-mark";
import type { TopBarView } from "./types";

export function TopBar({ view }: { view: TopBarView }) {
  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-md"
      style={{
        background: "rgba(7,9,15,0.72)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="max-w-[1280px] mx-auto h-16 px-8 flex items-center gap-7">
        <AppMark size="sm" />
        <nav
          aria-label="Breadcrumb"
          className="ml-3 flex items-center gap-2.5 font-mono text-[13px] text-[var(--color-text-muted)]"
        >
          <span>Runs</span>
          <span className="text-[var(--color-text-faint)]">›</span>
          <span className="text-[var(--color-text)]">{view.runIdShort}</span>
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <Pill>
            <span className="text-[var(--color-text-faint)]">project:</span>
            <span className="text-[var(--color-text)]">{view.project}</span>
          </Pill>
          {view.userLabel ? (
            <Pill>
              <UserIcon />
              <span className="text-[var(--color-text)]">{view.userLabel}</span>
            </Pill>
          ) : null}
          {view.workerStatus === "online" ? (
            <Pill accent>
              <span className="lw-dot lw-pulse" />
              <span>Worker online</span>
            </Pill>
          ) : view.workerStatus === "offline" ? (
            <Pill>
              <span className="lw-dot lw-slate" />
              <span>Worker offline</span>
            </Pill>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function Pill({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-2 h-8 px-3.5 rounded-full text-[13px] whitespace-nowrap"
      style={{
        border: accent ? "1px solid rgba(63,201,203,0.32)" : "1px solid var(--color-border)",
        background: accent ? "rgba(63,201,203,0.08)" : "rgba(15,20,34,0.7)",
        color: accent ? "var(--color-text)" : "var(--color-text-muted)",
      }}
    >
      {children}
    </span>
  );
}

function UserIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={14}
      height={14}
      stroke="currentColor"
      strokeWidth={1.6}
      fill="none"
      className="text-[var(--color-text-faint)]"
      aria-hidden
    >
      <circle cx="8" cy="6" r="2.6" />
      <path d="M3 14c.6-2.4 2.6-3.5 5-3.5s4.4 1.1 5 3.5" />
    </svg>
  );
}
