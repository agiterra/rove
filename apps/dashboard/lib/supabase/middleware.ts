import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROJECT_COOKIE = "rove_project";
const SLUG_RE = /^[a-z][a-z0-9-]*$/;
// Project-scoped path prefixes — pages whose data is namespaced by project_id.
// Any request to one of these without `?p=` is redirected to the same path
// with `?p=<resolved>` appended so the URL is always self-describing and
// the page can never silently render the wrong tenant.
const PROJECT_SCOPED_PREFIXES = ["/flows", "/findings", "/runs", "/personas"] as const;

/**
 * Session-refresh + project-context middleware. Runs on every request,
 * keeps the auth cookie fresh, gates protected routes, and ensures every
 * project-scoped URL carries its `?p=<slug>` query param explicitly so
 * the queued-job project_id and the rendered page project_id can never
 * disagree.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // Paths that authenticate themselves (or don't need auth at all). The
  // install bash script + exchange endpoint use a short-lived install_code
  // as their credential; the prune cron uses Authorization: Bearer
  // <CRON_SECRET>; the install script is just a public text artifact.
  const isPublic =
    path.startsWith("/signin") ||
    path.startsWith("/auth/callback") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico" ||
    path === "/install" ||
    path.startsWith("/install/") ||
    path === "/api/install/exchange" ||
    path === "/api/install/codes/prune";

  const devBypass = process.env.DEV_BYPASS_AUTH === "1" && process.env.NODE_ENV !== "production";

  if (!user && !isPublic && !devBypass) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Project-context normalization: only for project-scoped pages. Done AFTER
  // the auth gate so unauth'd users still land on /signin first.
  const isProjectScoped = PROJECT_SCOPED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix + "/"),
  );
  if (isProjectScoped) {
    const urlProject = sanitize(request.nextUrl.searchParams.get("p"));
    const cookieProject = sanitize(request.cookies.get(PROJECT_COOKIE)?.value);

    if (!urlProject) {
      // Redirect to same URL with `?p=` populated from cookie / env / fallback.
      const resolved = cookieProject ?? defaultProjectId();
      const url = request.nextUrl.clone();
      url.searchParams.set("p", resolved);
      const redirect = NextResponse.redirect(url);
      redirect.cookies.set(PROJECT_COOKIE, resolved, cookieOpts());
      return redirect;
    }

    if (urlProject !== cookieProject) {
      // URL won — persist for future requests without `?p=`.
      response.cookies.set(PROJECT_COOKIE, urlProject, cookieOpts());
    }
  }

  return response;
}

function sanitize(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return SLUG_RE.test(raw) ? raw : null;
}

function defaultProjectId(): string {
  const fromEnv = sanitize(process.env.ROVE_DEFAULT_PROJECT_ID);
  return fromEnv ?? "tankloop";
}

function cookieOpts() {
  return {
    httpOnly: false, // readable by client components (e.g. the project chip)
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // 90d — long enough that nobody loses their context between sessions.
    maxAge: 60 * 60 * 24 * 90,
  };
}
