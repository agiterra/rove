interface FindingLoadingProps {
  hint?: string;
}

export function FindingLoading({ hint }: FindingLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-rove-loading
      className="grid place-items-center text-center"
      style={{
        background: "var(--color-panel)",
        border: "1px dashed var(--color-border)",
        borderRadius: 12,
        padding: "32px 24px",
        color: "var(--color-text-muted)",
        fontSize: 13,
        minHeight: 120,
      }}
    >
      <div className="flex flex-col items-center gap-3">
        <span
          aria-hidden="true"
          className="block animate-spin"
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "2px solid var(--color-border-strong)",
            borderTopColor: "var(--color-brand-cyan)",
          }}
        />
        <span>{hint ?? "Loading findings…"}</span>
      </div>
    </div>
  );
}
