/**
 * Service-role-backed walker session mint. Mirrors the dashboard's
 * `/api/agent-session` endpoint behavior but skips the bearer-secret gate
 * — appropriate for any caller that already holds the Supabase service-
 * role key (local dogfooders, CI, automation).
 *
 * Used by:
 *   - `rove run` + `rove change-review` (auto-mint when the auth profile
 *     is stale and the caller's env permits)
 *   - `scripts/dogfood/mint-walker-session.mjs` (thin wrapper)
 *
 * The production install path (`rove dashboard-auth-setup`) goes through
 * the dashboard endpoint instead and is unaffected by this module.
 */

import { createClient } from "@supabase/supabase-js";
import { ensureUserDataDir, type AuthRole } from "./auth-state.js";

export interface MintWalkerSessionOptions {
  /** Profile role to write the cookies under. Defaults to "dispatcher". */
  role?: AuthRole;
  /** Override the dashboard origin the cookie domain is bound to. */
  dashboardOrigin?: string;
  /** Required — Supabase project URL. */
  supabaseUrl: string;
  /** Required — service-role key for admin auth API access. */
  serviceRoleKey: string;
  /** Required — auth.users.id of the rove-walker. */
  walkerUserId: string;
  /** Logging sink. Defaults to console.error so the CLI can stream progress. */
  log?: (msg: string) => void;
}

export interface MintWalkerSessionResult {
  /** Absolute path the persistent Chromium profile was written to. */
  profileDir: string;
  /** Session expires_at (Unix seconds). */
  expiresAt: number;
}

const CHUNK_SIZE = 3180;

/**
 * Mint a fresh walker session and write the @supabase/ssr-compatible
 * auth cookie into the role's persistent Chromium context. Returns the
 * profile path on success; throws on any step that fails.
 */
export async function mintLocalWalkerSession(
  opts: MintWalkerSessionOptions,
): Promise<MintWalkerSessionResult> {
  const role: AuthRole = opts.role ?? "dispatcher";
  const dashboardOrigin = opts.dashboardOrigin ?? "https://rove-agiterra.vercel.app";
  const log = opts.log ?? ((msg: string) => process.stderr.write(msg + "\n"));

  if (!opts.supabaseUrl || !opts.serviceRoleKey || !opts.walkerUserId) {
    throw new Error(
      "mintLocalWalkerSession requires supabaseUrl, serviceRoleKey, and walkerUserId",
    );
  }

  const projectRef = new URL(opts.supabaseUrl).hostname.split(".")[0];
  const cookieBaseName = `sb-${projectRef}-auth-token`;

  const admin = createClient(opts.supabaseUrl, opts.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(opts.walkerUserId);
  if (userErr || !userData.user?.email) {
    throw new Error(`user lookup failed: ${userErr?.message ?? "no email on user record"}`);
  }
  log(`→ Walker: ${userData.user.email} (${userData.user.id.slice(0, 8)}…)`);

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  const tokenHash = (linkData as { properties?: { hashed_token?: string } } | null)?.properties
    ?.hashed_token;
  if (linkErr || !tokenHash) {
    throw new Error(`generateLink failed: ${linkErr?.message ?? "no token_hash"}`);
  }

  const { data: verifyData, error: verifyErr } = await admin.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyErr || !verifyData.session) {
    throw new Error(`verifyOtp failed: ${verifyErr?.message ?? "no session"}`);
  }

  const session = verifyData.session;
  const expiresAt = session.expires_at ?? Math.floor(Date.now() / 1000) + 3600;
  log(
    `✓ Session minted (expires_at=${expiresAt}, ` +
      `${Math.round((session.expires_in ?? 0) / 60)}m)`,
  );

  // @supabase/ssr format: base64-<base64(session JSON)>, split into .0/.1
  // suffixes when the encoded payload exceeds the per-cookie size budget.
  const payload = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  const chunks: string[] = [];
  for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
    chunks.push(payload.slice(i, i + CHUNK_SIZE));
  }
  log(`→ Cookie payload ${payload.length} chars / ${chunks.length} chunk(s)`);

  const profileDir = await ensureUserDataDir(role);
  log(`→ Persistent context: ${profileDir}`);

  // Lazy-import playwright so projects that don't dogfood don't pay the
  // resolution cost.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playwright = (await import("playwright")) as any;
  const { chromium } = playwright;
  const context = await chromium.launchPersistentContext(profileDir, { headless: true });

  const cookieDomain = new URL(dashboardOrigin).hostname;
  const cookies = chunks.map((value, i) => ({
    name: chunks.length === 1 ? cookieBaseName : `${cookieBaseName}.${i}`,
    value,
    domain: cookieDomain,
    path: "/",
    expires: expiresAt,
    httpOnly: false,
    secure: true,
    sameSite: "Lax" as const,
  }));
  await context.addCookies(cookies);
  log(`✓ ${cookies.length} cookie(s) installed for ${cookieDomain}`);

  const page = await context.newPage();
  const resp = await page.goto(`${dashboardOrigin}/runs?p=rove-dogfood`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  const status = resp?.status();
  const finalUrl = page.url();
  const title = await page.title();
  log(`→ /runs status=${status} url=${finalUrl} title="${title}"`);
  await context.close();

  if (finalUrl.includes("/signin")) {
    throw new Error("cookie install did not take — landed on /signin");
  }

  log(`✓ Profile saved at ${profileDir}`);
  return { profileDir, expiresAt };
}

/**
 * Convenience wrapper: returns mint options from `process.env`, returning
 * null when the env doesn't have the required vars (so callers can fall
 * back to the dashboard endpoint flow).
 */
export function mintOptionsFromEnv(): Omit<MintWalkerSessionOptions, "role"> | null {
  const supabaseUrl =
    process.env.ROVE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const serviceRoleKey =
    process.env.ROVE_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.EVAL_SUPABASE_SERVICE_ROLE_KEY ??
    null;
  const walkerUserId = process.env.ROVE_AGENT_SESSION_USER_ID ?? null;
  if (!supabaseUrl || !serviceRoleKey || !walkerUserId) return null;
  return {
    supabaseUrl,
    serviceRoleKey,
    walkerUserId,
    dashboardOrigin: process.env.DASHBOARD_ORIGIN,
  };
}

/**
 * Check whether the role's profile is stale and try to auto-re-mint when
 * the env permits. Used as a pre-flight by `rove run` and
 * `rove change-review` so a 1-hour-old walker session doesn't silently
 * bounce the walk to /signin.
 *
 * Returns:
 *   - "fresh"        — profile is recent, nothing to do
 *   - "minted"       — was stale, auto-re-minted successfully
 *   - "stale-no-env" — was stale, env doesn't permit auto-mint
 *
 * Never throws to the caller; mint failures fall through as
 * "stale-no-env" with a logged warning so the walk attempts authed and
 * the agent files a finding about the auth wall (which is correct
 * negative-space behavior).
 */
export async function ensureFreshAuthProfile(
  role: AuthRole,
  isStaleFn: (role: AuthRole) => Promise<boolean>,
): Promise<"fresh" | "minted" | "stale-no-env"> {
  if (!(await isStaleFn(role))) return "fresh";
  const opts = mintOptionsFromEnv();
  if (!opts) return "stale-no-env";
  try {
    process.stderr.write("→ Walker auth profile is stale; auto-re-minting…\n");
    await mintLocalWalkerSession({ ...opts, role });
    return "minted";
  } catch (err) {
    process.stderr.write(
      `⚠ Auto-mint failed (${err instanceof Error ? err.message : String(err)}); ` +
        "walk will attempt authed and may bounce to /signin.\n",
    );
    return "stale-no-env";
  }
}
