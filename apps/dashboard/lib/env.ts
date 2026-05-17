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
   * Server-only — HS256 secret Supabase signs its own auth JWTs with.
   * We co-opt it to sign per-worker tokens so PostgREST validates them
   * via the standard auth pipeline. Never expose.
   */
  supabaseJwtSecret: () => required("SUPABASE_JWT_SECRET"),
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
  /**
   * HMAC secret configured on the GitHub App's Webhook settings page
   * (github.com/settings/apps/<app>/webhook). The backlog adapter's
   * webhook receiver verifies every `projects_v2_item` payload against
   * this before trusting its content. Optional at boot — the route
   * returns 503 with a clear "webhook not configured" message when
   * absent rather than crashing.
   */
  githubAppWebhookSecret: () =>
    readEither("ROVE_GITHUB_APP_WEBHOOK_SECRET", "EVAL_GITHUB_APP_WEBHOOK_SECRET"),
  /**
   * Bearer secret the CLI's sink uses to call the auto-push endpoint
   * post-finding-write. Set ROVE_AUTO_PUSH_SECRET on both Vercel
   * (Production) and the daemon's local env; the daemon reads the
   * same value and sends it in the Authorization header.
   */
  autoPushSecret: () => readEither("ROVE_AUTO_PUSH_SECRET", "EVAL_AUTO_PUSH_SECRET"),
  /**
   * Default Project v2 URL prefilled in the managed-board install form's
   * template field. Optional — when unset the field starts blank.
   * Override per-install in the form regardless. Set this to your team's
   * canonical Rove template board to skip the copy-paste step every
   * managed-board install.
   */
  defaultBacklogTemplateUrl: () =>
    readEither("ROVE_BACKLOG_DEFAULT_TEMPLATE_URL", "EVAL_BACKLOG_DEFAULT_TEMPLATE_URL"),

  // ── Project scoping (Phase C-lite) ───────────────────────────────────────
  /**
   * Which project this deployment serves. Until proper multi-tenant
   * routing lands, the dashboard is single-project per deployment; for
   * Vercel previews we read this from an env var.
   */
  defaultProjectId: () =>
    readEither("ROVE_DEFAULT_PROJECT_ID", "EVAL_DEFAULT_PROJECT_ID") ?? "tankloop",

  // ── Agent-session bootstrap for dogfooding protected dashboard routes ────
  /**
   * Shared bearer secret used only by trusted local workers to mint a
   * browser-auth session for the configured walker user. This does not bypass
   * dashboard auth; it creates a real Supabase Auth session for that user.
   */
  agentSessionSecret: () => optional("ROVE_AGENT_SESSION_SECRET"),
  /**
   * Supabase Auth user id for the dedicated dashboard walker. The user must
   * also be bound to an active `team_members.supabase_user_id` row.
   */
  agentSessionUserId: () => optional("ROVE_AGENT_SESSION_USER_ID"),
};
