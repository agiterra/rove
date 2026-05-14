import { MockBrowserShot } from "./MockBrowserShot";
import { STEPS, ARIA_TREE, SELECTED_STEP_INDEX } from "./mock-data";

export function DetailSplit() {
  const step = STEPS.find((s) => s.index === SELECTED_STEP_INDEX) ?? STEPS[STEPS.length - 1];
  return (
    <section className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-6 mt-6">
      <SelectedStepPreview step={step} />
      <AriaTreePanel />
    </section>
  );
}

function SelectedStepPreview({ step }: { step: (typeof STEPS)[number] }) {
  return (
    <div className="surface-raised overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <p className="text-[12px] font-mono text-[var(--color-text-muted)] truncate">
          <span className="text-[var(--color-text-faint)]">step</span>{" "}
          <span className="text-[var(--color-text)]">#{step.index.toString().padStart(2, "0")}</span>
          <span className="mx-2 text-[var(--color-text-faint)]">—</span>
          <span>{step.caption}</span>
        </p>
        <p className="text-[11px] font-mono text-[var(--color-text-faint)] shrink-0">
          {step.status === "running" ? "live" : `${(step.durationMs / 1000).toFixed(1)}s`}
        </p>
      </div>
      <div className="bg-[var(--color-bg-2)] aspect-[16/9] relative">
        <MockBrowserShot kind={step.shotKind} label={step.caption} />
        {step.status === "running" ? (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 30%, transparent)",
            }}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 border-t border-[var(--color-border)]">
        <Tag label="action" value={step.toolName.replace(/^browser_/, "")} />
        <Tag label="target_id" value="btn_run_walk_primary" />
        <Tag label="coordinates" value="{x: 842, y: 120}" />
        <Tag label="url" value={step.urlAfter} />
        <Tag label="status" value={step.status} accent={step.status === "running"} />
      </div>
    </div>
  );
}

function Tag({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-panel)] pl-2 pr-2.5 py-1 text-[11px] font-mono">
      <span className="text-[var(--color-text-faint)] uppercase tracking-wider text-[9px]">{label}</span>
      <span className={accent ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}>{value}</span>
    </span>
  );
}

function AriaTreePanel() {
  return (
    <aside className="surface-raised overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <p className="eyebrow">ACCESSIBILITY TREE</p>
        <span className="text-[10px] font-mono text-[var(--color-text-faint)]">/flows/discover_flows</span>
      </div>
      <div className="px-2 py-2 font-mono text-[12px] leading-[1.7] overflow-x-auto">
        {ARIA_TREE.map((node, i) => (
          <AriaNode key={i} node={node} />
        ))}
      </div>
      <div className="px-4 py-2.5 border-t border-[var(--color-border)] flex items-center justify-between">
        <p className="text-[10px] text-[var(--color-text-faint)]">
          highlighted = current click target
        </p>
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
      </div>
    </aside>
  );
}

function AriaNode({ node }: { node: (typeof ARIA_TREE)[number] }) {
  const indent = node.depth * 14;
  const chevron =
    node.expanded === true ? "▼" : node.expanded === false ? "▶" : " ";
  return (
    <div
      className={[
        "flex items-baseline gap-2 pl-1 pr-2 py-0.5 rounded-[4px] -mx-1",
        node.highlighted
          ? "bg-[var(--color-accent-soft)] outline outline-1 outline-[color-mix(in_srgb,var(--color-accent)_45%,transparent)]"
          : "",
      ].join(" ")}
      style={{ paddingLeft: `${indent + 8}px` }}
    >
      <span aria-hidden className="text-[var(--color-text-faint)] w-3 inline-flex shrink-0">
        {chevron}
      </span>
      <span className={node.highlighted ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}>
        {node.role}
      </span>
      {node.name ? (
        <span className={node.highlighted ? "text-[var(--color-text)]" : "text-[var(--color-text)]"}>
          &ldquo;{node.name}&rdquo;
        </span>
      ) : null}
      {node.highlighted ? (
        <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--color-accent)] opacity-80">
          target
        </span>
      ) : null}
    </div>
  );
}
