export function relativeTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const diffMs = Date.now() - t;
  const s = Math.round(diffMs / 1000);
  if (s < 45) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 45) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d}d ago`;
  const w = Math.round(d / 7);
  if (w < 8) return `${w}w ago`;
  return new Date(t).toISOString().slice(0, 10);
}

export function severityColor(s: string): string {
  switch (s) {
    case "critical":
      return "var(--color-severity-critical)";
    case "major":
      return "var(--color-severity-major)";
    case "minor":
      return "var(--color-severity-minor)";
    default:
      return "var(--color-severity-nit)";
  }
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "—";
}
