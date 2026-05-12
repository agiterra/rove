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
import { basename, join } from "node:path";
import { INIT_CONFIG_TEMPLATE, INIT_ENV_TEMPLATE } from "../config.js";

export interface InitOptions {
  cwd?: string;
  projectId?: string;
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

  const projectId = opts.projectId ?? slugify(basename(cwd));
  if (!/^[a-z][a-z0-9-]*$/.test(projectId)) {
    console.error(
      `✗ derived projectId "${projectId}" is not a valid slug. Pass --project-id <slug> explicitly.`,
    );
    return 1;
  }

  if (existsSync(configPath) && !opts.force) {
    console.error(`✗ ${configPath} already exists. Pass --force to overwrite.`);
    return 1;
  }

  await writeFile(
    configPath,
    INIT_CONFIG_TEMPLATE({
      projectId,
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
  console.log(`  projectId: ${projectId}`);
  console.log("");
  console.log("Wrote:");
  console.log(`  rove.config.ts`);
  console.log(`  ${flowsDir}/.gitkeep`);
  console.log(`  .env.rove.example`);
  console.log("");
  console.log("Next steps:");
  console.log("");
  console.log("  1. Copy .env.rove.example → .env.rove and fill in:");
  console.log("       ROVE_SUPABASE_URL=https://tceosllezmydpouvfuzf.supabase.co");
  console.log("       ROVE_SUPABASE_SERVICE_ROLE_KEY=<from your team lead>");
  console.log("       ROVE_DAEMON_GITHUB_HANDLE=<your gh handle>");
  console.log("");
  console.log("  2. Open the dashboard, switch to your project:");
  console.log(`       https://rove-agiterra.vercel.app/?p=${projectId}`);
  console.log("     (the switcher pill in the header sticks via cookie afterwards)");
  console.log("");
  console.log("  3. Start your daemon (run this in a terminal that stays open):");
  console.log("       set -a && source .env.rove && set +a && rove daemon");
  console.log("");
  console.log("  4. Author your first flow — either:");
  console.log("       a) hit /flows/new in the dashboard, fill the wizard");
  console.log("       b) drop a *.flow.yaml into the flows dir, then  rove sync");
  console.log("");
  return 0;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
