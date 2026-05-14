import { MockThumb } from "./MockThumbs";
import { TankloopPreview, PreviewCursor } from "./TankloopPreview";
import { STEPS, SELECTED_STEP_INDEX } from "./mock-data";
import type { MockStep } from "./mock-data";

export function DetailSplit({ selectedIndex = SELECTED_STEP_INDEX }: { selectedIndex?: number }) {
  const step =
    STEPS.find((s) => s.index === selectedIndex) ??
    STEPS[STEPS.length - 1];
  return (
    <div className="grid mt-5 gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>
      <PreviewPanel step={step} />
      <A11yTree />
    </div>
  );
}

function PreviewPanel({ step }: { step: MockStep }) {
  const isCurrent = step.index === SELECTED_STEP_INDEX;
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
          clicking <span style={{ color: "#6ee2e4" }}>&ldquo;Run walk&rdquo;</span>
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
        {isCurrent ? (
          <>
            <TankloopPreview />
            <PreviewCursor />
          </>
        ) : (
          <MockThumb kind={step.thumb} />
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-3.5">
        <MonoPill label="tool" value={step.toolName} />
        <MonoPill label="url" value={`https://${step.url}`} />
        <MonoPill label="selector" value={'button[name="Run walk"]'} />
        <MonoPill label="duration" value={step.durationLabel} />
      </div>
    </div>
  );
}

function MonoPill({ label, value }: { label: string; value: string }) {
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
        color: "var(--color-text)",
      }}
    >
      <span style={{ color: "var(--color-text-faint)" }}>{label}</span>
      {value}
    </span>
  );
}

function A11yTree() {
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
        <TreeRow rails={["line", "line"]} cap="tee">
          <Tw>▶</Tw>
          <Role>region</Role>
          <Name>&ldquo;Step filmstrip&rdquo;</Name>
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
          <Name>&ldquo;Run walk&rdquo;</Name>
        </div>
        <TreeRow rails={["line", "gap", "line"]} cap="elbow">
          <Role>text</Role>
          <Name>&ldquo;00:01:32 elapsed&rdquo;</Name>
        </TreeRow>
      </div>
    </aside>
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
  return (
    <span style={{ color: "var(--color-text-faint)", marginLeft: 2 }}>{children}</span>
  );
}
