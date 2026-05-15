import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "../../../lib/supabase/server";

/**
 * OAuth callback. Exchanges the `?code=` query param for a Supabase session
 * (cookie-bound by `@supabase/ssr`) and bounces to `next` or `/runs`.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/runs";

  if (!code) {
    return NextResponse.redirect(new URL("/signin?error=missing_code", url.origin));
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  // Refuse off-origin `next` values so the OAuth flow can't be turned
  // into an open redirect by a maliciously-crafted signin link.
  const target = new URL(next, url.origin);
  if (target.origin !== url.origin) {
    return NextResponse.redirect(new URL("/runs", url.origin));
  }
  return NextResponse.redirect(target);
}
