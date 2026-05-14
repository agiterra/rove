/**
 * Rove wordmark + glyph. Uses the brand-authored PNG asset at
 * /brand/Rove_Icon_NoFill.png — the gradient eye-pin glyph on
 * transparency, which sits cleanly on the dark dashboard.
 *
 * The inline SVG fallback used during early development has been retired.
 */
import Image from "next/image";

const SIZES = {
  sm: { glyph: 28, wordmark: 14 },
  md: { glyph: 36, wordmark: 16 },
  lg: { glyph: 56, wordmark: 22 },
} as const;

export function AppMark({ size = "md" }: { size?: keyof typeof SIZES }) {
  const dim = SIZES[size];
  return (
    <span className="inline-flex items-center gap-3 font-semibold tracking-tight">
      <Image
        src="/brand/Rove_Icon_NoFill.png"
        alt="Rove"
        width={dim.glyph}
        height={dim.glyph}
        className="shrink-0"
        priority
      />
      <span
        aria-hidden
        className="text-[var(--color-text)] uppercase tracking-[0.22em]"
        style={{ fontSize: dim.wordmark }}
      >
        rove
      </span>
    </span>
  );
}
