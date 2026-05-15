#!/usr/bin/env node
/**
 * Local bypass of /api/agent-session for dogfood walks.
 *
 * The dashboard's `rove dashboard-auth-setup` command calls
 * /api/agent-session, which is bearer-secret-gated to keep random callers
 * on the internet from minting walker sessions. For LOCAL dogfooding from
 * a machine that already holds the Supabase service-role key, the secret
 * is redundant: we can mint a session directly via
 * `supabase.auth.admin.generateLink` + `verifyOtp`, then write the
 * @supabase/ssr-compatible auth cookie into the Playwright persistent
 * context the dispatcher passes to `@playwright/mcp`.
 *
 * Run with the dashboard env loaded (vercel env pull). Required vars:
 *   - EVAL_SUPABASE_SERVICE_ROLE_KEY (or ROVE_SUPABASE_SERVICE_ROLE_KEY)
 *   - NEXT_PUBLIC_SUPABASE_URL       (or ROVE_SUPABASE_URL)
 *   - ROVE_AGENT_SESSION_USER_ID     (rove-walker user; the same env var
 *     the dashboard's /api/agent-session uses)
 *
 * Optional:
 *   - DASHBOARD_ORIGIN   (default https://rove-agiterra.vercel.app)
 *   - PROFILE_ROLE       (default "dispatcher"; matches `roleForPersonaCategory`)
 *
 * The script writes cookies on the dashboard origin into
 * ~/.rove/user-data-<role>. Subsequent `rove run --auth-agent` (for an
 * agent persona) reuses that profile via `@playwright/mcp --user-data-dir`.
 */
import pkg from "playwright";
import { createClient } from "@supabase/supabase-js";
import { homedir } from "node:os";
import { join } from "node:path";

const { chromium } = pkg;

const supabaseUrl =
  process.env.ROVE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  process.env.ROVE_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.EVAL_SUPABASE_SERVICE_ROLE_KEY;
const walkerUserId = process.env.ROVE_AGENT_SESSION_USER_ID;
const dashboardOrigin =
  process.env.DASHBOARD_ORIGIN ?? "https://rove-agiterra.vercel.app";
const profileRole = process.env.PROFILE_ROLE ?? "dispatcher";

if (!supabaseUrl || !serviceRoleKey || !walkerUserId) {
  console.error(
    "missing env: NEXT_PUBLIC_SUPABASE_URL/ROVE_SUPABASE_URL, " +
      "(ROVE|EVAL)_SUPABASE_SERVICE_ROLE_KEY, ROVE_AGENT_SESSION_USER_ID",
  );
  process.exit(2);
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const cookieBaseName = `sb-${projectRef}-auth-token`;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: userData, error: userErr } =
  await admin.auth.admin.getUserById(walkerUserId);
if (userErr || !userData.user?.email) {
  console.error(`✗ user lookup failed: ${userErr?.message ?? "no email"}`);
  process.exit(3);
}
console.error(`→ Walker: ${userData.user.email} (${userData.user.id.slice(0, 8)}…)`);

const { data: linkData, error: linkErr } =
  await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
const tokenHash = linkData?.properties?.hashed_token;
if (linkErr || !tokenHash) {
  console.error(`✗ generateLink: ${linkErr?.message ?? "no token_hash"}`);
  process.exit(4);
}

const { data: verifyData, error: verifyErr } = await admin.auth.verifyOtp({
  type: "magiclink",
  token_hash: tokenHash,
});
if (verifyErr || !verifyData.session) {
  console.error(`✗ verifyOtp: ${verifyErr?.message ?? "no session"}`);
  process.exit(5);
}

const session = verifyData.session;
console.error(
  `✓ Session minted (expires_at=${session.expires_at}, ` +
    `${Math.round((session.expires_in ?? 0) / 60)}m)`,
);

// @supabase/ssr cookie value: `base64-<base64 of JSON-stringified session>`,
// split into `.0`, `.1`, … suffixes when the encoded payload exceeds the
// browser's per-cookie size budget. The dashboard relies on the same
// chunking on read, so we match it here.
const payload =
  "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
const CHUNK_SIZE = 3180;
const chunks = [];
for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
  chunks.push(payload.slice(i, i + CHUNK_SIZE));
}
console.error(
  `→ Cookie payload ${payload.length} chars / ${chunks.length} chunk(s)`,
);

const dataDir = join(homedir(), ".rove", `user-data-${profileRole}`);
console.error(`→ Persistent context: ${dataDir}`);
const context = await chromium.launchPersistentContext(dataDir, {
  headless: true,
});

const cookieDomain = new URL(dashboardOrigin).hostname;
const expires = session.expires_at ?? Math.floor(Date.now() / 1000) + 3600;
const cookies = chunks.map((value, i) => ({
  name: chunks.length === 1 ? cookieBaseName : `${cookieBaseName}.${i}`,
  value,
  domain: cookieDomain,
  path: "/",
  expires,
  httpOnly: false,
  secure: true,
  sameSite: "Lax",
}));
await context.addCookies(cookies);
console.error(`✓ ${cookies.length} cookie(s) installed for ${cookieDomain}`);

const page = await context.newPage();
const resp = await page.goto(`${dashboardOrigin}/runs?p=rove-dogfood`, {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
const status = resp?.status();
const url = page.url();
const title = await page.title();
console.error(`→ /runs status=${status} url=${url} title="${title}"`);

if (url.includes("/signin")) {
  console.error("✗ Landed on /signin — cookie install did not take.");
  await context.close();
  process.exit(6);
}

await context.close();
console.error(`✓ Profile saved at ${dataDir}`);
