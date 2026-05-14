"use client";

interface FindingErrorProps {
  error: Error;
  retry: () => void;
}

export function FindingError({ error, retry }: FindingErrorProps) {
  const message = error?.message?.trim() || "Something went wrong.";
  return (
    <div
      role="alert"
      data-rove-error
      className="grid"
      style={{
        background: "var(--color-panel)",
        border: "1px solid rgba(244,63,94,0.4)",
        borderLeft: "3px solid var(--color-severity-critical)",
        borderRadius: 12,
        padding: "16px 18px",
        color: "var(--color-text)",
        gap: 10,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span
            className="font-mono uppercase"
            style={{
              fontSize: 11,
              letterSpacing: "0.18em",
              color: "var(--color-severity-critical)",
            }}
          >
            Couldn't load
          </span>
          <p className="m-0" style={{ fontSize: 13.5, color: "var(--color-text)" }}>
            {message}
          </p>
        </div>
        <button
          type="button"
          onClick={retry}
          className="focus-rove"
          style={{
            background: "transparent",
            border: "1px solid var(--color-border-strong)",
            borderRadius: 8,
            padding: "6px 12px",
            color: "var(--color-text)",
            fontSize: 12,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}
