/**
 * Single source of truth for "which project is this request scoped to?"
 *
 * Resolution order (highest precedence first):
 *   1. ?p=<slug> URL search param
 *   2. p_id cookie (set by the project switcher when it ships)
 *   3. ROVE_DEFAULT_PROJECT_ID env var (set per Vercel deployment)
 *   4. literal fallback 'tankloop' so the existing data is visible
 *
 * Server-only helper — uses next/headers for the cookie read.
 */
import "server-only";
import { cookies } from "next/headers";
import { env } from "./env";

const SLUG_RE = /^[a-z][a-z0-9-]*$/;
const COOKIE_NAME = "rove_project";

export async function resolveProjectId(searchParams?: { p?: string }): Promise<string> {
  if (searchParams?.p && SLUG_RE.test(searchParams.p)) {
    return searchParams.p;
  }
  const c = await cookies();
  const cookieVal = c.get(COOKIE_NAME)?.value;
  if (cookieVal && SLUG_RE.test(cookieVal)) {
    return cookieVal;
  }
  return env.defaultProjectId();
}
