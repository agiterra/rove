/**
 * Consistent page header — eyebrow, title, optional description, slot for
 * actions on the right.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6 flex-wrap">
      <div>
        {eyebrow ? (
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-faint)] mb-2">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-2 text-sm text-[var(--color-text-muted)] max-w-2xl">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PrimaryButtonLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] text-[var(--color-bg)] text-sm font-medium px-3.5 py-2 hover:opacity-90 transition-opacity"
    >
      {children}
    </a>
  );
}

export function SecondaryButtonLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] text-[var(--color-text)] text-sm font-medium px-3.5 py-2 hover:bg-[var(--color-panel-2)] transition-colors"
    >
      {children}
    </a>
  );
}

export function EmptyState({
  emoji,
  title,
  description,
  action,
}: {
  emoji: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="surface p-12 text-center">
      <div className="text-3xl mb-3">{emoji}</div>
      <h2 className="text-base font-semibold mb-1">{title}</h2>
      <p className="text-sm text-[var(--color-text-muted)] max-w-sm mx-auto mb-5">
        {description}
      </p>
      {action}
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === "critical"
      ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
      : severity === "major"
        ? "bg-orange-500/10 text-orange-300 border-orange-500/30"
        : severity === "minor"
          ? "bg-yellow-500/10 text-yellow-200 border-yellow-500/30"
          : "bg-slate-500/10 text-slate-300 border-slate-500/30";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wider font-medium ${cls}`}
    >
      {severity}
    </span>
  );
}
