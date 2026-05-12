/**
 * rove.config.ts — the source of truth for a project's Rove install.
 *
 * Lives at the consuming project's repo root. Read by the CLI + daemon
 * to know where flows live, what URL to walk, which sinks to use, and
 * which workspace the project belongs to in the Rove dashboard.
 *
 * Schema is intentionally tiny in alpha — everything else flows from
 * .env.rove (Supabase creds) or sane defaults.
 */
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

export const SINK_IDS = ["markdown", "supabase", "github-issues"] as const;
export type SinkId = (typeof SINK_IDS)[number];

export const roveConfigSchema = z.object({
  /**
   * Workspace ID in the Rove dashboard. Assigned at `rove init`. In alpha
   * everyone shares one workspace; this field is plumbed for the multi-
   * tenant migration in Phase C.
   */
  workspaceId: z.string().min(1).optional(),
  /** Repo-relative directory containing *.flow.yaml + *.personas.yaml files. */
  flowsDir: z.string().min(1).default("rove/flows"),
  /** Default origin for walks. Override with `rove run --target-url ...`. */
  defaultTargetUrl: z.string().url().optional(),
  /** Which sinks the CLI routes findings through. */
  sinks: z.array(z.enum(SINK_IDS)).default(["markdown", "supabase"]),
  /** GitHub integration (optional — only needed for the github-issues sink + agent walks on PRs). */
  github: z
    .object({
      repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/, "expected 'owner/repo'"),
      issueLabel: z.string().default("rove-finding"),
    })
    .optional(),
});
export type RoveConfig = z.infer<typeof roveConfigSchema>;

const CONFIG_FILENAMES = ["rove.config.ts", "rove.config.js", "rove.config.mjs"];

export interface LoadedConfig {
  config: RoveConfig;
  configPath: string;
  projectRoot: string;
}

/**
 * Walks up from `from` looking for a rove.config.{ts,js,mjs}. Loads it via
 * dynamic import. Resolves relative paths in the config against the
 * project root (where the config file lives).
 */
export async function loadRoveConfig(from: string = process.cwd()): Promise<LoadedConfig> {
  const configPath = findConfigPath(from);
  if (!configPath) {
    throw new Error(
      `No rove.config.{ts,js,mjs} found from ${from}. Run \`rove init\` in your project root to create one.`,
    );
  }
  const projectRoot = dirname(configPath);
  const mod = (await import(pathToFileURL(configPath).href)) as {
    default?: unknown;
    config?: unknown;
  };
  const raw = mod.default ?? mod.config;
  if (!raw) {
    throw new Error(
      `${configPath} did not export a default config object. Expected \`export default { … }\`.`,
    );
  }
  const config = roveConfigSchema.parse(raw);
  // Normalize flowsDir to absolute.
  if (!isAbsolute(config.flowsDir)) {
    config.flowsDir = resolve(projectRoot, config.flowsDir);
  }
  return { config, configPath, projectRoot };
}

function findConfigPath(from: string): string | null {
  let dir = resolve(from);
  while (true) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Used by `rove init` to write the initial config + supporting files. */
export const INIT_CONFIG_TEMPLATE = (params: {
  workspaceId?: string;
  flowsDir: string;
  defaultTargetUrl?: string;
  githubRepo?: string;
}) => `// rove.config.ts — Rove's per-project config. Authored by \`rove init\`.
// Docs: https://github.com/agiterra/rove#rove-config

import type { RoveConfig } from "@rove/cli";

export default {
${params.workspaceId ? `  workspaceId: "${params.workspaceId}",\n` : ""}  flowsDir: "${params.flowsDir}",
${params.defaultTargetUrl ? `  defaultTargetUrl: "${params.defaultTargetUrl}",\n` : ""}  sinks: ["markdown", "supabase"],
${
  params.githubRepo
    ? `  github: {\n    repo: "${params.githubRepo}",\n    issueLabel: "rove-finding",\n  },\n`
    : ""
}} satisfies RoveConfig;
`;

export const INIT_ENV_TEMPLATE = `# Rove environment vars. Get from your Rove dashboard → Settings.
ROVE_SUPABASE_URL=
ROVE_SUPABASE_SERVICE_ROLE_KEY=
# Daemon identity. Set this once per machine.
ROVE_DAEMON_GITHUB_HANDLE=
`;
