const TABS = [
  { id: "filmstrip", label: "Filmstrip", count: null },
  { id: "steps", label: "Steps", count: null },
  { id: "findings", label: "Findings", count: 3 },
  { id: "reflection", label: "Reflection", count: null },
] as const;

export function TabBar({ active = "filmstrip" }: { active?: string }) {
  return (
    <div role="tablist" aria-label="Run views" className="border-b border-[var(--color-border)]">
      <div className="flex items-end gap-6">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={[
                "relative -mb-px py-3 text-[13px] tracking-[-0.005em] focus-rove rounded-[6px]",
                isActive
                  ? "text-[var(--color-text)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
              ].join(" ")}
            >
              <span className="inline-flex items-center gap-2 px-1">
                {tab.label}
                {tab.count != null ? (
                  <span className="rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-mono text-[10px] px-1.5 py-0.5 tabular-nums">
                    {tab.count}
                  </span>
                ) : null}
              </span>
              {isActive ? (
                <span
                  aria-hidden
                  className="absolute left-0 right-0 -bottom-px h-[2px] bg-[var(--color-accent)] rounded-full"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
