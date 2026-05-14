interface NowDoingPillProps {
  verb: string;
  target: string;
  timer: string;
}

export function NowDoingPill({ verb, target, timer }: NowDoingPillProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-3 rounded-full pl-2.5 pr-3 py-1.5 bg-[var(--color-accent-soft)] border border-[color-mix(in_srgb,var(--color-accent)_40%,transparent)]"
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        <span className="absolute inset-0 rounded-full bg-[var(--color-accent)] opacity-75 animate-livedot-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
      </span>
      <span className="text-[12px] text-[var(--color-text-muted)]">{verb}</span>
      <span className="text-[12px] font-mono text-[var(--color-accent)]">&ldquo;{target}&rdquo;</span>
      <span className="mx-0.5 h-3.5 w-px bg-[var(--color-border)]" aria-hidden />
      <span className="text-[11px] font-mono text-[var(--color-text-faint)] tabular-nums">{timer}</span>
    </div>
  );
}
