import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Per-role persistent Chromium profile dir. The auth-setup command launches
 * Playwright with a persistent context rooted here and logs in; the cookie
 * lands in this directory. The dispatcher then passes --user-data-dir to
 * @playwright/mcp, which reuses the profile and inherits the session.
 *
 * Personas share profiles by `category`:
 *   - end-user / internal-user / accessibility → "dispatcher"
 *   - admin                                    → "admin"
 *   - mobile                                   → "technician"
 */
export type AuthRole = "dispatcher" | "admin" | "technician";

export function authStateRoot(): string {
  return join(homedir(), ".tankloop-eval");
}

export function userDataDir(role: AuthRole): string {
  return join(authStateRoot(), `user-data-${role}`);
}

export async function ensureUserDataDir(role: AuthRole): Promise<string> {
  const dir = userDataDir(role);
  await mkdir(dir, { recursive: true });
  return dir;
}

export function roleForPersonaCategory(
  category: "end-user" | "internal-user" | "admin" | "mobile" | "accessibility" | "custom",
): AuthRole {
  switch (category) {
    case "admin":
      return "admin";
    case "mobile":
      return "technician";
    case "end-user":
    case "internal-user":
    case "accessibility":
    case "custom":
      return "dispatcher";
  }
}
