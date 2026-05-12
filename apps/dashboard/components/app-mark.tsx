/**
 * Eval-dashboard wordmark + glyph. The glyph is a glowing emerald pulse
 * inside a thin ring — reads as "agent / live / observability."
 */
export function AppMark({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? 16 : 18;
  return (
    <span className="inline-flex items-center gap-2.5 font-semibold tracking-tight">
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 18 18"
        aria-hidden="true"
        className="shrink-0"
      >
        <circle
          cx="9"
          cy="9"
          r="7.5"
          fill="none"
          stroke="var(--color-border-strong)"
          strokeWidth="1"
        />
        <circle cx="9" cy="9" r="3.25" fill="var(--color-accent)" />
        <circle
          cx="9"
          cy="9"
          r="3.25"
          fill="none"
          stroke="var(--color-accent)"
          strokeOpacity="0.35"
          strokeWidth="3.5"
        />
      </svg>
      <span>
        <span className="text-[var(--color-text)]">tankloop</span>
        <span className="text-[var(--color-text-faint)] mx-1">/</span>
        <span className="text-[var(--color-accent)]">eval</span>
      </span>
    </span>
  );
}
