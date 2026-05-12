/**
 * Dashboard env — narrows ambient env vars to typed accessors and fails
 * fast with a useful message when something's missing.
 *
 * Naming: ROVE_* is canonical. EVAL_* fallbacks exist for the alpha
 * cutover from the old tankloop-eval deployment; remove once every
 * environment has flipped (target: end of Phase C).
 */

function readEither(rovKey: string, evalKey: string): string | undefined {
  return process.env[rovKey] || process.env[evalKey] || undefined;
}

function requireEither(rovKey: string, evalKey: string): string {
  const v = readEither(rovKey, evalKey);
  if (!v) throw new Error(`Missing required env var: ${rovKey} (or legacy ${evalKey})`);
  return v;
}

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
  supabaseServiceRoleKey: () =>
    requireEither("ROVE_SUPABASE_SERVICE_ROLE_KEY", "EVAL_SUPABASE_SERVICE_ROLE_KEY"),
  /**
   * Dev-only escape hatch. When "1", server pages query via service-role
   * even without a signed-in user. NEVER set in production.
   */
  devBypassAuth: () => optional("DEV_BYPASS_AUTH") === "1",
  isProduction: () => process.env.NODE_ENV === "production",

  // ── GitHub App (PR-based authoring + agentic walks) ──────────────────────
  githubAppId: () => requireEither("ROVE_GITHUB_APP_ID", "EVAL_GITHUB_APP_ID"),
  githubAppInstallationId: () =>
    requireEither("ROVE_GITHUB_APP_INSTALLATION_ID", "EVAL_GITHUB_APP_INSTALLATION_ID"),
  /**
   * PEM-formatted private key. Newlines may be real or escaped `\n` —
   * Vercel flattens them, so we normalize on read.
   */
  githubAppPrivateKey: () =>
    requireEither("ROVE_GITHUB_APP_PRIVATE_KEY", "EVAL_GITHUB_APP_PRIVATE_KEY").replace(
      /\\n/g,
      "\n",
    ),
  /**
   * Owner/repo where authoring PRs land for a given project. In alpha the
   * dashboard is single-tenant per deployment; multi-tenant Phase reads
   * the repo from the project's rove.config.ts instead.
   */
  githubRepoOwner: () =>
    readEither("ROVE_GITHUB_REPO_OWNER", "EVAL_GITHUB_REPO_OWNER") ?? "agiterra",
  githubRepoName: () => readEither("ROVE_GITHUB_REPO_NAME", "EVAL_GITHUB_REPO_NAME") ?? "",
  githubBaseBranch: () =>
    readEither("ROVE_GITHUB_BASE_BRANCH", "EVAL_GITHUB_BASE_BRANCH") ?? "main",

  // ── Project scoping (Phase C-lite) ───────────────────────────────────────
  /**
   * Which project this deployment serves. Until proper multi-tenant
   * routing lands, the dashboard is single-project per deployment; for
   * Vercel previews we read this from an env var.
   */
  defaultProjectId: () =>
    readEither("ROVE_DEFAULT_PROJECT_ID", "EVAL_DEFAULT_PROJECT_ID") ?? "tankloop",
};
