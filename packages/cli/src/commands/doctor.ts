import { access, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { discoverFlows } from "@agiterra/rove-core";
import type { PreflightCheck } from "@agiterra/rove-core";
import { ClaudeCodeCliDispatcher } from "../dispatchers/claude-code-cli.js";
import { userDataDir, type AuthRole } from "../auth-state.js";
import { readEvalSupabaseEnv } from "../supabase/env.js";
import type { ResolvedWorkspace } from "../workspace.js";

const DASHBOARD_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;
const AUTH_ROLES: AuthRole[] = ["dispatcher", "admin", "technician"];

export async function runDoctorCommand(ws: ResolvedWorkspace): Promise<number> {
  const checks: PreflightCheck[] = [];

  // Dispatcher preflight (claude CLI + playwright MCP)
  const dispatcher = new ClaudeCodeCliDispatcher();
  const dispatcherPre = await dispatcher.preflight();
  checks.push(...dispatcherPre.checks);

  // Flows discoverable
  const flows = await discoverFlows(ws.flowsDir);
  checks.push({
    name: "flow files discoverable",
    status: flows.length > 0 ? "ok" : "fail",
    detail: `${flows.length} flow(s) under ${ws.flowsDir}`,
  });

  // Rove dashboard env, when running doctor from this repo.
  checks.push(await checkDashboardEnv(ws.rootDir));

  // Dashboard reachable (warn, not fail — CLI-only runs may target another app).
  checks.push(await checkDevServer("http://localhost:3030"));

  // Per-role auth profiles (warn — only the role being walked needs one)
  for (const role of AUTH_ROLES) {
    checks.push(checkAuthProfile(role));
  }

  // Eval Supabase store (warn — only needed when --sink supabase is used)
  checks.push(await checkEvalSupabase());

  // Render
  let failures = 0;
  for (const c of checks) {
    const icon = c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "✗";
    console.log(`${icon} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    if (c.remedy) console.log(`    fix: ${c.remedy}`);
    if (c.status === "fail") failures++;
  }
  return failures > 0 ? 1 : 0;
}

async function checkDashboardEnv(rootDir: string): Promise<PreflightCheck> {
  const dashboardDir = join(rootDir, "apps/dashboard");
  if (!existsSync(dashboardDir)) {
    return {
      name: "dashboard env",
      status: "warn",
      detail: "apps/dashboard not present — skipping Rove dashboard env check",
    };
  }

  const envPath = join(dashboardDir, ".env.local");
  try {
    await access(envPath);
  } catch {
    return {
      name: "apps/dashboard/.env.local present",
      status: "fail",
      detail: `missing ${envPath}`,
      remedy: "vercel env pull apps/dashboard/.env.local, or create it with the Supabase dashboard keys",
    };
  }
  const content = await readFile(envPath, "utf8");
  const missing = DASHBOARD_ENV_KEYS.filter(
    (key) => !new RegExp(`^\\s*${key}\\s*=`, "m").test(content),
  );
  if (missing.length > 0) {
    return {
      name: "apps/dashboard/.env.local has required keys",
      status: "fail",
      detail: `missing: ${missing.join(", ")}`,
      remedy: "pull dashboard env from Vercel or fill the missing Supabase keys",
    };
  }
  return { name: "apps/dashboard/.env.local has required keys", status: "ok" };
}

function checkAuthProfile(role: AuthRole): PreflightCheck {
  const dir = userDataDir(role);
  if (existsSync(dir)) {
    return { name: `auth profile (${role})`, status: "ok", detail: dir };
  }
  return {
    name: `auth profile (${role})`,
    status: "warn",
    detail: `missing — only needed if you walk a ${role}-category persona`,
    remedy: `rove auth-setup --role ${role}`,
  };
}

async function checkEvalSupabase(): Promise<PreflightCheck> {
  const env = readEvalSupabaseEnv();
  if (!env) {
    return {
      name: "eval Supabase store reachable",
      status: "warn",
      detail: "EVAL_SUPABASE_URL / SUPABASE_URL not set — supabase sink will be skipped",
      remedy:
        "export EVAL_SUPABASE_URL=https://tceosllezmydpouvfuzf.supabase.co && " +
        "export EVAL_SUPABASE_SERVICE_ROLE_KEY=… (see infra/supabase/eval/README.md)",
    };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    const res = await fetch(`${env.url}/auth/v1/health`, {
      signal: controller.signal,
      headers: { apikey: env.serviceRoleKey },
    });
    clearTimeout(timer);
    if (res.ok) {
      return { name: "eval Supabase store reachable", status: "ok", detail: env.url };
    }
    return {
      name: "eval Supabase store reachable",
      status: "fail",
      detail: `HTTP ${res.status} from ${env.url}`,
      remedy: "verify EVAL_SUPABASE_URL and that the project is awake",
    };
  } catch (err) {
    return {
      name: "eval Supabase store reachable",
      status: "fail",
      detail: `${env.url} unreachable: ${err instanceof Error ? err.message : String(err)}`,
      remedy: "check network / EVAL_SUPABASE_URL",
    };
  }
}

async function checkDevServer(url: string): Promise<PreflightCheck> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return {
      name: "dashboard dev server reachable",
      status: "ok",
      detail: `HTTP ${res.status} at ${url}`,
    };
  } catch {
    return {
      name: "dashboard dev server reachable",
      status: "warn",
      detail: `${url} not responding — start with: pnpm dashboard`,
    };
  }
}
