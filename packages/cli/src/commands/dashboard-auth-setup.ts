import { chromium } from "playwright";
import { ensureUserDataDir, type AuthRole } from "../auth-state.js";

export interface DashboardAuthSetupOptions {
  role: AuthRole;
  baseUrl: string;
  projectId?: string;
  secret?: string;
  headed: boolean;
  timeoutMs: number;
}

interface MintResponse {
  session?: {
    access_token?: string;
    refresh_token?: string;
  };
  user?: {
    email?: string;
    github_handle?: string | null;
    display_name?: string | null;
  };
  error?: string;
}

export async function runDashboardAuthSetupCommand(
  opts: DashboardAuthSetupOptions,
): Promise<number> {
  const secret = opts.secret ?? process.env.ROVE_AGENT_SESSION_SECRET;
  if (!secret) {
    console.error("✗ Missing ROVE_AGENT_SESSION_SECRET or --secret");
    return 1;
  }

  const baseUrl = trimTrailingSlash(opts.baseUrl);
  const dataDir = await ensureUserDataDir(opts.role);

  try {
    const minted = await mintSession(baseUrl, secret, opts.timeoutMs);
    const accessToken = minted.session?.access_token;
    const refreshToken = minted.session?.refresh_token;
    if (!accessToken || !refreshToken) {
      console.error(
        `✗ agent session response did not include tokens: ${minted.error ?? "unknown error"}`,
      );
      return 1;
    }

    const context = await chromium.launchPersistentContext(dataDir, {
      headless: !opts.headed,
    });
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      page.setDefaultTimeout(opts.timeoutMs);
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });

      const consume = await page.evaluate(
        async ({ accessToken, refreshToken, secret }) => {
          const response = await fetch("/api/agent-session/consume", {
            method: "POST",
            credentials: "include",
            headers: {
              authorization: `Bearer ${secret}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
          });
          const body = await response.json().catch(() => ({}));
          return { ok: response.ok, status: response.status, body };
        },
        { accessToken, refreshToken, secret },
      );

      if (!consume.ok) {
        console.error(
          `✗ browser cookie bootstrap failed (${consume.status}): ${JSON.stringify(consume.body)}`,
        );
        return 1;
      }

      const target = new URL("/runs", baseUrl);
      if (opts.projectId) target.searchParams.set("p", opts.projectId);
      await page.goto(target.toString(), {
        waitUntil: "domcontentloaded",
        timeout: opts.timeoutMs,
      });
      await page.waitForURL((url) => !url.pathname.startsWith("/signin"), {
        timeout: opts.timeoutMs,
      });

      const label = minted.user?.github_handle ?? minted.user?.email ?? "walker user";
      console.log(`✓ Saved dashboard auth profile for ${label} → ${dataDir}`);
      return 0;
    } finally {
      await context.close();
    }
  } catch (err) {
    console.error(`✗ dashboard-auth-setup failed: ${err instanceof Error ? err.message : err}`);
    return 1;
  }
}

async function mintSession(
  baseUrl: string,
  secret: string,
  timeoutMs: number,
): Promise<MintResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/agent-session`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
    const body = (await response.json().catch(() => ({}))) as MintResponse;
    if (!response.ok) {
      throw new Error(`mint failed (${response.status}): ${body.error ?? "unknown error"}`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
