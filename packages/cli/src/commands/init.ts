/**
 * `rove init` — bootstrap Rove inside a consuming project.
 *
 * Writes:
 *  - rove.config.ts at the current working directory (or aborts if one exists)
 *  - <flowsDir>/.gitkeep so the directory is committable empty
 *  - .env.rove.example so the project can see which secrets it needs
 *
 * Does NOT touch git, doesn't run pnpm install, doesn't talk to the
 * dashboard. Those are separate, explicit steps the user takes next.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { INIT_CONFIG_TEMPLATE, INIT_ENV_TEMPLATE } from "../config.js";

export interface InitOptions {
  cwd?: string;
  workspaceId?: string;
  flowsDir?: string;
  defaultTargetUrl?: string;
  githubRepo?: string;
  force?: boolean;
}

export async function runInitCommand(opts: InitOptions = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const flowsDir = opts.flowsDir ?? "rove/flows";
  const configPath = join(cwd, "rove.config.ts");
  const envExamplePath = join(cwd, ".env.rove.example");
  const flowsAbsDir = join(cwd, flowsDir);

  if (existsSync(configPath) && !opts.force) {
    console.error(`✗ ${configPath} already exists. Pass --force to overwrite.`);
    return 1;
  }

  await writeFile(
    configPath,
    INIT_CONFIG_TEMPLATE({
      workspaceId: opts.workspaceId,
      flowsDir,
      defaultTargetUrl: opts.defaultTargetUrl,
      githubRepo: opts.githubRepo,
    }),
    "utf8",
  );

  await mkdir(flowsAbsDir, { recursive: true });
  await writeFile(join(flowsAbsDir, ".gitkeep"), "", "utf8");

  if (!existsSync(envExamplePath)) {
    await writeFile(envExamplePath, INIT_ENV_TEMPLATE, "utf8");
  }

  console.log("✓ Rove initialized.");
  console.log("");
  console.log("Wrote:");
  console.log(`  rove.config.ts         (your project's Rove config)`);
  console.log(`  ${flowsDir}/.gitkeep    (your flow YAMLs go here)`);
  console.log(`  .env.rove.example      (secrets you'll need)`);
  console.log("");
  console.log("Next:");
  console.log("  1. Sign into the Rove dashboard and create or join a workspace.");
  console.log("  2. Copy .env.rove.example → .env.rove and fill in the values.");
  console.log(
    "  3. Author your first flow:  rove flow new   (or drop a *.flow.yaml in the flows dir).",
  );
  console.log(
    "  4. Start the daemon on a machine that has your local Claude session:  rove daemon",
  );
  console.log("");
  return 0;
}
