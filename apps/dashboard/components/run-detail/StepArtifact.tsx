/**
 * Step artifact renderers — "what the agent actually output at this moment."
 *
 * The filmstrip and the detail-split's left preview both render an artifact
 * per step. For most agent-persona walks, that artifact is NOT a pixel
 * screenshot — it's the accessibility tree the agent received, or the
 * target the agent acted on, or the network/console state it read. PNG
 * screenshots are still rendered when present (the agent explicitly called
 * `browser_take_screenshot`), but they're one option among many.
 *
 * Two variants:
 *   - `StepThumbArtifact` — small (≈138×100), for filmstrip tiles
 *   - `StepDetailArtifact` — large (16:9 main pane), for the run-detail split
 *
 * Both switch on `step.toolName` and pick the right renderer. Falls back to
 * a striped placeholder for unknown tools.
 */

import { MockThumb } from "./MockThumbs";
import { parseAriaSnapshot, type AriaNode } from "./parseAriaSnapshot";
import type { StepView } from "./types";

type Variant = "thumb" | "detail";

export function StepThumbArtifact({ step }: { step: StepView }) {
  return <StepArtifactCore step={step} variant="thumb" />;
}

export function StepDetailArtifact({ step }: { step: StepView }) {
  return <StepArtifactCore step={step} variant="detail" />;
}

function StepArtifactCore({ step, variant }: { step: StepView; variant: Variant }) {
  // PNG screenshots win when present — the agent explicitly chose to capture.
  if (step.thumb.kind === "image") {
    return <ScreenshotImage step={step} variant={variant} />;
  }
  if (step.thumb.kind === "mock") {
    return (
      <div className="h-full w-full">
        <MockThumb kind={step.thumb.name} />
      </div>
    );
  }

  // No PNG → render the agent's text-shaped artifact.
  const name = step.toolName;
  if (name.startsWith("browser_take_screenshot")) {
    return <Placeholder label="capturing screenshot…" variant={variant} />;
  }
  if (name.startsWith("browser_navigate")) {
    return <NavigateCard step={step} variant={variant} />;
  }
  if (name.startsWith("browser_snapshot") || name.startsWith("browser_take_snapshot")) {
    return <SnapshotCard step={step} variant={variant} />;
  }
  if (name.startsWith("browser_click")) {
    return <ClickCard step={step} variant={variant} />;
  }
  if (name.startsWith("browser_type")) {
    return <TypeCard step={step} variant={variant} />;
  }
  if (name.startsWith("browser_console_messages")) {
    return <ConsoleCard step={step} variant={variant} />;
  }
  if (name.startsWith("browser_network_request")) {
    return <NetworkCard step={step} variant={variant} />;
  }
  return <UnknownCard step={step} variant={variant} />;
}

// ── Renderers ───────────────────────────────────────────────────────────

function ScreenshotImage({ step, variant }: { step: StepView; variant: Variant }) {
  if (step.thumb.kind !== "image") return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={step.thumb.src}
      alt={step.thumb.alt ?? `Step ${step.index} screenshot`}
      className="block h-full w-full"
      style={{ objectFit: variant === "thumb" ? "cover" : "contain", background: "white" }}
    />
  );
}

function NavigateCard({ step, variant }: { step: StepView; variant: Variant }) {
  const url = step.url || (step.actionTarget?.target ?? "");
  const stripped = url.replace(/^https?:\/\//, "") || "—";
  return (
    <Card variant={variant} accent="cyan">
      <Eyebrow>NAVIGATED</Eyebrow>
      <div
        className="font-mono break-all leading-tight"
        style={{ fontSize: variant === "thumb" ? 11 : 18, color: "var(--color-text)" }}
      >
        <span style={{ color: "var(--color-text-faint)" }}>↳ </span>
        {stripped}
      </div>
      {variant === "detail" ? (
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          The agent issued <code>browser_navigate</code> to this URL.
        </p>
      ) : null}
    </Card>
  );
}

function SnapshotCard({ step, variant }: { step: StepView; variant: Variant }) {
  const nodes = parseAriaSnapshot(step.ariaSnapshot);
  const flat = flattenNodes(nodes, variant === "thumb" ? 6 : 28);
  if (flat.length === 0) {
    return (
      <Card variant={variant} accent="cyan">
        <Eyebrow>SNAPSHOT</Eyebrow>
        <p className="text-xs text-[var(--color-text-faint)]">No aria-snapshot captured.</p>
      </Card>
    );
  }
  return (
    <Card variant={variant} accent="cyan" dense>
      <Eyebrow>ARIA SNAPSHOT</Eyebrow>
      <div
        className="font-mono leading-tight"
        style={{ fontSize: variant === "thumb" ? 9.5 : 12.5, color: "var(--color-text-muted)" }}
      >
        {flat.map((row, i) => (
          <div key={i} className="flex items-center gap-1 truncate" style={{ paddingLeft: row.depth * 8 }}>
            <span style={{ color: "#6ee2e4" }}>{row.role}</span>
            {row.name ? (
              <span className="truncate" style={{ color: "var(--color-text)" }}>
                &ldquo;{row.name}&rdquo;
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ClickCard({ step, variant }: { step: StepView; variant: Variant }) {
  const at = step.actionTarget;
  return (
    <Card variant={variant} accent="cyan">
      <Eyebrow>CLICKED</Eyebrow>
      {at?.element ? (
        <div
          className="leading-tight"
          style={{ fontSize: variant === "thumb" ? 12 : 18, color: "var(--color-text)" }}
        >
          {at.element}
        </div>
      ) : null}
      {at?.target ? (
        <div
          className="font-mono mt-1"
          style={{ fontSize: variant === "thumb" ? 10 : 12, color: "var(--color-text-faint)" }}
        >
          [ref={at.target}]
        </div>
      ) : null}
      {!at?.element && !at?.target ? (
        <p className="text-xs text-[var(--color-text-faint)]">unknown target</p>
      ) : null}
    </Card>
  );
}

function TypeCard({ step, variant }: { step: StepView; variant: Variant }) {
  const at = step.actionTarget;
  return (
    <Card variant={variant} accent="cyan">
      <Eyebrow>TYPED</Eyebrow>
      {step.typedText ? (
        <div
          className="font-mono leading-tight truncate"
          style={{ fontSize: variant === "thumb" ? 12 : 18, color: "var(--color-text)" }}
        >
          &ldquo;{step.typedText}&rdquo;
        </div>
      ) : null}
      {at?.element ? (
        <div
          className="mt-1 text-[var(--color-text-muted)] truncate"
          style={{ fontSize: variant === "thumb" ? 10 : 13 }}
        >
          into {at.element}
        </div>
      ) : null}
    </Card>
  );
}

function ConsoleCard({ step, variant }: { step: StepView; variant: Variant }) {
  return (
    <Card variant={variant} accent="muted">
      <Eyebrow>CONSOLE</Eyebrow>
      <p
        className="font-mono text-[var(--color-text-muted)] leading-tight"
        style={{ fontSize: variant === "thumb" ? 10.5 : 13 }}
      >
        {step.resultSummary ?? "read"}
      </p>
    </Card>
  );
}

function NetworkCard({ step, variant }: { step: StepView; variant: Variant }) {
  return (
    <Card variant={variant} accent="muted">
      <Eyebrow>NETWORK</Eyebrow>
      <p
        className="font-mono text-[var(--color-text-muted)] leading-tight"
        style={{ fontSize: variant === "thumb" ? 10.5 : 13 }}
      >
        {step.resultSummary ?? "read"}
      </p>
    </Card>
  );
}

function UnknownCard({ step, variant }: { step: StepView; variant: Variant }) {
  return (
    <Card variant={variant} accent="muted">
      <Eyebrow>{step.toolName.replace(/^browser_/, "").toUpperCase()}</Eyebrow>
      {step.resultSummary ? (
        <p
          className="font-mono leading-tight text-[var(--color-text-muted)]"
          style={{ fontSize: variant === "thumb" ? 10.5 : 13 }}
        >
          {step.resultSummary}
        </p>
      ) : null}
    </Card>
  );
}

function Placeholder({ label, variant }: { label: string; variant: Variant }) {
  return (
    <div
      className="h-full w-full grid place-items-center font-mono"
      style={{
        background:
          "repeating-linear-gradient(135deg, #1a2236 0px, #1a2236 8px, #161c2e 8px, #161c2e 16px)",
        color: "var(--color-text-faint)",
        fontSize: variant === "thumb" ? 10 : 13,
        textAlign: "center",
        padding: 8,
        lineHeight: 1.3,
      }}
    >
      {label}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function Card({
  variant,
  accent,
  dense,
  children,
}: {
  variant: Variant;
  accent: "cyan" | "muted";
  dense?: boolean;
  children: React.ReactNode;
}) {
  const isThumb = variant === "thumb";
  const accentLine = accent === "cyan" ? "var(--color-accent)" : "var(--color-text-faint)";
  return (
    <div
      className="h-full w-full flex flex-col"
      style={{
        background: "linear-gradient(160deg, rgba(20,26,42,0.85) 0%, rgba(11,15,28,0.95) 100%)",
        padding: isThumb ? (dense ? "6px 8px" : "8px 10px") : "18px 22px",
        borderLeft: `2px solid ${accentLine}`,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="font-mono uppercase mb-1.5"
      style={{
        fontSize: 9.5,
        letterSpacing: "0.14em",
        color: "var(--color-text-faint)",
      }}
    >
      {children}
    </p>
  );
}

interface FlatRow {
  depth: number;
  role: string;
  name: string | null;
}

/** Linearize the first N visible nodes of a parsed aria tree, preserving depth. */
function flattenNodes(nodes: AriaNode[], cap: number): FlatRow[] {
  const out: FlatRow[] = [];
  function walk(list: AriaNode[], depth: number) {
    for (const n of list) {
      if (out.length >= cap) return;
      if (n.role === "raw") {
        out.push({ depth, role: "text", name: (n.rawText ?? "").slice(0, 40) });
        continue;
      }
      out.push({ depth, role: n.role, name: n.name });
      if (n.children.length > 0) walk(n.children, depth + 1);
    }
  }
  walk(nodes, 0);
  return out;
}
