/**
 * Rove wordmark + glyph. The glyph is a stylized eye / pin: a circle
 * with a smaller eye cap and a flowing tail — the embodiment of
 * "wander, observe, report." Inline SVG so it stays crisp at any size
 * and theme-able via CSS vars.
 */
export function AppMark({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? 18 : 22;
  return (
    <span className="inline-flex items-center gap-2.5 font-semibold tracking-tight">
      <svg width={dim} height={dim} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
        <defs>
          <linearGradient id="rove-mark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-cyan)" />
            <stop offset="100%" stopColor="var(--color-brand-navy)" />
          </linearGradient>
        </defs>
        {/* Head — circle with eye notch */}
        <path
          d="M12 2c4.97 0 9 4.03 9 9 0 3.86-2.44 7.16-5.86 8.45L12 24l-3.14-4.55C5.44 18.16 3 14.86 3 11c0-4.97 4.03-9 9-9z"
          fill="url(#rove-mark)"
        />
        {/* Eye dot */}
        <circle cx="12" cy="10.5" r="2.6" fill="var(--color-bg)" />
        <circle cx="12" cy="10.5" r="1.3" fill="var(--color-text)" />
      </svg>
      <span className="text-[var(--color-text)] uppercase tracking-[0.18em] text-[13px]">rove</span>
    </span>
  );
}
