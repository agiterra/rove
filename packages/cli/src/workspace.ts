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
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
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

/**
 * Synthesize a transient workspace for a daemon that has no repo checkout
 * (e.g. installed via /setup). Fetches the flow's canonical YAML from the
 * caller-supplied source, writes it under ~/.rove/run/<id>/flows/, and
 * returns a ResolvedWorkspace that the rest of the run pipeline consumes
 * unchanged.
 *
 * The caller supplies the fetch function so this module stays free of any
 * Supabase / network dependency.
 */
export async function resolveSyntheticWorkspace(opts: {
  flowId: string;
  projectId: string;
  fetchFlowYaml: (flowId: string) => Promise<{ yamlBody: string } | null>;
}): Promise<ResolvedWorkspace> {
  const fetched = await opts.fetchFlowYaml(opts.flowId);
  if (!fetched) {
    throw new Error(
      `Flow ${opts.flowId} not found in project ${opts.projectId} (or has no yaml_body — re-run \`rove sync\` to populate).`,
    );
  }
  const rootDir = join(homedir(), ".rove", "run", randomUUID());
  const flowsDir = join(rootDir, "flows");
  const reportsDir = join(rootDir, "reports");
  await mkdir(flowsDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });
  await writeFile(join(flowsDir, `${opts.flowId}.flow.yaml`), fetched.yamlBody, "utf8");
  return { rootDir, flowsDir, reportsDir };
}
