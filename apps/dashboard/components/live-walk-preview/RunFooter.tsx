import { RUN_META } from "./mock-data";

export function RunFooter() {
  const items = [
    { label: "run", value: RUN_META.id.slice(0, 8) },
    { label: "commit", value: RUN_META.commitSha },
    { label: "branch", value: RUN_META.branch },
    { label: "daemon", value: RUN_META.daemon },
    { label: "project", value: RUN_META.project },
  ];
  return (
    <footer className="mt-12 pt-6 border-t border-[var(--color-border)] flex flex-wrap items-center gap-x-4 gap-y-2">
      {items.map((item, i) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-[11px] font-mono">
          <span className="uppercase tracking-[0.12em] text-[9px] text-[var(--color-text-faint)]">
            {item.label}
          </span>
          <span className="text-[var(--color-text-muted)]">{item.value}</span>
          {i < items.length - 1 ? (
            <span aria-hidden className="ml-2 text-[var(--color-text-faint)]">
              ·
            </span>
          ) : null}
        </span>
      ))}
    </footer>
  );
}
