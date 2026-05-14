"use client";

import type { LifecycleFinding, SilenceScope } from "./types";

export const SCOPE_LABEL: Record<SilenceScope, string> = {
  finding: "This finding",
  pattern: "Pattern",
  flow: "Whole flow",
};

export const SCOPE_HINT: Record<SilenceScope, string> = {
  finding: "only this row",
  pattern: "same heuristic + URL prefix",
  flow: "same heuristic in this flow",
};

export const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--color-border-strong)",
  borderRadius: 6,
  padding: "6px 12px",
  color: "var(--color-text)",
  fontSize: 12,
  cursor: "pointer",
};

export const primaryBtn: React.CSSProperties = {
  border: "none",
  borderRadius: 6,
  padding: "6px 14px",
  color: "#fff",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

export function SilenceForm({
  reason,
  scope,
  error,
  busy,
  onReason,
  onScope,
  onCancel,
  onApply,
}: {
  reason: string;
  scope: SilenceScope;
  error: string | null;
  busy: boolean;
  onReason: (v: string) => void;
  onScope: (v: SilenceScope) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span
          className="font-mono uppercase"
          style={{ fontSize: 11, letterSpacing: "0.16em", color: "var(--color-text-faint)" }}
        >
          Reason (optional)
        </span>
        <textarea
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          rows={2}
          placeholder="e.g. expected behavior on this admin-only screen"
          className="focus-rove"
          style={{
            background: "var(--color-panel)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            padding: "8px 10px",
            color: "var(--color-text)",
            fontSize: 12.5,
            resize: "vertical",
            minHeight: 56,
            fontFamily: "inherit",
          }}
        />
      </label>

      <fieldset className="flex flex-col gap-1.5" style={{ border: "none", margin: 0, padding: 0 }}>
        <legend
          className="font-mono uppercase"
          style={{ fontSize: 11, letterSpacing: "0.16em", color: "var(--color-text-faint)", padding: 0 }}
        >
          Scope
        </legend>
        {(["finding", "pattern", "flow"] as const).map((value) => (
          <label
            key={value}
            className="flex items-center gap-2"
            style={{ fontSize: 12.5, color: "var(--color-text)", cursor: "pointer" }}
          >
            <input
              type="radio"
              name="silence-scope"
              value={value}
              checked={scope === value}
              onChange={() => onScope(value)}
            />
            <span>
              <span style={{ fontWeight: 500 }}>{SCOPE_LABEL[value]}</span>
              <span style={{ color: "var(--color-text-faint)", marginLeft: 6 }}>
                {SCOPE_HINT[value]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {error ? (
        <p
          role="alert"
          className="m-0"
          style={{ fontSize: 12, color: "var(--color-severity-critical)" }}
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="focus-rove"
          style={ghostBtn}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={busy}
          className="bg-brand-gradient focus-rove"
          style={primaryBtn}
        >
          {busy ? "Silencing…" : "Silence"}
        </button>
      </div>
    </div>
  );
}

export function ConfirmCritical({
  finding,
  onCancel,
  onConfirm,
}: {
  finding: LifecycleFinding;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p
        className="m-0 font-medium"
        style={{ fontSize: 13.5, color: "var(--color-text)" }}
      >
        Silence a critical finding?
      </p>
      <p className="m-0" style={{ fontSize: 12.5, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
        {finding.heuristicId} was filed as <strong>critical</strong>. Silencing
        removes it from dashboard totals. You can un-silence at any time.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="focus-rove" style={ghostBtn}>
          Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="focus-rove"
          style={{
            ...primaryBtn,
            background: "var(--color-severity-critical)",
          }}
        >
          Confirm silence
        </button>
      </div>
    </div>
  );
}
