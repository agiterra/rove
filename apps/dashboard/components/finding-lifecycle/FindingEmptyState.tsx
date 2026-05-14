import type { EmptyStateSurface } from "./types";

interface FindingEmptyStateProps {
  surface: EmptyStateSurface;
  projectId: string;
}

interface Copy {
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: (projectId: string) => string;
}

const COPY_BY_SURFACE: Record<EmptyStateSurface, Copy> = {
  affordance_gaps: {
    eyebrow: "No gaps yet",
    title: "Nothing missing was filed against this project",
    body: "Affordance-gap findings appear when a walker enumerates expected affordances and one isn't present. Run a walk to start collecting them.",
    ctaLabel: "Run a walk",
    ctaHref: (p) => `/runs?p=${p}&run=new`,
  },
  expectation_match: {
    eyebrow: "No mismatches",
    title: "Every walker expectation was met",
    body: "Expectation-match findings appear when a walker's pre-flight plan diverges from what it observed. Run more walks to surface the gaps.",
    ctaLabel: "Run a walk",
    ctaHref: (p) => `/runs?p=${p}&run=new`,
  },
  findings: {
    eyebrow: "Nothing here",
    title: "No findings match your filters",
    body: "Try widening the lens or run a fresh walk to file new findings.",
    ctaLabel: "Run a walk",
    ctaHref: (p) => `/runs?p=${p}&run=new`,
  },
  gaps_rollup: {
    eyebrow: "Nothing rolling up",
    title: "No silenced or open gaps in this window",
    body: "The rollup combines open gaps and silenced ones so you can audit dismissals. Both are empty.",
    ctaLabel: "View all findings",
    ctaHref: (p) => `/findings?p=${p}`,
  },
  trend: {
    eyebrow: "Quiet stretch",
    title: "No findings in the selected window",
    body: "Either nothing was filed, or every finding in the window was silenced. Widen the window or change the heuristic prefix.",
    ctaLabel: "View all findings",
    ctaHref: (p) => `/findings?p=${p}`,
  },
};

export function FindingEmptyState({ surface, projectId }: FindingEmptyStateProps) {
  const copy = COPY_BY_SURFACE[surface];
  return (
    <div
      data-rove-empty
      data-rove-surface={surface}
      className="grid place-items-center text-center"
      style={{
        background: "var(--color-panel)",
        border: "1px dashed var(--color-border-strong)",
        borderRadius: 12,
        padding: "40px 28px",
        gap: 14,
      }}
    >
      <span
        className="font-mono uppercase"
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          color: "var(--color-text-faint)",
        }}
      >
        {copy.eyebrow}
      </span>
      <h3
        className="m-0 font-medium"
        style={{
          fontSize: 17,
          letterSpacing: "-0.005em",
          color: "var(--color-text)",
        }}
      >
        {copy.title}
      </h3>
      <p
        className="m-0 max-w-md"
        style={{ fontSize: 13.5, color: "var(--color-text-muted)", lineHeight: 1.55 }}
      >
        {copy.body}
      </p>
      <a
        href={copy.ctaHref(projectId)}
        className="bg-brand-gradient focus-rove inline-flex items-center justify-center font-medium"
        style={{
          height: 36,
          padding: "0 16px",
          borderRadius: 8,
          color: "#fff",
          fontSize: 13,
          textDecoration: "none",
          marginTop: 4,
        }}
      >
        {copy.ctaLabel}
      </a>
    </div>
  );
}
