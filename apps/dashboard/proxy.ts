import type { NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on every route except Next internals + static assets + the
    // self-contained /preview/* surfaces (visual review pages that
    // touch no data and must work even when the Supabase env vars are
    // absent — e.g., on a fresh Preview deployment).
    "/((?!_next/static|_next/image|favicon.ico|preview/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
