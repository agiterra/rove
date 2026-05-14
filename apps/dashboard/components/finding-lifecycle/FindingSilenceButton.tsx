"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { ConfirmCritical, SilenceForm } from "./FindingSilenceButton.parts";
import type { LifecycleFinding, SilenceScope } from "./types";

interface FindingSilenceButtonProps {
  finding: LifecycleFinding;
  onChange?: (silenced: boolean) => void;
  /** Default true. When false, skips the confirm step on critical findings. */
  confirmOnCritical?: boolean;
}

type Step = "idle" | "popover" | "confirm" | "submitting";

export function FindingSilenceButton({
  finding,
  onChange,
  confirmOnCritical = true,
}: FindingSilenceButtonProps) {
  const [step, setStep] = useState<Step>("idle");
  const [silenced, setSilenced] = useState<boolean>(finding.silencedAt != null);
  const [reason, setReason] = useState<string>("");
  const [scope, setScope] = useState<SilenceScope>("finding");
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSilenced(finding.silencedAt != null);
  }, [finding.silencedAt]);

  useEffect(() => {
    if (step === "idle") return;
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setStep("idle");
        setError(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setStep("idle");
        setError(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [step]);

  async function submitToggle(next: boolean) {
    setStep("submitting");
    setError(null);
    try {
      const supabase = createBrowserSupabase();
      const { error: rpcError } = await supabase.rpc("toggle_finding_silence", {
        p_finding_id: finding.id,
        p_silenced: next,
        p_reason: next ? reason || null : null,
        p_scope: next ? scope : "finding",
      });
      if (rpcError) throw new Error(rpcError.message);
      setSilenced(next);
      onChange?.(next);
      setStep("idle");
      setReason("");
      setScope("finding");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("popover");
    }
  }

  function onSilenceClick() {
    if (silenced) {
      void submitToggle(false);
      return;
    }
    setStep("popover");
  }

  function onApply() {
    if (finding.severity === "critical" && confirmOnCritical) {
      setStep("confirm");
      return;
    }
    void submitToggle(true);
  }

  return (
    <div ref={rootRef} className="relative inline-block" data-rove-silence>
      <button
        type="button"
        aria-pressed={silenced}
        aria-haspopup={silenced ? undefined : "dialog"}
        aria-expanded={step !== "idle" ? true : undefined}
        onClick={onSilenceClick}
        className="focus-rove inline-flex items-center gap-1.5"
        style={{
          background: silenced ? "var(--color-accent-soft)" : "transparent",
          border: `1px solid ${silenced ? "var(--color-accent)" : "var(--color-border-strong)"}`,
          borderRadius: 8,
          padding: "6px 12px",
          color: silenced ? "var(--color-accent)" : "var(--color-text)",
          fontSize: 12,
          cursor: "pointer",
          fontWeight: 500,
        }}
      >
        {silenced ? "Silenced · click to un-silence" : "Silence"}
      </button>

      {step === "popover" || step === "submitting" || step === "confirm" ? (
        <div
          role="dialog"
          aria-label={step === "confirm" ? "Confirm silence of critical finding" : "Silence this finding"}
          className="absolute right-0 z-20"
          style={{
            top: "calc(100% + 6px)",
            width: 320,
            background: "var(--color-panel-2)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: 12,
            padding: 14,
            boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
          }}
        >
          {step === "confirm" ? (
            <ConfirmCritical
              finding={finding}
              onCancel={() => setStep("popover")}
              onConfirm={() => void submitToggle(true)}
            />
          ) : (
            <SilenceForm
              reason={reason}
              scope={scope}
              error={error}
              busy={step === "submitting"}
              onReason={setReason}
              onScope={setScope}
              onCancel={() => {
                setStep("idle");
                setError(null);
              }}
              onApply={onApply}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
