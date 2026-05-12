import { chromium } from "playwright";
import { ensureUserDataDir, type AuthRole } from "../auth-state.js";

export interface AuthSetupOptions {
  role: AuthRole;
  email: string;
  password: string;
  baseUrl: string;
  /** Render the browser headed for debugging. Default false. */
  headed: boolean;
  /** Override the post-auth URL we wait for. Default /admin. */
  expectUrlContains: string;
  timeoutMs: number;
}

export async function runAuthSetupCommand(opts: AuthSetupOptions): Promise<number> {
  const dataDir = await ensureUserDataDir(opts.role);

  // Use launchPersistentContext so the resulting cookies + storage land in
  // dataDir on disk. @playwright/mcp can then reuse this profile via
  // --user-data-dir and the agent inherits the authenticated session.
  const context = await chromium.launchPersistentContext(dataDir, {
    headless: !opts.headed,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());

    console.error(`→ Opening ${opts.baseUrl}/auth/login`);
    await page.goto(`${opts.baseUrl}/auth/login`, { timeout: opts.timeoutMs });

    // Login form uses placeholder-as-label; the accessibility tree exposes
    // textbox names "Email" / "Password" via placeholder, but there are no
    // <label> elements — getByLabel won't match.
    await page.getByRole("textbox", { name: /email/i }).fill(opts.email);
    await page.locator('input[type="password"]').first().fill(opts.password);

    console.error(`→ Submitting credentials for ${opts.email}`);
    await Promise.all([
      page.waitForURL((url) => url.toString().includes(opts.expectUrlContains), {
        timeout: opts.timeoutMs,
      }),
      page.getByRole("button", { name: /sign in/i }).click(),
    ]);

    console.error(`→ Reached ${page.url()} — session persisted in profile`);
    console.log(`✓ Saved auth profile for role=${opts.role} → ${dataDir}`);
    return 0;
  } catch (err) {
    console.error(`✗ auth-setup failed: ${err instanceof Error ? err.message : err}`);
    return 1;
  } finally {
    await context.close();
  }
}
