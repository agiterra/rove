import { MockThumb } from "./MockThumbs";
import { StepDetailArtifact } from "./StepArtifact";
import { TankloopPreview, PreviewCursor } from "./TankloopPreview";
import { parseAriaSnapshot, type AriaNode } from "./parseAriaSnapshot";
import { highlightAriaTarget } from "./highlightAriaTarget";
import { AffordanceInventory } from "./AffordanceInventory";
import { PlanVsRealityInlineDiff } from "./PlanVsRealityInlineDiff";
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
  /** Project's GitHub repo binding. Null disables the Send-to-issue button. */
  githubRepo?: { owner: string; name: string } | null;
}

export function DetailSplit({
  step,
  inlineTankloop = false,
  liveVerb,
  liveTarget,
  githubRepo = null,
}: DetailSplitProps) {
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
    <div className="flex flex-col gap-4 mt-5">
      <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <PreviewPanel step={step} inlineTankloop={inlineTankloop} liveVerb={liveVerb} liveTarget={liveTarget} />
        <A11yTree step={step} liveTarget={liveTarget} />
      </div>
      <PlanVsRealityInlineDiff step={step} />
      <AffordanceInventory step={step} githubRepo={githubRepo} />
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
          background: step.thumb.kind === "image" ? "#ffffff" : "var(--color-panel-2)",
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
        {step.actionTarget?.target ? (
          <MonoPill label="target" value={step.actionTarget.target} />
        ) : null}
        {step.actionTarget?.element ? (
          <MonoPill label="element" value={step.actionTarget.element} />
        ) : null}
        <MonoPill label="duration" value={step.durationLabel} />
        <MonoPill label="status" value={step.status} accent={step.status === "running"} />
      </div>
    </div>
  );
}

function ScreenshotContent({ step }: { step: StepView }) {
  // Mock fixtures keep the hand-drawn art for the preview route.
  if (step.thumb.kind === "mock") return <MockThumb kind={step.thumb.name} />;
  // Everything else routes through StepDetailArtifact: PNG when present,
  // text-shaped artifact otherwise (aria tree, target, typed text, etc).
  return <StepDetailArtifact step={step} />;
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

function A11yTree({ step, liveTarget }: { step: StepView; liveTarget?: string }) {
  const parsed = parseAriaSnapshot(step.ariaSnapshot);
  const highlightId = highlightAriaTarget(parsed, step.actionTarget);
  const hasParsed = parsed.length > 0 && parsed[0].role !== "raw";

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
        {hasParsed ? (
          <ParsedTree nodes={parsed} highlightId={highlightId} />
        ) : parsed.length > 0 && parsed[0].rawText ? (
          <RawTree text={parsed[0].rawText} />
        ) : liveTarget ? (
          <SampleAriaTree liveTarget={liveTarget} />
        ) : (
          <NoTreeYet />
        )}
      </div>
    </aside>
  );
}

function ParsedTree({ nodes, highlightId }: { nodes: AriaNode[]; highlightId: string | null }) {
  return (
    <>
      {nodes.map((n, i) => (
        <TreeNode key={n.id} node={n} depth={0} isLast={i === nodes.length - 1} highlightId={highlightId} />
      ))}
    </>
  );
}

function TreeNode({
  node,
  depth,
  isLast,
  highlightId,
}: {
  node: AriaNode;
  depth: number;
  isLast: boolean;
  highlightId: string | null;
}) {
  const hasChildren = node.children.length > 0;
  const rails: ("line" | "gap")[] = Array(depth).fill("line");
  const cap: "tee" | "elbow" | undefined = depth === 0 ? undefined : isLast ? "elbow" : "tee";
  const isHit = node.id === highlightId;

  const inner = (
    <>
      {hasChildren ? <Tw>▼</Tw> : null}
      <Role>{node.role}</Role>
      {node.name ? <Name>&ldquo;{node.name}&rdquo;</Name> : null}
      {node.inlineValue ? <Href>{node.inlineValue}</Href> : null}
    </>
  );

  return (
    <>
      {isHit ? (
        <div
          className="lw-tree-highlight flex items-center gap-1.5 self-start"
          style={{ padding: "4px 8px", margin: "2px 0 2px 48px" }}
        >
          {inner}
        </div>
      ) : (
        <TreeRow rails={rails} cap={cap}>
          {inner}
        </TreeRow>
      )}
      {hasChildren
        ? node.children.map((c, i) => (
            <TreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              isLast={i === node.children.length - 1}
              highlightId={highlightId}
            />
          ))
        : null}
    </>
  );
}

function RawTree({ text }: { text: string }) {
  return (
    <pre
      className="m-0 whitespace-pre-wrap break-words text-[var(--color-text-muted)]"
      style={{ fontSize: 12 }}
    >
      {text}
    </pre>
  );
}

/** Hand-built preview-only tree used when `liveTarget` is set but no
 * `aria_snapshot` exists (the preview route's mock data path). */
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
