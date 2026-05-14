import { MockThumb } from "./MockThumbs";
import { TankloopPreview, PreviewCursor } from "./TankloopPreview";
import type { StepView } from "./types";

interface DetailSplitProps {
  step: StepView | null;
  /** When true + step.status === "running", render the inline Tankloop
   * preview HTML instead of a static thumb. Reserved for the preview
   * route — real /runs/[id] never sets this. */
  inlineTankloop?: boolean;
  /** Caption verb ("clicking", "typing into", etc) when step.status === "running". */
  liveVerb?: string;
  /** Caption target string for running steps. */
  liveTarget?: string;
}

export function DetailSplit({ step, inlineTankloop = false, liveVerb, liveTarget }: DetailSplitProps) {
  if (!step) {
    return (
      <div
        className="grid mt-5 gap-4 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-panel)] p-10 text-center text-[var(--color-text-muted)]"
      >
        Select a step from the filmstrip to inspect its screenshot and accessibility tree.
      </div>
    );
  }
  return (
    <div className="grid mt-5 gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>
      <PreviewPanel step={step} inlineTankloop={inlineTankloop} liveVerb={liveVerb} liveTarget={liveTarget} />
      <A11yTree step={step} liveTarget={liveTarget} />
    </div>
  );
}

function PreviewPanel({
  step,
  inlineTankloop,
  liveVerb,
  liveTarget,
}: {
  step: StepView;
  inlineTankloop?: boolean;
  liveVerb?: string;
  liveTarget?: string;
}) {
  const showInlineTankloop = inlineTankloop && step.status === "running";
  return (
    <div
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div
        className="flex items-center gap-2 mb-3 font-mono whitespace-nowrap"
        style={{ fontSize: 13, color: "var(--color-text-muted)" }}
      >
        <span style={{ color: "var(--color-text)" }}>step {String(step.index).padStart(2, "0")}</span>
        <span>—</span>
        <span>
          {liveVerb ?? humanVerb(step.toolName, step.status)}
          {liveTarget ? (
            <>
              {" "}
              <span style={{ color: "#6ee2e4" }}>&ldquo;{liveTarget}&rdquo;</span>
            </>
          ) : null}
        </span>
      </div>

      <div
        className="relative overflow-hidden"
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
          borderRadius: 8,
          border: "1px solid var(--color-border)",
          background: "#ffffff",
        }}
      >
        {showInlineTankloop ? (
          <>
            <TankloopPreview />
            <PreviewCursor />
          </>
        ) : (
          <ScreenshotContent step={step} />
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-3.5">
        <MonoPill label="tool" value={step.toolName} />
        <MonoPill label="url" value={step.url ? `https://${step.url.replace(/^https?:\/\//, "")}` : "—"} />
        <MonoPill label="duration" value={step.durationLabel} />
        <MonoPill label="status" value={step.status} accent={step.status === "running"} />
      </div>
    </div>
  );
}

function ScreenshotContent({ step }: { step: StepView }) {
  if (step.thumb.kind === "mock") return <MockThumb kind={step.thumb.name} />;
  if (step.thumb.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={step.thumb.src}
        alt={step.thumb.alt ?? `Step ${step.index} full screenshot`}
        className="block h-full w-full object-contain bg-white"
      />
    );
  }
  return <BigPlaceholder reason={step.thumb.reason} />;
}

function BigPlaceholder({ reason }: { reason: "no-screenshot" | "running" }) {
  return (
    <div
      className="h-full w-full grid place-items-center"
      style={{
        background:
          "repeating-linear-gradient(135deg, #eef0f5 0px, #eef0f5 14px, #f4f5f8 14px, #f4f5f8 28px)",
        color: "#6b7280",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        letterSpacing: "0.05em",
      }}
    >
      {reason === "running" ? "capturing screenshot…" : "no screenshot for this step"}
    </div>
  );
}

function humanVerb(toolName: string, status: StepView["status"]): string {
  if (status === "errored") return "errored on";
  if (toolName.startsWith("browser_click")) return "clicked";
  if (toolName.startsWith("browser_type")) return "typed into";
  if (toolName.startsWith("browser_navigate")) return "navigated to";
  if (toolName.startsWith("browser_snapshot")) return "snapshotted";
  if (toolName.startsWith("browser_take_screenshot")) return "captured";
  return "ran";
}

function MonoPill({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono"
      style={{
        height: 28,
        padding: "0 12px",
        borderRadius: 6,
        background: "var(--color-panel-2)",
        border: "1px solid var(--color-border)",
        fontSize: 11.5,
        color: accent ? "#6ee2e4" : "var(--color-text)",
      }}
    >
      <span style={{ color: "var(--color-text-faint)" }}>{label}</span>
      {value}
    </span>
  );
}

function A11yTree({ liveTarget }: { step: StepView; liveTarget?: string }) {
  return (
    <aside
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        padding: "18px 18px 22px",
      }}
    >
      <p
        className="font-mono uppercase mb-4 text-[var(--color-text-faint)]"
        style={{ fontSize: 11, letterSpacing: "0.18em" }}
      >
        ACCESSIBILITY TREE
      </p>
      <div className="font-mono text-[var(--color-text)]" style={{ fontSize: 12.5 }}>
        {liveTarget ? <SampleAriaTree liveTarget={liveTarget} /> : <NoTreeYet />}
      </div>
    </aside>
  );
}

/** Renders the canonical role-name tree used in the preview when a live
 * target is known. Real /runs/[id] would parse run_step.aria_snapshot
 * (markdown-ish text) into a tree — deferred to a later PR. */
function SampleAriaTree({ liveTarget }: { liveTarget: string }) {
  return (
    <>
      <TreeRow>
        <Tw>▼</Tw>
        <Role>banner</Role>
      </TreeRow>
      <TreeRow rails={["line"]} cap="tee">
        <Tw>▼</Tw>
        <Role>navigation</Role>
      </TreeRow>
      <TreeRow rails={["line", "line"]} cap="tee">
        <Role>link</Role>
        <Name>&ldquo;Runs&rdquo;</Name>
        <Href>/runs</Href>
      </TreeRow>
      <TreeRow rails={["line", "line"]} cap="elbow">
        <Role>link</Role>
        <Name>&ldquo;Flows&rdquo;</Name>
        <Href>/flows</Href>
      </TreeRow>
      <TreeRow>
        <Tw>▼</Tw>
        <Role>main</Role>
      </TreeRow>
      <TreeRow rails={["line"]} cap="tee">
        <Tw>▼</Tw>
        <Role>region</Role>
        <Name>&ldquo;Walk overview&rdquo;</Name>
      </TreeRow>
      <TreeRow rails={["line", "line"]} cap="tee">
        <Role>heading</Role>
        <span style={{ color: "var(--color-text-muted)" }}>h1</span>
        <Name>&ldquo;Walking the app&rdquo;</Name>
      </TreeRow>
      <TreeRow rails={["line", "line"]} cap="elbow">
        <Tw>▼</Tw>
        <Role>region</Role>
        <Name>&ldquo;Live action&rdquo;</Name>
      </TreeRow>
      <div
        className="lw-tree-highlight flex items-center gap-1.5 self-start"
        style={{ padding: "4px 8px", margin: "4px 0 4px 48px" }}
      >
        <Role>button</Role>
        <Name>&ldquo;{liveTarget}&rdquo;</Name>
      </div>
    </>
  );
}

function NoTreeYet() {
  return (
    <p className="text-[var(--color-text-faint)]" style={{ fontSize: 12 }}>
      No aria-snapshot captured for this step yet.
    </p>
  );
}

type RailKind = "line" | "gap";
type CapKind = "tee" | "elbow";

function TreeRow({
  rails = [],
  cap,
  children,
}: {
  rails?: RailKind[];
  cap?: CapKind;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 py-1 whitespace-nowrap relative">
      {rails.map((r, i) => (
        <span key={i} className={`lw-rail ${r === "line" ? "lw-rail-line" : ""}`} />
      ))}
      {cap ? <span className={`lw-rail lw-rail-${cap}`} /> : null}
      {children}
    </div>
  );
}

function Tw({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="text-[var(--color-text-faint)] inline-block text-center"
      style={{ width: 12, marginLeft: -2 }}
    >
      {children}
    </span>
  );
}
function Role({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#6ee2e4" }}>{children}</span>;
}
function Name({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--color-text)" }}>{children}</span>;
}
function Href({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--color-text-faint)", marginLeft: 2 }}>{children}</span>;
}
