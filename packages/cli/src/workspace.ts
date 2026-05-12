import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Resolved paths the CLI needs for a run. Computed once at startup so the
 * commands stay free of path-juggling.
 */
export interface ResolvedWorkspace {
  /** Repo root (directory containing pnpm-workspace.yaml). */
  rootDir: string;
  /** Directory containing *.flow.yaml files. */
  flowsDir: string;
  /** Directory where Markdown reports are written. */
  reportsDir: string;
}

const FLOWS_REL = "e2e/ui-overhaul/agentic/flows";
const REPORTS_REL = "apps/web/specs";
const WORKSPACE_MARKER = "pnpm-workspace.yaml";

export function resolveWorkspace(startDir = process.cwd()): ResolvedWorkspace {
  const rootDir = findWorkspaceRoot(startDir);
  return {
    rootDir,
    flowsDir: join(rootDir, FLOWS_REL),
    reportsDir: join(rootDir, REPORTS_REL),
  };
}

function findWorkspaceRoot(startDir: string): string {
  let current = resolve(startDir);
  while (true) {
    if (existsSync(join(current, WORKSPACE_MARKER))) return current;
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        `Could not find ${WORKSPACE_MARKER} in any parent of ${startDir}. ` +
          `Run rove from inside a project that has a rove.config.ts.`,
      );
    }
    current = parent;
  }
}
