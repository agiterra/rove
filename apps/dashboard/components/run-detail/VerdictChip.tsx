import type { PlanVerdict } from "./types";

interface VerdictChipProps {
  verdict: PlanVerdict;
  /** Tooltip / aria-label augment. */
  whatRevised?: string | null;
}

export function VerdictChip({ verdict, whatRevised }: VerdictChipProps) {
  const { label, fg, bg, border } = STYLE[verdict];
  const title = whatRevised ? `${label}: ${whatRevised}` : label;
  return (
    <span
      title={title}
      aria-label={`Plan verdict: ${title}`}
      className="inline-flex items-center font-mono uppercase tracking-wider"
      style={{
        fontSize: 9,
        padding: "1px 6px",
        borderRadius: 4,
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        letterSpacing: "0.12em",
        lineHeight: 1.6,
      }}
    >
      {label}
    </span>
  );
}

type ChipStyle = { label: string; fg: string; bg: string; border: string };

const STYLE: Record<PlanVerdict, ChipStyle> = {
  match: {
    label: "match",
    fg: "var(--color-text-faint)",
    bg: "rgba(110, 226, 228, 0.06)",
    border: "rgba(110, 226, 228, 0.20)",
  },
  extension: {
    label: "extension",
    fg: "#fcd34d",
    bg: "rgba(252, 211, 77, 0.10)",
    border: "rgba(252, 211, 77, 0.32)",
  },
  surprise: {
    label: "surprise",
    fg: "#fb923c",
    bg: "rgba(251, 146, 60, 0.12)",
    border: "rgba(251, 146, 60, 0.36)",
  },
  deviation: {
    label: "deviation",
    fg: "#fca5b5",
    bg: "rgba(252, 165, 181, 0.12)",
    border: "rgba(252, 165, 181, 0.40)",
  },
};
