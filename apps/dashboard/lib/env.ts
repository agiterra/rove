/**
 * Dashboard env — narrows ambient env vars to typed accessors and fails fast
 * with a useful message when something's missing.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  /** Public — safe in the browser. */
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  /** Public — anon or sb_publishable_*. Safe in the browser; RLS gates access. */
  supabasePublishableKey: () => required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  /** Server-only — bypasses RLS. Never expose. */
  supabaseServiceRoleKey: () => required("EVAL_SUPABASE_SERVICE_ROLE_KEY"),
  /**
   * Dev-only escape hatch. When "1", server pages query via service-role
   * even without a signed-in user. NEVER set in production.
   */
  devBypassAuth: () => optional("DEV_BYPASS_AUTH") === "1",
  isProduction: () => process.env.NODE_ENV === "production",

  // ── Phase 10: GitHub App (PR-based authoring) ──────────────────────────
  /** Numeric GitHub App id, e.g. "1234567". */
  githubAppId: () => required("EVAL_GITHUB_APP_ID"),
  /** Numeric installation id (the App installed on the consuming repo). */
  githubAppInstallationId: () => required("EVAL_GITHUB_APP_INSTALLATION_ID"),
  /**
   * PEM-formatted private key for the App. Newlines may be either real
   * newlines or escaped `\n` — Vercel UI tends to flatten them, so we
   * normalize on read.
   */
  githubAppPrivateKey: () => required("EVAL_GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n"),
  /** Owner/repo where authoring PRs are opened. Override per environment. */
  githubRepoOwner: () => optional("EVAL_GITHUB_REPO_OWNER") ?? "agiterra",
  githubRepoName: () => optional("EVAL_GITHUB_REPO_NAME") ?? "",
  githubBaseBranch: () => optional("EVAL_GITHUB_BASE_BRANCH") ?? "main",

  // ── Phase 10: AI generation (Vercel AI Gateway) ────────────────────────
  /** Optional override for the gateway model id. */
  aiModelId: () => optional("EVAL_AI_MODEL_ID") ?? "anthropic/claude-haiku-4.5",
};
