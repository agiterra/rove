import { RUN_META } from "./mock-data";

export function RunFooter() {
  const bits: [string, string][] = [
    ["commit", RUN_META.commitSha],
    ["branch", RUN_META.branch],
    ["daemon", RUN_META.daemon],
    ["run", RUN_META.runShort],
    ["started", RUN_META.startedAgo],
  ];
  return (
    <footer
      className="flex flex-wrap items-center gap-3.5 mt-10 pt-5 font-mono"
      style={{
        borderTop: "1px solid var(--color-border)",
        fontSize: 12,
        color: "var(--color-text-faint)",
      }}
    >
      {bits.map(([k, v], i) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          {i > 0 ? <span style={{ color: "#2b3454" }}>·</span> : null}
          <span style={{ color: "#6b7591" }}>{k}</span>
          <span style={{ color: "var(--color-text-muted)" }}>{v}</span>
        </span>
      ))}
    </footer>
  );
}
