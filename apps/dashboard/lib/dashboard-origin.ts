/**
 * Derives the dashboard's public origin from the incoming request's headers.
 *
 * Resolution order:
 *   1. x-forwarded-proto + x-forwarded-host  (Vercel production / preview)
 *   2. host header (Next dev server, direct HTTP)
 *
 * The returned string includes the scheme and host with no trailing slash,
 * e.g. "https://rove-agiterra.vercel.app" or "http://localhost:3030".
 * It is reused by any route that embeds a dashboard URL into output (the
 * install_command in /api/install/mint, the install script route, etc.).
 */
export function getDashboardOrigin(request: Request): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedHost) {
    const proto = forwardedProto ?? "https";
    return `${proto}://${forwardedHost}`;
  }

  const host = request.headers.get("host");
  if (host) {
    // Localhost requests arrive without x-forwarded-proto; default to http.
    const proto =
      forwardedProto ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${proto}://${host}`;
  }

  // Last-resort fallback — should never happen in normal Next.js usage.
  return "https://rove-agiterra.vercel.app";
}
