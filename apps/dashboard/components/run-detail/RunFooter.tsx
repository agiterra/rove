import type { FooterView } from "./types";

export function RunFooter({ view }: { view: FooterView }) {
  const bits: [string, string | null][] = [
    ["commit", view.commit],
    ["branch", view.branch],
    ["initiated by", view.daemon],
    ["run", view.runShort],
    ["started", view.startedLabel],
  ];
  const present = bits.filter(([, v]) => v != null) as [string, string][];
  return (
    <footer
      className="flex flex-wrap items-center gap-3.5 mt-10 pt-5 font-mono"
      style={{
        borderTop: "1px solid var(--color-border)",
        fontSize: 12,
        color: "var(--color-text-faint)",
      }}
    >
      {present.map(([k, v], i) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          {i > 0 ? <span style={{ color: "#2b3454" }}>·</span> : null}
          <span style={{ color: "#6b7591" }}>{k}</span>
          <span style={{ color: "var(--color-text-muted)" }}>{v}</span>
        </span>
      ))}
    </footer>
  );
}
