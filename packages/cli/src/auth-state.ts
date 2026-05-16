import { mkdir, stat } from "node:fs/promises";
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
  return join(homedir(), ".rove");
}

export function userDataDir(role: AuthRole): string {
  return join(authStateRoot(), `user-data-${role}`);
}

export async function ensureUserDataDir(role: AuthRole): Promise<string> {
  const dir = userDataDir(role);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Returns true when the role's persistent context cookies are older than
 * `maxAgeMs`, or when the cookies file doesn't exist yet. Supabase sessions
 * expire after ~1h; we default the threshold below that with a 10-min
 * safety buffer.
 *
 * Chromium's persistent context stores cookies at
 * `<userDataDir>/Default/Cookies`. mtime reflects the last cookie write —
 * for our flow that's when the session was minted. We use mtime rather
 * than parsing the SQLite DB because the precise expires_at requires a
 * SQL read.
 */
export async function isAuthProfileStale(
  role: AuthRole,
  maxAgeMs: number = 50 * 60_000,
): Promise<boolean> {
  const cookiesPath = join(userDataDir(role), "Default", "Cookies");
  try {
    const s = await stat(cookiesPath);
    return Date.now() - s.mtimeMs > maxAgeMs;
  } catch {
    return true;
  }
}

export function roleForPersonaCategory(
  category:
    | "end-user"
    | "internal-user"
    | "admin"
    | "mobile"
    | "accessibility"
    | "agent"
    | "custom",
): AuthRole {
  switch (category) {
    case "admin":
      return "admin";
    case "mobile":
      return "technician";
    case "end-user":
    case "internal-user":
    case "accessibility":
    case "agent":
    case "custom":
      return "dispatcher";
  }
}
