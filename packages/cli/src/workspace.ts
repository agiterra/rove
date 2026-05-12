/**
 * Resolved paths the CLI needs for a run. Read from the consuming
 * project's `rove.config.ts`.
 *
 * The marker file is `rove.config.{ts,js,mjs}`. The CLI walks up from
 * cwd to find it; the directory containing it is the project root.
 * `flowsDir` comes from the config. `reportsDir` defaults to
 * `<root>/.rove/reports` (created on demand).
 */
import { existsSync, mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { loadRoveConfig } from "./config.js";

export interface ResolvedWorkspace {
  /** Project root — the dir containing rove.config.ts. */
  rootDir: string;
  /** Directory holding *.flow.yaml + *.personas.yaml. From config.flowsDir. */
  flowsDir: string;
  /** Where Markdown walk reports go. */
  reportsDir: string;
}

const REPORTS_REL_DEFAULT = ".rove/reports";

export async function resolveWorkspace(
  startDir: string = process.cwd(),
): Promise<ResolvedWorkspace> {
  const { config, projectRoot } = await loadRoveConfig(startDir);

  const flowsDir = isAbsolute(config.flowsDir)
    ? config.flowsDir
    : resolve(projectRoot, config.flowsDir);

  const reportsDir = resolve(projectRoot, REPORTS_REL_DEFAULT);
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true });
  }

  return {
    rootDir: projectRoot,
    flowsDir,
    reportsDir,
  };
}
