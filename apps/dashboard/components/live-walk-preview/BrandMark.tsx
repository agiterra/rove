/**
 * Rove brand mark — a stylized "R" inside a brand-tinted square, with a
 * small cyan dot. Ported from the Claude Design handoff so the live-walk
 * preview's top bar matches the design exactly without changing the
 * existing AppMark on the rest of the dashboard.
 */
export function LWBrandMark() {
  return (
    <span
      aria-hidden
      className="grid place-items-center"
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: "linear-gradient(135deg, #102c57 0%, #07142b 100%)",
        border: "1px solid rgba(63,201,203,0.45)",
        boxShadow: "inset 0 1px 0 rgba(63,201,203,0.4), 0 8px 18px -10px rgba(63,201,203,0.5)",
        color: "var(--color-accent)",
      }}
    >
      <svg viewBox="0 0 16 16" fill="none" width={18} height={18}>
        <path
          d="M3.5 13V3.5h5.2a2.6 2.6 0 010 5.2H5.2L9.5 13"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12.2" cy="12.5" r="0.9" fill="currentColor" />
      </svg>
    </span>
  );
}
