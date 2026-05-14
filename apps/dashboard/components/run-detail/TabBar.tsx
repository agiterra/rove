"use client";

import { useRef } from "react";

interface TabSpec {
  id: string;
  label: string;
  count?: number;
}

interface TabBarProps {
  active: string;
  onChange?: (id: string) => void;
  findingCount?: number;
}

export function TabBar({ active, onChange, findingCount }: TabBarProps) {
  const tabs: TabSpec[] = [
    { id: "filmstrip", label: "Filmstrip" },
    { id: "steps", label: "Steps" },
    { id: "findings", label: "Findings", count: findingCount },
    { id: "reflection", label: "Reflection" },
  ];
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKey(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange?.(tabs[next].id);
    buttonRefs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Run views"
      className="flex gap-7 mt-3"
      style={{ borderBottom: "1px solid var(--color-border)" }}
    >
      {tabs.map((t, idx) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              buttonRefs.current[idx] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onKeyDown={(e) => handleKey(e, idx)}
            onClick={() => onChange?.(t.id)}
            className="focus-rove relative bg-transparent border-0 flex items-center gap-2 rounded-md"
            style={{
              padding: "14px 0 16px",
              fontSize: 14,
              color: isActive ? "var(--color-text)" : "var(--color-text-muted)",
              fontFamily: "inherit",
              cursor: onChange ? "pointer" : "default",
            }}
          >
            <span>{t.label}</span>
            {t.count != null && t.count > 0 ? (
              <span
                className="inline-grid place-items-center font-mono"
                style={{
                  minWidth: 20,
                  height: 19,
                  padding: "0 6px",
                  borderRadius: 4,
                  background: "rgba(63,201,203,0.12)",
                  color: "#6ee2e4",
                  fontSize: 11,
                  border: "1px solid rgba(63,201,203,0.30)",
                }}
              >
                {t.count}
              </span>
            ) : null}
            {isActive ? (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: -1,
                  height: 2,
                  background: "var(--color-accent)",
                  boxShadow: "0 0 12px rgba(63,201,203,0.4)",
                }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
