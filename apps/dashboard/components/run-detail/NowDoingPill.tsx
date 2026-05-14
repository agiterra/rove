interface NowDoingPillProps {
  verb: string;
  target: string;
  timer: string;
}

export function NowDoingPill({ verb, target, timer }: NowDoingPillProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="lw-sweep relative inline-flex items-center gap-2.5 rounded-full overflow-hidden"
      style={{
        height: 40,
        padding: "0 18px 0 16px",
        background: "rgba(63,201,203,0.10)",
        border: "1px solid rgba(63,201,203,0.32)",
        color: "var(--color-text)",
        fontSize: 14,
        minWidth: 380,
        whiteSpace: "nowrap",
        boxShadow: "inset 0 1px 0 rgba(63,201,203,0.18)",
      }}
    >
      <span className="lw-dot lw-pulse" />
      <span className="text-[var(--color-text-muted)]">{verb}</span>
      <span className="font-mono" style={{ color: "#6ee2e4", fontSize: 13.5 }}>
        {target}
      </span>
      <span
        className="ml-auto pl-3.5 font-mono tabular-nums"
        style={{ color: "#6ee2e4", fontSize: 13.5 }}
      >
        {timer}
      </span>
    </div>
  );
}
